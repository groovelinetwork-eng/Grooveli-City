import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { CandidateService } from '../candidate/candidate.service';
import { toMatchInput } from '../candidate/profile';
import { XpDecision, XpService, SUITABLE_MATCH_THRESHOLD } from '../career/xp.service';
import { ApiError } from '../common/api-exception.filter';
import { PageQuery, pageOf, skipTake, todayUtc, toPage } from '../common/pagination';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { HistoryEntry, toApiApplication, toApiInterview, toApiJob } from './job.mapper';
import { matchJob } from './matching';

export interface JobSearch {
  q?: string;
  district?: string;
  organizationId?: string;
  workMode?: string;
  employmentType?: string;
  level?: string;
  minSalary?: number;
  sort?: string;
}

const SORTABLE = new Set(['postedOn', 'closesOn', 'salaryMax', 'salaryMin', 'title']);
/** Jobs considered when ranking matches (newest first). */
const MATCH_POOL = 2000;
const FINAL: string[] = ['withdrawn', 'hired', 'rejected'];

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidates: CandidateService,
    private readonly xp: XpService,
    private readonly notifications: NotificationService,
  ) {}

  /** Published, not past its closing date, organisation not deleted. */
  private openWhere(): Prisma.JobWhereInput {
    return { status: 'published', closesOn: { gte: todayUtc() }, organization: { deletedAt: null } };
  }

  async search(s: JobSearch, page: PageQuery) {
    const where: Prisma.JobWhereInput = {
      ...this.openWhere(),
      ...(s.district ? { district: s.district } : {}),
      ...(s.organizationId ? { organizationId: s.organizationId } : {}),
      ...(s.workMode ? { workMode: s.workMode } : {}),
      ...(s.employmentType ? { employmentType: s.employmentType } : {}),
      ...(s.level ? { level: s.level } : {}),
      ...(s.minSalary !== undefined ? { salaryMax: { gte: s.minSalary } } : {}),
      ...(s.q
        ? {
            OR: [
              { title: { contains: s.q, mode: 'insensitive' } },
              { department: { contains: s.q, mode: 'insensitive' } },
              { skills: { hasSome: [s.q, s.q.toLowerCase(), s.q[0]!.toUpperCase() + s.q.slice(1).toLowerCase()] } },
              { organization: { name: { contains: s.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const sortField = s.sort?.replace(/^-/, '') ?? 'postedOn';
    if (!SORTABLE.has(sortField)) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', `sort must be one of ${[...SORTABLE].join(', ')}`, { sort: 'Not sortable' });
    }
    const direction = s.sort && !s.sort.startsWith('-') ? 'asc' : 'desc';
    const [rows, total] = await Promise.all([
      this.prisma.job.findMany({ where, orderBy: [{ [sortField]: direction }, { id: 'asc' }], ...skipTake(page) }),
      this.prisma.job.count({ where }),
    ]);
    return toPage(rows.map(toApiJob), total, page);
  }

  async getPublic(jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, status: { in: ['published', 'closed'] }, organization: { deletedAt: null } },
    });
    if (!job) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Job not found');
    return toApiJob(job);
  }

  // ── Matching ─────────────────────────────────────────────────────────────
  async matches(userId: string, page: PageQuery, minScore = 0) {
    const input = toMatchInput(await this.candidates.getProfile(userId));
    const jobs = await this.prisma.job.findMany({ where: this.openWhere(), orderBy: { postedOn: 'desc' }, take: MATCH_POOL });
    const ranked = jobs
      .map((job) => ({ job: toApiJob(job), match: matchJob(input, job) }))
      .filter((r) => r.match.score >= minScore)
      .sort((a, b) => b.match.score - a.match.score || a.job.id.localeCompare(b.job.id));
    return pageOf(ranked, page);
  }

  async matchOne(userId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({ where: { id: jobId, status: { in: ['published', 'closed'] } } });
    if (!job) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Job not found');
    return matchJob(toMatchInput(await this.candidates.getProfile(userId)), job);
  }

  // ── Saved jobs ───────────────────────────────────────────────────────────
  async savedIds(userId: string) {
    const rows = await this.prisma.savedJob.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 500 });
    return rows.map((r) => r.jobId);
  }

  async save(userId: string, jobId: string) {
    await this.getPublic(jobId);
    const count = await this.prisma.savedJob.count({ where: { userId } });
    if (count >= 500) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'You can save up to 500 jobs');
    await this.prisma.savedJob.upsert({ where: { userId_jobId: { userId, jobId } }, create: { userId, jobId }, update: {} });
    return { saved: true };
  }

  async unsave(userId: string, jobId: string) {
    await this.prisma.savedJob.deleteMany({ where: { userId, jobId } });
    return { saved: false };
  }

  // ── Applications ─────────────────────────────────────────────────────────
  async apply(user: User, jobId: string, coverLetter: string, source: 'candidate' | 'assistant' = 'candidate'): Promise<{ application: ReturnType<typeof toApiApplication>; xp: XpDecision }> {
    const job = await this.prisma.job.findFirst({ where: { id: jobId, organization: { deletedAt: null } } });
    if (!job || job.status === 'draft') throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Job not found');
    if (job.status !== 'published' || job.closesOn < todayUtc()) {
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This job is no longer accepting applications');
    }

    const match = matchJob(toMatchInput(await this.candidates.getProfile(user.id)), job);
    const now = new Date().toISOString();
    let application;
    try {
      application = await this.prisma.application.create({
        data: {
          jobId,
          candidateId: user.id,
          candidateName: user.displayName,
          coverLetter,
          fitScore: match.score,
          source,
          history: [{ status: 'submitted', at: now, ...(source === 'assistant' ? { note: 'Submitted after confirming an AI assistant suggestion' } : {}) }] satisfies HistoryEntry[],
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'You have already applied to this job');
      }
      throw err;
    }

    const xp = await this.xp.award(user.id, 'suitable-application', { ref: jobId, suitable: match.score >= SUITABLE_MATCH_THRESHOLD });
    await this.notifications.notify(user.id, {
      kind: 'application',
      title: 'Application sent',
      body: `Your application for ${job.title} was submitted.`,
      href: '/app/applications',
    });
    return { application: toApiApplication(application), xp };
  }

  async myApplications(userId: string, page: PageQuery, status?: string) {
    const where: Prisma.ApplicationWhereInput = { candidateId: userId, ...(status ? { status: status as never } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({ where, orderBy: { submittedAt: 'desc' }, ...skipTake(page) }),
      this.prisma.application.count({ where }),
    ]);
    return toPage(rows.map(toApiApplication), total, page);
  }

  async withdraw(userId: string, applicationId: string) {
    const a = await this.prisma.application.findFirst({ where: { id: applicationId, candidateId: userId } });
    if (!a) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Application not found');
    if (FINAL.includes(a.status)) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', `This application is already ${a.status}`);

    const history = [...(a.history as HistoryEntry[]), { status: 'withdrawn', at: new Date().toISOString() }];
    // Conditional update so a concurrent employer decision can't be overwritten.
    const { count } = await this.prisma.application.updateMany({
      where: { id: a.id, status: a.status },
      data: { status: 'withdrawn', history },
    });
    if (count !== 1) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This application changed; reload and try again');
    await this.prisma.interview.updateMany({ where: { applicationId: a.id, status: 'scheduled' }, data: { status: 'cancelled' } });
    return toApiApplication(await this.prisma.application.findUniqueOrThrow({ where: { id: a.id } }));
  }

  async myInterviews(userId: string, from?: string, to?: string) {
    const rows = await this.prisma.interview.findMany({
      where: {
        candidateId: userId,
        ...(from || to
          ? { scheduledAt: { ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } }
          : {}),
      },
      orderBy: { scheduledAt: 'asc' },
      take: 500,
    });
    return rows.map(toApiInterview);
  }
}
