'use client';

import { useState } from 'react';
import { useRouter } from '../../../lib/useRouter';
import { Icon } from '../../../components/Icons';
import { Modal } from '../../../components/ui';

const PHRASE = 'DELETE';

/**
 * Wipes every task company-wide — every board, every person's plan loses the
 * task link. CEO-only, since it's the one action here severe enough that
 * even other admins shouldn't reach it. Nothing this destructive should go
 * through on a stray click either, so the confirm button stays disabled
 * until the CEO types the word out.
 */
export default function ResetTasksButton({ count, isCeo }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function close() {
    setOpen(false);
    setTyped('');
    setError('');
  }

  async function confirm() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/tasks/reset', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not reset the tasks.');
      return;
    }
    close();
    router.refresh();
  }

  if (!isCeo || count === 0) return null;

  return (
    <>
      <button className="btn btn-sm btn-danger" onClick={() => setOpen(true)}>
        <Icon.trash width={14} height={14} />
        Reset all tasks
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Reset every task"
        description={`This permanently deletes all ${count} task${count === 1 ? '' : 's'} across the company, and any files attached to them. It does not touch people, attendance or leave. This cannot be undone.`}
      >
        <label className="field-label">TYPE {PHRASE} TO CONFIRM</label>
        <input
          className="input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
        />

        <div className="row end" style={{ marginTop: 20 }}>
          <button className="btn" type="button" onClick={close}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            disabled={typed !== PHRASE || busy}
            onClick={confirm}
          >
            {busy && <Icon.spinner width={14} height={14} />}
            {busy ? 'Deleting…' : 'Delete everything'}
          </button>
        </div>
        {error && <p className="error-line">{error}</p>}
      </Modal>
    </>
  );
}
