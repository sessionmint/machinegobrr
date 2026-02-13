import { NextRequest, NextResponse } from 'next/server';
import { checkDuplicateCooldown } from '@/lib/firebase-admin';
import { DUPLICATE_COOLDOWN_MS, MINSTR_PRIORITY_PRICE, PRIORITY_PRICE } from '@/lib/constants';
import { checkRateLimit, getClientIp } from '@/lib/server/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const limit = checkRateLimit({
      namespace: 'queue_cooldown_ip',
      key: ip,
      limit: 40,
      windowMs: 60_000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many cooldown checks from this IP',
          retryAfterMs: limit.retryAfterMs,
        },
        { status: 429 }
      );
    }

    const { tokenMint } = await request.json();

    if (!tokenMint) {
      return NextResponse.json(
        { error: 'tokenMint is required' },
        { status: 400 }
      );
    }

    // Check if token is in cooldown
    const cooldownCheck = await checkDuplicateCooldown(tokenMint, DUPLICATE_COOLDOWN_MS);

    if (cooldownCheck.inCooldown) {
      const hoursRemaining = Math.floor(cooldownCheck.remainingMs / (60 * 60 * 1000));
      const minutesRemaining = Math.ceil((cooldownCheck.remainingMs % (60 * 60 * 1000)) / (60 * 1000));

      return NextResponse.json({
        inCooldown: true,
        remainingMs: cooldownCheck.remainingMs,
        remainingTime: `${hoursRemaining}h ${minutesRemaining}m`,
        lastUsedAt: cooldownCheck.lastUsedAt,
        overrideOptions: {
          sol: PRIORITY_PRICE,
          minstr: MINSTR_PRIORITY_PRICE,
        },
        message:
          `This token was recently queued. Wait ${hoursRemaining}h ${minutesRemaining}m ` +
          `or use priority payment (${PRIORITY_PRICE} SOL or ${MINSTR_PRIORITY_PRICE} MINSTR).`,
      });
    }

    return NextResponse.json({
      inCooldown: false,
      message: 'Token is available for queue'
    });
  } catch (error) {
    console.error('[Cooldown Check] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check cooldown' },
      { status: 500 }
    );
  }
}
