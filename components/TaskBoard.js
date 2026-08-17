'use client';

import { useMemo, useState } from 'react';
import { useRouter } from '../lib/useRouter';
import Link from 'next/link';
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

function TaskCard({ task, today, onDragStart, dragging, showAssignee, onDelete, deleting }) {
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
      <Link href={`/tasks/${task.id}`} style={{ display: 'block' }}>
        <p>{task.title}</p>

        <div className="meta">
          <span className={`chip ${dueTone(task.dueDate, today, task.status)}`}>
            {dueLabel(task.dueDate, today)}
          </span>
          <span className="chip">{task.priority.toLowerCase()}</span>
          {task.attachmentCount > 0 && (
            <span className="chip">
              <Icon.paperclip width={11} height={11} /> {task.attachmentCount}
            </span>
          )}
        </div>
      </Link>

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
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              onDelete(task.id);
            }}
          >
            {deleting ? <Icon.spinner width={14} height={14} /> : <Icon.trash width={14} height={14} />}
          </button>
        )}
      </footer>
    </article>
  );
}

/**
 * The swim lanes, full page. Cards drag between statuses; the plan and the
 * board stay in step because a task-linked plan point moves with the task.
 * Assigning happens from the button in the page header, not here.
 */
export default function TaskBoard({ tasks, today, showAssignee = false, canDelete = false }) {
  const router = useRouter();
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const [error, setError] = useState('');
  const [removingId, setRemovingId] = useState('');

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
    setRemovingId(taskId);
    const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    setRemovingId('');
  }

  return (
    <>
      {error && <p className="error-line">{error}</p>}

      <div className="lanes">
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
                  deleting={removingId === task.id}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
