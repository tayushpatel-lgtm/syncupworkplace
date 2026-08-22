'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useRouter } from '../lib/useRouter';
import { bypassUnloadGuard, restoreUnloadGuard } from './UnloadGuard';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  Calendar,
  Clock,
  FileText,
  KeyRound,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  Pencil,
  Settings,
  Users,
  Zap,
} from 'lucide-react';

const MY_WORK = [
  ['/', 'bolt', 'My day'],
  ['/tasks', 'list', 'My tasks'],
  ['/apps', 'grid', 'Apps'],
  ['/calendar', 'calendar', 'My calendar'],
  ['/leave', 'doc', 'My leave'],
  ['/holidays', 'calendar', 'Holidays'],
];

const ADMINISTRATION = [
  ['/admin', 'bolt', 'Operations'],
  ['/admin/reports', 'edit', 'Daily reports'],
  ['/admin/attendance', 'clock', 'Attendance'],
  ['/admin/people', 'users', 'People'],
  ['/admin/tasks', 'list', 'Tasks'],
  ['/admin/leave', 'doc', 'Leave'],
  ['/admin/insights', 'chart', 'Insights'],
  ['/admin/passwords', 'key', 'Passwords'],
  ['/admin/settings', 'gear', 'Settings'],
];

const ICONS = {
  bolt: Zap,
  list: List,
  grid: LayoutGrid,
  calendar: Calendar,
  doc: FileText,
  edit: Pencil,
  clock: Clock,
  users: Users,
  chart: BarChart3,
  key: KeyRound,
  gear: Settings,
};

const ROLE_LABEL = {
  EMPLOYEE: 'Employee',
  ADMIN: 'Admin',
  CEO: 'CEO',
};

function workspaceSubtitle(user) {
  return user.department || user.title || ROLE_LABEL[user.role] || user.role;
}

function isActive(pathname, href) {
  if (href === '/' || href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Item({ href, glyph, label, pathname, badge }) {
  const Glyph = ICONS[glyph];
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      data-active={active ? 'true' : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'nav-item bg-transparent text-muted-foreground',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'data-[active=true]:bg-[color-mix(in_oklch,var(--sidebar-accent),var(--sidebar-foreground)_8%)]',
        'data-[active=true]:text-sidebar-accent-foreground',
        'data-[active=true]:hover:bg-[color-mix(in_oklch,var(--sidebar-accent),var(--sidebar-foreground)_8%)]',
      )}
      prefetch={false}
    >
      <span className="ico">
        <Glyph size={18} strokeWidth={1.75} />
      </span>
      {label}
      {badge > 0 && <span className="nav-badge">{badge}</span>}
    </Link>
  );
}

export default function Nav({ user, pendingLeave = 0 }) {
  const pathname = usePathname();
  const router = useRouter();
  const admin = user.role === 'ADMIN' || user.role === 'CEO';
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    bypassUnloadGuard();
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      restoreUnloadGuard();
      setSigningOut(false);
    }
  }

  return (
    <nav className="sidebar">
      <Link href="/" className="brand" prefetch={false}>
        <img src="/icon.svg" alt="" width={36} height={36} className="brand-mark" />
        <div className="brand-copy">
          <b>Syncup Workspace</b>
          <span>{workspaceSubtitle(user)}</span>
        </div>
      </Link>

      <div className="sidebar-scroll">
        <div className="nav-section">
          {MY_WORK.map(([href, glyph, label]) => (
            <Item key={href} href={href} glyph={glyph} label={label} pathname={pathname} />
          ))}
        </div>

        {admin && (
          <div className="nav-section">
            <p className="nav-label">Administration</p>
            {ADMINISTRATION.map(([href, glyph, label]) => (
              <Item
                key={href}
                href={href}
                glyph={glyph}
                label={label}
                pathname={pathname}
                badge={href === '/admin/leave' ? pendingLeave : 0}
              />
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-foot">
        <Link href="/account" className="sidebar-user" prefetch={false} title="Your account">
          <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <div className="sidebar-user-meta">
            <b>{user.name}</b>
            <small>{user.title || ROLE_LABEL[user.role] || user.role}</small>
          </div>
        </Link>
        <button
          className="sign-out"
          onClick={signOut}
          disabled={signingOut}
          title="Sign out"
          aria-label="Sign out"
        >
          {signingOut ? <Loader2 size={18} strokeWidth={1.75} className="animate-spin" /> : <LogOut size={18} strokeWidth={1.75} />}
        </button>
      </div>
    </nav>
  );
}
