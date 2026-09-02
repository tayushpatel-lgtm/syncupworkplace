'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from '../lib/useRouter';
import { pingHeartbeatNow, subscribeHeartbeat } from '../lib/clockTick';
import { SESSION_WAKE_EVENT, dispatchSessionStopped } from '../lib/sessionPulse';

const SessionPulseContext = createContext({
  lastBeatAt: null,
  lastBeatAgeSec: null,
  clockStopped: false,
  clearClockStopped: () => {},
});

export function useSessionPulse() {
  return useContext(SessionPulseContext);
}

export function formatBeatAge(sec) {
  if (sec == null) return '';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

/** Keeps the session heartbeat alive on every signed-in page (not just My day). */
export default function SessionPulse({ running, children }) {
  const router = useRouter();
  const [lastBeatAt, setLastBeatAt] = useState(null);
  const [clockStopped, setClockStopped] = useState(false);
  const [, setAgeTick] = useState(0);

  const clearClockStopped = useCallback(() => setClockStopped(false), []);

  useEffect(() => {
    if (!running) {
      setLastBeatAt(null);
      return undefined;
    }
    setClockStopped(false);
    pingHeartbeatNow();
    return subscribeHeartbeat((result) => {
      if (result.ok !== false) setLastBeatAt(Date.now());
      if (result.running === false) {
        setClockStopped(true);
        dispatchSessionStopped();
        router.refresh();
      }
    });
  }, [running?.kind, running?.startedAt, router]);

  useEffect(() => {
    if (!running) return undefined;
    const onWake = () => router.refresh();
    window.addEventListener(SESSION_WAKE_EVENT, onWake);
    return () => window.removeEventListener(SESSION_WAKE_EVENT, onWake);
  }, [running?.kind, running?.startedAt, router]);

  useEffect(() => {
    if (!running || !lastBeatAt) return undefined;
    const id = setInterval(() => setAgeTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [running, lastBeatAt]);

  const lastBeatAgeSec = lastBeatAt ? Math.floor((Date.now() - lastBeatAt) / 1000) : null;

  return (
    <SessionPulseContext.Provider value={{ lastBeatAt, lastBeatAgeSec, clockStopped, clearClockStopped }}>
      {children}
    </SessionPulseContext.Provider>
  );
}
