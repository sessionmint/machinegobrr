// ============================================
// CHART SYNC SESSION MANAGEMENT
// ============================================

import {
  ChartSyncSession,
  SessionConfig,
  ModeParams,
  DeviceCommand,
  SESSION_DURATION_MS,
  BUFFER_SIZE
} from './types';
import { fetchCandles, computeMetrics, updateBuffer } from './data';
import { computeMode, getModeName, selectModeFromMetrics } from './modes';
import { applyBooster, getBoosterPatternName } from './booster';
import { applySafetyPipeline, createDeviceCommand } from './safety';

// In-memory session store (use Redis/Firestore for production)
const sessions: Map<string, ChartSyncSession> = new Map();

// Seeded random number generator (deterministic)
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Simple LCG PRNG
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  // Random float in range
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  // Random integer in range (inclusive)
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

/**
 * Generate deterministic seed from session identifiers
 */
function generateSeed(sessionStateId: string, tokenMint: string, startTime: number): number {
  const str = `${sessionStateId}:${tokenMint}:${Math.floor(startTime / 60000)}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate randomized mode parameters using seeded RNG
 * Lowered caps for better sensitivity to meme coin volatility
 */
function generateModeParams(rng: SeededRandom, modeId: number): ModeParams {
  // Base params with randomized thresholds - LOWERED for meme coins
  const params: ModeParams = {
    trendCap: rng.range(0.003, 0.010),      // 0.3% - 1.0% (was 0.8-2.2%)
    chopCap: rng.range(0.005, 0.020),       // 0.5% - 2.0% (was 1.5-4.0%)
    accelCap: rng.range(0.002, 0.008),      // 0.2% - 0.8% (was 0.6-2.0%)
    devCap: rng.range(0.005, 0.020),        // 0.5% - 2.0% (was 1.0-4.0%)
    liqDropCap: rng.range(0.03, 0.15),      // 3% - 15% (was 5-20%)
    weightTrend: rng.range(0.5, 0.75),      // For Mode 1 (was 0.6-0.85)
    weightChop: 0,                           // Computed below
    emaN: rng.int(2, 4)                     // EMA window (was 3-5)
  };

  params.weightChop = 1 - params.weightTrend;

  // Mode-specific adjustments
  switch (modeId) {
    case 2: // Chop Monster - lower chop cap for more sensitivity
      params.chopCap = rng.range(0.004, 0.015);
      break;
    case 3: // Momentum Bursts - tune accel cap
      params.accelCap = rng.range(0.002, 0.008);
      break;
    case 5: // Liquidity Panic - tune liq drop cap
      params.liqDropCap = rng.range(0.03, 0.12);
      break;
  }

  console.log('[ModeParams] Generated:', {
    trendCap: params.trendCap.toFixed(4),
    chopCap: params.chopCap.toFixed(4),
    accelCap: params.accelCap.toFixed(4),
    devCap: params.devCap.toFixed(4)
  });

  return params;
}

/**
 * Create a new chart sync session
 */
export function createSession(config: SessionConfig): ChartSyncSession {
  const startTime = config.startTime || Date.now();
  const seed = generateSeed(config.sessionStateId, config.tokenMint, startTime);
  const rng = new SeededRandom(seed);

  // Start with Trend Rider as default - will be dynamically updated based on chart data
  const modeId = 1;

  // Generate mode parameters (randomized thresholds for variety)
  const modeParams = generateModeParams(rng, modeId);

  const session: ChartSyncSession = {
    sessionId: `${config.sessionStateId}-${startTime}`,
    tokenMint: config.tokenMint,
    startTime,
    endTime: startTime + SESSION_DURATION_MS,
    modeId,
    modeParams,
    seed,
    lastSpeed: 40,      // Starting defaults - higher for immediate activity
    lastAmplitude: 25,
    boosterStep: 0,
    candleBuffer: [],
    isActive: true
  };

  // Store session
  sessions.set(session.sessionId, session);

  console.log(`[ChartSync] Session created:`, {
    sessionId: session.sessionId,
    initialMode: getModeName(modeId),
    note: 'Mode will adapt dynamically based on chart conditions',
    duration: '10 minutes',
    seed
  });

  return session;
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): ChartSyncSession | undefined {
  return sessions.get(sessionId);
}

/**
 * Get active session for a token
 */
export function getActiveSessionForToken(tokenMint: string): ChartSyncSession | undefined {
  for (const session of sessions.values()) {
    if (session.tokenMint === tokenMint && session.isActive) {
      return session;
    }
  }
  return undefined;
}

/**
 * Check if session has expired
 */
export function isSessionExpired(session: ChartSyncSession): boolean {
  return Date.now() >= session.endTime;
}

/**
 * End a session
 */
export function endSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.isActive = false;
    console.log(`[ChartSync] Session ended: ${sessionId}`);
  }
}

/**
 * Process a session tick - the main computation loop
 * Called every 60 seconds
 */
export async function processSessionTick(sessionId: string): Promise<DeviceCommand | null> {
  const session = sessions.get(sessionId);

  if (!session) {
    console.error(`[ChartSync] Session not found: ${sessionId}`);
    return null;
  }

  // Check if session has expired
  if (isSessionExpired(session)) {
    console.log(`[ChartSync] Session expired: ${sessionId}`);
    endSession(sessionId);
    return { speed: 0, minY: 50, maxY: 50 }; // Stop command
  }

  try {
    // 1. Fetch latest candle data
    const newCandles = await fetchCandles(session.tokenMint);

    if (newCandles.length > 0) {
      // Update buffer
      session.candleBuffer = updateBuffer(session.candleBuffer, newCandles[0], BUFFER_SIZE);
    }

    // 2. Compute derived metrics
    const prevVolume = session.candleBuffer.length > 1
      ? session.candleBuffer[session.candleBuffer.length - 2].volume
      : undefined;
    const metrics = computeMetrics(session.candleBuffer, prevVolume);

    // Log raw metrics for debugging
    console.log('[ChartSync] Raw metrics:', {
      trend: metrics.trend.toFixed(5),
      chop: metrics.chop.toFixed(5),
      accel: metrics.accel.toFixed(5),
      deviation: metrics.deviation.toFixed(5),
      liqDrop: metrics.liqDrop.toFixed(5),
      bufferSize: session.candleBuffer.length
    });

    // 3. Dynamically select mode based on current chart conditions
    const selectedModeId = selectModeFromMetrics(metrics, session.modeParams);
    session.modeId = selectedModeId; // Update session's current mode

    // 4. Compute mode output using the dynamically selected mode
    const modeResult = computeMode(selectedModeId, metrics, session.modeParams);

    // 5. Apply booster if needed
    const boosterResult = applyBooster(
      modeResult.intensity,
      modeResult.speed,
      modeResult.amplitude,
      session.boosterStep
    );
    session.boosterStep = boosterResult.newStep;

    // 6. Apply safety pipeline
    const safetyResult = applySafetyPipeline(
      boosterResult.speed,
      boosterResult.amplitude,
      session.lastSpeed,
      session.lastAmplitude,
      false // anti-bored floor disabled (booster handles this)
    );

    // 7. Update session state
    session.lastSpeed = safetyResult.speed;
    session.lastAmplitude = safetyResult.amplitude;

    // 8. Create device command
    const command = createDeviceCommand(safetyResult);

    // Log tick details
    const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
    console.log(`[ChartSync] Tick @ ${elapsed}s:`, {
      mode: getModeName(selectedModeId),
      style: modeResult.style,
      intensity: modeResult.intensity.toFixed(3),
      booster: boosterResult.wasApplied ? getBoosterPatternName(session.boosterStep) : 'off',
      limited: safetyResult.wasLimited,
      command
    });

    return command;

  } catch (error) {
    console.error(`[ChartSync] Tick error:`, error);
    // Return safe default on error
    return {
      speed: Math.max(20, session.lastSpeed - 10),
      minY: 40,
      maxY: 60
    };
  }
}

/**
 * Get session status
 */
export function getSessionStatus(sessionId: string): {
  exists: boolean;
  isActive: boolean;
  elapsed?: number;
  remaining?: number;
  mode?: string;
  lastCommand?: { speed: number; amplitude: number };
} {
  const session = sessions.get(sessionId);

  if (!session) {
    return { exists: false, isActive: false };
  }

  const now = Date.now();
  const elapsed = Math.floor((now - session.startTime) / 1000);
  const remaining = Math.max(0, Math.floor((session.endTime - now) / 1000));

  return {
    exists: true,
    isActive: session.isActive && !isSessionExpired(session),
    elapsed,
    remaining,
    mode: getModeName(session.modeId),
    lastCommand: {
      speed: session.lastSpeed,
      amplitude: session.lastAmplitude
    }
  };
}

/**
 * Clean up expired sessions
 */
export function cleanupExpiredSessions(): number {
  let cleaned = 0;
  for (const [sessionId, session] of sessions) {
    if (!session.isActive || isSessionExpired(session)) {
      sessions.delete(sessionId);
      cleaned++;
    }
  }
  return cleaned;
}

/**
 * Get all active sessions (for debugging)
 */
export function getAllActiveSessions(): ChartSyncSession[] {
  return Array.from(sessions.values()).filter(s => s.isActive && !isSessionExpired(s));
}
