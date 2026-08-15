'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../../components/Icons';
import { Person } from '../../../components/ui';

const ROLES = [
  ['EMPLOYEE', 'Employee'],
  ['ADMIN', 'Admin'],
  ['CEO', 'CEO'],
];

const BLANK = {
  name: '',
  email: '',
  password: '',
  role: 'EMPLOYEE',
  department: '',
  title: '',
  checkInBy: '',
};

export default function PeopleManager({
  people,
  defaultCheckInBy,
  assignmentCap,
  currentUserId,
  isCeo,
}) {
  const router = useRouter();
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const res = await fetch('/api/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not add that person.');
      return;
    }
    setNotice(`${form.name} can sign in with the password you set.`);
    setForm(BLANK);
    router.refresh();
  }

  async function patch(id, body, message) {
    setError('');
    setNotice('');
    const res = await fetch(`/api/people/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Could not save that.');
      return false;
    }
    if (message) setNotice(message);
    setEditing(null);
    router.refresh();
    return true;
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <span className="glyph">
            <Icon.plus />
          </span>
          <div>
            <h2>Add someone</h2>
            <p>
              They sign in with the email and password you set here, and land on the onboarding
              checklist before they reach anything else.
            </p>
          </div>
        </div>

        <form onSubmit={add}>
          <div className="grid-3" style={{ gap: 18 }}>
            <div>
              <label className="field-label">NAME</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Riza Khan"
                required
              />
            </div>
            <div>
              <label className="field-label">WORK EMAIL</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="riza@syncup.in"
                required
              />
            </div>
            <div>
              <label className="field-label">FIRST PASSWORD</label>
              <input
                className="input"
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters"
                minLength={8}
                required
              />
            </div>
          </div>

          <div className="grid-4" style={{ gap: 18, marginTop: 18 }}>
            <div>
              <label className="field-label">DEPARTMENT</label>
              <input
                className="input"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="Engineering"
              />
            </div>
            <div>
              <label className="field-label">TITLE</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Developer"
              />
            </div>
            <div>
              <label className="field-label">ROLE</label>
              <select
                className="select"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {ROLES.filter(([value]) => isCeo || value !== 'CEO').map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">CHECK-IN BY</label>
              <input
                className="input"
                type="time"
                value={form.checkInBy}
                onChange={(e) => setForm({ ...form, checkInBy: e.target.value })}
                placeholder={defaultCheckInBy}
              />
              <p className="hint" style={{ fontSize: 12 }}>
                Blank uses {defaultCheckInBy}.
              </p>
            </div>
          </div>

          <div className="row end" style={{ marginTop: 20 }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Adding…' : 'Add them'}
            </button>
          </div>
        </form>
        {error && <p className="error-line">{error}</p>}
        {notice && <p className="notice-line">{notice}</p>}
      </section>

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>PERSON</th>
              <th>DEPARTMENT</th>
              <th>ROLE</th>
              <th>CHECK-IN BY</th>
              <th className="right">OPEN TASKS</th>
              <th className="right" />
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const isEditing = editing === p.id;
              return (
                <tr key={p.id} style={p.active ? undefined : { opacity: 0.5 }}>
                  <td>
                    <Person name={p.name} sub={p.email} />
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        className="input"
                        defaultValue={p.department}
                        onBlur={(e) => patch(p.id, { department: e.target.value })}
                      />
                    ) : (
                      <span className="muted">{p.department || '—'}</span>
                    )}
                  </td>
                  <td>
                    <select
                      className="select"
                      value={p.role}
                      disabled={p.id === currentUserId}
                      onChange={(e) => patch(p.id, { role: e.target.value })}
                      style={{ padding: '7px 10px', width: 'auto' }}
                    >
                      {ROLES.filter(([value]) => isCeo || value !== 'CEO').map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      type="time"
                      value={p.checkInBy || defaultCheckInBy}
                      onChange={(e) => patch(p.id, { checkInBy: e.target.value })}
                      style={{ padding: '7px 10px', width: 130 }}
                    />
                  </td>
                  <td className="num right">
                    <span className={`chip ${p.openTasks >= assignmentCap ? 'red' : ''}`}>
                      {p.openTasks}
                    </span>
                  </td>
                  <td className="right">
                    <div className="row end" style={{ gap: 6 }}>
                      <button
                        className="btn btn-sm"
                        onClick={() => setEditing(isEditing ? null : p.id)}
                      >
                        {isEditing ? 'Done' : 'Edit'}
                      </button>
                      <button
                        className={`btn btn-sm ${p.active ? 'btn-danger' : ''}`}
                        disabled={p.id === currentUserId}
                        onClick={() =>
                          patch(
                            p.id,
                            { active: !p.active },
                            p.active ? `${p.name} can no longer sign in.` : `${p.name} is back.`,
                          )
                        }
                      >
                        {p.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
