'use client';

import { useEffect } from 'react';
import { subscribeClockTick } from '../lib/clockTick';

const APP_TITLE = 'Syncup Workspace';

function formatWorkClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function writeTitle(workMinutes, elapsed, running) {
  const workSeconds = workMinutes * 60 + (running?.kind === 'WORK' ? elapsed : 0);
  const showClock = workSeconds > 0 || !!running;
  const next = showClock ? `${formatWorkClock(workSeconds)} · ${APP_TITLE}` : APP_TITLE;
  // Chrome sometimes keeps the old tab label after a cancelled close unless
  // the title string actually changes twice.
  if (document.title === next) document.title = `${next}\u200b`;
  document.title = next;
}

/** Puts recorded work time in the browser tab title (next to the favicon). */
export default function WorkTitle({ workMinutes = 0, running = null }) {
  useEffect(() => {
    if (running?.kind !== 'WORK') {
      writeTitle(workMinutes, 0, running);
      return undefined;
    }

    const from = Date.now();
    return subscribeClockTick((now) => {
      writeTitle(workMinutes, Math.floor((now - from) / 1000), running);
    });
  }, [workMinutes, running?.kind, running?.startedAt]);

  useEffect(
    () => () => {
      document.title = APP_TITLE;
    },
    [],
  );

  return null;
}
