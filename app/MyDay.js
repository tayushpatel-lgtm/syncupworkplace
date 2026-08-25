'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { useRouter } from '../lib/useRouter';
import { Icon } from '../components/Icons';
import LiveClock from '../components/LiveClock';
import { Card, Empty, Modal } from '../components/ui';
import { setUnloadGuardArmed } from '../components/UnloadGuard';
import { CLOCK_STAY_EVENT, subscribeClockTick } from '../lib/clockTick';

function KeepTabOpenNotice() {
  return (
    <div className="keep-tab-notice" role="note">
      <Info size={16} strokeWidth={1.75} aria-hidden />
      <p>
        Please don’t close this tab or the browser, time tracking depends on it staying
        open. For other work, open a new tab or a new window:{' '}
        <kbd>Ctrl</kbd>+<kbd>T</kbd> / <kbd>Ctrl</kbd>+<kbd>N</kbd> on Windows and Linux,{' '}
        <kbd>⌘</kbd>+<kbd>T</kbd> / <kbd>⌘</kbd>+<kbd>N</kbd> on Mac.
      </p>
    </div>
  );
}

function DayHead({ dayLabel, timezone, compact = false, children }) {
  const when = (
    <>
      <span>{dayLabel}</span>
      <span className="day-when-rule" aria-hidden>
        |
      </span>
      <LiveClock timezone={timezone} />
    </>
  );

  if (compact) {
    return (
      <header className="page-head page-head-compact">
        <h1 className="day-when">{when}</h1>
        {children && <div className="spacer row">{children}</div>}
      </header>
    );
  }

  return (
    <header className="page-head">
      <div>
        <h1>My day</h1>
        <p className="day-when">{when}</p>
      </div>
      {children && <div className="spacer row">{children}</div>}
    </header>
  );
}

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

/** The popup that stands between "check in" and actually starting the day: tick off what's
 * already on your plate, drop what you won't get to, add whatever else. Nothing about the day
 * — the Slack post included — goes out until this is confirmed with at least one point left. */
function CheckInPopup({ items, setItems, draft, setDraft, busy, error, onConfirm, onClose }) {
  const kept = items.filter((i) => i.keep).length;

  function toggle(id) {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, keep: !i.keep } : i)));
  }

  function addDraft(e) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setItems((cur) => [...cur, { id: `new-${cur.length}-${Date.now()}`, title, keep: true, isNew: true }]);
    setDraft('');
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="What's the plan for today?"
      description="Tick what you're actually doing, drop what you're not, add anything else. This is what goes out to Slack when you start the day."
    >
      <div className="bordered-list">
        {items.length === 0 && <p className="empty">Nothing on your plate yet — add a point below.</p>}
        {items.map((item) => (
          <label key={item.id} className="list-row" style={{ cursor: 'pointer' }}>
            <span className="check" style={{ display: 'contents' }}>
              <input type="checkbox" checked={item.keep} onChange={() => toggle(item.id)} />
              <span className="box">
                <Icon.check width={12} height={12} strokeWidth={2.6} />
              </span>
            </span>
            <span>{item.title}</span>
          </label>
        ))}
      </div>

      <form className="plan-add" style={{ marginTop: 16 }} onSubmit={addDraft}>
        <input
          className="input"
          placeholder="Add something else you're doing today"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        <button className="btn" type="submit" disabled={!draft.trim()}>
          <Icon.plus width={15} height={15} />
          Add
        </button>
      </form>

      {error && <p className="error-line">{error}</p>}

      <div className="row end" style={{ marginTop: 20 }}>
        <button className="btn btn-primary" onClick={onConfirm} disabled={kept === 0 || busy}>
          {busy ? <Icon.spinner width={15} height={15} /> : <Icon.check width={15} height={15} />}
          {busy ? 'Starting…' : 'Start my day'}
        </button>
      </div>
      {kept === 0 && <p className="hint" style={{ marginTop: 10 }}>Keep or add at least one point to start the day.</p>}
    </Modal>
  );
}

/** The popup that stands between "check out" and the day actually closing: a last pass to tick
 * off anything you finished, plus a line for whatever isn't on the list at all. */
function CheckOutPopup({ items, setItems, notes, setNotes, reportRequired, busy, error, onConfirm, onClose }) {
  function toggle(id) {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Wrapping up?"
      description="Tick off anything you finished, and note whatever isn't on the list. This goes out to Slack as today's end-of-day."
    >
      <div className="bordered-list">
        {items.length === 0 && <p className="empty">Nothing was on today's plan.</p>}
        {items.map((item) => (
          <label key={item.id} className="list-row" style={{ cursor: 'pointer' }}>
            <span className="check" style={{ display: 'contents' }}>
              <input type="checkbox" checked={item.done} onChange={() => toggle(item.id)} />
              <span className="box">
                <Icon.check width={12} height={12} strokeWidth={2.6} />
              </span>
            </span>
            <span>{item.title}</span>
          </label>
        ))}
      </div>

      <label className="field-label" style={{ marginTop: 18 }}>
        ANYTHING ELSE YOU DID — {reportRequired ? 'REQUIRED' : 'OPTIONAL'}
      </label>
      <textarea
        className="textarea"
        placeholder="A few lines on what moved today, and what is in the way."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        autoFocus
      />

      {error && <p className="error-line">{error}</p>}

      <div className="row end" style={{ marginTop: 18 }}>
        <button
          className="btn btn-primary"
          onClick={onConfirm}
          disabled={busy || (reportRequired && !notes.trim())}
        >
          {busy ? <Icon.spinner width={15} height={15} /> : <Icon.check width={15} height={15} />}
          {busy ? 'Ending…' : 'End my day'}
        </button>
      </div>
    </Modal>
  );
}

function formatLateBy(minutes) {
  const mins = Math.max(0, Math.floor(minutes || 0));
  if (!mins) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `late by ${h} hr ${m} min${m === 1 ? '' : 's'}`;
  if (h) return `late by ${h} hr`;
  return `late by ${m} min${m === 1 ? '' : 's'}`;
}

function openTasksCopy(priorities) {
  const high = priorities?.HIGH || 0;
  const medium = priorities?.MEDIUM || 0;
  const low = priorities?.LOW || 0;
  const total = high + medium + low;
  if (!total) return null;
  const bits = [];
  if (high) bits.push(<>{high} <b>high</b></>);
  if (medium) bits.push(<>{medium} <b>medium</b></>);
  if (low) bits.push(<>{low} <b>low</b></>);
  const including = bits.map((bit, i) => (
    <span key={i}>
      {i > 0 && (i === bits.length - 1 ? ' and ' : ', ')}
      {bit}
    </span>
  ));
  const noun = total === 1 ? 'open task waiting' : 'open tasks waiting';
  return (
    <>
      {total} {noun} including {including} priority
    </>
  );
}

export default function MyDay(props) {
  const {
    user,
    dayLabel,
    timezone,
    workingDay,
    holidayName,
    deadlineLabel,
    lateByMinutes,
    reportRequired,
    checkedIn,
    checkedOut,
    late,
    plan,
    totals,
    running,
    report,
    openTaskPriorities,
  } = props;

  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState('');
  const [summary, setSummary] = useState(report?.summary || '');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const addRef = useRef(null);

  const [checkInItems, setCheckInItems] = useState(null); // null = popup closed
  const [checkInDraft, setCheckInDraft] = useState('');
  const [checkInError, setCheckInError] = useState('');
  const [checkInBusy, setCheckInBusy] = useState(false);

  const [checkOutItems, setCheckOutItems] = useState(null); // null = popup closed
  const [checkOutNotes, setCheckOutNotes] = useState('');
  const [checkOutError, setCheckOutError] = useState('');
  const [checkOutBusy, setCheckOutBusy] = useState(false);

  // The live clock. It starts from what the server counted and ticks on from there,
  // so the first paint matches the server exactly and never flashes a wrong number.
  useEffect(() => {
    if (!running) return undefined;
    const from = Date.now();
    return subscribeClockTick((now) => setElapsed(Math.floor((now - from) / 1000)));
  }, [running?.kind, running?.startedAt]);

  // The heartbeat. Fires regardless of tab visibility — switching tabs or
  // windows must never look like idle time. Only the machine itself going to
  // sleep or shutting down actually stops a JS timer from firing, which is
  // the one thing that should turn a running timer into discarded idle time.
  // Chrome also kills setInterval after the close-tab dialog is cancelled, so
  // we start a fresh timer when the person stays.
  useEffect(() => {
    if (!running) return undefined;
    let id;
    const beat = () => {
      fetch('/api/day/heartbeat', { method: 'POST', keepalive: true }).catch(() => {});
    };
    const start = () => {
      clearInterval(id);
      beat();
      id = setInterval(beat, HEARTBEAT_MS);
    };
    start();
    window.addEventListener(CLOCK_STAY_EVENT, start);
    return () => {
      clearInterval(id);
      window.removeEventListener(CLOCK_STAY_EVENT, start);
    };
  }, [running?.kind, running?.startedAt]);

  const workSeconds =
    (totals.work + (running?.kind === 'WORK' ? totals.liveWork || 0 : 0)) * 60 +
    (running?.kind === 'WORK' ? elapsed : 0);
  const breakSeconds =
    (totals.break + (running?.kind === 'BREAK' ? totals.liveBreak || 0 : 0)) * 60 +
    (running?.kind === 'BREAK' ? elapsed : 0);
  const waitingCopy = openTasksCopy(openTaskPriorities);
  const lateByCopy = formatLateBy(lateByMinutes);

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
    if (url === '/api/day/session' && body?.kind && body.kind !== 'STOP') {
      setUnloadGuardArmed(true);
    }
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

  // ---------------------------------------------------------------- Check-in popup

  async function startCheckIn() {
    setBusy('in');
    setError('');
    const res = await fetch('/api/day/check-in', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) {
      setError(data.error || 'Something went wrong.');
      return;
    }
    setUnloadGuardArmed(true);
    setCheckInItems(data.plan.map((p) => ({ ...p, keep: true, isNew: false })));
    setCheckInDraft('');
    setCheckInError('');
  }

  async function confirmCheckIn() {
    setCheckInBusy(true);
    setCheckInError('');
    for (const item of checkInItems) {
      if (item.isNew) {
        await fetch('/api/day/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', title: item.title }),
        });
      } else if (!item.keep) {
        await fetch('/api/day/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'dismiss', id: item.id }),
        });
      }
    }
    const res = await fetch('/api/day/check-in/confirm', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setCheckInBusy(false);
    if (!res.ok) {
      setCheckInError(data.error || 'Something went wrong.');
      return;
    }
    setCheckInItems(null);
    router.refresh();
  }

  // ---------------------------------------------------------------- Check-out popup

  function openCheckOut() {
    setCheckOutItems(plan.map((p) => ({ id: p.id, title: p.title, done: p.done })));
    setCheckOutNotes(summary);
    setCheckOutError('');
  }

  async function confirmCheckOut() {
    setCheckOutBusy(true);
    setCheckOutError('');
    const res = await fetch('/api/day/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: checkOutNotes,
        closeDay: true,
        doneIds: checkOutItems.filter((i) => i.done).map((i) => i.id),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setCheckOutBusy(false);
    if (!res.ok) {
      setCheckOutError(data.error || 'Something went wrong.');
      return;
    }
    setCheckOutItems(null);
    setUnloadGuardArmed(false);
    router.refresh();
  }

  const composed = useMemo(
    () => [
      ['Recorded work', short(totals.work + (totals.liveWork || 0))],
      ['On break', short(totals.break + (totals.liveBreak || 0))],
      ['Discarded as idle', short(totals.idle + (totals.liveIdle || 0))],
      ['Plan points ticked', `${donePoints} of ${plan.length}`],
    ],
    [totals.work, totals.break, totals.idle, totals.liveWork, totals.liveBreak, totals.liveIdle, donePoints, plan.length],
  );

  const checkInPopup = checkInItems && (
    <CheckInPopup
      items={checkInItems}
      setItems={setCheckInItems}
      draft={checkInDraft}
      setDraft={setCheckInDraft}
      busy={checkInBusy}
      error={checkInError}
      onConfirm={confirmCheckIn}
      onClose={() => setCheckInItems(null)}
    />
  );

  const checkOutPopup = checkOutItems && (
    <CheckOutPopup
      items={checkOutItems}
      setItems={setCheckOutItems}
      notes={checkOutNotes}
      setNotes={setCheckOutNotes}
      reportRequired={reportRequired}
      busy={checkOutBusy}
      error={checkOutError}
      onConfirm={confirmCheckOut}
      onClose={() => setCheckOutItems(null)}
    />
  );

  // ---------------------------------------------------------------- Not a working day

  if (!workingDay && !checkedIn) {
    return (
      <>
        <DayHead compact dayLabel={dayLabel} timezone={timezone} />
        <Card glyph="sun" title={holidayName || 'Not a working day'}>
          <p className="hint" style={{ marginTop: 0 }}>
            {holidayName
              ? 'A company holiday. Nothing is expected of you today.'
              : 'Today falls outside the working week. Nothing is expected of you today.'}
          </p>
          <div className="row" style={{ marginTop: 20 }}>
            <button className="btn" onClick={startCheckIn} disabled={busy === 'in'}>
              {busy === 'in' ? <Icon.spinner width={15} height={15} /> : <Icon.play width={15} height={15} />}
              {busy === 'in' ? 'Working…' : 'Work anyway'}
            </button>
          </div>
          {error && <p className="error-line">{error}</p>}
        </Card>
        {checkInPopup}
      </>
    );
  }

  // ---------------------------------------------------------------- Before check-in

  if (!checkedIn) {
    return (
      <>
        <DayHead compact dayLabel={dayLabel} timezone={timezone} />
        <Card
          className="check-in-card"
          title={`Good to see you, ${user.name.split(' ')[0]}.`}
          description="Check in to start the day. You'll tick off what's already on your plate."
        >
          {waitingCopy && (
            <div className="open-tasks-box">
              <Icon.list width={16} height={16} aria-hidden />
              <p>{waitingCopy}</p>
            </div>
          )}
          <div className="row" style={{ marginTop: 24 }}>
            <button className="btn btn-primary" onClick={startCheckIn} disabled={busy === 'in'}>
              {busy === 'in' ? <Icon.spinner width={15} height={15} /> : <Icon.play width={15} height={15} />}
              {busy === 'in' ? 'Checking in…' : 'Check in'}
            </button>
          </div>
          {error && <p className="error-line">{error}</p>}
          <p className="check-in-foot">
            Expected by {deadlineLabel}
            {lateByCopy && <span className="late"> {lateByCopy}</span>}
          </p>
        </Card>
        {checkInPopup}
      </>
    );
  }

  // ---------------------------------------------------------------- Set the plan before anything else
  // A safety net, not the normal path — the check-in popup already requires at least one
  // point. This only ever catches a day that went empty later (everything got dropped).

  if (!checkedOut && plan.length === 0) {
    return (
      <>
        <DayHead dayLabel={dayLabel} timezone={timezone}>
          {late && <span className="chip amber">late arrival</span>}
        </DayHead>
        <KeepTabOpenNotice />
        <Card
          glyph="clipboard"
          title="What's the plan for today?"
          description="Add at least one point before the day continues. This is what shows up in the swim lanes, and what tonight's report is checked against."
        >
          <form className="plan-add" onSubmit={addPoint}>
            <input
              ref={addRef}
              className="input"
              placeholder="e.g. Review the onboarding flow"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <button className="btn btn-primary" type="submit" disabled={!draft.trim() || busy === 'add'}>
              {busy === 'add' ? <Icon.spinner width={15} height={15} /> : <Icon.plus width={15} height={15} />}
              Add
            </button>
          </form>
          {error && <p className="error-line">{error}</p>}
        </Card>
      </>
    );
  }

  // ---------------------------------------------------------------- The working day

  return (
    <>
      <DayHead dayLabel={dayLabel} timezone={timezone}>
        {late && <span className="chip amber">late arrival</span>}
        {checkedOut && <span className="chip green">day closed</span>}
      </DayHead>
      <KeepTabOpenNotice />

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
              {busy === 'break' ? <Icon.spinner width={15} height={15} /> : <Icon.pause width={15} height={15} />}
              Take a break
            </button>
          ) : (
            <button
              className="btn"
              onClick={() => call('/api/day/session', { kind: 'WORK' }, 'work')}
              disabled={busy === 'work'}
            >
              {busy === 'work' ? <Icon.spinner width={15} height={15} /> : <Icon.play width={15} height={15} />}
              {running ? 'Back to work' : checkedOut ? 'Start work again' : 'Resume work'}
            </button>
          )}
          {!checkedOut && (
            <button className="btn" onClick={openCheckOut}>
              <Icon.check width={15} height={15} />
              Check out
            </button>
          )}
          <span className="muted" style={{ fontSize: 13.5 }}>
            {checkedOut
              ? 'The day is closed. Reopen it by starting work again.'
              : running
                ? running.kind === 'WORK'
                  ? 'Counting. Closing this tab or the browser will ask you to stay.'
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
                  disabled={busy === point.id}
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
                disabled={busy === point.id}
                onClick={() => call('/api/day/plan', { action: 'dismiss', id: point.id }, point.id)}
              >
                {busy === point.id ? <Icon.spinner width={15} height={15} /> : <Icon.trash width={15} height={15} />}
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
            {busy === 'add' ? <Icon.spinner width={15} height={15} /> : <Icon.plus width={15} height={15} />}
            Add
          </button>
        </form>
      </Card>

      <Card
        glyph="edit"
        title="End of day"
        description="The report is composed from the day's real data. The only thing you type is what it added up to."
      >
        <div className="grid-4" style={{ marginBottom: report || checkedOut ? 22 : 0 }}>
          {composed.map(([label, value]) => (
            <div key={label} className="stat">
              <span className="kicker">{label.toUpperCase()}</span>
              <b style={{ fontSize: 24 }}>{value}</b>
            </div>
          ))}
        </div>

        {report && (
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
                {busy === 'report' && <Icon.spinner width={14} height={14} />}
                {busy === 'report' ? 'Updating…' : 'Update the report'}
              </button>
            </div>
          </>
        )}

        {!report && !checkedOut && (
          <p className="hint" style={{ marginTop: 0 }}>
            Click <b>Check out</b> above when you&apos;re done for the day — you&apos;ll tick off
            what got finished and note anything else before the day closes.
          </p>
        )}
      </Card>

      {checkOutPopup}
    </>
  );
}
