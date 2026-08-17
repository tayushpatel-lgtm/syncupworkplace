'use client';

import { useState } from 'react';
import { useRouter } from '../../lib/useRouter';
import { Icon } from '../../components/Icons';

export default function LeaveForm() {
  const router = useRouter();
  const [form, setForm] = useState({ kind: 'PLANNED', startDate: '', endDate: '', reason: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not file that request.');
      return;
    }
    setForm({ kind: 'PLANNED', startDate: '', endDate: '', reason: '' });
    router.refresh();
  }

  return (
    <section className="card">
      <div className="card-head">
        <span className="glyph">
          <Icon.plus />
        </span>
        <div>
          <h2>Ask for leave</h2>
          <p>
            Days are counted against the working week — weekends and holidays inside the range cost
            you nothing.
          </p>
        </div>
      </div>

      <form onSubmit={submit}>
        <div className="grid-4" style={{ gap: 18 }}>
          <div>
            <label className="field-label">KIND</label>
            <select
              className="select"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              <option value="PLANNED">Planned</option>
              <option value="SICK">Sick</option>
            </select>
          </div>
          <div>
            <label className="field-label">FROM</label>
            <input
              className="input"
              type="date"
              value={form.startDate}
              onChange={(e) =>
                setForm({
                  ...form,
                  startDate: e.target.value,
                  // A single day is the common case — mirror it so nobody has to type it twice.
                  endDate: form.endDate && form.endDate >= e.target.value ? form.endDate : e.target.value,
                })
              }
              required
            />
          </div>
          <div>
            <label className="field-label">TO</label>
            <input
              className="input"
              type="date"
              min={form.startDate || undefined}
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="field-label">REASON — OPTIONAL</label>
            <input
              className="input"
              placeholder="Family wedding"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
        </div>

        <div className="row end" style={{ marginTop: 20 }}>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || !form.startDate || !form.endDate}
          >
            {busy && <Icon.spinner width={14} height={14} />}
            {busy ? 'Filing…' : 'File the request'}
          </button>
        </div>
      </form>
      {error && <p className="error-line">{error}</p>}
    </section>
  );
}
