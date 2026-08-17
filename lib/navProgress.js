export const NAV_PROGRESS_START = 'syncup:nav-progress-start';

/**
 * Flashes the global top progress bar (components/NavProgress.js). Call this
 * before a navigation or a router.refresh() — neither gives any other signal
 * that the screen is about to change, which is what makes a slow one feel
 * like the app has frozen.
 */
export function startNavProgress() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NAV_PROGRESS_START));
}
