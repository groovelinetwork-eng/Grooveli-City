import { HttpStatus, Injectable } from '@nestjs/common';
import { Announcement, Prisma, User } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { OrgContext } from '../auth/auth.decorators';
import { ApiError } from '../common/api-exception.filter';
import { PageQuery, isoDate, skipTake, toPage } from '../common/pagination';
import { env } from '../config/env';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';

type Actor = { user: User; ip?: string };
type Question = { id: string; text: string; kind: 'scale' | 'text' };
/** Anonymous results stay hidden until this many people have answered. */
const MIN_ANONYMOUS_RESPONSES = 5;
const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

@Injectable()
export class EngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  private manages(org: OrgContext) {
    return org.permissions.has('engagement.manage');
  }

  /** IDs are client-chosen for PUT-upserts; refuse an ID that belongs to another organisation. */
  private async assertOwnId(existing: { organizationId: string } | null, orgId: string) {
    if (existing && existing.organizationId !== orgId) throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'That ID is already in use');
  }

  // ── Announcements ────────────────────────────────────────────────────────
  private toApiAnnouncement = (a: Announcement) => ({
    id: a.id, organizationId: a.organizationId, title: a.title, body: a.body, author: a.author, publishedAt: a.publishedAt.toISOString(),
    audience: a.audience, ...(a.departmentId ? { departmentId: a.departmentId } : {}), pinned: a.pinned,
  });

  async announcements(org: OrgContext, page: PageQuery) {
    const orgId = org.organization.id;
    let departmentId: string | null = org.membership.departmentId;
    if (!departmentId && org.membership.employeeId) {
      departmentId = (await this.prisma.employee.findUnique({ where: { id: org.membership.employeeId }, select: { departmentId: true } }))?.departmentId ?? null;
    }
    const where: Prisma.AnnouncementWhereInput = {
      organizationId: orgId,
      ...(this.manages(org) ? {} : { OR: [{ audience: { in: ['all', 'public-hq'] } }, ...(departmentId ? [{ audience: 'department', departmentId }] : [])] }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.announcement.findMany({ where, orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }], ...skipTake(page) }),
      this.prisma.announcement.count({ where }),
    ]);
    return toPage(rows.map(this.toApiAnnouncement), total, page);
  }

  private async assertDepartment(orgId: string, input: { audience: string; departmentId?: string }) {
    if (input.audience !== 'department') return;
    if (!input.departmentId) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Choose a department', { departmentId: 'Required for department audience' });
    if (!(await this.prisma.department.findFirst({ where: { id: input.departmentId, organizationId: orgId } }))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Unknown department', { departmentId: 'Not a department of this organisation' });
    }
  }

  async createAnnouncement(orgId: string, input: { title: string; body: string; audience: string; departmentId?: string; pinned: boolean }, actor: Actor) {
    await this.assertDepartment(orgId, input);
    const a = await this.prisma.announcement.create({
      data: { ...input, departmentId: input.audience === 'department' ? input.departmentId : null, organizationId: orgId, authorId: actor.user.id, author: actor.user.displayName },
    });
    await this.audit.record({ action: 'announcement.published', targetType: 'announcement', targetId: a.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { audience: a.audience } });
    return this.toApiAnnouncement(a);
  }

  private async announcement(orgId: string, id: string) {
    const a = await this.prisma.announcement.findFirst({ where: { id, organizationId: orgId } });
    if (!a) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Announcement not found');
    return a;
  }

  async updateAnnouncement(orgId: string, id: string, input: { title: string; body: string; audience: string; departmentId?: string; pinned: boolean }, actor: Actor) {
    await this.announcement(orgId, id);
    await this.assertDepartment(orgId, input);
    const a = await this.prisma.announcement.update({ where: { id }, data: { ...input, departmentId: input.audience === 'department' ? input.departmentId : null } });
    await this.audit.record({ action: 'announcement.updated', targetType: 'announcement', targetId: id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return this.toApiAnnouncement(a);
  }

  async deleteAnnouncement(orgId: string, id: string, actor: Actor) {
    await this.announcement(orgId, id);
    await this.prisma.announcement.delete({ where: { id } });
    await this.audit.record({ action: 'announcement.deleted', targetType: 'announcement', targetId: id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
  }

  // ── Recognition ──────────────────────────────────────────────────────────
  async recognition(orgId: string, page: PageQuery) {
    const where = { organizationId: orgId };
    const [rows, total] = await Promise.all([
      this.prisma.recognition.findMany({ where, include: { _count: { select: { reactions: true } } }, orderBy: { at: 'desc' }, ...skipTake(page) }),
      this.prisma.recognition.count({ where }),
    ]);
    return toPage(
      rows.map((r) => ({ id: r.id, organizationId: r.organizationId, from: r.from, toEmployeeId: r.toEmployeeId, value: r.value, message: r.message, at: r.at.toISOString(), reactions: r._count.reactions })),
      total,
      page,
    );
  }

  async giveRecognition(org: OrgContext, input: { toEmployeeId: string; value: string; message: string }, actor: Actor) {
    const orgId = org.organization.id;
    if (org.membership.employeeId === input.toEmployeeId) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'You cannot recognise yourself');
    const to = await this.prisma.employee.findFirst({ where: { id: input.toEmployeeId, organizationId: orgId, status: { not: 'exited' } } });
    if (!to) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Unknown colleague', { toEmployeeId: 'Not an employee of this organisation' });
    const r = await this.prisma.recognition.create({ data: { ...input, organizationId: orgId, fromUserId: actor.user.id, from: actor.user.displayName } });
    if (to.userId) await this.notifications.notify(to.userId, { kind: 'workplace', title: 'You were recognised', body: `${actor.user.displayName}: ${input.value}`, href: '/org/engagement/recognition' });
    return { id: r.id, organizationId: orgId, from: r.from, toEmployeeId: r.toEmployeeId, value: r.value, message: r.message, at: r.at.toISOString(), reactions: 0 };
  }

  async react(orgId: string, recognitionId: string, userId: string) {
    const r = await this.prisma.recognition.findFirst({ where: { id: recognitionId, organizationId: orgId } });
    if (!r) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Recognition not found');
    await this.prisma.recognitionReaction.upsert({ where: { recognitionId_userId: { recognitionId, userId } }, create: { recognitionId, userId }, update: {} });
    return { reactions: await this.prisma.recognitionReaction.count({ where: { recognitionId } }) };
  }

  // ── Surveys ──────────────────────────────────────────────────────────────
  /** One-way marker: proves "this person answered" without being reversible to who. */
  private marker(surveyId: string, userId: string) {
    return createHmac('sha256', env().HASH_SECRET).update(`${surveyId}:${userId}`).digest('hex');
  }

  async surveys(org: OrgContext) {
    const orgId = org.organization.id;
    const userId = org.membership.userId;
    const surveys = await this.prisma.survey.findMany({
      where: { organizationId: orgId, ...(this.manages(org) ? {} : { status: { not: 'draft' } }) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const answered = new Set(
      (await this.prisma.surveyRespondent.findMany({ where: { surveyId: { in: surveys.map((s) => s.id) }, marker: { in: surveys.map((s) => this.marker(s.id, userId)) } } })).map((r) => r.surveyId),
    );
    return Promise.all(
      surveys.map(async (s) => ({
        id: s.id, organizationId: s.organizationId, title: s.title, status: s.status, anonymous: s.anonymous,
        questions: s.questions as Question[], closesOn: isoDate(s.closesOn), respondedByMe: answered.has(s.id),
        results: this.manages(org) ? await this.results(s.id, s.anonymous, s.questions as Question[]) : null,
      })),
    );
  }

  private async results(surveyId: string, anonymous: boolean, questions: Question[]) {
    const responses = await this.prisma.surveyResponse.findMany({ where: { surveyId }, select: { answers: true } });
    if (anonymous && responses.length < MIN_ANONYMOUS_RESPONSES) return null;
    const all = responses.map((r) => r.answers as Record<string, number | string>);
    return {
      responseCount: responses.length,
      questions: questions.map((q) => {
        const values = all.map((a) => a[q.id]).filter((v) => v !== undefined && v !== '');
        if (q.kind === 'scale') {
          const nums = values.filter((v): v is number => typeof v === 'number');
          const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
          for (const n of nums) distribution[String(n)] = (distribution[String(n)] ?? 0) + 1;
          return { questionId: q.id, average: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null, distribution };
        }
        // Shuffled so order can't be matched to submission time.
        const texts = values.filter((v): v is string => typeof v === 'string').sort(() => Math.random() - 0.5);
        return { questionId: q.id, average: null, textAnswers: texts };
      }),
    };
  }

  async upsertSurvey(org: OrgContext, surveyId: string, input: { title: string; status: string; anonymous: boolean; questions: Question[]; closesOn: string }, actor: Actor) {
    const orgId = org.organization.id;
    const existing = await this.prisma.survey.findUnique({ where: { id: surveyId } });
    await this.assertOwnId(existing, orgId);
    if (new Set(input.questions.map((q) => q.id)).size !== input.questions.length) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Question IDs must be unique', { questions: 'Duplicate question ID' });
    }
    if (existing) {
      const responses = await this.prisma.surveyResponse.count({ where: { surveyId } });
      const changed = JSON.stringify(existing.questions) !== JSON.stringify(input.questions) || existing.anonymous !== input.anonymous;
      if (responses && changed) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Questions and anonymity cannot change once people have answered');
    }
    const data = { title: input.title, status: input.status, anonymous: input.anonymous, questions: input.questions as Prisma.InputJsonValue, closesOn: toDate(input.closesOn) };
    await this.prisma.survey.upsert({ where: { id: surveyId }, create: { id: surveyId, organizationId: orgId, ...data }, update: data });
    await this.audit.record({ action: existing ? 'survey.updated' : 'survey.created', targetType: 'survey', targetId: surveyId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return (await this.surveys(org)).find((s) => s.id === surveyId)!;
  }

  async respond(org: OrgContext, surveyId: string, answers: Record<string, number | string>) {
    const survey = await this.prisma.survey.findFirst({ where: { id: surveyId, organizationId: org.organization.id } });
    if (!survey || survey.status === 'draft') throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Survey not found');
    if (survey.status !== 'open' || survey.closesOn < toDate(isoDate(new Date()))) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This survey is not open');

    const questions = survey.questions as Question[];
    const fields: Record<string, string> = {};
    for (const q of questions) {
      const v = answers[q.id];
      if (v === undefined) fields[q.id] = 'Required';
      else if (q.kind === 'scale' && (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5)) fields[q.id] = 'Answer 1–5';
      else if (q.kind === 'text' && typeof v !== 'string') fields[q.id] = 'Answer with text';
    }
    for (const k of Object.keys(answers)) if (!questions.some((q) => q.id === k)) fields[k] = 'Unknown question';
    if (Object.keys(fields).length) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Check your answers', fields);

    try {
      await this.prisma.$transaction([
        this.prisma.surveyRespondent.create({ data: { surveyId, marker: this.marker(surveyId, org.membership.userId) } }),
        this.prisma.surveyResponse.create({
          // Anonymous: random ID (cuid embeds a timestamp), no user, no time.
          data: { surveyId, answers, ...(survey.anonymous ? { id: randomUUID() } : { userId: org.membership.userId, at: new Date() }) },
        }),
      ]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'You have already answered this survey');
      throw err;
    }
  }

  // ── Feedback ─────────────────────────────────────────────────────────────
  async feedback(org: OrgContext, q: { status?: string; category?: string }, page: PageQuery) {
    const where: Prisma.FeedbackItemWhereInput = {
      organizationId: org.organization.id,
      ...(q.status ? { status: q.status } : {}),
      ...(q.category ? { category: q.category } : {}),
      // Participants see only their own named feedback.
      ...(this.manages(org) ? {} : { authorId: org.membership.userId }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.feedbackItem.findMany({ where, orderBy: { at: 'desc' }, ...skipTake(page) }),
      this.prisma.feedbackItem.count({ where }),
    ]);
    return toPage(
      rows.map((f) => ({
        id: f.id, organizationId: f.organizationId, category: f.category, body: f.body,
        // Anonymous items: day only, so time of day can't hint at the author.
        at: f.anonymous ? `${isoDate(f.at)}T00:00:00.000Z` : f.at.toISOString(),
        status: f.status, anonymous: f.anonymous, author: f.anonymous ? null : f.authorName,
      })),
      total,
      page,
    );
  }

  async submitFeedback(org: OrgContext, input: { category: string; body: string; anonymous: boolean }, actor: Actor) {
    const f = await this.prisma.feedbackItem.create({
      data: {
        organizationId: org.organization.id, category: input.category, body: input.body, anonymous: input.anonymous,
        ...(input.anonymous ? {} : { authorId: actor.user.id, authorName: actor.user.displayName }),
      },
    });
    return {
      id: f.id, organizationId: f.organizationId, category: f.category, body: f.body,
      at: f.anonymous ? `${isoDate(f.at)}T00:00:00.000Z` : f.at.toISOString(),
      status: f.status, anonymous: f.anonymous, author: f.anonymous ? null : f.authorName,
    };
  }

  async setFeedbackStatus(org: OrgContext, id: string, status: string, actor: Actor) {
    const f = await this.prisma.feedbackItem.findFirst({ where: { id, organizationId: org.organization.id } });
    if (!f) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Feedback not found');
    await this.prisma.feedbackItem.update({ where: { id }, data: { status } });
    await this.audit.record({ action: 'feedback.status_changed', targetType: 'feedback', targetId: id, actorId: actor.user.id, organizationId: org.organization.id, ip: actor.ip, details: { status } });
    if (!f.anonymous && f.authorId && f.authorId !== actor.user.id) {
      await this.notifications.notify(f.authorId, { kind: 'workplace', title: 'Feedback update', body: `Your feedback was marked ${status}.`, href: '/org/engagement/feedback' });
    }
    return (await this.feedback(org, {}, { page: 1, pageSize: 100 })).items.find((x) => x.id === id) ?? null;
  }

  // ── Activities ───────────────────────────────────────────────────────────
  private async activity(orgId: string, id: string) {
    const a = await this.prisma.teamActivity.findFirst({ where: { id, organizationId: orgId }, include: { rsvps: { select: { membershipId: true } } } });
    if (!a) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Activity not found');
    return { id: a.id, organizationId: a.organizationId, title: a.title, date: isoDate(a.date), location: a.location, kind: a.kind, rsvps: a.rsvps.map((r) => r.membershipId) };
  }

  async activities(orgId: string, q: { from?: string; to?: string }) {
    const rows = await this.prisma.teamActivity.findMany({
      where: { organizationId: orgId, ...(q.from || q.to ? { date: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } } : {}) },
      include: { rsvps: { select: { membershipId: true } } },
      orderBy: { date: 'asc' },
      take: 500,
    });
    return rows.map((a) => ({ id: a.id, organizationId: a.organizationId, title: a.title, date: isoDate(a.date), location: a.location, kind: a.kind, rsvps: a.rsvps.map((r) => r.membershipId) }));
  }

  async upsertActivity(orgId: string, id: string, input: { title: string; date: string; location: string; kind: string }, actor: Actor) {
    await this.assertOwnId(await this.prisma.teamActivity.findUnique({ where: { id } }), orgId);
    const data = { ...input, date: toDate(input.date) };
    await this.prisma.teamActivity.upsert({ where: { id }, create: { id, organizationId: orgId, ...data }, update: data });
    await this.audit.record({ action: 'activity.saved', targetType: 'activity', targetId: id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return this.activity(orgId, id);
  }

  async rsvp(org: OrgContext, id: string, attending: boolean) {
    const orgId = org.organization.id;
    const a = await this.activity(orgId, id);
    if (attending) {
      if (a.date < isoDate(new Date())) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This activity is in the past');
      await this.prisma.activityRsvp.upsert({ where: { activityId_membershipId: { activityId: id, membershipId: org.membership.id } }, create: { activityId: id, membershipId: org.membership.id }, update: {} });
    } else {
      await this.prisma.activityRsvp.deleteMany({ where: { activityId: id, membershipId: org.membership.id } });
    }
    return this.activity(orgId, id);
  }

  // ── Culture initiatives ──────────────────────────────────────────────────
  async initiatives(orgId: string) {
    const rows = await this.prisma.cultureInitiative.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'asc' }, take: 500 });
    return rows.map((i) => ({ id: i.id, organizationId: i.organizationId, title: i.title, owner: i.owner, progress: i.progress, status: i.status }));
  }

  async upsertInitiative(orgId: string, id: string, input: { title: string; owner: string; progress: number; status: string }, actor: Actor) {
    await this.assertOwnId(await this.prisma.cultureInitiative.findUnique({ where: { id } }), orgId);
    const i = await this.prisma.cultureInitiative.upsert({ where: { id }, create: { id, organizationId: orgId, ...input }, update: input });
    await this.audit.record({ action: 'initiative.saved', targetType: 'initiative', targetId: id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return { id: i.id, organizationId: i.organizationId, title: i.title, owner: i.owner, progress: i.progress, status: i.status };
  }
}
