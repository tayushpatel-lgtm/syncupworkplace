'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '../../../lib/useRouter';
import { Icon } from '../../../components/Icons';
import { Person, Modal } from '../../../components/ui';

export default function AttendanceDayEditor({ dateKey, rows }) {
  const router = useRouter();
  const [editing, setEditing] = useState(null); // the row being edited
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [reason, setReason] = useState('');
  const [drafts, setDrafts] = useState({});
  const [mergeKeep, setMergeKeep] = useState('');
  const [mergeAbsorb, setMergeAbsorb] = useState('');

  function open(row) {
    setEditing(row);
    setCheckInTime(row.checkInTime);
    setCheckOutTime(row.checkOutTime);
    setError('');
    setReason('');
    setSessions([]);
    setDrafts({});
    setMergeKeep('');
    setMergeAbsorb('');
  }

  async function loadSessions(userId) {
    const res = await fetch(`/api/admin/sessions?userId=${encodeURIComponent(userId)}&date=${dateKey}`);
    const data = await res.json().catch(() => ({}));
    const list = data.sessions || [];
    setSessions(list);
    const next = {};
    for (const s of list) {
      next[s.id] = { startedTime: s.startedTime, endedTime: s.endedTime, kind: s.kind };
    }
    setDrafts(next);
  }

  useEffect(() => {
    if (!editing) return undefined;
    loadSessions(editing.id);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, dateKey]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: editing.id,
        date: dateKey,
        checkInTime: checkInTime || null,
        checkOutTime: checkOutTime || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not save that.');
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function saveSession(session) {
    const draft = drafts[session.id];
    if (!draft) return;
    if (reason.trim().length < 3) {
      setError('A reason is required to edit a session.');
      return;
    }
    setBusy(true);
    setError('');
    const res = await fetch(`/api/admin/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startedTime: draft.startedTime,
        endedTime: draft.endedTime || '',
        kind: draft.kind,
        reason,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not save that session.');
      return;
    }
    await loadSessions(editing.id);
    router.refresh();
  }

  async function merge() {
    if (reason.trim().length < 3) {
      setError('A reason is required to merge sessions.');
      return;
    }
    if (!mergeKeep || !mergeAbsorb) {
      setError('Pick two sessions to merge.');
      return;
    }
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId: mergeKeep, absorbId: mergeAbsorb, reason }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not merge those sessions.');
      return;
    }
    setMergeKeep('');
    setMergeAbsorb('');
    await loadSessions(editing.id);
    router.refresh();
  }

  async function markAbsent() {
    setCheckInTime('');
    setCheckOutTime('');
  }

  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th>PERSON</th>
            <th>STATE</th>
            <th>CHECK-IN</th>
            <th>CHECK-OUT</th>
            <th className="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Person name={r.name} sub={r.department || '—'} />
              </td>
              <td>
                <span className={`chip ${r.stateTone}`}>{r.stateLabel}</span>
              </td>
              <td className="num">
                {r.checkInLabel}
                {r.late && (
                  <span className="chip amber" style={{ marginLeft: 8 }}>
                    late
                  </span>
                )}
              </td>
              <td className="num">{r.checkOutLabel}</td>
              <td className="right">
                <button className="btn btn-sm" onClick={() => open(r)}>
                  <Icon.edit width={13} height={13} />
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.name}` : ''}
        description={
          editing
            ? `Deadline that day: ${editing.deadlineLabel}. Clear both times to mark the day absent. Sessions already on the day can be edited or merged — backfill only runs when there are none.`
            : ''
        }
      >
        {editing && (
          <form onSubmit={save}>
            <div className="grid-2" style={{ gap: 18 }}>
              <div>
                <label className="field-label">CHECK-IN</label>
                <input
                  className="input"
                  type="time"
                  value={checkInTime}
                  onChange={(e) => {
                    setCheckInTime(e.target.value);
                    if (!e.target.value) setCheckOutTime('');
                  }}
                />
              </div>
              <div>
                <label className="field-label">CHECK-OUT</label>
                <input
                  className="input"
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                  disabled={!checkInTime}
                />
              </div>
            </div>

            {sessions.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <label className="field-label">SESSIONS</label>
                <div className="bordered-list" style={{ marginTop: 8 }}>
                  {sessions.map((s) => {
                    const draft = drafts[s.id] || { startedTime: s.startedTime, endedTime: s.endedTime, kind: s.kind };
                    return (
                      <div key={s.id} className="row" style={{ gap: 8, flexWrap: 'wrap', padding: '8px 0' }}>
                        <select
                          className="input"
                          style={{ width: 110 }}
                          value={draft.kind}
                          onChange={(e) => setDrafts((cur) => ({ ...cur, [s.id]: { ...draft, kind: e.target.value } }))}
                        >
                          <option value="WORK">Work</option>
                          <option value="BREAK">Break</option>
                          <option value="IDLE">Idle</option>
                        </select>
                        <input
                          className="input"
                          type="time"
                          style={{ width: 120 }}
                          value={draft.startedTime}
                          onChange={(e) =>
                            setDrafts((cur) => ({ ...cur, [s.id]: { ...draft, startedTime: e.target.value } }))
                          }
                        />
                        <input
                          className="input"
                          type="time"
                          style={{ width: 120 }}
                          value={draft.endedTime}
                          onChange={(e) =>
                            setDrafts((cur) => ({ ...cur, [s.id]: { ...draft, endedTime: e.target.value } }))
                          }
                        />
                        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => saveSession(s)}>
                          Save session
                        </button>
                      </div>
                    );
                  })}
                </div>

                {sessions.length >= 2 && (
                  <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
                    <select className="input" style={{ width: 180 }} value={mergeKeep} onChange={(e) => setMergeKeep(e.target.value)}>
                      <option value="">Keep…</option>
                      {sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.kind} {s.startedTime}
                        </option>
                      ))}
                    </select>
                    <select className="input" style={{ width: 180 }} value={mergeAbsorb} onChange={(e) => setMergeAbsorb(e.target.value)}>
                      <option value="">Merge into it…</option>
                      {sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.kind} {s.startedTime}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn btn-sm" disabled={busy} onClick={merge}>
                      Merge
                    </button>
                  </div>
                )}

                <label className="field-label" style={{ marginTop: 14 }}>
                  REASON
                </label>
                <input
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Required for session edits and merges"
                />
              </div>
            )}

            <div className="row" style={{ marginTop: 18, justifyContent: 'space-between' }}>
              <button type="button" className="btn btn-sm btn-danger" onClick={markAbsent}>
                Mark absent
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy && <Icon.spinner width={14} height={14} />}
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
            {error && <p className="error-line">{error}</p>}
          </form>
        )}
      </Modal>
    </>
  );
}
