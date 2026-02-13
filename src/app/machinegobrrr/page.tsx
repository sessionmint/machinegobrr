'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import { LoadingSessionOverlay } from '@/components/LoadingSessionOverlay';
import { WelcomeModal } from '@/components/WelcomeModal';
import { usePhantomWallet } from '@/components/WalletProvider';
import { useAppStateStream } from '@/hooks/useAppStateStream';
import {
  DEFAULT_TOKEN_MINT,
  DISPLAY_DURATION_STANDARD,
  HELIUS_RPC_URL,
  LIVESTREAM_URL,
  MINSTR_MINT,
  MINSTR_PRIORITY_PRICE,
  MINSTR_STANDARD_PRICE,
  MINSTR_SYMBOL,
  PRIORITY_PRICE,
  STANDARD_PRICE,
  TREASURY_WALLET,
} from '@/lib/constants';
import { AppStateSnapshot, DeviceStateSnapshot } from '@/lib/state';

const SESSION_TRANSITION_DURATION = 10000;
const FALLBACK_MAINNET_RPC_URLS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
];

type PaymentOptionId =
  | 'sol_standard'
  | 'sol_priority'
  | 'minstr_standard'
  | 'minstr_priority';

interface PaymentOptionConfig {
  id: PaymentOptionId;
  tier: 'standard' | 'priority';
  currency: 'SOL' | 'MINSTR';
  amount: number;
  label: string;
}

const PAYMENT_OPTIONS: PaymentOptionConfig[] = [
  {
    id: 'sol_standard',
    tier: 'standard',
    currency: 'SOL',
    amount: STANDARD_PRICE,
    label: `${STANDARD_PRICE.toFixed(2)} SOL Standard`,
  },
  {
    id: 'sol_priority',
    tier: 'priority',
    currency: 'SOL',
    amount: PRIORITY_PRICE,
    label: `${PRIORITY_PRICE.toFixed(2)} SOL Priority`,
  },
  {
    id: 'minstr_standard',
    tier: 'standard',
    currency: 'MINSTR',
    amount: MINSTR_STANDARD_PRICE,
    label: `${MINSTR_STANDARD_PRICE.toLocaleString()} $${MINSTR_SYMBOL} Standard`,
  },
  {
    id: 'minstr_priority',
    tier: 'priority',
    currency: 'MINSTR',
    amount: MINSTR_PRIORITY_PRICE,
    label: `${MINSTR_PRIORITY_PRICE.toLocaleString()} $${MINSTR_SYMBOL} Priority`,
  },
];

const SOL_PAYMENT_OPTIONS = PAYMENT_OPTIONS.filter((option) => option.currency === 'SOL');
const MINSTR_PAYMENT_OPTIONS = PAYMENT_OPTIONS.filter((option) => option.currency === 'MINSTR');

export default function MachineGoBrrrPage() {
  const [streamEnabled, setStreamEnabled] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const previousTokenRef = useRef<string | null>(null);

  const stateStream = useAppStateStream(true);
  const currentToken = stateStream.snapshot?.currentToken || DEFAULT_TOKEN_MINT;
  const currentItem = stateStream.snapshot?.currentItem || null;
  const queue = stateStream.snapshot?.queue || [];

  useEffect(() => {
    const clock = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const onStreamEnabled = () => setStreamEnabled(true);
    window.addEventListener('streamEnabled', onStreamEnabled);
    return () => window.removeEventListener('streamEnabled', onStreamEnabled);
  }, []);

  useEffect(() => {
    const previousToken = previousTokenRef.current;
    const tokenChanged = previousToken !== null && previousToken !== currentToken;
    const shouldShowLoading = tokenChanged && currentToken !== DEFAULT_TOKEN_MINT;

    previousTokenRef.current = currentToken;

    if (!shouldShowLoading) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsLoadingSession(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [currentToken]);

  const onSessionLoadComplete = useCallback(() => {
    setIsLoadingSession(false);
  }, []);

  const streamUrl = useMemo(() => {
    if (LIVESTREAM_URL.includes('player.kick.com') || LIVESTREAM_URL.includes('kick.com')) {
      const separator = LIVESTREAM_URL.includes('?') ? '&' : '?';
      return `${LIVESTREAM_URL}${separator}autoplay=true&muted=${streamEnabled ? 'false' : 'true'}`;
    }
    return LIVESTREAM_URL;
  }, [streamEnabled]);

  return (
    <>
      <WelcomeModal />

      <div className="dashboard">
        <div className="bg-pattern" />

        {isLoadingSession ? (
          <LoadingSessionOverlay
            duration={SESSION_TRANSITION_DURATION}
            onComplete={onSessionLoadComplete}
          />
        ) : null}

        <main className="main-column">
          <div className="stream-layer">
            <div className="layer-badge">
              <span className="dot" style={{ background: '#ef4444' }} />
              LIVE
            </div>
            <StreamEmbed enabled={streamEnabled} url={streamUrl} />
          </div>

          <div className="chart-layer">
            <div className="layer-badge">CHART</div>
            <iframe
              title="machinegobrrr-chart"
              src={`https://dexscreener.com/solana/${currentToken}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTimeframesToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=marketCap&interval=5`}
            />
          </div>
        </main>

        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="brand-logo">
              <img src="/logo-fav.jpg" alt="MachineGoBrrr logo" className="brand-logo-image" />
            </div>
            <div className="brand-text">
              <h1>MachineGoBrrr</h1>
              <span>
                <span className="dot" style={{ background: '#39ff14' }} />
                SessionMint.fun
              </span>
            </div>
          </div>
          <div className="sidebar-content">
            <div className="sidebar-scroll">
              <DeviceStatus device={stateStream.snapshot?.device || null} streamConnected={stateStream.connected} nowMs={nowMs} />
              <PromoteForm />
              <ActiveToken currentItem={currentItem} currentToken={currentToken} nowMs={nowMs} />
              <QueueList queue={queue} currentItem={currentItem} nowMs={nowMs} />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function StreamEmbed({
  enabled,
  url,
}: {
  enabled: boolean;
  url: string;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      {!loaded && (
        <div className="loading">
          <div className="spinner" />
        </div>
      )}
      <iframe
        src={url}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{
          opacity: loaded ? 1 : 0,
          width: '100%',
          height: '100%',
          position: 'absolute',
          inset: 0,
          border: 'none',
          pointerEvents: enabled ? 'auto' : 'none',
        }}
        onLoad={() => setLoaded(true)}
      />
      {!enabled && (
        <div className="stream-disabled-overlay">
          <div className="stream-disabled-content">
            <p>Click &quot;I&apos;m ready to go brrr&quot; to enable stream controls.</p>
          </div>
        </div>
      )}
    </>
  );
}

function ActiveToken({
  currentItem,
  currentToken,
  nowMs,
}: {
  currentItem: AppStateSnapshot['currentItem'];
  currentToken: string;
  nowMs: number;
}) {
  const isDefault = currentToken === DEFAULT_TOKEN_MINT;
  const timeLeftMs =
    !isDefault && currentItem?.expiresAt
      ? Math.max(0, currentItem.expiresAt - nowMs)
      : 0;
  const format = (ms: number) =>
    `${Math.floor(ms / 60000)}:${Math.floor((ms % 60000) / 1000)
      .toString()
      .padStart(2, '0')}`;

  return (
    <div className="section">
      <div className="section-title-row" style={{ marginBottom: 8 }}>
        <span className="section-title">Now Showing</span>
        {!isDefault && currentItem ? (
          <span className={`mini-timer ${currentItem.isPriority ? 'priority' : ''}`}>
            {format(timeLeftMs)}
          </span>
        ) : null}
      </div>
      <div className="token-details">
        <div className="detail-row">
          <span
            className="detail-value mono"
            style={{ textAlign: 'left', width: '100%' }}
          >
            {currentToken}
          </span>
        </div>
        {!isDefault && currentItem ? (
          <>
            <div className="detail-row">
              <span className="detail-label">Tier</span>
              <span className="detail-value">
                {currentItem.priorityLevel >= 1 ? 'Priority' : 'Standard'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Wallet</span>
              <span className="detail-value mono">
                {currentItem.walletAddress.slice(0, 4)}...{currentItem.walletAddress.slice(-4)}
              </span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DeviceStatus({
  device,
  streamConnected,
  nowMs,
}: {
  device: DeviceStateSnapshot | null;
  streamConnected: boolean;
  nowMs: number;
}) {
  const cooldownSeconds =
    device?.cooldown?.active && device.cooldown.endsAt
      ? Math.max(0, Math.ceil((device.cooldown.endsAt - nowMs) / 1000))
      : null;

  const text = !streamConnected
    ? 'State stream reconnecting...'
    : !device
      ? 'Loading state...'
      : device.state === 'cooldown' && cooldownSeconds !== null
        ? `Starting in ${cooldownSeconds}s`
        : device.state === 'active'
          ? `${device.session?.mode || 'Active'} (${device.session?.speed || 0}%)`
          : device.state === 'waiting'
            ? 'Waiting for swaps'
            : device.state;

  return (
    <div className="section device-section">
      <div className="section-title">Device</div>
      <div className="device-status">
        <span className="device-indicator" style={{ backgroundColor: device?.state === 'active' ? '#39ff14' : '#eab308' }} />
        <span className="device-text">{text}</span>
      </div>
    </div>
  );
}

function PromoteForm() {
  const [token, setToken] = useState('');
  const [selectedPaymentOption, setSelectedPaymentOption] = useState<PaymentOptionId>('sol_standard');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cooldownStatus, setCooldownStatus] = useState<{ inCooldown: boolean; message?: string } | null>(null);
  const [checkCooldown, setCheckCooldown] = useState(false);
  const [buttonCooldown, setButtonCooldown] = useState(0);

  const nonceSignedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wallet = usePhantomWallet();
  const rpcCandidates = useMemo(
    () => Array.from(new Set([HELIUS_RPC_URL, ...FALLBACK_MAINNET_RPC_URLS].filter(Boolean))),
    []
  );
  const getWorkingConnection = useCallback(async () => {
    let lastError: Error | null = null;

    for (const rpcUrl of rpcCandidates) {
      const candidate = new Connection(rpcUrl, 'confirmed');
      try {
        await candidate.getLatestBlockhash('confirmed');
        return { connection: candidate, rpcUrl };
      } catch (error) {
        lastError = error as Error;
      }
    }

    throw lastError ?? new Error('No available Solana RPC endpoint');
  }, [rpcCandidates]);
  const selectedConfig = useMemo(
    () => PAYMENT_OPTIONS.find((option) => option.id === selectedPaymentOption) || PAYMENT_OPTIONS[0],
    [selectedPaymentOption]
  );
  const selectedTier = selectedConfig.tier;
  const selectedCurrency = selectedConfig.currency;
  const selectedAmount = selectedConfig.amount;
  const selectedAmountLabel = useMemo(() => {
    if (selectedCurrency === 'SOL') {
      return `${selectedAmount.toFixed(2)} SOL`;
    }
    return `${selectedAmount.toLocaleString()} $${MINSTR_SYMBOL}`;
  }, [selectedAmount, selectedCurrency]);

  useEffect(() => {
    if (buttonCooldown <= 0) return;
    const timer = setInterval(() => setButtonCooldown((prev) => (prev <= 1 ? 0 : prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [buttonCooldown]);

  useEffect(() => {
    setCooldownStatus(null);
    if (!token.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setCheckCooldown(true);
      try {
        const response = await fetch('/api/queue/check-cooldown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenMint: token.trim() }),
        });
        const data = (await response.json()) as { inCooldown: boolean; message?: string };
        setCooldownStatus(data);
        if (data.inCooldown) {
          setSelectedPaymentOption((current) => {
            if (current === 'sol_standard') return 'sol_priority';
            if (current === 'minstr_standard') return 'minstr_priority';
            return current;
          });
        }
      } catch {
        setCooldownStatus(null);
      } finally {
        setCheckCooldown(false);
      }
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [token]);

  const pay = async () => {
    if (buttonCooldown > 0) return;
    if (!wallet.connected || !wallet.address) {
      setMessage('Connect Phantom first');
      return;
    }
    if (!token.trim()) {
      setMessage('Token address is required');
      return;
    }
    if (selectedTier === 'standard' && cooldownStatus?.inCooldown) {
      setMessage(cooldownStatus.message || 'Token is in cooldown');
      return;
    }

    setLoading(true);
    setButtonCooldown(2);
    setMessage(null);

    try {
      if (!nonceSignedRef.current) {
        await wallet.signMessage(`SessionMint.fun auth ${Date.now()}`);
        nonceSignedRef.current = true;
      }

      const sender = new PublicKey(wallet.address);
      const treasury = new PublicKey(TREASURY_WALLET);
      const { connection: rpcConnection } = await getWorkingConnection();
      const { blockhash, lastValidBlockHeight } = await rpcConnection.getLatestBlockhash('confirmed');
      const transaction = new Transaction({
        feePayer: sender,
        recentBlockhash: blockhash,
      });

      if (selectedCurrency === 'SOL') {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: sender,
            toPubkey: treasury,
            lamports: Math.floor(selectedAmount * LAMPORTS_PER_SOL),
          })
        );
      } else {
        const minstrMint = new PublicKey(MINSTR_MINT);
        const mintInfo = await getMint(rpcConnection, minstrMint, 'confirmed');
        const senderTokenAccount = getAssociatedTokenAddressSync(minstrMint, sender);
        const treasuryTokenAccount = getAssociatedTokenAddressSync(minstrMint, treasury);

        const [senderTokenAccountInfo, treasuryTokenAccountInfo] = await Promise.all([
          rpcConnection.getAccountInfo(senderTokenAccount, 'confirmed'),
          rpcConnection.getAccountInfo(treasuryTokenAccount, 'confirmed'),
        ]);

        if (!senderTokenAccountInfo) {
          throw new Error(`Connected wallet has no $${MINSTR_SYMBOL} token account`);
        }

        if (!treasuryTokenAccountInfo) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              sender,
              treasuryTokenAccount,
              treasury,
              minstrMint
            )
          );
        }

        const tokenAmountRaw = BigInt(selectedAmount) * (BigInt(10) ** BigInt(mintInfo.decimals));
        transaction.add(
          createTransferCheckedInstruction(
            senderTokenAccount,
            minstrMint,
            treasuryTokenAccount,
            sender,
            tokenAmountRaw,
            mintInfo.decimals,
            [],
            TOKEN_PROGRAM_ID
          )
        );
      }

      const signature = await wallet.signAndSendTransaction(transaction);
      await rpcConnection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      const queueResponse = await fetch('/api/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenMint: token.trim(),
          walletAddress: wallet.address,
          amount: selectedAmount,
          signature,
          paymentMethod: selectedCurrency,
          paymentTier: selectedTier,
        }),
      });

      const queueResult = (await queueResponse.json()) as { error?: string };
      if (!queueResponse.ok) {
        throw new Error(queueResult?.error || 'Failed to queue token');
      }

      setToken('');
      setCooldownStatus(null);
      setMessage('Queued successfully');
    } catch (error) {
      const rawMessage = (error as Error).message || 'Transaction failed';
      if (
        /recent blockhash/i.test(rawMessage) ||
        /missing api key/i.test(rawMessage) ||
        /access forbidden/i.test(rawMessage) ||
        /\b401\b/.test(rawMessage) ||
        /\b403\b/.test(rawMessage)
      ) {
        setMessage('Could not reach RPC endpoint. Switched to public Solana RPC fallback. Please try again.');
      } else {
        setMessage(rawMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const onWalletButtonClick = async () => {
    try {
      if (wallet.connected) {
        await wallet.disconnect();
      } else {
        await wallet.connect();
      }
    } catch (error) {
      setMessage((error as Error).message || 'Wallet action failed');
    }
  };

  return (
    <div className="section">
      <div className="section-title">Sync your Token to Machine &amp; Watch it GoBrrr</div>
      <div className="form">
        <div className="panel-flow-lines">
          <p className="panel-flow-line">Load your Token&apos;s Chart</p>
          <p className="panel-flow-line">Session State will Sync to Machine</p>
          <p className="panel-flow-line">Watch Machine Go Brrrrr</p>
        </div>
        <input className="input" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Token mint or contract address..." />
        {message ? <div className="msg">{message}</div> : null}
        {checkCooldown ? <div className="msg">Checking cooldown...</div> : null}
        <button className="btn" onClick={onWalletButtonClick}>
          {wallet.connecting ? 'Connecting...' : wallet.connected ? `Disconnect (${wallet.address?.slice(0, 4)}...${wallet.address?.slice(-4)})` : 'Connect Phantom'}
        </button>

        <div className="payment-rows">
          <div className="payment-row">
            <div className="payment-row-label">Pay in SOL</div>
            <div className="btns">
              {SOL_PAYMENT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={selectedPaymentOption === option.id ? 'btn btn-selected-sol' : 'btn'}
                  onClick={() => setSelectedPaymentOption(option.id)}
                  disabled={loading}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="payment-row">
            <div className="payment-row-label">Pay in ${MINSTR_SYMBOL}</div>
            <div className="btns">
              {MINSTR_PAYMENT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={selectedPaymentOption === option.id ? 'btn btn-selected' : 'btn'}
                  onClick={() => setSelectedPaymentOption(option.id)}
                  disabled={loading}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button className="btn btn-green" onClick={pay} disabled={loading || !wallet.connected || buttonCooldown > 0}>
          {loading ? 'Processing...' : buttonCooldown > 0 ? `Wait ${buttonCooldown}s` : `Pay ${selectedAmountLabel}`}
        </button>
      </div>
    </div>
  );
}

function QueueList({
  queue,
  currentItem,
  nowMs,
}: {
  queue: AppStateSnapshot['queue'];
  currentItem: AppStateSnapshot['currentItem'];
  nowMs: number;
}) {
  const waitTime = (index: number) => {
    const remaining = currentItem?.expiresAt ? Math.max(0, currentItem.expiresAt - nowMs) : 0;
    let total = remaining;
    for (let i = 0; i < index; i += 1) total += queue[i].displayDuration || DISPLAY_DURATION_STANDARD;
    const totalMins = Math.floor(total / 60000);
    if (totalMins >= 60) {
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      return `${hours}h ${mins}m`;
    }
    return `${totalMins}m`;
  };

  const tierLabel = (priorityLevel: number) => {
    if (priorityLevel >= 1) return 'Priority';
    return 'Standard';
  };

  return (
    <div className="section">
      <div className="section-title">Queue ({queue.length})</div>
      {queue.length === 0 ? (
        <div className="queue-empty">No tokens waiting</div>
      ) : (
        <div className="queue-list">
          {queue.map((item, index) => (
            <div key={item.id} className="queue-item">
              <span className="n">#{index + 1}</span>
              <div className="queue-item-info">
                <span className="a">{item.tokenMint.slice(0, 4)}...{item.tokenMint.slice(-4)}</span>
                <span className="wait">~{waitTime(index)}</span>
              </div>
              <span className="wait">{tierLabel(item.priorityLevel)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
