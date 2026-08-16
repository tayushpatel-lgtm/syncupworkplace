import { prisma } from './db';
import { getSettings } from './settings';
import { dayRoll, STATE_LABEL } from './roll';
import { buildInsights } from './insights';
import { ensureBalance, remaining, applyToBalance, currentYear } from './leave';
import { openTaskCount, buildPlan } from './day';
import { postToSlack, taskAssignedMessage, statusChangeMessage, statusChangeDm, sendDirectMessage, taskAssignedDm } from './slack';
import { dayKey, dayDate, shiftDay, formatDuration, rangeKeys } from './dates';

const DATE = { type: 'string', description: 'A day as YYYY-MM-DD. Defaults to today.' };
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const STATUSES = ['PENDING', 'PROGRESS', 'COMPLETED', 'BLOCKED'];

/**
 * Read tools work with any token. Write tools require a READ_WRITE token, and
 * their actions are attributed to whichever admin the token was minted for.
 * Nothing here ever deletes a person or resets a password — those stay
 * human-only actions in the UI regardless of a token's scope.
 */
export const READ_TOOLS = [
  {
    name: 'who_is_in',
    description:
      'Who is working right now on a given day: their state, arrival time, recorded hours, plan progress, open tasks and whether the daily report is filed.',
    inputSchema: { type: 'object', properties: { date: DATE } },
  },
  {
    name: 'attendance_summary',
    description:
      'Attendance over a rolling window: days present against days expected, late arrivals, leave taken and hours recorded, per person.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Window length in days. Defaults to 30.' },
      },
    },
  },
  {
    name: 'list_tasks',
    description:
      'Tasks across the company, filterable by assignee name, status, priority and whether they are overdue.',
    inputSchema: {
      type: 'object',
      properties: {
        assignee: { type: 'string', description: 'Match a person by name, case-insensitive.' },
        status: {
          type: 'string',
          enum: ['PENDING', 'PROGRESS', 'COMPLETED', 'BLOCKED', 'OPEN'],
          description: 'OPEN means pending or in progress.',
        },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
        overdueOnly: { type: 'boolean' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'daily_reports',
    description:
      'End-of-day reports for one day or a range, with the figures the app composed alongside what the person wrote.',
    inputSchema: {
      type: 'object',
      properties: {
        date: DATE,
        toDate: { type: 'string', description: 'Optional end of a range, YYYY-MM-DD.' },
        person: { type: 'string', description: 'Match a person by name, case-insensitive.' },
      },
    },
  },
  {
    name: 'leave_overview',
    description: 'Leave balances for everyone this year, plus every request still waiting on a decision.',
    inputSchema: { type: 'object', properties: { year: { type: 'number' } } },
  },
  {
    name: 'holidays',
    description: 'Company holidays for a year, and the working week they sit against.',
    inputSchema: { type: 'object', properties: { year: { type: 'number' } } },
  },
  {
    name: 'insights_summary',
    description:
      'The company numbers over a rolling window: hours worked, attendance, where the time went, department split and task throughput.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Defaults to 30.' } },
    },
  },
  {
    name: 'over_the_cap',
    description:
      'People at or near the assignment cap — how many open tasks each is holding against the limit.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export const WRITE_TOOLS = [
  {
    name: 'assign_task',
    description:
      'Create a task and assign it to someone. It lands on their plan today. Subject to the ' +
      'per-person assignment cap — fails if they are already holding that many open tasks. ' +
      'Requires a read-write token.',
    inputSchema: {
      type: 'object',
      required: ['assignee', 'title'],
      properties: {
        assignee: { type: 'string', description: 'Match a person by name or email.' },
        title: { type: 'string' },
        detail: { type: 'string' },
        priority: { type: 'string', enum: PRIORITIES },
        dueDate: DATE,
      },
    },
  },
  {
    name: 'update_task_status',
    description:
      'Move an existing task to a new status (pending, in progress, completed, blocked). ' +
      'Requires a read-write token.',
    inputSchema: {
      type: 'object',
      required: ['task', 'status'],
      properties: {
        task: { type: 'string', description: 'Match a task by part of its title.' },
        assignee: { type: 'string', description: "Narrow the match to one person's tasks, by name." },
        status: { type: 'string', enum: STATUSES },
      },
    },
  },
  {
    name: 'decide_leave',
    description:
      'Approve or reject a pending leave request. An approval spends the balance. ' +
      'Requires a read-write token.',
    inputSchema: {
      type: 'object',
      required: ['person', 'decision'],
      properties: {
        person: { type: 'string', description: 'Match by name.' },
        decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] },
        note: { type: 'string' },
      },
    },
  },
];

export const TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

/** What a token of this scope is allowed to call. */
export function toolsForScope(scope) {
  return scope === 'READ_WRITE' ? TOOLS : READ_TOOLS;
}

function asDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : dayKey();
}

async function findPeople(name) {
  if (!name) return null;
  const people = await prisma.user.findMany({
    where: { name: { contains: String(name), mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  return people;
}

/** Resolve exactly one active person by email or name, for the write tools. */
async function findPerson(query) {
  const q = String(query || '').trim();
  if (!q) return { error: 'A person is required.' };

  const byEmail = await prisma.user.findFirst({ where: { email: { equals: q, mode: 'insensitive' }, active: true } });
  if (byEmail) return { person: byEmail };

  const matches = await prisma.user.findMany({ where: { name: { contains: q, mode: 'insensitive' }, active: true } });
  if (matches.length === 0) return { error: `Nobody active here matches "${q}".` };
  if (matches.length > 1) {
    return { error: `More than one person matches "${q}": ${matches.map((m) => m.name).join(', ')}. Be more specific.` };
  }
  return { person: matches[0] };
}

/**
 * @param ctx.actor The admin this token was minted for — write tools attribute
 *   their actions (task creator, leave decider) to this person.
 */
export async function runTool(name, args = {}, ctx = {}) {
  switch (name) {
    case 'who_is_in': {
      const key = asDay(args.date);
      const { rows, working, holidayName } = await dayRoll(key);
      return {
        date: key,
        workingDay: working,
        holiday: holidayName,
        people: rows.map((r) => ({
          name: r.name,
          department: r.department,
          state: STATE_LABEL[r.state],
          checkedInAt: r.checkInAt,
          late: r.late,
          pastDeadline: r.overdue,
          recorded: formatDuration(r.work),
          idle: formatDuration(r.idle),
          plan: `${r.plan.done}/${r.plan.total}`,
          openTasks: r.openTasks,
          reportFiled: r.filed,
        })),
      };
    }

    case 'attendance_summary': {
      const days = Math.min(365, Math.max(1, Number(args.days) || 30));
      const data = await buildInsights(days);
      return {
        window: `${data.fromKey} to ${data.today}`,
        workingDays: data.workingDayCount,
        companyAttendance: `${data.attendancePct}%`,
        lateArrivals: data.lateTotal,
        people: data.perPerson.map((p) => ({
          name: p.name,
          department: p.department,
          hours: formatDuration(p.minutes),
          present: p.present,
          expected: p.expected,
          late: p.late,
          onLeave: p.onLeave,
          reportsFiled: p.reports,
          attendance: `${p.pct}%`,
        })),
      };
    }

    case 'list_tasks': {
      const where = {};
      if (args.status === 'OPEN') where.status = { in: ['PENDING', 'PROGRESS'] };
      else if (args.status) where.status = args.status;
      if (args.priority) where.priority = args.priority;

      if (args.assignee) {
        const people = await findPeople(args.assignee);
        if (!people?.length) return { error: `Nobody here matches "${args.assignee}".` };
        where.assigneeId = { in: people.map((p) => p.id) };
      }

      const today = dayKey();
      if (args.overdueOnly) {
        where.dueDate = { lt: dayDate(today) };
        where.status = { in: ['PENDING', 'PROGRESS'] };
      }

      const tasks = await prisma.task.findMany({
        where,
        include: {
          assignee: { select: { name: true } },
          creator: { select: { name: true } },
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
        take: Math.min(200, Math.max(1, Number(args.limit) || 50)),
      });

      return {
        count: tasks.length,
        tasks: tasks.map((t) => ({
          title: t.title,
          assignee: t.assignee.name,
          assignedBy: t.creator.name,
          status: t.status,
          priority: t.priority,
          due: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
          overdue: !!(
            t.dueDate &&
            t.dueDate.toISOString().slice(0, 10) < today &&
            ['PENDING', 'PROGRESS'].includes(t.status)
          ),
        })),
      };
    }

    case 'daily_reports': {
      const from = asDay(args.date);
      const to = /^\d{4}-\d{2}-\d{2}$/.test(args.toDate || '') ? args.toDate : from;
      const where = {
        date: { gte: dayDate(from), lte: dayDate(to) },
      };

      if (args.person) {
        const people = await findPeople(args.person);
        if (!people?.length) return { error: `Nobody here matches "${args.person}".` };
        where.userId = { in: people.map((p) => p.id) };
      }

      const reports = await prisma.dailyReport.findMany({
        where,
        include: { user: { select: { name: true, department: true } } },
        orderBy: [{ date: 'asc' }, { submittedAt: 'asc' }],
        take: 200,
      });

      return {
        window: from === to ? from : `${from} to ${to}`,
        count: reports.length,
        reports: reports.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          person: r.user.name,
          department: r.user.department,
          summary: r.summary,
          recorded: formatDuration(r.minutesWorked),
          idle: formatDuration(r.minutesIdle),
          points: `${r.pointsDone}/${r.pointsTotal}`,
          tasksClosed: r.tasksCompleted,
        })),
      };
    }

    case 'leave_overview': {
      const year = Number(args.year) || currentYear();
      const people = await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true, department: true },
        orderBy: { name: 'asc' },
      });

      const balances = [];
      for (const person of people) {
        const balance = await ensureBalance(person.id, year);
        const left = remaining(balance);
        balances.push({
          name: person.name,
          department: person.department,
          sickLeft: left.sick,
          plannedLeft: left.planned,
          used: balance.sickUsed + balance.plannedUsed,
          carried: balance.carried,
        });
      }

      const pending = await prisma.leaveRequest.findMany({
        where: { status: 'PENDING' },
        include: { user: { select: { name: true } } },
        orderBy: { startDate: 'asc' },
      });

      return {
        year,
        balances,
        waitingOnADecision: pending.map((r) => ({
          person: r.user.name,
          kind: r.kind,
          from: r.startDate.toISOString().slice(0, 10),
          to: r.endDate.toISOString().slice(0, 10),
          days: r.days,
          reason: r.reason,
        })),
      };
    }

    case 'holidays': {
      const year = Number(args.year) || Number(dayKey().slice(0, 4));
      const [rows, settings] = await Promise.all([
        prisma.holiday.findMany({
          where: {
            date: {
              gte: new Date(`${year}-01-01T00:00:00.000Z`),
              lte: new Date(`${year}-12-31T00:00:00.000Z`),
            },
          },
          orderBy: { date: 'asc' },
        }),
        getSettings(),
      ]);

      const names = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      return {
        year,
        workingWeek: settings.workingDays.map((d) => names[d]),
        holidays: rows.map((h) => ({ date: h.date.toISOString().slice(0, 10), name: h.name })),
      };
    }

    case 'insights_summary': {
      const days = Math.min(365, Math.max(1, Number(args.days) || 30));
      const data = await buildInsights(days);
      return {
        window: `${data.fromKey} to ${data.today}`,
        workingDays: data.workingDayCount,
        totalHoursWorked: formatDuration(data.totals.workMinutes),
        averagePerPerson: formatDuration(data.averagePerPerson),
        averageWorkedDay: formatDuration(data.averageWorkedDay),
        attendance: `${data.attendancePct}%`,
        lateArrivals: data.lateTotal,
        whereTheTimeWent: {
          productive: formatDuration(data.totals.workMinutes),
          onBreak: formatDuration(data.totals.breakMinutes),
          discardedAsIdle: formatDuration(data.totals.idleMinutes),
          daysOnLeave: data.totals.leaveDays,
        },
        byDepartment: data.departments.map((d) => ({
          department: d.name,
          hours: formatDuration(d.minutes),
          people: d.people,
        })),
        work: {
          closed: data.work.completed,
          open: data.work.open,
          blocked: data.work.blocked,
          overdue: data.work.overdue,
          averageDaysToClose: Number(data.work.averageCloseDays.toFixed(1)),
        },
      };
    }

    case 'over_the_cap': {
      const settings = await getSettings();
      const counts = await prisma.task.groupBy({
        by: ['assigneeId'],
        where: { status: { in: ['PENDING', 'PROGRESS'] } },
        _count: { _all: true },
      });
      const people = await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true, department: true },
      });

      const rows = people
        .map((p) => ({
          name: p.name,
          department: p.department,
          openTasks: counts.find((c) => c.assigneeId === p.id)?._count._all || 0,
        }))
        .sort((a, b) => b.openTasks - a.openTasks);

      return {
        cap: settings.assignmentCap,
        atOrOverTheCap: rows.filter((r) => r.openTasks >= settings.assignmentCap),
        everyone: rows,
      };
    }

    case 'assign_task': {
      if (!ctx.actor) return { error: 'This token has no owner on record. Create a new read-write token.' };

      const title = String(args.title || '').trim();
      if (!title) return { error: 'The task needs a title.' };

      const found = await findPerson(args.assignee);
      if (found.error) return { error: found.error };
      const assignee = found.person;

      const settings = await getSettings();
      const open = await openTaskCount(assignee.id);
      if (open >= settings.assignmentCap) {
        return {
          error: `${assignee.name} is holding ${open} open tasks, and the cap is ${settings.assignmentCap}. Something has to close first.`,
        };
      }

      const priority = PRIORITIES.includes(args.priority) ? args.priority : 'MEDIUM';
      const task = await prisma.task.create({
        data: {
          title,
          detail: String(args.detail || '').trim() || null,
          priority,
          dueDate: args.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(args.dueDate) ? dayDate(args.dueDate) : null,
          assigneeId: assignee.id,
          creatorId: ctx.actor.id,
        },
      });

      await buildPlan(assignee, dayKey(), settings);
      await postToSlack('assign', taskAssignedMessage(task, assignee, ctx.actor));
      await sendDirectMessage('assign', assignee, taskAssignedDm(task, ctx.actor));

      return { ok: true, id: task.id, title: task.title, assignee: assignee.name, priority: task.priority };
    }

    case 'update_task_status': {
      if (!STATUSES.includes(args.status)) return { error: `Status must be one of ${STATUSES.join(', ')}.` };

      const where = { title: { contains: String(args.task || ''), mode: 'insensitive' } };
      if (args.assignee) {
        const found = await findPerson(args.assignee);
        if (found.error) return { error: found.error };
        where.assigneeId = found.person.id;
      }

      const matches = await prisma.task.findMany({
        where,
        include: { assignee: { select: { id: true, name: true, email: true, slackUserId: true } } },
      });
      if (matches.length === 0) return { error: `No task matches "${args.task}".` };
      if (matches.length > 1) {
        return {
          error: `More than one task matches "${args.task}": ${matches.map((t) => `${t.title} (${t.assignee.name})`).join('; ')}. Be more specific, or add "assignee".`,
        };
      }

      const task = matches[0];
      const updated = await prisma.task.update({
        where: { id: task.id },
        data: { status: args.status, completedAt: args.status === 'COMPLETED' ? new Date() : null },
      });

      await prisma.planPoint.updateMany({
        where: { taskId: task.id, date: dayDate(dayKey()) },
        data:
          args.status === 'COMPLETED'
            ? { done: true, doneAt: new Date() }
            : { done: false, doneAt: null },
      });

      if (task.status !== args.status) {
        await postToSlack('status', statusChangeMessage(updated, task.assignee, task.status, args.status));
        await sendDirectMessage('status', task.assignee, statusChangeDm(updated, task.status, args.status));
      }

      return { ok: true, id: task.id, title: task.title, from: task.status, to: args.status };
    }

    case 'decide_leave': {
      if (!ctx.actor) return { error: 'This token has no owner on record. Create a new read-write token.' };
      if (!['APPROVED', 'REJECTED'].includes(args.decision)) {
        return { error: 'decision must be APPROVED or REJECTED.' };
      }

      const found = await findPerson(args.person);
      if (found.error) return { error: found.error };

      const pending = await prisma.leaveRequest.findFirst({
        where: { userId: found.person.id, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });
      if (!pending) return { error: `${found.person.name} has no pending leave request.` };

      await prisma.leaveRequest.update({
        where: { id: pending.id },
        data: {
          status: args.decision,
          decidedById: ctx.actor.id,
          decidedAt: new Date(),
          note: String(args.note || '').trim() || null,
        },
      });

      if (args.decision === 'APPROVED') {
        const year = Number(pending.startDate.toISOString().slice(0, 4));
        await applyToBalance(pending.userId, pending.kind, pending.days, year, 1);
      }

      return {
        ok: true,
        person: found.person.name,
        decision: args.decision,
        from: pending.startDate.toISOString().slice(0, 10),
        to: pending.endDate.toISOString().slice(0, 10),
      };
    }

    default:
      return { error: `No tool called "${name}".` };
  }
}

export { rangeKeys, shiftDay };
