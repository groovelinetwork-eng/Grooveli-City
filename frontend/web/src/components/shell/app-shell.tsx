'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getPersona, type PersonaId } from '@grooveli/frontend-domain';
import { useDemoStore, useHydrated } from '@/lib/store/store';
import { membershipOrgIds } from '@/lib/store/selectors';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { useCityHref } from '@/lib/city-link';
import { Badge, LinkButton, LoadingState, MockBadge } from '@/components/ui/primitives';
import { useShallow } from 'zustand/react/shallow';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** If set, the item is shown as locked with this reason (permission/tier). */
  locked?: string | null;
  hidden?: boolean;
  exact?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function OrgSwitcher() {
  const { orgKey, active, orgs } = useDemoStore(
    useShallow((s) => ({ orgKey: membershipOrgIds(s).join(','), active: s.session?.activeOrganizationId ?? null, orgs: s.organizations })),
  );
  const orgIds = orgKey ? orgKey.split(',') : [];
  const switchOrg = useAction((id: string) => getService().auth.switchOrganization(id), { success: 'Switched organisation' });
  if (orgIds.length < 2) return null;
  return (
    <label className="row small">
      <span className="sr-only">Active organisation</span>
      <select
        className="select"
        style={{ minHeight: 34, width: 'auto' }}
        value={active ?? ''}
        onChange={(e) => switchOrg.run(e.target.value)}
        aria-label="Switch organisation"
      >
        {orgIds.map((id) => (
          <option key={id} value={id}>
            {orgs.find((o) => o.id === id)?.name ?? id}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AppShell({
  nav,
  areaLabel,
  children,
  topbarExtra,
}: {
  nav: NavSection[];
  areaLabel: string;
  children: ReactNode;
  topbarExtra?: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const session = useDemoStore((s) => s.session);
  const unread = useDemoStore((s) => s.notifications.filter((n) => !n.read).length);
  const cityHref = useCityHref();
  const persona = session ? getPersona(session.personaId) : null;
  const signOut = useAction(() => getService().auth.signOut());

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="shell">
      {open ? <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
      <aside className="sidebar" data-open={open} aria-label={`${areaLabel} navigation`}>
        <Link href="/" className="brand">
          <span className="logo-mark" aria-hidden="true">
            G
          </span>
          Grooveli
        </Link>
        <nav aria-label={areaLabel}>
          {nav.map((section, i) => (
            <div key={section.title ?? i}>
              {section.title ? <div className="nav-section">{section.title}</div> : null}
              {section.items
                .filter((item) => !item.hidden)
                .map((item) =>
                  item.locked ? (
                    <div key={item.href} className="nav-locked" title={item.locked}>
                      <span>
                        <span aria-hidden="true">{item.icon}</span> {item.label}
                      </span>
                      <span aria-label={`Locked: ${item.locked}`}>🔒</span>
                    </div>
                  ) : (
                    <Link key={item.href} href={item.href} className="nav-link" aria-current={isActive(pathname, item) ? 'page' : undefined}>
                      <span aria-hidden="true">{item.icon}</span>
                      {item.label}
                    </Link>
                  ),
                )}
            </div>
          ))}
        </nav>
      </aside>
      <div style={{ minWidth: 0 }}>
        <div className="topbar">
          <div className="row">
            <button type="button" className="btn btn-sm menu-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Open navigation">
              ☰
            </button>
            <span className="small muted">{areaLabel}</span>
            <MockBadge>Demo mode</MockBadge>
            <OrgSwitcher />
            {topbarExtra}
          </div>
          <div className="row">
            <a className="btn btn-sm" href={cityHref}>
              🏙️ Enter city
            </a>
            {session?.personaId === 'candidate' ? (
              <LinkButton href="/app/notifications" size="sm" variant="ghost" aria-label={`Notifications, ${unread} unread`}>
                🔔 {unread > 0 ? <Badge tone="danger">{unread}</Badge> : null}
              </LinkButton>
            ) : null}
            <details style={{ position: 'relative' }}>
              <summary className="btn btn-sm" style={{ listStyle: 'none' }}>
                {persona ? `${persona.displayName} · ${persona.label}` : 'Account'}
              </summary>
              <div className="card" style={{ position: 'absolute', right: 0, top: 44, zIndex: 30, width: 240 }}>
                <div className="stack" style={{ ['--gap' as string]: '6px' }}>
                  <Link href="/login?switch=1">Switch demo persona</Link>
                  {session?.personaId === 'candidate' ? <Link href="/app/settings">Settings & privacy</Link> : <Link href="/org/settings">Organisation settings</Link>}
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={async () => {
                      await signOut.run();
                      router.push('/');
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>
        <main id="main" className="main">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Waits for demo state hydration and checks the persona can use this area.
 * UX guard only — the middleware/backend own real access control.
 */
export function SessionGuard({ allow, children }: { allow: (p: PersonaId) => boolean; children: ReactNode }) {
  const hydrated = useHydrated();
  const session = useDemoStore((s) => s.session);
  if (!hydrated) {
    return (
      <main id="main" className="container section">
        <LoadingState label="Loading your demo workspace" />
      </main>
    );
  }
  if (!session) {
    return (
      <main id="main" className="container section stack">
        <h1>Your demo session has ended</h1>
        <p className="muted">Demo data lives in this browser only. Choose a persona to continue.</p>
        <div>
          <LinkButton href="/login?switch=1" variant="primary">
            Choose a demo persona
          </LinkButton>
        </div>
      </main>
    );
  }
  if (!allow(session.personaId)) {
    const persona = getPersona(session.personaId);
    return (
      <main id="main" className="container section stack">
        <h1>This area isn&apos;t available to {persona?.label ?? 'this persona'}</h1>
        <p className="muted">Switch persona to explore another part of the demo.</p>
        <div className="row">
          <LinkButton href={persona?.home ?? '/'} variant="primary">
            Go to my workspace
          </LinkButton>
          <LinkButton href="/login?switch=1">Switch persona</LinkButton>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
