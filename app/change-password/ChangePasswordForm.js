'use client';

import { useState } from 'react';
import { useRouter } from '../../lib/useRouter';
import { Icon } from '../../components/Icons';

export default function ChangePasswordForm({ name }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Those two do not match.');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(data.error || 'Could not set that password.');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand">
          <b>SYNCUP</b>
          <span>SET A PASSWORD</span>
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: 21, fontWeight: 600 }}>Welcome, {name}.</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          You're signed in with a starting password — pick one only you know before you go any
          further.
        </p>

        <label className="field-label" htmlFor="password" style={{ marginTop: 18 }}>
          NEW PASSWORD
        </label>
        <input
          id="password"
          className="input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          placeholder="At least 8 characters"
          required
        />

        <label className="field-label" htmlFor="confirm" style={{ marginTop: 14 }}>
          CONFIRM
        </label>
        <input
          id="confirm"
          className="input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          required
        />

        <button
          className="btn btn-primary"
          type="submit"
          style={{ marginTop: 20 }}
          disabled={busy || password.length < 8 || confirm.length < 8}
        >
          {busy && <Icon.spinner width={14} height={14} />}
          {busy ? 'Saving…' : 'Set password and continue'}
        </button>
        {error && <p className="error-line">{error}</p>}
      </form>
    </div>
  );
}
