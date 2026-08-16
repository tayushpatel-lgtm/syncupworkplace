# Syncup

Team operations for one company: the working day, tasks, attendance, leave and
the numbers that fall out of them.

Built for laptops and tablets. Below 768px the app shows a wall instead of a
layout — there is no phone version, by design.

## The loop it is built around

1. Someone arrives and **checks in**. Their arrival is stamped against their own
   deadline, and a late arrival is recorded as late.
2. Their **plan for the day** opens with every open task assigned to them, plus
   anything they left unfinished on the last working day. If it's empty, the day
   doesn't start until at least one point is added — that's the plan.
3. **Anyone can assign a task to anyone.** It lands on that person's plan the same
   day, subject to the per-person assignment cap.
4. Points get **ticked off** through the day. Ticking a point that came from a task
   moves the task on the board too — the two never disagree, so whatever is
   already completed reaches the report without re-doing the work.
5. At the end, they **file the report**. The app composes it from the day's real
   data; the only thing anyone types is what it added up to.
6. Whatever is still open **carries to the next working day**.

Whether a day counts as **present** isn't just "did they check in" — it's checked
in *and* worked the minimum hours (Settings, overridable per person). Short of
that, a day reads as short, not present, everywhere attendance is counted.

## Stack

Next.js 16 (App Router) · React 19 · Node · Postgres via Prisma · sessions signed
with `jose`, passwords hashed with bcrypt. No UI framework — the visual system is
hand-written CSS in `app/globals.css`.

## Running it

```bash
npm install
npm run setup     # asks for a Postgres URL, does the rest
npm run dev
```

`npm run setup` writes `.env` with a freshly generated session secret, creates the
database and tables if they aren't there, and loads a company with a month of
history. Re-running it is safe — it keeps a `.env` you have already filled in.

You need a Postgres connection string for it. Either a hosted one (Neon and
Supabase both hand you one, nothing to install) or a local server:

```bash
brew install postgresql@16 && brew services start postgresql@16 && createdb syncup
```

<details>
<summary>Doing it by hand instead</summary>

```bash
cp .env.example .env          # fill in DATABASE_URL and SESSION_SECRET
npx prisma db push            # create the tables
npm run db:seed               # demo data
```
</details>

Then open **http://localhost:3000**. Keep the `npm run dev` terminal running —
closing it stops the site. The seed prints the accounts it made; they all share
the password `syncup1234`:

| Account | Role |
|---|---|
| `ayush@syncup.in` | CEO |
| `chhavi@syncup.in` | Admin |
| `deepak@syncup.in` | Employee |

`zoya@syncup.in` is seeded mid-onboarding, so signing in as her shows the gate.

## Tasks

The board is swim lanes, full page — assigning happens from the button top-right,
not an inline form. Open any card for its own page: change stage, edit detail,
attach files or images. Attachments live as bytes in the same Postgres database
rather than a paid storage service, capped at 4MB each.

## Apps

`My work → Apps` is a small shelf of shortcuts — company-wide, or scoped to one
department — that admins fill in from Settings. One app ships built in:
**Password**, a shared credential vault. Secrets are encrypted at rest
(AES-256-GCM, keyed off `SESSION_SECRET`, so no extra secret to configure) and
hidden behind a Reveal action. Visibility is company-wide, one department, or
specific people; admins get a directory at `Administration → Passwords` that
sees every entry and can reassign sharing regardless of who added it.

## How the time is counted

A running timer is not trusted on its own. The browser sends a heartbeat while the
tab is alive; when the beats stop for longer than the idle cut-off, the session is
closed at its **last sign of life** and the gap is recorded separately as discarded
idle time. A sleeping machine or a forgotten tab therefore stops earning hours the
moment it goes quiet, and Insights reports that discarded time rather than hiding it.

Reconciliation runs whenever a person's day is read or written, so the figures are
current without a background worker.

## Settings, and what reads them

Everything on `/admin/settings` is enforced server-side, not just in the UI.

| Setting | What depends on it |
|---|---|
| Assignment cap | Blocks new assignments once someone holds that many open tasks |
| Report required | Whether a day can be closed without filing |
| Plan from assigned tasks | Whether open tasks seed the daily plan |
| The working week | Attendance denominators, calendar shading, leave day counts, carry-over |
| Default check-in by | The late threshold, unless a person has their own time |
| Idle cut-off | How long silence runs before time stops counting as work |
| Minimum hours to count as present | Checked in isn't enough — under this and the day reads as short, not present |
| Onboarding checklist | Gates the whole app while enforced and unfinished |
| Departments | What People's dropdowns, Apps' scoping and the password vault's sharing pick from |
| Slack webhook / bot | Channel and DM notifications — see [Slack](#slack) |
| Google Sheets credentials | Whether the backup sync can run — see [Google Sheets backup](#google-sheets-backup) |

People are added, deactivated, and have their password reset — including
generating one — from `/admin/people`. Only the CEO can touch another CEO's
role, active state, or password; any admin can manage everyone else.

### Onboarding checklist

Nobody reaches the app until every step is ticked (while it's enforced) —
`/admin/settings` manages the list. A step is one of two kinds:

- **Checkbox** — the person self-attests it's done.
- **Slack ID** — instead of a checkbox, a text field for their Slack member
  ID (Slack profile → ••• → Copy member ID). Saving it writes straight to
  their account, so a personal DM works from their very first day, without
  waiting on the email-lookup fallback.

The default checklist covers what a new hire needs before day one: offer
letter signed, official email signed in, Slack ID, induction done.

Holidays go in one at a time on `/holidays`, or a whole year at once by
pasting a calendar list (date, weekday, name, type — only the date and name
are kept) into the bulk importer there.

## Slack

Two independent paths, either or both:

**Incoming webhook** — set it in Settings, then use the master switch plus the
three event toggles: new task assigned, status changes, deadline reminders.
Channel-only; Slack webhooks cannot DM anyone.

**Bot app** — a real Slack app with a bot token (`chat:write` and
`users:read.email`), for channel posts *and* personal DMs. Its own master
switch, plus toggles for check-in, check-out, an end-of-day summary (who was
present, who wasn't, which task-linked plan points never got ticked), and a
DM the moment a task lands on someone. A Syncup email is matched to a Slack
account with `users.lookupByEmail` the first time, then cached on the person's
row. Set up from api.slack.com/apps → OAuth & Permissions → add the scopes →
Install to Workspace; the channel needs its ID (not its name), from the
channel's "View channel details".

Deadline reminders run once a day: due tomorrow, due today, then once a day
while a task stays late. The scheduled runs are at `/api/cron/reminders` and
`/api/cron/eod-summary`, both requiring `CRON_SECRET` as a bearer token —
without it either path returns 503 and stays closed. `vercel.json` already
schedules both. Admins can fire either by hand from Settings regardless.

## Google Sheets backup

A full mirror of the database, one tab per table, refreshed on a schedule —
a plain-text backup that lives outside Postgres. Deliberately excludes the
password vault (`PasswordEntry`/`PasswordShare`) and MCP token hashes:
nothing that grants access to the app ever leaves it. The `Settings` tab
itself drops its own credential fields for the same reason.

Set up a Google Cloud service account (IAM & Admin → Service Accounts → Keys
→ Add key, JSON), paste its `client_email` and `private_key` into Settings,
share a blank Google Sheet with that email as an Editor, and paste the
sheet's id. The scheduled run is at `/api/cron/sheets-sync`, same
`CRON_SECRET` gate as the Slack crons, `vercel.json`-scheduled every six
hours. Admins can sync by hand from Settings regardless.

## Ask Claude about Syncup

`/api/mcp` is an MCP server. Create a token in Settings — it is shown once
and stored only as a SHA-256 hash — then add a custom connector in Claude
pointing at the URL with that token as the bearer credential.

A token is either **read-only** or **read-write**, chosen when it's created.
Read-only can only look things up. Read-write can also `assign_task`,
`update_task_status` and `decide_leave` — every write action is attributed to
whichever admin the token was minted for. Neither scope can delete a person
or reset a password; those stay human-only actions in the app, on purpose.

Read tools: `who_is_in`, `attendance_summary`, `list_tasks`, `daily_reports`,
`leave_overview`, `holidays`, `insights_summary`, `over_the_cap`.

## Colour

The interface is monochrome. Colour appears in exactly two places, and means
something in both:

- **Magnitude** — a single-hue sequential ramp, validated for monotone lightness
  and contrast against the surface, scaled across the values actually present.
- **Status** — red, amber and green for late, overdue, blocked, priority and
  attendance bands. Never used to encode a quantity, and always shipped with a
  text label rather than colour alone.

## Testing

```bash
npm test                # unit tests — pure lib/ logic, no database, instant
npm run test:integration  # the real server against a throwaway test database
```

Unit tests (`tests/unit/`) cover date math, encryption, token hashing, the
password-vault access rules, and the other pure functions in `lib/` — no
Postgres involved, safe to run anywhere, always.

Integration tests (`tests/integration/`) start the actual app in dev mode
against a dedicated `syncup_test` database and drive it over HTTP exactly like
a browser would — login, the check-in → plan → report loop, the assignment
cap, leave balances, task/password permission boundaries, attachment size
limits, the MCP server. `tests/integration/global-setup.js` resets that
database before every run (`prisma db push --force-reset`), so it only ever
touches `syncup_test`, never your dev data or production.

That reset is a destructive command, so Prisma's own safety check refuses to
run it when it detects an AI coding agent driving the terminal, until a human
explicitly says so. If you hit that prompt, it's not broken — reply with your
consent and re-run with the environment variable it names. A human running
`npm run test:integration` directly, or CI, never sees this prompt; it's
specifically there to stop an agent from doing it unsupervised.

CI (`.github/workflows/test.yml`) runs both against a Postgres service
container on every push.

## Deploying

Vercel plus a hosted Postgres. Set `DATABASE_URL`, `SESSION_SECRET`,
`APP_TIMEZONE` and `CRON_SECRET`, then run `npx prisma db push` against the
production database once. `npm run build` generates the Prisma client as part of
the build.
