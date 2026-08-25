'use client';

import { useRef, useState } from 'react';
import { useRouter } from '../../../lib/useRouter';
import { Icon } from '../../../components/Icons';
import { PageHead, Card, Empty, PriorityChip } from '../../../components/ui';
import RepeatFields from '../../../components/RepeatFields';
import { repeatLabel } from '../../../lib/recurrence';

const STAGES = [
  ['PENDING', 'Pending'],
  ['PROGRESS', 'In progress'],
  ['COMPLETED', 'Completed'],
  ['BLOCKED', 'Blocked'],
];

const MAX_BYTES = 4 * 1024 * 1024;

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export default function TaskDetail({ task, attachments, canDelete }) {
  const router = useRouter();
  const fileRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: task.title,
    detail: task.detail || '',
    priority: task.priority,
    dueDate: task.dueDate,
    repeat: task.repeat || 'NONE',
    repeatUntil: task.repeatUntil || '',
    repeatWeekdays: task.repeatWeekdays || [],
    repeatInterval: task.repeatInterval || 1,
    repeatCount: task.repeatCount || '',
  });

  async function patch(body, tag) {
    setBusy(tag);
    setError('');
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) {
      setError(data.error || 'That did not save.');
      return false;
    }
    router.refresh();
    return true;
  }

  async function saveDetails() {
    const ok = await patch(form, 'save');
    if (ok) setEditing(false);
  }

  async function removeTask() {
    setBusy('delete');
    const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    if (res.ok) router.push('/tasks');
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not delete that task.');
      setBusy('');
    }
  }

  async function upload(fileList) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is over the ${Math.round(MAX_BYTES / 1024 / 1024)}MB limit.`);
        continue;
      }
      setBusy(`upload-${file.name}`);
      setError('');
      try {
        const data = await readAsBase64(file);
        const res = await fetch(`/api/tasks/${task.id}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, mimeType: file.type, data }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error || `Could not attach ${file.name}.`);
          continue;
        }
      } catch (err) {
        setError(err.message);
      }
    }
    setBusy('');
    router.refresh();
  }

  async function removeAttachment(id) {
    setBusy(`remove-${id}`);
    const res = await fetch(`/api/tasks/${task.id}/attachments/${id}`, { method: 'DELETE' });
    setBusy('');
    if (res.ok) router.refresh();
  }

  const images = attachments.filter((a) => a.mimeType.startsWith('image/'));
  const files = attachments.filter((a) => !a.mimeType.startsWith('image/'));

  return (
    <>
      <PageHead title={task.title} subtitle={`Assigned to ${task.assignee.name} · from ${task.creator.name}`}>
        <button className="btn btn-sm" onClick={() => router.back()}>
          ← Back
        </button>
      </PageHead>

      {error && <p className="error-line">{error}</p>}

      <Card glyph="list" title="Stage" description="Move it through the swim lanes from here, or drag it on the board.">
        <div className="row wrap">
          {STAGES.map(([value, label]) => (
            <button
              key={value}
              className={`chip ${task.status === value ? 'solid' : ''}`}
              style={{ cursor: 'pointer', border: 'none', padding: '9px 16px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              disabled={busy === `stage-${value}`}
              onClick={() => patch({ status: value }, `stage-${value}`)}
            >
              {busy === `stage-${value}` && <Icon.spinner width={12} height={12} />}
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card
        glyph="edit"
        title="Details"
        action={
          <button className="btn btn-sm" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        }
      >
        {!editing ? (
          <div className="stack">
            <div className="row wrap" style={{ gap: 10 }}>
              <PriorityChip priority={task.priority} />
              <span className="chip">{task.dueDate ? `due ${task.dueDate}` : 'no deadline'}</span>
              {repeatLabel(task) && <span className="chip">{repeatLabel(task)}</span>}
              {task.repeatUntil && <span className="chip">until {task.repeatUntil}</span>}
            </div>
            <p style={{ margin: 0, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {task.detail || <span className="muted">No detail added.</span>}
            </p>
          </div>
        ) : (
          <div className="stack">
            <div>
              <label className="field-label">TITLE</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="grid-2" style={{ gap: 18 }}>
              <div>
                <label className="field-label">PRIORITY</label>
                <select
                  className="select"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>
              <div>
                <label className="field-label">DEADLINE</label>
                <input
                  className="input"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
            </div>
            <RepeatFields form={form} setForm={setForm} />
            <div>
              <label className="field-label">DETAIL</label>
              <textarea
                className="textarea"
                value={form.detail}
                onChange={(e) => setForm({ ...form, detail: e.target.value })}
              />
            </div>
            <div className="row end">
              <button className="btn btn-primary" onClick={saveDetails} disabled={busy === 'save'}>
                {busy === 'save' && <Icon.spinner width={14} height={14} />}
                {busy === 'save' ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card
        glyph="paperclip"
        title="Attachments"
        description={`Images and files, capped at ${Math.round(MAX_BYTES / 1024 / 1024)}MB each — stored right in the database, no separate service.`}
        action={
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => upload(e.target.files)}
            />
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {busy.startsWith('upload-') ? <Icon.spinner width={14} height={14} /> : <Icon.plus width={14} height={14} />}
              {busy.startsWith('upload-') ? 'Uploading…' : 'Upload'}
            </button>
          </>
        }
      >
        {attachments.length === 0 && <Empty>Nothing attached yet.</Empty>}

        {images.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 12,
              marginBottom: files.length ? 20 : 0,
            }}
          >
            {images.map((a) => (
              <div key={a.id} style={{ position: 'relative' }}>
                <a href={`/api/tasks/${task.id}/attachments/${a.id}`} target="_blank" rel="noreferrer">
                  <img
                    src={`/api/tasks/${task.id}/attachments/${a.id}`}
                    alt={a.filename}
                    style={{
                      width: '100%',
                      height: 110,
                      objectFit: 'cover',
                      borderRadius: 10,
                      border: '1px solid var(--line)',
                      display: 'block',
                    }}
                  />
                </a>
                <p className="mono" style={{ fontSize: 11, margin: '6px 0 0', color: 'var(--ink-muted)' }}>
                  {a.filename.length > 20 ? `${a.filename.slice(0, 18)}…` : a.filename}
                </p>
                <button
                  className="btn-icon danger"
                  style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,255,255,0.9)' }}
                  onClick={() => removeAttachment(a.id)}
                  disabled={busy === `remove-${a.id}`}
                  aria-label="Remove"
                >
                  {busy === `remove-${a.id}` ? (
                    <Icon.spinner width={13} height={13} />
                  ) : (
                    <Icon.trash width={13} height={13} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <div className="bordered-list">
            {files.map((a) => (
              <div key={a.id} className="list-row">
                <div style={{ flex: 1 }}>
                  <a href={`/api/tasks/${task.id}/attachments/${a.id}`} target="_blank" rel="noreferrer">
                    <b>{a.filename}</b>
                  </a>
                  <small>
                    {formatBytes(a.size)} · uploaded by {a.uploadedBy}
                  </small>
                </div>
                <button
                  className="btn-icon danger"
                  onClick={() => removeAttachment(a.id)}
                  disabled={busy === `remove-${a.id}`}
                  aria-label="Remove"
                >
                  {busy === `remove-${a.id}` ? (
                    <Icon.spinner width={15} height={15} />
                  ) : (
                    <Icon.trash width={15} height={15} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {canDelete && (
        <Card glyph="trash" title="Delete this task" description="Removes it everywhere — the board, the plan, everything attached.">
          <button className="btn btn-danger" onClick={removeTask} disabled={busy === 'delete'}>
            {busy === 'delete' && <Icon.spinner width={14} height={14} />}
            {busy === 'delete' ? 'Deleting…' : 'Delete task'}
          </button>
        </Card>
      )}
    </>
  );
}
