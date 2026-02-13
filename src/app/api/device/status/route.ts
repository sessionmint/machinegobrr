import { NextResponse } from 'next/server';
import { refreshStateSnapshot } from '@/lib/server/state-store';

export async function GET() {
  const snapshot = await refreshStateSnapshot('device_status_get');
  const device = snapshot.device;

  return NextResponse.json(
    {
      connected: device.connected,
      state: device.state,
      session: device.session
        ? {
            mode: device.session.mode,
            modeId: device.session.modeId,
            elapsed: 0,
            remaining: 0,
            speed: device.session.speed,
            amplitude: device.session.amplitude,
          }
        : undefined,
      cooldown: device.cooldown
        ? {
            active: device.cooldown.active,
            remainingMs: device.cooldown.remainingMs,
            totalMs: device.cooldown.totalMs,
          }
        : undefined,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=2, stale-while-revalidate=5',
      },
    }
  );
}

