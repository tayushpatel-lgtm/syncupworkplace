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

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [pasted, setPasted] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkResult, setBulkResult] = useState(null);

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

  async function importBulk(e) {
    e.preventDefault();
    setBulkBusy(true);
    setBulkError('');
    setBulkResult(null);
    const res = await fetch('/api/holidays/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, text: pasted }),
    });
    const data = await res.json().catch(() => ({}));
    setBulkBusy(false);
    if (!res.ok) {
      setBulkError(data.error || 'Could not read that list.');
      return;
    }
    setBulkResult(data);
    setPasted('');
    router.refresh();
  }

  return (
    <>
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
            {busy && <Icon.spinner width={14} height={14} />}
            {busy ? 'Adding…' : 'Add'}
          </button>
        </form>
        {error && <p className="error-line">{error}</p>}
      </section>

      <section className="card">
        <div className="card-head">
          <span className="glyph">
            <Icon.clipboard />
          </span>
          <div>
            <h2>Import a whole year at once</h2>
            <p>
              Paste a calendar list — one holiday per line, starting with the date (&quot;26 Jan&quot;).
              The weekday and holiday type are fine to leave in; only the date and the name get kept.
            </p>
          </div>
        </div>

        <form onSubmit={importBulk}>
          <label className="field-label">YEAR</label>
          <input
            className="input"
            type="number"
            style={{ width: 140 }}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2000}
            max={2100}
          />

          <label className="field-label" style={{ marginTop: 16 }}>
            PASTE THE LIST
          </label>
          <textarea
            className="textarea"
            style={{ minHeight: 220, fontFamily: 'var(--mono)', fontSize: 13 }}
            placeholder={'26 Jan\tMonday\tRepublic Day\tGazetted Holiday\n4 Mar\tWednesday\tHoli\tGazetted Holiday\n…'}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />

          <div className="row end" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={bulkBusy || !pasted.trim()}>
              {bulkBusy ? <Icon.spinner width={15} height={15} /> : <Icon.plus width={15} height={15} />}
              {bulkBusy ? 'Importing…' : 'Import the list'}
            </button>
          </div>
        </form>

        {bulkError && <p className="error-line">{bulkError}</p>}
        {bulkResult && (
          <div className="notice-line">
            <b>
              {bulkResult.added} holiday{bulkResult.added === 1 ? '' : 's'} added for {year}.
            </b>
            {bulkResult.skipped.length > 0 && (
              <>
                <p style={{ margin: '8px 0 4px' }}>
                  {bulkResult.skipped.length} line{bulkResult.skipped.length === 1 ? '' : 's'} couldn&apos;t
                  be read — add these by hand above:
                </p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {bulkResult.skipped.map((line, i) => (
                    <li key={i} className="mono" style={{ fontSize: 12 }}>
                      {line}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>
    </>
  );
}
