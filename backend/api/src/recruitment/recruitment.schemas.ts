import { z } from 'zod';
import { zIsoDate, PageQuery } from '../common/pagination';
import { zId } from '../common/zod';
import { zDistrict, zWorkMode } from '../orgs/org.schemas';

const text = (max: number) => z.string().trim().max(max);
export const zEmploymentType = z.enum(['full-time', 'part-time', 'contract', 'internship', 'freelance']);
export const zAppStatus = z.enum(['submitted', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']);
export const zJobStatus = z.enum(['draft', 'published', 'closed']);
const money = z.number().int().min(0).max(1_000_000_000);

export const JobInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    department: text(80),
    district: zDistrict,
    location: text(80),
    workMode: zWorkMode,
    employmentType: zEmploymentType,
    level: z.enum(['entry', 'mid', 'senior', 'lead']),
    minYears: z.number().int().min(0).max(40),
    salaryMin: money,
    salaryMax: money,
    skills: z.array(z.string().trim().min(1).max(60)).max(30),
    requiredQualifications: z.array(text(120)).max(20),
    description: text(10000),
    responsibilities: z.array(text(300)).max(30),
    closesOn: zIsoDate,
    status: zJobStatus,
  })
  .strict()
  .refine((j) => j.salaryMax >= j.salaryMin, { message: 'Must be at least salaryMin', path: ['salaryMax'] });
export type JobInput = z.infer<typeof JobInput>;

export const VacancyQuery = PageQuery.extend({ status: zJobStatus.optional(), q: z.string().trim().min(1).max(100).optional(), sort: z.string().max(20).optional() }).strict();
export const ApplicationsQuery = PageQuery.extend({ jobId: zId.optional(), status: zAppStatus.optional(), sort: z.string().max(20).optional() }).strict();
export const InterviewsQuery = z.object({ jobId: zId.optional(), from: zIsoDate.optional(), to: zIsoDate.optional() }).strict();
export const TalentQuery = PageQuery.extend({
  skills: z.string().max(300).optional(),
  location: z.string().trim().max(80).optional(),
  minYears: z.coerce.number().int().min(0).max(60).optional(),
  maxSalary: z.coerce.number().int().min(0).optional(),
  workMode: zWorkMode.optional(),
}).strict();
export const AnalyticsQuery = z.object({ from: zIsoDate.optional(), to: zIsoDate.optional() }).strict();

export const ApplicationStatusBody = z.object({ status: zAppStatus, note: text(1000).optional() }).strict();

const interviewFormat = z.enum(['video', 'onsite', 'phone', 'virtual-hq']);
const scorecard = z.array(z.object({ criterion: z.string().trim().min(1).max(80), score: z.number().int().min(1).max(5) }).strict()).max(20);
export const InterviewCreate = z
  .object({
    applicationId: zId,
    jobId: zId,
    candidateId: zId,
    candidateName: text(80),
    scheduledAt: z.string().datetime({ offset: true }),
    durationMin: z.number().int().min(10).max(480),
    format: interviewFormat,
    interviewers: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  })
  .strict();
export const InterviewPatch = z
  .object({
    status: z.enum(['scheduled', 'completed', 'cancelled']),
    notes: text(5000),
    scorecard,
    scheduledAt: z.string().datetime({ offset: true }),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field');

export const InviteTalentBody = z.object({ jobId: zId }).strict();
export const ShortlistQuery = z.object({ jobId: zId.optional() }).strict();
export const ShortlistCreate = z.object({ jobId: zId, name: z.string().trim().min(1).max(80), applicationIds: z.array(zId).max(200) }).strict();
export const AssessmentCreate = z
  .object({
    jobId: zId,
    title: z.string().trim().min(1).max(120),
    kind: z.enum(['skills-test', 'case-study', 'work-sample']),
    questions: z.array(z.string().trim().min(1).max(1000)).min(1).max(50),
  })
  .strict();
export const AssessmentResultBody = z.object({ applicationId: zId, score: z.number().int().min(0).max(100) }).strict();
