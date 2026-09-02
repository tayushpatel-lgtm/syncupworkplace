import { dispatchSessionWake } from './sessionPulse';

/** Session keep-alive interval — scheduled in clock.worker.js, not on the main thread. */
export const HEARTBEAT_MS = 60_000;

let worker = null;
let fallbackTickId = null;
let fallbackHeartbeatId = null;
let tickRefs = 0;
let heartbeatRefs = 0;
let stayPending = false;
let lastTickAt = 0;
let resuming = false;
const tickListeners = new Set();
const heartbeatListeners = new Set();

export const CLOCK_STAY_EVENT = 'syncup:stay';

function active() {
  return tickRefs > 0 || heartbeatRefs > 0;
}

function notifyTick(now) {
  lastTickAt = now;
  tickListeners.forEach((fn) => fn(now));
}

function notifyHeartbeat(result) {
  heartbeatListeners.forEach((fn) => fn(result));
}

function onWorkerMessage(event) {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'tick') notifyTick(data.now ?? Date.now());
  else if (data.type === 'heartbeat') notifyHeartbeat(data);
}

function syncWorker() {
  if (!worker) return;
  worker.postMessage({
    type: 'configure',
    tick: tickRefs > 0,
    heartbeat: heartbeatRefs > 0,
    heartbeatMs: HEARTBEAT_MS,
  });
}

function stopFallback() {
  clearInterval(fallbackTickId);
  clearInterval(fallbackHeartbeatId);
  fallbackTickId = null;
  fallbackHeartbeatId = null;
}

async function fallbackBeat() {
  try {
    const res = await fetch('/api/day/heartbeat', {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    notifyHeartbeat({
      type: 'heartbeat',
      ok: res.ok,
      running: data.running !== false,
      reconciled: !!data.reconciled,
    });
  } catch {
    notifyHeartbeat({ type: 'heartbeat', ok: false, running: true });
  }
}

function startFallback() {
  stopFallback();
  if (tickRefs > 0) {
    fallbackTickId = setInterval(() => notifyTick(Date.now()), 1000);
  }
  if (heartbeatRefs > 0) {
    fallbackBeat();
    fallbackHeartbeatId = setInterval(fallbackBeat, HEARTBEAT_MS);
  }
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
  if (typeof Ctor !== 'function' || typeof location === 'undefined') return false;
  try {
    // Avoid `new Worker('/…')` — Next/Turbopack intercepts that and can
    // crash the test server looking for a file at the filesystem root.
    worker = new Ctor(new URL('/clock.worker.js', location.origin).href);
    worker.addEventListener('message', onWorkerMessage);
    syncWorker();
    return true;
  } catch {
    worker = null;
    return false;
  }
}

function ensureRunning() {
  const hasWorker = startWorker();
  if (!hasWorker) startFallback();
  else stopFallback();
}

function catchUp() {
  if (tickRefs > 0) notifyTick(Date.now());
}

/** Chrome kills intervals after the close-tab dialog is cancelled. Rebuild tickers. */
export function resumeClockTicks() {
  if (typeof window === 'undefined' || !active() || resuming) return;
  resuming = true;
  stayPending = false;
  ensureRunning();
  catchUp();
  window.dispatchEvent(new Event(CLOCK_STAY_EVENT));
  resuming = false;
}

function onBeforeUnload() {
  stayPending = true;
}

function onStayInput() {
  if (stayPending || Date.now() - lastTickAt > 1500) resumeClockTicks();
}

/** Tab return only — not mousemove (that was re-fetching the whole page on every move). */
function onTabWake() {
  onStayInput();
  if (heartbeatRefs > 0 && document.visibilityState === 'visible') {
    pingHeartbeatNow();
    dispatchSessionWake();
  }
}

function bindStayListeners() {
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('pointerdown', onStayInput, true);
  window.addEventListener('keydown', onStayInput, true);
  window.addEventListener('mousemove', onStayInput, true);
  window.addEventListener('mouseover', onStayInput, true);
  window.addEventListener('focus', onStayInput, true);
  document.addEventListener('visibilitychange', onTabWake);
  window.addEventListener('pageshow', onTabWake);
}

function unbindStayListeners() {
  window.removeEventListener('beforeunload', onBeforeUnload);
  window.removeEventListener('pointerdown', onStayInput, true);
  window.removeEventListener('keydown', onStayInput, true);
  window.removeEventListener('mousemove', onStayInput, true);
  window.removeEventListener('mouseover', onStayInput, true);
  window.removeEventListener('focus', onStayInput, true);
  document.removeEventListener('visibilitychange', onTabWake);
  window.removeEventListener('pageshow', onTabWake);
}

function startSession() {
  lastTickAt = Date.now();
  ensureRunning();
  bindStayListeners();
}

function stopSession() {
  unbindStayListeners();
  stopFallback();
  stopWorker();
}

/** 1s display ticks from clock.worker.js (main-thread fallback if the worker cannot start). */
export function subscribeClockTick(onTick) {
  if (typeof window === 'undefined') return () => {};

  tickListeners.add(onTick);
  tickRefs += 1;

  if (tickRefs === 1 && heartbeatRefs === 0) startSession();
  else if (tickRefs === 1) syncWorker();

  onTick(Date.now());

  return () => {
    tickListeners.delete(onTick);
    tickRefs -= 1;
    if (active()) {
      syncWorker();
      if (!worker) startFallback();
      return;
    }
    stopSession();
  };
}

/**
 * Session heartbeat from clock.worker.js (fetch runs in the worker so background
 * tabs are not throttled as aggressively). Main-thread fallback if no worker.
 */
export function subscribeHeartbeat(onBeat) {
  if (typeof window === 'undefined') return () => {};

  heartbeatListeners.add(onBeat);
  heartbeatRefs += 1;

  if (heartbeatRefs === 1 && tickRefs === 0) startSession();
  else if (heartbeatRefs === 1) syncWorker();

  return () => {
    heartbeatListeners.delete(onBeat);
    heartbeatRefs -= 1;
    if (active()) {
      syncWorker();
      if (!worker) startFallback();
      return;
    }
    stopSession();
  };
}

/** Fire an immediate heartbeat (e.g. on tab wake) without waiting for the interval. */
export function pingHeartbeatNow() {
  if (worker) {
    try {
      worker.postMessage({ type: 'ping-heartbeat' });
      return;
    } catch {
      /* worker gone — fall through */
    }
  }
  if (heartbeatRefs > 0) fallbackBeat();
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
