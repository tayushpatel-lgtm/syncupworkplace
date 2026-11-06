'use client';

import { useEffect, useState } from 'react';
import { dayKey } from '../lib/dates';
import { WAR_ROOM, timeLeft } from '../lib/warRoom';
import { Icon } from './Icons';

const SEEN_KEY = 'syncup:war-room-seen';

const pad = (n) => String(n).padStart(2, '0');

function Countdown({ left, size }) {
  const units = [
    ['days', left.days],
    ['hrs', left.hours],
    ['min', left.minutes],
    ['sec', left.seconds],
  ];
  return (
    <div className={`war-count war-count-${size}`} role="timer" aria-live="off">
      {units.map(([label, n]) => (
        <div key={label} className="war-unit">
          <b>{label === 'days' ? n : pad(n)}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function Targets({ size }) {
  return (
    <div className={`war-targets war-targets-${size}`}>
      {WAR_ROOM.targets.map((t) => (
        <div key={t.label} className="war-target">
          <b>{t.value}</b>
          <span>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Morning popup (first visit of each day) plus a countdown card that stays
 * on the right of every signed-in screen until the deadline.
 */
export default function WarRoom() {
  const [now, setNow] = useState(null);
  const [popup, setPopup] = useState(false);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!WAR_ROOM.enabled) return;
    try {
      if (localStorage.getItem(SEEN_KEY) !== dayKey()) setPopup(true);
    } catch {
      setPopup(true);
    }
  }, []);

  useEffect(() => {
    if (!popup) return;
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popup]);

  function close() {
    try {
      localStorage.setItem(SEEN_KEY, dayKey());
    } catch {
      /* private mode: popup just shows again next load */
    }
    setPopup(false);
  }

  if (!WAR_ROOM.enabled || now === null) return null;
  const left = timeLeft(now);

  return (
    <>
      <aside className="war-rail" aria-label="War room target">
        <div className="war-rail-card" onClick={() => setPopup(true)} title="Open war room">
          <div className="war-kicker">
            <span className="war-dot" /> {WAR_ROOM.title}
          </div>
          <Targets size="sm" />
          <div className="war-by">
            {left.done ? 'Deadline reached' : `by ${WAR_ROOM.deadlineLabel}`}
          </div>
          <Countdown left={left} size="sm" />
        </div>
      </aside>

      {popup && (
        <div className="modal-overlay war-overlay" onClick={close}>
          <div
            className="war-modal"
            role="dialog"
            aria-modal="true"
            aria-label={WAR_ROOM.title}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="btn-icon war-close" onClick={close} aria-label="Close">
              <Icon.close />
            </button>
            <div className="war-kicker">
              <span className="war-dot" /> {WAR_ROOM.title} mode
            </div>
            <h2>Our targets are clear</h2>
            <Targets size="lg" />
            <p className="war-by">
              {left.done ? 'The deadline has passed.' : `Deadline: ${WAR_ROOM.deadlineLabel}`}
            </p>
            <Countdown left={left} size="lg" />
            <button type="button" className="btn btn-primary war-go" onClick={close}>
              Let&apos;s go
            </button>
          </div>
        </div>
      )}
    </>
  );
}
