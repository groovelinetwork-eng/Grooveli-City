import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CandidateService } from '../candidate/candidate.service';
import { isProfileComplete } from '../candidate/profile';
import { ApiError } from '../common/api-exception.filter';
import { PageQuery, skipTake, toPage } from '../common/pagination';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { XpDecision, XpService, progressFromXp, toApiReason } from './xp.service';

type Question = { id: string; prompt: string; options: string[]; answer: number; explanation: string };
type Objective = { id: string; label: string; check: string };
const PASS_RATIO = 0.5;

@Injectable()
export class CareerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xp: XpService,
    private readonly candidates: CandidateService,
    private readonly notifications: NotificationService,
  ) {}

  // ── Progress ─────────────────────────────────────────────────────────────
  async progress(userId: string) {
    const [total, events] = await Promise.all([
      this.xp.totalXp(userId),
      this.prisma.xpEvent.findMany({ where: { userId }, orderBy: { at: 'desc' }, take: 50 }),
    ]);
    return {
      progress: progressFromXp(total),
      events: events.map((e) => ({ id: e.id, reason: toApiReason(e.reason), amount: e.amount, at: e.at.toISOString(), ...(e.ref ? { ref: e.ref } : {}) })),
    };
  }

  /** Facts that missions and achievements are evaluated against. */
  private async state(userId: string) {
    const [profile, assessment, apps, appsActive, sims, attempts, courseRows, courses, claims, xp] = await Promise.all([
      this.candidates.getProfile(userId),
      this.prisma.assessmentResponse.findUnique({ where: { userId }, select: { userId: true } }),
      this.prisma.application.count({ where: { candidateId: userId } }),
      this.prisma.application.count({ where: { candidateId: userId, status: { not: 'withdrawn' } } }),
      this.prisma.interviewSimulation.count({ where: { userId } }),
      this.prisma.challengeAttempt.findMany({ where: { userId }, select: { challengeId: true, score: true, total: true } }),
      this.prisma.courseModuleProgress.groupBy({ by: ['courseId'], where: { userId }, _count: { _all: true } }),
      this.prisma.contentCourse.findMany({ select: { id: true, modules: true } }),
      this.prisma.missionClaim.count({ where: { userId } }),
      this.xp.totalXp(userId),
    ]);
    const moduleCount = new Map(courses.map((c) => [c.id, c.modules.length]));
    const passed = new Set(attempts.filter((a) => a.score / a.total >= PASS_RATIO).map((a) => a.challengeId));
    return {
      profile,
      checks: {
        'profile-complete': isProfileComplete(profile),
        'cv-uploaded': !!profile.cvFile,
        'assessment-done': !!assessment,
        'applications-3': appsActive >= 3,
        'interview-sim-done': sims > 0,
        'skill-challenge-done': passed.size > 0,
        'course-done': courseRows.some((r) => (moduleCount.get(r.courseId) ?? Infinity) <= r._count._all),
      } as Record<string, boolean>,
      applications: apps,
      challengesPassed: passed.size,
      missionsClaimed: claims,
      xp,
    };
  }

  // ── Skill challenges ─────────────────────────────────────────────────────
  async challenges(district?: string) {
    const rows = await this.prisma.contentChallenge.findMany({
      where: { active: true, ...(district ? { district } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map((c) => ({
      id: c.id, title: c.title, skill: c.skill, district: c.district, xp: c.xp,
      questions: (c.questions as Question[]).map(({ id, prompt, options }) => ({ id, prompt, options })),
    }));
  }

  async attemptChallenge(userId: string, challengeId: string, answers: number[]) {
    const c = await this.prisma.contentChallenge.findFirst({ where: { id: challengeId, active: true } });
    if (!c) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Challenge not found');
    const questions = c.questions as Question[];
    if (answers.length !== questions.length) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', `Answer all ${questions.length} questions`, { answers: `Expected ${questions.length} answers` });
    }
    const review = questions.map((q, i) => ({ questionId: q.id, correct: answers[i] === q.answer, answer: q.answer, explanation: q.explanation }));
    const score = review.filter((r) => r.correct).length;
    await this.prisma.challengeAttempt.create({ data: { userId, challengeId, score, total: questions.length } });
    const xp: XpDecision =
      score / questions.length >= PASS_RATIO
        ? await this.xp.award(userId, 'skill-challenge', { ref: challengeId, amount: c.xp })
        : { award: 0, reason: `Score at least ${Math.ceil(questions.length * PASS_RATIO)}/${questions.length} to earn XP.` };
    return { score, total: questions.length, xp, review };
  }

  // ── Career assessment ────────────────────────────────────────────────────
  async assessmentQuestions() {
    const rows = await this.prisma.contentAssessmentQuestion.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    return rows.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options }));
  }

  async submitAssessment(userId: string, answers: Record<string, string>) {
    const questions = await this.assessmentQuestions();
    const fields: Record<string, string> = {};
    for (const q of questions) {
      if (!(q.id in answers)) fields[q.id] = 'Required';
      else if (!q.options.includes(answers[q.id]!)) fields[q.id] = 'Not one of the options';
    }
    for (const k of Object.keys(answers)) if (!questions.some((q) => q.id === k)) fields[k] = 'Unknown question';
    if (Object.keys(fields).length) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Check your answers', fields);

    await this.prisma.assessmentResponse.upsert({ where: { userId }, create: { userId, answers }, update: { answers } });
    return { xp: await this.xp.award(userId, 'career-assessment') };
  }

  // ── Interview simulation ─────────────────────────────────────────────────
  async recordInterviewSimulation(userId: string, role: string, score: number) {
    await this.prisma.interviewSimulation.create({ data: { userId, role, score } });
    // Once per role, so repeating the same simulation can't farm XP.
    return { xp: await this.xp.award(userId, 'interview-simulation', { ref: role.trim().toLowerCase().slice(0, 80) }) };
  }

  // ── Courses ──────────────────────────────────────────────────────────────
  async courses(userId: string) {
    const [courses, progress] = await Promise.all([
      this.prisma.contentCourse.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      this.prisma.courseModuleProgress.findMany({ where: { userId }, select: { courseId: true, moduleIndex: true } }),
    ]);
    return courses.map((c) => ({
      id: c.id, title: c.title, provider: c.provider, skill: c.skill, hours: c.hours, modules: c.modules, xp: c.xp,
      completedModules: progress.filter((p) => p.courseId === c.id).map((p) => p.moduleIndex).sort((a, b) => a - b),
    }));
  }

  private async course(courseId: string, moduleIndex: number) {
    const c = await this.prisma.contentCourse.findFirst({ where: { id: courseId, active: true } });
    if (!c || moduleIndex >= c.modules.length) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Course module not found');
    return c;
  }

  /** `completed` reports whether the whole course is now complete. */
  async completeModule(userId: string, courseId: string, moduleIndex: number) {
    const c = await this.course(courseId, moduleIndex);
    await this.prisma.courseModuleProgress.upsert({
      where: { userId_courseId_moduleIndex: { userId, courseId, moduleIndex } },
      create: { userId, courseId, moduleIndex },
      update: {},
    });
    const done = await this.prisma.courseModuleProgress.count({ where: { userId, courseId } });
    const completed = done >= c.modules.length;
    return { completed, xp: completed ? await this.xp.award(userId, 'course-complete', { ref: courseId, amount: c.xp }) : null };
  }

  async uncompleteModule(userId: string, courseId: string, moduleIndex: number) {
    await this.course(courseId, moduleIndex);
    await this.prisma.courseModuleProgress.deleteMany({ where: { userId, courseId, moduleIndex } });
    return { completed: false, xp: null };
  }

  // ── Missions ─────────────────────────────────────────────────────────────
  async missions(userId: string) {
    const [state, missions, claims] = await Promise.all([
      this.state(userId),
      this.prisma.contentMission.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      this.prisma.missionClaim.findMany({ where: { userId }, select: { missionId: true } }),
    ]);
    const claimed = new Set(claims.map((c) => c.missionId));
    return missions
      .filter((m) => m.orientations.length === 0 || m.orientations.includes(state.profile.orientation))
      .map((m) => {
        const objectives = m.objectives as Objective[];
        return {
          id: m.id, title: m.title, description: m.description, kind: m.kind, district: m.district,
          rewardXp: m.rewardXp, objectives, orientations: m.orientations.length ? m.orientations : 'all',
          done: Object.fromEntries(objectives.map((o) => [o.id, !!state.checks[o.check]])),
          claimed: claimed.has(m.id),
        };
      });
  }

  async claimMission(userId: string, missionId: string) {
    const mission = (await this.missions(userId)).find((m) => m.id === missionId);
    if (!mission) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Mission not found');
    if (mission.claimed) throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'Mission already claimed');
    if (!Object.values(mission.done).every(Boolean)) {
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Complete every objective before claiming');
    }
    try {
      await this.prisma.missionClaim.create({ data: { userId, missionId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'Mission already claimed');
      }
      throw err;
    }
    const xp = await this.xp.award(userId, 'mission-complete', { ref: missionId, amount: mission.rewardXp });
    await this.notifications.notify(userId, { kind: 'mission', title: 'Mission complete', body: `${mission.title}: +${xp.award} XP`, href: '/app/missions' });
    return { xp };
  }

  // ── Achievements ─────────────────────────────────────────────────────────
  async achievements(userId: string) {
    const [state, rows] = await Promise.all([
      this.state(userId),
      this.prisma.contentAchievement.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    ]);
    const unlocked = (type: string, min: number) => {
      switch (type) {
        case 'xp': return state.xp >= min;
        case 'applications': return state.applications >= min;
        case 'missions': return state.missionsClaimed >= min;
        case 'challenges': return state.challengesPassed >= min;
        case 'profile-complete': return state.checks['profile-complete']!;
        default: return false;
      }
    };
    return rows.map((a) => ({
      id: a.id, title: a.title, description: a.description, icon: a.icon,
      rule: { type: a.ruleType, ...(a.ruleMin !== null ? { min: a.ruleMin } : {}) },
      unlocked: unlocked(a.ruleType, a.ruleMin ?? 0),
    }));
  }

  // ── Notifications ────────────────────────────────────────────────────────
  async notificationsPage(userId: string, page: PageQuery, unread?: boolean) {
    const where: Prisma.NotificationWhereInput = { userId, ...(unread ? { readAt: null } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { at: 'desc' }, ...skipTake(page) }),
      this.prisma.notification.count({ where }),
    ]);
    return toPage(
      rows.map((n) => ({ id: n.id, at: n.at.toISOString(), title: n.title, body: n.body, ...(n.href ? { href: n.href } : {}), read: !!n.readAt, kind: n.kind })),
      total,
      page,
    );
  }

  async markRead(userId: string, ids: string[] | 'all') {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids === 'all' ? {} : { id: { in: ids } }) },
      data: { readAt: new Date() },
    });
  }
}
