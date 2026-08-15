'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../components/Icons';
import { PageHead, Card, Empty } from '../components/ui';

const HEARTBEAT_MS = 60_000;

function clock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function short(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

export default function MyDay(props) {
  const {
    user,
    dayLabel,
    workingDay,
    holidayName,
    deadlineLabel,
    reportRequired,
    checkedIn,
    checkedOut,
    late,
    plan,
    totals,
    running,
    report,
    openTasks,
  } = props;

  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState('');
  const [summary, setSummary] = useState(report?.summary || '');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const addRef = useRef(null);

  // The live clock. It starts from what the server counted and ticks on from there,
  // so the first paint matches the server exactly and never flashes a wrong number.
  useEffect(() => {
    if (!running) return undefined;
    const from = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - from) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running?.kind, running?.startedAt]);

  // The heartbeat. Silence is what turns a running timer into discarded idle time,
  // so a sleeping machine or a shut laptop simply stops counting.
  useEffect(() => {
    if (!running) return undefined;
    const beat = () => {
      if (document.visibilityState === 'hidden') return;
      fetch('/api/day/heartbeat', { method: 'POST', keepalive: true }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [running?.kind, running?.startedAt]);

  const workSeconds = totals.work * 60 + (running?.kind === 'WORK' ? elapsed : 0);
  const breakSeconds = totals.break * 60 + (running?.kind === 'BREAK' ? elapsed : 0);

  const donePoints = plan.filter((p) => p.done).length;
  const progress = plan.length ? Math.round((donePoints / plan.length) * 100) : 0;

  async function call(url, body, tag) {
    setBusy(tag);
    setError('');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) {
      setError(data.error || 'Something went wrong.');
      return false;
    }
    setElapsed(0);
    router.refresh();
    return true;
  }

  async function addPoint(e) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    await call('/api/day/plan', { action: 'add', title }, 'add');
    addRef.current?.focus();
  }

  const composed = useMemo(
    () => [
      ['Recorded work', short(totals.work)],
      ['On break', short(totals.break)],
      ['Discarded as idle', short(totals.idle)],
      ['Plan points ticked', `${donePoints} of ${plan.length}`],
    ],
    [totals.work, totals.break, totals.idle, donePoints, plan.length],
  );

  // ---------------------------------------------------------------- Not a working day

  if (!workingDay && !checkedIn) {
    return (
      <>
        <PageHead title="My day" subtitle={dayLabel} />
        <Card glyph="sun" title={holidayName || 'Not a working day'}>
          <p className="hint" style={{ marginTop: 0 }}>
            {holidayName
              ? 'A company holiday. Nothing is expected of you today.'
              : 'Today falls outside the working week. Nothing is expected of you today.'}
          </p>
          <div className="row" style={{ marginTop: 20 }}>
            <button
              className="btn"
              onClick={() => call('/api/day/check-in', {}, 'in')}
              disabled={busy === 'in'}
            >
              <Icon.play width={15} height={15} />
              Work anyway
            </button>
          </div>
        </Card>
      </>
    );
  }

  // ---------------------------------------------------------------- Before check-in

  if (!checkedIn) {
    return (
      <>
        <PageHead title="My day" subtitle={dayLabel} />
        <Card glyph="bolt" title={`Good to see you, ${user.name.split(' ')[0]}.`}>
          <p className="hint" style={{ marginTop: 0 }}>
            Check in to start the day. Your plan opens with everything already assigned to you, and
            anything you left unfinished yesterday.
          </p>
          <div className="row" style={{ marginTop: 24 }}>
            <button
              className="btn btn-primary"
              onClick={() => call('/api/day/check-in', {}, 'in')}
              disabled={busy === 'in'}
            >
              <Icon.play width={15} height={15} />
              {busy === 'in' ? 'Checking in…' : 'Check in'}
            </button>
            <span className="muted" style={{ fontSize: 13.5 }}>
              Expected by {deadlineLabel}
              {openTasks > 0 && ` · ${openTasks} open task${openTasks === 1 ? '' : 's'} waiting`}
            </span>
          </div>
          {error && <p className="error-line">{error}</p>}
        </Card>
      </>
    );
  }

  // ---------------------------------------------------------------- The working day

  return (
    <>
      <PageHead title="My day" subtitle={dayLabel}>
        {late && <span className="chip amber">late arrival</span>}
        {checkedOut && <span className="chip green">day closed</span>}
      </PageHead>

      <Card>
        <div className="timer">
          <div>
            <span className="kicker">RECORDED WORK</span>
            <div className="clock">{clock(workSeconds)}</div>
          </div>

          <div className="split">
            <div>
              <span className="kicker">ON BREAK</span>
              <b>{short(breakSeconds / 60)}</b>
            </div>
            <div>
              <span className="kicker">DISCARDED AS IDLE</span>
              <b>{short(totals.idle)}</b>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="row wrap">
          {running?.kind === 'WORK' ? (
            <button
              className="btn"
              onClick={() => call('/api/day/session', { kind: 'BREAK' }, 'break')}
              disabled={busy === 'break'}
            >
              <Icon.pause width={15} height={15} />
              Take a break
            </button>
          ) : (
            <button
              className="btn"
              onClick={() => call('/api/day/session', { kind: 'WORK' }, 'work')}
              disabled={busy === 'work'}
            >
              <Icon.play width={15} height={15} />
              {running ? 'Back to work' : checkedOut ? 'Start work again' : 'Resume work'}
            </button>
          )}
          <span className="muted" style={{ fontSize: 13.5 }}>
            {checkedOut
              ? 'The day is closed. Reopen it by starting work again.'
              : running
                ? running.kind === 'WORK'
                  ? 'Counting. Close the tab and the clock stops with it.'
                  : 'On a break — nothing is being counted.'
                : 'The clock is stopped.'}
          </span>
        </div>
        {error && <p className="error-line">{error}</p>}
      </Card>

      <Card
        glyph="clipboard"
        title="The plan for today"
        description="Points you tick as you finish them. Anything still open at the end of the day moves to tomorrow."
        action={
          <span className="mono" style={{ fontSize: 13 }}>
            {donePoints}/{plan.length}
          </span>
        }
      >
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="plan-list" style={{ marginTop: 14 }}>
          {plan.length === 0 && <Empty>Nothing on the plan yet. Add your first point below.</Empty>}
          {plan.map((point) => (
            <div key={point.id} className={`plan-point ${point.done ? 'done' : ''}`}>
              <label className="check" style={{ display: 'contents' }}>
                <input
                  type="checkbox"
                  checked={point.done}
                  onChange={(e) =>
                    call('/api/day/plan', { action: 'toggle', id: point.id, done: e.target.checked }, point.id)
                  }
                />
                <span className="box">
                  <Icon.check width={12} height={12} strokeWidth={2.6} />
                </span>
              </label>

              <div className="body">
                <p>{point.title}</p>
                <div className="marks">
                  {point.taskId && <span className="chip">assigned task</span>}
                  {point.carried && <span className="chip amber">carried over</span>}
                  {point.priority === 'HIGH' && <span className="chip red">high</span>}
                </div>
              </div>

              <button
                className="btn-icon danger"
                title="Remove for today"
                aria-label="Remove for today"
                onClick={() => call('/api/day/plan', { action: 'dismiss', id: point.id }, point.id)}
              >
                <Icon.trash width={15} height={15} />
              </button>
            </div>
          ))}
        </div>

        <form className="plan-add" onSubmit={addPoint}>
          <input
            ref={addRef}
            className="input"
            placeholder="Add a point to today's plan"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn" type="submit" disabled={!draft.trim() || busy === 'add'}>
            <Icon.plus width={15} height={15} />
            Add
          </button>
        </form>
      </Card>

      <Card
        glyph="edit"
        title="Close the day"
        description="The report is composed from the day's real data. The only thing you type is what it added up to."
      >
        <div className="grid-4" style={{ marginBottom: 22 }}>
          {composed.map(([label, value]) => (
            <div key={label} className="stat">
              <span className="kicker">{label.toUpperCase()}</span>
              <b style={{ fontSize: 24 }}>{value}</b>
            </div>
          ))}
        </div>

        {report ? (
          <>
            <p className="notice-line" style={{ marginTop: 0 }}>
              Filed at{' '}
              {new Date(report.submittedAt).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              . You can still revise it until midnight.
            </p>
            <textarea
              className="textarea"
              style={{ marginTop: 16 }}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <div className="row end" style={{ marginTop: 14 }}>
              <button
                className="btn"
                onClick={() => call('/api/day/report', { summary }, 'report')}
                disabled={!summary.trim() || busy === 'report'}
              >
                Update the report
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="field-label">WHAT IT ADDED UP TO</label>
            <textarea
              className="textarea"
              placeholder="A few lines on what moved today, and what is in the way."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <div className="row end" style={{ marginTop: 16 }}>
              {reportRequired && (
                <span className="muted" style={{ fontSize: 13, marginRight: 'auto' }}>
                  A day can&apos;t be ended without filing.
                </span>
              )}
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const ok = await call('/api/day/report', { summary, closeDay: true }, 'report');
                  if (!ok) return;
                }}
                disabled={(reportRequired && !summary.trim()) || busy === 'report'}
              >
                <Icon.check width={15} height={15} />
                File and end the day
              </button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
