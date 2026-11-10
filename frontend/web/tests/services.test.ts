import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_SESSION_COOKIE, ORG_STAFF } from '@grooveli/frontend-domain';
import { mockService as svc } from '@/lib/services/mock';
import { useDemoStore, resetDemoData } from '@/lib/store/store';
import { createInitialState } from '@/lib/store/state';
import { DEMO_CANDIDATE_ID, candidateApplications, objectiveDone, rolesFor } from '@/lib/store/selectors';
import { createHttpService, ApiNotAvailableError } from '@/lib/services/http';

const state = () => useDemoStore.getState();

beforeEach(() => {
  useDemoStore.setState(createInitialState(), true);
});

describe('demo auth', () => {
  it('signs in a persona, sets the UX cookie and org context', async () => {
    const r = await svc.auth.signInDemo('hr-manager');
    expect(r.home).toBe('/org/people');
    expect(state().session).toMatchObject({ personaId: 'hr-manager', activeOrganizationId: 'kestrel-systems' });
    expect(document.cookie).toContain(`${DEMO_SESSION_COOKIE}=hr-manager`);
    expect(rolesFor(state())).toEqual(['hr-manager']);
    await svc.auth.signOut();
    expect(state().session).toBeNull();
    expect(document.cookie).not.toContain('hr-manager');
  });

  it('only lets members switch to organisations they belong to', async () => {
    await svc.auth.signInDemo('org-admin');
    await svc.auth.switchOrganization('amberline-health');
    expect(state().session?.activeOrganizationId).toBe('amberline-health');
    await expect(svc.auth.switchOrganization('not-an-org')).rejects.toThrow();
  });
});

describe('candidate journey', () => {
  beforeEach(async () => {
    await svc.auth.signInDemo('candidate');
  });

  it('applies with simulated submission and anti-spam XP', async () => {
    const r = await svc.jobs.apply('job-m-hrops', { coverLetter: 'I would love to join the team because of my HR operations experience.' });
    expect(r.application).toMatchObject({ status: 'submitted', simulated: true, candidateId: DEMO_CANDIDATE_ID });
    expect(r.xp.award).toBe(25);
    await expect(svc.jobs.apply('job-m-hrops', { coverLetter: 'again' })).rejects.toThrow(/already applied/);
    // Unsuitable role: recorded but no XP.
    const nurse = await svc.jobs.apply('job-a-nurse', { coverLetter: 'Trying something new in a clinic.' });
    expect(nurse.xp.award).toBe(0);
    expect(state().notifications[0]!.body).toMatch(/Simulated/);
  });

  it('awards XP once for profile completion and CV upload', async () => {
    const first = await svc.candidate.attachCv({ name: 'cv.pdf', sizeKb: 120 });
    expect(first.xp.award).toBe(25);
    const second = await svc.candidate.attachCv({ name: 'cv2.pdf', sizeKb: 120 });
    expect(second.xp.award).toBe(0);
  });

  it('tracks mission objectives and only lets complete missions be claimed', async () => {
    await expect(svc.career.claimMission('mission-upskill')).rejects.toThrow(/objective/);
    await svc.career.completeChallenge('ch-excel', 3, 3);
    for (let i = 0; i < 4; i++) await svc.career.toggleCourseModule('course-excel', i);
    expect(objectiveDone(state(), 'course-done')).toBe(true);
    const r = await svc.career.claimMission('mission-upskill');
    expect(r.xp.award).toBe(150);
    await expect(svc.career.claimMission('mission-upskill')).rejects.toThrow(/already/);
  });

  it('withdraws applications', async () => {
    const { application } = await svc.jobs.apply('job-k-people', { coverLetter: 'Experienced HR generalist keen to support your team.' });
    await svc.jobs.withdraw(application.id);
    expect(candidateApplications(state()).find((a) => a.id === application.id)?.status).toBe('withdrawn');
  });
});

describe('assistant (simulated)', () => {
  beforeEach(async () => {
    await svc.auth.signInDemo('candidate');
  });

  it('finds jobs, prepares applications, and submits only after confirmation', async () => {
    const found = await svc.assistant.send('Find me a ₦300k+ remote HR role');
    expect(found.jobIds?.length).toBeGreaterThan(0);
    expect(found.text).toMatch(/not AI/);
    const before = candidateApplications(state()).length;
    const prepared = await svc.assistant.send('Apply for the best 2');
    expect(prepared.pendingApplicationJobIds).toHaveLength(2);
    expect(prepared.text).toMatch(/Would you like me to submit/);
    expect(candidateApplications(state()).length).toBe(before); // nothing submitted yet
    const r = await svc.assistant.confirmApplications(prepared.pendingApplicationJobIds!);
    expect(r.submitted).toHaveLength(2);
    expect(candidateApplications(state()).length).toBe(before + 2);
  });

  it('asks for a shortlist before applying', async () => {
    const r = await svc.assistant.send('apply for the best 3');
    expect(r.pendingApplicationJobIds).toBeUndefined();
    expect(r.text).toMatch(/shortlist first/);
  });
});

describe('employer → candidate cross-persona flow', () => {
  it('reflects recruiter decisions and interview scheduling for the candidate', async () => {
    await svc.auth.signInDemo('candidate');
    const { application } = await svc.jobs.apply('job-k-people', { coverLetter: 'HR generalist with recruitment experience applying.' });
    await svc.auth.signInDemo('recruiter');
    await svc.recruitment.moveApplication(application.id, 'shortlisted');
    await svc.recruitment.scheduleInterview({
      applicationId: application.id,
      jobId: 'job-k-people',
      candidateId: DEMO_CANDIDATE_ID,
      candidateName: 'Tolu',
      scheduledAt: '2026-11-12T10:00:00.000Z',
      durationMin: 45,
      format: 'virtual-hq',
      interviewers: ['Zainab Bello'],
    });
    const app = state().applications.find((a) => a.id === application.id)!;
    expect(app.status).toBe('interview');
    expect(state().interviews.some((i) => i.candidateId === DEMO_CANDIDATE_ID && i.format === 'virtual-hq')).toBe(true);
    expect(state().notifications.some((n) => n.kind === 'interview')).toBe(true);
  });

  it('publishes vacancies and sources talent into the pipeline', async () => {
    await svc.auth.signInDemo('recruiter');
    const job = { ...state().jobs[0]!, id: '', title: 'Platform Lead', status: 'published' as const };
    const { jobId } = await svc.recruitment.saveVacancy(job);
    expect(state().jobs.find((j) => j.id === jobId)?.status).toBe('published');
    const { application } = await svc.recruitment.inviteTalent('talent-01', jobId);
    expect(application.status).toBe('screening');
    await expect(svc.recruitment.inviteTalent('talent-01', jobId)).rejects.toThrow(/already/);
    await expect(svc.recruitment.saveVacancy({ ...job, salaryMin: 9, salaryMax: 1 })).rejects.toThrow(/Minimum/);
  });
});

describe('organisation administration', () => {
  beforeEach(async () => {
    await svc.auth.signInDemo('org-admin');
  });

  it('creates an organisation workspace with simulated invitations', async () => {
    const { organizationId } = await svc.organizations.create({
      profile: {
        name: 'Nimbus Foods',
        tagline: 'Fresh daily',
        logoColor: '#16a34a',
        logoGlyph: 'N',
        industry: 'Food',
        description: 'Bakery chain',
        website: '',
        size: '11-50',
        structure: 'Ltd',
        workArrangements: ['onsite'],
        values: ['Freshness'],
        culture: { environment: 'Warm', leadership: '', collaboration: '', development: '', inclusion: '', workLife: '' },
        benefits: [],
        headquarters: 'Hospitality District',
        district: 'hospitality',
      },
      locations: [{ name: 'Bakery', city: 'Grooveli City', address: '', headcountCapacity: 10 }],
      departments: [{ name: 'Kitchen', responsibilities: 'Baking' }],
      policies: [],
      invites: [{ email: 'chef@nimbus.example', roles: ['hr-manager'] }],
      tier: 'starter',
    });
    expect(organizationId).toBe('nimbus-foods');
    const ws = state().workspaces.find((w) => w.organizationId === organizationId)!;
    expect(ws.invitations[0]).toMatchObject({ email: 'chef@nimbus.example', status: 'pending' });
    expect(state().session?.activeOrganizationId).toBe(organizationId);
  });

  it('validates invitations and protects the last admin', async () => {
    await expect(svc.organizations.invite('kestrel-systems', 'not-an-email', ['employee'])).rejects.toThrow(/valid email/);
    await expect(svc.organizations.setMemberRoles('kestrel-systems', 'mem-k-1', ['employee'])).rejects.toThrow(/at least one admin/);
  });
});

describe('HR, payroll and engagement', () => {
  beforeEach(async () => {
    await svc.auth.signInDemo('payroll-officer');
  });

  it('builds a simulated payroll preview with balanced totals', async () => {
    const emp = ORG_STAFF['kestrel-systems']![2]!;
    const preview = await svc.payroll.preparePreview('kestrel-systems', '2026-11', [{ employeeId: emp.id, kind: 'bonus', label: 'Spot', amount: 50_000 }]);
    expect(preview.simulated).toBe(true);
    expect(preview.status).toBe('draft');
    expect(preview.totals.net).toBe(preview.totals.gross - preview.totals.deductions);
    expect(preview.payslips.find((p) => p.employeeId === emp.id)!.lines.some((l) => l.label === 'Spot')).toBe(true);
    await svc.payroll.approvePreview(preview.id);
    expect(state().payrollRuns[0]!.status).toBe('approved-preview');
    await expect(svc.payroll.preparePreview('kestrel-systems', 'Nov', [])).rejects.toThrow(/YYYY-MM/);
  });

  it('runs leave request → approval and onboarding completion', async () => {
    const emp = ORG_STAFF['kestrel-systems']![5]!;
    await svc.hr.requestLeave({ employeeId: emp.id, type: 'annual', start: '2026-11-20', end: '2026-11-22', days: 0, reason: '' });
    const req = state().leave.find((l) => l.employeeId === emp.id && l.status === 'pending' && l.start === '2026-11-20')!;
    expect(req.days).toBe(3);
    await svc.hr.decideLeave(req.id, 'approved', 'Daniel');
    expect(state().leave.find((l) => l.id === req.id)!.status).toBe('approved');
    await expect(svc.hr.requestLeave({ employeeId: emp.id, type: 'annual', start: '2026-11-22', end: '2026-11-20', days: 0, reason: '' })).rejects.toThrow();

    const { employeeId } = await svc.hr.addEmployee({
      organizationId: 'kestrel-systems',
      name: 'New Starter',
      title: 'Engineer',
      departmentId: 'dep-k-eng',
      locationId: 'loc-k-hq',
      email: 'new@kestrel.example',
      startDate: '2026-11-20',
      employmentType: 'full-time',
      baseMonthly: 500_000,
    });
    for (const t of state().employees.find((e) => e.id === employeeId)!.lifecycleTasks) await svc.hr.toggleLifecycleTask(employeeId, t.id);
    expect(state().employees.find((e) => e.id === employeeId)!.status).toBe('active');
  });

  it('publishes public-HQ announcements and collects survey responses', async () => {
    await svc.engagement.publishAnnouncement({ organizationId: 'kestrel-systems', title: 'Open day', body: 'Visit our HQ', author: 'A', audience: 'public-hq', pinned: false });
    expect(state().announcements[0]).toMatchObject({ audience: 'public-hq', title: 'Open day' });
    const before = state().surveys.find((s) => s.id === 'svy-k-pulse')!.responses.length;
    await svc.engagement.respondToSurvey('svy-k-pulse', { q1: 9, q2: 8 });
    expect(state().surveys.find((s) => s.id === 'svy-k-pulse')!.responses.length).toBe(before + 1);
    await expect(svc.engagement.respondToSurvey('svy-k-q3', { q1: 5 })).rejects.toThrow(/not open/);
  });
});

describe('social, privacy and safety', () => {
  it('RSVPs, blocks and reports', async () => {
    await svc.auth.signInDemo('candidate');
    const r = await svc.social.toggleRsvp('evt-tech-fair');
    expect(r.attending).toBe(true);
    await svc.social.requestConnection('soc-1');
    await svc.social.block('soc-1');
    expect(state().connections.some((c) => c.profileId === 'soc-1')).toBe(false);
    await expect(svc.social.requestConnection('soc-1')).rejects.toThrow(/Unblock/);
    const rep = await svc.social.report({ targetName: 'Someone', reason: 'Spam or scam', details: '' });
    expect(state().reports[0]!.id).toBe(rep.reportId);
    await expect(svc.social.postToCommunity('com-hr', 'hello')).rejects.toThrow(/Join/);
  });
});

describe('demo reset and api mode', () => {
  it('resets demo data but keeps the session', async () => {
    await svc.auth.signInDemo('candidate');
    await svc.jobs.toggleSave('job-k-backend');
    resetDemoData();
    expect(state().savedJobIds).toEqual(['job-m-hrops']);
    expect(state().session?.personaId).toBe('candidate');
  });

  it('api adapter fails visibly instead of falling back to mocks', async () => {
    const api = createHttpService('http://127.0.0.1:9/api');
    await expect(api.jobs.toggleSave('x')).rejects.toBeInstanceOf(ApiNotAvailableError);
  });
});
