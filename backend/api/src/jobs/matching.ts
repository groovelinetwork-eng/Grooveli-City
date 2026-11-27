import type { Job } from '@prisma/client';

/**
 * Explainable job matching. Inputs are skills, experience, salary, work
 * mode, employment type, qualifications and location ONLY. Personality
 * traits, gender and photos are deliberately absent from the input type and
 * can never influence a score.
 */
export interface MatchInput {
  skills: { name: string; level: number }[];
  yearsExperience: number;
  expectedSalary: number;
  workModes: string[];
  employmentTypes: string[];
  qualifications: string[];
  locations?: string[];
}

export interface ConstraintCheck {
  key: 'location' | 'salary' | 'experience' | 'employmentType' | 'qualifications' | 'workMode';
  label: string;
  passed: boolean;
  detail: string;
}

export interface MatchResult {
  score: number;
  band: 'excellent' | 'good' | 'fair' | 'weak';
  constraints: ConstraintCheck[];
  matchedSkills: string[];
  missingSkills: string[];
  reasons: string[];
  gaps: string[];
}

type MatchableJob = Pick<Job, 'skills' | 'workMode' | 'salaryMax' | 'minYears' | 'employmentType' | 'requiredQualifications' | 'location'>;

const norm = (s: string) => s.trim().toLowerCase();
const naira = (n: number) => `NGN ${n.toLocaleString('en-NG')}`;

export function matchJob(input: MatchInput, job: MatchableJob): MatchResult {
  const have = new Map(input.skills.map((s) => [norm(s.name), s.level]));
  const matchedSkills = job.skills.filter((s) => have.has(norm(s)));
  const missingSkills = job.skills.filter((s) => !have.has(norm(s)));
  const quals = input.qualifications.map(norm);

  const constraints: ConstraintCheck[] = [
    {
      key: 'workMode',
      label: 'Work arrangement',
      passed: input.workModes.length === 0 || input.workModes.includes(job.workMode),
      detail: `Job is ${job.workMode}; preference: ${input.workModes.join(', ') || 'any'}.`,
    },
    {
      key: 'salary',
      label: 'Salary',
      passed: job.salaryMax >= input.expectedSalary,
      detail: `Band up to ${naira(job.salaryMax)}/month vs minimum ${naira(input.expectedSalary)}.`,
    },
    {
      key: 'experience',
      label: 'Experience',
      passed: input.yearsExperience >= job.minYears,
      detail: `Requires ${job.minYears}+ years; has ${input.yearsExperience}.`,
    },
    {
      key: 'employmentType',
      label: 'Employment type',
      passed: input.employmentTypes.length === 0 || input.employmentTypes.includes(job.employmentType),
      detail: `Job is ${job.employmentType}.`,
    },
    {
      key: 'qualifications',
      label: 'Required qualifications',
      passed: job.requiredQualifications.every((q) => quals.some((h) => h.includes(norm(q)))),
      detail: job.requiredQualifications.length ? `Requires ${job.requiredQualifications.join(', ')}.` : 'No mandatory qualifications.',
    },
  ];
  if (input.locations && input.locations.length) {
    const passed =
      job.workMode === 'remote' ||
      input.locations.some((l) => job.location.toLowerCase().includes(l.toLowerCase()) || l.toLowerCase() === 'grooveli city');
    constraints.push({ key: 'location', label: 'Location', passed, detail: `Job location: ${job.location}.` });
  }

  const skillScore = job.skills.length
    ? matchedSkills.reduce((acc, s) => acc + Math.min(100, have.get(norm(s)) ?? 0), 0) / (job.skills.length * 100)
    : 0.5;
  const constraintScore = constraints.filter((c) => c.passed).length / constraints.length;
  const score = Math.round(skillScore * 60 + constraintScore * 40);
  const band: MatchResult['band'] = score >= 80 ? 'excellent' : score >= 65 ? 'good' : score >= 45 ? 'fair' : 'weak';

  const reasons: string[] = [];
  if (matchedSkills.length) reasons.push(`Matches ${matchedSkills.length}/${job.skills.length} listed skills: ${matchedSkills.join(', ')}.`);
  for (const c of constraints) if (c.passed) reasons.push(`${c.label}: ${c.detail}`);
  const gaps: string[] = [];
  if (missingSkills.length) gaps.push(`Skills to strengthen: ${missingSkills.join(', ')}.`);
  for (const c of constraints) if (!c.passed) gaps.push(`${c.label}: ${c.detail}`);
  const weak = matchedSkills.filter((s) => (have.get(norm(s)) ?? 0) < 60);
  if (weak.length) gaps.push(`Listed but below 60/100: ${weak.join(', ')}.`);

  return { score, band, constraints, matchedSkills, missingSkills, reasons, gaps };
}
