'use client';

import { useEffect, useState } from 'react';

export default function LiveClock({ timezone = 'Asia/Kolkata' }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    if (typeof Worker === 'undefined') return undefined;

    const worker = new Worker('/clock.worker.js');
    const onMessage = (event) => setTime(event.data);
    worker.addEventListener('message', onMessage);
    worker.postMessage({ type: 'start', timezone });

    return () => {
      worker.removeEventListener('message', onMessage);
      worker.postMessage({ type: 'stop' });
      worker.terminate();
    };
  }, [timezone]);

  return (
    <time className="live-clock" dateTime={time} aria-label="Current time">
      {time || '\u00a0'}
    </time>
  );
}
