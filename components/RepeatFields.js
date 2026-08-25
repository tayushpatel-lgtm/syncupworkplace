'use client';

import { useState } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  annualPresetLabel,
  isoWeekday,
  repeatLabel,
  repeatSelectValue,
  weeklyPresetLabel,
} from '@/lib/recurrence';
import CustomRecurrenceDialog from './CustomRecurrenceDialog';

const radius = 'rounded-[6px]';
const inputPad = 'h-8 px-2.5 py-1 text-base md:text-sm';

function localYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function emptyRepeat() {
  return {
    repeat: 'NONE',
    repeatUntil: '',
    repeatWeekdays: [],
    repeatInterval: 1,
    repeatCount: '',
  };
}

/**
 * Google Calendar-style frequency. Presets apply immediately; Custom… opens a
 * centred dialog rather than extra fields under the select.
 */
export default function RepeatFields({ form, setForm }) {
  const [customOpen, setCustomOpen] = useState(false);
  const due = form.dueDate || localYmd();
  const selected = repeatSelectValue(form);

  function ensureDue(next) {
    if (next.repeat !== 'NONE' && !next.dueDate) next.dueDate = localYmd();
    return next;
  }

  function applyPreset(repeat) {
    if (repeat === 'CUSTOM') {
      setCustomOpen(true);
      return;
    }
    const next = { ...form, repeat, repeatInterval: 1, repeatCount: '', repeatUntil: '' };
    if (repeat === 'NONE') {
      next.repeatWeekdays = [];
    } else if (repeat === 'WEEKLY') {
      next.repeatWeekdays = [isoWeekday(`${(next.dueDate || due)}T00:00:00.000Z`)];
    } else {
      next.repeatWeekdays = [];
    }
    setForm(ensureDue(next));
  }

  function applyCustom(partial) {
    setForm(ensureDue({ ...form, ...partial }));
    setCustomOpen(false);
  }

  return (
    <div>
      <Field>
        <FieldLabel htmlFor="task-repeat">Repeats</FieldLabel>
        <Select value={selected} onValueChange={applyPreset}>
          <SelectTrigger id="task-repeat" className={`w-full ${radius} ${inputPad}`}>
            <SelectValue>{repeatLabel({ ...form, dueDate: due }) || 'Does not repeat'}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" align="start" className={`z-[80] ${radius}`}>
            <SelectItem value="NONE">Does not repeat</SelectItem>
            <SelectItem value="DAILY">Daily</SelectItem>
            <SelectItem value="WEEKLY">{weeklyPresetLabel(due)}</SelectItem>
            <SelectItem value="YEARLY">{annualPresetLabel(due)}</SelectItem>
            <SelectItem value="WEEKDAYS">Every weekday (Monday to Saturday)</SelectItem>
            <SelectSeparator />
            <SelectItem
              value="CUSTOM"
              onPointerDown={() => setCustomOpen(true)}
            >
              Custom…
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <CustomRecurrenceDialog
        open={customOpen}
        form={form}
        onCancel={() => setCustomOpen(false)}
        onDone={applyCustom}
      />
    </div>
  );
}
