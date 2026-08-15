'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../components/Icons';

export default function HolidayAdmin() {
  const router = useRouter();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, name }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not add that holiday.');
      return;
    }
    setDate('');
    setName('');
    router.refresh();
  }

  return (
    <section className="card">
      <div className="card-head">
        <span className="glyph">
          <Icon.plus />
        </span>
        <div>
          <h2>Add a holiday</h2>
          <p>
            A holiday is not a working day. Attendance stops expecting anyone that day, and the
            denominator behind every attendance percentage drops with it.
          </p>
        </div>
      </div>

      <form className="row" onSubmit={add}>
        <div style={{ width: 200 }}>
          <label className="field-label">DATE</label>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">WHAT IT IS</label>
          <input
            className="input"
            placeholder="Independence Day"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <button
          className="btn btn-primary"
          type="submit"
          style={{ marginTop: 27 }}
          disabled={busy || !date || !name.trim()}
        >
          Add
        </button>
      </form>
      {error && <p className="error-line">{error}</p>}
    </section>
  );
}
