'use client';

import { useEffect } from 'react';

let bypass = false;
let armed = false;

/** Call before a deliberate leave (sign out) so the browser does not prompt. */
export function bypassUnloadGuard() {
  bypass = true;
}

export function restoreUnloadGuard() {
  bypass = false;
}

/**
 * Turn the native close-tab prompt on or off immediately, without waiting
 * for a server refresh. Armed while a WORK/BREAK session is counting;
 * disarmed before check-in and after check-out.
 */
export function setUnloadGuardArmed(value) {
  armed = !!value;
}

/**
 * Native "Leave site?" / "Changes you made may not be saved" dialog when
 * closing the tab. Pages cannot style it or change its copy. Chrome/Edge
 * only show it after the person has clicked or typed on the page.
 */
export default function UnloadGuard({ running = false }) {
  useEffect(() => {
    armed = !!running;
  }, [running]);

  useEffect(() => {
    bypass = false;

    const onBeforeUnload = (event) => {
      if (bypass || !armed) return undefined;
      event.preventDefault();
      // Must be a non-empty string. An empty string is ignored by some
      // browsers, which is why an earlier handler never produced a dialog.
      event.returnValue = 'Leave site?';
      return 'Leave site?';
    };

    const onPageHide = () => {
      if (bypass || !armed) return;
      fetch('/api/day/heartbeat', { method: 'POST', keepalive: true }).catch(() => {});
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    window.onbeforeunload = onBeforeUnload;

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      if (window.onbeforeunload === onBeforeUnload) window.onbeforeunload = null;
    };
  }, []);

  return null;
}
