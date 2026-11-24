import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp, ORIGIN, PDF_BYTES, PROFILE, seedOrgWithJobs, signUp } from './helpers';

const API = '/api/v1';

describe('Step 2 — candidate, jobs, career (e2e)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  let jobs: Awaited<ReturnType<typeof seedOrgWithJobs>>;

  beforeAll(async () => {
    app = await createApp();
    jobs = await seedOrgWithJobs(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── Auth guard ───────────────────────────────────────────────────────────
  it('requires a session for /me endpoints', async () => {
    const res = await request(app.getHttpServer()).get(`${API}/me/profile`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  // ── Profile ──────────────────────────────────────────────────────────────
  describe('profile', () => {
    it('returns a default profile before onboarding, then onboards and awards XP once', async () => {
      const { agent, userId } = await signUp(app);
      const before = await agent.get(`${API}/me/profile`);
      expect(before.status).toBe(200);
      expect(before.body.data).toMatchObject({ id: userId, headline: '', skills: [], cvFile: null });

      const onboard = await agent.post(`${API}/me/onboarding`).set('Origin', ORIGIN).send(PROFILE);
      expect(onboard.status).toBe(200);
      expect(onboard.body.data.xp).toEqual({ award: 50, reason: '+50 XP' });

      const again = await agent.post(`${API}/me/onboarding`).set('Origin', ORIGIN).send(PROFILE);
      expect(again.status).toBe(409);

      const profile = await agent.get(`${API}/me/profile`);
      expect(profile.body.data).toMatchObject({ displayName: 'Ada Candidate', headline: PROFILE.headline, yearsExperience: 5 });

      const patch = await agent.patch(`${API}/me/profile`).set('Origin', ORIGIN).send({ headline: 'Senior HR Specialist' });
      expect(patch.body.data.xp).toEqual({ award: 0, reason: 'Already rewarded once.' });

      const session = await agent.get(`${API}/auth/session`);
      expect(session.body.data.onboardingComplete).toBe(true);
      expect(session.body.data.user.displayName).toBe('Ada Candidate');
    });

    it('rejects invalid and unknown fields', async () => {
      const { agent } = await signUp(app);
      const bad = await agent.patch(`${API}/me/profile`).set('Origin', ORIGIN).send({ yearsExperience: -1, isAdmin: true });
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
      const empty = await agent.patch(`${API}/me/profile`).set('Origin', ORIGIN).send({});
      expect(empty.status).toBe(400);
      const photo = await agent.patch(`${API}/me/profile`).set('Origin', ORIGIN).send({ photoDataUrl: 'javascript:alert(1)' });
      expect(photo.status).toBe(400);
    });

    it('reads and updates privacy settings', async () => {
      const { agent } = await signUp(app);
      const before = await agent.get(`${API}/me/privacy`);
      expect(before.body.data).toMatchObject({ presenceVisibility: 'everyone', allowMessages: 'connections', blockedIds: [] });
      const after = await agent.patch(`${API}/me/privacy`).set('Origin', ORIGIN).send({ presenceVisibility: 'hidden', profileDiscoverable: false });
      expect(after.body.data).toMatchObject({ presenceVisibility: 'hidden', profileDiscoverable: false });
      const blocked = await agent.patch(`${API}/me/privacy`).set('Origin', ORIGIN).send({ blockedIds: ['x'] });
      expect(blocked.status).toBe(400);
    });
  });

  // ── CV ───────────────────────────────────────────────────────────────────
  describe('CV', () => {
    it('uploads a PDF to storage, serves a signed link, awards XP once, and deletes', async () => {
      const { agent } = await signUp(app);
      const up = await agent.post(`${API}/me/cv`).set('Origin', ORIGIN).attach('file', PDF_BYTES, { filename: 'Ada CV.pdf', contentType: 'application/pdf' });
      expect(up.status).toBe(200);
      expect(up.body.data.xp.award).toBe(25);

      const info = await agent.get(`${API}/me/cv`);
      expect(info.body.data).toMatchObject({ name: 'Ada CV.pdf' });
      const download = await fetch(info.body.data.downloadUrl);
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer()).equals(PDF_BYTES)).toBe(true);

      const again = await agent.post(`${API}/me/cv`).set('Origin', ORIGIN).attach('file', PDF_BYTES, { filename: 'v2.pdf', contentType: 'application/pdf' });
      expect(again.body.data.xp.award).toBe(0);

      const del = await agent.delete(`${API}/me/cv`).set('Origin', ORIGIN);
      expect(del.status).toBe(200);
      expect((await agent.get(`${API}/me/cv`)).body.data).toBeNull();
    });

    it('checks the real file type and size', async () => {
      const { agent } = await signUp(app);
      const fake = await agent.post(`${API}/me/cv`).set('Origin', ORIGIN).attach('file', Buffer.from('MZ not a pdf'), { filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(fake.status).toBe(415);
      expect(fake.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      const big = Buffer.concat([PDF_BYTES, Buffer.alloc(5 * 1024 * 1024)]);
      const tooBig = await agent.post(`${API}/me/cv`).set('Origin', ORIGIN).attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' });
      expect(tooBig.status).toBe(413);
      const missing = await agent.post(`${API}/me/cv`).set('Origin', ORIGIN);
      expect(missing.status).toBe(400);
    });
  });

  // ── Jobs ─────────────────────────────────────────────────────────────────
  describe('jobs and applications', () => {
    it('lists only open published jobs, publicly, with filters and pagination', async () => {
      const anon = request(app.getHttpServer());
      const res = await anon.get(`${API}/jobs?organizationId=${jobs.org.id}`);
      expect(res.status).toBe(200);
      const titles = res.body.data.items.map((j: { title: string }) => j.title).sort();
      expect(titles).toEqual(['HR Operations Lead', 'Senior Rust Engineer']);
      expect(res.body.data).toMatchObject({ page: 1, pageSize: 20, total: 2 });

      const remote = await anon.get(`${API}/jobs?organizationId=${jobs.org.id}&workMode=remote`);
      expect(remote.body.data.items).toHaveLength(1);
      const q = await anon.get(`${API}/jobs?q=rust`);
      expect(q.body.data.items.some((j: { id: string }) => j.id === jobs.weak.id)).toBe(true);
      const paged = await anon.get(`${API}/jobs?organizationId=${jobs.org.id}&pageSize=1&page=2`);
      expect(paged.body.data.items).toHaveLength(1);
      expect((await anon.get(`${API}/jobs?sort=password`)).status).toBe(400);

      expect((await anon.get(`${API}/jobs/${jobs.draft.id}`)).status).toBe(404);
      expect((await anon.get(`${API}/jobs/${jobs.closed.id}`)).status).toBe(200);
      const one = await anon.get(`${API}/jobs/${jobs.strong.id}`);
      expect(one.body.data).toMatchObject({ title: 'HR Operations Lead', postedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    });

    it('ranks matches without using personality, gender or photo', async () => {
      const { agent } = await signUp(app);
      await agent.post(`${API}/me/onboarding`).set('Origin', ORIGIN).send(PROFILE);
      const res = await agent.get(`${API}/me/job-matches`);
      const mine = res.body.data.items.filter((m: { job: { organizationId: string } }) => m.job.organizationId === jobs.org.id);
      expect(mine[0].job.id).toBe(jobs.strong.id);
      expect(mine[0].match.score).toBeGreaterThan(mine[1].match.score);

      const before = (await agent.get(`${API}/me/job-matches/${jobs.strong.id}`)).body.data.score;
      await agent.patch(`${API}/me/profile`).set('Origin', ORIGIN).send({ gender: 'male', personality: null, photoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
      const after = (await agent.get(`${API}/me/job-matches/${jobs.strong.id}`)).body.data.score;
      expect(after).toBe(before);
    });

    it('saves and unsaves jobs', async () => {
      const { agent } = await signUp(app);
      expect((await agent.put(`${API}/me/saved-jobs/${jobs.strong.id}`).set('Origin', ORIGIN)).body.data).toEqual({ saved: true });
      expect((await agent.get(`${API}/me/saved-jobs`)).body.data).toEqual([jobs.strong.id]);
      expect((await agent.delete(`${API}/me/saved-jobs/${jobs.strong.id}`).set('Origin', ORIGIN)).body.data).toEqual({ saved: false });
      expect((await agent.put(`${API}/me/saved-jobs/${jobs.draft.id}`).set('Origin', ORIGIN)).status).toBe(404);
    });

    it('applies once, rewards suitable applications, blocks closed jobs, and locks withdrawn applications', async () => {
      const { agent, userId } = await signUp(app);
      await agent.post(`${API}/me/onboarding`).set('Origin', ORIGIN).send(PROFILE);

      const apply = await agent.post(`${API}/jobs/${jobs.strong.id}/applications`).set('Origin', ORIGIN).send({ coverLetter: 'Hello' });
      expect(apply.status).toBe(201);
      expect(apply.body.data.application).toMatchObject({ jobId: jobs.strong.id, candidateId: userId, status: 'submitted' });
      expect(apply.body.data.xp.award).toBe(25);

      const unsuitable = await agent.post(`${API}/jobs/${jobs.weak.id}/applications`).set('Origin', ORIGIN).send({ coverLetter: '' });
      expect(unsuitable.status).toBe(201);
      expect(unsuitable.body.data.xp.award).toBe(0);

      const dup = await agent.post(`${API}/jobs/${jobs.strong.id}/applications`).set('Origin', ORIGIN).send({ coverLetter: 'Again' });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('CONFLICT');
      const closed = await agent.post(`${API}/jobs/${jobs.closed.id}/applications`).set('Origin', ORIGIN).send({ coverLetter: '' });
      expect(closed.status).toBe(409);
      expect(closed.body.error.code).toBe('NOT_ALLOWED_IN_STATE');
      expect((await agent.post(`${API}/jobs/${jobs.draft.id}/applications`).set('Origin', ORIGIN).send({ coverLetter: '' })).status).toBe(404);

      const list = await agent.get(`${API}/me/applications`);
      expect(list.body.data.total).toBe(2);

      const id = apply.body.data.application.id;
      const w = await agent.post(`${API}/me/applications/${id}/withdraw`).set('Origin', ORIGIN);
      expect(w.body.data.status).toBe('withdrawn');
      expect(w.body.data.history.map((h: { status: string }) => h.status)).toEqual(['submitted', 'withdrawn']);
      expect((await agent.post(`${API}/me/applications/${id}/withdraw`).set('Origin', ORIGIN)).status).toBe(409);

      const notes = await agent.get(`${API}/me/notifications?unread=true`);
      expect(notes.body.data.total).toBe(2);
      await agent.post(`${API}/me/notifications/read`).set('Origin', ORIGIN).send({ ids: 'all' });
      expect((await agent.get(`${API}/me/notifications?unread=true`)).body.data.total).toBe(0);

      // Another user cannot withdraw it.
      const other = await signUp(app);
      expect((await other.agent.post(`${API}/me/applications/${unsuitable.body.data.application.id}/withdraw`).set('Origin', ORIGIN)).status).toBe(404);
      expect((await agent.get(`${API}/me/interviews`)).body.data).toEqual([]);
    });
  });

  // ── Career ───────────────────────────────────────────────────────────────
  describe('career progress', () => {
    it('never sends challenge answers, scores on the server, and awards XP once per challenge', async () => {
      const { agent } = await signUp(app);
      const list = await agent.get(`${API}/career/challenges`);
      expect(list.body.data.length).toBe(8);
      const excel = list.body.data.find((c: { id: string }) => c.id === 'ch-excel');
      expect(excel.questions[0]).not.toHaveProperty('answer');
      expect(excel.questions[0]).not.toHaveProperty('explanation');

      expect((await agent.post(`${API}/career/challenges/ch-excel/attempts`).set('Origin', ORIGIN).send({ answers: [1] })).status).toBe(400);
      const fail = await agent.post(`${API}/career/challenges/ch-excel/attempts`).set('Origin', ORIGIN).send({ answers: [0, 0, 1] });
      expect(fail.body.data).toMatchObject({ score: 0, total: 3, xp: { award: 0 } });
      const pass = await agent.post(`${API}/career/challenges/ch-excel/attempts`).set('Origin', ORIGIN).send({ answers: [1, 1, 0] });
      expect(pass.body.data).toMatchObject({ score: 3, total: 3, xp: { award: 100 } });
      expect(pass.body.data.review[0]).toMatchObject({ correct: true, answer: 1 });
      const repeat = await agent.post(`${API}/career/challenges/ch-excel/attempts`).set('Origin', ORIGIN).send({ answers: [1, 1, 0] });
      expect(repeat.body.data.xp.award).toBe(0);
      expect((await agent.post(`${API}/career/challenges/nope/attempts`).set('Origin', ORIGIN).send({ answers: [] })).status).toBe(404);
    });

    it('validates the career assessment against its options', async () => {
      const { agent } = await signUp(app);
      const qs = (await agent.get(`${API}/career/assessment`)).body.data;
      expect(qs.map((q: { id: string }) => q.id)).toEqual(['motivation', 'goal', 'blocker']);
      const bad = await agent.post(`${API}/career/assessment`).set('Origin', ORIGIN).send({ answers: { motivation: 'Money' } });
      expect(bad.status).toBe(400);
      expect(Object.keys(bad.body.error.fields).sort()).toEqual(['blocker', 'goal', 'motivation']);
      const ok = await agent.post(`${API}/career/assessment`).set('Origin', ORIGIN).send({ answers: { motivation: 'Growth', goal: 'Team lead', blocker: 'Time' } });
      expect(ok.body.data.xp.award).toBe(75);
      const again = await agent.post(`${API}/career/assessment`).set('Origin', ORIGIN).send({ answers: { motivation: 'Impact', goal: 'Team lead', blocker: 'Time' } });
      expect(again.body.data.xp.award).toBe(0);
    });

    it('completes courses, evaluates and claims missions, unlocks achievements and totals XP', async () => {
      const { agent } = await signUp(app);
      // Course: 3 modules → complete only after the last one.
      const m0 = await agent.put(`${API}/me/courses/course-interview/modules/0`).set('Origin', ORIGIN);
      expect(m0.body.data).toEqual({ completed: false, xp: null });
      await agent.put(`${API}/me/courses/course-interview/modules/1`).set('Origin', ORIGIN);
      const m2 = await agent.put(`${API}/me/courses/course-interview/modules/2`).set('Origin', ORIGIN);
      expect(m2.body.data).toEqual({ completed: true, xp: { award: 200, reason: '+200 XP' } });
      expect((await agent.put(`${API}/me/courses/course-interview/modules/9`).set('Origin', ORIGIN)).status).toBe(404);
      const courses = (await agent.get(`${API}/career/courses`)).body.data;
      expect(courses.find((c: { id: string }) => c.id === 'course-interview').completedModules).toEqual([0, 1, 2]);

      // Mission "Sharpen a Skill" needs a passed challenge + a finished course.
      const notYet = await agent.post(`${API}/me/missions/mission-upskill/claim`).set('Origin', ORIGIN);
      expect(notYet.status).toBe(409);
      expect(notYet.body.error.code).toBe('NOT_ALLOWED_IN_STATE');
      await agent.post(`${API}/career/challenges/ch-design/attempts`).set('Origin', ORIGIN).send({ answers: [2] });
      const missions = (await agent.get(`${API}/career/missions`)).body.data;
      expect(missions.find((m: { id: string }) => m.id === 'mission-upskill').done).toEqual({ o1: true, o2: true });
      // Orientation "open" (default) includes the graduate and freelance missions.
      expect(missions.map((m: { id: string }) => m.id)).toContain('mission-graduate');

      const claim = await agent.post(`${API}/me/missions/mission-upskill/claim`).set('Origin', ORIGIN);
      expect(claim.body.data.xp.award).toBe(150);
      expect((await agent.post(`${API}/me/missions/mission-upskill/claim`).set('Origin', ORIGIN)).status).toBe(409);

      const sim = await agent.post(`${API}/career/interview-simulations`).set('Origin', ORIGIN).send({ role: 'Analyst', score: 80 });
      expect(sim.body.data.xp.award).toBe(100);
      const simAgain = await agent.post(`${API}/career/interview-simulations`).set('Origin', ORIGIN).send({ role: 'analyst ', score: 90 });
      expect(simAgain.body.data.xp.award).toBe(0);

      const progress = (await agent.get(`${API}/me/progress`)).body.data;
      expect(progress.progress.xp).toBe(200 + 100 + 150 + 100);
      expect(progress.progress).toMatchObject({ level: 3, xpIntoLevel: 250, xpForNextLevel: 300 });
      expect(progress.events).toHaveLength(4);

      const achievements = (await agent.get(`${API}/me/achievements`)).body.data;
      const unlocked = achievements.filter((a: { unlocked: boolean }) => a.unlocked).map((a: { id: string }) => a.id).sort();
      expect(unlocked).toEqual(['ach-500', 'ach-mission']);
    });
  });
});
