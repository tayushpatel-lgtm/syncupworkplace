# How the timer works

This describes time tracking on the current codebase (`prod` / Claude team-tool line): what the UI shows, how heartbeats keep a session alive, and how idle time is cut off.

## Big picture

Time is **not** “whatever the browser clock says.” The source of truth is rows in `WorkSession`. The UI clock is a live display on top of that. A **heartbeat** proves the machine is still awake. When heartbeats stop long enough, reconciliation closes the open session at the **last beat**, not “now.”

```
Check in → open WORK session
    ↓
Browser heartbeats every 60s → update lastBeatAt
    ↓
UI ticks every 1s (display only)
    ↓
Take a break / Back to work → close open session, open BREAK or WORK
    ↓
Check out → close open sessions + set Attendance.checkOutAt
```

Idle path (separate from check-out):

```
No heartbeat for idleAfterMinutes (default 30)
    → next reconcile closes WORK/BREAK at lastBeatAt
    → optional IDLE row for the gap (WORK only, capped)
    → optional Slack DM (“checked out automatically”)
    → Attendance.checkOutAt is NOT set
```

---

## Data model

### `Attendance` (the day stamp)

| Field | Role |
|--------|------|
| `checkInAt` | Day started |
| `checkOutAt` | Day ended for real (End my day) |
| `checkInBy` | Late deadline frozen at check-in |
| `late` | Arrived after deadline |

Idle stop does **not** set `checkOutAt`. The person can still look “checked in” with the clock stopped until they resume or check out.

### `WorkSession` (the stretches)

| Field | Role |
|--------|------|
| `kind` | `WORK`, `BREAK`, or `IDLE` |
| `startedAt` / `endedAt` | Span; `endedAt` null = currently open |
| `lastBeatAt` | Last successful heartbeat (or start time) |
| `date` | Company-local calendar day |

Insights and day totals sum these rows.

### Settings

- **`idleAfterMinutes`** (default **30**, admin Settings) — silence before a running stretch is closed as idle.
- Idle recording for a dropped WORK session is capped at **`MAX_IDLE_RECORD_MINUTES` = 120** in `lib/day.js`, so overnight silence does not invent hours of “idle.”

---

## Display clock (My day)

File: `app/MyDay.js`

When there is an open session (`running`), the client:

1. Takes `from = Date.now()` when the session kind / `startedAt` changes.
2. Runs `setInterval` every **1 second** and sets `elapsed` to seconds since `from`.
3. Shows:

```text
workSeconds  = totals.work  * 60 + (running WORK  ? elapsed : 0)
breakSeconds = totals.break * 60 + (running BREAK ? elapsed : 0)
```

`totals.work` / `totals.break` already include time through “now” for the open session (see `dayTotals` below). On first paint, `elapsed` is 0 so the UI matches the server. After that, `elapsed` is only the **extra** seconds since that page load / session switch — it is **not** anchored to `running.startedAt`.

Actions (break / resume / plan / report) call the API, reset `elapsed` to 0, and `router.refresh()` so server totals reload.

There is **no** tab-title live clock and **no** web worker on this branch.

---

## Heartbeat

### Client

File: `components/Heartbeat.js`  
Mounted in `app/layout.js` for every page (signed-in or not).

- On mount: `POST /api/day/heartbeat` immediately.
- Then every **60_000 ms**.
- Uses `keepalive: true` so a beat can finish during navigation/unload.
- Failures are swallowed (`.catch(() => {})`).
- Unauthenticated calls get **401** from `apiUser` and do nothing useful.

So heartbeats keep firing on **any** Syncup route while the app shell is loaded — not only on My day. What stops them is the **machine** sleeping, crashing, or closing the browser process (JS timers stop). Switching tabs or apps does not stop the interval by itself.

### Server

`POST /api/day/heartbeat` → `heartbeat(userId)` in `lib/day.js`:

```js
updateMany({ where: { userId, endedAt: null }, data: { lastBeatAt: now } })
```

It does **not** reconcile, does **not** return whether a session is still running, and does **not** create IDLE rows. It only stamps open sessions as still alive.

---

## Server totals

`dayTotals(userId, key)` loads that day’s sessions and for each row:

- Uses `endedAt` or **now** if still open.
- Adds minutes into `work` / `break` / `idle` by kind.
- Sets `running` to the open session (`id`, `kind`, `startedAt`) if any.
- Rounds work / break / idle to whole minutes.

So while you are on WORK, `totals.work` already includes the open stretch up to request time; My day then adds `elapsed` on top for the live seconds.

---

## Reconciliation (idle cut-off)

`reconcileSessions(userId)` in `lib/day.js` runs **before** meaningful day reads/writes, for example:

- Loading My day (`app/page.js`)
- Switching WORK / BREAK / STOP (`/api/day/session`)
- Filing the report / ending the day (`/api/day/report`)

There is **no** separate cron / background worker on this branch for idle. Numbers stay correct when someone next hits those paths.

For each open session:

1. `beat = lastBeatAt || startedAt`
2. **Stale** if `now - beat > idleAfterMinutes`
3. **From past day** if session `date` ≠ today’s company day
4. If stale or from past day:
   - Set `endedAt = beat` (credit only through last sign of life)
   - If `WORK` and stale: create an `IDLE` session from `beat` to `min(now, beat + 120 minutes)`
   - If a WORK session was closed as stale: may send Slack DM via `checkedOutInactiveDm` (“You were checked out automatically”) once for that pass

Important:

- Closing for inactivity is **not** a real check-out (`checkOutAt` stays null).
- The Slack wording says “checked out”; attendance may still be checked in until End my day or resume work.

---

## Session switches

`POST /api/day/session` with `kind`: `WORK` | `BREAK` | `STOP`

1. `reconcileSessions`
2. `switchSession`:
   - Close every open session at **now**
   - If not `STOP`, open a new session of that kind with `lastBeatAt = now`
   - Starting `WORK` again clears `checkOutAt` if the day was already closed (day reopens)

UI buttons on My day: **Take a break**, **Back to work** / **Resume work** / **Start work again**.

---

## Check-in and check-out

### Check-in

1. `POST /api/day/check-in` — creates/updates attendance, opens first `WORK` session, builds plan (popup still open).
2. Person confirms plan in the popup.
3. `POST /api/day/check-in/confirm` — Slack channel + DMs with the finalized plan.

### Check-out (real end of day)

1. Popup → `POST /api/day/report` with `closeDay: true`, summary, done plan ids.
2. Reconcile → freeze report figures → `checkOut` (close open sessions, set `checkOutAt`) → Slack notices.

Updating the report later without `closeDay` does not re-check-out.

---

## File map

| Piece | Location |
|--------|----------|
| Live UI clock | `app/MyDay.js` |
| Heartbeat client | `components/Heartbeat.js` + `app/layout.js` |
| Heartbeat API | `app/api/day/heartbeat/route.js` |
| Session switch API | `app/api/day/session/route.js` |
| Day logic | `lib/day.js` (`reconcileSessions`, `dayTotals`, `heartbeat`, `switchSession`, `checkIn`, `checkOut`) |
| Idle setting | `Settings.idleAfterMinutes` / admin Settings form |
| Schema | `prisma/schema.prisma` → `WorkSession`, `Attendance` |

---

## Mental model cheat sheet

| What you see | What it means |
|--------------|----------------|
| Big clock counting | Open `WORK` (or break counter for `BREAK`) + client `elapsed` |
| Heartbeat every minute | `lastBeatAt` refreshed while Syncup is loaded in the browser |
| Laptop sleeps 40+ minutes | Next reconcile ends session at last beat; gap may become IDLE |
| “Checked out automatically” DM | Idle close of WORK — **not** necessarily `checkOutAt` |
| End my day | Real check-out: sessions closed at now + `checkOutAt` set |
| Resume work after idle | New `WORK` session; day stays / becomes open again |

---

## Known limitations (current design)

1. **Display `elapsed` is mount-relative** — after a long stay on My day without refresh, the on-screen total is still correct relative to the totals loaded at last refresh + elapsed; after idle reconcile elsewhere, you need a refresh to see the stopped state.
2. **Heartbeat does not run reconcile** — idle is applied when the day is next loaded or mutated, not on each beat.
3. **Root-layout heartbeat** fires on login and other unauthenticated pages too (harmless 401s).
4. **Background tab throttling** — browsers can delay `setInterval`; sleep/shutdown is the hard stop. This branch does not use a dedicated worker for ticks/heartbeats.
