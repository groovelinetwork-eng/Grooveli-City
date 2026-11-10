import type { CandidateProfile, Job, TalentProfile, WorkMode, EmploymentType, SkillRating } from './types';

/**
 * SYNTHETIC explainable matching heuristic for UI demonstration.
 * Real ranking/semantic matching is backend-owned. Personality traits are
 * deliberately NOT an input (S2 §2) — the input type does not carry them.
 */
export interface MatchInput {
  skills: SkillRating[];
  yearsExperience: number;
  expectedSalary: number; // monthly NGN minimum acceptable
  workModes: WorkMode[];
  employmentTypes: EmploymentType[];
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
  score: number; // 0–100
  band: 'excellent' | 'good' | 'fair' | 'weak';
  constraints: ConstraintCheck[];
  matchedSkills: string[];
  missingSkills: string[];
  reasons: string[];
  gaps: string[];
}

const norm = (s: string) => s.trim().toLowerCase();
const naira = (n: number) => `NGN ${n.toLocaleString('en-NG')}`;

export function matchJob(input: MatchInput, job: Job): MatchResult {
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
      passed: job.requiredQualifications.every((q) => quals.some((have) => have.includes(norm(q)))),
      detail: job.requiredQualifications.length ? `Requires ${job.requiredQualifications.join(', ')}.` : 'No mandatory qualifications.',
    },
  ];
  if (input.locations && input.locations.length) {
    const ok =
      job.workMode === 'remote' ||
      input.locations.some((l) => job.location.toLowerCase().includes(l.toLowerCase()) || l.toLowerCase() === 'grooveli city');
    constraints.push({ key: 'location', label: 'Location', passed: ok, detail: `Job location: ${job.location}.` });
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

export function candidateToMatchInput(p: CandidateProfile): MatchInput {
  return {
    skills: p.skills,
    yearsExperience: p.yearsExperience,
    expectedSalary: p.preferences.minSalary,
    workModes: p.preferences.workModes,
    employmentTypes: p.preferences.employmentTypes,
    qualifications: [...p.certifications, ...p.education.map((e) => e.qualification)],
    locations: p.preferences.locations,
  };
}

export function talentToMatchInput(t: TalentProfile): MatchInput {
  return {
    skills: t.skills,
    yearsExperience: t.yearsExperience,
    expectedSalary: t.expectedSalary,
    workModes: t.workModes,
    employmentTypes: t.employmentTypes,
    qualifications: t.qualifications,
  };
}

/** Suitability threshold for XP-eligible applications (anti-spam). */
export const SUITABLE_MATCH_THRESHOLD = 55;

export function rankJobs(input: MatchInput, jobs: Job[]): { job: Job; match: MatchResult }[] {
  return jobs
    .map((job) => ({ job, match: matchJob(input, job) }))
    .sort((a, b) => b.match.score - a.match.score || a.job.id.localeCompare(b.job.id));
}
