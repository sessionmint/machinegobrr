import { NextRequest, NextResponse } from 'next/server';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import {
  addToQueueAdmin,
  logTransactionAdmin,
  isSignatureUsed,
  checkDuplicateCooldown,
  getAdminDb,
} from '@/lib/firebase-admin';
import {
  TREASURY_WALLET,
  STANDARD_PRICE,
  PRIORITY_PRICE,
  MINSTR_MINT,
  MINSTR_STANDARD_PRICE,
  MINSTR_PRIORITY_PRICE,
  DISPLAY_DURATION_STANDARD,
  DISPLAY_DURATION_PRIORITY,
  DUPLICATE_COOLDOWN_MS,
  PRIORITY_LEVELS,
  HELIUS_RPC_URL,
} from '@/lib/constants';
import { getClientIp, checkRateLimit } from '@/lib/server/rate-limit';
import { refreshStateSnapshot } from '@/lib/server/state-store';

type PaymentCurrency = 'SOL' | 'MINSTR';
type PaymentTier = 'standard' | 'priority';

interface AddToQueueRequest {
  tokenMint: string;
  walletAddress: string;
  amount?: number;
  signature: string;
  userId?: string | null;
  paymentMethod?: PaymentCurrency;
  paymentTier?: PaymentTier;
}

interface TokenBalanceLike {
  accountIndex: number;
  mint: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
  };
}

interface PaymentOption {
  amount: number;
  tier: PaymentTier;
}

type VerificationResult =
  | {
      verified: true;
      currency: PaymentCurrency;
      tier: PaymentTier;
      amount: number;
    }
  | {
      verified: false;
      amount: 0;
      error: string;
    };

const SOL_PAYMENT_OPTIONS: PaymentOption[] = [
  { amount: STANDARD_PRICE, tier: 'standard' },
  { amount: PRIORITY_PRICE, tier: 'priority' },
];

function matchSolPayment(received: number): PaymentOption | null {
  for (const option of SOL_PAYMENT_OPTIONS) {
    if (Math.abs(received - option.amount) < 0.001) {
      return option;
    }
  }
  return null;
}

function getTokenAmountRaw(
  balances: TokenBalanceLike[] | null | undefined,
  accountIndex: number,
  mint: string
): bigint {
  if (!balances) {
    return BigInt(0);
  }

  const entry = balances.find((balance) => balance.accountIndex === accountIndex && balance.mint === mint);
  if (!entry) {
    return BigInt(0);
  }

  try {
    return BigInt(entry.uiTokenAmount.amount);
  } catch {
    return BigInt(0);
  }
}

function getMintDecimals(
  preBalances: TokenBalanceLike[] | null | undefined,
  postBalances: TokenBalanceLike[] | null | undefined,
  accountIndex: number,
  mint: string
): number | null {
  const postEntry = postBalances?.find(
    (balance) => balance.accountIndex === accountIndex && balance.mint === mint
  );
  if (postEntry) {
    return postEntry.uiTokenAmount.decimals;
  }

  const preEntry = preBalances?.find(
    (balance) => balance.accountIndex === accountIndex && balance.mint === mint
  );
  if (preEntry) {
    return preEntry.uiTokenAmount.decimals;
  }

  return null;
}

async function verifyPayment(signature: string): Promise<VerificationResult> {
  try {
    const rpcUrl = HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com';
    const connection = new Connection(rpcUrl);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return {
        verified: false,
        amount: 0,
        error: 'Transaction not found - please wait and try again',
      };
    }

    if (tx.meta?.err) {
      return {
        verified: false,
        amount: 0,
        error: 'Transaction failed on-chain',
      };
    }

    const accountKeys = tx.transaction.message.getAccountKeys();
    const allAccounts: string[] = [];
    for (let index = 0; index < accountKeys.length; index += 1) {
      const key = accountKeys.get(index);
      if (key) {
        allAccounts.push(key.toBase58());
      }
    }

    const treasuryIndex = allAccounts.indexOf(TREASURY_WALLET);
    if (treasuryIndex !== -1 && tx.meta?.preBalances && tx.meta?.postBalances) {
      const treasuryReceivedSol =
        (tx.meta.postBalances[treasuryIndex] - tx.meta.preBalances[treasuryIndex]) / LAMPORTS_PER_SOL;
      const matchedSol = matchSolPayment(treasuryReceivedSol);
      if (matchedSol) {
        return {
          verified: true,
          currency: 'SOL',
          tier: matchedSol.tier,
          amount: matchedSol.amount,
        };
      }
    }

    const treasuryTokenAccount = getAssociatedTokenAddressSync(
      new PublicKey(MINSTR_MINT),
      new PublicKey(TREASURY_WALLET)
    );
    const treasuryTokenAccountIndex = allAccounts.indexOf(treasuryTokenAccount.toBase58());

    if (treasuryTokenAccountIndex !== -1 && tx.meta) {
      const preTokenBalances = (tx.meta.preTokenBalances || null) as TokenBalanceLike[] | null;
      const postTokenBalances = (tx.meta.postTokenBalances || null) as TokenBalanceLike[] | null;
      const decimals = getMintDecimals(
        preTokenBalances,
        postTokenBalances,
        treasuryTokenAccountIndex,
        MINSTR_MINT
      );

      if (decimals !== null) {
        const preRaw = getTokenAmountRaw(preTokenBalances, treasuryTokenAccountIndex, MINSTR_MINT);
        const postRaw = getTokenAmountRaw(postTokenBalances, treasuryTokenAccountIndex, MINSTR_MINT);
        const receivedRaw = postRaw - preRaw;
        const multiplier = BigInt(10) ** BigInt(decimals);
        const standardRaw = BigInt(MINSTR_STANDARD_PRICE) * multiplier;
        const priorityRaw = BigInt(MINSTR_PRIORITY_PRICE) * multiplier;

        if (receivedRaw === standardRaw) {
          return {
            verified: true,
            currency: 'MINSTR',
            tier: 'standard',
            amount: MINSTR_STANDARD_PRICE,
          };
        }

        if (receivedRaw === priorityRaw) {
          return {
            verified: true,
            currency: 'MINSTR',
            tier: 'priority',
            amount: MINSTR_PRIORITY_PRICE,
          };
        }
      }
    }

    return {
      verified: false,
      amount: 0,
      error:
        `Invalid payment amount. Accepted: ${STANDARD_PRICE} SOL, ${PRIORITY_PRICE} SOL, ` +
        `${MINSTR_STANDARD_PRICE} MINSTR, or ${MINSTR_PRIORITY_PRICE} MINSTR`,
    };
  } catch (error) {
    console.error('[Payment] Verification error:', error);
    return {
      verified: false,
      amount: 0,
      error: 'Failed to verify transaction',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: AddToQueueRequest = await request.json();
    const { tokenMint, walletAddress, signature, userId } = body;
    const clientIp = getClientIp(request);

    const ipLimit = checkRateLimit({
      namespace: 'queue_add_ip',
      key: clientIp,
      limit: 20,
      windowMs: 60_000,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many queue requests from this IP. Please retry shortly.',
          retryAfterMs: ipLimit.retryAfterMs,
        },
        { status: 429 }
      );
    }

    if (!tokenMint || !walletAddress || !signature) {
      return NextResponse.json(
        { error: 'Missing required fields: tokenMint, walletAddress, signature' },
        { status: 400 }
      );
    }

    try {
      new PublicKey(tokenMint);
    } catch {
      return NextResponse.json({ error: 'Invalid token mint address' }, { status: 400 });
    }

    try {
      new PublicKey(walletAddress);
    } catch {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const walletLimit = checkRateLimit({
      namespace: 'queue_add_wallet',
      key: walletAddress,
      limit: 8,
      windowMs: 60_000,
    });
    if (!walletLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many queue requests for this wallet. Please wait before retrying.',
          retryAfterMs: walletLimit.retryAfterMs,
        },
        { status: 429 }
      );
    }

    const signatureUsed = await isSignatureUsed(signature);
    if (signatureUsed) {
      return NextResponse.json({ error: 'Transaction signature already used' }, { status: 400 });
    }

    const verification = await verifyPayment(signature);
    if (!verification.verified) {
      await logTransactionAdmin(
        tokenMint,
        walletAddress,
        0,
        'standard',
        signature,
        userId || null,
        false
      );

      return NextResponse.json(
        { error: verification.error || 'Payment verification failed' },
        { status: 400 }
      );
    }

    const isPriority = verification.tier === 'priority';
    const priorityLevel = isPriority ? PRIORITY_LEVELS.PRIORITY : PRIORITY_LEVELS.STANDARD;
    const displayDuration = isPriority ? DISPLAY_DURATION_PRIORITY : DISPLAY_DURATION_STANDARD;
    const tierType: PaymentTier = verification.tier;

    const duplicateCheck = await checkDuplicateCooldown(tokenMint, DUPLICATE_COOLDOWN_MS);
    if (duplicateCheck.inCooldown && !isPriority) {
      const hoursRemaining = Math.floor(duplicateCheck.remainingMs / (60 * 60 * 1000));
      const minutesRemaining = Math.ceil((duplicateCheck.remainingMs % (60 * 60 * 1000)) / (60 * 1000));

      await logTransactionAdmin(
        tokenMint,
        walletAddress,
        verification.amount,
        tierType,
        signature,
        userId || null,
        false
      );

      return NextResponse.json(
        {
          error:
            `This token was recently queued. Please wait ${hoursRemaining}h ${minutesRemaining}m ` +
            `or use priority payment (${PRIORITY_PRICE} SOL or ${MINSTR_PRIORITY_PRICE} MINSTR).`,
          code: 'DUPLICATE_COOLDOWN',
          remainingMs: duplicateCheck.remainingMs,
          overrideOptions: {
            sol: PRIORITY_PRICE,
            minstr: MINSTR_PRIORITY_PRICE,
          },
        },
        { status: 400 }
      );
    }

    await logTransactionAdmin(
      tokenMint,
      walletAddress,
      verification.amount,
      tierType,
      signature,
      userId || null,
      true
    );

    const db = getAdminDb();
    const currentTokenDoc = await db.doc('settings/currentToken').get();
    const currentToken = currentTokenDoc.data();
    const queueEmpty = !currentToken?.queueItemId;

    const queueItemId = await addToQueueAdmin(
      tokenMint,
      walletAddress,
      isPriority,
      priorityLevel,
      displayDuration,
      signature,
      userId || null
    );

    if (queueEmpty) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
      const internalAuthToken = process.env.ADMIN_API_KEY
        ? `Bearer ${process.env.ADMIN_API_KEY}`
        : process.env.CRON_SECRET
          ? `Bearer ${process.env.CRON_SECRET}`
          : null;

      try {
        await fetch(`${baseUrl}/api/queue/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(internalAuthToken ? { Authorization: internalAuthToken } : {}),
          },
        });
      } catch (processError) {
        console.error('[Queue Add] Failed to trigger processing:', processError);
      }
    }

    await refreshStateSnapshot('queue_add', true);

    return NextResponse.json({
      success: true,
      message: isPriority ? 'Priority token queued' : 'Added to queue',
      queueItemId,
      priorityLevel,
      displayDuration,
      tier: tierType,
      paymentCurrency: verification.currency,
      paymentAmount: verification.amount,
      processedImmediately: queueEmpty,
    });
  } catch (error) {
    console.error('[Queue Add] Error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as { code?: number })?.code;

    if (
      errorCode === 8 ||
      errorMessage.includes('RESOURCE_EXHAUSTED') ||
      errorMessage.includes('Quota exceeded')
    ) {
      return NextResponse.json(
        {
          error:
            'Service temporarily unavailable due to high demand. Your payment was received - ' +
            'please contact support with your transaction signature for manual processing.',
          code: 'QUOTA_EXCEEDED',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
