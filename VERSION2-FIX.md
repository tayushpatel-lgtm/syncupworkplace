# Time-tracking accuracy — version 2

What changed in the time-tracking system, how it works now, and a worked example for each fix. The source of truth for the original behaviour is `TIME-TRACKING.md`; this document is the changelog for the accuracy bugs listed there.

Apply the schema before running the app against a real database:

```
npx prisma generate
npx prisma db push
```

Prisma 6 will not declare unique on `WorkSession.openUserId` in `schema.prisma` — `db push` treats a new unique constraint as data loss and fails a non-interactive Vercel build. Existing rows are `NULL`, which Postgres unique allows in parallel. Both unique indexes (`WorkSession_openUserId_key` and the partial `WorkSession_userId_open_key` on `userId WHERE endedAt IS NULL`) are created on first settings read.

**Date rule (applies to every item below):** a “day” is the **company-local calendar day** in `APP_TIMEZONE` (default `Asia/Kolkata`). It is not UTC’s date, and not each person’s laptop timezone. `WorkSession.date`, `todayKey`, `startOfDay`, `endOfDay`, and the midnight split all use that rule.

---

## 1. Prevent overlapping open sessions

**Was:** `switchSession` closed the old row and opened the new one as two separate writes. Two overlapping clicks (or two tabs) could leave two `endedAt = null` sessions for the same person. Totals then double-counted.

**Now:**

- Every open session stamps `openUserId = userId`. That column is unique, so Postgres allows at most one open row per person (`NULL` once closed — many closed rows are fine).
- A partial unique index `WorkSession_userId_open_key` on `(userId) WHERE endedAt IS NULL` is created at boot (Prisma 6 cannot declare that predicate in `schema.prisma`).
- `switchSession` (and check-in + session create) runs inside a single `prisma.$transaction`. If a race still hits the unique constraint, the second call no-ops.

**Example:** Two My day tabs both send “Take a break” at the same instant.

- Tab A’s transaction closes WORK and opens BREAK.
- Tab B’s transaction either sees no open WORK (already closed) and is rejected by the unique index, or is serialised after A and no-ops.
- Result: one open BREAK, never two open sessions.

---

## 2. Sleep / wake heartbeat race

**Was:** Heartbeat always did `lastBeatAt = now` on every open session and never reconciled. A laptop that slept with the tab frozen would, on wake, fire `setInterval` and stamp “now” as the last beat. The sleep gap became recorded work.

**Now:** `heartbeat` loads open sessions first. If any is already stale (`now - lastBeatAt >` that session’s idle cut-off) or belongs to a previous company-local day, it runs `reconcileSessions` **before** touching `lastBeatAt`. Only sessions that are still legitimately open get a fresh beat.

**Example:** Idle cut-off 30 minutes.

- 18:00 still working. Last beat 18:00. Laptop sleeps.
- 09:30 next morning the frozen tab wakes and pings `/api/day/heartbeat`.
- Server sees `now - lastBeatAt` ≫ 30 minutes → reconciles: WORK ends at 18:00, IDLE capped at 120 minutes. It does **not** set `lastBeatAt = 09:30`.
- A full reload of My day was already correct (reconcile on page load). The wake-up ping is now correct too.

---

## 3. Split sessions at the day boundary

**Was:** A session that started Monday and still had a heartbeat (or a polluted `lastBeatAt`) on Tuesday was stored as one row on Monday. Tuesday showed zero sessions until a manual check-in. Overnight work was attributed to the start date.

**Now:** `reconcileSessions` looks at the company-local dates of `startedAt` / `session.date` vs `lastBeatAt` / today:

| Situation | What is written |
|---|---|
| Last beat is on a **later** day than start (span crossed midnight) | Close the original at `endOfDay(start date)` (= `startOfDay(next day)`). Open a continuation on the beat’s date from `startOfDay` with the same kind and frozen idle cut-off. Then, if that continuation is stale, close it at the last beat and record IDLE there. |
| Still alive across midnight (not stale, date is yesterday) | Same split at midnight; the continuation for **today** stays open so the clock keeps running. |
| Stale, and last beat is still on the start date (PC off overnight) | Close at last beat. No invented session for today. They check in again. Unchanged from example 3 in `TIME-TRACKING.md`. |

`endOfDay(D)` is exactly `startOfDay(D+1)`, so there is no missing minute and no overlap.

**Example A — worked past midnight, tab still alive**

- Monday 23:50 last beat. Tuesday 00:00 heartbeat arrives (not stale).
- Monday WORK closes at Tuesday 00:00 IST. Tuesday WORK opens at 00:00 IST, still running. Attendance for Tuesday is stamped when they check in; the running session is reused rather than doubled.

**Example B — last beat already on Tuesday (span to split)**

- Started Monday 18:00, `lastBeatAt` Tuesday 09:00, idle cut-off 2 minutes, now 11:00.
- Monday WORK: 18:00 → Monday end (Tuesday 00:00 IST).
- Tuesday WORK: 00:00 → 09:00 (closed, stale).
- IDLE from 09:00, capped at 120 minutes.

---

## 4. Guard against NaN in totals

**Was:** `dayTotals` used `(endedAt ?? now) - startedAt`. Insights used `(endedAt - startedAt)` on rows that could theoretically have `endedAt = null`, which is `NaN` and poisons `Math.round` / the whole bucket.

**Now:**

- `closedMinutes(startedAt, endedAt)` returns `0` unless both timestamps are real finite numbers.
- `dayTotals.work` / `.break` / `.idle` sum **closed** sessions only.
- Live time is a separate field: `liveWork`, `liveBreak`, `liveIdle`, plus `running`. The My day clock and tab title add live + elapsed for display; reports, Insights, and Slack hours never merge it in.
- Filing a report with **End my day** closes sessions first, then freezes minutes, so the frozen figure includes the stretch that just ended.

**Example:** Checked in at 09:00, still working at 09:05, files a draft report without closing.

- `minutesWorked` on the report is `0` (the open session is not a finalized sum), never `NaN`.
- The on-screen clock still shows ~5 minutes from `liveWork`.

---

## 5. Global backstop reconciliation job

**Was:** Sessions only closed when that person opened My day, switched work/break, or filed a report. Admin Insights and other people’s dashboards could show abandoned timers as still running for hours or days.

**Now:** `GET /api/cron/reconcile-idle` (Vercel cron every 20 minutes, `CRON_SECRET` bearer) and an admin POST from Settings → “Reconcile stale sessions now”. It finds every open session in the company past a 2-minute floor (or left on a previous company-local day) and runs `reconcileSessions` per person, using each session’s **frozen** cut-off.

**Example:** Deepak checks in, closes the laptop at 18:00, and does not open the app again. At 18:20 the cron closes his WORK at the last beat and writes IDLE. Insights and the admin day roll stop showing him as working.

---

## 6. Pin the idle cut-off per session

**Was:** Reconcile always read `Settings.idleAfterMinutes`. Changing “Discard as idle after” from 30 → 10 mid-afternoon would suddenly treat 15 minutes of already-elapsed silence as idle (or the reverse: 10 → 60 would resurrect a stretch that should have stopped).

**Now:** `WorkSession.idleCutoffMinutes` is copied from settings at session creation (check-in, switch, day-boundary continuation, admin backfill). Reconcile and heartbeat use that stored value (`session.idleCutoffMinutes ?? settings.idleAfterMinutes`). New sessions pick up the new setting; old ones do not.

**Example:** Session opened at 09:00 with cut-off 2 minutes. Admin changes the company setting to 120 at 09:10. Heartbeat stops at 09:05. At 09:20 reconcile still closes at 09:05 because 15 minutes > **2**, not 120.

---

## 7. Explicit date / timezone rule

**Was:** `dayKey()` used company timezone, but some comparisons used `date.toISOString().slice(0, 10)` on instants (UTC date). Unspecified whether “today” was UTC or local.

**Now:** Company-local day, documented on `lib/dates.js`. Helpers:

- `dayKey(instant)` — company-local `YYYY-MM-DD`
- `dateFieldKey(dateColumn)` — key stored on `@db.Date` (UTC midnight of that company day)
- `startOfDay(key)` / `endOfDay(key)` — first instant of that day / of the next day, in company TZ

`checkIn`, `reconcileSessions`, `dayTotals`, heartbeat “from past day”, and admin session edits all use these.

**Example:** Instant `2026-08-11T19:00:00.000Z` is 00:30 IST on **12 Aug**. Session date is `2026-08-12`, not `2026-08-11`.

---

## 8. Debounce rapid session switches

**Was:** A double-click on “Take a break” (or a flaky retry) closed WORK, opened BREAK, then immediately closed BREAK and opened another BREAK — noise rows of 0–1 seconds.

**Now:** `POST /api/day/session` no-ops (`{ ok: true, skipped: true }`) if the latest **open** session is the **same kind** and started less than 5 seconds ago. Switching to the other kind, checking in then immediately taking a break, and “Back to work” after a real check-out are unaffected.

**Example:** Two BREAK posts 200 ms apart → one BREAK row. BREAK then WORK in the same second → allowed (different kind). Check-out then WORK → allowed (latest start was this morning, not just now).

---

## 9. Admin session edit / merge

**Was:** Admin attendance backfill only invented a WORK session when the day had **zero** sessions. Days with a bad split or a missing break could not be repaired.

**Now:**

- `GET /api/admin/sessions?userId=&date=` — list that day’s sessions (admins only).
- `PATCH /api/admin/sessions/:id` — `startedTime`, `endedTime`, `kind`, **reason** (min 3 characters). Times are interpreted on that company-local day.
- `POST /api/admin/sessions` — `{ keepId, absorbId, reason }` merges two adjacent sessions (gap ≤ 1 minute). `keepId` survives.
- Every write appends `SessionAuditLog` (`EDIT` / `MERGE`, actor, reason, before/after).
- The attendance “Fix a mistake” modal lists sessions, save-per-row, and merge.

**Example:** Two WORK rows 09:00–10:00 and 10:00–11:00 from a glitch. Admin merges with reason “Duplicate split from a glitch”. One 09:00–11:00 WORK row remains; the audit log keeps both originals in `before`.

---

## 10. Stale-break alerting

**Was:** A stale WORK session sent “You were checked out automatically”. A stale BREAK just closed with no DM — a forgotten break produced no signal.

**Now:**

- `Settings.staleBreakAlertMinutes` (default 30, range 5–240).
- `Settings.slackDmOnStaleBreak` (off by default, same family as the inactivity DM).
- When a BREAK is closed as stale and silence ≥ `staleBreakAlertMinutes`, Slack sends `staleBreakDm` (“Your break was closed automatically”).
- Closing still uses the session’s frozen idle cut-off; the alert threshold only decides whether to notify.

**Example:** Break started 14:00, last beat 14:01, idle cut-off 2 minutes, alert 5 minutes. At 14:12 heartbeat/cron: BREAK ends at 14:01. Silence is 11 minutes ≥ 5 → DM fires (if the Slack DM toggle is on). No IDLE row (breaks never create idle).

---

## Code map (additions)

| Piece | File |
|---|---|
| Reconcile, heartbeat, totals, switch debounce, admin edit/merge | `lib/day.js` |
| Company-local day helpers + `closedMinutes` | `lib/dates.js` |
| Frozen idle cut-off, unique open session | `prisma/schema.prisma` (`WorkSession`) |
| Partial unique index at boot | `lib/settings.js` → `ensureOpenSessionIndex` |
| Backstop cron | `app/api/cron/reconcile-idle/route.js`, `.github/workflows/cron.yml` (`*/20 * * * *`) |
| Admin session APIs | `app/api/admin/sessions/` |
| Stale-break DM | `lib/slack.js` → `staleBreakDm` |
| Insights NaN guard | `lib/insights.js` → `closedMinutes` |
| Integration coverage | `tests/integration/day.test.js` |
