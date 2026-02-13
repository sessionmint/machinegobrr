'use client';

import { useEffect, useRef, useState } from 'react';

interface LoadingSessionOverlayProps {
  onComplete: () => void;
  duration?: number;
}

export function LoadingSessionOverlay({
  onComplete,
  duration = 10000,
}: LoadingSessionOverlayProps) {
  const [startedAt] = useState(() => Date.now());
  const completedRef = useRef(false);
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 200);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (completedRef.current) return;
    if (now - startedAt < duration) return;

    completedRef.current = true;
    onComplete();
  }, [duration, now, onComplete, startedAt]);

  const remainingMs = Math.max(0, duration - (now - startedAt));
  const countdown = Math.ceil(remainingMs / 1000);

  return (
    <div className="loading-session-overlay">
      <div className="loading-session-content">
        <div className="loading-session-spinner" />
        <h2 className="loading-session-title">MachineGoBrrr</h2>
        <p className="loading-session-message">Loading a new pump session...</p>
        <div className="loading-session-countdown">{countdown}</div>
        <p className="loading-session-subtitle">Device syncing in progress</p>
      </div>
    </div>
  );
}
