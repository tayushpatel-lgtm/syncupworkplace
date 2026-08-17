# Syncup

Team operations for one company: the working day, tasks, attendance, leave and
the numbers that fall out of them.

Built for laptops and tablets. Below 768px the app shows a wall instead of a
layout — there is no phone version, by design.

## The loop it is built around

1. Someone arrives and **checks in**. Their arrival is stamped against their own
   deadline, and a late arrival is recorded as late.
2. A popup opens with their **plan for the day** — every open task assigned to
   them, plus anything left unfinished on the last working day, ready to tick
   off, drop, or add to. The day doesn't actually start — Slack included —
   until at least one point survives that popup.
3. **Anyone can assign a task to anyone.** It lands on that person's plan the same
   day, subject to the per-person assignment cap.
4. Points get **ticked off** through the day. Ticking a point that came from a task
   moves the task on the board too — the two never disagree, so whatever is
   already completed reaches the report without re-doing the work.
5. They **check out** through a second popup: a last pass to tick off whatever's
   done, plus a line for anything that isn't on the list at all. That becomes
   the report — the app composes the rest from the day's real data.
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

A running timer is not trusted on its own. The browser sends a heartbeat every
minute regardless of which tab or window has focus — switching tabs, switching
apps, or minimising the browser must never look like idle time. What actually
stops the heartbeat is the machine itself going to sleep or shutting down,
since that's the one thing that stops a JS timer from firing at all. When the
beats stop for longer than the idle cut-off (30 minutes by default), the
session is closed at its **last sign of life** and the gap is recorded
separately as discarded idle time, and Insights reports that discarded time
rather than hiding it. If it's turned on, the person also gets a personal DM:
"You were checked out automatically."

Reconciliation runs whenever a person's day is read or written, so the figures are
current without a background worker.

### Fixing a mistake

Each person's own check-in deadline can be set on `/admin/people` (blank
falls back to the company default on `/admin/settings`) — that's the time a
late arrival is measured against, going forward.

For a day that's already happened — someone forgot to check in or out, or a
day is simply wrong — `/admin/attendance` → **By day** lets an admin correct
that one person's one day directly: set (or clear) their check-in and
check-out time, which recomputes whether they were late against their own
deadline. Clearing both marks the day absent. If the day had no recorded
work sessions at all, correcting it also backfills one spanning the times
given, so the hours actually count instead of the day reading as present
but zero hours worked. It never touches any other day, and never invents
sessions on a day that already has real ones recorded.

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
generating one — from `/admin/people`, which is also where their employment
type (full-time, intern, freelancer) is set — see [Leave](#leave) for what
that controls. Only the CEO can touch another CEO's role, active state, or
password; any admin can manage everyone else.

Everyone starts with their email address as both their username and their
password, and is sent straight to a "set your own password" screen on first
login — before onboarding, before anything — so nobody keeps a password
someone else picked. The same happens after an admin resets a password by
hand: it forces a change again next time, the same as a first login.

## Leave

The policy is fixed by employment type, not admin-configurable:

| | Casual | Sick |
|---|---|---|
| Full-time | 1 a month, caps at 6 banked | 1 a month, does not carry — unused lapses |
| Intern | 1 a month, caps at 6 banked | None |
| Freelancer | None — the weekly off is it | None |

Casual leave needs 2 days' notice to request; sick leave can be filed for any
date, including one already past. Someone who joins on or before the 15th of
a month earns that month's leave; joining after the 15th, their first credit
is the month after. A daily scheduled pass (`/api/cron/leave-accrual`,
`CRON_SECRET`-gated the same way as the other crons) credits whoever hasn't
been done yet that calendar month — safe to run more than once a day, and an
admin can also fire it by hand from `/admin/leave` → Policy. An admin can
still top someone up by hand from the Balances tab there, which — unlike the
automatic accrual — can push casual leave past the usual 6-day cap.

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
`users:read.email`), for channel posts *and* personal DMs.

Channel events, each its own toggle: check-in, check-out, and an end-of-day
summary — who was present, who wasn't, which task-linked plan points never
got ticked. Check-in and check-out carry real content, not just a
timestamp — check-in posts the plan the person just confirmed in the popup;
check-out posts what they ticked off plus whatever they noted wasn't on the
list.

Personal DMs, gated by a master switch plus one toggle each. Four mirror a
channel event straight to the one person it's actually about — easy to miss
in a shared channel everyone else is also posting into:
- **Check-in** / **Check-out** — the same post that went to the channel.
- **Task status changes** — sent to whoever the task is assigned to.
- **Deadline reminders** — just their own due/overdue items, not the whole
  company's shared list.

Four more that only ever exist as a DM, nothing posted to the channel:
- **Task assigned to you** — the moment it lands on them.
- **Marked absent** — end of day, on a working day, with no check-in recorded.
  Sent alongside the channel summary.
- **Checked out for inactivity** — their running session went quiet past the
  idle cut-off (device asleep or off — see [How the time is
  counted](#how-the-time-is-counted); a tab or window switch never triggers this).
- **Today's plan** — a digest of their plan, sent right after check-in.

The end-of-day summary stays channel-only — it's about the whole team at
once, not one person, so there's no single "you" to mirror it to.

DMs need a Slack account resolved for the person, which happens one of three
ways: automatically the first time, via `users.lookupByEmail`; up front,
during onboarding, if the "Slack ID" step is in their checklist (see
[Onboarding checklist](#onboarding-checklist)); or any time after, from their
own `/account` page — useful for anyone already onboarded before the "Slack
ID" step existed for them, since onboarding only ever runs once. Either way
it's cached on the person's row. Set up the bot from api.slack.com/apps →
OAuth & Permissions → add the scopes → Install to Workspace; the channel
needs its ID (not its name), from the channel's "View channel details".

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
`CRON_SECRET` gate as the Slack crons, `vercel.json`-scheduled once daily
(Vercel's Hobby plan only allows daily cron schedules — a Pro plan can run it
more often by changing the schedule in `vercel.json`). Admins can sync by
hand from Settings regardless.

## Ask Claude about Syncup

`/api/mcp` is an MCP server, reachable two ways:

- **OAuth** (RFC 6749 + PKCE, RFC 7636) — the path Claude's chat/Cowork
  "Connectors" screen needs, since it only speaks OAuth. Add the server URL
  there; it redirects to Syncup's own login, the person picks read-only or
  full access on a plain consent screen, and a token is minted behind the
  scenes. `/oauth/register` (Dynamic Client Registration, RFC 7591),
  `/oauth/authorize`, and `/oauth/token` implement this; `/.well-known/
  oauth-authorization-server` and `/.well-known/oauth-protected-resource`
  are how a client discovers them without being told. Public clients only —
  PKCE stands in for a client secret, since a secret has nowhere safe to live
  in a client like Claude's.
- **A static bearer token** — the path for Claude Code, the CLI
  (`claude mcp add --transport http … --header "Authorization: Bearer …"`),
  or a script. Create one by hand in Settings; it's shown once and stored
  only as a SHA-256 hash.

Both paths land in the same place: every token, however it was minted, is
either **read-only** or **read-write**, and the Settings token list shows
and revokes them identically (OAuth-issued ones carry a "via OAuth" badge).
Read-only can only look things up. Read-write can also `assign_task`,
`update_task_status` and `decide_leave` — every write action is attributed to
whichever person approved it. Neither scope can delete a person or reset a
password; those stay human-only actions in the app, on purpose.

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

## Feeling responsive

Every button that triggers a save has its own spinner. On top of that, a thin
bar at the very top of the page (`components/NavProgress.js`) shows while a
navigation or a `router.refresh()` is in flight — so clicking a sidebar link,
a tab, or anything that redraws the screen never reads as a dead click while
the new content streams in. It's driven by watching link clicks and URL
changes, not by a route-level `loading.js` — the app tried that once and it
silently turned every `redirect()`-based access gate into a no-op, so it's
deliberately not used here.

`lib/useRouter.js` is a drop-in replacement for `next/navigation`'s
`useRouter` that flashes the bar around `push`/`replace`/`refresh` — every
client component that navigates imports it from there instead.

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
