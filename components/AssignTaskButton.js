'use client';

import { useState } from 'react';
import { useRouter } from '../lib/useRouter';
import { Icon } from './Icons';
import { Modal } from './ui';

/**
 * The "assign a task" flow lives here rather than inline on the page, so the
 * swim lanes get the full page and this trigger sits top-right where it's
 * reached for constantly. Self-contained: the button and the modal both live
 * here, decoupled from the board below — assigning just refreshes the page.
 */
export default function AssignTaskButton({ people, currentUserId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    assigneeId: currentUserId,
    priority: 'MEDIUM',
    dueDate: '',
    detail: '',
  });

  function close() {
    setOpen(false);
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not assign that task.');
      return;
    }
    setForm({ title: '', assigneeId: currentUserId, priority: 'MEDIUM', dueDate: '', detail: '' });
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Icon.plus width={15} height={15} />
        Assign a task
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Assign a task"
        description="Anyone can assign to anyone. It lands on their plan for the day and stays there until it's done."
      >
        <form onSubmit={submit}>
          <label className="field-label">WHAT NEEDS DOING</label>
          <input
            className="input"
            placeholder="Prepare the launch notes"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus
            required
          />

          <div className="grid-2" style={{ gap: 18, marginTop: 18 }}>
            <div>
              <label className="field-label">WHO IS DOING IT</label>
              <select
                className="select"
                value={form.assigneeId}
                onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.id === currentUserId ? ' (you)' : ''}
                  </option>
                ))}
              </select>
            </div>
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
          </div>

          <div className="grid-2" style={{ gap: 18, marginTop: 18 }}>
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

          <label className="field-label" style={{ marginTop: 18 }}>
            DETAIL — OPTIONAL
          </label>
          <textarea
            className="textarea"
            placeholder="Anything they need to know"
            value={form.detail}
            onChange={(e) => setForm({ ...form, detail: e.target.value })}
          />

          <div className="row end" style={{ marginTop: 22 }}>
            <button className="btn" type="button" onClick={close}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy || !form.title.trim()}>
              {busy && <Icon.spinner width={14} height={14} />}
              {busy ? 'Assigning…' : 'Assign it'}
            </button>
          </div>
          {error && <p className="error-line">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
