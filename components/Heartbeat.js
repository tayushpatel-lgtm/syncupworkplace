'use client';

import { useEffect } from 'react';

const HEARTBEAT_MS = 60_000;

export default function Heartbeat() {
  useEffect(() => {
    const beat = () => {
      fetch('/api/day/heartbeat', { method: 'POST', keepalive: true }).catch(() => {});
    };

    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}