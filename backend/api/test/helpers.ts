import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

export const ORIGIN = 'http://localhost:3000';

/** Boots the real app. `overrides` swaps providers (e.g. the Claude client) for tests. */
export async function createApp(overrides: { token: unknown; value: unknown }[] = []) {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const o of overrides) builder = builder.overrideProvider(o.token).useValue(o.value);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}

let n = 0;
/** A unique test email address (reserved .test domain). */
export const testEmail = (label = 'user') => `${label}.${Date.now()}.${++n}@example.test`;

/** A signed-in agent: requests keep the session cookie. */
export async function signUp(app: NestExpressApplication, opts: { name?: string; accountType?: 'candidate' | 'organization' } = {}) {
  const agent = request.agent(app.getHttpServer());
  const email = testEmail();
  const res = await agent
    .post('/api/v1/auth/signup')
    .set('Origin', ORIGIN)
    .send({ name: opts.name ?? 'Test Candidate', email, password: 'Test-Password-123', accountType: opts.accountType ?? 'candidate' });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, email, userId: res.body.data.user.id as string };
}

/** Creates an organisation with published jobs directly in the database (employer endpoints come in step 3). */
export async function seedOrgWithJobs(prisma: PrismaClient) {
  const org = await prisma.organization.create({ data: { name: `Test Org ${Date.now()}`, district: 'tech', industry: 'Software' } });
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const inDays = (d: number) => new Date(today.getTime() + d * 86_400_000);
  const base = {
    organizationId: org.id, department: 'Engineering', location: 'Lagos', employmentType: 'full-time', level: 'mid',
    requiredQualifications: [], description: 'Build things.', responsibilities: ['Ship'], postedOn: today, closesOn: inDays(30),
  };
  const [strong, weak, draft, closed] = await Promise.all([
    prisma.job.create({ data: { ...base, title: 'HR Operations Lead', district: 'corporate', workMode: 'remote', minYears: 3, salaryMin: 300_000, salaryMax: 600_000, skills: ['Recruitment', 'HR Operations', 'Excel'], status: 'published' } }),
    prisma.job.create({ data: { ...base, title: 'Senior Rust Engineer', district: 'tech', workMode: 'onsite', minYears: 10, salaryMin: 100_000, salaryMax: 150_000, skills: ['Rust', 'Kubernetes'], status: 'published' } }),
    prisma.job.create({ data: { ...base, title: 'Draft Role', district: 'tech', workMode: 'remote', minYears: 0, salaryMin: 1, salaryMax: 2, skills: [], status: 'draft' } }),
    prisma.job.create({ data: { ...base, title: 'Closed Role', district: 'tech', workMode: 'remote', minYears: 0, salaryMin: 1, salaryMax: 2, skills: [], status: 'closed' } }),
  ]);
  return { org, strong, weak, draft, closed };
}

export const PROFILE = {
  displayName: 'Ada Candidate',
  headline: 'HR Operations Specialist',
  location: 'Lagos',
  gender: 'female',
  yearsExperience: 5,
  orientation: 'employee',
  personality: { energy: 'balanced', thinking: 'analytical', workStyle: 'collaborative', outlook: 'adventurous', role: 'supporter' },
  avatar: { body: 1, skin: 2, hair: 1, hairColor: 0, outfit: 1, outfitColor: 2, accessory: 0 },
  photoDataUrl: null,
  summary: 'HR generalist with five years in recruitment and HR operations.',
  skills: [
    { name: 'Recruitment', level: 86 },
    { name: 'HR Operations', level: 80 },
    { name: 'Excel', level: 70 },
  ],
  certifications: ['CIPM Associate'],
  experience: [{ id: 'exp-1', title: 'HR Officer', company: 'Brightway', start: '2021-02', end: null, summary: 'Hiring for 40 roles a year.' }],
  education: [{ id: 'edu-1', school: 'University of Lagos', qualification: 'BSc Business Administration', year: '2020' }],
  preferences: { desiredRoles: ['HR'], locations: ['Lagos'], minSalary: 300_000, workModes: ['remote', 'hybrid'], employmentTypes: ['full-time'] },
  visibility: 'employers',
};

/** Minimal valid PDF. */
export const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
