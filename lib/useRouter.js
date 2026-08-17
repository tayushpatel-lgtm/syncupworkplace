'use client';

import { useRouter as useNextRouter } from 'next/navigation';
import { useMemo } from 'react';
import { startNavProgress } from './navProgress';

/**
 * Drop-in replacement for next/navigation's useRouter. push/replace/refresh
 * give no signal of their own that the screen is about to change, so this
 * flashes the top progress bar around them — see components/NavProgress.js,
 * which is what actually clears it once the new screen has landed.
 */
export function useRouter() {
  const router = useNextRouter();
  return useMemo(
    () => ({
      ...router,
      push: (...args) => {
        startNavProgress();
        return router.push(...args);
      },
      replace: (...args) => {
        startNavProgress();
        return router.replace(...args);
      },
      refresh: (...args) => {
        startNavProgress();
        return router.refresh(...args);
      },
    }),
    [router],
  );
}
