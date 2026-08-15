'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '../../../components/Icons';
import { Card, Stat, Person, Empty } from '../../../components/ui';
import { formatDuration, formatHours, formatDayLabel } from '../../../lib/dates';
import { rampColor } from '../../../lib/insights';

function HoursByDay({ series }) {
  const [hover, setHover] = useState(null);
  const worked = series.map((s) => s.minutes).filter((m) => m > 0);
  const max = Math.max(1, ...worked);
  // The quietest day that still had work in it anchors the light end of the ramp.
  const min = worked.length ? Math.min(...worked) : 0;

  return (
    <>
      <div style={{ position: 'relative' }}>
        {hover && (
          <div
            style={{
              position: 'absolute',
              top: -6,
              left: `${hover.pos}%`,
              transform: 'translateX(-50%)',
              background: 'var(--ink)',
              color: '#fff',
              padding: '7px 11px',
              borderRadius: 8,
              fontSize: 12.5,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <b className="mono">{formatDuration(hover.minutes)}</b> · {formatDayLabel(hover.key, { weekday: 'short' })}
            {hover.holiday ? ` · ${hover.holiday}` : hover.off ? ' · non-working' : ''}
          </div>
        )}

        <div className="bars">
          {series.map((point, i) => (
            <div
              key={point.key}
              className="bar"
              data-off={point.off ? '1' : '0'}
              style={{
                height: `${Math.max(2, (point.minutes / max) * 100)}%`,
                background: rampColor(point.minutes, max, min),
              }}
              onMouseEnter={() =>
                setHover({ ...point, pos: ((i + 0.5) / series.length) * 100 })
              }
              onMouseLeave={() => setHover(null)}
              title={`${formatDayLabel(point.key, { weekday: 'short' })} — ${formatDuration(point.minutes)}`}
            />
          ))}
        </div>
      </div>

      <div className="bars-axis">
        <span>{series[0]?.key.slice(5)}</span>
        <span>{series[series.length - 1]?.key.slice(5)}</span>
      </div>
    </>
  );
}

export default function InsightsView({ days, ranges, data }) {
  const [tab, setTab] = useState('company');

  const maxDept = Math.max(1, ...data.departments.map((d) => d.minutes));
  const spent = [
    ['PRODUCTIVE', formatHours(data.totals.workMinutes)],
    ['ON BREAK', formatHours(data.totals.breakMinutes)],
    ['DISCARDED AS IDLE', formatHours(data.totals.idleMinutes)],
    ['DAYS ON LEAVE', String(data.totals.leaveDays)],
  ];

  return (
    <>
      <div className="tabs">
        <button className={`tab ${tab === 'company' ? 'active' : ''}`} onClick={() => setTab('company')}>
          <Icon.chart width={16} height={16} />
          The company
        </button>
        <button className={`tab ${tab === 'people' ? 'active' : ''}`} onClick={() => setTab('people')}>
          <Icon.users width={16} height={16} />
          People
        </button>
        <button className={`tab ${tab === 'work' ? 'active' : ''}`} onClick={() => setTab('work')}>
          <Icon.list width={16} height={16} />
          Work
        </button>

        <div className="spacer" style={{ marginLeft: 'auto', paddingBottom: 10 }}>
          <div className="row" style={{ gap: 12 }}>
            <a className="btn btn-sm" href={`/api/insights/export?range=${days}`}>
              <Icon.download width={15} height={15} />
              Export CSV
            </a>
            <div className="segmented">
              {ranges.map((r) => (
                <Link key={r} href={`/admin/insights?range=${r}`}>
                  <button className={r === days ? 'on' : ''}>{r}d</button>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {tab === 'company' && (
        <>
          <div className="grid-4" style={{ marginBottom: 22 }}>
            <Stat
              label="TOTAL HOURS WORKED"
              value={formatHours(data.totals.workMinutes)}
              sub={`${data.contributors} of ${data.headcount} people contributed`}
              focus
            />
            <Stat
              label="AVERAGE PER PERSON"
              value={data.averagePerPersonLabel}
              sub={`over ${days} days`}
            />
            <Stat
              label="AVERAGE DAY"
              value={data.averageWorkedDayLabel}
              sub="when someone worked"
            />
            <Stat
              label="ATTENDANCE"
              value={`${data.attendancePct}%`}
              sub={`${data.lateTotal} late arrivals`}
            />
          </div>

          <Card
            title="Hours by day"
            description="Every session in the company, summed per day. Faded bars are weekends and holidays."
            action={
              <span className="legend">
                <span
                  className="ramp"
                  style={{ background: 'linear-gradient(90deg, #63c3a0, #158a63, #064e37)' }}
                />
                quiet → busy
              </span>
            }
          >
            <HoursByDay series={data.series} />
          </Card>

          <div className="grid-2">
            <Card title="By department">
              {data.departments.length === 0 && <Empty>No recorded time yet.</Empty>}
              {data.departments.map((dept) => (
                <div key={dept.name} className="meter">
                  <span>{dept.name}</span>
                  <div className="track">
                    <div
                      className="fill"
                      style={{
                        width: `${Math.max(2, (dept.minutes / maxDept) * 100)}%`,
                        background: rampColor(dept.minutes, maxDept),
                      }}
                    />
                  </div>
                  <span className="value">{formatHours(dept.minutes)}</span>
                  <span className="sub">{dept.people}p</span>
                </div>
              ))}
            </Card>

            <Card title="Where the time went">
              <div className="grid-2" style={{ gap: 16 }}>
                {spent.map(([label, value]) => (
                  <div key={label} className="stat">
                    <span className="kicker">{label}</span>
                    <b style={{ fontSize: 26 }}>{value}</b>
                  </div>
                ))}
              </div>
              <p className="hint">
                Discarded time is what the heartbeat caught: sleeping machines and idle tabs that
                nobody was sitting behind. It is never counted as work.
              </p>
            </Card>
          </div>
        </>
      )}

      {tab === 'people' && (
        <Card>
          {data.perPerson.length === 0 && <Empty>Nobody on the books yet.</Empty>}
          {data.perPerson.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>PERSON</th>
                  <th className="right">HOURS</th>
                  <th className="right">PRESENT</th>
                  <th className="right">LATE</th>
                  <th className="right">ON LEAVE</th>
                  <th className="right">REPORTS</th>
                  <th className="right">TASKS CLOSED</th>
                  <th className="right">ATTENDANCE</th>
                </tr>
              </thead>
              <tbody>
                {data.perPerson.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Person name={p.name} sub={p.department || '—'} />
                    </td>
                    <td className="num right">{formatHours(p.minutes)}</td>
                    <td className="num right">
                      {p.present}
                      <span className="muted"> / {p.expected}</span>
                    </td>
                    <td className="num right">{p.late || '—'}</td>
                    <td className="num right muted">{p.onLeave || '—'}</td>
                    <td className="num right">{p.reports}</td>
                    <td className="num right">{p.tasksClosed}</td>
                    <td className="right">
                      <span
                        className={`chip ${p.pct >= 90 ? 'green' : p.pct >= 70 ? 'amber' : 'red'}`}
                      >
                        {p.pct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'work' && (
        <>
          <div className="grid-4" style={{ marginBottom: 22 }}>
            <Stat label="TASKS CLOSED" value={data.work.completed} sub={`in the last ${days} days`} focus />
            <Stat label="STILL OPEN" value={data.work.open} sub={`${data.work.blocked} blocked`} />
            <Stat label="OVERDUE" value={data.work.overdue} sub="past the deadline" />
            <Stat
              label="AVERAGE TIME TO CLOSE"
              value={`${data.work.averageCloseDays.toFixed(1)}d`}
              sub="assignment to completion"
            />
          </div>

          <Card title="Open work by priority" description="What the company is currently holding.">
            {Object.entries(data.work.priorityCounts).map(([priority, count]) => {
              const total = Math.max(1, data.work.open);
              return (
                <div key={priority} className="meter">
                  <span>{priority.toLowerCase()}</span>
                  <div className="track">
                    <div
                      className="fill"
                      style={{
                        width: `${Math.max(2, (count / total) * 100)}%`,
                        background: rampColor(count, total),
                      }}
                    />
                  </div>
                  <span className="value">{count}</span>
                  <span className="sub">{Math.round((count / total) * 100)}%</span>
                </div>
              );
            })}
          </Card>
        </>
      )}
    </>
  );
}
