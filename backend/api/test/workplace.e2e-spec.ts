import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp, ORIGIN, PDF_BYTES, signUp } from './helpers';

const API = '/api/v1';
type Agent = ReturnType<typeof request.agent>;
type Person = { agent: Agent; userId: string; email: string; membershipId: string; employeeId: string };

/** A Monday `weeks` weeks from now (UTC), as YYYY-MM-DD. */
function monday(weeks: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7) + weeks * 7);
  return d.toISOString().slice(0, 10);
}
const plus = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

describe('Step 4 — HR, engagement, payroll, analytics (e2e)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  let orgId: string;
  let deptEng: string;
  let deptPeople: string;
  let locationId: string;
  let admin: { agent: Agent; userId: string };
  let hr: Person;
  let manager: Person;
  let employee: Person;
  let peer: Person;
  let payrollOfficer: Person;
  const send = (agent: Agent, method: 'post' | 'put' | 'patch' | 'delete', url: string, body?: object) => agent[method](`${API}${url}`).set('Origin', ORIGIN).send(body);

  /** Signs up a user, makes them a member with `roles`, and has HR create their linked employee record. */
  async function person(roles: ('hr_manager' | 'manager' | 'employee' | 'payroll_officer')[], name: string, departmentId = deptEng, baseMonthly = 400_000): Promise<Person> {
    const u = await signUp(app, { name });
    const m = await prisma.membership.create({ data: { organizationId: orgId, userId: u.userId, roles } });
    const creator = hr ?? { agent: admin.agent };
    const res = await send(creator.agent, 'post', `/orgs/${orgId}/hr/employees`, {
      name, title: 'Staff', departmentId, locationId, email: u.email, startDate: '2024-01-15', employmentType: 'full-time', baseMonthly,
    });
    expect(res.status).toBe(201);
    return { ...u, membershipId: m.id, employeeId: res.body.data.employeeId };
  }

  beforeAll(async () => {
    app = await createApp();
    admin = await signUp(app, { name: 'Admin', accountType: 'organization' });
    const created = await send(admin.agent, 'post', '/orgs', {
      profile: {
        name: 'Amberline Health', tagline: '', logoColor: '#22AA66', logoGlyph: 'AH', industry: 'Healthcare', district: 'healthcare', description: '',
        website: '', size: '51-200', structure: '', workArrangements: ['onsite'], values: [],
        culture: { environment: '', leadership: '', collaboration: '', development: '', inclusion: '', workLife: '' }, benefits: [], headquarters: 'Abuja',
      },
      locations: [{ name: 'Abuja', city: 'Abuja', address: '1 Wuse', headcountCapacity: 100 }],
      departments: [{ name: 'Engineering', responsibilities: '' }, { name: 'People', responsibilities: '' }],
      policies: [], invites: [], tier: 'enterprise',
    });
    orgId = created.body.data.organizationId;
    const ws = (await admin.agent.get(`${API}/orgs/${orgId}/workspace`)).body.data;
    deptEng = ws.departments.find((d: { name: string }) => d.name === 'Engineering').id;
    deptPeople = ws.departments.find((d: { name: string }) => d.name === 'People').id;
    locationId = ws.locations[0].id;

    hr = await person(['hr_manager'], 'Daniel HR', deptPeople);
    manager = await person(['manager', 'employee'], 'Kofi Manager');
    employee = await person(['employee'], 'Ada Employee');
    peer = await person(['employee'], 'Bola Peer');
    payrollOfficer = await person(['payroll_officer'], 'Chidi Payroll', deptPeople);
    await send(hr.agent, 'patch', `/orgs/${orgId}/hr/employees/${employee.employeeId}`, { managerId: manager.employeeId });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('employees', () => {
    it('links HR records to member accounts and protects private fields', async () => {
      const own = await employee.agent.get(`${API}/orgs/${orgId}/hr/employees/${employee.employeeId}`);
      expect(own.status).toBe(200);
      expect(own.body.data).toMatchObject({ name: 'Ada Employee', managerId: manager.employeeId, status: 'onboarding' });
      expect(own.body.data.lifecycleTasks).toHaveLength(5);
      expect((await employee.agent.get(`${API}/orgs/${orgId}/hr/employees/${peer.employeeId}`)).status).toBe(403);

      await send(hr.agent, 'patch', `/orgs/${orgId}/hr/employees/${peer.employeeId}`, { emergencyContact: 'Mum 0803' });
      const dir = (await employee.agent.get(`${API}/orgs/${orgId}/hr/employees?q=bola`)).body.data.items[0];
      expect(dir.emergencyContact).toBe('');
      expect(dir.lifecycleTasks).toEqual([]);
      const hrView = (await hr.agent.get(`${API}/orgs/${orgId}/hr/employees?q=bola`)).body.data.items[0];
      expect(hrView.emergencyContact).toBe('Mum 0803');

      const session = (await employee.agent.get(`${API}/auth/session`)).body.data;
      expect(session.memberships[0]).toMatchObject({ organizationId: orgId, employeeId: employee.employeeId });
    });

    it('validates records: duplicates, unknown structure, management loops', async () => {
      expect((await send(hr.agent, 'post', `/orgs/${orgId}/hr/employees`, { name: 'Dup', title: '', departmentId: deptEng, locationId, email: employee.email, startDate: '2024-01-01', employmentType: 'full-time', baseMonthly: 1 })).status).toBe(409);
      expect((await send(hr.agent, 'post', `/orgs/${orgId}/hr/employees`, { name: 'X', title: '', departmentId: 'nope', locationId, email: 'x@example.test', startDate: '2024-01-01', employmentType: 'full-time', baseMonthly: 1 })).status).toBe(400);
      const loop = await send(hr.agent, 'patch', `/orgs/${orgId}/hr/employees/${manager.employeeId}`, { managerId: employee.employeeId });
      expect(loop.status).toBe(400);
      expect(loop.body.error.fields.managerId).toBe('Creates a loop');
      expect((await send(employee.agent, 'patch', `/orgs/${orgId}/hr/employees/${employee.employeeId}`, { title: 'CEO' })).status).toBe(403);
    });

    it('activates an employee once onboarding tasks are done', async () => {
      const tasks = (await hr.agent.get(`${API}/orgs/${orgId}/hr/employees/${peer.employeeId}`)).body.data.lifecycleTasks;
      for (const t of tasks) await send(hr.agent, 'put', `/orgs/${orgId}/hr/employees/${peer.employeeId}/tasks/${t.id}`, { done: true });
      expect((await hr.agent.get(`${API}/orgs/${orgId}/hr/employees/${peer.employeeId}`)).body.data.status).toBe('active');
    });

    it('stores documents privately; only HR and the employee can open them', async () => {
      const up = await hr.agent.post(`${API}/orgs/${orgId}/hr/employees/${employee.employeeId}/documents`).set('Origin', ORIGIN)
        .field('kind', 'contract').field('name', 'Employment contract').attach('file', PDF_BYTES, { filename: 'contract.pdf', contentType: 'application/pdf' });
      expect(up.status).toBe(201);
      const docId = up.body.data.id;
      const mine = await employee.agent.get(`${API}/orgs/${orgId}/hr/employees/${employee.employeeId}/documents/${docId}`);
      expect(mine.status).toBe(200);
      expect((await fetch(mine.body.data.downloadUrl)).status).toBe(200);
      expect((await peer.agent.get(`${API}/orgs/${orgId}/hr/employees/${employee.employeeId}/documents/${docId}`)).status).toBe(403);
      expect((await send(employee.agent, 'delete', `/orgs/${orgId}/hr/employees/${employee.employeeId}/documents/${docId}`)).status).toBe(403);
      const bad = await hr.agent.post(`${API}/orgs/${orgId}/hr/employees/${employee.employeeId}/documents`).set('Origin', ORIGIN)
        .field('kind', 'id').field('name', 'Passport').attach('file', Buffer.from('<html>'), { filename: 'p.pdf', contentType: 'application/pdf' });
      expect(bad.status).toBe(415);
      expect(await prisma.auditLog.count({ where: { action: 'employee.document_viewed', organizationId: orgId } })).toBe(1);
    });
  });

  describe('leave', () => {
    let leaveId: string;
    const start = monday(2);

    it('counts working days, checks balance and overlaps, and only for yourself', async () => {
      const req = await send(employee.agent, 'post', `/orgs/${orgId}/hr/leave`, { employeeId: employee.employeeId, type: 'annual', start, end: plus(start, 6), reason: 'Holiday' });
      expect(req.status).toBe(201);
      expect(req.body.data).toMatchObject({ days: 5, status: 'pending' });
      leaveId = req.body.data.id;
      expect((await send(employee.agent, 'post', `/orgs/${orgId}/hr/leave`, { employeeId: employee.employeeId, type: 'sick', start: plus(start, 2), end: plus(start, 2), reason: '' })).status).toBe(409);
      expect((await send(employee.agent, 'post', `/orgs/${orgId}/hr/leave`, { employeeId: peer.employeeId, type: 'annual', start: monday(5), end: monday(5), reason: '' })).status).toBe(403);
      // Study allowance is 5 days; 10 working days must be refused (whichever year it falls in).
      const tooMuch = await send(employee.agent, 'post', `/orgs/${orgId}/hr/leave`, { employeeId: employee.employeeId, type: 'study', start: monday(3), end: plus(monday(3), 11), reason: '' });
      expect([400, 409]).toContain(tooMuch.status);
      if (tooMuch.status === 409) expect(tooMuch.body.error.code).toBe('NOT_ALLOWED_IN_STATE');
      const me = (await employee.agent.get(`${API}/me/employee?orgId=${orgId}`)).body.data;
      if (new Date(start).getUTCFullYear() === new Date().getUTCFullYear()) expect(me.leaveBalance.annual).toBe(15);
      expect(me.leave[0].id).toBe(leaveId);
    });

    it('lets only the direct manager or HR decide, never the requester', async () => {
      expect((await send(employee.agent, 'post', `/orgs/${orgId}/hr/leave/${leaveId}/decision`, { decision: 'approved' })).status).toBe(403);
      const otherManager = await person(['manager'], 'Other Manager');
      expect((await send(otherManager.agent, 'post', `/orgs/${orgId}/hr/leave/${leaveId}/decision`, { decision: 'approved' })).status).toBe(403);
      const managerList = (await manager.agent.get(`${API}/orgs/${orgId}/hr/leave?status=pending`)).body.data.items;
      expect(managerList.map((l: { id: string }) => l.id)).toContain(leaveId);
      expect((await peer.agent.get(`${API}/orgs/${orgId}/hr/leave`)).body.data.items).toEqual([]);

      const approved = await send(manager.agent, 'post', `/orgs/${orgId}/hr/leave/${leaveId}/decision`, { decision: 'approved' });
      expect(approved.body.data).toMatchObject({ status: 'approved', decidedBy: 'Kofi Manager' });
      expect((await send(manager.agent, 'post', `/orgs/${orgId}/hr/leave/${leaveId}/decision`, { decision: 'rejected' })).status).toBe(409);
      const cancelled = await send(employee.agent, 'post', `/orgs/${orgId}/hr/leave/${leaveId}/decision`, { decision: 'cancelled' });
      expect(cancelled.body.data.status).toBe('cancelled');
      const notes = (await employee.agent.get(`${API}/me/notifications`)).body.data.items;
      expect(notes.some((n: { title: string }) => n.title === 'Leave approved')).toBe(true);
    });
  });

  describe('attendance', () => {
    it('clocks in once a day for yourself only, and scopes who sees what', async () => {
      const inRes = await send(employee.agent, 'post', `/orgs/${orgId}/hr/attendance/clock-in`, { employeeId: employee.employeeId, status: 'remote' });
      expect(inRes.status).toBe(200);
      expect(inRes.body.data.status).toBe('remote');
      expect((await send(employee.agent, 'post', `/orgs/${orgId}/hr/attendance/clock-in`, { employeeId: employee.employeeId, status: 'remote' })).status).toBe(409);
      expect((await send(employee.agent, 'post', `/orgs/${orgId}/hr/attendance/clock-in`, { employeeId: peer.employeeId, status: 'present' })).status).toBe(403);
      expect((await send(employee.agent, 'post', `/orgs/${orgId}/hr/attendance/clock-out`, { employeeId: employee.employeeId })).status).toBe(200);
      await send(peer.agent, 'post', `/orgs/${orgId}/hr/attendance/clock-in`, { employeeId: peer.employeeId, status: 'present' });

      const own = (await employee.agent.get(`${API}/orgs/${orgId}/hr/attendance`)).body.data.items;
      expect(own.map((a: { employeeId: string }) => a.employeeId)).toEqual([employee.employeeId]);
      const mgr = (await manager.agent.get(`${API}/orgs/${orgId}/hr/attendance`)).body.data.items;
      expect(mgr.map((a: { employeeId: string }) => a.employeeId)).toEqual([employee.employeeId]);
      expect((await hr.agent.get(`${API}/orgs/${orgId}/hr/attendance`)).body.data.total).toBe(2);
    });
  });

  describe('performance reviews', () => {
    it('runs a cycle: managers review reports, employees see only shared reviews', async () => {
      const created = await send(hr.agent, 'post', `/orgs/${orgId}/hr/reviews`, { cycle: '2026-H2', employeeIds: [employee.employeeId, peer.employeeId] });
      expect(created.status).toBe(201);
      expect((await send(hr.agent, 'post', `/orgs/${orgId}/hr/reviews`, { cycle: '2026-H2', employeeIds: [employee.employeeId] })).status).toBe(409);
      const review = created.body.data.find((r: { employeeId: string }) => r.employeeId === employee.employeeId);
      expect(review.reviewer).toBe('Kofi Manager');
      const peerReview = created.body.data.find((r: { employeeId: string }) => r.employeeId === peer.employeeId);
      expect((await send(manager.agent, 'patch', `/orgs/${orgId}/hr/reviews/${peerReview.id}`, { rating: 5 })).status).toBe(403);

      expect((await employee.agent.get(`${API}/orgs/${orgId}/hr/reviews`)).body.data).toEqual([]);
      expect((await send(manager.agent, 'patch', `/orgs/${orgId}/hr/reviews/${review.id}`, { rating: 6 })).status).toBe(400);
      await send(manager.agent, 'patch', `/orgs/${orgId}/hr/reviews/${review.id}`, { rating: 4, strengths: 'Ownership', goals: [{ title: 'Ship v2', progress: 60 }] });
      await send(manager.agent, 'patch', `/orgs/${orgId}/hr/reviews/${review.id}`, { status: 'shared' });
      const visible = (await employee.agent.get(`${API}/orgs/${orgId}/hr/reviews`)).body.data;
      expect(visible).toHaveLength(1);
      expect(visible[0]).toMatchObject({ rating: 4, strengths: 'Ownership', status: 'shared' });
      expect((await send(manager.agent, 'patch', `/orgs/${orgId}/hr/reviews/${review.id}`, { rating: 2 })).status).toBe(409);
    });
  });

  describe('policies', () => {
    it('tracks acknowledgements per version', async () => {
      const p = await send(hr.agent, 'post', `/orgs/${orgId}/hr/policies`, { title: 'Remote work', category: 'remote-work', body: 'Two days a week.' });
      expect(p.status).toBe(201);
      expect((await send(employee.agent, 'post', `/orgs/${orgId}/hr/policies`, { title: 'x', category: 'other', body: 'x' })).status).toBe(403);
      const before = (await employee.agent.get(`${API}/me/employee?orgId=${orgId}`)).body.data.policiesToAcknowledge;
      expect(before.map((x: { id: string }) => x.id)).toContain(p.body.data.id);
      await send(employee.agent, 'post', `/orgs/${orgId}/hr/policies/${p.body.data.id}/acknowledge`);
      expect((await employee.agent.get(`${API}/me/employee?orgId=${orgId}`)).body.data.policiesToAcknowledge).toEqual([]);
      const list = (await employee.agent.get(`${API}/orgs/${orgId}/hr/policies`)).body.data;
      expect(list.find((x: { id: string }) => x.id === p.body.data.id).acknowledgements).toBe(1);

      const changed = await send(hr.agent, 'put', `/orgs/${orgId}/hr/policies/${p.body.data.id}`, { title: 'Remote work', category: 'remote-work', body: 'Three days a week.' });
      expect(changed.body.data.acknowledgements).toBe(0);
      expect((await employee.agent.get(`${API}/me/employee?orgId=${orgId}`)).body.data.policiesToAcknowledge).toHaveLength(1);
    });
  });

  describe('structure, dashboard, offboarding', () => {
    it('serves the org chart and a dashboard scoped to the caller', async () => {
      const s = (await employee.agent.get(`${API}/orgs/${orgId}/structure`)).body.data;
      expect(s.employees.find((e: { id: string }) => e.id === employee.employeeId)).toEqual({ id: employee.employeeId, name: 'Ada Employee', title: 'Staff', managerId: manager.employeeId, departmentId: deptEng });
      expect(s.employees[0]).not.toHaveProperty('email');
      const d = (await hr.agent.get(`${API}/orgs/${orgId}/dashboard`)).body.data;
      expect(d).toMatchObject({ openVacancies: 0, pendingLeave: 0 });
      expect(d.reviewsDue).toBe(1);
    });

    it('offboards: tasks first, then exit removes access and keeps one org-admin', async () => {
      const leaver = await person(['employee'], 'Leaving Lara');
      expect((await send(hr.agent, 'post', `/orgs/${orgId}/hr/employees/${leaver.employeeId}/offboarding/complete`)).status).toBe(409);
      const started = await send(hr.agent, 'post', `/orgs/${orgId}/hr/employees/${leaver.employeeId}/offboarding`, { lastDay: plus(monday(1), 4) });
      expect(started.body.data.status).toBe('offboarding');
      expect((await send(hr.agent, 'post', `/orgs/${orgId}/hr/employees/${leaver.employeeId}/offboarding/complete`)).status).toBe(409);
      for (const t of started.body.data.lifecycleTasks.filter((x: { phase: string }) => x.phase === 'offboarding')) {
        await send(hr.agent, 'put', `/orgs/${orgId}/hr/employees/${leaver.employeeId}/tasks/${t.id}`, { done: true });
      }
      const done = await send(hr.agent, 'post', `/orgs/${orgId}/hr/employees/${leaver.employeeId}/offboarding/complete`);
      expect(done.body.data.status).toBe('exited');
      expect((await leaver.agent.get(`${API}/orgs/${orgId}/workspace`)).status).toBe(404);
      expect((await send(hr.agent, 'patch', `/orgs/${orgId}/hr/employees/${leaver.employeeId}`, { title: 'x' })).status).toBe(409);
    });
  });

  describe('engagement', () => {
    it('targets announcements by department', async () => {
      const toPeople = await send(hr.agent, 'post', `/orgs/${orgId}/engagement/announcements`, { title: 'People team offsite', body: 'Friday', audience: 'department', departmentId: deptPeople, pinned: false });
      expect(toPeople.status).toBe(201);
      await send(hr.agent, 'post', `/orgs/${orgId}/engagement/announcements`, { title: 'All hands', body: 'Monday', audience: 'all', pinned: true });
      const seenByEng = (await employee.agent.get(`${API}/orgs/${orgId}/engagement/announcements`)).body.data.items.map((a: { title: string }) => a.title);
      expect(seenByEng).toEqual(['All hands']);
      const seenByPeople = (await payrollOfficer.agent.get(`${API}/orgs/${orgId}/engagement/announcements`)).body.data.items.map((a: { title: string }) => a.title);
      expect(seenByPeople.sort()).toEqual(['All hands', 'People team offsite']);
      expect((await send(employee.agent, 'post', `/orgs/${orgId}/engagement/announcements`, { title: 'x', body: 'x', audience: 'all', pinned: false })).status).toBe(403);
    });

    it('recognition: not yourself, one reaction per person', async () => {
      expect((await send(employee.agent, 'post', `/orgs/${orgId}/engagement/recognition`, { toEmployeeId: employee.employeeId, value: 'Self', message: 'Me' })).status).toBe(409);
      const r = await send(employee.agent, 'post', `/orgs/${orgId}/engagement/recognition`, { toEmployeeId: peer.employeeId, value: 'Teamwork', message: 'Thanks for the help' });
      expect(r.body.data).toMatchObject({ from: 'Ada Employee', reactions: 0 });
      await send(manager.agent, 'post', `/orgs/${orgId}/engagement/recognition/${r.body.data.id}/reactions`);
      const again = await send(manager.agent, 'post', `/orgs/${orgId}/engagement/recognition/${r.body.data.id}/reactions`);
      expect(again.body.data.reactions).toBe(1);
    });

    it('anonymous surveys: one answer each, results hidden under 5, never linked to a person', async () => {
      const survey = { title: 'Pulse', status: 'open', anonymous: true, questions: [{ id: 'q1', text: 'How are you?', kind: 'scale' }, { id: 'q2', text: 'Anything else?', kind: 'text' }], closesOn: plus(monday(0), 30) };
      expect((await send(hr.agent, 'put', `/orgs/${orgId}/engagement/surveys/pulse-1`, survey)).status).toBe(200);
      expect((await send(employee.agent, 'post', `/orgs/${orgId}/engagement/surveys/pulse-1/responses`, { answers: { q1: 9, q2: 'x' } })).status).toBe(400);
      const voters = [employee, peer, manager, payrollOfficer];
      for (const [i, p] of voters.entries()) {
        expect((await send(p.agent, 'post', `/orgs/${orgId}/engagement/surveys/pulse-1/responses`, { answers: { q1: i + 2, q2: `note ${i}` } })).status).toBe(201);
      }
      expect((await send(employee.agent, 'post', `/orgs/${orgId}/engagement/surveys/pulse-1/responses`, { answers: { q1: 3, q2: '' } })).status).toBe(409);
      let s = (await hr.agent.get(`${API}/orgs/${orgId}/engagement/surveys`)).body.data.find((x: { id: string }) => x.id === 'pulse-1');
      expect(s.results).toBeNull();
      await send(hr.agent, 'post', `/orgs/${orgId}/engagement/surveys/pulse-1/responses`, { answers: { q1: 5, q2: '' } });
      s = (await hr.agent.get(`${API}/orgs/${orgId}/engagement/surveys`)).body.data.find((x: { id: string }) => x.id === 'pulse-1');
      expect(s.results.responseCount).toBe(5);
      expect(s.results.questions[0]).toMatchObject({ questionId: 'q1', average: 3.8 });
      expect((await employee.agent.get(`${API}/orgs/${orgId}/engagement/surveys`)).body.data[0]).toMatchObject({ respondedByMe: true, results: null });

      const stored = await prisma.surveyResponse.findMany({ where: { surveyId: 'pulse-1' } });
      expect(stored.every((r) => r.userId === null && r.at === null)).toBe(true);
      expect((await send(hr.agent, 'put', `/orgs/${orgId}/engagement/surveys/pulse-1`, { ...survey, anonymous: false })).status).toBe(409);
    });

    it('anonymous feedback has no author; participants see only their own named feedback', async () => {
      const anon = await send(employee.agent, 'post', `/orgs/${orgId}/engagement/feedback`, { category: 'concern', body: 'Too many meetings', anonymous: true });
      expect(anon.body.data.author).toBeNull();
      await send(employee.agent, 'post', `/orgs/${orgId}/engagement/feedback`, { category: 'idea', body: 'Hack day please', anonymous: false });
      expect((await send(employee.agent, 'post', `/orgs/${orgId}/engagement/feedback`, { category: 'idea', body: 'hi', anonymous: false })).status).toBe(400);
      const stored = await prisma.feedbackItem.findUniqueOrThrow({ where: { id: anon.body.data.id } });
      expect(stored.authorId).toBeNull();

      const mine = (await employee.agent.get(`${API}/orgs/${orgId}/engagement/feedback`)).body.data.items;
      expect(mine.map((f: { body: string }) => f.body)).toEqual(['Hack day please']);
      const all = (await hr.agent.get(`${API}/orgs/${orgId}/engagement/feedback`)).body.data.items;
      expect(all).toHaveLength(2);
      expect(all.find((f: { anonymous: boolean }) => f.anonymous).at).toMatch(/T00:00:00.000Z$/);
    });

    it('activities and initiatives upsert by ID, scoped to the organisation', async () => {
      const a = await send(hr.agent, 'put', `/orgs/${orgId}/engagement/activities/fun-run`, { title: 'Fun run', date: plus(monday(0), 10), location: 'Park', kind: 'wellbeing' });
      expect(a.body.data.rsvps).toEqual([]);
      const rsvp = await send(employee.agent, 'put', `/orgs/${orgId}/engagement/activities/fun-run/rsvps/me`);
      expect(rsvp.body.data.rsvps).toEqual([employee.membershipId]);
      const cancel = await send(employee.agent, 'delete', `/orgs/${orgId}/engagement/activities/fun-run/rsvps/me`);
      expect(cancel.body.data.rsvps).toEqual([]);
      const i = await send(hr.agent, 'put', `/orgs/${orgId}/engagement/initiatives/mentoring`, { title: 'Mentoring', owner: 'Daniel', progress: 40, status: 'active' });
      expect(i.body.data.progress).toBe(40);

      // Another organisation cannot overwrite these IDs.
      const otherAdmin = await signUp(app, { accountType: 'organization' });
      const other = await send(otherAdmin.agent, 'post', '/orgs', {
        profile: { name: 'Other Co', tagline: '', logoColor: '#000000', logoGlyph: 'O', industry: '', district: 'tech', description: '', website: '', size: '1-10', structure: '', workArrangements: [], values: [], culture: { environment: '', leadership: '', collaboration: '', development: '', inclusion: '', workLife: '' }, benefits: [], headquarters: '' },
        locations: [], departments: [], policies: [], invites: [], tier: 'growth',
      });
      const hijack = await send(otherAdmin.agent, 'put', `/orgs/${other.body.data.organizationId}/engagement/initiatives/mentoring`, { title: 'Mine', owner: 'x', progress: 0, status: 'planned' });
      expect(hijack.status).toBe(409);
    });
  });

  describe('payroll preview', () => {
    it('calculates previews from structures and adjustments, simulation only', async () => {
      const P = `/orgs/${orgId}/payroll`;
      expect((await employee.agent.get(`${API}${P}/compensation`)).status).toBe(403);
      await send(payrollOfficer.agent, 'put', `${P}/components/housing`, { id: 'housing', name: 'Housing', kind: 'allowance', calc: { type: 'percent', value: 10 }, taxable: true });
      await send(payrollOfficer.agent, 'put', `${P}/components/union`, { id: 'union', name: 'Union dues', kind: 'deduction', calc: { type: 'fixed', value: 5000 }, taxable: false });
      expect((await send(payrollOfficer.agent, 'put', `${P}/components/x1`, { id: 'other', name: 'x', kind: 'allowance', calc: { type: 'percent', value: 150 }, taxable: true })).status).toBe(400);
      const st = await send(payrollOfficer.agent, 'put', `${P}/structures/grade-2`, { grade: 'G2', minBase: 300_000, maxBase: 500_000, componentIds: ['housing', 'union'] });
      expect(st.body.data.componentIds).toEqual(['housing', 'union']);
      const comp = await send(payrollOfficer.agent, 'put', `${P}/compensation/${employee.employeeId}`, { baseMonthly: 450_000, reason: 'Promotion', structureId: 'grade-2' });
      expect(comp.body.data).toMatchObject({ baseMonthly: 450_000, structureId: 'grade-2', bankOnFile: false });
      expect(comp.body.data.history.map((h: { reason: string }) => h.reason)).toEqual(['Starting salary', 'Promotion']);
      expect((await send(hr.agent, 'put', `${P}/compensation/${employee.employeeId}`, { baseMonthly: 1, reason: 'x' })).status).toBe(403);

      const period = '2026-11';
      const preview = await send(payrollOfficer.agent, 'post', `${P}/previews`, { period, adjustments: [{ employeeId: employee.employeeId, kind: 'bonus', label: 'Q4 bonus', amount: 50_000 }] });
      expect(preview.status).toBe(201);
      expect(preview.body.data.simulated).toBe(true);
      const slip = preview.body.data.payslips.find((s: { employeeId: string }) => s.employeeId === employee.employeeId);
      expect(slip).toMatchObject({ gross: 450_000 + 45_000 + 50_000, totalDeductions: 5_000, net: 540_000 });
      expect(slip.warnings).toEqual(expect.arrayContaining(['Statutory deductions (PAYE, pension, NHF) are not calculated yet.', 'No bank details on file.']));
      expect(slip).not.toHaveProperty('departmentId');
      expect(preview.body.data.payslips.map((s: { employeeName: string }) => s.employeeName)).not.toContain('Leaving Lara');

      const pid = preview.body.data.id;
      expect((await employee.agent.get(`${API}${P}/previews/${pid}/payslips/${employee.employeeId}`)).status).toBe(404);
      expect((await send(payrollOfficer.agent, 'post', `${P}/previews/${pid}/approve`)).body.data.status).toBe('approved-preview');
      expect((await send(payrollOfficer.agent, 'post', `${P}/previews/${pid}/approve`)).status).toBe(409);
      expect((await send(payrollOfficer.agent, 'delete', `${P}/previews/${pid}`)).status).toBe(409);
      expect((await send(payrollOfficer.agent, 'post', `${P}/previews`, { period, adjustments: [] })).status).toBe(409);

      const own = await employee.agent.get(`${API}${P}/previews/${pid}/payslips/${employee.employeeId}`);
      expect(own.body.data.net).toBe(540_000);
      expect((await employee.agent.get(`${API}${P}/previews/${pid}/payslips/${peer.employeeId}`)).status).toBe(403);
      expect((await employee.agent.get(`${API}/me/employee?orgId=${orgId}`)).body.data.payslips).toEqual([{ previewId: pid, period }]);

      const report = (await payrollOfficer.agent.get(`${API}${P}/reports?from=2026-01&to=2026-12`)).body.data;
      expect(report.find((r: { department: string }) => r.department === 'Engineering')).toMatchObject({ period });
      expect(await prisma.auditLog.count({ where: { organizationId: orgId, action: 'payroll.preview_approved' } })).toBe(1);
    });

    it('is gated by plan', async () => {
      const starterAdmin = await signUp(app, { accountType: 'organization' });
      const starter = await send(starterAdmin.agent, 'post', '/orgs', {
        profile: { name: 'Starter Co', tagline: '', logoColor: '#000000', logoGlyph: 'S', industry: '', district: 'tech', description: '', website: '', size: '1-10', structure: '', workArrangements: [], values: [], culture: { environment: '', leadership: '', collaboration: '', development: '', inclusion: '', workLife: '' }, benefits: [], headquarters: '' },
        locations: [], departments: [], policies: [], invites: [], tier: 'starter',
      });
      const res = await starterAdmin.agent.get(`${API}/orgs/${starter.body.data.organizationId}/payroll/compensation`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('MODULE_NOT_IN_PLAN');
      const eng = await starterAdmin.agent.get(`${API}/orgs/${starter.body.data.organizationId}/engagement/announcements`);
      expect(eng.body.error.code).toBe('MODULE_NOT_IN_PLAN');
    });
  });

  describe('workforce analytics', () => {
    it('returns aggregates and suppresses groups under 5', async () => {
      expect((await employee.agent.get(`${API}/orgs/${orgId}/analytics/workforce`)).status).toBe(403);
      const metrics = (await hr.agent.get(`${API}/orgs/${orgId}/analytics/workforce`)).body.data;
      const byKey = Object.fromEntries(metrics.map((m: { key: string; series: unknown }) => [m.key, m.series]));
      const headcount = byKey['headcount'][0].value;
      expect(headcount).toBe(6);
      // Engineering has 4 current people and People has 2: both under 5 alone, merged into one "Other" bucket of 6.
      expect(byKey['headcount-by-department']).toEqual([{ label: 'Other (small groups)', value: 6 }]);
      expect(byKey['exits-per-month'].reduce((a: number, s: { value: number }) => a + s.value, 0)).toBe(1);
      expect(byKey['payroll-gross-per-month'][0].label).toBe('2026-11');
      expect(JSON.stringify(metrics)).not.toMatch(/Ada|Bola|Kofi/);
    });
  });
});
