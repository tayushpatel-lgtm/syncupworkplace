'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../components/Icons';

export default function OnboardingChecklist({ name, steps, doneIds }) {
  const router = useRouter();
  const [done, setDone] = useState(new Set(doneIds));
  const [busy, setBusy] = useState(false);

  const remaining = steps.length - done.size;

  async function toggle(stepId, next) {
    const optimistic = new Set(done);
    if (next) optimistic.add(stepId);
    else optimistic.delete(stepId);
    setDone(optimistic);

    await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepId, done: next }),
    });
  }

  async function enter() {
    setBusy(true);
    router.push('/');
    router.refresh();
  }

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <div className="brand">
          <b>SYNCUP</b>
          <span>BEFORE YOU START</span>
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: 21, fontWeight: 600 }}>Welcome, {name}.</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Tick every item below to reach the app. Nothing here is optional — the checklist is
          enforced for everyone.
        </p>

        <div className="bordered-list" style={{ marginTop: 26 }}>
          {steps.map((step) => {
            const checked = done.has(step.id);
            return (
              <label key={step.id} className="list-row" style={{ cursor: 'pointer' }}>
                <span className="check" style={{ display: 'contents' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggle(step.id, e.target.checked)}
                  />
                  <span className="box">
                    <Icon.check width={12} height={12} strokeWidth={2.6} />
                  </span>
                </span>
                <div>
                  <b>{step.title}</b>
                  {step.description && <small>{step.description}</small>}
                </div>
              </label>
            );
          })}
        </div>

        <button className="btn btn-primary" onClick={enter} disabled={remaining > 0 || busy}>
          {remaining > 0
            ? `${remaining} item${remaining === 1 ? '' : 's'} left`
            : 'Enter Syncup'}
        </button>
      </div>
    </div>
  );
}
