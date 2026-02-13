import { FieldValue, getAdminDb } from '@/lib/firebase-admin';
import { AUTOBLOW_ENABLED, DEFAULT_TOKEN_MINT } from '@/lib/constants';
import {
  AppStateSnapshot,
  DeviceCooldownState,
  DeviceSessionState,
  DeviceStateSnapshot,
  StateQueueItem,
} from '@/lib/state';

type StateListener = (snapshot: AppStateSnapshot) => void;

const STATE_SNAPSHOT_DOC = 'settings/stateSnapshot';
const CURRENT_TOKEN_DOC = 'settings/currentToken';
const DEVICE_SESSION_DOC = 'settings/deviceSession';
const QUEUE_COLLECTION = 'queue';
const SESSION_COOLDOWN_MS = 10000;

const REFRESH_THROTTLE_MS = 750;
const DEFAULT_PERSIST_DEBOUNCE_MS = 1000;

function parseTimestamp(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as {
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
    };
    if (typeof maybeTimestamp.toMillis === 'function') {
      return maybeTimestamp.toMillis();
    }
    if (typeof maybeTimestamp.seconds === 'number') {
      const nanos = typeof maybeTimestamp.nanoseconds === 'number' ? maybeTimestamp.nanoseconds : 0;
      return maybeTimestamp.seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
  }
  return null;
}

function persistDebounceMs(): number {
  const value = Number(process.env.STATE_SNAPSHOT_WRITE_DEBOUNCE_MS || DEFAULT_PERSIST_DEBOUNCE_MS);
  if (!Number.isFinite(value)) return DEFAULT_PERSIST_DEBOUNCE_MS;
  return Math.min(2000, Math.max(500, Math.floor(value)));
}

function emptyDeviceState(): DeviceStateSnapshot {
  if (!AUTOBLOW_ENABLED) {
    return {
      connected: false,
      state: 'disabled',
      session: null,
      cooldown: null,
    };
  }

  return {
    connected: true,
    state: 'idle',
    session: null,
    cooldown: null,
  };
}

function createEmptyState(source: string): AppStateSnapshot {
  return {
    version: 1,
    source,
    updatedAt: Date.now(),
    currentToken: DEFAULT_TOKEN_MINT,
    currentItem: null,
    queue: [],
    device: emptyDeviceState(),
  };
}

interface StateStoreData {
  snapshot: AppStateSnapshot;
  listeners: Set<StateListener>;
  refreshPromise: Promise<AppStateSnapshot> | null;
  lastRefreshAt: number;
  persistTimer: ReturnType<typeof setTimeout> | null;
  lastPersistedHash: string | null;
}

declare global {
  var __machineGoBrrrStateStore: StateStoreData | undefined;
}

function getStore(): StateStoreData {
  if (!global.__machineGoBrrrStateStore) {
    global.__machineGoBrrrStateStore = {
      snapshot: createEmptyState('boot'),
      listeners: new Set<StateListener>(),
      refreshPromise: null,
      lastRefreshAt: 0,
      persistTimer: null,
      lastPersistedHash: null,
    };
  }

  return global.__machineGoBrrrStateStore;
}

function stableSnapshotHash(snapshot: AppStateSnapshot): string {
  return JSON.stringify({
    version: snapshot.version,
    currentToken: snapshot.currentToken,
    currentItem: snapshot.currentItem,
    queue: snapshot.queue,
    device: snapshot.device,
  });
}

async function persistSnapshotDebounced(snapshot: AppStateSnapshot): Promise<void> {
  const store = getStore();
  const snapshotHash = stableSnapshotHash(snapshot);
  if (store.lastPersistedHash === snapshotHash) {
    return;
  }

  if (store.persistTimer) {
    clearTimeout(store.persistTimer);
  }

  store.persistTimer = setTimeout(async () => {
    try {
      const db = getAdminDb();
      await db.doc(STATE_SNAPSHOT_DOC).set(
        {
          ...snapshot,
          persistedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      store.lastPersistedHash = snapshotHash;
    } catch (error) {
      console.error('[StateStore] Failed to persist snapshot:', error);
    }
  }, persistDebounceMs());
}

function notifyListeners(snapshot: AppStateSnapshot): void {
  const store = getStore();
  for (const listener of store.listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('[StateStore] Listener error:', error);
    }
  }
}

async function buildStateFromFirestore(source: string): Promise<AppStateSnapshot> {
  const db = getAdminDb();
  const now = Date.now();

  const [currentDoc, queueSnapshot, deviceSessionDoc] = await Promise.all([
    db.doc(CURRENT_TOKEN_DOC).get(),
    db.collection(QUEUE_COLLECTION).orderBy('position', 'asc').get(),
    db.doc(DEVICE_SESSION_DOC).get(),
  ]);

  const queue: StateQueueItem[] = queueSnapshot.docs.map((itemDoc) => {
    const data = itemDoc.data() as {
      tokenMint?: string;
      walletAddress?: string;
      isPriority?: boolean;
      priorityLevel?: number;
      displayDuration?: number;
      position?: number;
      expiresAt?: unknown;
    };

    return {
      id: itemDoc.id,
      tokenMint: data.tokenMint || '',
      walletAddress: data.walletAddress || '',
      isPriority: Boolean(data.isPriority),
      priorityLevel: data.priorityLevel || 0,
      displayDuration: data.displayDuration || 0,
      position: data.position || 0,
      expiresAt: parseTimestamp(data.expiresAt),
    };
  });

  const currentData = currentDoc.data() as {
    tokenMint?: string;
    queueItemId?: string | null;
    walletAddress?: string | null;
    isPriority?: boolean;
    priorityLevel?: number;
    displayDuration?: number;
    expiresAt?: unknown;
    sessionStarted?: boolean;
    activeAt?: unknown;
  } | undefined;

  const currentToken = currentData?.tokenMint || DEFAULT_TOKEN_MINT;
  const currentExpiresAt = parseTimestamp(currentData?.expiresAt);
  const currentItem: StateQueueItem | null = currentData?.queueItemId
    ? {
        id: currentData.queueItemId,
        tokenMint: currentToken,
        walletAddress: currentData.walletAddress || '',
        isPriority: Boolean(currentData.isPriority),
        priorityLevel: currentData.priorityLevel || 0,
        displayDuration: currentData.displayDuration || 0,
        position: -1,
        expiresAt: currentExpiresAt,
      }
    : null;

  const activeAt = parseTimestamp(currentData?.activeAt);
  const needsCooldown = Boolean(
    currentData?.queueItemId &&
      currentData?.sessionStarted === false &&
      activeAt
  );

  let cooldown: DeviceCooldownState | null = null;
  if (needsCooldown && activeAt) {
    const remainingMs = Math.max(0, SESSION_COOLDOWN_MS - (now - activeAt));
    cooldown = {
      active: remainingMs > 0,
      remainingMs,
      totalMs: SESSION_COOLDOWN_MS,
      endsAt: activeAt + SESSION_COOLDOWN_MS,
    };
  }

  const sessionData = deviceSessionDoc.data() as {
    tokenMint?: string;
    modeName?: string;
    modeId?: number;
    speed?: number;
    amplitude?: number;
    updatedAt?: unknown;
  } | undefined;

  const session: DeviceSessionState | null = sessionData
    ? {
        tokenMint: sessionData.tokenMint || currentToken,
        mode: sessionData.modeName || 'unknown',
        modeId: sessionData.modeId || 0,
        speed: sessionData.speed || 0,
        amplitude: sessionData.amplitude || 0,
        updatedAt: parseTimestamp(sessionData.updatedAt) || now,
      }
    : null;

  let device: DeviceStateSnapshot = emptyDeviceState();
  if (!AUTOBLOW_ENABLED) {
    device = emptyDeviceState();
  } else if (cooldown?.active) {
    device = {
      connected: true,
      state: 'cooldown',
      session,
      cooldown,
    };
  } else if (session) {
    device = {
      connected: true,
      state: session.speed > 15 ? 'active' : 'waiting',
      session,
      cooldown,
    };
  } else {
    device = {
      connected: true,
      state: 'idle',
      session: null,
      cooldown,
    };
  }

  return {
    version: 1,
    source,
    updatedAt: now,
    currentToken,
    currentItem,
    queue,
    device,
  };
}

function applySnapshot(snapshot: AppStateSnapshot): AppStateSnapshot {
  const store = getStore();
  const currentHash = stableSnapshotHash(store.snapshot);
  const nextHash = stableSnapshotHash(snapshot);

  if (currentHash === nextHash) {
    store.snapshot = {
      ...store.snapshot,
      source: snapshot.source,
      updatedAt: snapshot.updatedAt,
    };
    return store.snapshot;
  }

  store.snapshot = snapshot;
  void persistSnapshotDebounced(snapshot);
  notifyListeners(snapshot);
  return snapshot;
}

export async function refreshStateSnapshot(source: string, force: boolean = false): Promise<AppStateSnapshot> {
  const store = getStore();
  const now = Date.now();

  if (!force && now - store.lastRefreshAt < REFRESH_THROTTLE_MS) {
    return store.snapshot;
  }

  if (store.refreshPromise && !force) {
    return store.refreshPromise;
  }

  store.refreshPromise = (async () => {
    const next = await buildStateFromFirestore(source);
    store.lastRefreshAt = Date.now();
    return applySnapshot(next);
  })();

  try {
    return await store.refreshPromise;
  } finally {
    store.refreshPromise = null;
  }
}

export function getStateSnapshot(): AppStateSnapshot {
  return getStore().snapshot;
}

export function subscribeStateSnapshot(listener: StateListener): () => void {
  const store = getStore();
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}
