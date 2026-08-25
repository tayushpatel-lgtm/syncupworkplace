'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isoWeekday, parseCount, parseInterval, parseYmd } from '@/lib/recurrence';
import { cn } from '@/lib/utils';

const radius = 'rounded-[6px]';
const inputPad = 'h-8 px-2.5 py-1 text-base md:text-sm';

const UNITS = [
  { value: 'DAILY', one: 'day', many: 'days' },
  { value: 'WEEKLY', one: 'week', many: 'weeks' },
  { value: 'MONTHLY', one: 'month', many: 'months' },
  { value: 'YEARLY', one: 'year', many: 'years' },
];

const DAY_BUTTONS = [
  { n: 7, label: 'S' },
  { n: 1, label: 'M' },
  { n: 2, label: 'T' },
  { n: 3, label: 'W' },
  { n: 4, label: 'T' },
  { n: 5, label: 'F' },
  { n: 6, label: 'S' },
];

function localYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysYmd(ymd, days) {
  const d = parseYmd(ymd) || parseYmd(localYmd());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function draftFromForm(form) {
  const repeat = form.repeat && form.repeat !== 'NONE' && form.repeat !== 'WEEKDAYS' ? form.repeat : 'WEEKLY';
  const due = form.dueDate || localYmd();
  const dueDay = isoWeekday(`${due}T00:00:00.000Z`);
  let weekdays = Array.isArray(form.repeatWeekdays) ? [...form.repeatWeekdays] : [];
  if (form.repeat === 'WEEKDAYS') weekdays = [1, 2, 3, 4, 5, 6];
  if (repeat === 'WEEKLY' && weekdays.length === 0) weekdays = [dueDay];
  const count = parseCount(form.repeatCount);
  let ends = 'never';
  if (form.repeatUntil) ends = 'on';
  else if (count) ends = 'after';
  return {
    interval: parseInterval(form.repeatInterval),
    unit: repeat === 'WEEKDAYS' ? 'WEEKLY' : repeat,
    weekdays,
    ends,
    until: form.repeatUntil || addDaysYmd(due, 90),
    count: count || 13,
  };
}

export default function CustomRecurrenceDialog({ open, form, onCancel, onDone }) {
  const [draft, setDraft] = useState(() => draftFromForm(form));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) setDraft(draftFromForm(form));
  }, [open]);

  if (!mounted || !open) return null;

  const unitMeta = UNITS.find((u) => u.value === draft.unit) || UNITS[1];
  const unitLabel = draft.interval === 1 ? unitMeta.one : unitMeta.many;

  function toggleDay(n) {
    const has = draft.weekdays.includes(n);
    if (has && draft.weekdays.length === 1) return;
    const weekdays = has ? draft.weekdays.filter((d) => d !== n) : [...draft.weekdays, n].sort((a, b) => a - b);
    setDraft({ ...draft, weekdays });
  }

  function done() {
    onDone({
      repeat: draft.unit,
      repeatInterval: draft.interval,
      repeatWeekdays: draft.unit === 'WEEKLY' ? draft.weekdays : [],
      repeatUntil: draft.ends === 'on' ? draft.until : '',
      repeatCount: draft.ends === 'after' ? draft.count : '',
    });
  }

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 80 }} onClick={onCancel}>
      <div
        className="modal-panel"
        style={{ maxWidth: 420 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-recurrence-title"
      >
        <div className="modal-head">
          <div>
            <h2 id="custom-recurrence-title">Custom recurrence</h2>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Repeat every</span>
            <Input
              type="number"
              min={1}
              max={365}
              className={`w-16 ${radius} ${inputPad}`}
              value={draft.interval}
              onChange={(e) => setDraft({ ...draft, interval: parseInterval(e.target.value) })}
            />
            <Select value={draft.unit} onValueChange={(unit) => setDraft({ ...draft, unit })}>
              <SelectTrigger className={`w-28 ${radius} ${inputPad}`}>
                <SelectValue>{unitLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="start" className={`z-[90] ${radius}`}>
                {UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {draft.interval === 1 ? u.one : u.many}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {draft.unit === 'WEEKLY' && (
            <Field>
              <FieldLabel>Repeat on</FieldLabel>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Repeat on">
                {DAY_BUTTONS.map((d) => {
                  const on = draft.weekdays.includes(d.n);
                  return (
                    <button
                      key={d.n}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(d.n)}
                      className={cn(
                        'size-8 rounded-full text-sm font-medium transition-colors',
                        on ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80',
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          <Field>
            <FieldLabel>Ends</FieldLabel>
            <RadioGroup
              value={draft.ends}
              onValueChange={(ends) => setDraft({ ...draft, ends })}
              className="gap-3"
            >
              <div className="flex items-center gap-3">
                <RadioGroupItem value="never" id="ends-never" />
                <Label htmlFor="ends-never" className="font-normal">
                  Never
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="on" id="ends-on" />
                <Label htmlFor="ends-on" className="w-10 font-normal">
                  On
                </Label>
                <Input
                  type="date"
                  className={`w-auto flex-1 ${radius} ${inputPad}`}
                  value={draft.until}
                  disabled={draft.ends !== 'on'}
                  min={form.dueDate || undefined}
                  onChange={(e) => setDraft({ ...draft, ends: 'on', until: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="after" id="ends-after" />
                <Label htmlFor="ends-after" className="w-10 font-normal">
                  After
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  className={`w-20 ${radius} ${inputPad}`}
                  value={draft.count}
                  disabled={draft.ends !== 'after'}
                  onChange={(e) => setDraft({ ...draft, ends: 'after', count: parseCount(e.target.value) || 1 })}
                />
                <span className="text-sm text-muted-foreground">occurrences</span>
              </div>
            </RadioGroup>
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className={radius} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" className={radius} onClick={done}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
