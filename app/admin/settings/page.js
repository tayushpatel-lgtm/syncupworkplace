import { headers } from 'next/headers';
import { requireAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getSettings } from '../../../lib/settings';
import Shell from '../../../components/Shell';
import SettingsForm from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireAdmin();
  const settings = await getSettings();

  const [steps, tokens, apps] = await Promise.all([
    prisma.onboardingStep.findMany({ orderBy: { order: 'asc' } }),
    prisma.mcpToken.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        scope: true,
        createdAt: true,
        lastUsedAt: true,
        oauthClientId: true,
        createdBy: { select: { name: true } },
      },
    }),
    prisma.app.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
  ]);
  const departments = settings.departments;

  // The MCP URL has to be the one people actually reach this deployment on.
  const head = await headers();
  const host = head.get('x-forwarded-host') || head.get('host') || 'localhost:3000';
  const proto = head.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');

  return (
    <Shell user={user}>
      <SettingsForm
        initial={{
          assignmentCap: settings.assignmentCap,
          reportRequired: settings.reportRequired,
          planFromTasks: settings.planFromTasks,
          workingDays: settings.workingDays,
          defaultCheckInBy: settings.defaultCheckInBy,
          onboardingEnforced: settings.onboardingEnforced,
          slackChannel: settings.slackChannel || '',
          slackEnabled: settings.slackEnabled,
          slackOnAssign: settings.slackOnAssign,
          slackOnStatus: settings.slackOnStatus,
          slackOnDeadline: settings.slackOnDeadline,
          slackChannelId: settings.slackChannelId || '',
          slackBotEnabled: settings.slackBotEnabled,
          slackOnCheckin: settings.slackOnCheckin,
          slackOnCheckout: settings.slackOnCheckout,
          slackOnEodSummary: settings.slackOnEodSummary,
          slackDmEnabled: settings.slackDmEnabled,
          slackDmOnAssign: settings.slackDmOnAssign,
          slackDmOnAbsent: settings.slackDmOnAbsent,
          slackDmOnInactive: settings.slackDmOnInactive,
          slackDmOnDailyPlan: settings.slackDmOnDailyPlan,
          slackDmOnCheckin: settings.slackDmOnCheckin,
          slackDmOnCheckout: settings.slackDmOnCheckout,
          slackDmOnStatus: settings.slackDmOnStatus,
          slackDmOnDeadline: settings.slackDmOnDeadline,
          sheetsEnabled: settings.sheetsEnabled,
          sheetsClientEmail: settings.sheetsClientEmail || '',
          sheetsSpreadsheetId: settings.sheetsSpreadsheetId || '',
          idleAfterMinutes: settings.idleAfterMinutes,
          minPresentMinutes: settings.minPresentMinutes,
        }}
        webhookSet={!!settings.slackWebhookUrl}
        botTokenSet={!!settings.slackBotToken}
        sheetsKeySet={!!settings.sheetsPrivateKey}
        cronConfigured={!!process.env.CRON_SECRET}
        steps={steps.map((s) => ({ id: s.id, title: s.title, description: s.description || '', kind: s.kind }))}
        tokens={tokens.map((t) => ({
          id: t.id,
          name: t.name,
          prefix: t.prefix,
          scope: t.scope,
          ownerName: t.createdBy?.name || null,
          viaOAuth: !!t.oauthClientId,
          createdAt: t.createdAt.toISOString().slice(0, 10),
          lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString().slice(0, 10) : null,
        }))}
        mcpUrl={`${proto}://${host}/api/mcp`}
        apps={apps.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description || '',
          url: a.url || '',
          icon: a.icon,
          department: a.department || '',
        }))}
        departments={departments}
      />
    </Shell>
  );
}
