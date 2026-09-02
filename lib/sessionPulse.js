/** Fired after a wake/reconcile heartbeat so pages can resync live clocks. */
export const SESSION_WAKE_EVENT = 'syncup:wake';

/** Fired when the server reports no open work/break session (idle stop, not checkout). */
export const SESSION_STOPPED_EVENT = 'syncup:session-stopped';

export function dispatchSessionStopped(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SESSION_STOPPED_EVENT, { detail }));
}

export function dispatchSessionWake(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SESSION_WAKE_EVENT, { detail }));
}
