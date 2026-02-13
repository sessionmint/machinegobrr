'use client';

import { useEffect, useRef, useState } from 'react';
import { AppStateSnapshot } from '@/lib/state';

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 10000;

interface StreamState {
  connected: boolean;
  snapshot: AppStateSnapshot | null;
  error: string | null;
}

function reconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** attempt);
}

export function useAppStateStream(enabled: boolean = true): StreamState {
  const [snapshot, setSnapshot] = useState<AppStateSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const loadInitialState = async () => {
      try {
        const response = await fetch('/api/state', { cache: 'default' });
        if (!response.ok) return;
        const next = (await response.json()) as AppStateSnapshot;
        if (!closed) {
          setSnapshot(next);
        }
      } catch {
        // noop
      }
    };

    const connect = () => {
      if (closed) return;

      source = new EventSource('/api/state/stream');

      source.addEventListener('open', () => {
        reconnectAttempts.current = 0;
        setConnected(true);
        setError(null);
      });

      source.addEventListener('state', (event) => {
        const message = event as MessageEvent<string>;
        try {
          const next = JSON.parse(message.data) as AppStateSnapshot;
          setSnapshot(next);
        } catch {
          // noop
        }
      });

      source.addEventListener('error', () => {
        setConnected(false);
        setError('State stream disconnected');
        if (source) {
          source.close();
          source = null;
        }

        if (closed) return;
        const delay = reconnectDelay(reconnectAttempts.current);
        reconnectAttempts.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      });
    };

    void loadInitialState();
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (source) source.close();
    };
  }, [enabled]);

  return { connected, snapshot, error };
}

