'use client';

import { useState } from 'react';
import { useRouter } from '../../lib/useRouter';
import { Icon } from '../../components/Icons';
import { PageHead, Card } from '../../components/ui';

export default function AccountForm({ name, email, role, department, slackUserId }) {
  const router = useRouter();
  const [value, setValue] = useState(slackUserId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwNotice, setPwNotice] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    const res = await fetch('/api/account/slack-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not save that.');
      return;
    }
    setNotice(value.trim() ? 'Saved. Slack DMs will use this from now on.' : 'Cleared.');
    router.refresh();
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwError('');
    setPwNotice('');
    if (password !== confirm) {
      setPwError('Those two do not match.');
      return;
    }
    setPwBusy(true);
    const res = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    setPwBusy(false);
    if (!res.ok) {
      setPwError(data.error || 'Could not set that password.');
      return;
    }
    setPassword('');
    setConfirm('');
    setPwNotice('Password changed.');
  }

  return (
    <>
      <PageHead title="Your account" subtitle="What Syncup and Slack know about you." />

      <Card glyph="users" title={name} description={`${email} · ${role.toLowerCase()}${department ? ` · ${department}` : ''}`}>
        <label className="field-label">SLACK MEMBER ID</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            placeholder="U0123ABCDE"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ maxWidth: 260 }}
          />
          <button className="btn" onClick={save} disabled={busy}>
            {busy && <Icon.spinner width={14} height={14} />}
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="hint">
          Personal Slack DMs from Syncup (check-in, task assignments, deadlines and the rest) find
          you one of two ways: automatically, by matching this account&apos;s email to a Slack
          account — or directly, from the ID you paste here. In Slack: your profile picture → the
          ••• menu → <b>Copy member ID</b>. Leave it blank to fall back to the automatic match.
        </p>
        {error && <p className="error-line">{error}</p>}
        {notice && <p className="notice-line">{notice}</p>}
      </Card>

      <Card glyph="key" title="Change your password" description="Pick a new one whenever you like — no need to wait for it to be forced on you.">
        <form onSubmit={savePassword}>
          <div className="grid-2" style={{ gap: 18 }}>
            <div>
              <label className="field-label">NEW PASSWORD</label>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="field-label">CONFIRM</label>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
              />
            </div>
          </div>

          <div className="row end" style={{ marginTop: 18 }}>
            <button className="btn" type="submit" disabled={pwBusy || password.length < 8 || confirm.length < 8}>
              {pwBusy && <Icon.spinner width={14} height={14} />}
              {pwBusy ? 'Saving…' : 'Change password'}
            </button>
          </div>
          {pwError && <p className="error-line">{pwError}</p>}
          {pwNotice && <p className="notice-line">{pwNotice}</p>}
        </form>
      </Card>
    </>
  );
}
