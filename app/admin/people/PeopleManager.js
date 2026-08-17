'use client';

import { useState } from 'react';
import { useRouter } from '../../../lib/useRouter';
import { Icon } from '../../../components/Icons';
import { Person, Modal, Switch } from '../../../components/ui';

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

const ROLE_LABEL = Object.fromEntries(ROLES);
const EMPLOYMENT_LABEL = Object.fromEntries(EMPLOYMENT_TYPES);

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

  // The person being edited, a working copy of their fields, and which face of
  // the modal is showing — the password flow reuses the same panel rather than
  // stacking a second modal on top of the first.
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [view, setView] = useState('edit');
  const [saveBusy, setSaveBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState('');
  const [editError, setEditError] = useState('');

  const [pw, setPw] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

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

  async function patch(id, body) {
    const res = await fetch(`/api/people/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || 'Could not save that.' };
    return { ok: true };
  }

  function open(person) {
    setEditing(person);
    setDraft({ ...person });
    setView('edit');
    setEditError('');
    setPwSaved(false);
    setPwError('');
    setError('');
    setNotice('');
  }

  function close() {
    setEditing(null);
    setDraft(null);
  }

  /** Only what actually moved — so saving never re-sends a field the API would reject. */
  function changedFields() {
    const out = {};
    if (draft.name !== editing.name) out.name = draft.name;
    if (draft.department !== editing.department) out.department = draft.department;
    if (draft.title !== editing.title) out.title = draft.title;
    if (draft.role !== editing.role) out.role = draft.role;
    if (draft.employmentType !== editing.employmentType) out.employmentType = draft.employmentType;
    if (draft.checkInBy !== editing.checkInBy) out.checkInBy = draft.checkInBy;
    if (draft.minPresentMinutes !== editing.minPresentMinutes) {
      out.minPresentMinutes =
        draft.minPresentMinutes === '' ? null : Number(draft.minPresentMinutes);
    }
    if (draft.mustChangePassword !== editing.mustChangePassword) {
      out.mustChangePassword = draft.mustChangePassword;
    }
    return out;
  }

  async function save(e) {
    e.preventDefault();
    const body = changedFields();
    if (Object.keys(body).length === 0) {
      close();
      return;
    }
    setSaveBusy(true);
    setEditError('');
    const res = await patch(editing.id, body);
    setSaveBusy(false);
    if (!res.ok) {
      setEditError(res.error);
      return;
    }
    setNotice(`Saved ${draft.name}.`);
    close();
    router.refresh();
  }

  async function toggleActive() {
    setActionBusy('active');
    setEditError('');
    const res = await patch(editing.id, { active: !editing.active });
    setActionBusy('');
    if (!res.ok) {
      setEditError(res.error);
      return;
    }
    setNotice(editing.active ? `${editing.name} can no longer sign in.` : `${editing.name} is back.`);
    close();
    router.refresh();
  }

  function openPassword() {
    setPw(generatePassword());
    setPwSaved(false);
    setPwError('');
    setView('password');
  }

  async function submitReset(e) {
    e.preventDefault();
    setPwError('');
    setPwBusy(true);
    const res = await patch(editing.id, { password: pw });
    setPwBusy(false);
    if (!res.ok) {
      setPwError(res.error);
      return;
    }
    setPwSaved(true);
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
        <p className="hint" style={{ marginTop: 0 }}>
          Click anyone to edit their details.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>PERSON</th>
              <th>DEPARTMENT</th>
              <th>ROLE</th>
              <th>EMPLOYMENT</th>
              <th>CHECK-IN BY</th>
              <th className="right">OPEN TASKS</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr
                key={p.id}
                className="row-link"
                onClick={() => open(p)}
                style={p.active ? undefined : { opacity: 0.5 }}
              >
                <td>
                  <Person name={p.name} sub={p.email} />
                </td>
                <td className="muted">{p.department || '—'}</td>
                <td>{ROLE_LABEL[p.role]}</td>
                <td className="muted">{EMPLOYMENT_LABEL[p.employmentType]}</td>
                <td className="num muted">{p.checkInBy || defaultCheckInBy}</td>
                <td className="num right">
                  <div className="row end" style={{ gap: 8 }}>
                    {!p.active && <span className="chip">inactive</span>}
                    {p.mustChangePassword && <span className="chip amber">new password due</span>}
                    <span className={`chip ${p.openTasks >= assignmentCap ? 'red' : ''}`}>
                      {p.openTasks}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Modal
        open={!!editing && view === 'edit'}
        onClose={close}
        title={editing ? editing.name : ''}
        description={editing ? editing.email : ''}
        wide
      >
        {editing && draft && (
          <form onSubmit={save}>
            <div className="grid-2" style={{ gap: 18 }}>
              <div>
                <label className="field-label">NAME</label>
                <input
                  className="input"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="field-label">TITLE</label>
                <input
                  className="input"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Developer"
                />
              </div>
            </div>

            <div className="grid-2" style={{ gap: 18, marginTop: 18 }}>
              <div>
                <label className="field-label">DEPARTMENT</label>
                <DepartmentSelect
                  value={draft.department}
                  departments={departments}
                  onChange={(e) => setDraft({ ...draft, department: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">EMPLOYMENT</label>
                <select
                  className="select"
                  value={draft.employmentType}
                  onChange={(e) => setDraft({ ...draft, employmentType: e.target.value })}
                >
                  {EMPLOYMENT_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <p className="hint" style={{ fontSize: 12 }}>
                  Sets their leave policy.
                </p>
              </div>
            </div>

            <div className="grid-3" style={{ gap: 18, marginTop: 18 }}>
              <div>
                <label className="field-label">ROLE</label>
                <select
                  className="select"
                  value={draft.role}
                  disabled={editing.id === currentUserId}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                >
                  {ROLES.filter(([value]) => isCeo || value !== 'CEO').map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {editing.id === currentUserId && (
                  <p className="hint" style={{ fontSize: 12 }}>
                    You cannot change your own role.
                  </p>
                )}
              </div>
              <div>
                <label className="field-label">CHECK-IN BY</label>
                <input
                  className="input"
                  type="time"
                  value={draft.checkInBy}
                  onChange={(e) => setDraft({ ...draft, checkInBy: e.target.value })}
                />
                <p className="hint" style={{ fontSize: 12 }}>
                  Blank uses {defaultCheckInBy}.
                </p>
              </div>
              <div>
                <label className="field-label">MIN HOURS</label>
                <input
                  className="input"
                  type="number"
                  min={30}
                  max={720}
                  step={15}
                  value={draft.minPresentMinutes}
                  onChange={(e) => setDraft({ ...draft, minPresentMinutes: e.target.value })}
                  placeholder={String(defaultMinPresentMinutes)}
                />
                <p className="hint" style={{ fontSize: 12 }}>
                  Minutes. Blank uses {defaultMinPresentMinutes}.
                </p>
              </div>
            </div>

            <div className="divider" />

            <div className="row" style={{ gap: 13, alignItems: 'flex-start' }}>
              <Switch
                checked={draft.mustChangePassword}
                onChange={(next) => setDraft({ ...draft, mustChangePassword: next })}
                title="Force a new password on their next sign-in"
              />
              <div>
                <b style={{ fontSize: 15, fontWeight: 500 }}>Change password on next sign-in</b>
                <small style={{ display: 'block', marginTop: 4, color: 'var(--muted)', lineHeight: 1.5 }}>
                  They land on a &quot;set your own password&quot; screen before anything else. Clears
                  itself once they do.
                </small>
              </div>
            </div>

            <div className="divider" />

            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-sm" onClick={openPassword}>
                  <Icon.key width={13} height={13} />
                  Set a password
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${editing.active ? 'btn-danger' : ''}`}
                  disabled={editing.id === currentUserId || actionBusy === 'active'}
                  onClick={toggleActive}
                  title={
                    editing.id === currentUserId
                      ? 'You cannot deactivate yourself'
                      : editing.active
                        ? 'Stop them signing in'
                        : 'Let them sign in again'
                  }
                >
                  {actionBusy === 'active' && <Icon.spinner width={13} height={13} />}
                  {editing.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn" onClick={close}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" disabled={saveBusy}>
                  {saveBusy && <Icon.spinner width={14} height={14} />}
                  {saveBusy ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
            {editError && <p className="error-line">{editError}</p>}
          </form>
        )}
      </Modal>

      <Modal
        open={!!editing && view === 'password'}
        onClose={close}
        title={editing ? `Set a password for ${editing.name}` : 'Set a password'}
        description="They'll need this the next time they sign in, and will be asked to set their own right after. Share it with them directly — it isn't shown again after you close this."
      >
        {editing && (
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

            <div className="row end" style={{ marginTop: 20, gap: 8 }}>
              {pwSaved ? (
                <button type="button" className="btn" onClick={close}>
                  Done
                </button>
              ) : (
                <>
                  <button type="button" className="btn" onClick={() => setView('edit')}>
                    Back
                  </button>
                  <button className="btn btn-primary" type="submit" disabled={pw.length < 8 || pwBusy}>
                    {pwBusy && <Icon.spinner width={14} height={14} />}
                    {pwBusy ? 'Setting…' : 'Set password'}
                  </button>
                </>
              )}
            </div>
            {pwSaved && <p className="notice-line">Saved. Copy it now and send it to {editing.name}.</p>}
            {pwError && <p className="error-line">{pwError}</p>}
          </form>
        )}
      </Modal>
    </>
  );
}
