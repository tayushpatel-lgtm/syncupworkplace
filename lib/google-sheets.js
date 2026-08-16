import { SignJWT, importPKCS8 } from 'jose';
import { prisma } from './db';
import { getSettings, SETTINGS_ID } from './settings';

// Full backup mirror, one tab per table, refreshed on a schedule. Deliberately
// excludes PasswordEntry/PasswordShare (vault secrets) and McpToken (bearer
// token hashes) — nothing that grants access ever leaves the database. The
// Settings tab itself drops its own credential fields for the same reason.
export const EXCLUDED_MODELS = ['PasswordEntry', 'PasswordShare', 'McpToken'];

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** A pasted JSON key's private_key field carries literal "\n" escapes, not real newlines. */
function normalisePrivateKey(pem) {
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
}

async function getAccessToken(clientEmail, privateKeyPem) {
  const key = await importPKCS8(normalisePrivateKey(privateKeyPem), 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || `token request failed (${res.status})`);
  return json.access_token;
}

async function sheetsFetch(path, token, opts = {}) {
  const res = await fetch(`${SHEETS_API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || `Sheets API ${res.status}`);
  return json;
}

async function ensureTabs(spreadsheetId, token, titles) {
  const meta = await sheetsFetch(`/${spreadsheetId}?fields=sheets.properties.title`, token);
  const existing = new Set((meta.sheets || []).map((s) => s.properties.title));
  const missing = titles.filter((t) => !existing.has(t));
  if (!missing.length) return;
  await sheetsFetch(`/${spreadsheetId}:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }),
  });
}

async function writeTab(spreadsheetId, token, title, values) {
  await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(title)}:clear`, token, {
    method: 'POST',
    body: '{}',
  });
  if (values.length <= 1) return; // header only, nothing to write past A1
  await sheetsFetch(
    `/${spreadsheetId}/values/${encodeURIComponent(`${title}!A1`)}?valueInputOption=RAW`,
    token,
    { method: 'PUT', body: JSON.stringify({ values }) },
  );
}

function toCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toGrid(rows, headers) {
  return [headers, ...rows.map((row) => headers.map((h) => toCell(row[h])))];
}

const TABLES = [
  {
    title: 'Users',
    headers: ['id', 'name', 'email', 'role', 'department', 'title', 'active', 'joinedAt'],
    rows: () =>
      prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, department: true, title: true, active: true, joinedAt: true },
        orderBy: { name: 'asc' },
      }),
  },
  {
    title: 'Attendance',
    headers: ['id', 'userId', 'date', 'checkInAt', 'checkOutAt', 'late', 'status'],
    rows: () => prisma.attendance.findMany({ orderBy: { date: 'asc' } }),
  },
  {
    title: 'WorkSessions',
    headers: ['id', 'userId', 'date', 'kind', 'startedAt', 'endedAt', 'idleSeconds'],
    rows: () => prisma.workSession.findMany({ orderBy: { date: 'asc' } }),
  },
  {
    title: 'PlanPoints',
    headers: ['id', 'userId', 'date', 'title', 'done', 'doneAt', 'taskId'],
    rows: () => prisma.planPoint.findMany({ orderBy: { date: 'asc' } }),
  },
  {
    title: 'Tasks',
    headers: ['id', 'title', 'status', 'priority', 'dueDate', 'assigneeId', 'creatorId', 'completedAt', 'createdAt'],
    rows: () => prisma.task.findMany({ orderBy: { createdAt: 'asc' } }),
  },
  {
    title: 'TaskAttachments',
    headers: ['id', 'taskId', 'filename', 'mimeType', 'size', 'uploadedById', 'createdAt'],
    rows: () =>
      prisma.taskAttachment.findMany({
        select: { id: true, taskId: true, filename: true, mimeType: true, size: true, uploadedById: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
  },
  {
    title: 'DailyReports',
    headers: ['id', 'userId', 'date', 'summary', 'minutesWorked', 'minutesBreak', 'minutesIdle', 'pointsDone', 'pointsTotal', 'tasksCompleted'],
    rows: () => prisma.dailyReport.findMany({ orderBy: { date: 'asc' } }),
  },
  {
    title: 'LeaveRequests',
    headers: ['id', 'userId', 'kind', 'startDate', 'endDate', 'days', 'status', 'decidedById', 'decidedAt'],
    rows: () => prisma.leaveRequest.findMany({ orderBy: { startDate: 'asc' } }),
  },
  {
    title: 'LeaveBalances',
    headers: ['id', 'userId', 'year', 'sickTotal', 'sickUsed', 'plannedTotal', 'plannedUsed', 'carried'],
    rows: () => prisma.leaveBalance.findMany({ orderBy: { year: 'asc' } }),
  },
  {
    title: 'Holidays',
    headers: ['id', 'date', 'name'],
    rows: () => prisma.holiday.findMany({ orderBy: { date: 'asc' } }),
  },
  {
    title: 'Apps',
    headers: ['id', 'name', 'description', 'url', 'department', 'createdById', 'createdAt'],
    rows: () => prisma.app.findMany({ orderBy: { name: 'asc' } }),
  },
  {
    title: 'OnboardingSteps',
    headers: ['id', 'title', 'description', 'order'],
    rows: () => prisma.onboardingStep.findMany({ orderBy: { order: 'asc' } }),
  },
  {
    title: 'OnboardingProgress',
    headers: ['id', 'userId', 'stepId', 'completedAt'],
    rows: () => prisma.onboardingProgress.findMany({ orderBy: { completedAt: 'asc' } }),
  },
  {
    title: 'Settings',
    headers: [
      'assignmentCap', 'reportRequired', 'planFromTasks', 'workingDays', 'defaultCheckInBy',
      'departments', 'onboardingEnforced', 'slackEnabled', 'slackChannel', 'slackBotEnabled',
      'slackChannelId', 'idleAfterMinutes', 'minPresentMinutes', 'sheetsEnabled',
      'sheetsSpreadsheetId', 'sheetsLastSyncAt', 'updatedAt',
    ],
    rows: async () => [await getSettings()],
  },
];

/** Sync every non-excluded table into its own tab. Never throws — the caller reads `.synced`. */
export async function syncAllToSheets() {
  const settings = await getSettings();
  if (!settings.sheetsEnabled || !settings.sheetsClientEmail || !settings.sheetsPrivateKey || !settings.sheetsSpreadsheetId) {
    return { synced: false, reason: 'off' };
  }

  try {
    const token = await getAccessToken(settings.sheetsClientEmail, settings.sheetsPrivateKey);
    await ensureTabs(settings.sheetsSpreadsheetId, token, TABLES.map((t) => t.title));

    for (const table of TABLES) {
      const rows = await table.rows();
      await writeTab(settings.sheetsSpreadsheetId, token, table.title, toGrid(rows, table.headers));
    }

    await prisma.settings.update({
      where: { id: SETTINGS_ID },
      data: { sheetsLastSyncAt: new Date(), sheetsLastSyncError: null },
    });
    return { synced: true, tables: TABLES.length };
  } catch (err) {
    await prisma.settings.update({ where: { id: SETTINGS_ID }, data: { sheetsLastSyncError: err.message } }).catch(() => {});
    return { synced: false, reason: err.message };
  }
}

export { TABLES as SHEETS_TABLES, toGrid, toCell };
