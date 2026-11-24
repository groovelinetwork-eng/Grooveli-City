import { HttpStatus, Injectable } from '@nestjs/common';
import { ApplicationStatus, Assessment, Prisma, Shortlist, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CandidateService } from '../candidate/candidate.service';
import { toMatchInput } from '../candidate/profile';
import { ApiError } from '../common/api-exception.filter';
import { PageQuery, isoDate, skipTake, todayUtc, toPage } from '../common/pagination';
import { HistoryEntry, toApiApplication, toApiInterview, toApiJob } from '../jobs/job.mapper';
import { matchJob } from '../jobs/matching';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { JobInput } from './recruitment.schemas';

type Actor = { user: User; ip?: string };

/** Allowed pipeline moves. Withdrawn, hired and rejected are final. */
const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ['screening', 'shortlisted', 'interview', 'rejected'],
  screening: ['shortlisted', 'interview', 'rejected'],
  shortlisted: ['screening', 'interview', 'offer', 'rejected'],
  interview: ['shortlisted', 'offer', 'rejected'],
  offer: ['hired', 'rejected'],
  hired: [],
  rejected: [],
  withdrawn: [],
};

const CANDIDATE_MESSAGES: Partial<Record<ApplicationStatus, string>> = {
  screening: 'is being reviewed',
  shortlisted: 'has been shortlisted',
  interview: 'has moved to interview',
  offer: 'has an offer',
  hired: 'was successful — congratulations',
  rejected: 'was not successful this time',
};

const VACANCY_SORT = new Set(['postedOn', 'closesOn', 'title', 'createdAt']);
const APPLICATION_SORT = new Set(['submittedAt', 'fitScore', 'updatedAt']);

function orderBy(sort: string | undefined, allowed: Set<string>, fallback: string) {
  const field = sort?.replace(/^-/, '') ?? fallback;
  if (!allowed.has(field)) {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', `sort must be one of ${[...allowed].join(', ')}`, { sort: 'Not sortable' });
  }
  return [{ [field]: sort && !sort.startsWith('-') ? 'asc' : 'desc' }, { id: 'asc' as const }];
}

const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

@Injectable()
export class RecruitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly candidates: CandidateService,
    private readonly storage: StorageService,
  ) {}

  // ── Lookups scoped to the organisation ───────────────────────────────────
  private async job(orgId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({ where: { id: jobId, organizationId: orgId } });
    if (!job) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Vacancy not found');
    return job;
  }

  private async application(orgId: string, applicationId: string) {
    const a = await this.prisma.application.findFirst({ where: { id: applicationId, job: { organizationId: orgId } }, include: { job: true } });
    if (!a) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Application not found');
    return a;
  }

  // ── Vacancies ────────────────────────────────────────────────────────────
  async vacancies(orgId: string, q: { status?: string; q?: string; sort?: string }, page: PageQuery) {
    const where: Prisma.JobWhereInput = {
      organizationId: orgId,
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { department: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.job.findMany({ where, orderBy: orderBy(q.sort, VACANCY_SORT, 'createdAt'), ...skipTake(page) }),
      this.prisma.job.count({ where }),
    ]);
    return toPage(rows.map(toApiJob), total, page);
  }

  private assertPublishable(closesOn: string) {
    if (toDate(closesOn) < todayUtc()) {
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Set a closing date today or later before publishing');
    }
  }

  async createVacancy(orgId: string, input: JobInput, actor: Actor) {
    if (input.status === 'closed') throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'New vacancies start as draft or published', { status: 'Use draft or published' });
    if (input.status === 'published') this.assertPublishable(input.closesOn);
    const job = await this.prisma.job.create({ data: { ...input, organizationId: orgId, closesOn: toDate(input.closesOn), postedOn: todayUtc() } });
    await this.audit.record({ action: 'vacancy.created', targetType: 'job', targetId: job.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { status: job.status } });
    return { jobId: job.id };
  }

  async replaceVacancy(orgId: string, jobId: string, input: JobInput, actor: Actor) {
    const existing = await this.job(orgId, jobId);
    if (existing.status === 'closed') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Closed vacancies cannot be edited; reopen it first');
    if (input.status !== existing.status) this.checkTransition(existing.status, input.status, await this.prisma.application.count({ where: { jobId } }));
    if (input.status === 'published') this.assertPublishable(input.closesOn);
    const job = await this.prisma.job.update({
      where: { id: jobId },
      data: { ...input, closesOn: toDate(input.closesOn), ...(existing.status === 'draft' && input.status === 'published' ? { postedOn: todayUtc() } : {}) },
    });
    await this.audit.record({ action: 'vacancy.updated', targetType: 'job', targetId: jobId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return toApiJob(job);
  }

  private checkTransition(from: string, to: string, applications: number) {
    const ok =
      (from === 'draft' && to === 'published') ||
      (from === 'published' && to === 'closed') ||
      (from === 'closed' && to === 'published') ||
      (from === 'published' && to === 'draft' && applications === 0);
    if (!ok) {
      const why = from === 'published' && to === 'draft' ? 'it already has applications; close it instead' : `${from} → ${to} is not allowed`;
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', `Cannot change this vacancy: ${why}`);
    }
  }

  async setVacancyStatus(orgId: string, jobId: string, status: 'draft' | 'published' | 'closed', actor: Actor) {
    const job = await this.job(orgId, jobId);
    if (job.status === status) return toApiJob(job);
    this.checkTransition(job.status, status, await this.prisma.application.count({ where: { jobId } }));
    if (status === 'published') this.assertPublishable(isoDate(job.closesOn));
    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: { status, ...(job.status === 'draft' && status === 'published' ? { postedOn: todayUtc() } : {}) },
    });
    await this.audit.record({ action: `vacancy.${status}`, targetType: 'job', targetId: jobId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return toApiJob(updated);
  }

  async deleteVacancy(orgId: string, jobId: string, actor: Actor) {
    const job = await this.job(orgId, jobId);
    const apps = await this.prisma.application.count({ where: { jobId } });
    if (job.status !== 'draft' || apps > 0) {
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Only drafts with no applications can be deleted; close the vacancy instead');
    }
    await this.prisma.job.delete({ where: { id: jobId } });
    await this.audit.record({ action: 'vacancy.deleted', targetType: 'job', targetId: jobId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { title: job.title } });
  }

  // ── Applications ─────────────────────────────────────────────────────────
  async applications(orgId: string, q: { jobId?: string; status?: string; sort?: string }, page: PageQuery) {
    const where: Prisma.ApplicationWhereInput = {
      job: { organizationId: orgId },
      ...(q.jobId ? { jobId: q.jobId } : {}),
      ...(q.status ? { status: q.status as ApplicationStatus } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({ where, orderBy: orderBy(q.sort, APPLICATION_SORT, 'submittedAt'), ...skipTake(page) }),
      this.prisma.application.count({ where }),
    ]);
    return toPage(rows.map(toApiApplication), total, page);
  }

  async applicantCv(orgId: string, applicationId: string, actor: Actor) {
    const a = await this.application(orgId, applicationId);
    const p = await this.prisma.candidateProfile.findUnique({ where: { userId: a.candidateId } });
    if (!p?.cvKey || !p.cvName || !p.cvAddedAt) return null;
    const { url } = await this.storage.downloadUrl(p.cvKey, p.cvName);
    await this.audit.record({ action: 'application.cv_viewed', targetType: 'application', targetId: a.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return { name: p.cvName, sizeKb: p.cvSizeKb ?? 0, addedAt: p.cvAddedAt.toISOString(), downloadUrl: url };
  }

  async setApplicationStatus(orgId: string, applicationId: string, status: ApplicationStatus, note: string | undefined, actor: Actor) {
    const a = await this.application(orgId, applicationId);
    if (status === a.status) return toApiApplication(a);
    if (!TRANSITIONS[a.status].includes(status)) {
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', a.status === 'withdrawn' ? 'The candidate withdrew this application' : `Cannot move from ${a.status} to ${status}`);
    }
    const history: HistoryEntry[] = [...(a.history as HistoryEntry[]), { status, at: new Date().toISOString(), ...(note ? { note } : {}) }];
    const { count } = await this.prisma.application.updateMany({ where: { id: a.id, status: a.status }, data: { status, history: history as Prisma.InputJsonValue } });
    if (count !== 1) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This application changed; reload and try again');
    if (status === 'rejected') await this.prisma.interview.updateMany({ where: { applicationId: a.id, status: 'scheduled' }, data: { status: 'cancelled' } });

    await this.audit.record({ action: 'application.status_changed', targetType: 'application', targetId: a.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { from: a.status, to: status } });
    const message = CANDIDATE_MESSAGES[status];
    if (message) {
      await this.notifications.notify(a.candidateId, { kind: 'application', title: 'Application update', body: `Your application for ${a.job.title} ${message}.`, href: '/app/applications' });
    }
    return toApiApplication(await this.prisma.application.findUniqueOrThrow({ where: { id: a.id } }));
  }

  // ── Interviews ───────────────────────────────────────────────────────────
  async interviews(orgId: string, q: { jobId?: string; from?: string; to?: string }) {
    const rows = await this.prisma.interview.findMany({
      where: {
        job: { organizationId: orgId },
        ...(q.jobId ? { jobId: q.jobId } : {}),
        ...(q.from || q.to ? { scheduledAt: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) } } : {}),
      },
      orderBy: { scheduledAt: 'asc' },
      take: 1000,
    });
    return rows.map(toApiInterview);
  }

  async scheduleInterview(
    orgId: string,
    input: { applicationId: string; jobId: string; candidateId: string; scheduledAt: string; durationMin: number; format: string; interviewers: string[] },
    actor: Actor,
  ) {
    const a = await this.application(orgId, input.applicationId);
    if (a.jobId !== input.jobId || a.candidateId !== input.candidateId) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'jobId and candidateId must match the application', { applicationId: 'Does not match jobId/candidateId' });
    }
    if (['withdrawn', 'rejected', 'hired'].includes(a.status)) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', `The application is ${a.status}`);
    const at = new Date(input.scheduledAt);
    if (at <= new Date()) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Schedule the interview in the future', { scheduledAt: 'Must be in the future' });

    const interview = await this.prisma.interview.create({
      data: {
        applicationId: a.id, jobId: a.jobId, candidateId: a.candidateId, candidateName: a.candidateName,
        scheduledAt: at, durationMin: input.durationMin, format: input.format, interviewers: input.interviewers,
      },
    });
    await this.audit.record({ action: 'interview.scheduled', targetType: 'interview', targetId: interview.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    await this.notifications.notify(a.candidateId, {
      kind: 'interview', title: 'Interview scheduled',
      body: `${a.job.title}: ${at.toISOString().slice(0, 16).replace('T', ' ')} UTC (${input.durationMin} min, ${input.format}).`,
      href: '/app/interviews',
    });
    return { interviewId: interview.id };
  }

  async updateInterview(orgId: string, interviewId: string, patch: { status?: 'scheduled' | 'completed' | 'cancelled'; notes?: string; scorecard?: unknown[]; scheduledAt?: string }, actor: Actor) {
    const i = await this.prisma.interview.findFirst({ where: { id: interviewId, job: { organizationId: orgId } }, include: { job: { select: { title: true } } } });
    if (!i) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Interview not found');
    if (patch.scheduledAt && new Date(patch.scheduledAt) <= new Date()) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Reschedule to a future time', { scheduledAt: 'Must be in the future' });
    }
    // A cancelled interview keeps its record; only notes can still change. Schedule a new one instead.
    if (i.status === 'cancelled' && (patch.status || patch.scheduledAt || patch.scorecard)) {
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This interview was cancelled; schedule a new one');
    }
    const updated = await this.prisma.interview.update({
      where: { id: i.id },
      data: {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.scorecard ? { scorecard: patch.scorecard as Prisma.InputJsonValue } : {}),
        ...(patch.scheduledAt ? { scheduledAt: new Date(patch.scheduledAt) } : {}),
      },
    });
    await this.audit.record({ action: 'interview.updated', targetType: 'interview', targetId: i.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { fields: Object.keys(patch) } });
    if (patch.status === 'cancelled' && i.status !== 'cancelled') {
      await this.notifications.notify(i.candidateId, { kind: 'interview', title: 'Interview cancelled', body: `Your interview for ${i.job.title} was cancelled.`, href: '/app/interviews' });
    } else if (patch.scheduledAt) {
      await this.notifications.notify(i.candidateId, { kind: 'interview', title: 'Interview rescheduled', body: `${i.job.title}: now ${patch.scheduledAt.slice(0, 16).replace('T', ' ')}.`, href: '/app/interviews' });
    }
    return toApiInterview(updated);
  }

  // ── Talent search ────────────────────────────────────────────────────────
  async talent(q: { skills?: string; location?: string; minYears?: number; maxSalary?: number; workMode?: string }, page: PageQuery) {
    const skills = (q.skills ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
    const and: Prisma.CandidateProfileWhereInput[] = [
      ...(q.maxSalary !== undefined ? [{ preferences: { path: ['minSalary'], lte: q.maxSalary } }] : []),
      ...(q.workMode ? [{ preferences: { path: ['workModes'], array_contains: [q.workMode] } }] : []),
      // Exact skill names (case-insensitive matching would need a search index; see README).
      ...skills.map((name) => ({ skills: { array_contains: [{ name }] } })),
    ];
    const where: Prisma.CandidateProfileWhereInput = {
      visibility: { in: ['public', 'employers'] },
      user: { deletedAt: null, onboardingComplete: true },
      ...(q.minYears !== undefined ? { yearsExperience: { gte: q.minYears } } : {}),
      ...(q.location ? { location: { contains: q.location, mode: 'insensitive' } } : {}),
      ...(and.length ? { AND: and } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.candidateProfile.findMany({ where, include: { user: { select: { displayName: true } } }, orderBy: [{ updatedAt: 'desc' }, { userId: 'asc' }], ...skipTake(page) }),
      this.prisma.candidateProfile.count({ where }),
    ]);
    // Deliberately no personality, gender, photo or email.
    return toPage(
      rows.map((p) => {
        const prefs = p.preferences as { minSalary?: number; workModes?: string[]; employmentTypes?: string[] };
        const education = p.education as { qualification: string }[];
        return {
          id: p.userId,
          name: p.user.displayName,
          headline: p.headline,
          location: p.location,
          yearsExperience: p.yearsExperience,
          skills: p.skills as { name: string; level: number }[],
          expectedSalary: prefs.minSalary ?? 0,
          workModes: prefs.workModes ?? [],
          employmentTypes: prefs.employmentTypes ?? [],
          qualifications: [...p.certifications, ...education.map((e) => e.qualification)],
          avatar: p.avatar,
        };
      }),
      total,
      page,
    );
  }

  async inviteTalent(orgId: string, talentId: string, jobId: string, actor: Actor) {
    const job = await this.job(orgId, jobId);
    if (job.status !== 'published' || job.closesOn < todayUtc()) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'The vacancy is not open');
    const profile = await this.prisma.candidateProfile.findFirst({
      where: { userId: talentId, visibility: { in: ['public', 'employers'] }, user: { deletedAt: null, onboardingComplete: true } },
      include: { user: { select: { displayName: true } } },
    });
    if (!profile) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Candidate not found');
    const fitScore = matchJob(toMatchInput(await this.candidates.getProfile(talentId)), job).score;
    let application;
    try {
      application = await this.prisma.application.create({
        data: {
          jobId, candidateId: talentId, candidateName: profile.user.displayName, fitScore, source: 'employer-invite',
          history: [{ status: 'submitted', at: new Date().toISOString(), note: 'Invited by the employer' }],
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'This candidate already applied');
      throw err;
    }
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } });
    await this.notifications.notify(talentId, {
      kind: 'application', title: `${org.name} invited you to apply`,
      body: `You were invited to ${job.title}. It is in your applications; withdraw it if you are not interested.`, href: '/app/applications',
    });
    await this.audit.record({ action: 'talent.invited', targetType: 'application', targetId: application.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return { application: toApiApplication(application) };
  }

  // ── Shortlists ───────────────────────────────────────────────────────────
  private toApiShortlist = (s: Shortlist) => ({ id: s.id, jobId: s.jobId, name: s.name, applicationIds: s.applicationIds });

  async shortlists(orgId: string, jobId?: string) {
    const rows = await this.prisma.shortlist.findMany({ where: { organizationId: orgId, ...(jobId ? { jobId } : {}) }, orderBy: { createdAt: 'asc' }, take: 500 });
    return rows.map(this.toApiShortlist);
  }

  private async assertApplicationsForJob(jobId: string, ids: string[]) {
    if (!ids.length) return;
    const found = await this.prisma.application.count({ where: { id: { in: ids }, jobId } });
    if (found !== new Set(ids).size) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Every application must belong to this vacancy', { applicationIds: 'Unknown application for this vacancy' });
    }
  }

  async createShortlist(orgId: string, input: { jobId: string; name: string; applicationIds: string[] }) {
    await this.job(orgId, input.jobId);
    await this.assertApplicationsForJob(input.jobId, input.applicationIds);
    const s = await this.prisma.shortlist.create({ data: { organizationId: orgId, jobId: input.jobId, name: input.name, applicationIds: [...new Set(input.applicationIds)] } });
    return this.toApiShortlist(s);
  }

  async shortlistMembership(orgId: string, shortlistId: string, applicationId: string, add: boolean) {
    const s = await this.prisma.shortlist.findFirst({ where: { id: shortlistId, organizationId: orgId } });
    if (!s) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Shortlist not found');
    if (add) await this.assertApplicationsForJob(s.jobId, [applicationId]);
    const ids = add ? [...new Set([...s.applicationIds, applicationId])] : s.applicationIds.filter((x) => x !== applicationId);
    return this.toApiShortlist(await this.prisma.shortlist.update({ where: { id: s.id }, data: { applicationIds: ids } }));
  }

  // ── Assessments ──────────────────────────────────────────────────────────
  private toApiAssessment = (a: Assessment) => ({
    id: a.id, jobId: a.jobId, title: a.title, kind: a.kind, questions: a.questions,
    results: (a.results as { applicationId: string; score: number; reviewer: string }[]).map(({ applicationId, score, reviewer }) => ({ applicationId, score, reviewer })),
  });

  async assessments(orgId: string, jobId?: string) {
    const rows = await this.prisma.assessment.findMany({ where: { organizationId: orgId, ...(jobId ? { jobId } : {}) }, orderBy: { createdAt: 'asc' }, take: 500 });
    return rows.map(this.toApiAssessment);
  }

  async createAssessment(orgId: string, input: { jobId: string; title: string; kind: string; questions: string[] }) {
    await this.job(orgId, input.jobId);
    return this.toApiAssessment(await this.prisma.assessment.create({ data: { ...input, organizationId: orgId } }));
  }

  async recordResult(orgId: string, assessmentId: string, applicationId: string, score: number, actor: Actor) {
    const a = await this.prisma.assessment.findFirst({ where: { id: assessmentId, organizationId: orgId } });
    if (!a) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Assessment not found');
    await this.assertApplicationsForJob(a.jobId, [applicationId]);
    const results = (a.results as { applicationId: string }[]).filter((r) => r.applicationId !== applicationId);
    results.push({ applicationId, score, reviewer: actor.user.displayName, reviewerId: actor.user.id, at: new Date().toISOString() } as never);
    const updated = await this.prisma.assessment.update({ where: { id: a.id }, data: { results: results as Prisma.InputJsonValue } });
    await this.audit.record({ action: 'assessment.result_recorded', targetType: 'application', targetId: applicationId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { assessmentId, score } });
    return this.toApiAssessment(updated);
  }

  // ── Analytics ────────────────────────────────────────────────────────────
  async analytics(orgId: string, q: { from?: string; to?: string }) {
    const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : new Date();
    const from = q.from ? toDate(q.from) : new Date(to.getTime() - 8 * 7 * 86_400_000);
    const range = { submittedAt: { gte: from, lte: to } };
    const [byStatus, byJob, vacancies, interviews, recent] = await Promise.all([
      this.prisma.application.groupBy({ by: ['status'], where: { job: { organizationId: orgId }, ...range }, _count: { _all: true } }),
      this.prisma.application.groupBy({ by: ['jobId'], where: { job: { organizationId: orgId }, ...range }, _count: { _all: true }, orderBy: { _count: { jobId: 'desc' } }, take: 10 }),
      this.prisma.job.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: { _all: true } }),
      this.prisma.interview.groupBy({ by: ['status'], where: { job: { organizationId: orgId }, scheduledAt: { gte: from, lte: to } }, _count: { _all: true } }),
      this.prisma.application.findMany({ where: { job: { organizationId: orgId }, ...range }, select: { submittedAt: true } }),
    ]);
    const titles = new Map((await this.prisma.job.findMany({ where: { id: { in: byJob.map((j) => j.jobId) } }, select: { id: true, title: true } })).map((j) => [j.id, j.title]));

    const weeks: { label: string; value: number }[] = [];
    for (let start = new Date(from); start <= to; start = new Date(start.getTime() + 7 * 86_400_000)) {
      const end = new Date(start.getTime() + 7 * 86_400_000);
      weeks.push({ label: isoDate(start), value: recent.filter((r) => r.submittedAt >= start && r.submittedAt < end).length });
    }
    const pipelineOrder: ApplicationStatus[] = ['submitted', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'];
    const count = (rows: { _count: { _all: number } }[]) => rows.reduce((a, r) => a + r._count._all, 0);
    const hired = byStatus.find((s) => s.status === 'hired')?._count._all ?? 0;
    const total = count(byStatus);
    return [
      { key: 'applications-by-status', label: 'Applications by stage', series: pipelineOrder.map((s) => ({ label: s, value: byStatus.find((r) => r.status === s)?._count._all ?? 0 })) },
      { key: 'applications-per-week', label: 'Applications per week', series: weeks },
      { key: 'top-vacancies', label: 'Applications per vacancy', series: byJob.map((j) => ({ label: titles.get(j.jobId) ?? j.jobId, value: j._count._all })) },
      { key: 'vacancies-by-status', label: 'Vacancies', series: (['draft', 'published', 'closed'] as const).map((s) => ({ label: s, value: vacancies.find((v) => v.status === s)?._count._all ?? 0 })) },
      { key: 'interviews-by-status', label: 'Interviews', series: (['scheduled', 'completed', 'cancelled'] as const).map((s) => ({ label: s, value: interviews.find((v) => v.status === s)?._count._all ?? 0 })) },
      { key: 'hire-rate', label: 'Hire rate (%)', series: [{ label: 'hired / applications', value: total ? Math.round((hired / total) * 1000) / 10 : 0 }] },
    ];
  }
}
