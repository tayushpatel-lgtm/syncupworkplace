'use client';

import { useEffect } from 'react';
import { CLOCK_STAY_EVENT } from '../lib/clockTick';

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
      event.returnValue = 'Leave site?';
      const stay = () => window.dispatchEvent(new Event(CLOCK_STAY_EVENT));
      window.addEventListener('focus', stay, { once: true, capture: true });
      window.addEventListener('mousemove', stay, { once: true, capture: true });
      document.addEventListener('visibilitychange', stay, { once: true });
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
