# Syncup

Team operations for one company: the working day, tasks, attendance, leave and
the numbers that fall out of them.

Built for laptops and tablets. Below 768px the app shows a wall instead of a
layout — there is no phone version, by design.

## The loop it is built around

1. Someone arrives and **checks in**. Their arrival is stamped against their own
   deadline, and a late arrival is recorded as late.
2. Their **plan for the day** opens with every open task assigned to them, plus
   anything they left unfinished on the last working day.
3. **Anyone can assign a task to anyone.** It lands on that person's plan the same
   day, subject to the per-person assignment cap.
4. Points get **ticked off** through the day. Ticking a point that came from a task
   moves the task on the board too — the two never disagree.
5. At the end, they **file the report**. The app composes it from the day's real
   data; the only thing anyone types is what it added up to.
6. Whatever is still open **carries to the next working day**.

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
| Onboarding checklist | Gates the whole app while enforced and unfinished |

## Slack

Set an incoming webhook in Settings, then use the master switch plus the three
event toggles. Deadline reminders run once a day: due tomorrow, due today, then
once a day while a task stays late.

The scheduled run is at `/api/cron/reminders` and requires `CRON_SECRET` as a
bearer token — without it the path returns 503 and stays closed. `vercel.json`
already schedules it. Admins can fire a pass by hand from Settings regardless.

## Ask Claude about Syncup

`/api/mcp` is a read-only MCP server. Create a token in Settings — it is shown once
and stored only as a SHA-256 hash — then add a custom connector in Claude pointing
at the URL with that token as the bearer credential.

Tools: `who_is_in`, `attendance_summary`, `list_tasks`, `daily_reports`,
`leave_overview`, `holidays`, `insights_summary`, `over_the_cap`. Every one of them
reads; none of them writes.

## Colour

The interface is monochrome. Colour appears in exactly two places, and means
something in both:

- **Magnitude** — a single-hue sequential ramp, validated for monotone lightness
  and contrast against the surface, scaled across the values actually present.
- **Status** — red, amber and green for late, overdue, blocked, priority and
  attendance bands. Never used to encode a quantity, and always shipped with a
  text label rather than colour alone.

## Deploying

Vercel plus a hosted Postgres. Set `DATABASE_URL`, `SESSION_SECRET`,
`APP_TIMEZONE` and `CRON_SECRET`, then run `npx prisma db push` against the
production database once. `npm run build` generates the Prisma client as part of
the build.
