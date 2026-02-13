import { NextResponse } from 'next/server';
import { getStateSnapshot, refreshStateSnapshot } from '@/lib/server/state-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const snapshot = await refreshStateSnapshot('api_state_get');

    return NextResponse.json(snapshot, {
      headers: {
        'Cache-Control': 'public, max-age=1, stale-while-revalidate=1',
      },
    });
  } catch (error) {
    console.error('[State API] Failed to refresh state:', error);

    return NextResponse.json(getStateSnapshot(), {
      headers: {
        'Cache-Control': 'public, max-age=1, stale-while-revalidate=1',
      },
    });
  }
}
