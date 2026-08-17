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
    </>
  );
}
