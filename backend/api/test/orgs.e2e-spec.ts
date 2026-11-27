import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp, ORIGIN, PDF_BYTES, PROFILE, signUp } from './helpers';

const API = '/api/v1';
type Agent = ReturnType<typeof request.agent>;

const ORG_INPUT = {
  profile: {
    name: 'Kestrel Systems', tagline: 'Software for logistics', logoColor: '#1E6FFF', logoGlyph: 'KS', industry: 'Software',
    district: 'tech', description: 'We build routing software.', website: 'https://kestrel.example', size: '51-200',
    structure: 'Functional', workArrangements: ['hybrid', 'remote'], values: ['Ownership'],
    culture: { environment: 'Calm', leadership: 'Coaching', collaboration: 'Async', development: 'Budget', inclusion: 'ERGs', workLife: 'Flexible' },
    benefits: ['HMO'], headquarters: 'Lagos',
  },
  locations: [{ name: 'Lagos HQ', city: 'Lagos', address: '1 Marina', headcountCapacity: 120 }],
  departments: [{ name: 'Engineering', responsibilities: 'Product' }, { name: 'People', responsibilities: 'HR' }],
  policies: [{ title: 'Leave policy', category: 'leave', body: '20 days a year.' }],
  invites: [],
  tier: 'starter',
};

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const VACANCY = {
  title: 'HR Operations Lead', department: 'People', district: 'corporate', location: 'Lagos', workMode: 'remote',
  employmentType: 'full-time', level: 'mid', minYears: 3, salaryMin: 300_000, salaryMax: 600_000,
  skills: ['Recruitment', 'HR Operations'], requiredQualifications: [], description: 'Run HR ops.',
  responsibilities: ['Hiring'], closesOn: inDays(30), status: 'draft',
};

/** Latest invitation token sent to `email`, read from Mailpit. */
async function invitationToken(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const search = await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>);
    if (search.messages.length) {
      const msg = await fetch(`http://localhost:8025/api/v1/message/${search.messages[0]!.ID}`).then((r) => r.json() as Promise<{ Text: string }>);
      return msg.Text.match(/token=([\w-]+)/)![1]!;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no email for ${email}`);
}

describe('Step 3 — organisations, members, recruitment (e2e)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  let admin: { agent: Agent; userId: string; email: string };
  let orgId: string;
  const send = (agent: Agent, method: 'post' | 'put' | 'patch' | 'delete', url: string, body?: object) => agent[method](`${API}${url}`).set('Origin', ORIGIN).send(body);

  beforeAll(async () => {
    app = await createApp();
    admin = await signUp(app, { name: 'Ifeoma Admin', accountType: 'organization' });
    const res = await send(admin.agent, 'post', '/orgs', ORG_INPUT);
    expect(res.status).toBe(201);
    orgId = res.body.data.organizationId;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Adds an existing user to the org with roles (bypasses email for speed). */
  async function member(roles: ('org_admin' | 'recruiter' | 'employee' | 'hr_manager')[], name = 'Member') {
    const u = await signUp(app, { name });
    const m = await prisma.membership.create({ data: { organizationId: orgId, userId: u.userId, roles } });
    return { ...u, membershipId: m.id };
  }

  describe('onboarding & profile', () => {
    it('creates the organisation with the creator as org-admin and everything from the form', async () => {
      const session = (await admin.agent.get(`${API}/auth/session`)).body.data;
      expect(session).toMatchObject({ activeOrganizationId: orgId, onboardingComplete: true, memberships: [{ organizationId: orgId, roles: ['org-admin'] }] });

      const ws = (await admin.agent.get(`${API}/orgs/${orgId}/workspace`)).body.data;
      expect(ws.tier).toBe('starter');
      expect(ws.locations.map((l: { name: string }) => l.name)).toEqual(['Lagos HQ']);
      expect(ws.departments.map((d: { name: string }) => d.name).sort()).toEqual(['Engineering', 'People']);
      expect(ws.policies[0]).toMatchObject({ title: 'Leave policy', category: 'leave', acknowledgements: 0 });
      expect(ws.members).toHaveLength(1);
      expect(ws.setupChecklist).toMatchObject({ profile: true, locations: true });
    });

    it('serves the public profile and directory without a session', async () => {
      const anon = request(app.getHttpServer());
      const pub = await anon.get(`${API}/orgs/${orgId}`);
      expect(pub.status).toBe(200);
      expect(pub.body.data.profile).toMatchObject({ name: 'Kestrel Systems', verified: false, culture: { environment: 'Calm' } });
      expect(pub.body.data.profile).not.toHaveProperty('tier');
      const list = await anon.get(`${API}/orgs?q=kestrel`);
      expect(list.body.data.items.some((o: { id: string }) => o.id === orgId)).toBe(true);
    });

    it('validates onboarding and profile edits', async () => {
      const u = await signUp(app);
      const bad = await send(u.agent, 'post', '/orgs', { ...ORG_INPUT, profile: { ...ORG_INPUT.profile, website: 'javascript:alert(1)', logoColor: 'blue' } });
      expect(bad.status).toBe(400);
      expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(['profile.website', 'profile.logoColor']));
      const patch = await send(admin.agent, 'patch', `/orgs/${orgId}/profile`, { tagline: 'Routing for Africa' });
      expect(patch.body.data.tagline).toBe('Routing for Africa');
      expect((await send(admin.agent, 'patch', `/orgs/${orgId}/profile`, { verified: true })).status).toBe(400);
    });
  });

  describe('access control', () => {
    it('hides the organisation from non-members (404) and enforces permissions (403)', async () => {
      const outsider = await signUp(app);
      expect((await outsider.agent.get(`${API}/orgs/${orgId}/workspace`)).status).toBe(404);
      const employee = await member(['employee']);
      expect((await employee.agent.get(`${API}/orgs/${orgId}/workspace`)).status).toBe(200);
      const denied = await employee.agent.get(`${API}/orgs/${orgId}/members`);
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe('FORBIDDEN');
      expect((await send(employee.agent, 'patch', `/orgs/${orgId}/profile`, { tagline: 'x' })).status).toBe(403);
    });

    it('locks out suspended members immediately', async () => {
      const m = await member(['recruiter']);
      expect((await m.agent.get(`${API}/orgs/${orgId}/recruitment/vacancies`)).status).toBe(200);
      expect((await send(admin.agent, 'put', `/orgs/${orgId}/members/${m.membershipId}/status`, { status: 'suspended' })).status).toBe(200);
      expect((await m.agent.get(`${API}/orgs/${orgId}/recruitment/vacancies`)).status).toBe(403);
      await send(admin.agent, 'put', `/orgs/${orgId}/members/${m.membershipId}/status`, { status: 'active' });
      expect((await m.agent.get(`${API}/orgs/${orgId}/recruitment/vacancies`)).status).toBe(200);
    });
  });

  describe('members & invitations', () => {
    it('invites by email, and the invitee joins with the invited roles', async () => {
      const invitee = await signUp(app, { name: 'Zainab Recruiter' });
      const inv = await send(admin.agent, 'post', `/orgs/${orgId}/invitations`, { email: invitee.email, roles: ['recruiter'] });
      expect(inv.status).toBe(201);
      expect(inv.body.data).toMatchObject({ email: invitee.email, roles: ['recruiter'], status: 'pending' });
      expect((await send(admin.agent, 'post', `/orgs/${orgId}/invitations`, { email: invitee.email, roles: ['recruiter'] })).status).toBe(409);

      const token = await invitationToken(invitee.email);
      const accepted = await send(invitee.agent, 'post', `/invitations/${token}/accept`);
      expect(accepted.status).toBe(200);
      expect(accepted.body.data.memberships).toEqual([{ organizationId: orgId, roles: ['recruiter'] }]);

      const invited = await admin.agent.get(`${API}/orgs/${orgId}/members?q=zainab`);
      expect(invited.body.data.items[0]).toMatchObject({ name: 'Zainab Recruiter', roles: ['recruiter'], status: 'active' });
    });

    it('revokes invitations', async () => {
      const inv = await send(admin.agent, 'post', `/orgs/${orgId}/invitations`, { email: 'later@example.test', roles: ['employee'] });
      expect((await admin.agent.get(`${API}/orgs/${orgId}/members?status=invited`)).body.data.items.some((m: { email: string }) => m.email === 'later@example.test')).toBe(true);
      expect((await send(admin.agent, 'delete', `/orgs/${orgId}/invitations/${inv.body.data.id}`)).status).toBe(200);
      expect((await admin.agent.get(`${API}/orgs/${orgId}/members?status=invited`)).body.data.items.some((m: { email: string }) => m.email === 'later@example.test')).toBe(false);
    });

    it('always keeps an active org-admin', async () => {
      const adminMembership = await prisma.membership.findFirstOrThrow({ where: { organizationId: orgId, userId: admin.userId } });
      const demote = await send(admin.agent, 'put', `/orgs/${orgId}/members/${adminMembership.id}/roles`, { roles: ['employee'] });
      expect(demote.status).toBe(409);
      expect(demote.body.error.code).toBe('NOT_ALLOWED_IN_STATE');
      expect((await send(admin.agent, 'put', `/orgs/${orgId}/members/${adminMembership.id}/status`, { status: 'suspended' })).status).toBe(409);
      expect((await send(admin.agent, 'put', `/orgs/${orgId}/members/${adminMembership.id}/roles`, { roles: ['org-admin', 'org-admin'] })).status).toBe(400);

      const second = await member(['employee'], 'Second Admin');
      const promoted = await send(admin.agent, 'put', `/orgs/${orgId}/members/${second.membershipId}/roles`, { roles: ['org-admin'] });
      expect(promoted.body.data.roles).toEqual(['org-admin']);
      const demote2 = await send(second.agent, 'put', `/orgs/${orgId}/members/${second.membershipId}/roles`, { roles: ['employee'] });
      expect(demote2.status).toBe(200);
    });
  });

  describe('structure', () => {
    it('manages departments and locations with integrity checks', async () => {
      const loc = await send(admin.agent, 'post', `/orgs/${orgId}/locations`, { name: 'Abuja', city: 'Abuja', address: '2 Wuse', headcountCapacity: 30 });
      expect(loc.status).toBe(201);
      const dep = await send(admin.agent, 'post', `/orgs/${orgId}/departments`, { name: 'Sales', headEmployeeId: null, responsibilities: 'Revenue', locationId: loc.body.data.id });
      expect(dep.status).toBe(201);
      expect((await send(admin.agent, 'post', `/orgs/${orgId}/departments`, { name: 'Sales', headEmployeeId: null, responsibilities: '', locationId: null })).status).toBe(409);
      expect((await send(admin.agent, 'post', `/orgs/${orgId}/departments`, { name: 'Ops', headEmployeeId: null, responsibilities: '', locationId: 'not-ours' })).status).toBe(400);
      expect((await send(admin.agent, 'delete', `/orgs/${orgId}/locations/${loc.body.data.id}`)).status).toBe(409);
      const renamed = await send(admin.agent, 'patch', `/orgs/${orgId}/departments/${dep.body.data.id}`, { name: 'Sales & BD', headEmployeeId: null, responsibilities: 'Revenue', locationId: null });
      expect(renamed.body.data.name).toBe('Sales & BD');
      expect((await send(admin.agent, 'delete', `/orgs/${orgId}/departments/${dep.body.data.id}`)).status).toBe(200);
      expect((await send(admin.agent, 'delete', `/orgs/${orgId}/locations/${loc.body.data.id}`)).status).toBe(200);
    });
  });

  describe('plans & platform admin', () => {
    it('reports modules for the plan; only org-admins change plans; only platform admins change plan contents', async () => {
      expect((await admin.agent.get(`${API}/orgs/${orgId}/subscription`)).body.data).toEqual({ tier: 'starter', modules: ['recruitment', 'hr'] });
      const recruiter = await member(['recruiter']);
      expect((await send(recruiter.agent, 'put', `/orgs/${orgId}/subscription`, { tier: 'growth' })).status).toBe(403);
      expect((await send(admin.agent, 'put', `/platform/tiers/starter/modules`, { modules: ['hr'] })).status).toBe(403);

      const staff = await signUp(app, { name: 'Platform Staff' });
      await prisma.user.update({ where: { id: staff.userId }, data: { platformRole: 'admin' } });
      expect((await send(staff.agent, 'put', `/platform/tiers/starter/modules`, { modules: ['hr'] })).status).toBe(200);
      const gated = await recruiter.agent.get(`${API}/orgs/${orgId}/recruitment/vacancies`);
      expect(gated.status).toBe(403);
      expect(gated.body.error.code).toBe('MODULE_NOT_IN_PLAN');
      await send(staff.agent, 'put', `/platform/tiers/starter/modules`, { modules: ['recruitment', 'hr'] });
      expect((await recruiter.agent.get(`${API}/orgs/${orgId}/recruitment/vacancies`)).status).toBe(200);

      const verified = await send(staff.agent, 'put', `/platform/orgs/${orgId}/verification`, { verified: true, note: 'CAC documents checked' });
      expect(verified.body.data.verified).toBe(true);

      const upgraded = await send(admin.agent, 'put', `/orgs/${orgId}/subscription`, { tier: 'growth' });
      expect(upgraded.body.data).toEqual({ tier: 'growth', modules: ['recruitment', 'hr', 'payroll', 'engagement'] });
    });
  });

  describe('recruitment', () => {
    let recruiter: Awaited<ReturnType<typeof member>>;
    let candidate: { agent: Agent; userId: string };
    let jobId: string;
    let applicationId: string;

    beforeAll(async () => {
      recruiter = await member(['recruiter'], 'Rita Recruiter');
      candidate = await signUp(app, { name: 'Ada Candidate' });
      await send(candidate.agent, 'post', '/me/onboarding', PROFILE);
      await candidate.agent.post(`${API}/me/cv`).set('Origin', ORIGIN).attach('file', PDF_BYTES, { filename: 'ada.pdf', contentType: 'application/pdf' });
    });

    it('drafts, validates and publishes vacancies', async () => {
      expect((await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/vacancies`, { ...VACANCY, salaryMax: 1 })).status).toBe(400);
      expect((await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/vacancies`, { ...VACANCY, status: 'published', closesOn: inDays(-1) })).status).toBe(409);
      const created = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/vacancies`, VACANCY);
      expect(created.status).toBe(201);
      jobId = created.body.data.jobId;
      expect((await request(app.getHttpServer()).get(`${API}/jobs/${jobId}`)).status).toBe(404);

      const employee = await member(['employee']);
      expect((await employee.agent.get(`${API}/orgs/${orgId}/recruitment/vacancies`)).status).toBe(403);

      const published = await send(recruiter.agent, 'put', `/orgs/${orgId}/recruitment/vacancies/${jobId}/status`, { status: 'published' });
      expect(published.body.data.status).toBe('published');
      expect((await request(app.getHttpServer()).get(`${API}/jobs/${jobId}`)).status).toBe(200);
      const pub = await request(app.getHttpServer()).get(`${API}/orgs/${orgId}`);
      expect(pub.body.data.vacancies.map((v: { id: string }) => v.id)).toContain(jobId);
    });

    it('runs the pipeline: applications, status moves, notifications, CV access with audit', async () => {
      const applied = await send(candidate.agent, 'post', `/jobs/${jobId}/applications`, { coverLetter: 'Keen!' });
      applicationId = applied.body.data.application.id;

      const list = await recruiter.agent.get(`${API}/orgs/${orgId}/recruitment/applications?jobId=${jobId}`);
      expect(list.body.data.items).toHaveLength(1);
      expect(list.body.data.items[0]).toMatchObject({ candidateName: 'Ada Candidate', status: 'submitted' });

      const cv = await recruiter.agent.get(`${API}/orgs/${orgId}/recruitment/applications/${applicationId}/cv`);
      expect(cv.body.data.name).toBe('ada.pdf');
      expect(await prisma.auditLog.count({ where: { action: 'application.cv_viewed', targetId: applicationId } })).toBe(1);

      const screening = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/applications/${applicationId}/status`, { status: 'screening', note: 'Strong CV' });
      expect(screening.status).toBe(200);
      expect(screening.body.data.history.at(-1)).toMatchObject({ status: 'screening', note: 'Strong CV' });
      const skip = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/applications/${applicationId}/status`, { status: 'hired' });
      expect(skip.status).toBe(409);

      const notes = (await candidate.agent.get(`${API}/me/notifications`)).body.data.items;
      expect(notes.some((n: { body: string }) => n.body.includes('is being reviewed'))).toBe(true);

      const outsider = await signUp(app);
      expect((await outsider.agent.get(`${API}/orgs/${orgId}/recruitment/applications/${applicationId}/cv`)).status).toBe(404);
    });

    it('schedules interviews the candidate can see, and protects the record', async () => {
      const bad = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/interviews`, {
        applicationId, jobId, candidateId: 'someone-else', candidateName: 'X',
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), durationMin: 45, format: 'video', interviewers: ['Rita'],
      });
      expect(bad.status).toBe(400);
      const past = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/interviews`, {
        applicationId, jobId, candidateId: candidate.userId, candidateName: 'Ada', scheduledAt: '2020-01-01T10:00:00Z', durationMin: 45, format: 'video', interviewers: ['Rita'],
      });
      expect(past.status).toBe(400);
      const ok = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/interviews`, {
        applicationId, jobId, candidateId: candidate.userId, candidateName: 'Ada',
        scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), durationMin: 45, format: 'virtual-hq', interviewers: ['Rita'],
      });
      expect(ok.status).toBe(201);
      const mine = (await candidate.agent.get(`${API}/me/interviews`)).body.data;
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ format: 'virtual-hq', status: 'scheduled' });

      const scored = await send(recruiter.agent, 'patch', `/orgs/${orgId}/recruitment/interviews/${ok.body.data.interviewId}`, { scorecard: [{ criterion: 'Communication', score: 4 }], notes: 'Good' });
      expect(scored.body.data.scorecard).toEqual([{ criterion: 'Communication', score: 4 }]);
      const listed = (await recruiter.agent.get(`${API}/orgs/${orgId}/recruitment/interviews?jobId=${jobId}`)).body.data;
      expect(listed).toHaveLength(1);
    });

    it('keeps withdrawn applications final and prevents unsafe vacancy changes', async () => {
      await send(candidate.agent, 'post', `/me/applications/${applicationId}/withdraw`);
      const moved = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/applications/${applicationId}/status`, { status: 'interview' });
      expect(moved.status).toBe(409);
      expect((await recruiter.agent.get(`${API}/orgs/${orgId}/recruitment/interviews?jobId=${jobId}`)).body.data[0].status).toBe('cancelled');

      expect((await send(recruiter.agent, 'put', `/orgs/${orgId}/recruitment/vacancies/${jobId}/status`, { status: 'draft' })).status).toBe(409);
      expect((await send(recruiter.agent, 'delete', `/orgs/${orgId}/recruitment/vacancies/${jobId}`)).status).toBe(409);
      expect((await send(recruiter.agent, 'put', `/orgs/${orgId}/recruitment/vacancies/${jobId}/status`, { status: 'closed' })).body.data.status).toBe('closed');
      expect((await send(recruiter.agent, 'put', `/orgs/${orgId}/recruitment/vacancies/${jobId}`, VACANCY)).status).toBe(409);

      const draft = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/vacancies`, { ...VACANCY, title: 'Temp' });
      expect((await send(recruiter.agent, 'delete', `/orgs/${orgId}/recruitment/vacancies/${draft.body.data.jobId}`)).status).toBe(200);
    });

    it('searches visible talent only and invites candidates to apply', async () => {
      const hidden = await signUp(app, { name: 'Private Person' });
      await send(hidden.agent, 'post', '/me/onboarding', { ...PROFILE, displayName: 'Private Person', visibility: 'private' });

      const found = await recruiter.agent.get(`${API}/orgs/${orgId}/recruitment/talent?skills=Recruitment&minYears=5&workMode=remote&maxSalary=400000`);
      const ids = found.body.data.items.map((t: { id: string }) => t.id);
      expect(ids).toContain(candidate.userId);
      expect(ids).not.toContain(hidden.userId);
      const t = found.body.data.items.find((x: { id: string }) => x.id === candidate.userId);
      expect(t).not.toHaveProperty('email');
      expect(t).not.toHaveProperty('personality');
      expect(t).not.toHaveProperty('gender');
      expect((await recruiter.agent.get(`${API}/orgs/${orgId}/recruitment/talent?maxSalary=100000`)).body.data.items.map((x: { id: string }) => x.id)).not.toContain(candidate.userId);

      const open = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/vacancies`, { ...VACANCY, title: 'Recruiter', status: 'published' });
      const invited = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/talent/${candidate.userId}/invitations`, { jobId: open.body.data.jobId });
      expect(invited.status).toBe(201);
      expect(invited.body.data.application.history[0].note).toBe('Invited by the employer');
      expect((await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/talent/${candidate.userId}/invitations`, { jobId: open.body.data.jobId })).status).toBe(409);
      expect((await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/talent/${hidden.userId}/invitations`, { jobId: open.body.data.jobId })).status).toBe(404);
    });

    it('manages shortlists and assessments, with the reviewer taken from the session', async () => {
      const open = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/vacancies`, { ...VACANCY, title: 'Payroll Analyst', status: 'published' });
      const job = open.body.data.jobId;
      const app1 = (await send(candidate.agent, 'post', `/jobs/${job}/applications`, { coverLetter: '' })).body.data.application.id;

      expect((await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/shortlists`, { jobId: job, name: 'Top', applicationIds: [applicationId] })).status).toBe(400);
      const sl = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/shortlists`, { jobId: job, name: 'Top', applicationIds: [] });
      const added = await send(recruiter.agent, 'put', `/orgs/${orgId}/recruitment/shortlists/${sl.body.data.id}/applications/${app1}`);
      expect(added.body.data.applicationIds).toEqual([app1]);
      const removed = await send(recruiter.agent, 'delete', `/orgs/${orgId}/recruitment/shortlists/${sl.body.data.id}/applications/${app1}`);
      expect(removed.body.data.applicationIds).toEqual([]);

      const as = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/assessments`, { jobId: job, title: 'Payroll test', kind: 'skills-test', questions: ['Compute PAYE'] });
      const scored = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/assessments/${as.body.data.id}/results`, { applicationId: app1, score: 82 });
      expect(scored.body.data.results).toEqual([{ applicationId: app1, score: 82, reviewer: 'Rita Recruiter' }]);
      const rescored = await send(recruiter.agent, 'post', `/orgs/${orgId}/recruitment/assessments/${as.body.data.id}/results`, { applicationId: app1, score: 90 });
      expect(rescored.body.data.results).toEqual([{ applicationId: app1, score: 90, reviewer: 'Rita Recruiter' }]);
    });

    it('reports recruitment analytics', async () => {
      const metrics = (await recruiter.agent.get(`${API}/orgs/${orgId}/recruitment/analytics`)).body.data;
      const byKey = Object.fromEntries(metrics.map((m: { key: string }) => [m.key, m]));
      expect(byKey['applications-by-status'].series.find((s: { label: string }) => s.label === 'withdrawn').value).toBe(1);
      expect(byKey['vacancies-by-status'].series.find((s: { label: string }) => s.label === 'closed').value).toBeGreaterThanOrEqual(1);
      expect(byKey['applications-per-week'].series.reduce((a: number, s: { value: number }) => a + s.value, 0)).toBe(3);
    });
  });

  describe('audit log', () => {
    it('records sensitive actions and is visible to org-admins only', async () => {
      const log = await admin.agent.get(`${API}/orgs/${orgId}/audit-log?pageSize=100`);
      const actions = log.body.data.items.map((e: { action: string }) => e.action);
      expect(actions).toEqual(expect.arrayContaining(['org.created', 'member.invited', 'member.joined', 'member.roles_changed', 'member.suspended', 'org.tier_changed', 'vacancy.created', 'application.status_changed']));
      expect(log.body.data.items[0]).toHaveProperty('actorName');
      const recruiter = await member(['recruiter']);
      expect((await recruiter.agent.get(`${API}/orgs/${orgId}/audit-log`)).status).toBe(403);
    });
  });
});
