'use client';

import { useEffect, useState } from 'react';
import { formatWallClock, subscribeClockTick } from '../lib/clockTick';

export default function LiveClock({ timezone = 'Asia/Kolkata' }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    return subscribeClockTick((now) => setTime(formatWallClock(now, timezone)));
  }, [timezone]);

  return (
    <time className="live-clock" dateTime={time} aria-label="Current time">
      {time || '\u00a0'}
    </time>
  );
}
