export interface StateQueueItem {
  id: string;
  tokenMint: string;
  walletAddress: string;
  isPriority: boolean;
  priorityLevel: number;
  displayDuration: number;
  position: number;
  expiresAt: number | null;
}

export interface DeviceSessionState {
  tokenMint: string;
  mode: string;
  modeId: number;
  speed: number;
  amplitude: number;
  updatedAt: number;
}

export interface DeviceCooldownState {
  active: boolean;
  remainingMs: number;
  totalMs: number;
  endsAt: number | null;
}

export interface DeviceStateSnapshot {
  connected: boolean;
  state: 'disabled' | 'disconnected' | 'idle' | 'waiting' | 'cooldown' | 'active' | 'unknown';
  session: DeviceSessionState | null;
  cooldown: DeviceCooldownState | null;
}

export interface AppStateSnapshot {
  version: number;
  source: string;
  updatedAt: number;
  currentToken: string;
  currentItem: StateQueueItem | null;
  queue: StateQueueItem[];
  device: DeviceStateSnapshot;
}

