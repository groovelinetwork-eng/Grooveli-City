'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getPersona } from '@grooveli/frontend-domain';
import { useDemoStore, useHydrated } from '@/lib/store/store';
import { useCityHref } from '@/lib/city-link';

const LINKS = [
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/companies', label: 'Companies' },
  { href: '/social', label: 'Events & community' },
  { href: '/city-directory', label: 'City directory' },
  { href: '/about', label: 'How it works' },
  { href: '/help', label: 'Help' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const session = useDemoStore((s) => s.session);
  const cityHref = useCityHref();
  const persona = session ? getPersona(session.personaId) : null;
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="logo" aria-label="Grooveli home">
          <span className="logo-mark" aria-hidden="true">
            G
          </span>
          Grooveli
        </Link>
        <nav aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href || pathname.startsWith(`${l.href}/`) ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="row">
          <a className="btn btn-sm" href={cityHref} style={{ background: 'transparent', color: '#fff' }}>
            Enter the city
          </a>
          {hydrated && persona ? (
            <Link className="btn btn-sm btn-primary" href={persona.home}>
              My workspace
            </Link>
          ) : (
            <>
              <Link className="btn btn-sm btn-ghost" href="/login" style={{ color: '#fff' }}>
                Sign in
              </Link>
              <Link className="btn btn-sm btn-primary" href="/signup">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <span>© 2026 Grooveli Network Technology Ltd. · Demo build — all people, companies, jobs and figures are synthetic.</span>
        <nav aria-label="Legal" className="row">
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/help">Help</Link>
        </nav>
      </div>
    </footer>
  );
}
