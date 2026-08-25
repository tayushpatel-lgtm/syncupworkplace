let worker = null;
let fallbackId = null;
let refs = 0;
let stayPending = false;
let lastTickAt = 0;
let resuming = false;
const listeners = new Set();

export const CLOCK_STAY_EVENT = 'syncup:stay';

function notify(now) {
  lastTickAt = now;
  listeners.forEach((fn) => fn(now));
}

function onWorkerMessage(event) {
  notify(typeof event.data === 'number' ? event.data : Date.now());
}

function catchUp() {
  notify(Date.now());
}

function stopFallback() {
  clearInterval(fallbackId);
  fallbackId = null;
}

function startFallback() {
  stopFallback();
  fallbackId = setInterval(() => notify(Date.now()), 1000);
}

function stopWorker() {
  if (!worker) return;
  worker.removeEventListener('message', onWorkerMessage);
  try {
    worker.postMessage({ type: 'stop' });
    worker.terminate();
  } catch {
    /* worker already gone */
  }
  worker = null;
}

function startWorker() {
  stopWorker();
  const Ctor = globalThis.Worker;
  if (typeof Ctor !== 'function' || typeof location === 'undefined') return;
  try {
    // Avoid `new Worker('/…')` — Next/Turbopack intercepts that and can
    // crash the test server looking for a file at the filesystem root.
    worker = new Ctor(new URL('/clock.worker.js', location.origin).href);
    worker.addEventListener('message', onWorkerMessage);
    worker.postMessage({ type: 'start' });
  } catch {
    worker = null;
  }
}

/** Chrome kills intervals after the close-tab dialog is cancelled. Rebuild tickers. */
export function resumeClockTicks() {
  if (typeof window === 'undefined' || refs <= 0 || resuming) return;
  resuming = true;
  stayPending = false;
  startWorker();
  startFallback();
  catchUp();
  window.dispatchEvent(new Event(CLOCK_STAY_EVENT));
  resuming = false;
}

function onBeforeUnload() {
  stayPending = true;
}

function onMaybeResume() {
  if (stayPending || Date.now() - lastTickAt > 1500) resumeClockTicks();
}

function bindStayListeners() {
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('pointerdown', onMaybeResume, true);
  window.addEventListener('keydown', onMaybeResume, true);
  window.addEventListener('mousemove', onMaybeResume, true);
  window.addEventListener('mouseover', onMaybeResume, true);
  window.addEventListener('focus', onMaybeResume, true);
  document.addEventListener('visibilitychange', onMaybeResume);
  window.addEventListener('pageshow', onMaybeResume);
}

function unbindStayListeners() {
  window.removeEventListener('beforeunload', onBeforeUnload);
  window.removeEventListener('pointerdown', onMaybeResume, true);
  window.removeEventListener('keydown', onMaybeResume, true);
  window.removeEventListener('mousemove', onMaybeResume, true);
  window.removeEventListener('mouseover', onMaybeResume, true);
  window.removeEventListener('focus', onMaybeResume, true);
  document.removeEventListener('visibilitychange', onMaybeResume);
  window.removeEventListener('pageshow', onMaybeResume);
}

/** 1s ticks from clock.worker.js, with a main-thread fallback after a cancelled close. */
export function subscribeClockTick(onTick) {
  if (typeof window === 'undefined') return () => {};

  listeners.add(onTick);
  refs += 1;

  if (refs === 1) {
    lastTickAt = Date.now();
    startWorker();
    startFallback();
    bindStayListeners();
  }

  onTick(Date.now());

  return () => {
    listeners.delete(onTick);
    refs -= 1;
    if (refs > 0) return;
    unbindStayListeners();
    stopFallback();
    stopWorker();
  };
}

export function formatWallClock(now, timezone = 'Asia/Kolkata') {
  const date = now instanceof Date ? now : new Date(now);
  try {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: timezone,
    });
  } catch {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }
}
