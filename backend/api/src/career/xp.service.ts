import { Injectable } from '@nestjs/common';
import { Prisma, XpReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ApiXpReason =
  | 'profile-complete' | 'cv-upload' | 'career-assessment' | 'skill-challenge'
  | 'suitable-application' | 'interview-simulation' | 'course-complete' | 'mission-complete';

export interface XpDecision {
  award: number;
  reason: string;
}

/** Base XP per reason. Items with their own value (challenge, course, mission) pass `amount`. */
export const XP_RULES: Record<ApiXpReason, number> = {
  'profile-complete': 50,
  'cv-upload': 25,
  'career-assessment': 75,
  'skill-challenge': 100,
  'suitable-application': 25,
  'interview-simulation': 100,
  'course-complete': 200,
  'mission-complete': 0,
};

/** Awarded at most once per user. */
const ONCE: ApiXpReason[] = ['profile-complete', 'cv-upload', 'career-assessment'];
/** Applications that earn XP per day; application spam is never rewarded. */
export const MAX_REWARDED_APPLICATIONS_PER_DAY = 3;
/** Minimum match score for an application to count as "suitable". */
export const SUITABLE_MATCH_THRESHOLD = 55;

export const toDbReason = (r: ApiXpReason) => r.replace(/-/g, '_') as XpReason;
export const toApiReason = (r: XpReason) => r.replace(/_/g, '-') as ApiXpReason;

/** Level n needs 100·(n−1)·n/2 cumulative XP. */
export const xpForLevel = (level: number) => (100 * (level - 1) * level) / 2;

export function progressFromXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { xp, level, xpIntoLevel: xp - floor, xpForNextLevel: next - floor, reputation: Math.min(100, 50 + Math.floor(xp / 60)) };
}

/**
 * The only place XP is granted. Every award is written to the ledger;
 * once-only awards are protected by a unique index so concurrent requests
 * cannot double-award.
 */
@Injectable()
export class XpService {
  constructor(private readonly prisma: PrismaService) {}

  async award(
    userId: string,
    reason: ApiXpReason,
    opts: { ref?: string; amount?: number; suitable?: boolean } = {},
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<XpDecision> {
    const db = toDbReason(reason);

    if (reason === 'suitable-application') {
      if (!opts.suitable) return { award: 0, reason: 'No XP: this role is not a suitable match for your profile.' };
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      const today = await tx.xpEvent.count({ where: { userId, reason: db, at: { gte: since } } });
      if (today >= MAX_REWARDED_APPLICATIONS_PER_DAY) {
        return { award: 0, reason: `No XP: daily limit of ${MAX_REWARDED_APPLICATIONS_PER_DAY} rewarded applications reached.` };
      }
    }

    const dedupeKey = ONCE.includes(reason) ? reason : opts.ref ? `${reason}:${opts.ref}` : null;
    const amount = opts.amount ?? XP_RULES[reason];
    if (amount <= 0) return { award: 0, reason: 'No XP for this action.' };

    try {
      // A savepoint keeps a duplicate from aborting the caller's transaction.
      if (dedupeKey && tx !== this.prisma) {
        const existing = await tx.xpEvent.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey } } });
        if (existing) return this.already(reason);
      }
      await tx.xpEvent.create({ data: { userId, reason: db, amount, ref: opts.ref ?? null, dedupeKey } });
      return { award: amount, reason: `+${amount} XP` };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return this.already(reason);
      throw err;
    }
  }

  private already(reason: ApiXpReason): XpDecision {
    return { award: 0, reason: ONCE.includes(reason) ? 'Already rewarded once.' : 'Already rewarded for this item.' };
  }

  async totalXp(userId: string): Promise<number> {
    const agg = await this.prisma.xpEvent.aggregate({ where: { userId }, _sum: { amount: true } });
    return agg._sum.amount ?? 0;
  }
}
