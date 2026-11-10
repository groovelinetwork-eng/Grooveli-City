import { NextRequest, NextResponse } from 'next/server';

/**
 * UX ROUTING ONLY — NOT SECURITY.
 * Reads the demo persona cookie to send signed-out visitors to /login and
 * signed-in visitors away from auth pages. Anyone can set this cookie; real
 * authentication/authorization is owned by the backend (open decision).
 *
 * The city (/city) is intentionally not gated: it only renders public-safe
 * projections and supports guest exploration.
 */
const DEMO_COOKIE = 'grooveli_demo_session';
const PERSONAS = new Set(['candidate', 'org-admin', 'hr-manager', 'recruiter', 'payroll-officer', 'employee']);
const HOME: Record<string, string> = {
  candidate: '/app',
  'org-admin': '/org',
  'hr-manager': '/org/people',
  recruiter: '/org/recruitment',
  'payroll-officer': '/org/payroll',
  employee: '/org/me',
};
const protectedPrefixes = ['/app', '/org', '/onboarding', '/dashboard'];
const authRoutes = ['/login', '/signup'];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const raw = request.cookies.get(DEMO_COOKIE)?.value;
  const persona = raw && PERSONAS.has(raw) ? raw : null;

  if (protectedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!persona) {
      const url = new URL('/login', request.url);
      url.searchParams.set('next', `${pathname}${search}`.slice(0, 200));
      return NextResponse.redirect(url);
    }
    if (pathname === '/dashboard') {
      return NextResponse.redirect(new URL(HOME[persona] ?? '/app', request.url));
    }
  }

  if (authRoutes.includes(pathname) && persona && !request.nextUrl.searchParams.has('switch')) {
    return NextResponse.redirect(new URL(HOME[persona] ?? '/app', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/org/:path*', '/onboarding/:path*', '/dashboard', '/login', '/signup'],
};
