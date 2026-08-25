'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus } from 'lucide-react';
import { useRouter } from '../lib/useRouter';
import { Icon } from './Icons';
import { Modal } from './ui';
import AssigneeSelect from './AssigneeSelect';
import RepeatFields, { emptyRepeat } from './RepeatFields';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const radius = 'rounded-[6px]';
const inputPad = 'h-8 px-2.5 py-1 text-base md:text-sm';

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
  const blankForm = () => ({
    title: '',
    assigneeId: currentUserId,
    priority: 'MEDIUM',
    dueDate: '',
    detail: '',
    ...emptyRepeat(),
  });
  const [form, setForm] = useState(blankForm);
  const [discardOpen, setDiscardOpen] = useState(false);
  const detailWrapRef = useRef(null);

  function isDirty() {
    return Boolean(
      form.title.trim() ||
        form.detail.trim() ||
        form.dueDate ||
        (form.repeat && form.repeat !== 'NONE') ||
        form.priority !== 'MEDIUM' ||
        form.assigneeId !== currentUserId,
    );
  }

  function resetAndClose() {
    setForm(blankForm());
    setDiscardOpen(false);
    setError('');
    setOpen(false);
  }

  function requestClose() {
    if (isDirty()) {
      setDiscardOpen(true);
      return;
    }
    resetAndClose();
  }

  function fitDetailHeight() {
    const wrap = detailWrapRef.current;
    const el = wrap?.querySelector('textarea');
    const panel = wrap?.closest('.modal-panel');
    if (!wrap || !el || !panel) return;

    const overlay = panel.closest('.modal-overlay');
    const padY = overlay
      ? (parseFloat(getComputedStyle(overlay).paddingTop) || 0) +
        (parseFloat(getComputedStyle(overlay).paddingBottom) || 0)
      : 80;
    const maxPanel = window.innerHeight - padY;

    el.style.height = '0px';
    el.style.overflowY = 'hidden';
    const chrome = panel.scrollHeight - wrap.clientHeight;
    const maxH = Math.max(64, maxPanel - chrome);
    el.style.height = 'auto';
    const contentH = el.scrollHeight;
    const next = Math.min(Math.max(contentH, 96), maxH);
    el.style.height = `${next}px`;
    el.style.overflowY = contentH > maxH ? 'auto' : 'hidden';
  }

  useLayoutEffect(() => {
    if (!open) return;
    fitDetailHeight();
    const onWin = () => fitDetailHeight();
    window.addEventListener('resize', onWin);
    return () => window.removeEventListener('resize', onWin);
  }, [open, form.detail, error]);

  function close() {
    requestClose();
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
    setForm(blankForm());
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
        fill
        closeOnOverlay={false}
        title="Assign a task"
        description="Anyone can assign to anyone. One-time tasks land on their plan today; repeating ones show on the day they're due."
      >
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <FieldGroup className="min-h-0">
            <Field>
              <FieldLabel htmlFor="task-title">What needs doing</FieldLabel>
              <Input
                id="task-title"
                className={radius}
                placeholder="Prepare the launch notes"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="task-assignee">Who is doing it</FieldLabel>
                <AssigneeSelect
                  id="task-assignee"
                  people={people}
                  currentUserId={currentUserId}
                  value={form.assigneeId}
                  onChange={(assigneeId) => setForm({ ...form, assigneeId })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
                <Select
                  value={form.priority}
                  onValueChange={(priority) => setForm({ ...form, priority })}
                >
                  <SelectTrigger id="task-priority" className={`w-full ${radius} ${inputPad}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" className={`z-[80] ${radius}`}>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="task-due">
                  {form.repeat && form.repeat !== 'NONE' ? 'First due' : 'Deadline'}
                </FieldLabel>
                <Input
                  id="task-due"
                  type="date"
                  className={radius}
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  required={form.repeat && form.repeat !== 'NONE'}
                />
              </Field>
              <RepeatFields form={form} setForm={setForm} />
            </div>

            <Field className="assign-detail-field">
              <FieldLabel htmlFor="task-detail">Detail (optional)</FieldLabel>
              <div className="assign-detail-wrap" ref={detailWrapRef}>
                <Textarea
                  id="task-detail"
                  rows={1}
                  className={`${radius} resize-none field-sizing-fixed px-2.5 py-1 text-base md:text-sm`}
                  placeholder="Anything they need to know"
                  value={form.detail}
                  onChange={(e) => setForm({ ...form, detail: e.target.value })}
                />
              </div>
              <div className="flex shrink-0 justify-end gap-2">
                <Button type="button" variant="outline" size="lg" className={`${radius} h-11 cursor-pointer px-5`} onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" size="lg" className={`${radius} h-11 cursor-pointer px-5`} disabled={busy || !form.title.trim()}>
                  {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                  {busy ? 'Assigning…' : 'Assign it'}
                </Button>
              </div>
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
        </form>
      </Modal>

      {discardOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className="modal-overlay" style={{ zIndex: 80 }} onClick={() => setDiscardOpen(false)}>
              <div
                className="modal-panel"
                style={{ maxWidth: 400 }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="discard-task-title"
              >
                <div className="modal-head">
                  <div>
                    <h2 id="discard-task-title">Discard this task?</h2>
                    <p>What you have entered will be lost.</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className={`${radius} h-11 cursor-pointer px-5`}
                    onClick={() => setDiscardOpen(false)}
                  >
                    Keep editing
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    className={`${radius} h-11 cursor-pointer px-5`}
                    onClick={resetAndClose}
                  >
                    Discard
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
