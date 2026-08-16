'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../components/Icons';
import { Card, Modal, Empty } from '../../../components/ui';

const BLANK = {
  title: '',
  username: '',
  secret: '',
  url: '',
  notes: '',
  visibility: 'PEOPLE',
  department: '',
  shareWith: [],
};

function visibilityLabel(entry) {
  if (entry.visibility === 'COMPANY') return 'Company-wide';
  if (entry.visibility === 'DEPARTMENT') return entry.department || 'Department';
  return 'Specific people';
}

function RevealField({ entryId }) {
  const [state, setState] = useState('hidden'); // hidden | loading | shown | error
  const [secret, setSecret] = useState('');
  const [copied, setCopied] = useState(false);

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
      <div className="row" style={{ gap: 8 }}>
        <span className="token-strip" style={{ padding: '7px 11px', fontSize: 13 }}>
          {secret}
        </span>
        <button
          className="btn-icon"
          title="Copy"
          aria-label="Copy"
          onClick={async () => {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Icon.copy width={14} height={14} />
        </button>
        {copied && <span className="muted" style={{ fontSize: 12 }}>Copied</span>}
        <button className="btn-icon" title="Hide" aria-label="Hide" onClick={() => setState('hidden')}>
          <Icon.eye width={14} height={14} />
        </button>
      </div>
    );
  }

  return (
    <button className="btn btn-sm" onClick={reveal} disabled={state === 'loading'}>
      {state === 'loading' ? <Icon.spinner width={14} height={14} /> : <Icon.eye width={14} height={14} />}
      {state === 'loading' ? 'Revealing…' : state === 'error' ? 'Not shared with you' : 'Reveal'}
    </button>
  );
}

function EntryForm({ form, setForm, people, departments, currentUserId, submitLabel, busy, onSubmit, error }) {
  return (
    <form onSubmit={onSubmit}>
      <div className="grid-2" style={{ gap: 18 }}>
        <div>
          <label className="field-label">TITLE</label>
          <input
            className="input"
            placeholder="Company Twitter"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus
            required
          />
        </div>
        <div>
          <label className="field-label">USERNAME — OPTIONAL</label>
          <input
            className="input"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <label className="field-label">PASSWORD</label>
        <input
          className="input"
          type="text"
          placeholder={form.title ? 'Leave blank to keep the current one' : ''}
          value={form.secret}
          onChange={(e) => setForm({ ...form, secret: e.target.value })}
        />
      </div>

      <div className="grid-2" style={{ gap: 18, marginTop: 18 }}>
        <div>
          <label className="field-label">LINK — OPTIONAL</label>
          <input
            className="input"
            placeholder="https://…"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label">WHO CAN SEE IT</label>
          <select
            className="select"
            value={form.visibility}
            onChange={(e) => setForm({ ...form, visibility: e.target.value })}
          >
            <option value="PEOPLE">Specific people</option>
            <option value="DEPARTMENT">My department</option>
            <option value="COMPANY">Everyone at the company</option>
          </select>
        </div>
      </div>

      {form.visibility === 'DEPARTMENT' && (
        <div style={{ marginTop: 18 }}>
          <label className="field-label">DEPARTMENT</label>
          <select
            className="select"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
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

      {form.visibility === 'PEOPLE' && (
        <div style={{ marginTop: 18 }}>
          <label className="field-label">SHARE WITH</label>
          <div className="bordered-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {people
              .filter((p) => p.id !== currentUserId)
              .map((p) => (
                <label key={p.id} className="list-row" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.shareWith.includes(p.id)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        shareWith: e.target.checked
                          ? [...form.shareWith, p.id]
                          : form.shareWith.filter((id) => id !== p.id),
                      })
                    }
                    style={{ marginRight: 12 }}
                  />
                  <span>{p.name}</span>
                </label>
              ))}
          </div>
          <p className="hint">Nobody picked yet? Only you — and admins, from the directory — can see it.</p>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <label className="field-label">NOTES — OPTIONAL</label>
        <textarea
          className="textarea"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>

      <div className="row end" style={{ marginTop: 22 }}>
        <button className="btn btn-primary" type="submit" disabled={busy || !form.title.trim()}>
          {busy && <Icon.spinner width={14} height={14} />}
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
      {error && <p className="error-line">{error}</p>}
    </form>
  );
}

export default function PasswordApp({ entries, people, departments, currentUserId }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState('');

  function openAdd() {
    setForm(BLANK);
    setError('');
    setAdding(true);
  }

  function openEdit(entry) {
    setForm({
      title: entry.title,
      username: entry.username || '',
      secret: '',
      url: entry.url || '',
      notes: entry.notes || '',
      visibility: entry.visibility,
      department: entry.department || '',
      shareWith: entry.sharedWith,
    });
    setError('');
    setEditing(entry.id);
  }

  async function submitAdd(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/passwords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not save that.');
      return;
    }
    setAdding(false);
    router.refresh();
  }

  async function submitEdit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch(`/api/passwords/${editing}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
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

  async function remove(id) {
    setRemoving(id);
    const res = await fetch(`/api/passwords/${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    setRemoving('');
  }

  return (
    <>
      <div className="row end" style={{ marginBottom: 18 }}>
        <button className="btn btn-primary" onClick={openAdd}>
          <Icon.plus width={15} height={15} />
          Add a password
        </button>
      </div>

      {entries.length === 0 && (
        <Card>
          <Empty>Nothing shared with you yet.</Empty>
        </Card>
      )}

      {entries.map((entry) => (
        <Card key={entry.id}>
          <div className="card-head" style={{ marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{entry.title}</h2>
              {entry.username && <p style={{ margin: '4px 0 0' }}>{entry.username}</p>}
            </div>
            <div className="spacer row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className="chip">{visibilityLabel(entry)}</span>
              {!entry.mine && <span className="chip muted">shared by {entry.createdByName}</span>}
              {entry.mine && (
                <>
                  <button className="btn-icon" title="Edit" aria-label="Edit" onClick={() => openEdit(entry)}>
                    <Icon.edit width={14} height={14} />
                  </button>
                  <button
                    className="btn-icon danger"
                    title="Delete"
                    aria-label="Delete"
                    disabled={removing === entry.id}
                    onClick={() => remove(entry.id)}
                  >
                    {removing === entry.id ? (
                      <Icon.spinner width={14} height={14} />
                    ) : (
                      <Icon.trash width={14} height={14} />
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          <RevealField entryId={entry.id} />

          {entry.url && (
            <p style={{ marginTop: 12 }}>
              <a href={entry.url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 13 }}>
                {entry.url}
              </a>
            </p>
          )}
          {entry.notes && <p className="hint" style={{ marginTop: 10 }}>{entry.notes}</p>}
        </Card>
      ))}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a password" wide>
        <EntryForm
          form={form}
          setForm={setForm}
          people={people}
          departments={departments}
          currentUserId={currentUserId}
          submitLabel="Add it"
          busy={busy}
          onSubmit={submitAdd}
          error={error}
        />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit password" wide>
        <EntryForm
          form={form}
          setForm={setForm}
          people={people}
          departments={departments}
          currentUserId={currentUserId}
          submitLabel="Save changes"
          busy={busy}
          onSubmit={submitEdit}
          error={error}
        />
      </Modal>
    </>
  );
}
