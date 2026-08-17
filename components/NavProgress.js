'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { NAV_PROGRESS_START, startNavProgress } from '../lib/navProgress';

// Not every trigger changes the URL (router.refresh() doesn't), so this is
// the backstop that guarantees the bar never sticks on.
const SAFETY_MS = 1500;

/** A thin top-of-page bar that shows while a navigation or a refresh is in flight. */
export default function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const timeoutRef = useRef(null);
  const urlKeyRef = useRef(`${pathname}?${searchParams.toString()}`);

  // The URL just landed — whatever navigation was in flight is done.
  useEffect(() => {
    const key = `${pathname}?${searchParams.toString()}`;
    if (urlKeyRef.current !== key) {
      urlKeyRef.current = key;
      setActive(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    function onStart() {
      setActive(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setActive(false), SAFETY_MS);
    }
    window.addEventListener(NAV_PROGRESS_START, onStart);
    return () => window.removeEventListener(NAV_PROGRESS_START, onStart);
  }, []);

  // Catches sidebar/tab <Link> clicks directly, without every page needing
  // to call startNavProgress itself.
  useEffect(() => {
    function onClick(e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target.closest('a');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || /^https?:\/\//i.test(href)) return;

      const dest = new URL(href, window.location.href);
      if (dest.pathname === window.location.pathname && dest.search === window.location.search) return;
      startNavProgress();
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return <div className={`nav-progress${active ? ' on' : ''}`} aria-hidden="true" />;
}
