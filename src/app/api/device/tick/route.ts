import { NextRequest, NextResponse } from 'next/server';
import {
  getAllActiveSessions,
  processSessionTick,
  endSession,
  isSessionExpired,
  getModeName,
  cleanupExpiredSessions,
  getSession,
  DeviceCommand
} from '@/lib/chartSync';
import { updateDeviceSession } from '@/lib/firebase-admin';
import { refreshStateSnapshot } from '@/lib/server/state-store';

// Environment variables
const AUTOBLOW_DEVICE_TOKEN = process.env.AUTOBLOW_DEVICE_TOKEN || '';
const AUTOBLOW_ENABLED = process.env.AUTOBLOW_ENABLED === 'true';
const AUTOBLOW_CLUSTER = process.env.AUTOBLOW_CLUSTER || '';
const AUTOBLOW_LATENCY_API = 'https://latency.autoblowapi.com';

let cachedClusterUrl: string | null = null;

async function getClusterUrl(): Promise<string> {
  if (cachedClusterUrl) return cachedClusterUrl;

  if (AUTOBLOW_CLUSTER) {
    cachedClusterUrl = `https://${AUTOBLOW_CLUSTER}.autoblowapi.com`;
    return cachedClusterUrl;
  }

  const response = await fetch(`${AUTOBLOW_LATENCY_API}/autoblow/connected`, {
    method: 'GET',
    headers: { 'x-device-token': AUTOBLOW_DEVICE_TOKEN }
  });

  if (!response.ok) throw new Error('Device not connected');
  const data = await response.json();
  if (!data.connected) throw new Error('Device not connected');

  cachedClusterUrl = data.cluster;
  return cachedClusterUrl!;
}

async function sendCommand(command: DeviceCommand): Promise<boolean> {
  if (!AUTOBLOW_DEVICE_TOKEN) return false;

  try {
    const baseUrl = await getClusterUrl();

    if (command.speed === 0) {
      const response = await fetch(`${baseUrl}/autoblow/oscillate/stop`, {
        method: 'PUT',
        headers: { 'x-device-token': AUTOBLOW_DEVICE_TOKEN }
      });
      return response.ok;
    }

    const response = await fetch(`${baseUrl}/autoblow/oscillate`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-device-token': AUTOBLOW_DEVICE_TOKEN
      },
      body: JSON.stringify({
        speed: command.speed,
        minY: command.minY,
        maxY: command.maxY
      })
    });
    return response.ok;
  } catch (error) {
    console.error('[Tick] Error sending command:', error);
    return false;
  }
}

/**
 * GET - Process tick for all active sessions
 * This endpoint should be called by Cloud Scheduler every 60 seconds.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const adminKey = process.env.ADMIN_API_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    // Allow Cloud Scheduler or manual calls with auth
    const isAuthorized =
      (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (adminKey && authHeader === `Bearer ${adminKey}`);

    if (!isAuthorized && (cronSecret || adminKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Advance queue state server-side so clients do not trigger processing loops.
    try {
      const queueProcessAuth = cronSecret
        ? `Bearer ${cronSecret}`
        : adminKey
          ? `Bearer ${adminKey}`
          : null;
      await fetch(`${baseUrl}/api/queue/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(queueProcessAuth ? { Authorization: queueProcessAuth } : {}),
        },
      });
    } catch (queueError) {
      console.error('[Tick] Failed to trigger queue process:', queueError);
    }

    // Get all active sessions
    const sessions = getAllActiveSessions();

    if (sessions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active sessions',
        sessionsProcessed: 0
      });
    }

    const results: Array<{
      sessionId: string;
      tokenMint: string;
      mode: string;
      command: DeviceCommand | null;
      deviceResult: boolean;
      expired: boolean;
    }> = [];

    // Process each active session
    for (const session of sessions) {
      // Check if session expired
      if (isSessionExpired(session)) {
        endSession(session.sessionId);
        results.push({
          sessionId: session.sessionId,
          tokenMint: session.tokenMint,
          mode: getModeName(session.modeId),
          command: { speed: 0, minY: 50, maxY: 50 },
          deviceResult: await sendCommand({ speed: 0, minY: 50, maxY: 50 }),
          expired: true
        });
        continue;
      }

      // Process tick
      const command = await processSessionTick(session.sessionId);
      let deviceResult = false;

      if (command && AUTOBLOW_ENABLED && AUTOBLOW_DEVICE_TOKEN) {
        deviceResult = await sendCommand(command);
      }

      // Update Firestore with new mode/speed/amplitude values
      // Re-fetch session to get updated values after processSessionTick
      const updatedSession = getSession(session.sessionId);
      if (updatedSession) {
        try {
          await updateDeviceSession(
            updatedSession.tokenMint,
            updatedSession.modeId,
            getModeName(updatedSession.modeId),
            updatedSession.lastSpeed,
            updatedSession.lastAmplitude
          );
          console.log(`[Tick] Updated Firestore: mode=${getModeName(updatedSession.modeId)}, speed=${updatedSession.lastSpeed}, amp=${updatedSession.lastAmplitude}`);
        } catch (fsError) {
          console.error('[Tick] Failed to update Firestore:', fsError);
        }
      }

      results.push({
        sessionId: session.sessionId,
        tokenMint: session.tokenMint,
        mode: getModeName(session.modeId),
        command,
        deviceResult,
        expired: false
      });
    }

    // Cleanup any stale sessions
    const cleaned = cleanupExpiredSessions();

    console.log(`[Tick] Processed ${results.length} sessions, cleaned ${cleaned} expired`);

    await refreshStateSnapshot('device_tick', true);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      deviceEnabled: AUTOBLOW_ENABLED,
      sessionsProcessed: results.length,
      sessionsCleaned: cleaned,
      results
    });
  } catch (error) {
    console.error('[Tick] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Tick failed' },
      { status: 500 }
    );
  }
}

/**
 * POST - Manual tick trigger (for testing)
 */
export async function POST(request: NextRequest) {
  // Same as GET but via POST
  return GET(request);
}
