import type { Application, Interview, Job } from '@prisma/client';
import { isoDate } from '../common/pagination';

export function toApiJob(j: Job) {
  return {
    id: j.id,
    organizationId: j.organizationId,
    title: j.title,
    department: j.department,
    district: j.district,
    location: j.location,
    workMode: j.workMode,
    employmentType: j.employmentType,
    level: j.level,
    minYears: j.minYears,
    salaryMin: j.salaryMin,
    salaryMax: j.salaryMax,
    skills: j.skills,
    requiredQualifications: j.requiredQualifications,
    description: j.description,
    responsibilities: j.responsibilities,
    postedOn: isoDate(j.postedOn),
    closesOn: isoDate(j.closesOn),
    status: j.status,
  };
}

export type HistoryEntry = { status: string; at: string; note?: string };

export function toApiApplication(a: Application) {
  return {
    id: a.id,
    jobId: a.jobId,
    candidateId: a.candidateId,
    candidateName: a.candidateName,
    status: a.status,
    submittedAt: a.submittedAt.toISOString(),
    coverLetter: a.coverLetter,
    fitScore: a.fitScore,
    history: a.history as HistoryEntry[],
  };
}

export function toApiInterview(i: Interview) {
  return {
    id: i.id,
    applicationId: i.applicationId,
    jobId: i.jobId,
    candidateId: i.candidateId,
    candidateName: i.candidateName,
    scheduledAt: i.scheduledAt.toISOString(),
    durationMin: i.durationMin,
    format: i.format,
    interviewers: i.interviewers,
    status: i.status,
    notes: i.notes,
    scorecard: i.scorecard as { criterion: string; score: number }[],
  };
}
