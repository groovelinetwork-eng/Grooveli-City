import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { parseCityBridge } from '@grooveli/frontend-domain';
import { middleware } from '@/middleware';
import { safeNextPath } from '@/lib/auth/demo-session';
import { parseJobQuery } from '@/lib/assistant/engine';
import { buildBridge } from '@/components/city-bridge-sync';
import { createInitialState } from '@/lib/store/state';

const req = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, 'http://localhost:3000'), { headers: cookie ? { cookie } : {} });

describe('middleware (UX routing only)', () => {
  it('sends signed-out users to login with a safe next path', () => {
    const res = middleware(req('/app/jobs'));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe('/app/jobs');
  });

  it('lets a demo persona through and ignores unknown cookie values', () => {
    expect(middleware(req('/org/payroll', 'grooveli_demo_session=payroll-officer')).headers.get('x-middleware-next')).toBe('1');
    expect(middleware(req('/org', 'grooveli_demo_session=superuser')).status).toBe(307);
  });

  it('forwards legacy /dashboard and signed-in auth pages to the persona home', () => {
    expect(new URL(middleware(req('/dashboard', 'grooveli_demo_session=recruiter')).headers.get('location')!).pathname).toBe('/org/recruitment');
    expect(new URL(middleware(req('/login', 'grooveli_demo_session=candidate')).headers.get('location')!).pathname).toBe('/app');
    expect(middleware(req('/login?switch=1', 'grooveli_demo_session=candidate')).headers.get('x-middleware-next')).toBe('1');
  });
});

describe('open-redirect protection', () => {
  it('accepts only internal workspace paths', () => {
    expect(safeNextPath('/app/jobs/job-k-backend?apply=1')).toBe('/app/jobs/job-k-backend?apply=1');
    expect(safeNextPath('//evil.example')).toBeNull();
    expect(safeNextPath('https://evil.example/app')).toBeNull();
    expect(safeNextPath('/api/secret')).toBeNull();
  });
});

describe('assistant query parsing', () => {
  it('extracts salary floor, work mode and keywords', () => {
    expect(parseJobQuery('Find me a ₦300k+ remote HR role')).toEqual({ minSalary: 300_000, workMode: 'remote', keywords: ['hr'] });
    expect(parseJobQuery('hybrid data analyst 1.2m').minSalary).toBe(1_200_000);
  });
});

describe('city bridge payload', () => {
  it('contains only public data and validates against the shared schema', () => {
    const s = createInitialState();
    s.session = { personaId: 'candidate', activeOrganizationId: null, signedInAt: '2026-11-09T09:00:00Z' };
    const payload = buildBridge(s);
    expect(parseCityBridge(JSON.stringify(payload))).not.toBeNull();
    const json = JSON.stringify(payload);
    for (const k of ['email', 'baseMonthly', 'skills', 'personality', 'gender', 'applications', 'fitScore', 'summary']) expect(json).not.toContain(`"${k}"`);
    expect(payload.displayName).toBe('Tolu Adebayo');
    expect(payload.publicOrgUpdates['kestrel-systems']!.vacancies.length).toBeGreaterThan(0);
  });

  it('omits personal identity for staff personas', () => {
    const s = createInitialState();
    s.session = { personaId: 'hr-manager', activeOrganizationId: 'kestrel-systems', signedInAt: '2026-11-09T09:00:00Z' };
    const payload = buildBridge(s);
    expect(payload.displayName).toBeNull();
    expect(payload.avatar).toBeNull();
  });
});
