'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icons';
import { Avatar, Empty } from './ui';

const LANES = [
  ['PENDING', 'Pending'],
  ['PROGRESS', 'In progress'],
  ['COMPLETED', 'Completed'],
  ['BLOCKED', 'Blocked'],
];

function dueTone(dueDate, today, status) {
  if (!dueDate || status === 'COMPLETED') return '';
  if (dueDate < today) return 'red';
  if (dueDate === today) return 'amber';
  return '';
}

function dueLabel(dueDate, today) {
  if (!dueDate) return 'no deadline';
  if (dueDate === today) return 'due today';
  const diff = Math.round(
    (new Date(`${dueDate}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000,
  );
  if (diff === 1) return 'due tomorrow';
  if (diff === -1) return '1 day late';
  if (diff < 0) return `${Math.abs(diff)} days late`;
  return `due ${new Date(`${dueDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  })}`;
}

function TaskCard({ task, today, onDragStart, dragging, showAssignee, onDelete }) {
  return (
    <article
      className={`task-card ${task.priority.toLowerCase()} ${dragging ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(task.id);
      }}
      onDragEnd={() => onDragStart(null)}
    >
      <p>{task.title}</p>

      <div className="meta">
        <span className={`chip ${dueTone(task.dueDate, today, task.status)}`}>
          {dueLabel(task.dueDate, today)}
        </span>
        <span className="chip">{task.priority.toLowerCase()}</span>
      </div>

      <footer>
        {showAssignee && task.assignee && (
          <>
            <Avatar name={task.assignee.name} size="sm" />
            <span>{task.assignee.name}</span>
          </>
        )}
        {!showAssignee && task.creator && <span>from {task.creator.name}</span>}
        {onDelete && (
          <button
            className="btn-icon danger"
            style={{ marginLeft: 'auto' }}
            title="Delete task"
            aria-label="Delete task"
            onClick={() => onDelete(task.id)}
          >
            <Icon.trash width={14} height={14} />
          </button>
        )}
      </footer>
    </article>
  );
}

/**
 * The swim lanes. Cards drag between statuses; the plan and the board stay in
 * step because a task-linked plan point moves with the task.
 */
export default function TaskBoard({
  tasks,
  people,
  currentUserId,
  today,
  assignable = false,
  showAssignee = false,
  canDelete = false,
}) {
  const router = useRouter();
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    assigneeId: currentUserId,
    priority: 'MEDIUM',
    dueDate: '',
    detail: '',
  });

  const grouped = useMemo(() => {
    const out = Object.fromEntries(LANES.map(([key]) => [key, []]));
    for (const task of tasks) out[task.status]?.push(task);
    return out;
  }, [tasks]);

  async function move(taskId, status) {
    setError('');
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not move that task.');
      return;
    }
    router.refresh();
  }

  async function remove(taskId) {
    const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
  }

  async function assign(e) {
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
    setForm({ ...form, title: '', dueDate: '', detail: '' });
    router.refresh();
  }

  return (
    <>
      {assignable && (
        <section className="card">
          <div className="card-head">
            <span className="glyph">
              <Icon.plus />
            </span>
            <div>
              <h2>Assign a task</h2>
              <p>
                Anyone can assign to anyone. It lands on their plan for the day and stays there
                until it is done.
              </p>
            </div>
          </div>

          <form onSubmit={assign}>
            <div className="grid-2" style={{ gap: 18 }}>
              <div>
                <label className="field-label">WHAT NEEDS DOING</label>
                <input
                  className="input"
                  placeholder="Prepare the launch notes"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
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
            </div>

            <div className="grid-3" style={{ gap: 18, marginTop: 18 }}>
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
              <div>
                <label className="field-label">DETAIL — OPTIONAL</label>
                <input
                  className="input"
                  placeholder="Anything they need to know"
                  value={form.detail}
                  onChange={(e) => setForm({ ...form, detail: e.target.value })}
                />
              </div>
            </div>

            <div className="row end" style={{ marginTop: 20 }}>
              <button className="btn btn-primary" type="submit" disabled={busy || !form.title.trim()}>
                {busy ? 'Assigning…' : 'Assign it'}
              </button>
            </div>
          </form>
          {error && <p className="error-line">{error}</p>}
        </section>
      )}

      {!assignable && error && <p className="error-line">{error}</p>}

      <div className="lanes" style={{ marginTop: assignable ? 22 : 0 }}>
        {LANES.map(([status, label]) => (
          <section
            key={status}
            className={`lane ${over === status ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOver(status);
            }}
            onDragLeave={() => setOver((cur) => (cur === status ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData('text/plain');
              if (id) move(id, status);
            }}
          >
            <h3>
              {label}
              <span>{grouped[status].length}</span>
            </h3>
            <div className="lane-body">
              {grouped[status].length === 0 && <Empty>Empty</Empty>}
              {grouped[status].map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  today={today}
                  dragging={dragging === task.id}
                  onDragStart={setDragging}
                  showAssignee={showAssignee}
                  onDelete={canDelete ? remove : null}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
