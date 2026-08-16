/* eslint-disable no-console */
// Seeds a company with a month of plausible history, so every screen has
// something real to render on first run. Deterministic: same data every time.

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const WORKING_DAYS = [1, 2, 3, 4, 5, 6];
const HISTORY_DAYS = 32;

// A tiny seeded generator, so a reseed produces the same company.
let seed = 20260815;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function pick(list) {
  return list[Math.floor(rand() * list.length)];
}

function dayKey(offset = 0) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
function dayDate(key) {
  return new Date(`${key}T00:00:00.000Z`);
}
function at(key, hour, minute) {
  return new Date(`${key}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);
}
function weekday(key) {
  const d = new Date(`${key}T00:00:00.000Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

const PEOPLE = [
  ['Ayush', 'ayush@syncup.in', 'CEO', null, 'CEO'],
  ['Chhavi', 'chhavi@syncup.in', 'ADMIN', 'Operations', 'Operations lead'],
  ['Deepak', 'deepak@syncup.in', 'EMPLOYEE', 'Engineering', 'Developer'],
  ['Ganpat', 'ganpat@syncup.in', 'EMPLOYEE', 'Engineering', 'Developer'],
  ['Navaneetha', 'navaneetha@syncup.in', 'EMPLOYEE', 'Design', 'Designer'],
  ['Nitin', 'nitin@syncup.in', 'EMPLOYEE', 'Engineering', 'Developer'],
  ['Rajeevi', 'rajeevi@syncup.in', 'EMPLOYEE', 'Sales', 'Account manager'],
  ['Riza', 'riza@syncup.in', 'EMPLOYEE', 'Design', 'Designer'],
  ['Sahil', 'sahil@syncup.in', 'EMPLOYEE', 'Engineering', 'Developer'],
  ['Satakshi', 'satakshi@syncup.in', 'EMPLOYEE', 'Sales', 'Account manager'],
  ['Tanvi', 'tanvi@syncup.in', 'EMPLOYEE', 'Operations', 'Coordinator'],
  ['Vikram', 'vikram@syncup.in', 'EMPLOYEE', 'Engineering', 'QA'],
  ['Zoya', 'zoya@syncup.in', 'EMPLOYEE', 'Design', 'Researcher'],
];

const TASK_TITLES = [
  'Prepare the launch notes for the client',
  'Refine the empty states on the dashboard',
  'Set up the deploy health check',
  'Send the revised team handbook',
  'Audit the task handoff experience',
  'Close out the quarterly invoices',
  'Rewrite the onboarding email',
  'Fix the timezone drift in exports',
  'Draft the pricing one-pager',
  'Review the vendor contract',
  'Cut the release candidate',
  'Update the attendance policy page',
  'Chase the outstanding purchase order',
  'Run the accessibility pass on the reports screen',
  'Write the incident postmortem',
  'Plan the offsite agenda',
];

const REPORT_LINES = [
  'Cleared the backlog on the client work and pushed the fix that was blocking review.',
  'Most of the day went into the handover doc. Slower than planned but it is done.',
  'Two calls ate the morning. Picked up the deploy work after lunch and finished it.',
  'Blocked on the vendor reply for half the day, so I moved onto the smaller items.',
  'Good run today — closed three things and started the next one.',
  'Spent the day pairing with Deepak on the timezone bug. Root cause found.',
  'Admin day. Invoices out, policy page updated, inbox back to zero.',
  'Design review took longer than expected but we landed on a direction.',
];

const PLAN_EXTRAS = [
  'Reply to the client thread',
  'Review the open pull requests',
  'Prep for tomorrow standup',
  'Tidy the shared drive',
  'Follow up with the vendor',
];

async function main() {
  console.log('Clearing existing data…');
  await prisma.$transaction([
    prisma.onboardingProgress.deleteMany(),
    prisma.planPoint.deleteMany(),
    prisma.dailyReport.deleteMany(),
    prisma.workSession.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.task.deleteMany(),
    prisma.leaveRequest.deleteMany(),
    prisma.leaveBalance.deleteMany(),
    prisma.onboardingStep.deleteMany(),
    prisma.holiday.deleteMany(),
    prisma.mcpToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  console.log('Settings…');
  await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, workingDays: WORKING_DAYS },
    update: { workingDays: WORKING_DAYS },
  });

  console.log('People…');
  const passwordHash = await bcrypt.hash('syncup1234', 10);
  const users = [];
  for (const [name, email, role, department, title] of PEOPLE) {
    users.push(
      await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          role,
          department,
          title,
          checkInBy: name === 'Rajeevi' ? '10:00' : null,
          joinedAt: dayDate(dayKey(-400)),
        },
      }),
    );
  }

  console.log('Onboarding checklist…');
  const steps = [
    ['Read the employee handbook', 'Policies, hours and how leave works.'],
    ['Set up your work email signature', 'Name, role and company details.'],
    ['Complete security basics', 'Password manager and two-factor on every work account.'],
  ];
  const stepRows = [];
  for (let i = 0; i < steps.length; i += 1) {
    stepRows.push(
      await prisma.onboardingStep.create({
        data: { title: steps[i][0], description: steps[i][1], order: i + 1 },
      }),
    );
  }

  // Everyone except one newcomer has already worked through the checklist, so the
  // gate is visible without locking the whole company out of the demo.
  await prisma.onboardingProgress.createMany({
    data: users
      .filter((user) => user.name !== 'Zoya')
      .flatMap((user) => stepRows.map((step) => ({ userId: user.id, stepId: step.id }))),
  });

  console.log('Holidays…');
  const year = new Date().getUTCFullYear();
  // The real 2026 Indian gazetted holiday calendar. Islamic dates (Ramzan Id,
  // Bakrid, Muharram) shift about 11 days earlier every Gregorian year, so
  // this list is specific to 2026 — reseeding in a later year with the same
  // dates would be wrong for those. Load the real list for that year from the
  // Holidays admin page's bulk importer.
  const HOLIDAYS_2026 = [
    ['01-26', 'Republic Day'],
    ['03-04', 'Holi'],
    ['03-21', 'Ramzan Id'],
    ['03-26', 'Rama Navami'],
    ['03-31', 'Mahavir Jayanti'],
    ['04-03', 'Good Friday'],
    ['04-14', 'Ambedkar Jayanti'],
    ['05-01', 'Buddha Purnima'],
    ['05-28', 'Bakrid'],
    ['06-26', 'Muharram/Ashura'],
    ['08-15', 'Independence Day'],
    ['08-26', 'Milad un-Nabi'],
    ['10-02', 'Mahatma Gandhi Jayanti'],
    ['10-20', 'Dussehra'],
    ['11-08', 'Diwali/Deepavali'],
    ['11-24', 'Guru Nanak Jayanti'],
    ['12-25', 'Christmas'],
  ];
  const holidayKeys = new Set();
  for (const [monthDay, name] of HOLIDAYS_2026) {
    const date = `${year}-${monthDay}`;
    await prisma.holiday.create({ data: { date: dayDate(date), name } });
    holidayKeys.add(date);
  }

  console.log('Leave balances…');
  await prisma.leaveBalance.createMany({
    data: users.map((user) => ({
      userId: user.id,
      year,
      sickTotal: 12,
      plannedTotal: 12,
      carried: 7,
      sickUsed: 0,
      plannedUsed: 0,
    })),
  });

  console.log('Tasks…');
  const tasks = [];
  for (let i = 0; i < 34; i += 1) {
    const assignee = pick(users);
    const creator = pick(users);
    const roll = rand();
    const status = roll < 0.4 ? 'COMPLETED' : roll < 0.62 ? 'PROGRESS' : roll < 0.9 ? 'PENDING' : 'BLOCKED';
    const createdOffset = -Math.floor(rand() * 26) - 1;
    const dueOffset = createdOffset + 2 + Math.floor(rand() * 9);

    tasks.push(
      await prisma.task.create({
        data: {
          title: TASK_TITLES[i % TASK_TITLES.length],
          detail: rand() > 0.6 ? 'Everything needed is in the shared drive.' : null,
          status,
          priority: rand() > 0.75 ? 'HIGH' : rand() > 0.35 ? 'MEDIUM' : 'LOW',
          dueDate: dayDate(dayKey(dueOffset)),
          assigneeId: assignee.id,
          creatorId: creator.id,
          createdAt: at(dayKey(createdOffset), 5, 30),
          completedAt: status === 'COMPLETED' ? at(dayKey(Math.min(-1, dueOffset)), 12, 0) : null,
        },
      }),
    );
  }

  console.log('Leave requests…');
  await prisma.leaveRequest.create({
    data: {
      userId: users[4].id,
      kind: 'PLANNED',
      startDate: dayDate(dayKey(6)),
      endDate: dayDate(dayKey(8)),
      days: 3,
      reason: 'Family wedding',
      status: 'PENDING',
    },
  });
  await prisma.leaveRequest.create({
    data: {
      userId: users[6].id,
      kind: 'SICK',
      startDate: dayDate(dayKey(-9)),
      endDate: dayDate(dayKey(-9)),
      days: 1,
      reason: 'Fever',
      status: 'APPROVED',
      decidedById: users[0].id,
      decidedAt: at(dayKey(-10), 6, 0),
    },
  });
  await prisma.leaveBalance.updateMany({
    where: { userId: users[6].id, year },
    data: { sickUsed: 1 },
  });

  console.log('History — attendance, sessions, plans and reports…');
  let sessionCount = 0;
  let reportCount = 0;

  // Every day's writes go in as one batch per table instead of one call per
  // person — a local database shrugs off thousands of small round trips, but a
  // hosted one pays real network latency for each, so this is the difference
  // between a few seconds and several minutes.
  const workingKeys = [];
  for (let offset = -HISTORY_DAYS; offset <= -1; offset += 1) {
    const key = dayKey(offset);
    if (WORKING_DAYS.includes(weekday(key)) && !holidayKeys.has(key)) workingKeys.push(key);
  }

  for (let i = 0; i < workingKeys.length; i += 1) {
    const key = workingKeys[i];
    const attendanceRows = [];
    const sessionRows = [];
    const planRows = [];
    const reportRows = [];

    for (const user of users) {
      // Not everyone is in every day.
      if (rand() > 0.86) continue;

      const late = rand() > 0.78;
      const startHour = late ? 4 : 3; // UTC — 09:30 IST is 04:00 UTC
      const startMinute = late ? 15 + Math.floor(rand() * 40) : 40 + Math.floor(rand() * 18);
      const checkInAt = at(key, startHour, startMinute);

      attendanceRows.push({
        userId: user.id,
        date: dayDate(key),
        checkInAt,
        checkInBy: user.checkInBy || '09:30',
        late,
        status: 'PRESENT',
      });

      // A morning block, a break, an afternoon block — and sometimes a stretch
      // the heartbeat threw away.
      const morningEnd = new Date(checkInAt.getTime() + (150 + rand() * 80) * 60000);
      const breakEnd = new Date(morningEnd.getTime() + (25 + rand() * 35) * 60000);
      const afternoonEnd = new Date(breakEnd.getTime() + (160 + rand() * 110) * 60000);

      sessionRows.push(
        { userId: user.id, date: dayDate(key), kind: 'WORK', startedAt: checkInAt, endedAt: morningEnd, lastBeatAt: morningEnd },
        { userId: user.id, date: dayDate(key), kind: 'BREAK', startedAt: morningEnd, endedAt: breakEnd, lastBeatAt: breakEnd },
        { userId: user.id, date: dayDate(key), kind: 'WORK', startedAt: breakEnd, endedAt: afternoonEnd, lastBeatAt: afternoonEnd },
      );
      sessionCount += 3;

      if (rand() > 0.55) {
        const idleStart = afternoonEnd;
        const idleEnd = new Date(idleStart.getTime() + (20 + rand() * 70) * 60000);
        sessionRows.push({ userId: user.id, date: dayDate(key), kind: 'IDLE', startedAt: idleStart, endedAt: idleEnd });
        sessionCount += 1;
      }

      // The plan for the day, mostly ticked off.
      const pointCount = 2 + Math.floor(rand() * 3);
      let done = 0;
      for (let p = 0; p < pointCount; p += 1) {
        const isDone = rand() > 0.25;
        if (isDone) done += 1;
        planRows.push({
          userId: user.id,
          date: dayDate(key),
          title: pick(PLAN_EXTRAS),
          order: p + 1,
          done: isDone,
          doneAt: isDone ? afternoonEnd : null,
          originDate: dayDate(key),
        });
      }

      if (rand() > 0.2) {
        const workedMinutes = Math.round(
          (morningEnd - checkInAt + (afternoonEnd - breakEnd)) / 60000,
        );
        reportRows.push({
          userId: user.id,
          date: dayDate(key),
          summary: pick(REPORT_LINES),
          submittedAt: afternoonEnd,
          minutesWorked: workedMinutes,
          minutesBreak: Math.round((breakEnd - morningEnd) / 60000),
          minutesIdle: 0,
          pointsDone: done,
          pointsTotal: pointCount,
          tasksCompleted: rand() > 0.7 ? 1 : 0,
        });
        reportCount += 1;
      }
    }

    await Promise.all([
      attendanceRows.length && prisma.attendance.createMany({ data: attendanceRows }),
      sessionRows.length && prisma.workSession.createMany({ data: sessionRows }),
      planRows.length && prisma.planPoint.createMany({ data: planRows }),
      reportRows.length && prisma.dailyReport.createMany({ data: reportRows }),
    ]);

    console.log(`  day ${i + 1}/${workingKeys.length} — ${key} (${attendanceRows.length} people)`);
  }

  console.log('');
  console.log(`  ${users.length} people, ${tasks.length} tasks`);
  console.log(`  ${sessionCount} work sessions, ${reportCount} daily reports`);
  console.log('');
  console.log('  Sign in with any of these — the password is the same for all:');
  console.log('    ayush@syncup.in    (CEO)');
  console.log('    chhavi@syncup.in   (admin)');
  console.log('    deepak@syncup.in   (employee)');
  console.log('    password: syncup1234');
  console.log('');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
