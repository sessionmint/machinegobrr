import { NextRequest, NextResponse } from 'next/server';
import {
  createSession,
  getActiveSessionForToken,
  processSessionTick,
  endSession,
  getSessionStatus,
  getModeName,
  DeviceCommand
} from '@/lib/chartSync';
import { updateDeviceSession, clearDeviceSession, getAdminDb, FieldValue } from '@/lib/firebase-admin';
import { checkRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { refreshStateSnapshot } from '@/lib/server/state-store';

// Environment variables for device configuration
const AUTOBLOW_DEVICE_TOKEN = process.env.AUTOBLOW_DEVICE_TOKEN || '';
const AUTOBLOW_ENABLED = process.env.AUTOBLOW_ENABLED === 'true';
const AUTOBLOW_CLUSTER = process.env.AUTOBLOW_CLUSTER || '';
const AUTOBLOW_LATENCY_API = 'https://latency.autoblowapi.com';

// Cache the cluster URL
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

async function stopOscillation(): Promise<boolean> {
  if (!AUTOBLOW_DEVICE_TOKEN) return false;

  try {
    const baseUrl = await getClusterUrl();
    const response = await fetch(`${baseUrl}/autoblow/oscillate/stop`, {
      method: 'PUT',
      headers: { 'x-device-token': AUTOBLOW_DEVICE_TOKEN }
    });
    return response.ok;
  } catch (error) {
    console.error('[Session] Error stopping device:', error);
    return false;
  }
}

async function sendCommand(command: DeviceCommand): Promise<boolean> {
  if (!AUTOBLOW_DEVICE_TOKEN) return false;

  try {
    const baseUrl = await getClusterUrl();

    if (command.speed === 0) {
      return await stopOscillation();
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
    console.error('[Session] Error sending command:', error);
    return false;
  }
}

/**
 * POST - Session lifecycle management
 * Called by server queue/tick routes for lifecycle transitions
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const adminKey = process.env.ADMIN_API_KEY;
    const cronSecret = process.env.CRON_SECRET;
    const isAuthorized =
      (adminKey && authHeader === `Bearer ${adminKey}`) ||
      (cronSecret && authHeader === `Bearer ${cronSecret}`);

    if ((adminKey || cronSecret) && !isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, tokenMint, sessionStateId } = body;
    const clientIp = getClientIp(request);

    const ipLimit = checkRateLimit({
      namespace: 'device_session_ip',
      key: clientIp,
      limit: 30,
      windowMs: 60_000,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many device commands from this IP', retryAfterMs: ipLimit.retryAfterMs },
        { status: 429 }
      );
    }

    if (!AUTOBLOW_ENABLED) {
      console.log('[Session] Device disabled, skipping action:', action);
      return NextResponse.json({
        success: true,
        action,
        deviceEnabled: false
      });
    }

    if (!AUTOBLOW_DEVICE_TOKEN) {
      console.log('[Session] No device token configured');
      return NextResponse.json({
        success: false,
        error: 'Device not configured'
      }, { status: 400 });
    }

    switch (action) {
      case 'start': {
        // Start a new chart-synced session for this token
        // This is called when a new token becomes active from the queue

        if (!tokenMint) {
          return NextResponse.json({
            success: false,
            error: 'Missing tokenMint'
          }, { status: 400 });
        }

        const tokenLimit = checkRateLimit({
          namespace: 'device_session_token',
          key: tokenMint,
          limit: 10,
          windowMs: 60_000,
        });
        if (!tokenLimit.allowed) {
          return NextResponse.json(
            { error: 'Too many device start attempts for this token', retryAfterMs: tokenLimit.retryAfterMs },
            { status: 429 }
          );
        }

        // Check for existing session
        const existing = getActiveSessionForToken(tokenMint);
        if (existing) {
          // Return existing session info
          const status = getSessionStatus(existing.sessionId);
          await refreshStateSnapshot('device_session_existing', true);
          return NextResponse.json({
            success: true,
            action: 'existing_session',
            sessionId: existing.sessionId,
            mode: getModeName(existing.modeId),
            status
          });
        }

        // Create new session
        const session = createSession({
          sessionStateId: sessionStateId || `queue-${Date.now()}`,
          tokenMint
        });

        // Process first tick and send initial command
        const command = await processSessionTick(session.sessionId);
        let deviceResult = false;
        if (command) {
          deviceResult = await sendCommand(command);
        }

        // Store mode in Firestore for cross-instance access
        const modeName = getModeName(session.modeId);
        console.log(`[Session] Storing in Firestore: mode=${modeName}, modeId=${session.modeId}, speed=${session.lastSpeed}`);
        try {
          await updateDeviceSession(
            tokenMint,
            session.modeId,
            modeName,
            session.lastSpeed,
            session.lastAmplitude
          );
          await getAdminDb().doc('settings/currentToken').set(
            {
              sessionStarted: true,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          console.log(`[Session] Firestore update successful`);
        } catch (fsError) {
          console.error(`[Session] Firestore update failed:`, fsError);
        }

        console.log(`[Session] Started for ${tokenMint.slice(0, 8)}... Mode: ${modeName}`);

        await refreshStateSnapshot('device_session_start', true);

        return NextResponse.json({
          success: true,
          action: 'started',
          sessionId: session.sessionId,
          modeId: session.modeId,
          modeName: getModeName(session.modeId),
          startsAt: new Date(session.startTime).toISOString(),
          endsAt: new Date(session.endTime).toISOString(),
          initialCommand: command,
          deviceResult
        });
      }

      case 'stop': {
        // Stop session and device
        // Called when token expires or is replaced

        if (tokenMint) {
          const session = getActiveSessionForToken(tokenMint);
          if (session) {
            endSession(session.sessionId);
            console.log(`[Session] Ended session for ${tokenMint.slice(0, 8)}...`);
          }
        }

        const stopped = await stopOscillation();

        // Clear the device session from Firestore
        try {
          await clearDeviceSession();
          await getAdminDb().doc('settings/currentToken').set(
            {
              sessionStarted: false,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          console.log('[Session] Cleared Firestore device session');
        } catch (err) {
          console.error('[Session] Failed to clear Firestore session:', err);
        }

        await refreshStateSnapshot('device_session_stop', true);

        return NextResponse.json({
          success: stopped,
          action: 'stopped',
          tokenMint
        });
      }

      case 'tick': {
        // Process a tick for the active session
        // Called by cron every 60 seconds

        if (!tokenMint) {
          return NextResponse.json({
            success: false,
            error: 'Missing tokenMint'
          }, { status: 400 });
        }

        const session = getActiveSessionForToken(tokenMint);
        if (!session) {
          return NextResponse.json({
            success: false,
            error: 'No active session for this token'
          });
        }

        const command = await processSessionTick(session.sessionId);
        let deviceResult = false;
        if (command) {
          deviceResult = await sendCommand(command);
        }

        // Update mode in Firestore (mode may have changed based on chart conditions)
        const modeName = getModeName(session.modeId);
        await updateDeviceSession(
          tokenMint,
          session.modeId,
          modeName,
          session.lastSpeed,
          session.lastAmplitude
        );

        const status = getSessionStatus(session.sessionId);

        await refreshStateSnapshot('device_session_tick', true);

        return NextResponse.json({
          success: true,
          action: 'tick',
          sessionId: session.sessionId,
          mode: modeName,
          command,
          status,
          deviceResult
        });
      }

      default:
        return NextResponse.json({
          error: 'Invalid action. Use: start, stop, tick'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('[Session] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Session action failed' },
      { status: 500 }
    );
  }
}

/**
 * GET - Get session status for a token
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenMint = searchParams.get('tokenMint');

    if (!tokenMint) {
      return NextResponse.json({
        error: 'Missing tokenMint parameter'
      }, { status: 400 });
    }

    const session = getActiveSessionForToken(tokenMint);

    if (!session) {
      return NextResponse.json({
        hasSession: false,
        tokenMint
      });
    }

    const status = getSessionStatus(session.sessionId);

    return NextResponse.json({
      hasSession: true,
      tokenMint,
      sessionId: session.sessionId,
      modeId: session.modeId,
      modeName: getModeName(session.modeId),
      ...status
    });
  } catch (error) {
    console.error('[Session] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Status check failed' },
      { status: 500 }
    );
  }
}
