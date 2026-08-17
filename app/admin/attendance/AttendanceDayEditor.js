'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../components/Icons';
import { Person, Modal } from '../../../components/ui';

export default function AttendanceDayEditor({ dateKey, rows }) {
  const router = useRouter();
  const [editing, setEditing] = useState(null); // the row being edited
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function open(row) {
    setEditing(row);
    setCheckInTime(row.checkInTime);
    setCheckOutTime(row.checkOutTime);
    setError('');
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: editing.id, date: dateKey, checkInTime: checkInTime || null, checkOutTime: checkOutTime || null }),
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
        description={editing ? `Deadline that day: ${editing.deadlineLabel}. Clear both times to mark the day absent.` : ''}
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
