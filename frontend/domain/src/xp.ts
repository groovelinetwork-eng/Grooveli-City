import type { CareerProgress, XpEvent, XpReason } from './types';

/**
 * Example XP values from S1 §9. Illustrative only — not an authoritative
 * production scoring formula. The backend owns real XP.
 */
export const XP_RULES: Record<XpReason, number> = {
  'profile-complete': 50,
  'cv-upload': 25,
  'career-assessment': 75,
  'skill-challenge': 100,
  'suitable-application': 25,
  'interview-simulation': 100,
  'course-complete': 200,
  'mission-complete': 0, // amount defined per mission
};

/** Rewards that can only be earned once. */
const ONCE: XpReason[] = ['profile-complete', 'cv-upload', 'career-assessment'];
/** Max XP-earning applications per day — never reward application spam (S1 §9). */
export const MAX_REWARDED_APPLICATIONS_PER_DAY = 3;

export interface XpDecision {
  award: number;
  reason: string;
}

export function decideXp(
  ledger: XpEvent[],
  reason: XpReason,
  opts: { at: string; ref?: string; amount?: number; suitable?: boolean },
): XpDecision {
  if (ONCE.includes(reason) && ledger.some((e) => e.reason === reason)) {
    return { award: 0, reason: 'Already rewarded once.' };
  }
  if (opts.ref && ledger.some((e) => e.reason === reason && e.ref === opts.ref)) {
    return { award: 0, reason: 'Already rewarded for this item.' };
  }
  if (reason === 'suitable-application') {
    if (!opts.suitable) return { award: 0, reason: 'No XP: this role is not a suitable match for your profile.' };
    const day = opts.at.slice(0, 10);
    const today = ledger.filter((e) => e.reason === 'suitable-application' && e.at.slice(0, 10) === day).length;
    if (today >= MAX_REWARDED_APPLICATIONS_PER_DAY) {
      return { award: 0, reason: `No XP: daily limit of ${MAX_REWARDED_APPLICATIONS_PER_DAY} rewarded applications reached.` };
    }
  }
  const award = opts.amount ?? XP_RULES[reason];
  return { award, reason: `+${award} XP` };
}

/** Level n requires 100·(n−1)·n/2 cumulative XP. */
export function xpForLevel(level: number): number {
  return (100 * (level - 1) * level) / 2;
}

export function progressFromXp(xp: number, reputationBase = 50): CareerProgress {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    xp,
    level,
    xpIntoLevel: xp - floor,
    xpForNextLevel: next - floor,
    reputation: Math.min(100, reputationBase + Math.floor(xp / 60)),
  };
}

export function totalXp(ledger: XpEvent[]): number {
  return ledger.reduce((a, e) => a + e.amount, 0);
}
