'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../components/Icons';
import { Card, Modal, Empty, Person } from '../../../components/ui';

function visibilityLabel(entry) {
  if (entry.visibility === 'COMPANY') return 'Company-wide';
  if (entry.visibility === 'DEPARTMENT') return entry.department || 'Department';
  return `${entry.sharedWith.length} ${entry.sharedWith.length === 1 ? 'person' : 'people'}`;
}

function RevealCell({ entryId }) {
  const [state, setState] = useState('hidden');
  const [secret, setSecret] = useState('');

  async function reveal() {
    setState('loading');
    const res = await fetch(`/api/passwords/${entryId}/reveal`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setState('error');
      return;
    }
    setSecret(data.secret);
    setState('shown');
  }

  if (state === 'shown') {
    return (
      <div className="row" style={{ gap: 6 }}>
        <span className="mono" style={{ fontSize: 12.5 }}>
          {secret}
        </span>
        <button
          className="btn-icon"
          title="Copy"
          aria-label="Copy"
          onClick={() => navigator.clipboard.writeText(secret)}
        >
          <Icon.copy width={13} height={13} />
        </button>
      </div>
    );
  }

  return (
    <button className="btn btn-sm" onClick={reveal} disabled={state === 'loading'}>
      <Icon.eye width={13} height={13} />
      {state === 'loading' ? '…' : 'Reveal'}
    </button>
  );
}

export default function PasswordDirectory({ entries, people, departments }) {
  const router = useRouter();
  const [sharing, setSharing] = useState(null);
  const [share, setShare] = useState({ visibility: 'PEOPLE', department: '', shareWith: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function openShare(entry) {
    setShare({ visibility: entry.visibility, department: entry.department || '', shareWith: entry.sharedWith });
    setError('');
    setSharing(entry.id);
  }

  async function saveShare(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch(`/api/passwords/${sharing}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(share),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not save that.');
      return;
    }
    setSharing(null);
    router.refresh();
  }

  async function remove(id) {
    const res = await fetch(`/api/passwords/${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
  }

  const sharingEntry = entries.find((e) => e.id === sharing);

  return (
    <>
      <Card>
        {entries.length === 0 && <Empty>Nothing added yet.</Empty>}
        {entries.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>ENTRY</th>
                <th>ADDED BY</th>
                <th>SHARED WITH</th>
                <th>SECRET</th>
                <th className="right" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <b>{entry.title}</b>
                    {entry.username && <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{entry.username}</div>}
                  </td>
                  <td className="muted">{entry.createdByName}</td>
                  <td>
                    <button className="chip" style={{ cursor: 'pointer', border: 'none' }} onClick={() => openShare(entry)}>
                      {visibilityLabel(entry)}
                    </button>
                  </td>
                  <td>
                    <RevealCell entryId={entry.id} />
                  </td>
                  <td className="right">
                    <button className="btn-icon danger" title="Delete" aria-label="Delete" onClick={() => remove(entry.id)}>
                      <Icon.trash width={14} height={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={!!sharing}
        onClose={() => setSharing(null)}
        title={sharingEntry ? `Sharing — ${sharingEntry.title}` : 'Sharing'}
        description="Change who can see this from here, regardless of who added it."
      >
        <form onSubmit={saveShare}>
          <label className="field-label">WHO CAN SEE IT</label>
          <select
            className="select"
            value={share.visibility}
            onChange={(e) => setShare({ ...share, visibility: e.target.value })}
          >
            <option value="PEOPLE">Specific people</option>
            <option value="DEPARTMENT">One department</option>
            <option value="COMPANY">Everyone at the company</option>
          </select>

          {share.visibility === 'DEPARTMENT' && (
            <div style={{ marginTop: 16 }}>
              <label className="field-label">DEPARTMENT</label>
              <select
                className="select"
                value={share.department}
                onChange={(e) => setShare({ ...share, department: e.target.value })}
              >
                <option value="">Pick one</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          {share.visibility === 'PEOPLE' && (
            <div style={{ marginTop: 16 }}>
              <label className="field-label">PEOPLE</label>
              <div className="bordered-list" style={{ maxHeight: 240, overflowY: 'auto' }}>
                {people.map((p) => (
                  <label key={p.id} className="list-row" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={share.shareWith.includes(p.id)}
                      onChange={(e) =>
                        setShare({
                          ...share,
                          shareWith: e.target.checked
                            ? [...share.shareWith, p.id]
                            : share.shareWith.filter((id) => id !== p.id),
                        })
                      }
                      style={{ marginRight: 12 }}
                    />
                    <Person name={p.name} sub={p.department || '—'} size="sm" />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="row end" style={{ marginTop: 20 }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save sharing'}
            </button>
          </div>
          {error && <p className="error-line">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
