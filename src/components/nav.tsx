'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ICONS = {
  strategies: 'M4 19V9M10 19V5M16 19v-7M22 19H2',
  lab: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 15h9',
  admin: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z',
};

const useTabs = (isAdmin: boolean) => {
  const pathname = usePathname();
  return [
    { href: '/', label: 'Strategies', icon: ICONS.strategies, active: pathname === '/' || pathname.startsWith('/strategies') || pathname.startsWith('/backtests') },
    { href: '/lab', label: 'Lab', icon: ICONS.lab, active: pathname.startsWith('/lab') },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: ICONS.admin, active: pathname.startsWith('/admin') }] : []),
  ];
};

export function TopNav({ isAdmin }: { isAdmin: boolean }) {
  return (
    <nav className="topnav" aria-label="Primary">
      {useTabs(isAdmin).map((tab) => (
        <Link key={tab.href} href={tab.href} className={tab.active ? 'active' : undefined} aria-current={tab.active ? 'page' : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function TabBar({ isAdmin }: { isAdmin: boolean }) {
  return (
    <nav className="tabbar" aria-label="Primary">
      {useTabs(isAdmin).map((tab) => (
        <Link key={tab.href} href={tab.href} className={tab.active ? 'active' : undefined} aria-current={tab.active ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={tab.icon} />
          </svg>
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
