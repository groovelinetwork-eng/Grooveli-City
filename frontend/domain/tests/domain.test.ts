import { describe, expect, it } from 'vitest';
import {
  JOBS,
  ORGANIZATIONS,
  ORG_EMPLOYEES,
  ORG_HR,
  WORKSPACES,
  PAY_COMPONENTS,
  COMPENSATION_STRUCTURES,
  DEMO_CANDIDATE,
  TALENT_POOL,
  SEED_APPLICATIONS,
  DISTRICTS,
  BUILDINGS,
  CITY_EVENTS,
  EMPLOYEE_PERSONA_ID,
  matchJob,
  candidateToMatchInput,
  decideXp,
  progressFromXp,
  xpForLevel,
  buildPayslipPreview,
  illustrativeTax,
  can,
  moduleEnabled,
  intentToPath,
  buildWebUrl,
  buildCityUrl,
  parseReturnContext,
  encodeAvatar,
  decodeAvatar,
  DEFAULT_AVATAR,
  toPublicHq,
  parseCityBridge,
  makeCityBridge,
  toCsv,
  structureForBase,
} from '../src/index';
import * as Public from '../src/public';

describe('fixtures', () => {
  it('are coherent: every job references a known org and district', () => {
    const orgIds = new Set(ORGANIZATIONS.map((o) => o.id));
    const districtIds = new Set(DISTRICTS.map((d) => d.id));
    for (const j of JOBS) {
      expect(orgIds.has(j.organizationId)).toBe(true);
      expect(districtIds.has(j.district)).toBe(true);
    }
    for (const b of BUILDINGS) {
      expect(districtIds.has(b.district)).toBe(true);
      if (b.organizationId) expect(orgIds.has(b.organizationId)).toBe(true);
    }
    for (const e of CITY_EVENTS) expect(districtIds.has(e.district)).toBe(true);
  });

  it('cover all eleven documented city places (S1 §18)', () => {
    expect(DISTRICTS.map((d) => d.id).sort()).toEqual(
      ['ai-center', 'apartment', 'corporate', 'creative', 'finance', 'healthcare', 'hospitality', 'plaza', 'recruitment', 'tech', 'university'].sort(),
    );
  });

  it('are deterministic and have unique ids', () => {
    const ids = [...JOBS.map((j) => j.id), ...SEED_APPLICATIONS.map((a) => a.id), ...TALENT_POOL.map((t) => t.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const k = ORG_EMPLOYEES['kestrel-systems']!;
    expect(k).toHaveLength(28);
    expect(new Set(k.map((e) => e.name)).size).toBe(28);
    expect(k.some((e) => e.id === EMPLOYEE_PERSONA_ID)).toBe(true);
  });

  it('gives every employee a compensation record and every department a head', () => {
    for (const ws of WORKSPACES) {
      const emps = ORG_EMPLOYEES[ws.organizationId]!;
      expect(ORG_HR[ws.organizationId]!.compensation).toHaveLength(emps.length);
      for (const d of ws.departments) expect(d.headEmployeeId).not.toBeNull();
    }
  });
});

describe('matching', () => {
  const input = candidateToMatchInput(DEMO_CANDIDATE);

  it('explains fit and gaps with hard constraints', () => {
    const job = JOBS.find((j) => j.id === 'job-m-hrops')!;
    const r = matchJob(input, job);
    expect(r.score).toBeGreaterThanOrEqual(65);
    expect(r.matchedSkills).toContain('HR Operations');
    expect(r.constraints.find((c) => c.key === 'workMode')!.passed).toBe(true);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('flags unmet constraints as gaps', () => {
    const job = JOBS.find((j) => j.id === 'job-a-nurse')!;
    const r = matchJob(input, job);
    expect(r.constraints.find((c) => c.key === 'qualifications')!.passed).toBe(false);
    expect(r.gaps.join(' ')).toMatch(/Nursing licence/);
    expect(r.band).toBe('weak');
  });

  it('never depends on personality traits', () => {
    const job = JOBS[0]!;
    const a = matchJob(candidateToMatchInput({ ...DEMO_CANDIDATE, personality: null }), job);
    const b = matchJob(
      candidateToMatchInput({
        ...DEMO_CANDIDATE,
        personality: { energy: 'extroverted', thinking: 'creative', workStyle: 'independent', outlook: 'reserved', role: 'leader' },
      }),
      job,
    );
    expect(a).toEqual(b);
    expect(Object.keys(input)).not.toContain('personality');
  });
});

describe('xp', () => {
  const at = '2026-11-09T10:00:00.000Z';
  it('awards once-only rewards once', () => {
    expect(decideXp([], 'profile-complete', { at }).award).toBe(50);
    expect(decideXp([{ id: 'x', reason: 'profile-complete', amount: 50, at }], 'profile-complete', { at }).award).toBe(0);
  });
  it('does not reward unsuitable or spam applications', () => {
    expect(decideXp([], 'suitable-application', { at, suitable: false }).award).toBe(0);
    const ledger = [1, 2, 3].map((i) => ({ id: `a${i}`, reason: 'suitable-application' as const, amount: 25, at, ref: `j${i}` }));
    expect(decideXp(ledger, 'suitable-application', { at, suitable: true, ref: 'j4' }).award).toBe(0);
    expect(decideXp(ledger, 'suitable-application', { at: '2026-11-10T10:00:00.000Z', suitable: true, ref: 'j4' }).award).toBe(25);
  });
  it('computes levels from a monotonic curve', () => {
    expect(progressFromXp(0).level).toBe(1);
    expect(progressFromXp(xpForLevel(2)).level).toBe(2);
    const p = progressFromXp(xpForLevel(5) + 10);
    expect(p.level).toBe(5);
    expect(p.xpIntoLevel).toBe(10);
  });
});

describe('payroll preview (illustrative)', () => {
  it('builds a balanced payslip', () => {
    const emp = ORG_EMPLOYEES['kestrel-systems']![3]!;
    const record = ORG_HR['kestrel-systems']!.compensation.find((c) => c.employeeId === emp.id)!;
    const structure = COMPENSATION_STRUCTURES.find((s) => s.id === record.structureId)!;
    const slip = buildPayslipPreview({
      employee: emp,
      record,
      structure,
      components: PAY_COMPONENTS,
      adjustments: [{ employeeId: emp.id, kind: 'bonus', label: 'Spot bonus', amount: 50_000 }],
      period: '2026-11',
    });
    const earnings = slip.lines.filter((l) => l.kind === 'earning').reduce((a, l) => a + l.amount, 0);
    expect(slip.gross).toBe(earnings);
    expect(slip.net).toBe(slip.gross - slip.totalDeductions);
    expect(slip.lines.some((l) => l.label === 'Spot bonus')).toBe(true);
    expect(slip.lines.some((l) => /illustrative/i.test(l.label))).toBe(true);
  });
  it('pro-rates and warns', () => {
    const emp = ORG_EMPLOYEES['kestrel-systems']![0]!;
    const record = { ...ORG_HR['kestrel-systems']!.compensation[0]!, bankOnFile: false };
    const slip = buildPayslipPreview({ employee: emp, record, structure: structureForBase(record.baseMonthly), components: PAY_COMPONENTS, adjustments: [], period: '2026-11', proRata: 0.5 });
    expect(slip.lines[0]!.amount).toBe(Math.round(record.baseMonthly * 0.5));
    expect(slip.warnings.join(' ')).toMatch(/bank/i);
    expect(slip.warnings.join(' ')).toMatch(/Pro-rated/);
  });
  it('applies bands progressively', () => {
    expect(illustrativeTax(0)).toBe(0);
    expect(illustrativeTax(300_000)).toBe(21_000);
    expect(illustrativeTax(400_000)).toBe(21_000 + 15_000);
  });
});

describe('permissions (UX only)', () => {
  it('scopes payroll preparation to payroll officers', () => {
    expect(can(['payroll-officer'], 'payroll.prepare')).toBe(true);
    expect(can(['hr-manager'], 'payroll.prepare')).toBe(false);
    expect(can(['employee'], 'hr.records.manage')).toBe(false);
  });
  it('gates modules by mock tier', () => {
    expect(moduleEnabled('starter', 'payroll')).toBe(false);
    expect(moduleEnabled('growth', 'payroll')).toBe(true);
    expect(moduleEnabled('starter', 'payroll', { starter: ['payroll'] })).toBe(true);
  });
});

describe('navigation', () => {
  it('maps intents to canonical web routes', () => {
    expect(intentToPath({ type: 'viewJob', jobId: 'job-k-backend' })).toBe('/opportunities/job-k-backend');
    expect(intentToPath({ type: 'openEmployeePortal', organizationId: 'kestrel-systems' })).toBe('/org/me?org=kestrel-systems');
    expect(intentToPath({ type: 'browseJobs', district: 'tech' })).toBe('/opportunities?district=tech');
    expect(intentToPath({ type: 'openOrgArea', organizationId: 'kestrel-systems', area: 'hr-leave' })).toBe('/org/hr/leave?org=kestrel-systems');
    expect(intentToPath({ type: 'openOrgArea', organizationId: 'kestrel-systems', area: 'analytics' })).toBe('/org/analytics?org=kestrel-systems');
    expect(intentToPath({ type: 'openSkills' })).toBe('/app/skills');
    expect(intentToPath({ type: 'openInterviews' })).toBe('/app/interviews');
  });
  it('rejects unknown organisation areas', () => {
    expect(() => intentToPath({ type: 'openOrgArea', organizationId: 'kestrel-systems', area: '../admin' as never })).toThrow();
    expect(() => intentToPath({ type: 'openOrgArea', organizationId: 'kestrel-systems', area: 'constructor' as never })).toThrow();
  });
  it('rejects unsafe ids', () => {
    expect(() => intentToPath({ type: 'viewJob', jobId: '../admin' })).toThrow();
    expect(() => intentToPath({ type: 'viewOrganization', organizationId: 'https://evil.example' })).toThrow();
  });
  it('appends only allowlisted return context', () => {
    const url = new URL(buildWebUrl('http://localhost:3000', { type: 'openCareerCenter' }, { district: 'tech' }));
    expect(url.pathname).toBe('/app/career-center');
    expect(url.searchParams.get('from')).toBe('city');
    expect(url.searchParams.get('district')).toBe('tech');
    const bad = new URL(buildWebUrl('http://localhost:3000', { type: 'openDashboard' }, { district: 'evil' as never }));
    expect(bad.searchParams.has('district')).toBe(false);
    expect(parseReturnContext(new URLSearchParams('from=city&district=javascript:alert(1)'))).toEqual({ fromCity: true, district: null });
  });
  it('builds city links with cosmetic avatar code only', () => {
    const u = buildCityUrl('/city/', { district: 'apartment', avatarCode: encodeAvatar(DEFAULT_AVATAR) });
    expect(u).toBe('/city/?district=apartment&avatar=1-3-0-0-1-0-0');
    expect(buildCityUrl('/city/', { avatarCode: 'tok=secret' })).toBe('/city/');
  });
});

describe('avatar codec', () => {
  it('round-trips and rejects out-of-range or malformed codes', () => {
    expect(decodeAvatar(encodeAvatar(DEFAULT_AVATAR))).toEqual(DEFAULT_AVATAR);
    expect(decodeAvatar('9-3-0-0-1-0-0')).toBeNull();
    expect(decodeAvatar('<script>')).toBeNull();
    expect(decodeAvatar(null)).toBeNull();
  });
});

describe('public projections and city bridge', () => {
  const PRIVATE_KEYS = ['email', 'baseMonthly', 'salary', 'compensation', 'documents', 'emergencyContact', 'members', 'invitations', 'applications', 'fitScore', 'lifecycleTasks', 'payslips'];

  it('strips private fields from HQ projections', () => {
    const hq = toPublicHq({
      organization: ORGANIZATIONS[0]!,
      jobs: JOBS,
      departments: WORKSPACES[0]!.departments,
      employees: ORG_EMPLOYEES['kestrel-systems'],
    });
    const json = JSON.stringify(hq);
    for (const k of PRIVATE_KEYS) expect(json).not.toContain(`"${k}"`);
    expect(json).not.toContain('@kestrel.example');
    expect(hq.directory.every((d) => Object.keys(d).sort().join() === 'department,name,title')).toBe(true);
  });

  it('public entry point exports no private datasets', () => {
    const exported = Object.keys(Public);
    for (const forbidden of ['ORG_HR', 'PAY_COMPONENTS', 'WORKSPACES', 'TALENT_POOL', 'SEED_APPLICATIONS', 'ORG_EMPLOYEES', 'buildPayslipPreview']) {
      expect(exported).not.toContain(forbidden);
    }
    const json = JSON.stringify(Public.PUBLIC_HQS);
    for (const k of PRIVATE_KEYS) expect(json).not.toContain(`"${k}"`);
  });

  it('validates bridge payloads', () => {
    const payload = makeCityBridge({ displayName: 'Tolu', level: 3, avatar: DEFAULT_AVATAR, now: '2026-11-09T09:00:00Z' });
    expect(parseCityBridge(JSON.stringify(payload))).toEqual(payload);
    expect(parseCityBridge('{"version":2}')).toBeNull();
    expect(parseCityBridge('not json')).toBeNull();
    expect(parseCityBridge(JSON.stringify({ ...payload, avatar: { ...DEFAULT_AVATAR, skin: 99 } }))).toBeNull();
  });
});

describe('csv export', () => {
  it('escapes and neutralises formula injection', () => {
    expect(toCsv([{ a: '=SUM(A1)', b: 'x,y' }])).toBe("a,b\n'=SUM(A1),\"x,y\"");
  });
});
