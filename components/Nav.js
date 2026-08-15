'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from './Icons';

const MY_WORK = [
  ['/', 'bolt', 'My day'],
  ['/tasks', 'list', 'My tasks'],
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
  ['/admin/settings', 'gear', 'Settings'],
];

function isActive(pathname, href) {
  if (href === '/' || href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Item({ href, glyph, label, pathname, badge }) {
  const Glyph = Icon[glyph];
  return (
    <Link
      href={href}
      className={`nav-item ${isActive(pathname, href) ? 'active' : ''}`}
      prefetch={false}
    >
      <span className="ico">
        <Glyph />
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

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="sidebar">
      <Link href="/" className="brand" prefetch={false}>
        <b>SYNCUP</b>
        <span>{admin ? 'ADMINISTRATION' : 'WORKSPACE'}</span>
      </Link>

      <p className="nav-label">MY WORK</p>
      {MY_WORK.map(([href, glyph, label]) => (
        <Item key={href} href={href} glyph={glyph} label={label} pathname={pathname} />
      ))}

      {admin && (
        <>
          <p className="nav-label">ADMINISTRATION</p>
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
        </>
      )}

      <div className="sidebar-foot">
        <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <b>{user.name}</b>
          <small>{user.title || user.role.toLowerCase()}</small>
        </div>
        <button className="sign-out" onClick={signOut} title="Sign out" aria-label="Sign out">
          <Icon.exit />
        </button>
      </div>
    </nav>
  );
}
