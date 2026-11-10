/**
 * PRIVATE synthetic recruitment fixtures (talent pool, applicants, interviews).
 * Never imported by public.ts / frontend/city.
 */
import type { Application, ApplicationStatus, Assessment, EmploymentType, Interview, Shortlist, TalentProfile, WorkMode } from '../types';
import { createRng, addDays } from '../random';
import { DEMO_TODAY } from '../constants';
import { randomAvatar } from '../avatar';
import { JOBS } from './jobs';
import { FIRST_NAMES, LAST_NAMES } from './employees';

export const TALENT_POOL: TalentProfile[] = (() => {
  const rng = createRng(4242);
  const skillSets = [
    ['Node.js', 'TypeScript', 'PostgreSQL', 'APIs', 'Docker'],
    ['React', 'TypeScript', 'Testing', 'Accessibility', 'CSS'],
    ['Figma', 'UX research', 'Prototyping', 'Design systems'],
    ['SQL', 'Excel', 'Python', 'Dashboards', 'Statistics'],
    ['HR Operations', 'Recruitment', 'Excel', 'Payroll', 'Employee relations'],
    ['Kubernetes', 'AWS', 'Terraform', 'Observability', 'Linux'],
    ['Customer service', 'Communication', 'CRM', 'Sales'],
    ['Patient care', 'Triage', 'Clinical documentation'],
    ['Financial modelling', 'Excel', 'Reporting', 'Accounting'],
  ];
  const quals = [['BSc Computer Science'], ['BSc'], ['HND'], ['Nursing licence'], ['ICAN or ACCA'], []];
  const modes: WorkMode[][] = [['remote'], ['hybrid', 'remote'], ['onsite', 'hybrid'], ['onsite']];
  const types: EmploymentType[][] = [['full-time'], ['full-time', 'contract'], ['contract', 'freelance'], ['internship', 'full-time']];
  const used = new Set<string>();
  return Array.from({ length: 40 }, (_, i) => {
    const set = skillSets[i % skillSets.length]!;
    const yrs = rng.int(0, 10);
    const id = `talent-${String(i + 1).padStart(2, '0')}`;
    let name = '';
    do {
      name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    } while (used.has(name));
    used.add(name);
    return {
      id,
      name,
      headline: `${set[0]} professional · ${yrs} yrs`,
      location: rng.pick(['Grooveli City', 'Northgate', 'Remote', 'Harbourside']),
      yearsExperience: yrs,
      skills: set.slice(0, rng.int(2, set.length)).map((n) => ({ name: n, level: rng.int(45, 95) })),
      expectedSalary: Math.round((200_000 + yrs * 90_000 + rng.int(0, 200_000)) / 10_000) * 10_000,
      workModes: rng.pick(modes),
      employmentTypes: rng.pick(types),
      qualifications: rng.pick(quals),
      avatar: randomAvatar(id),
    };
  });
})();

export const SEED_APPLICATIONS: Application[] = (() => {
  const rng = createRng(777);
  const statuses: ApplicationStatus[] = ['submitted', 'submitted', 'screening', 'shortlisted', 'interview', 'interview', 'offer', 'rejected', 'hired'];
  const out: Application[] = [];
  const jobs = JOBS.filter((j) => j.organizationId === 'kestrel-systems' || j.organizationId === 'amberline-health');
  let n = 0;
  for (const job of jobs) {
    const count = rng.int(3, 7);
    for (let i = 0; i < count; i++) {
      const talent = TALENT_POOL[(n * 7 + i) % TALENT_POOL.length]!;
      n++;
      const status = rng.pick(statuses);
      const submittedAt = `${addDays(job.postedOn, rng.int(0, 2))}T10:00:00.000Z`;
      out.push({
        id: `app-seed-${n}`,
        jobId: job.id,
        candidateId: talent.id,
        candidateName: talent.name,
        status,
        submittedAt,
        coverLetter: 'Synthetic cover letter.',
        fitScore: rng.int(42, 94),
        history: [{ status: 'submitted', at: submittedAt }, ...(status !== 'submitted' ? [{ status, at: submittedAt }] : [])],
        simulated: true,
      });
    }
  }
  return out;
})();

export const SEED_INTERVIEWS: Interview[] = SEED_APPLICATIONS.filter((a) => a.status === 'interview')
  .slice(0, 8)
  .map((a, i) => ({
    id: `int-seed-${i + 1}`,
    applicationId: a.id,
    jobId: a.jobId,
    candidateId: a.candidateId,
    candidateName: a.candidateName,
    scheduledAt: `${addDays(DEMO_TODAY, i % 4)}T${String(9 + (i % 6)).padStart(2, '0')}:00:00.000Z`,
    durationMin: 45,
    format: (['video', 'onsite', 'virtual-hq', 'phone'] as const)[i % 4]!,
    interviewers: ['Zainab Bello', 'Kofi Asante'],
    status: 'scheduled' as const,
    notes: '',
    scorecard: [],
  }));

export const SEED_ASSESSMENTS: Assessment[] = [
  {
    id: 'asm-backend',
    jobId: 'job-k-backend',
    title: 'API design take-home',
    kind: 'work-sample',
    questions: ['Design a REST endpoint for paginated orders', 'Explain your error-handling strategy', 'How would you test it?'],
    results: SEED_APPLICATIONS.filter((a) => a.jobId === 'job-k-backend' && ['shortlisted', 'interview', 'offer'].includes(a.status))
      .slice(0, 3)
      .map((a, i) => ({ applicationId: a.id, score: [78, 64, 88][i]!, reviewer: 'Kofi Asante' })),
  },
  {
    id: 'asm-pd',
    jobId: 'job-k-pd',
    title: 'Portfolio case study review',
    kind: 'case-study',
    questions: ['Walk through a project end to end', 'What would you change in hindsight?'],
    results: [],
  },
  {
    id: 'asm-nurse',
    jobId: 'job-a-nurse',
    title: 'Clinical scenarios quiz',
    kind: 'skills-test',
    questions: ['Prioritise three triage scenarios', 'Medication safety checks'],
    results: [],
  },
];

export const SEED_SHORTLISTS: Shortlist[] = [
  {
    id: 'sl-backend',
    jobId: 'job-k-backend',
    name: 'Backend — final round',
    applicationIds: SEED_APPLICATIONS.filter((a) => a.jobId === 'job-k-backend' && ['shortlisted', 'interview'].includes(a.status)).map((a) => a.id),
  },
];
