# How work time is calculated

This document describes how Syncup Workplace counts **recorded work**, **break**, and **discarded idle** time — including what happens when a PC shuts down, the browser is closed, a tab is minimised, or the person switches away.

There is no background worker watching the clock. Time is inferred from **work sessions** plus a **browser heartbeat**. Silence (no heartbeat) is what turns a running timer into idle.

---

## Mental model

1. Check-in opens a `WORK` session and stamps attendance.
2. While the **My day** page is mounted, the browser pings `/api/day/heartbeat` every **60 seconds**.
3. Each ping updates `lastBeatAt` on every open session. That timestamp is the last sign of life.
4. Switching tabs, switching windows, or minimising the browser is **not** treated as idle. The heartbeat is designed to keep firing in those cases.
5. Sleep, shutdown, closing the browser, or otherwise killing JavaScript **stops** the heartbeat.
6. The next time that person's day is **read or written**, open sessions that have gone quiet for longer than the idle cut-off are closed at the **last heartbeat**, not at "now". The gap is stored as a separate `IDLE` session (capped) and is never counted as work.

Default idle cut-off: **30 minutes** (`Settings.idleAfterMinutes`, allowed range 2–120). It is configurable under Administration → Settings → "Discard as idle after".

---

## What is stored

`WorkSession` rows (`prisma/schema.prisma`):

| Field | Meaning |
|---|---|
| `kind` | `WORK`, `BREAK`, or `IDLE` |
| `startedAt` | When this stretch began |
| `endedAt` | When it ended. `null` means still running |
| `lastBeatAt` | Last heartbeat (or session start if none yet) |
| `date` | Calendar day of the session |
| `idleSeconds` | Present on the schema; **not used** by the current calculation |

Minutes for a closed session:

```
minutes = max(0, (endedAt − startedAt) / 60_000)
```

Minutes for a still-open session (until it is reconciled):

```
minutes = max(0, (now − startedAt) / 60_000)
```

Day totals (`lib/day.js` → `dayTotals`) sum those minutes by kind, then **round** each bucket. Insights (`lib/insights.js`) uses the same formula on closed sessions; a still-open session with `endedAt = null` contributes `NaN` there until it is closed.

Attendance check-in / check-out (`Attendance.checkInAt` / `checkOutAt`) are **clock stamps**, not the hours figure. Hours come from sessions. Presence for Insights also requires recorded **work** minutes to meet `minPresentMinutes` (company default 240 = 4 hours). Idle and break do not count toward that threshold.

---

## The heartbeat

Source: `app/MyDay.js`. Interval: `HEARTBEAT_MS = 60_000`.

```js
fetch('/api/day/heartbeat', { method: 'POST', keepalive: true })
```

- Fires once immediately on mount, then every minute.
- `keepalive: true` lets a ping finish even if the page is unloading.
- There is **no** `visibilitychange`, `blur`, `focus`, `pagehide`, or `beforeunload` handler. Tab hidden vs visible is ignored on purpose.
- The effect only runs while `running` is set (an open `WORK` or `BREAK` session) **and** the My day page is mounted.

Server handler (`app/api/day/heartbeat/route.js` → `lib/day.js` → `heartbeat`):

```js
workSession.updateMany({
  where: { userId, endedAt: null },
  data: { lastBeatAt: now },
})
```

The heartbeat **does not** close stale sessions. It only refreshes `lastBeatAt`. Reconciliation is a separate pass (see below).

The live clock on My day is cosmetic. It starts from the server totals at page load and ticks up locally every second. It is not what gets saved.

---

## When sessions are actually closed (reconciliation)

`reconcileSessions(userId)` in `lib/day.js` runs **lazily**, only for that one person, and only when:

| Trigger | Where |
|---|---|
| They open **My day** (`/`) | `app/page.js` |
| They switch work / break | `POST /api/day/session` |
| They file or close the day | `POST /api/day/report` |

There is **no cron** that reconciles idle sessions. Admin dashboards, Insights, and other people's pages do **not** close someone else's leftover timer. Until that person hits one of the three triggers above, an abandoned session can still look open.

For each open session:

1. `beat = lastBeatAt || startedAt`
2. **Stale** if `now − beat > idleAfterMinutes`
3. **From a past day** if the session's `date` is not today
4. If neither, leave it running

If stale or from a past day:

- Set `endedAt = beat` (credited only up to the last sign of life)
- If it was a **WORK** session **and** it was stale:
  - Create an `IDLE` session from `beat` until `min(now, beat + 120 minutes)`
  - Cap exists so an overnight abandoned timer does not dump the whole night into idle (`MAX_IDLE_RECORD_MINUTES = 120`)
  - Send the Slack DM "You were checked out automatically" if that DM is enabled

Break sessions that go stale are closed at `beat`. They do **not** create an `IDLE` row and do **not** send the inactivity DM.

**Important:** reconciliation does **not** set `Attendance.checkOutAt`. The Slack copy says "checked out", but the attendance record stays checked in with the clock stopped. On the admin day roll that state is labelled **"checked in, clock stopped"** (`idle`). A real check-out only happens when the person confirms End my day (or an admin corrects the record).

---

## Scenario matrix

Legend for the **Work counted?** column: what happens to the running `WORK` session after things settle.

### Stays working (heartbeat keeps going)

| What the person does | Heartbeat | Work counted? | Idle recorded? |
|---|---|---|---|
| Stays on **My day**, tab focused | Every 60s | Yes, continuously | No |
| Switches to another **tab** in the same browser, My day still open in a background tab | Designed to keep firing (browsers usually still run a 60s timer) | Yes | No |
| Switches to another **window or app** (Slack, IDE, etc.) | Same — JS timers keep running | Yes | No |
| **Minimises** the browser window | Same | Yes | No |
| Laptop **lid closed but machine does not sleep** (external display, or sleep disabled) | Same | Yes | No |
| Screen lock / Windows lock, PC still awake | Same | Yes | No |
| **Multiple My day tabs** open | Each tab pings independently | Yes, as long as at least one tab is alive | No |
| On a **break** (session kind `BREAK`) | Still pings | Break minutes, not work | No |

The product intent, from the code comment in `MyDay.js`:

> Fires regardless of tab visibility — switching tabs or windows must never look like idle time. Only the machine itself going to sleep or shutting down actually stops a JS timer from firing.

### Heartbeat stops — later treated as idle (after the cut-off)

| What happens | Heartbeat | When it is settled | Work counted? | Idle recorded? |
|---|---|---|---|
| **PC shut down** | Stops immediately | Next time they open My day, switch session, or file a report | Only up to last beat (up to ~1 minute before shutdown) | Yes — gap after last beat, capped at 120 minutes |
| **PC sleep / hibernate**, then they come back by loading My day fresh | Stopped while asleep | Reconcile runs on the server **before** the new page heartbeats | Only up to last beat before sleep | Yes, same cap |
| **All browser windows closed** | Stops | Same lazy reconcile | Only up to last beat | Yes, if silence > idle cut-off |
| **That tab closed** (and no other My day tab is open) | Stops | Same | Only up to last beat | Yes, if silence > idle cut-off |
| Browser **crashes** / Task Manager kills it | Stops | Same | Only up to last beat | Yes, if silence > idle cut-off |
| Tab **discarded** by the browser memory saver (page unloaded) | Stops | Same, once they return to a reconcile trigger | Only up to last beat | Yes, if silence > idle cut-off |
| Navigate away from **My day** to Tasks, Calendar, Account, etc. | Stops — the interval lives only on `/` | Same, once they return to `/` or hit session/report APIs | Only up to last beat on My day | Yes, if they stay elsewhere longer than the idle cut-off |

Closing the tab is called out on the My day UI: *"Counting. Close the tab and the clock stops with it."* The clock does not stop at the exact close instant. It stops at the last heartbeat, and the close is only **applied** on the next reconcile, and only if silence has exceeded the idle cut-off. If they reopen My day within the cut-off (default 30 minutes), the session is still considered alive and work continues from the original `startedAt`.

### Sleep / shutdown race (heartbeat after wake)

If the machine sleeps **without unloading the tab**, JavaScript is frozen. On wake, the existing `setInterval` can fire a heartbeat **without** running `reconcileSessions` first. That ping stamps `lastBeatAt = now`, which can hide the sleep gap and count it as work.

A **full reload** of My day after wake does the right thing: the server reconciles first, then the client starts heartbeating.

A hard shutdown, closed browser, or discarded tab cannot send that wake-up ping, so those cases settle correctly on the next visit.

### Manual actions (no idle)

| Action | What is written |
|---|---|
| **Take a break** | Open session ends at **now**. New `BREAK` session starts. Work is credited up to the click. |
| **Back to work** | Open session ends at **now**. New `WORK` session starts. If the day was already checked out, `checkOutAt` is cleared (day reopens). |
| **Check out / End my day** | Reconcile first (so a already-stale timer is closed at last beat + idle). Then any remaining open sessions end at **now**. `checkOutAt` is stamped. Slack check-out notice goes out. |
| **Start work again** after check-out | New `WORK` session; day reopens as above. |
| Admin sets check-in and check-out on a day with **no** sessions | One backfilled `WORK` session spanning those times. Days that already have sessions are not invented over. |

---

## End-to-end examples

Assume idle cut-off = 30 minutes, heartbeat every 60 seconds.

### 1. Tab change, minimise, other app

09:00 check-in. 09:05 switches to VS Code and minimises the browser. 12:00 comes back to My day.

Heartbeat kept running. Recorded work ≈ 3 hours. Idle = 0.

### 2. Browser closed

09:00 check-in. 13:00 closes the browser (last beat ~12:59). 15:00 opens My day.

Reconcile: `WORK` ends at ~12:59. `IDLE` from ~12:59 to 15:00 (about 121 minutes, **capped at 120**). Slack inactivity DM may fire. Attendance is still checked in; the clock is stopped until they click Back to work or Check out.

### 3. PC shut down overnight

18:00 still working. 18:30 shuts the PC (last beat ~18:29). Next morning 09:30 opens My day.

`WORK` ends at ~18:29. `IDLE` is only **120 minutes** (18:29–20:29), not the whole night. Yesterday's session is also closed because its `date` is not today (`fromPastDay`). They must check in again for the new day.

### 4. Closed tab, back within 30 minutes

11:00 working. 11:10 closes the tab. 11:25 reopens My day.

Silence is 15 minutes, under the 30-minute cut-off. Session is still open. Work continues from 11:00. Idle = 0.

### 5. Using Tasks all afternoon

10:00 working on My day. 10:05 goes to `/tasks` and never returns to `/`.

Heartbeat stopped at ~10:05. The session stays open in the database, and until they hit a reconcile trigger it can still look like running work on live totals. When they next open My day (or switch session / file a report) after 30+ minutes of silence, work is cut at ~10:05 and the rest becomes idle (capped at 120 minutes).

### 6. Break, then laptop sleep

14:00 Take a break. 14:20 laptop sleeps. Next visit after 40 minutes.

`BREAK` is closed at last beat. No `IDLE` row. No inactivity DM.

---

## What the three buckets mean on the UI

| Label | Session kind | Counts as presence hours? |
|---|---|---|
| Recorded work | `WORK` | Yes |
| On break | `BREAK` | No |
| Discarded as idle | `IDLE` | No |

Idle is shown on My day, daily reports, admin Insights ("Discarded as idle"), and Slack/export. It is never added to work.

---

## Browser behaviour the code does not fully control

These are environment limits, not extra product rules:

- **Background-tab throttling.** Chrome/Edge/Firefox throttle timers in hidden tabs. A 60-second interval usually still fires, which is why tab switches are treated as "still working".
- **Frozen / discarded tabs.** After long inactivity, browsers may freeze or discard a tab. Frozen timers do not fire; discarded tabs are unloaded. Either one looks like silence, same as closing the tab.
- **Heartbeat only on `/`.** Other signed-in pages share the chrome (`Shell` / `Nav`) but **do not** send heartbeats.
- **No Page Visibility API.** The app will not pause the clock because the tab is hidden.
- **`idleSeconds` on `WorkSession`** is unused. Discarded time is a separate `IDLE` session, not a field on the work row.

---

## Code map

| Piece | File |
|---|---|
| Heartbeat client | `app/MyDay.js` |
| Heartbeat API | `app/api/day/heartbeat/route.js` |
| Check-in (opens first `WORK` session) | `lib/day.js` → `checkIn` |
| Work / break / stop | `lib/day.js` → `switchSession`, `app/api/day/session/route.js` |
| Close stale sessions + write idle | `lib/day.js` → `reconcileSessions` |
| Sum work / break / idle | `lib/day.js` → `dayTotals` |
| Manual check-out | `lib/day.js` → `checkOut`, `app/api/day/report/route.js` |
| Idle cut-off setting | `lib/settings.js` (`idleAfterMinutes`, default 30) |
| Presence threshold | `lib/settings.js` (`minPresentMinutes`, default 240) |
| Admin "who is working" roll | `lib/roll.js` |
| Insights discarded-idle hours | `lib/insights.js` |
| Inactivity Slack DM | `lib/slack.js` → `checkedOutInactiveDm` |
| Integration test for stale heartbeat | `tests/integration/day.test.js` |

---

## Short answers

**PC shut down?** Work stops at the last heartbeat. After the idle cut-off, the gap (max 2 hours) is discarded as idle. Applied the next time that person opens My day (or switches session / files a report).

**All browsers closed?** Same as shutdown. Closing the tab is enough; other apps staying open do not keep the clock alive.

**Minimised / tab changed / another window focused?** Still working, by design, as long as My day remains loaded and the machine stays awake.

**Machine asleep?** Heartbeat stops. A fresh load of My day after wake discards the gap as idle. A frozen tab that resumes and pings without a reload can accidentally count the sleep as work.

**Checked out for inactivity?** The running work session is closed and idle is recorded. Attendance is not stamped checked out; they still appear as checked in with the clock stopped until they resume or check out for real.
