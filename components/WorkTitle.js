'use client';

import { useEffect, useState } from 'react';

const APP_TITLE = 'Syncup Workspace';

function formatWorkClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Puts recorded work time in the browser tab title (next to the favicon). */
export default function WorkTitle({ workMinutes = 0, running = null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (running?.kind !== 'WORK') {
      setElapsed(0);
      return undefined;
    }
    const from = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - from) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running?.kind, running?.startedAt]);

  const workSeconds = workMinutes * 60 + (running?.kind === 'WORK' ? elapsed : 0);
  const showClock = workSeconds > 0 || !!running;
  const stamp = formatWorkClock(workSeconds);

  useEffect(() => {
    document.title = showClock ? `${stamp} · ${APP_TITLE}` : APP_TITLE;
  }, [showClock, stamp]);

  useEffect(
    () => () => {
      document.title = APP_TITLE;
    },
    [],
  );

  return null;
}
