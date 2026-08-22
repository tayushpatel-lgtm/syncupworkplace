'use client';

import { useState } from 'react';
import { useRouter } from '../../../lib/useRouter';
import { Icon } from '../../../components/Icons';
import { PageHead, Card } from '../../../components/ui';

const DAYS = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [7, 'Sun'],
];

function Check({ checked, onChange, title, detail, disabled = false }) {
  return (
    <label className="check" style={disabled ? { opacity: 0.5 } : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="box">
        <Icon.check width={12} height={12} strokeWidth={2.6} />
      </span>
      <span className="label">
        <b>{title}</b>
        <small>{detail}</small>
      </span>
    </label>
  );
}

export default function SettingsForm({
  initial,
  webhookSet,
  botTokenSet,
  sheetsKeySet,
  cronConfigured,
  steps,
  tokens,
  mcpUrl,
  apps,
  departments,
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [webhook, setWebhook] = useState('');
  const [botToken, setBotToken] = useState('');
  const [sheetsKey, setSheetsKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [step, setStep] = useState({ title: '', description: '', kind: 'CHECK' });
  const [tokenName, setTokenName] = useState('');
  const [tokenScope, setTokenScope] = useState('READ_ONLY');
  const [freshToken, setFreshToken] = useState('');
  const [app, setApp] = useState({ name: '', description: '', url: '', icon: '◆', department: '' });
  const [deptName, setDeptName] = useState('');
  const [actionBusy, setActionBusy] = useState('');

  const set = (patch) => setForm((cur) => ({ ...cur, ...patch }));

  /** Runs one action under a named busy key, so its button (and only its button) shows a spinner. */
  async function withBusy(key, fn) {
    setActionBusy(key);
    try {
      return await fn();
    } finally {
      setActionBusy('');
    }
  }

  function toggleDay(day) {
    const next = form.workingDays.includes(day)
      ? form.workingDays.filter((d) => d !== day)
      : [...form.workingDays, day].sort((a, b) => a - b);
    set({ workingDays: next });
  }

  async function post(url, body, message, method = 'POST') {
    setError('');
    setNotice('');
    // Never let a button spin forever — the slowest thing on this page (the
    // Sheets sync) is itself capped server-side at 60s, so anything past that
    // is a genuine hang, not real work still happening.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65_000);
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      setError(err.name === 'AbortError' ? 'That took too long and was cancelled. Try again.' : 'Could not reach the server.');
      return null;
    } finally {
      clearTimeout(timeout);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'That did not save.');
      return null;
    }
    if (message) setNotice(message);
    router.refresh();
    return data;
  }

  async function save() {
    if (form.workingDays.length === 0) {
      setError('At least one day has to count as working.');
      return;
    }
    setSaving(true);
    await post(
      '/api/settings',
      {
        ...form,
        slackWebhookUrl: webhook || undefined,
        slackBotToken: botToken || undefined,
        sheetsPrivateKey: sheetsKey || undefined,
      },
      'Settings saved.',
    );
    setWebhook('');
    setBotToken('');
    setSheetsKey('');
    setSaving(false);
  }

  return (
    <>
      <PageHead title="Settings" subtitle="How the company's rules are enforced, and where the noise goes.">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Icon.spinner width={15} height={15} /> : <Icon.check width={15} height={15} />}
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </PageHead>

      {error && <p className="error-line">{error}</p>}
      {notice && <p className="notice-line">{notice}</p>}

      <div className="grid-2">
        <Card
          glyph="list"
          title="Assignment cap"
          description="The most unfinished tasks one person can be holding before they stop being assignable. Counted per person, not company-wide — twenty tasks across ten people is a normal week, twenty on one person is not."
        >
          <label className="field-label">OPEN TASKS EACH</label>
          <div className="row">
            <input
              className="input"
              type="number"
              min={1}
              max={200}
              style={{ width: 160 }}
              value={form.assignmentCap}
              onChange={(e) => set({ assignmentCap: Number(e.target.value) })}
            />
            <span className="muted" style={{ fontSize: 13.5 }}>
              Blocked at {form.assignmentCap}. Completed tasks stop counting immediately.
            </span>
          </div>
        </Card>

        <Card
          glyph="edit"
          title="End-of-day reports"
          description="The app composes the report from the day's real data. The only thing anyone types is what it added up to."
        >
          <div className="check-stack">
            <Check
              checked={form.reportRequired}
              onChange={(v) => set({ reportRequired: v })}
              title="Required to close the day"
              detail="A day can't be ended without filing. Leave this on — the reports that go missing are the ones from the days someone rushed off, which are the days worth reading."
            />
            <Check
              checked={form.planFromTasks}
              onChange={(v) => set({ planFromTasks: v })}
              title="Start the day's plan from assigned tasks"
              detail="On check-in, every open task assigned to them appears on today's plan. They can add or remove lines freely; removals stick for the day."
            />
          </div>
        </Card>
      </div>

      <Card
        glyph="calendar"
        title="The working week"
        description="Which days count as working. Everything downstream reads this — the attendance roll, the calendar shading, and the denominator behind every attendance percentage."
      >
        <div className="day-pills">
          {DAYS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`day-pill ${form.workingDays.includes(value) ? 'on' : ''}`}
              onClick={() => toggleDay(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="divider" />

        <label className="field-label">DEFAULT CHECK-IN BY</label>
        <div className="row">
          <input
            className="input"
            type="time"
            style={{ width: 180 }}
            value={form.defaultCheckInBy}
            onChange={(e) => set({ defaultCheckInBy: e.target.value })}
          />
          <span className="muted" style={{ fontSize: 13.5 }}>
            Used for anyone without a time of their own. Set individual times on the People page.
          </span>
        </div>

        <div className="divider" />

        <label className="field-label">MINIMUM HOURS TO COUNT AS PRESENT</label>
        <div className="row">
          <input
            className="input"
            type="number"
            min={30}
            max={720}
            step={15}
            style={{ width: 180 }}
            value={form.minPresentMinutes}
            onChange={(e) => set({ minPresentMinutes: Number(e.target.value) })}
          />
          <span className="muted" style={{ fontSize: 13.5 }}>
            In minutes — {(form.minPresentMinutes / 60).toFixed(1)}h. Checked in but under this and
            the day reads as short, not present. Set individual minimums on the People page.
          </span>
        </div>

        <div className="divider" />

        <label className="field-label">DISCARD AS IDLE AFTER</label>
        <div className="row">
          <input
            className="input"
            type="number"
            min={2}
            max={120}
            style={{ width: 180 }}
            value={form.idleAfterMinutes}
            onChange={(e) => set({ idleAfterMinutes: Number(e.target.value) })}
          />
          <span className="muted" style={{ fontSize: 13.5 }}>
            Minutes of silence from a running timer before the stretch stops counting as work.
            Frozen onto each session when it starts, so changing this mid-day does not rewrite
            already-elapsed silence.
          </span>
        </div>

        <div className="divider" />

        <label className="field-label">STALE BREAK ALERT AFTER</label>
        <div className="row">
          <input
            className="input"
            type="number"
            min={5}
            max={240}
            style={{ width: 180 }}
            value={form.staleBreakAlertMinutes ?? 30}
            onChange={(e) => set({ staleBreakAlertMinutes: Number(e.target.value) })}
          />
          <span className="muted" style={{ fontSize: 13.5 }}>
            Minutes of silence on a BREAK session before a Slack DM fires. Forgotten breaks
            otherwise produce no signal at all.
          </span>
        </div>

        <div className="divider" />

        <label className="field-label">ABANDONED SESSIONS</label>
        <p className="hint" style={{ marginTop: 0 }}>
          {cronConfigured
            ? 'A scheduled pass every 20 minutes closes stale open sessions for everyone, even if they never reopen My day.'
            : "CRON_SECRET isn't set, so the scheduled pass is closed off. You can still fire one by hand below."}
        </p>
        <button
          className="btn"
          style={{ marginTop: 16 }}
          disabled={actionBusy === 'reconcile'}
          onClick={() =>
            withBusy('reconcile', async () => {
              const data = await post('/api/cron/reconcile-idle', {}, null);
              if (data) {
                setNotice(
                  `Reconciled ${data.users || 0} ${data.users === 1 ? 'person' : 'people'} — ${data.closed || 0} session${data.closed === 1 ? '' : 's'} closed.`,
                );
              }
            })
          }
        >
          {actionBusy === 'reconcile' ? <Icon.spinner width={15} height={15} /> : <Icon.play width={15} height={15} />}
          Reconcile stale sessions now
        </button>
      </Card>

      <Card
        glyph="clipboard"
        title="Onboarding checklist"
        description={
          <>
            Nobody reaches the app until every item is ticked. Adding one here puts it in front of{' '}
            <b>everyone</b>, including people who joined years ago.
          </>
        }
        action={
          <Check
            checked={form.onboardingEnforced}
            onChange={(v) => set({ onboardingEnforced: v })}
            title="Enforce it"
            detail="Off means the list is advisory."
          />
        }
      >
        <div className="bordered-list">
          {steps.length === 0 && <p className="empty">No steps yet.</p>}
          {steps.map((s) => (
            <div key={s.id} className="list-row">
              <div style={{ flex: 1 }}>
                <b>
                  {s.title}
                  {s.kind === 'SLACK_ID' && (
                    <span className="chip" style={{ marginLeft: 8 }}>
                      Slack ID
                    </span>
                  )}
                </b>
                {s.description && <small>{s.description}</small>}
              </div>
              <button
                className="btn-icon danger"
                title="Remove step"
                aria-label="Remove step"
                disabled={actionBusy === `step-${s.id}`}
                onClick={() =>
                  withBusy(`step-${s.id}`, () =>
                    post('/api/settings/onboarding', { id: s.id }, 'Step removed.', 'DELETE'),
                  )
                }
              >
                {actionBusy === `step-${s.id}` ? (
                  <Icon.spinner width={15} height={15} />
                ) : (
                  <Icon.trash width={15} height={15} />
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="stack" style={{ marginTop: 18 }}>
          <input
            className="input"
            placeholder="Sign the NDA"
            value={step.title}
            onChange={(e) => setStep({ ...step, title: e.target.value })}
          />
          <input
            className="input"
            placeholder="What they need to know"
            value={step.description}
            onChange={(e) => setStep({ ...step, description: e.target.value })}
          />
          <div className="row">
            <select
              className="select"
              value={step.kind}
              onChange={(e) => setStep({ ...step, kind: e.target.value })}
              style={{ maxWidth: 260 }}
            >
              <option value="CHECK">Checkbox — self-attested</option>
              <option value="SLACK_ID">Slack ID — captures their Slack member ID</option>
            </select>
            <button
              className="btn"
              disabled={!step.title.trim() || actionBusy === 'add-step'}
              onClick={() =>
                withBusy('add-step', async () => {
                  const ok = await post('/api/settings/onboarding', step, 'Step added.');
                  if (ok) setStep({ title: '', description: '', kind: 'CHECK' });
                })
              }
            >
              {actionBusy === 'add-step' ? <Icon.spinner width={15} height={15} /> : <Icon.plus width={15} height={15} />}
              Add step
            </button>
          </div>
        </div>
      </Card>

      <Card
        glyph="users"
        title="Departments"
        description="The list People, Apps and the password vault pick from when scoping something to one department."
      >
        <div className="row wrap" style={{ gap: 8, marginBottom: departments.length ? 18 : 0 }}>
          {departments.length === 0 && <p className="empty" style={{ padding: 0 }}>None added yet.</p>}
          {departments.map((d) => (
            <span key={d} className="chip">
              {d}
              <button
                className="btn-icon"
                style={{ padding: 2, marginLeft: 2 }}
                title={`Remove ${d}`}
                aria-label={`Remove ${d}`}
                disabled={actionBusy === `dept-${d}`}
                onClick={() => withBusy(`dept-${d}`, () => post('/api/departments', { name: d }, `${d} removed.`, 'DELETE'))}
              >
                {actionBusy === `dept-${d}` ? (
                  <Icon.spinner width={11} height={11} />
                ) : (
                  <Icon.close width={11} height={11} />
                )}
              </button>
            </span>
          ))}
        </div>

        <div className="row">
          <input
            className="input"
            placeholder="Engineering"
            value={deptName}
            onChange={(e) => setDeptName(e.target.value)}
          />
          <button
            className="btn"
            disabled={!deptName.trim() || actionBusy === 'add-dept'}
            onClick={() =>
              withBusy('add-dept', async () => {
                const ok = await post('/api/departments', { name: deptName.trim() }, 'Department added.');
                if (ok) setDeptName('');
              })
            }
          >
            {actionBusy === 'add-dept' ? <Icon.spinner width={15} height={15} /> : <Icon.plus width={15} height={15} />}
            Add department
          </button>
        </div>
      </Card>

      <Card
        glyph="grid"
        title="Department apps"
        description="Shortcuts on the Apps page. Leave department blank for everyone; set it and only that department sees it."
      >
        <div className="bordered-list">
          {apps.length === 0 && <p className="empty">No apps added yet.</p>}
          {apps.map((a) => (
            <div key={a.id} className="list-row">
              <div style={{ flex: 1 }}>
                <b>
                  {a.icon} {a.name}
                </b>
                <small>
                  {a.department || 'Company-wide'}
                  {a.description ? ` · ${a.description}` : ''}
                  {a.url ? ` · ${a.url}` : ''}
                </small>
              </div>
              <button
                className="btn-icon danger"
                title="Remove app"
                aria-label="Remove app"
                disabled={actionBusy === `app-${a.id}`}
                onClick={() => withBusy(`app-${a.id}`, () => post(`/api/apps/${a.id}`, {}, 'App removed.', 'DELETE'))}
              >
                {actionBusy === `app-${a.id}` ? (
                  <Icon.spinner width={15} height={15} />
                ) : (
                  <Icon.trash width={15} height={15} />
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="grid-4" style={{ gap: 14, marginTop: 18 }}>
          <div>
            <label className="field-label">ICON</label>
            <input
              className="input"
              value={app.icon}
              maxLength={4}
              onChange={(e) => setApp({ ...app, icon: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">NAME</label>
            <input
              className="input"
              placeholder="Figma"
              value={app.name}
              onChange={(e) => setApp({ ...app, name: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">LINK — OPTIONAL</label>
            <input
              className="input"
              placeholder="https://…"
              value={app.url}
              onChange={(e) => setApp({ ...app, url: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">DEPARTMENT</label>
            <select
              className="select"
              value={app.department}
              onChange={(e) => setApp({ ...app, department: e.target.value })}
            >
              <option value="">Company-wide</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <input
            className="input"
            placeholder="What it's for — optional"
            value={app.description}
            onChange={(e) => setApp({ ...app, description: e.target.value })}
          />
          <button
            className="btn"
            disabled={!app.name.trim() || actionBusy === 'add-app'}
            onClick={() =>
              withBusy('add-app', async () => {
                const ok = await post('/api/apps', app, 'App added.');
                if (ok) setApp({ name: '', description: '', url: '', icon: '◆', department: '' });
              })
            }
          >
            {actionBusy === 'add-app' ? <Icon.spinner width={15} height={15} /> : <Icon.plus width={15} height={15} />}
            Add app
          </button>
        </div>
      </Card>

      <Card
        glyph="slack"
        title="Slack"
        description="Task assignments, status moves and deadline reminders, posted to one channel."
        action={
          <>
            <span className={`chip ${webhookSet ? 'green' : ''}`}>
              {webhookSet ? 'connected' : 'not connected'}
            </span>
            <button
              className="btn btn-sm"
              disabled={!webhookSet || actionBusy === 'slack-test'}
              onClick={() => withBusy('slack-test', () => post('/api/settings/slack-test', {}, 'Test message sent to Slack.'))}
            >
              {actionBusy === 'slack-test' ? <Icon.spinner width={14} height={14} /> : <Icon.send width={14} height={14} />}
              Send test
            </button>
          </>
        }
      >
        <div className="grid-2" style={{ gap: 26 }}>
          <div>
            <label className="field-label">INCOMING WEBHOOK URL</label>
            <input
              className="input"
              type="password"
              placeholder={webhookSet ? '••••••••• — saved' : 'https://hooks.slack.com/services/…'}
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
            />
            <p className="hint">
              Slack → api.slack.com/apps → your app → Incoming Webhooks → Add New Webhook to
              Workspace. It&apos;s write-only and stored where only admins can read it.
            </p>

            <label className="field-label" style={{ marginTop: 22 }}>
              CHANNEL <span style={{ textTransform: 'none' }}>for your own reference</span>
            </label>
            <input
              className="input"
              placeholder="#syncup-tasks"
              value={form.slackChannel}
              onChange={(e) => set({ slackChannel: e.target.value })}
            />
          </div>

          <div
            className="check-stack"
            style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 22 }}
          >
            <Check
              checked={form.slackEnabled}
              onChange={(v) => set({ slackEnabled: v })}
              title="Post to Slack"
              detail="The master switch. Everything below is ignored while this is off."
            />
            <Check
              checked={form.slackOnAssign}
              onChange={(v) => set({ slackOnAssign: v })}
              disabled={!form.slackEnabled}
              title="New task assigned"
              detail="A card with the owner, priority and deadline."
            />
            <Check
              checked={form.slackOnStatus}
              onChange={(v) => set({ slackOnStatus: v })}
              disabled={!form.slackEnabled}
              title="Status changes"
              detail="One line per move: pending → progress → completed or blocked."
            />
            <Check
              checked={form.slackOnDeadline}
              onChange={(v) => set({ slackOnDeadline: v })}
              disabled={!form.slackEnabled}
              title="Deadline reminders"
              detail="Due tomorrow, due today, then once a day while it stays late."
            />
          </div>
        </div>

        <div className="divider" />

        <label className="field-label">REMINDER SCHEDULE</label>
        <p className="hint" style={{ marginTop: 0 }}>
          {cronConfigured
            ? 'CRON_SECRET is set, so the scheduled run is armed. Vercel calls it once a morning.'
            : "CRON_SECRET isn't set on this deployment, so the scheduled run is closed off. Set it in Vercel to switch reminders on — you can still fire a pass by hand below."}
        </p>
        <button
          className="btn"
          style={{ marginTop: 16 }}
          disabled={actionBusy === 'reminders'}
          onClick={() =>
            withBusy('reminders', async () => {
              const data = await post('/api/cron/reminders', {}, null);
              if (data) {
                setNotice(
                  data.sent
                    ? `Reminder pass done — ${data.reminded} task${data.reminded === 1 ? '' : 's'} posted.`
                    : `Nothing posted: ${data.reason || 'Slack is off'}.`,
                );
              }
            })
          }
        >
          {actionBusy === 'reminders' ? <Icon.spinner width={15} height={15} /> : <Icon.play width={15} height={15} />}
          Run reminders now
        </button>
      </Card>

      <Card
        glyph="slack"
        title="Slack bot — channel + personal DMs"
        description="A second, independent path that also DMs people directly. Whatever's about one person specifically — check-in, check-out, a task landing on them, its status moving, their own deadlines — can mirror into their personal DM, not just the shared channel."
        action={
          <>
            <span className={`chip ${botTokenSet ? 'green' : ''}`}>
              {botTokenSet ? 'token saved' : 'no token'}
            </span>
            <button
              className="btn btn-sm"
              disabled={!botTokenSet || actionBusy === 'bot-test'}
              onClick={() => withBusy('bot-test', () => post('/api/settings/slack-bot-test', {}, 'Test message sent to the channel.'))}
            >
              {actionBusy === 'bot-test' ? <Icon.spinner width={14} height={14} /> : <Icon.send width={14} height={14} />}
              Send test
            </button>
          </>
        }
      >
        <div className="grid-2" style={{ gap: 26 }}>
          <div>
            <label className="field-label">BOT TOKEN</label>
            <input
              className="input"
              type="password"
              placeholder={botTokenSet ? '••••••••• — saved' : 'xoxb-…'}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
            <p className="hint">
              api.slack.com/apps → your app (or a new one) → OAuth &amp; Permissions → add the{' '}
              <code>chat:write</code> and <code>users:read.email</code> bot scopes → Install to
              Workspace → copy the Bot User OAuth Token.
            </p>

            <label className="field-label" style={{ marginTop: 22 }}>
              CHANNEL ID
            </label>
            <input
              className="input"
              placeholder="C0123456789"
              value={form.slackChannelId || ''}
              onChange={(e) => set({ slackChannelId: e.target.value })}
            />
            <p className="hint">
              Invite the bot to #syncup-workplace, then open the channel → View channel details →
              copy the Channel ID at the bottom. Not the channel name — the ID.
            </p>
          </div>

          <div
            className="check-stack"
            style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 22 }}
          >
            <Check
              checked={form.slackBotEnabled}
              onChange={(v) => set({ slackBotEnabled: v })}
              title="Turn the bot on"
              detail="Master switch for this whole card. Independent of the webhook above."
            />
            <Check
              checked={form.slackOnCheckin}
              onChange={(v) => set({ slackOnCheckin: v })}
              disabled={!form.slackBotEnabled}
              title="Check-in"
              detail="Posted to the channel the moment someone arrives."
            />
            <Check
              checked={form.slackOnCheckout}
              onChange={(v) => set({ slackOnCheckout: v })}
              disabled={!form.slackBotEnabled}
              title="Check-out"
              detail="Posted with the hours recorded that day."
            />
            <Check
              checked={form.slackOnEodSummary}
              onChange={(v) => set({ slackOnEodSummary: v })}
              disabled={!form.slackBotEnabled}
              title="End-of-day summary"
              detail="Who was present, who wasn't, and which tasks never got picked up."
            />

            <div className="divider" style={{ margin: '6px 0' }} />

            <Check
              checked={form.slackDmEnabled}
              onChange={(v) => set({ slackDmEnabled: v })}
              disabled={!form.slackBotEnabled}
              title="Personal DMs — master switch"
              detail="Needs users:read.email so the bot can match a Syncup account to a Slack account, and each person's Slack ID (see Onboarding checklist)."
            />
            <Check
              checked={form.slackDmOnAssign}
              onChange={(v) => set({ slackDmOnAssign: v })}
              disabled={!form.slackBotEnabled || !form.slackDmEnabled}
              title="Task assigned to you"
              detail="The moment a task lands on someone."
            />
            <Check
              checked={form.slackDmOnCheckin}
              onChange={(v) => set({ slackDmOnCheckin: v })}
              disabled={!form.slackBotEnabled || !form.slackDmEnabled}
              title="Check-in (mirrors the channel)"
              detail="The same check-in post, sent to them personally too — easy to miss in a busy shared channel."
            />
            <Check
              checked={form.slackDmOnCheckInSoon ?? true}
              onChange={(v) => set({ slackDmOnCheckInSoon: v })}
              disabled={!form.slackBotEnabled || !form.slackDmEnabled}
              title="Check-in in 15 minutes"
              detail="A personal DM 15 minutes before their own start time — 09:30 people at 09:15, 10:00 people at 09:45. Uses the time on their People record, or the company default."
            />
            <Check
              checked={form.slackDmOnCheckout}
              onChange={(v) => set({ slackDmOnCheckout: v })}
              disabled={!form.slackBotEnabled || !form.slackDmEnabled}
              title="Check-out (mirrors the channel)"
              detail="The same check-out post, sent to them personally too."
            />
            <Check
              checked={form.slackDmOnStatus}
              onChange={(v) => set({ slackDmOnStatus: v })}
              disabled={!form.slackBotEnabled || !form.slackDmEnabled}
              title="Task status changes (mirrors the channel)"
              detail="Sent to whoever the task is assigned to, whenever it moves."
            />
            <Check
              checked={form.slackDmOnDeadline}
              onChange={(v) => set({ slackDmOnDeadline: v })}
              disabled={!form.slackBotEnabled || !form.slackDmEnabled}
              title="Deadline reminders (personalised)"
              detail="Just their own due/overdue items, not the whole company's shared list."
            />
            <Check
              checked={form.slackDmOnAbsent}
              onChange={(v) => set({ slackDmOnAbsent: v })}
              disabled={!form.slackBotEnabled || !form.slackDmEnabled}
              title="Marked absent"
              detail={'"You were marked absent" — end of day, on a working day, with no check-in recorded. Sent alongside the channel summary.'}
            />
            <Check
              checked={form.slackDmOnInactive}
              onChange={(v) => set({ slackDmOnInactive: v })}
              disabled={!form.slackBotEnabled || !form.slackDmEnabled}
              title="Checked out for inactivity"
              detail={'"You were checked out automatically" — their running session went quiet past the idle cut-off (device asleep or off, not just a tab or window switch).'}
            />
            <Check
              checked={form.slackDmOnStaleBreak}
              onChange={(v) => set({ slackDmOnStaleBreak: v })}
              disabled={!form.slackBotEnabled || !form.slackDmEnabled}
              title="Forgotten break"
              detail={'"Your break was closed automatically" — a BREAK session went quiet past the stale-break alert (they took a break and never came back).'}
            />
            <Check
              checked={form.slackDmOnDailyPlan}
              onChange={(v) => set({ slackDmOnDailyPlan: v })}
              disabled={!form.slackBotEnabled || !form.slackDmEnabled}
              title="Today's plan"
              detail="A digest of their plan for the day, sent right after check-in."
            />
          </div>
        </div>

        <div className="divider" />

        <label className="field-label">END-OF-DAY SUMMARY</label>
        <p className="hint" style={{ marginTop: 0 }}>
          {cronConfigured
            ? 'CRON_SECRET is set, so the scheduled run is armed — once daily.'
            : "CRON_SECRET isn't set on this deployment, so the scheduled run is closed off. You can still fire one by hand below."}
        </p>
        <button
          className="btn"
          style={{ marginTop: 16 }}
          disabled={actionBusy === 'eod-summary'}
          onClick={() =>
            withBusy('eod-summary', async () => {
              const data = await post('/api/cron/eod-summary', {}, null);
              if (data) {
                setNotice(
                  data.sent
                    ? `Summary posted — ${data.present} present, ${data.absent} absent, ${data.notPickedUp} task(s) not picked up.`
                    : `Nothing posted: ${data.reason || 'the bot is off'}.`,
                );
              }
            })
          }
        >
          {actionBusy === 'eod-summary' ? <Icon.spinner width={15} height={15} /> : <Icon.play width={15} height={15} />}
          Send today's summary now
        </button>

        <div className="divider" />

        <label className="field-label">CHECK-IN NUDGE</label>
        <p className="hint" style={{ marginTop: 0 }}>
          {cronConfigured
            ? 'Scheduled every 5 minutes. Each person is messaged 15 minutes before their own check-in time, once per working day.'
            : "CRON_SECRET isn't set, so the scheduled run is closed off. You can still fire one by hand below — it only sends if someone is currently in that 15-minute window."}
        </p>
        <button
          className="btn"
          style={{ marginTop: 16 }}
          disabled={actionBusy === 'check-in-nudge'}
          onClick={() =>
            withBusy('check-in-nudge', async () => {
              const data = await post('/api/cron/check-in-nudge', {}, null);
              if (data) {
                setNotice(
                  data.nudged
                    ? `Check-in nudge: ${data.nudged} ${data.nudged === 1 ? 'person' : 'people'} in the window, ${data.delivered || 0} delivered.`
                    : `Nothing sent: ${data.reason || 'nobody is 15 minutes from check-in right now'}.`,
                );
              }
            })
          }
        >
          {actionBusy === 'check-in-nudge' ? <Icon.spinner width={15} height={15} /> : <Icon.play width={15} height={15} />}
          Send check-in nudges now
        </button>
      </Card>

      <Card
        glyph="grid"
        title="Google Sheets backup"
        description="Every table mirrored into its own tab on a schedule — a plain-text backup outside this database. The password vault and MCP tokens are never included, on purpose: nothing that grants access ever leaves the app."
        action={
          <>
            <span className={`chip ${sheetsKeySet ? 'green' : ''}`}>
              {sheetsKeySet ? 'key saved' : 'no key'}
            </span>
            <button
              className="btn btn-sm"
              disabled={!sheetsKeySet || actionBusy === 'sheets-sync'}
              onClick={() =>
                withBusy('sheets-sync', async () => {
                  const data = await post('/api/cron/sheets-sync', {}, null);
                  if (data) {
                    setNotice(
                      data.synced
                        ? `Synced ${data.tables} tabs.`
                        : `Sync failed: ${data.reason || 'unknown error'}.`,
                    );
                  }
                })
              }
            >
              {actionBusy === 'sheets-sync' ? <Icon.spinner width={14} height={14} /> : <Icon.send width={14} height={14} />}
              Sync now
            </button>
          </>
        }
      >
        <div className="grid-2" style={{ gap: 26 }}>
          <div>
            <label className="field-label">SERVICE ACCOUNT EMAIL</label>
            <input
              className="input"
              placeholder="syncup-backup@your-project.iam.gserviceaccount.com"
              value={form.sheetsClientEmail || ''}
              onChange={(e) => set({ sheetsClientEmail: e.target.value })}
            />

            <label className="field-label" style={{ marginTop: 22 }}>
              PRIVATE KEY
            </label>
            <textarea
              className="input"
              rows={3}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              placeholder={sheetsKeySet ? '••••••••• — saved' : '-----BEGIN PRIVATE KEY-----…'}
              value={sheetsKey}
              onChange={(e) => setSheetsKey(e.target.value)}
            />
            <p className="hint">
              Google Cloud Console → a project → IAM &amp; Admin → Service Accounts → create one →
              Keys → Add key (JSON). Paste the <code>client_email</code> and{' '}
              <code>private_key</code> fields from the downloaded file.
            </p>
          </div>

          <div>
            <label className="field-label">SPREADSHEET ID</label>
            <input
              className="input"
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
              value={form.sheetsSpreadsheetId || ''}
              onChange={(e) => set({ sheetsSpreadsheetId: e.target.value })}
            />
            <p className="hint">
              The long id in the sheet&apos;s URL. Create a blank Google Sheet, share it with the
              service account email above as an Editor, then paste its id here.
            </p>

            <div className="divider" />

            <Check
              checked={form.sheetsEnabled}
              onChange={(v) => set({ sheetsEnabled: v })}
              title="Turn the backup on"
              detail="Once on, a scheduled pass refreshes every tab automatically."
            />
          </div>
        </div>
      </Card>

      <Card
        glyph="robot"
        title="Ask Claude about Syncup"
        description="Connect Claude to this app as a tool, then ask in plain language — “who's over the task cap”, “summarise Friday's reports”, “who was late this month”. A read-only token can only look things up. A read-write token can also assign tasks, move a task's status and decide leave requests — never delete a person or reset a password, those stay human-only in the app."
      >
        <label className="field-label">SERVER URL</label>
        <div className="token-strip">{mcpUrl}</div>
        <p className="hint">
          <b>From Claude&apos;s chat/Cowork &quot;Connectors&quot; screen</b> — add this URL as a
          custom connector and click through the sign-in prompt; it reuses your own Syncup login,
          no token to copy. <b>From Claude Code or the CLI</b> — this URL still also accepts a
          plain bearer token, minted below, passed as an <code>Authorization</code> header; that
          path is the one to use if the Connectors screen&apos;s sign-in step ever fails you.
          Either way, every token — however it was created — shows up below and revokes the same way.
        </p>

        <div className="divider" />

        <label className="field-label">TOKENS · {tokens.length} LIVE</label>

        {freshToken && (
          <div className="notice-line" style={{ marginTop: 0, marginBottom: 16 }}>
            <b>Copy this now — it is not shown again.</b>
            <div className="token-strip" style={{ marginTop: 10 }}>
              {freshToken}
            </div>
          </div>
        )}

        <div className="bordered-list">
          {tokens.length === 0 && <p className="empty">No tokens yet.</p>}
          {tokens.map((t) => (
            <div key={t.id} className="list-row">
              <div style={{ flex: 1 }}>
                <b>
                  {t.name}{' '}
                  <span className={`chip ${t.scope === 'READ_WRITE' ? 'amber' : ''}`} style={{ marginLeft: 6 }}>
                    {t.scope === 'READ_WRITE' ? 'read-write' : 'read-only'}
                  </span>
                  {t.viaOAuth && (
                    <span className="chip" style={{ marginLeft: 6 }}>
                      via OAuth
                    </span>
                  )}
                </b>
                <small className="mono">
                  {t.prefix}··· · created {t.createdAt} ·{' '}
                  {t.lastUsedAt ? `last used ${t.lastUsedAt}` : 'never used'}
                  {t.scope === 'READ_WRITE' && t.ownerName ? ` · attributed to ${t.ownerName}` : ''}
                </small>
              </div>
              <button
                className="btn btn-sm btn-danger"
                disabled={actionBusy === `token-${t.id}`}
                onClick={() =>
                  withBusy(`token-${t.id}`, () => post('/api/settings/mcp-token', { id: t.id }, 'Token revoked.', 'DELETE'))
                }
              >
                {actionBusy === `token-${t.id}` && <Icon.spinner width={13} height={13} />}
                Revoke
              </button>
            </div>
          ))}
        </div>

        <div className="grid-2" style={{ gap: 14, marginTop: 18 }}>
          <input
            className="input"
            placeholder="What this token is for — “Ayush's personal Claude”"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
          />
          <select className="select" value={tokenScope} onChange={(e) => setTokenScope(e.target.value)}>
            <option value="READ_ONLY">Read-only — can only look things up</option>
            <option value="READ_WRITE">Read-write — can also assign tasks, move status, decide leave</option>
          </select>
        </div>
        <button
          className="btn"
          style={{ marginTop: 14 }}
          disabled={!tokenName.trim() || actionBusy === 'create-token'}
          onClick={() =>
            withBusy('create-token', async () => {
              const data = await post('/api/settings/mcp-token', { name: tokenName, scope: tokenScope }, null);
              if (data?.token) {
                setFreshToken(data.token);
                setTokenName('');
                setNotice('Token created.');
              }
            })
          }
        >
          {actionBusy === 'create-token' ? <Icon.spinner width={15} height={15} /> : <Icon.plus width={15} height={15} />}
          Create token
        </button>
      </Card>
    </>
  );
}
