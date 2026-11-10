import {
  COURSES,
  DEMO_TODAY,
  MISSIONS,
  SKILL_CHALLENGES,
  candidateToMatchInput,
  daysBetween,
  formatNaira,
  rankJobs,
  type AIMessage,
  type Job,
} from '@grooveli/frontend-domain';
import type { DemoState } from '../store/state';

/**
 * SIMULATED career assistant. Deterministic keyword rules over local demo
 * data — no language model, no inference, nothing leaves the browser.
 * Consequential actions (submitting applications) are only *prepared* here;
 * the UI must collect explicit confirmation (S1 §14).
 */
const STOP = new Set(['find', 'me', 'a', 'an', 'the', 'role', 'roles', 'job', 'jobs', 'for', 'with', 'and', 'in', 'any', 'some', 'show', 'remote', 'hybrid', 'onsite', 'opportunities', 'opportunity', 'please', 'i', 'want', 'looking', 'need', 'position', 'positions', 'work']);

export interface ParsedJobQuery {
  minSalary: number | null;
  workMode: Job['workMode'] | null;
  keywords: string[];
}

export function parseJobQuery(text: string): ParsedJobQuery {
  const lower = text.toLowerCase();
  const salary = lower.match(/(?:₦|ngn|n)?\s?(\d{1,4}(?:[.,]\d+)?)\s?(k|m)\b/);
  let minSalary: number | null = null;
  if (salary) {
    const n = parseFloat(salary[1]!.replace(',', '.'));
    minSalary = Math.round(salary[2] === 'm' ? n * 1_000_000 : n * 1_000);
  }
  const workMode = /\bremote\b/.test(lower) ? 'remote' : /\bhybrid\b/.test(lower) ? 'hybrid' : /\bon-?site\b/.test(lower) ? 'onsite' : null;
  const keywords = lower
    .replace(/(?:₦|ngn)?\s?\d+(?:[.,]\d+)?\s?[km]\+?/g, ' ')
    .split(/[^a-z+#.]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  return { minSalary, workMode, keywords };
}

function jobMatchesKeywords(job: Job, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const hay = `${job.title} ${job.department} ${job.skills.join(' ')}`.toLowerCase();
  return keywords.some((k) => hay.includes(k));
}

let counter = 0;
const msg = (text: string, extra: Partial<AIMessage> = {}): AIMessage => ({
  id: `ai-${Date.now().toString(36)}-${(counter++).toString(36)}`,
  role: 'assistant',
  text,
  at: new Date().toISOString(),
  ...extra,
});

export function lastSuggestedJobIds(thread: AIMessage[]): string[] {
  for (let i = thread.length - 1; i >= 0; i--) {
    const m = thread[i]!;
    if (m.role === 'assistant' && m.jobIds?.length) return m.jobIds;
  }
  return [];
}

export function respond(text: string, state: DemoState): AIMessage {
  const lower = text.toLowerCase().trim();
  const candidate = state.candidate;
  const input = candidateToMatchInput(candidate);
  const published = state.jobs.filter((j) => j.status === 'published');
  const myApps = state.applications.filter((a) => a.candidateId === candidate.id);
  const appliedIds = new Set(myApps.map((a) => a.jobId));

  // 1. Apply to best N from the last suggestion → prepare only, needs confirmation.
  const applyMatch = lower.match(/\bapply\b.*?\b(?:best|top)\s+(\d+|one|two|three|four|five)\b/) ?? (/\bapply\b/.test(lower) ? ['', '3'] : null);
  if (applyMatch) {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const n = Math.min(5, Number(applyMatch[1]) || words[applyMatch[1]!] || 3);
    const pool = lastSuggestedJobIds(state.aiThread).filter((id) => !appliedIds.has(id));
    if (pool.length === 0) {
      return msg('I need a shortlist first. Try "Find me a ₦300k+ remote HR role", then ask me to apply for the best ones.');
    }
    const ranked = rankJobs(input, published.filter((j) => pool.includes(j.id))).slice(0, n);
    const lines = ranked.map((r) => `• ${r.job.title} at ${orgName(state, r.job.organizationId)} — ${r.match.score}% fit`);
    return msg(
      `I've prepared ${ranked.length} application${ranked.length === 1 ? '' : 's'} with your profile and a tailored cover note:\n${lines.join('\n')}\n\nWould you like me to submit them? Nothing is sent until you confirm. (In this demo, submission is simulated — no employer receives it.)`,
      { pendingApplicationJobIds: ranked.map((r) => r.job.id) },
    );
  }

  // 2. Job search.
  if (/\b(find|search|look|show|recommend|match)\b/.test(lower) || /\b(job|role|opportunit)/.test(lower)) {
    const q = parseJobQuery(text);
    let pool = published.filter((j) => jobMatchesKeywords(j, q.keywords));
    if (q.workMode) pool = pool.filter((j) => j.workMode === q.workMode);
    if (q.minSalary) pool = pool.filter((j) => j.salaryMax >= q.minSalary!);
    if (pool.length === 0) {
      return msg(`I couldn't find openings for that in the current (synthetic) listings. Try broader keywords, a different work arrangement or a lower salary floor.`);
    }
    const ranked = rankJobs({ ...input, expectedSalary: q.minSalary ?? input.expectedSalary }, pool);
    const matching = ranked.filter((r) => r.match.score >= 55);
    const closingSoon = ranked.filter((r) => daysBetween(DEMO_TODAY, r.job.closesOn) <= 21);
    const gapSkill = mostCommon(ranked.flatMap((r) => r.match.missingSkills));
    const excellent = ranked.filter((r) => r.match.band === 'excellent');
    const parts = [
      `I found ${ranked.length} ${ranked.length === 1 ? 'opportunity' : 'opportunities'}${q.workMode ? ` (${q.workMode})` : ''}${q.minSalary ? ` paying up to at least ${formatNaira(q.minSalary, { compact: true })}/month` : ''}.`,
      `• ${matching.length} currently match your experience.`,
      closingSoon.length ? `• ${closingSoon.length} close within 3 weeks.` : null,
      gapSkill ? `• Several ask for stronger ${gapSkill}.` : null,
      excellent.length ? `• ${excellent.length} ${excellent.length === 1 ? 'is an excellent match' : 'are excellent matches'}.` : null,
      'Fit scores come from a transparent rule-based heuristic (skills + hard constraints), not AI.',
    ].filter(Boolean);
    return msg(parts.join('\n'), { jobIds: ranked.slice(0, 6).map((r) => r.job.id) });
  }

  // 3. Skill gaps / learning.
  if (/\b(skill|gap|learn|course|improve|upskill)\b/.test(lower)) {
    const ranked = rankJobs(input, published.filter((j) => jobMatchesKeywords(j, candidate.preferences.desiredRoles.map((r) => r.toLowerCase())))).slice(0, 8);
    const gaps = topN(ranked.flatMap((r) => r.match.missingSkills), 3);
    const courses = COURSES.filter((c) => gaps.includes(c.skill) || candidate.skills.some((s) => s.name === c.skill && s.level < 70)).slice(0, 3);
    const challenges = SKILL_CHALLENGES.filter((c) => gaps.includes(c.skill) || candidate.skills.some((s) => s.name === c.skill)).slice(0, 2);
    return msg(
      [
        gaps.length ? `Across roles you're targeting, the most common gaps are: ${gaps.join(', ')}.` : 'Your listed skills already cover most of your target roles.',
        courses.length ? `Suggested courses: ${courses.map((c) => `${c.title} (${c.hours}h)`).join(', ')}.` : null,
        challenges.length ? `Quick wins: ${challenges.map((c) => c.title).join(', ')} in Missions.` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  // 4. CV help.
  if (/\b(cv|resume|résumé)\b/.test(lower)) {
    const tips: string[] = [];
    if (!candidate.cvFile) tips.push('Attach a CV file in the CV section (+25 XP the first time).');
    if (candidate.summary.length < 120) tips.push('Expand your summary to 2–3 sentences focusing on outcomes.');
    if (candidate.experience.some((e) => !/\d/.test(e.summary))) tips.push('Add numbers to experience bullets (e.g. "hired 40+ roles/year").');
    if (candidate.certifications.length === 0) tips.push('List certifications — many listings check qualifications.');
    tips.push(`Lead with your strongest skills: ${candidate.skills.slice().sort((a, b) => b.level - a.level).slice(0, 3).map((s) => s.name).join(', ')}.`);
    return msg(`Here's what would strengthen your CV:\n${tips.map((t) => `• ${t}`).join('\n')}`);
  }

  // 5. Cover letter draft.
  if (/cover\s*letter/.test(lower)) {
    const target = published.find((j) => lower.includes(j.title.toLowerCase())) ?? published.find((j) => j.id === lastSuggestedJobIds(state.aiThread)[0]);
    const role = target ? `${target.title} role at ${orgName(state, target.organizationId)}` : 'role';
    return msg(
      `Draft cover note (template — edit before using):\n\nDear hiring team,\n\nI'm applying for the ${role}. Over ${candidate.yearsExperience} years I've built strengths in ${candidate.skills.slice(0, 3).map((s) => s.name).join(', ')}. ${candidate.experience[0] ? `Most recently as ${candidate.experience[0].title}, ${candidate.experience[0].summary.replace(/\.$/, '')}.` : ''} I'd welcome the chance to discuss how I can contribute.\n\nKind regards,\n${candidate.displayName}`,
    );
  }

  // 6. Interview practice.
  if (/\binterview/.test(lower)) {
    const upcoming = state.interviews.filter((i) => i.candidateId === candidate.id && i.status === 'scheduled');
    return msg(
      `${upcoming.length ? `You have ${upcoming.length} upcoming interview${upcoming.length === 1 ? '' : 's'} — see Interviews. ` : ''}Open Missions → Interview simulation to practise with structured STAR questions. Practice feedback is rule-based, not an AI assessment.`,
    );
  }

  // 7. Reminders / applications.
  if (/\b(remind|deadline|application|status|track)\b/.test(lower)) {
    const saved = published.filter((j) => state.savedJobIds.includes(j.id) && !appliedIds.has(j.id));
    const soon = saved.filter((j) => daysBetween(DEMO_TODAY, j.closesOn) <= 14);
    const awaiting = myApps.filter((a) => ['submitted', 'screening'].includes(a.status));
    return msg(
      [
        `You have ${myApps.length} application${myApps.length === 1 ? '' : 's'}; ${awaiting.length} awaiting updates.`,
        soon.length ? `Saved jobs closing within 2 weeks: ${soon.map((j) => j.title).join(', ')}.` : 'No saved jobs close in the next 2 weeks.',
        'Reminders are shown in Notifications (no email/SMS is sent in demo mode).',
      ].join('\n'),
    );
  }

  // 8. Greeting / summary.
  return msg(welcomeSummary(state));
}

export function welcomeSummary(state: DemoState): string {
  const c = state.candidate;
  const input = candidateToMatchInput(c);
  const matches = rankJobs(input, state.jobs.filter((j) => j.status === 'published')).filter((r) => r.match.score >= 65).length;
  const myApps = state.applications.filter((a) => a.candidateId === c.id);
  const awaiting = myApps.filter((a) => ['submitted', 'screening'].includes(a.status)).length;
  const interviews = state.interviews.filter((i) => i.candidateId === c.id && i.status === 'scheduled').length;
  const missions = MISSIONS.filter((m) => !state.missionsClaimed.includes(m.id) && (m.orientations === 'all' || m.orientations.includes(c.orientation))).length;
  return [
    `Welcome back, ${c.displayName.split(' ')[0]}.`,
    'You have:',
    `• ${matches} strong job matches`,
    `• ${awaiting} application${awaiting === 1 ? '' : 's'} awaiting updates`,
    `• ${interviews} upcoming interview${interviews === 1 ? '' : 's'}`,
    `• ${missions} recommended mission${missions === 1 ? '' : 's'}`,
    'What would you like to work on? Try: "Find me a ₦300k+ remote HR role", "What skills should I learn?", "Help with my CV", "Draft a cover letter".',
  ].join('\n');
}

function orgName(state: DemoState, id: string) {
  return state.organizations.find((o) => o.id === id)?.name ?? 'the employer';
}

function mostCommon(items: string[]): string | null {
  return topN(items, 1)[0] ?? null;
}

function topN(items: string[], n: number): string[] {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k]) => k);
}
