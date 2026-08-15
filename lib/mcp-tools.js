import { prisma } from './db';
import { getSettings } from './settings';
import { dayRoll, STATE_LABEL } from './roll';
import { buildInsights } from './insights';
import { ensureBalance, remaining, currentYear } from './leave';
import { dayKey, dayDate, shiftDay, formatDuration, rangeKeys } from './dates';

const DATE = { type: 'string', description: 'A day as YYYY-MM-DD. Defaults to today.' };

/**
 * Read-only tools over the workspace. Nothing here writes, so a connected
 * assistant can answer questions about the company without being able to change it.
 */
export const TOOLS = [
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

export async function runTool(name, args = {}) {
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

    default:
      return { error: `No tool called "${name}".` };
  }
}

export { rangeKeys, shiftDay };
