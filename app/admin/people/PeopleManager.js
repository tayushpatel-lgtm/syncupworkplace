'use client';

import { useState } from 'react';
import { useRouter } from '../../../lib/useRouter';
import { Icon } from '../../../components/Icons';
import { Person, Modal } from '../../../components/ui';

const ROLES = [
  ['EMPLOYEE', 'Employee'],
  ['ADMIN', 'Admin'],
  ['CEO', 'CEO'],
];

const EMPLOYMENT_TYPES = [
  ['FULL_TIME', 'Full-time'],
  ['INTERN', 'Intern'],
  ['FREELANCER', 'Freelancer'],
];

const BLANK = {
  name: '',
  email: '',
  role: 'EMPLOYEE',
  employmentType: 'FULL_TIME',
  department: '',
  title: '',
  checkInBy: '',
};

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** A readable random password — no 0/O/1/l/I, the characters people mistype. */
function generatePassword(length = 14) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join('');
}

function DepartmentSelect({ value, departments, onChange, style }) {
  // A legacy or hand-typed value that isn't in the managed list yet still
  // needs to show up, so editing never silently blanks someone's department.
  const options = value && !departments.includes(value) ? [value, ...departments] : departments;
  return (
    <select className="select" value={value} onChange={onChange} style={style}>
      <option value="">No department</option>
      {options.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}

export default function PeopleManager({
  people,
  defaultCheckInBy,
  defaultMinPresentMinutes,
  assignmentCap,
  departments,
  currentUserId,
  isCeo,
}) {
  const router = useRouter();
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(null); // the person whose password is being set
  const [pw, setPw] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState('');

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
    setNotice(`${form.name} can sign in with ${form.email} as both email and password.`);
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
    router.refresh();
    return true;
  }

  function openReset(person) {
    setResetting(person);
    setPw(generatePassword());
    setPwSaved(false);
    setPwError('');
  }

  async function submitReset(e) {
    e.preventDefault();
    setPwError('');
    setPwBusy(true);
    const res = await fetch(`/api/people/${resetting.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json().catch(() => ({}));
    setPwBusy(false);
    if (!res.ok) {
      setPwError(data.error || 'Could not set that password.');
      return;
    }
    setPwSaved(true);
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
              They sign in with their email as both the username and the starting password, and
              have to set their own before they reach anything else — the onboarding checklist
              included.
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
              <label className="field-label">EMPLOYMENT</label>
              <select
                className="select"
                value={form.employmentType}
                onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
              >
                {EMPLOYMENT_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-4" style={{ gap: 18, marginTop: 18 }}>
            <div>
              <label className="field-label">DEPARTMENT</label>
              <DepartmentSelect
                value={form.department}
                departments={departments}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
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
              {busy && <Icon.spinner width={14} height={14} />}
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
              <th>EMPLOYMENT</th>
              <th>ROLE</th>
              <th>CHECK-IN BY</th>
              <th>MIN HOURS</th>
              <th className="right">OPEN TASKS</th>
              <th className="right" />
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} style={p.active ? undefined : { opacity: 0.5 }}>
                <td>
                  <Person name={p.name} sub={p.email} />
                </td>
                <td>
                  <DepartmentSelect
                    value={p.department}
                    departments={departments}
                    onChange={(e) => patch(p.id, { department: e.target.value })}
                    style={{ padding: '7px 10px', width: 'auto' }}
                  />
                </td>
                <td>
                  <select
                    className="select"
                    value={p.employmentType}
                    onChange={(e) => patch(p.id, { employmentType: e.target.value })}
                    style={{ padding: '7px 10px', width: 'auto' }}
                  >
                    {EMPLOYMENT_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
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
                <td>
                  <input
                    className="input"
                    type="number"
                    min={30}
                    max={720}
                    step={15}
                    value={p.minPresentMinutes === '' ? defaultMinPresentMinutes : p.minPresentMinutes}
                    onChange={(e) => patch(p.id, { minPresentMinutes: Number(e.target.value) })}
                    style={{ padding: '7px 10px', width: 90 }}
                    title="Minutes worked to count as present"
                  />
                </td>
                <td className="num right">
                  <span className={`chip ${p.openTasks >= assignmentCap ? 'red' : ''}`}>
                    {p.openTasks}
                  </span>
                </td>
                <td className="right">
                  <div className="row end" style={{ gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => openReset(p)}>
                      <Icon.key width={13} height={13} />
                      Password
                    </button>
                    <button
                      className={`btn btn-sm ${p.active ? 'btn-danger' : ''}`}
                      disabled={p.id === currentUserId || rowBusy === p.id}
                      onClick={async () => {
                        setRowBusy(p.id);
                        await patch(
                          p.id,
                          { active: !p.active },
                          p.active ? `${p.name} can no longer sign in.` : `${p.name} is back.`,
                        );
                        setRowBusy('');
                      }}
                    >
                      {rowBusy === p.id && <Icon.spinner width={13} height={13} />}
                      {p.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        title={resetting ? `Set a password for ${resetting.name}` : 'Set a password'}
        description="They'll need this the next time they sign in, and will be asked to set their own right after. Share it with them directly — it isn't shown again after you close this."
      >
        {resetting && (
          <form onSubmit={submitReset}>
            <label className="field-label">PASSWORD</label>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input mono"
                type="text"
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value);
                  setPwSaved(false);
                }}
                minLength={8}
                required
              />
              <button
                type="button"
                className="btn-icon"
                title="Generate another"
                aria-label="Generate another"
                onClick={() => {
                  setPw(generatePassword());
                  setPwSaved(false);
                }}
              >
                <Icon.key width={15} height={15} />
              </button>
              <button
                type="button"
                className="btn-icon"
                title="Copy"
                aria-label="Copy"
                onClick={() => navigator.clipboard.writeText(pw)}
              >
                <Icon.copy width={15} height={15} />
              </button>
            </div>

            <div className="row end" style={{ marginTop: 20 }}>
              {pwSaved ? (
                <button type="button" className="btn" onClick={() => setResetting(null)}>
                  Done
                </button>
              ) : (
                <button className="btn btn-primary" type="submit" disabled={pw.length < 8 || pwBusy}>
                  {pwBusy && <Icon.spinner width={14} height={14} />}
                  {pwBusy ? 'Setting…' : 'Set password'}
                </button>
              )}
            </div>
            {pwSaved && <p className="notice-line">Saved. Copy it now and send it to {resetting.name}.</p>}
            {pwError && <p className="error-line">{pwError}</p>}
          </form>
        )}
      </Modal>
    </>
  );
}
