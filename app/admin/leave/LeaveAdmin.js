'use client';

import { useState } from 'react';
import { useRouter } from '../../../lib/useRouter';
import { Icon } from '../../../components/Icons';
import { Person, Empty } from '../../../components/ui';

const KIND_LABEL = { SICK: 'Sick', PLANNED: 'Planned' };
const STATUS_TONE = { APPROVED: 'green', REJECTED: 'red', PENDING: 'amber', CANCELLED: '' };

function dateSpan(start, end) {
  const fmt = (k) =>
    new Date(`${k}T00:00:00.000Z`).toLocaleDateString('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
    });
  return start === end ? fmt(start) : `${fmt(start)} → ${fmt(end)}`;
}

export default function LeaveAdmin({ year, requests, rows, workingDays }) {
  const router = useRouter();
  const [tab, setTab] = useState('requests');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [granting, setGranting] = useState(null);
  const [grant, setGrant] = useState({ kind: 'PLANNED', days: 1 });
  const [policy, setPolicy] = useState({ sickTotal: 12, plannedTotal: 12 });
  const [busy, setBusy] = useState('');

  const waiting = requests.filter((r) => r.status === 'PENDING');
  const settled = requests.filter((r) => r.status !== 'PENDING');

  async function post(url, body, message) {
    setError('');
    setNotice('');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'That did not go through.');
      return false;
    }
    if (message) setNotice(message);
    router.refresh();
    return true;
  }

  async function withBusy(key, fn) {
    setBusy(key);
    try {
      return await fn();
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <div className="tabs">
        <button className={`tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>
          <Icon.doc width={16} height={16} />
          Requests
          {waiting.length > 0 && <span className="chip amber">{waiting.length}</span>}
        </button>
        <button className={`tab ${tab === 'balances' ? 'active' : ''}`} onClick={() => setTab('balances')}>
          <Icon.users width={16} height={16} />
          Balances
        </button>
        <button className={`tab ${tab === 'policy' ? 'active' : ''}`} onClick={() => setTab('policy')}>
          <Icon.gear width={16} height={16} />
          Policy
        </button>
      </div>

      {error && <p className="error-line">{error}</p>}
      {notice && <p className="notice-line">{notice}</p>}

      {tab === 'requests' && (
        <section className="card">
          {requests.length === 0 && <Empty>No leave has been asked for.</Empty>}
          {requests.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>PERSON</th>
                  <th>KIND</th>
                  <th>DATES</th>
                  <th className="right">DAYS</th>
                  <th>REASON</th>
                  <th className="right">DECISION</th>
                </tr>
              </thead>
              <tbody>
                {[...waiting, ...settled].map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Person name={r.user.name} sub={r.user.department || '—'} />
                    </td>
                    <td>{KIND_LABEL[r.kind]}</td>
                    <td className="num">{dateSpan(r.startDate, r.endDate)}</td>
                    <td className="num right">{r.days}</td>
                    <td className="muted">{r.reason || '—'}</td>
                    <td className="right">
                      {r.status === 'PENDING' ? (
                        <div className="row end" style={{ gap: 6 }}>
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={busy === `${r.id}-approve` || busy === `${r.id}-reject`}
                            onClick={() =>
                              withBusy(`${r.id}-approve`, () =>
                                post(
                                  '/api/leave/decide',
                                  { id: r.id, decision: 'APPROVED' },
                                  `${r.user.name}'s leave is approved.`,
                                ),
                              )
                            }
                          >
                            {busy === `${r.id}-approve` && <Icon.spinner width={13} height={13} />}
                            Approve
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={busy === `${r.id}-approve` || busy === `${r.id}-reject`}
                            onClick={() =>
                              withBusy(`${r.id}-reject`, () =>
                                post(
                                  '/api/leave/decide',
                                  { id: r.id, decision: 'REJECTED' },
                                  `${r.user.name}'s request was turned down.`,
                                ),
                              )
                            }
                          >
                            {busy === `${r.id}-reject` && <Icon.spinner width={13} height={13} />}
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className={`chip ${STATUS_TONE[r.status]}`}>
                          {r.status.toLowerCase()}
                          {r.decider ? ` · ${r.decider}` : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'balances' && (
        <section className="card">
          <table className="table">
            <thead>
              <tr>
                <th>EMPLOYEE</th>
                <th className="right">SICK LEFT</th>
                <th className="right">USED</th>
                <th className="right">PLANNED LEFT</th>
                <th className="right">CARRIED</th>
                <th className="right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Person name={row.name} sub={row.department || '—'} />
                  </td>
                  <td className="num right">{row.sickLeft}</td>
                  <td className="num right">{row.used}</td>
                  <td className="num right">{row.plannedLeft}</td>
                  <td className="num right">{row.carried}</td>
                  <td className="right">
                    {granting === row.id ? (
                      <div className="row end" style={{ gap: 6 }}>
                        <select
                          className="select"
                          style={{ width: 120, padding: '7px 10px' }}
                          value={grant.kind}
                          onChange={(e) => setGrant({ ...grant, kind: e.target.value })}
                        >
                          <option value="PLANNED">Planned</option>
                          <option value="SICK">Sick</option>
                        </select>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={60}
                          style={{ width: 80, padding: '7px 10px' }}
                          value={grant.days}
                          onChange={(e) => setGrant({ ...grant, days: Number(e.target.value) })}
                        />
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy === `grant-${row.id}`}
                          onClick={() =>
                            withBusy(`grant-${row.id}`, async () => {
                              const ok = await post(
                                '/api/leave/grant',
                                { userId: row.id, kind: grant.kind, days: grant.days, year },
                                `${grant.days} day${grant.days === 1 ? '' : 's'} granted to ${row.name}.`,
                              );
                              if (ok) setGranting(null);
                            })
                          }
                        >
                          {busy === `grant-${row.id}` && <Icon.spinner width={13} height={13} />}
                          Grant
                        </button>
                        <button className="btn btn-sm" onClick={() => setGranting(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-sm" onClick={() => setGranting(row.id)}>
                        <Icon.plus width={14} height={14} />
                        Grant
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'policy' && (
        <section className="card">
          <div className="card-head">
            <span className="glyph">
              <Icon.gear />
            </span>
            <div>
              <h2>The leave policy for {year}</h2>
              <p>
                What everyone starts the year with. Saving this resets the allowance for every
                person — days already used stay used, and anything granted by hand stays on top.
              </p>
            </div>
          </div>

          <div className="grid-2" style={{ gap: 22 }}>
            <div>
              <label className="field-label">SICK DAYS A YEAR</label>
              <input
                className="input"
                type="number"
                min={0}
                max={365}
                value={policy.sickTotal}
                onChange={(e) => setPolicy({ ...policy, sickTotal: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="field-label">PLANNED DAYS A YEAR</label>
              <input
                className="input"
                type="number"
                min={0}
                max={365}
                value={policy.plannedTotal}
                onChange={(e) => setPolicy({ ...policy, plannedTotal: Number(e.target.value) })}
              />
            </div>
          </div>

          <p className="hint">
            Leave is counted in working days. The working week is set on the Settings page — right
            now it runs {workingDays.length} days, so weekends and holidays inside a request cost
            nobody anything.
          </p>

          <div className="row end" style={{ marginTop: 20 }}>
            <button
              className="btn btn-primary"
              disabled={busy === 'policy'}
              onClick={() =>
                withBusy('policy', () =>
                  post('/api/leave/policy', { ...policy, year }, 'The policy applies to everyone now.'),
                )
              }
            >
              {busy === 'policy' && <Icon.spinner width={14} height={14} />}
              Apply to everyone
            </button>
          </div>
        </section>
      )}
    </>
  );
}
