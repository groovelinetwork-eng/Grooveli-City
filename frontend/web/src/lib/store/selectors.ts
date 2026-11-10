'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  ACHIEVEMENTS,
  COURSES,
  EMPLOYEE_PERSONA_ID,
  can,
  candidateToMatchInput,
  getPersona,
  matchJob,
  moduleEnabled,
  progressFromXp,
  totalXp,
  type Achievement,
  type CandidateProfile,
  type Job,
  type MissionObjective,
  type OrgModule,
  type OrgRole,
  type Permission,
} from '@grooveli/frontend-domain';
import { useDemoStore } from './store';
import type { DemoState } from './state';

export const DEMO_CANDIDATE_ID = 'cand-demo';

export function useSession() {
  return useDemoStore((s) => s.session);
}

export function usePersona() {
  const session = useSession();
  return session ? getPersona(session.personaId) ?? null : null;
}

/** Roles of the current persona in the active organisation (UX only). */
export function rolesFor(state: DemoState): OrgRole[] {
  const session = state.session;
  if (!session || session.personaId === 'candidate') return [];
  const persona = getPersona(session.personaId);
  if (!persona) return [];
  // Org admin is admin of every workspace they belong to; others are Kestrel-only.
  if (session.personaId === 'org-admin') return ['org-admin'];
  if (session.activeOrganizationId !== 'kestrel-systems') return [];
  return persona.roles;
}

export function useRoles(): OrgRole[] {
  return useDemoStore(useShallow(rolesFor));
}

export function useCan(permission: Permission): boolean {
  const roles = useRoles();
  return can(roles, permission);
}

/** Organisations the current persona can switch between. */
export function membershipOrgIds(state: DemoState): string[] {
  const s = state.session;
  if (!s || s.personaId === 'candidate') return [];
  if (s.personaId === 'org-admin') {
    return state.workspaces.map((w) => w.organizationId);
  }
  return ['kestrel-systems'];
}

export function useActiveOrg() {
  return useDemoStore(
    useShallow((s) => {
      const id = s.session?.activeOrganizationId ?? null;
      return {
        organization: s.organizations.find((o) => o.id === id) ?? null,
        workspace: s.workspaces.find((w) => w.organizationId === id) ?? null,
      };
    }),
  );
}

export function useModuleEnabled(module: OrgModule): boolean {
  const { workspace } = useActiveOrg();
  const overrides = useDemoStore((s) => s.tierModules);
  return workspace ? moduleEnabled(workspace.tier, module, overrides) : false;
}

/** The employee record the "employee" persona (and other staff personas) map to. */
export function selfEmployeeId(state: DemoState): string | null {
  const s = state.session;
  if (!s || s.personaId === 'candidate') return null;
  if (s.activeOrganizationId !== 'kestrel-systems') return null;
  if (s.personaId === 'employee') return EMPLOYEE_PERSONA_ID;
  // Other staff personas map to the People & Finance head for self-service demos.
  return state.employees.find((e) => e.departmentId === 'dep-k-people')?.id ?? null;
}

export function useCareerProgress() {
  const xp = useDemoStore((s) => s.xp);
  return useMemo(() => progressFromXp(totalXp(xp)), [xp]);
}

export function useJobMatch(job: Job | undefined) {
  const candidate = useDemoStore((s) => s.candidate);
  return useMemo(() => (job ? matchJob(candidateToMatchInput(candidate), job) : null), [candidate, job]);
}

export function isProfileComplete(c: CandidateProfile): boolean {
  return (
    c.displayName.trim().length > 1 &&
    c.headline.trim().length > 3 &&
    c.summary.trim().length > 20 &&
    c.skills.length >= 3 &&
    c.experience.length >= 1 &&
    c.preferences.desiredRoles.length >= 1
  );
}

export function profileStrength(c: CandidateProfile): number {
  const checks = [
    c.displayName.trim().length > 1,
    c.headline.trim().length > 3,
    c.summary.trim().length > 20,
    c.skills.length >= 3,
    c.experience.length >= 1,
    c.education.length >= 1,
    c.certifications.length >= 1,
    !!c.cvFile,
    c.preferences.desiredRoles.length >= 1,
    !!c.photoDataUrl,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function candidateApplications(state: DemoState) {
  return state.applications.filter((a) => a.candidateId === DEMO_CANDIDATE_ID);
}

export function objectiveDone(state: DemoState, check: MissionObjective['check']): boolean {
  switch (check) {
    case 'profile-complete':
      return isProfileComplete(state.candidate);
    case 'cv-uploaded':
      return !!state.candidate.cvFile;
    case 'assessment-done':
      return state.assessmentDone;
    case 'applications-3':
      return candidateApplications(state).filter((a) => a.status !== 'withdrawn').length >= 3;
    case 'interview-sim-done':
      return state.interviewSims.length > 0;
    case 'skill-challenge-done':
      return state.challengeResults.some((r) => r.score / r.total >= 0.5);
    case 'course-done':
      return Object.keys(state.courseProgress).some((id) => isCourseComplete(state, id));
  }
}

export function isCourseComplete(state: DemoState, courseId: string): boolean {
  // Course module counts are fixed in fixtures; complete when all modules ticked.
  const done = state.courseProgress[courseId] ?? [];
  return done.length > 0 && done.length >= (COURSE_MODULE_COUNTS[courseId] ?? Infinity);
}

const COURSE_MODULE_COUNTS: Record<string, number> = Object.fromEntries(COURSES.map((c) => [c.id, c.modules.length]));

export function achievementUnlocked(state: DemoState, a: Achievement): boolean {
  const xp = totalXp(state.xp);
  switch (a.rule.type) {
    case 'xp':
      return xp >= a.rule.min;
    case 'applications':
      return candidateApplications(state).length >= a.rule.min;
    case 'missions':
      return state.missionsClaimed.length >= a.rule.min;
    case 'challenges':
      return new Set(state.challengeResults.filter((r) => r.score / r.total >= 0.5).map((r) => r.challengeId)).size >= a.rule.min;
    case 'profile-complete':
      return isProfileComplete(state.candidate);
  }
}

export function useAchievements() {
  const state = useDemoStore();
  return useMemo(() => ACHIEVEMENTS.map((a) => ({ ...a, unlocked: achievementUnlocked(state, a) })), [state]);
}
