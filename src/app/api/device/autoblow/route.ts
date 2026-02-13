import { NextRequest, NextResponse } from 'next/server';
import {
  createSession,
  getSession,
  getActiveSessionForToken,
  processSessionTick,
  endSession,
  getSessionStatus,
  cleanupExpiredSessions,
  getAllActiveSessions,
  getModeName,
  DeviceCommand,
  COMMAND_INTERVAL_MS,
} from '@/lib/chartSync';
import { updateDeviceSession } from '@/lib/firebase-admin';

const AUTOBLOW_LATENCY_API = 'https://latency.autoblowapi.com';
const AUTOBLOW_DEVICE_TOKEN = process.env.AUTOBLOW_DEVICE_TOKEN || '';
const AUTOBLOW_ENABLED = process.env.AUTOBLOW_ENABLED === 'true';
const AUTOBLOW_CLUSTER = process.env.AUTOBLOW_CLUSTER || '';

let cachedClusterUrl: string | null = null;
let lastCommandTime = 0;

interface AutoblowConnectedResponse {
  connected: boolean;
  cluster: string;
}

interface SessionBody {
  action?: 'start' | 'tick' | 'stop' | 'test' | 'status' | 'cleanup';
  sessionStateId?: string;
  tokenMint?: string;
  sessionId?: string;
  speed?: number;
  minY?: number;
  maxY?: number;
}

async function getClusterUrl(): Promise<string> {
  if (cachedClusterUrl) return cachedClusterUrl;

  if (AUTOBLOW_CLUSTER) {
    cachedClusterUrl = `https://${AUTOBLOW_CLUSTER}.autoblowapi.com`;
    return cachedClusterUrl;
  }

  const response = await fetch(`${AUTOBLOW_LATENCY_API}/autoblow/connected`, {
    method: 'GET',
    headers: { 'x-device-token': AUTOBLOW_DEVICE_TOKEN },
  });

  if (!response.ok) {
    throw new Error('Device not connected');
  }

  const data = (await response.json()) as AutoblowConnectedResponse;
  if (!data.connected) {
    throw new Error('Device not connected');
  }

  cachedClusterUrl = data.cluster;
  return cachedClusterUrl;
}

async function getDeviceState(): Promise<Record<string, unknown>> {
  if (!AUTOBLOW_DEVICE_TOKEN) throw new Error('Device token not configured');

  const baseUrl = await getClusterUrl();
  const response = await fetch(`${baseUrl}/autoblow/state`, {
    method: 'GET',
    headers: { 'x-device-token': AUTOBLOW_DEVICE_TOKEN },
  });

  if (!response.ok) {
    throw new Error(`Failed to get device state: ${response.status}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

async function sendDeviceCommand(command: DeviceCommand): Promise<Record<string, unknown>> {
  if (!AUTOBLOW_DEVICE_TOKEN) throw new Error('Device token not configured');

  const now = Date.now();
  if (now - lastCommandTime < COMMAND_INTERVAL_MS - 5000) {
    return { skipped: true, reason: 'cooldown' };
  }

  const baseUrl = await getClusterUrl();

  if (command.speed === 0) {
    const response = await fetch(`${baseUrl}/autoblow/oscillate/stop`, {
      method: 'PUT',
      headers: { 'x-device-token': AUTOBLOW_DEVICE_TOKEN },
    });

    lastCommandTime = now;
    return response.ok ? { stopped: true } : { error: 'Failed to stop' };
  }

  const response = await fetch(`${baseUrl}/autoblow/oscillate`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-device-token': AUTOBLOW_DEVICE_TOKEN,
    },
    body: JSON.stringify({
      speed: command.speed,
      minY: command.minY,
      maxY: command.maxY,
    }),
  });

  lastCommandTime = now;

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Device command failed: ${response.status} - ${text}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

async function stopDevice(): Promise<Record<string, unknown>> {
  if (!AUTOBLOW_DEVICE_TOKEN) return { error: 'Not configured' };

  const baseUrl = await getClusterUrl();
  const response = await fetch(`${baseUrl}/autoblow/oscillate/stop`, {
    method: 'PUT',
    headers: { 'x-device-token': AUTOBLOW_DEVICE_TOKEN },
  });

  return response.ok ? { stopped: true } : { error: 'Failed to stop' };
}

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ADMIN_API_KEY;

  const isAuthorized =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (adminKey && authHeader === `Bearer ${adminKey}`);

  if (cronSecret || adminKey) {
    return Boolean(isAuthorized);
  }

  return true;
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as SessionBody;
    const action = body.action;

    switch (action) {
      case 'start': {
        const sessionStateId = body.sessionStateId;
        const tokenMint = body.tokenMint;

        if (!sessionStateId || !tokenMint) {
          return NextResponse.json(
            { error: 'Missing sessionStateId or tokenMint' },
            { status: 400 }
          );
        }

        const existing = getActiveSessionForToken(tokenMint);
        if (existing) {
          return NextResponse.json({
            success: false,
            error: 'Session already active for this token',
            sessionId: existing.sessionId,
          });
        }

        const session = createSession({ sessionStateId, tokenMint });

        let deviceResult: Record<string, unknown> | null = null;
        if (AUTOBLOW_ENABLED && AUTOBLOW_DEVICE_TOKEN) {
          const command = await processSessionTick(session.sessionId);
          if (command) {
            deviceResult = await sendDeviceCommand(command);
          }
        }

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
          } catch (error) {
            console.error('[Autoblow] Failed to update Firestore on start:', error);
          }
        }

        return NextResponse.json({
          success: true,
          sessionId: session.sessionId,
          modeId: session.modeId,
          modeName: getModeName(session.modeId),
          startsAt: new Date(session.startTime).toISOString(),
          endsAt: new Date(session.endTime).toISOString(),
          deviceEnabled: AUTOBLOW_ENABLED,
          deviceResult,
        });
      }

      case 'tick': {
        const sessionId = body.sessionId;
        const tokenMint = body.tokenMint;

        const session = sessionId
          ? getSession(sessionId)
          : tokenMint
            ? getActiveSessionForToken(tokenMint)
            : null;

        if (!session) {
          return NextResponse.json({
            success: false,
            error: 'No active session found',
          });
        }

        const command = await processSessionTick(session.sessionId);
        if (!command) {
          return NextResponse.json({
            success: false,
            error: 'Failed to process tick',
          });
        }

        let deviceResult: Record<string, unknown> | null = null;
        if (AUTOBLOW_ENABLED && AUTOBLOW_DEVICE_TOKEN) {
          deviceResult = await sendDeviceCommand(command);
        }

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
          } catch (error) {
            console.error('[Autoblow] Failed to update Firestore:', error);
          }
        }

        return NextResponse.json({
          success: true,
          sessionId: session.sessionId,
          command,
          status: getSessionStatus(session.sessionId),
          deviceEnabled: AUTOBLOW_ENABLED,
          deviceResult,
        });
      }

      case 'stop': {
        const sessionId = body.sessionId;
        const tokenMint = body.tokenMint;

        const session = sessionId
          ? getSession(sessionId)
          : tokenMint
            ? getActiveSessionForToken(tokenMint)
            : null;

        if (session) {
          endSession(session.sessionId);
        }

        const deviceResult =
          AUTOBLOW_ENABLED && AUTOBLOW_DEVICE_TOKEN
            ? await stopDevice()
            : null;

        return NextResponse.json({
          success: true,
          action: 'stopped',
          sessionId: session?.sessionId,
          deviceResult,
        });
      }

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Use: start, tick, stop',
            examples: {
              start: { action: 'start', sessionStateId: 'abc', tokenMint: '...' },
              tick: { action: 'tick', sessionId: '...' },
              stop: { action: 'stop', sessionId: '...' },
            },
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Autoblow] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const adminKey = process.env.ADMIN_API_KEY;

    if (adminKey && authHeader !== `Bearer ${adminKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const tokenMint = searchParams.get('tokenMint');

    const response: {
      enabled: boolean;
      configured: boolean;
      commandIntervalMs: number;
      session?: ReturnType<typeof getSessionStatus>;
      activeSessions: Array<{
        sessionId: string;
        tokenMint: string;
        mode: string;
        elapsed: number;
        remaining: number;
      }>;
      deviceState?: Record<string, unknown>;
      deviceError?: string;
    } = {
      enabled: AUTOBLOW_ENABLED,
      configured: !!AUTOBLOW_DEVICE_TOKEN,
      commandIntervalMs: COMMAND_INTERVAL_MS,
      activeSessions: [],
    };

    if (sessionId) {
      response.session = getSessionStatus(sessionId);
    } else if (tokenMint) {
      const session = getActiveSessionForToken(tokenMint);
      if (session) {
        response.session = getSessionStatus(session.sessionId);
      }
    }

    response.activeSessions = getAllActiveSessions().map((session) => ({
      sessionId: session.sessionId,
      tokenMint: session.tokenMint,
      mode: getModeName(session.modeId),
      elapsed: Math.floor((Date.now() - session.startTime) / 1000),
      remaining: Math.max(0, Math.floor((session.endTime - Date.now()) / 1000)),
    }));

    if (AUTOBLOW_ENABLED && AUTOBLOW_DEVICE_TOKEN) {
      try {
        response.deviceState = await getDeviceState();
      } catch (error) {
        response.deviceError = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Autoblow] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Status check failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const adminKey = process.env.ADMIN_API_KEY;

    if (adminKey && authHeader !== `Bearer ${adminKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessions = getAllActiveSessions();
    sessions.forEach((session) => endSession(session.sessionId));

    const deviceResult = AUTOBLOW_DEVICE_TOKEN ? await stopDevice() : null;

    return NextResponse.json({
      success: true,
      action: 'emergency_stop',
      sessionsEnded: sessions.length,
      deviceResult,
    });
  } catch (error) {
    console.error('[Autoblow] Emergency stop error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stop failed' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const adminKey = process.env.ADMIN_API_KEY;

    if (adminKey && authHeader !== `Bearer ${adminKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!AUTOBLOW_DEVICE_TOKEN) {
      return NextResponse.json({ error: 'Device not configured' }, { status: 400 });
    }

    const body = (await request.json()) as SessionBody;
    const action = body.action;
    const speed = body.speed;
    const minY = body.minY;
    const maxY = body.maxY;

    switch (action) {
      case 'test': {
        const command: DeviceCommand = {
          speed: Math.max(0, Math.min(100, speed || 40)),
          minY: Math.max(0, Math.min(100, minY || 30)),
          maxY: Math.max(0, Math.min(100, maxY || 70)),
        };

        const result = await sendDeviceCommand(command);
        return NextResponse.json({
          success: true,
          action: 'test',
          command,
          result,
        });
      }

      case 'stop': {
        const result = await stopDevice();
        return NextResponse.json({
          success: true,
          action: 'stopped',
          result,
        });
      }

      case 'status': {
        const state = await getDeviceState();
        return NextResponse.json({
          success: true,
          action: 'status',
          state,
        });
      }

      case 'cleanup': {
        const cleaned = cleanupExpiredSessions();
        return NextResponse.json({
          success: true,
          action: 'cleanup',
          sessionsRemoved: cleaned,
        });
      }

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Use: test, stop, status, cleanup',
            examples: {
              test: { action: 'test', speed: 50, minY: 30, maxY: 70 },
              stop: { action: 'stop' },
              status: { action: 'status' },
              cleanup: { action: 'cleanup' },
            },
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Autoblow] PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: 500 }
    );
  }
}
