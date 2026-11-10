import {
  MISSIONS,
  SKILL_CHALLENGES,
  COURSES,
  SUITABLE_MATCH_THRESHOLD,
  buildPayslipPreview,
  candidateToMatchInput,
  decideXp,
  getPersona,
  matchJob,
  randomAvatar,
  slugify,
  summarisePayslips,
  structureForBase,
  talentToMatchInput,
  TALENT_POOL,
  daysBetween,
  type AIMessage,
  type Application,
  type NotificationItem,
  type PayrollPreview,
  type XpDecision,
  type XpReason,
} from '@grooveli/frontend-domain';
import { config } from '../config';
import { useDemoStore, resetDemoData } from '../store/store';
import type { DemoState } from '../store/state';
import { DEMO_CANDIDATE_ID, isProfileComplete, objectiveDone } from '../store/selectors';
import { respond } from '../assistant/engine';
import { clearDemoCookie, writeDemoCookie } from '../auth/demo-session';
import type { DataService } from './contracts';

const delay = (ms: number = config.mockLatencyMs) =>
  ms > 0 && config.mockLatencyMs > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();
const now = () => new Date().toISOString();
let seq = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;

const get = () => useDemoStore.getState();
const set = (fn: (s: DemoState) => Partial<DemoState>) => useDemoStore.setState((s) => fn(s));

function notify(n: Omit<NotificationItem, 'id' | 'at' | 'read'>) {
  set((s) => ({ notifications: [{ ...n, id: uid('n'), at: now(), read: false }, ...s.notifications].slice(0, 100) }));
}

function awardXp(reason: XpReason, opts: { ref?: string; amount?: number; suitable?: boolean } = {}): XpDecision {
  const at = now();
  const decision = decideXp(get().xp, reason, { at, ...opts });
  if (decision.award > 0) {
    set((s) => ({ xp: [...s.xp, { id: uid('xp'), reason, amount: decision.award, at, ref: opts.ref }] }));
  }
  return decision;
}

function requireOrg(organizationId: string) {
  const ws = get().workspaces.find((w) => w.organizationId === organizationId);
  if (!ws) throw new Error('Organisation not found');
  return ws;
}

function submitApplication(jobId: string, coverLetter: string): { application: Application; xp: XpDecision } {
  const state = get();
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job || job.status !== 'published') throw new Error('This vacancy is not open for applications.');
  if (state.applications.some((a) => a.jobId === jobId && a.candidateId === DEMO_CANDIDATE_ID && a.status !== 'withdrawn')) {
    throw new Error('You have already applied to this job.');
  }
  const match = matchJob(candidateToMatchInput(state.candidate), job);
  const at = now();
  const application: Application = {
    id: uid('app'),
    jobId,
    candidateId: DEMO_CANDIDATE_ID,
    candidateName: state.candidate.displayName,
    status: 'submitted',
    submittedAt: at,
    coverLetter: coverLetter.slice(0, 4000),
    fitScore: match.score,
    history: [{ status: 'submitted', at }],
    simulated: true,
  };
  set((s) => ({ applications: [application, ...s.applications] }));
  const xp = awardXp('suitable-application', { ref: jobId, suitable: match.score >= SUITABLE_MATCH_THRESHOLD });
  notify({ kind: 'application', title: `Application recorded: ${job.title}`, body: 'Simulated submission — no employer has received it.', href: '/app/applications' });
  return { application, xp };
}

function threadPush(m: AIMessage) {
  set((s) => ({ aiThread: [...s.aiThread, m].slice(-80) }));
}

export const mockService: DataService = {
  auth: {
    async signInDemo(personaId, opts) {
      await delay();
      const persona = getPersona(personaId);
      if (!persona) throw new Error('Unknown persona');
      set((s) => ({
        session: {
          personaId,
          activeOrganizationId: personaId === 'candidate' ? null : 'kestrel-systems',
          signedInAt: now(),
        },
        candidate: personaId === 'candidate' && opts?.displayName ? { ...s.candidate, displayName: opts.displayName.slice(0, 60) } : s.candidate,
      }));
      writeDemoCookie(personaId);
      return { home: persona.home };
    },
    async signOut() {
      await delay(0);
      set(() => ({ session: null }));
      clearDemoCookie();
    },
    async switchOrganization(organizationId) {
      await delay();
      requireOrg(organizationId);
      set((s) => (s.session ? { session: { ...s.session, activeOrganizationId: organizationId } } : {}));
    },
  },

  candidate: {
    async completeOnboarding(profile) {
      await delay();
      set(() => ({ candidate: { ...profile, id: DEMO_CANDIDATE_ID }, candidateOnboarded: true }));
      const xp = isProfileComplete(get().candidate) ? awardXp('profile-complete') : { award: 0, reason: 'Complete your profile to earn XP.' };
      if (profile.cvFile) awardXp('cv-upload');
      notify({ kind: 'system', title: 'Profile created', body: 'Your avatar is ready — enter the city to explore.', href: '/app' });
      return { xp };
    },
    async updateProfile(patch) {
      await delay();
      set((s) => ({ candidate: { ...s.candidate, ...patch, id: DEMO_CANDIDATE_ID } }));
      return { xp: isProfileComplete(get().candidate) ? awardXp('profile-complete') : null };
    },
    async attachCv(meta) {
      await delay();
      set((s) => ({ candidate: { ...s.candidate, cvFile: { name: meta.name.slice(0, 120), sizeKb: meta.sizeKb, addedAt: now() } } }));
      return { xp: awardXp('cv-upload') };
    },
    async removeCv() {
      await delay();
      set((s) => ({ candidate: { ...s.candidate, cvFile: null } }));
    },
  },

  jobs: {
    async toggleSave(jobId) {
      await delay(0);
      const saved = !get().savedJobIds.includes(jobId);
      set((s) => ({ savedJobIds: saved ? [...s.savedJobIds, jobId] : s.savedJobIds.filter((id) => id !== jobId) }));
      return { saved };
    },
    async apply(jobId, input) {
      await delay();
      return submitApplication(jobId, input.coverLetter);
    },
    async withdraw(applicationId) {
      await delay();
      set((s) => ({
        applications: s.applications.map((a) =>
          a.id === applicationId && a.candidateId === DEMO_CANDIDATE_ID
            ? { ...a, status: 'withdrawn', history: [...a.history, { status: 'withdrawn', at: now() }] }
            : a,
        ),
      }));
    },
  },

  career: {
    async completeChallenge(challengeId, score, total) {
      await delay();
      const ch = SKILL_CHALLENGES.find((c) => c.id === challengeId);
      if (!ch) throw new Error('Unknown challenge');
      set((s) => ({ challengeResults: [...s.challengeResults, { challengeId, score, total, at: now() }] }));
      if (score / total < 0.5) return { xp: { award: 0, reason: 'Score at least 50% to earn XP — try again.' } };
      return { xp: awardXp('skill-challenge', { ref: challengeId, amount: ch.xp }) };
    },
    async completeAssessment(answers) {
      await delay();
      if (Object.keys(answers).length < 3) throw new Error('Please answer every question.');
      set(() => ({ assessmentDone: true }));
      return { xp: awardXp('career-assessment') };
    },
    async recordInterviewSimulation(role, score) {
      await delay();
      set((s) => ({ interviewSims: [...s.interviewSims, { at: now(), score, role }] }));
      return { xp: awardXp('interview-simulation', { ref: `${role}-${get().interviewSims.length}` }) };
    },
    async toggleCourseModule(courseId, moduleIndex) {
      await delay(0);
      const course = COURSES.find((c) => c.id === courseId);
      if (!course) throw new Error('Unknown course');
      set((s) => {
        const cur = s.courseProgress[courseId] ?? [];
        const next = cur.includes(moduleIndex) ? cur.filter((i) => i !== moduleIndex) : [...cur, moduleIndex];
        return { courseProgress: { ...s.courseProgress, [courseId]: next } };
      });
      const completed = (get().courseProgress[courseId] ?? []).length === course.modules.length;
      return { completed, xp: completed ? awardXp('course-complete', { ref: courseId, amount: course.xp }) : null };
    },
    async claimMission(missionId) {
      await delay();
      const mission = MISSIONS.find((m) => m.id === missionId);
      if (!mission) throw new Error('Unknown mission');
      const state = get();
      if (state.missionsClaimed.includes(missionId)) throw new Error('Mission already claimed.');
      if (!mission.objectives.every((o) => objectiveDone(state, o.check))) throw new Error('Complete every objective first.');
      set((s) => ({ missionsClaimed: [...s.missionsClaimed, missionId] }));
      notify({ kind: 'mission', title: `Mission complete: ${mission.title}`, body: `+${mission.rewardXp} XP`, href: '/app/missions' });
      return { xp: awardXp('mission-complete', { ref: missionId, amount: mission.rewardXp }) };
    },
    async markNotificationsRead(ids) {
      await delay(0);
      set((s) => ({ notifications: s.notifications.map((n) => (ids === 'all' || ids.includes(n.id) ? { ...n, read: true } : n)) }));
    },
  },

  assistant: {
    async send(text) {
      const clean = text.trim().slice(0, 500);
      if (!clean) throw new Error('Type a message first.');
      threadPush({ id: uid('u'), role: 'user', text: clean, at: now() });
      await delay(450);
      const reply = respond(clean, get());
      threadPush(reply);
      return reply;
    },
    async confirmApplications(jobIds) {
      await delay();
      const submitted: Application[] = [];
      for (const id of jobIds.slice(0, 5)) {
        try {
          const job = get().jobs.find((j) => j.id === id);
          submitted.push(
            submitApplication(id, `Prepared with the Grooveli assistant (simulated) for ${job?.title ?? 'this role'}.`).application,
          );
        } catch {
          /* already applied or closed — skip */
        }
      }
      threadPush({
        id: uid('ai'),
        role: 'assistant',
        text: submitted.length
          ? `Done — ${submitted.length} simulated application${submitted.length === 1 ? '' : 's'} recorded. Track them under Applications.`
          : 'Nothing was submitted (already applied or closed).',
        at: now(),
      });
      return { submitted };
    },
    async clear() {
      await delay(0);
      set(() => ({ aiThread: [] }));
    },
  },

  organizations: {
    async create(input) {
      await delay();
      const base = slugify(input.profile.name) || 'organisation';
      const existing = new Set(get().organizations.map((o) => o.id));
      let id = base;
      for (let i = 2; existing.has(id); i++) id = `${base}-${i}`;
      const locations = input.locations.map((l, i) => ({ ...l, id: `loc-${id}-${i + 1}` }));
      const departments = input.departments.map((d, i) => ({
        id: `dep-${id}-${i + 1}`,
        name: d.name,
        responsibilities: d.responsibilities,
        headEmployeeId: null,
        locationId: locations[0]?.id ?? null,
      }));
      const persona = getPersona(get().session?.personaId ?? 'org-admin');
      set((s) => ({
        organizations: [...s.organizations, { ...input.profile, id, verified: false, district: input.profile.district ?? 'corporate' }],
        workspaces: [
          ...s.workspaces,
          {
            organizationId: id,
            tier: input.tier,
            locations,
            departments,
            policies: input.policies.map((p, i) => ({ ...p, id: `pol-${id}-${i + 1}`, updatedAt: now().slice(0, 10), acknowledgements: 0 })),
            members: [
              { id: `mem-${id}-admin`, name: persona?.displayName ?? 'Founding admin', email: 'you@demo.example', roles: ['org-admin'], departmentId: null, recruitingFor: [], status: 'active' },
            ],
            invitations: input.invites.map((inv, i) => ({ id: `inv-${id}-${i + 1}`, email: inv.email, roles: inv.roles, sentAt: now(), status: 'pending' as const })),
            workflows: [],
            setupChecklist: {
              profile: true,
              culture: !!input.profile.culture.environment,
              policies: input.policies.length > 0,
              locations: locations.length > 0,
              invite: input.invites.length > 0,
              departments: departments.length > 0,
              roles: input.invites.some((i) => i.roles.length > 0),
              firstVacancy: false,
            },
          },
        ],
        session: s.session ? { ...s.session, activeOrganizationId: id } : s.session,
      }));
      notify({ kind: 'workplace', title: `${input.profile.name} created`, body: 'Invitations are simulated — no emails are sent.', href: '/org' });
      return { organizationId: id };
    },
    async updateProfile(organizationId, patch) {
      await delay();
      set((s) => ({ organizations: s.organizations.map((o) => (o.id === organizationId ? { ...o, ...patch, id: o.id } : o)) }));
    },
    async updateWorkspace(organizationId, patch) {
      await delay();
      requireOrg(organizationId);
      set((s) => ({ workspaces: s.workspaces.map((w) => (w.organizationId === organizationId ? { ...w, ...patch, organizationId } : w)) }));
    },
    async invite(organizationId, email, roles) {
      await delay();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
      if (roles.length === 0) throw new Error('Choose at least one role.');
      const ws = requireOrg(organizationId);
      if (ws.invitations.some((i) => i.email === email && i.status === 'pending')) throw new Error('An invitation is already pending for that email.');
      set((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.organizationId === organizationId
            ? { ...w, invitations: [...w.invitations, { id: uid('inv'), email, roles, sentAt: now(), status: 'pending' }], setupChecklist: { ...w.setupChecklist, invite: true, roles: true } }
            : w,
        ),
      }));
    },
    async revokeInvite(organizationId, invitationId) {
      await delay();
      set((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.organizationId === organizationId ? { ...w, invitations: w.invitations.map((i) => (i.id === invitationId ? { ...i, status: 'revoked' } : i)) } : w,
        ),
      }));
    },
    async setMemberRoles(organizationId, memberId, roles) {
      await delay();
      if (roles.length === 0) throw new Error('A member needs at least one role.');
      const ws = requireOrg(organizationId);
      const admins = ws.members.filter((m) => m.roles.includes('org-admin') && m.status === 'active');
      if (admins.length === 1 && admins[0]!.id === memberId && !roles.includes('org-admin')) {
        throw new Error('The organisation must keep at least one admin.');
      }
      set((s) => ({
        workspaces: s.workspaces.map((w) => (w.organizationId === organizationId ? { ...w, members: w.members.map((m) => (m.id === memberId ? { ...m, roles } : m)) } : w)),
      }));
    },
    async setMemberStatus(organizationId, memberId, status) {
      await delay();
      set((s) => ({
        workspaces: s.workspaces.map((w) => (w.organizationId === organizationId ? { ...w, members: w.members.map((m) => (m.id === memberId ? { ...m, status } : m)) } : w)),
      }));
    },
    async addDepartment(organizationId, dep) {
      await delay();
      if (!dep.name.trim()) throw new Error('Department name is required.');
      set((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.organizationId === organizationId ? { ...w, departments: [...w.departments, { ...dep, id: uid('dep') }], setupChecklist: { ...w.setupChecklist, departments: true } } : w,
        ),
      }));
    },
    async addLocation(organizationId, loc) {
      await delay();
      if (!loc.name.trim()) throw new Error('Location name is required.');
      set((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.organizationId === organizationId ? { ...w, locations: [...w.locations, { ...loc, id: uid('loc') }], setupChecklist: { ...w.setupChecklist, locations: true } } : w,
        ),
      }));
    },
    async setTier(organizationId, tier) {
      await delay();
      set((s) => ({ workspaces: s.workspaces.map((w) => (w.organizationId === organizationId ? { ...w, tier } : w)) }));
    },
    async setTierModules(tier, modules) {
      await delay();
      set((s) => ({ tierModules: { ...s.tierModules, [tier]: modules } }));
    },
  },

  recruitment: {
    async saveVacancy(job) {
      await delay();
      if (!job.title.trim()) throw new Error('Job title is required.');
      if (job.salaryMin > job.salaryMax) throw new Error('Minimum salary cannot exceed maximum.');
      const exists = get().jobs.some((j) => j.id === job.id);
      const id = exists ? job.id : `job-${slugify(job.title)}-${Date.now().toString(36)}`.slice(0, 64);
      set((s) => ({
        jobs: exists ? s.jobs.map((j) => (j.id === job.id ? job : j)) : [{ ...job, id }, ...s.jobs],
        workspaces:
          job.status === 'published'
            ? s.workspaces.map((w) => (w.organizationId === job.organizationId ? { ...w, setupChecklist: { ...w.setupChecklist, firstVacancy: true } } : w))
            : s.workspaces,
      }));
      return { jobId: id };
    },
    async setVacancyStatus(jobId, status) {
      await delay();
      set((s) => ({
        jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status } : j)),
        workspaces:
          status === 'published'
            ? s.workspaces.map((w) => (w.organizationId === s.jobs.find((j) => j.id === jobId)?.organizationId ? { ...w, setupChecklist: { ...w.setupChecklist, firstVacancy: true } } : w))
            : s.workspaces,
      }));
    },
    async moveApplication(applicationId, status, note) {
      await delay();
      const app = get().applications.find((a) => a.id === applicationId);
      if (!app) throw new Error('Application not found');
      if (app.status === 'withdrawn') throw new Error('The candidate withdrew this application.');
      set((s) => ({
        applications: s.applications.map((a) => (a.id === applicationId ? { ...a, status, history: [...a.history, { status, at: now(), note }] } : a)),
      }));
      if (app.candidateId === DEMO_CANDIDATE_ID) {
        const job = get().jobs.find((j) => j.id === app.jobId);
        notify({ kind: 'application', title: `Update: ${job?.title ?? 'application'}`, body: `Status changed to ${status} (simulated employer action).`, href: '/app/applications' });
      }
    },
    async scheduleInterview(input) {
      await delay();
      if (Number.isNaN(Date.parse(input.scheduledAt))) throw new Error('Choose a valid date and time.');
      const id = uid('int');
      set((s) => ({
        interviews: [...s.interviews, { ...input, id, status: 'scheduled', notes: '', scorecard: [] }],
        applications: s.applications.map((a) =>
          a.id === input.applicationId && a.status !== 'interview' ? { ...a, status: 'interview', history: [...a.history, { status: 'interview', at: now() }] } : a,
        ),
      }));
      if (input.candidateId === DEMO_CANDIDATE_ID) {
        notify({ kind: 'interview', title: 'Interview scheduled', body: `${new Date(input.scheduledAt).toUTCString()} · ${input.format}`, href: '/app/interviews' });
      }
      return { interviewId: id };
    },
    async updateInterview(id, patch) {
      await delay();
      set((s) => ({ interviews: s.interviews.map((i) => (i.id === id ? { ...i, ...patch, id } : i)) }));
    },
    async inviteTalent(talentId, jobId) {
      await delay();
      const talent = TALENT_POOL.find((t) => t.id === talentId);
      const job = get().jobs.find((j) => j.id === jobId);
      if (!talent || !job) throw new Error('Unknown candidate or job');
      if (get().applications.some((a) => a.candidateId === talentId && a.jobId === jobId)) throw new Error('This candidate is already in the pipeline.');
      const at = now();
      const application: Application = {
        id: uid('app'),
        jobId,
        candidateId: talentId,
        candidateName: talent.name,
        status: 'screening',
        submittedAt: at,
        coverLetter: 'Sourced by recruiter (simulated outreach — the candidate was not contacted).',
        fitScore: matchJob(talentToMatchInput(talent), job).score,
        history: [{ status: 'screening', at, note: 'Sourced' }],
        simulated: true,
      };
      set((s) => ({ applications: [application, ...s.applications] }));
      return { application };
    },
    async saveShortlist(jobId, name, applicationIds) {
      await delay();
      set((s) => ({ shortlists: [...s.shortlists, { id: uid('sl'), jobId, name: name || 'Shortlist', applicationIds }] }));
    },
    async toggleShortlist(shortlistId, applicationId) {
      await delay(0);
      set((s) => ({
        shortlists: s.shortlists.map((l) =>
          l.id === shortlistId
            ? { ...l, applicationIds: l.applicationIds.includes(applicationId) ? l.applicationIds.filter((a) => a !== applicationId) : [...l.applicationIds, applicationId] }
            : l,
        ),
      }));
    },
    async recordAssessment(assessmentId, applicationId, score, reviewer) {
      await delay();
      if (score < 0 || score > 100) throw new Error('Score must be between 0 and 100.');
      set((s) => ({
        assessments: s.assessments.map((a) =>
          a.id === assessmentId ? { ...a, results: [...a.results.filter((r) => r.applicationId !== applicationId), { applicationId, score, reviewer }] } : a,
        ),
      }));
    },
    async createAssessment(jobId, title, kind, questions) {
      await delay();
      if (!title.trim()) throw new Error('Title is required.');
      set((s) => ({ assessments: [...s.assessments, { id: uid('asm'), jobId, title, kind, questions: questions.filter(Boolean), results: [] }] }));
    },
  },

  hr: {
    async addEmployee(input) {
      await delay();
      if (!input.name.trim() || !input.title.trim()) throw new Error('Name and title are required.');
      const id = uid('emp');
      const structure = structureForBase(input.baseMonthly);
      set((s) => ({
        employees: [
          ...s.employees,
          {
            ...input,
            id,
            managerId: s.workspaces.find((w) => w.organizationId === input.organizationId)?.departments.find((d) => d.id === input.departmentId)?.headEmployeeId ?? null,
            status: 'onboarding',
            avatar: randomAvatar(id),
            publicDirectory: false,
            documents: [],
            emergencyContact: 'Not yet provided',
            lifecycleTasks: ['Contract signed', 'Laptop & equipment ordered', 'Accounts created', 'Buddy assigned', 'Policies acknowledged'].map((label, i) => ({
              id: `${id}-t${i + 1}`,
              phase: 'onboarding' as const,
              label,
              owner: ['HR', 'IT', 'IT', 'Manager', 'Employee'][i]!,
              done: false,
            })),
          },
        ],
        compensation: [
          ...s.compensation,
          { employeeId: id, structureId: structure.id, baseMonthly: input.baseMonthly, currency: 'NGN', effectiveFrom: input.startDate, bankOnFile: false, history: [{ date: input.startDate, baseMonthly: input.baseMonthly, reason: 'Starting salary' }] },
        ],
      }));
      return { employeeId: id };
    },
    async updateEmployee(id, patch) {
      await delay();
      set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, ...patch, id } : e)) }));
    },
    async startOffboarding(id, lastDay) {
      await delay();
      set((s) => ({
        employees: s.employees.map((e) =>
          e.id === id
            ? {
                ...e,
                status: 'offboarding',
                lifecycleTasks: [
                  ...e.lifecycleTasks.filter((t) => t.phase !== 'offboarding'),
                  ...['Resignation acknowledged', 'Knowledge handover', 'Equipment returned', 'Exit interview', `Final pay preview (last day ${lastDay})`].map((label, i) => ({
                    id: `${id}-off${i + 1}`,
                    phase: 'offboarding' as const,
                    label,
                    owner: ['HR', 'Manager', 'IT', 'HR', 'Payroll'][i]!,
                    done: false,
                  })),
                ],
              }
            : e,
        ),
      }));
    },
    async completeOffboarding(id) {
      await delay();
      const emp = get().employees.find((e) => e.id === id);
      if (!emp) throw new Error('Employee not found');
      if (emp.lifecycleTasks.some((t) => t.phase === 'offboarding' && !t.done)) throw new Error('Complete all offboarding tasks first.');
      set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, status: 'exited', publicDirectory: false } : e)) }));
    },
    async toggleLifecycleTask(employeeId, taskId) {
      await delay(0);
      set((s) => ({
        employees: s.employees.map((e) => {
          if (e.id !== employeeId) return e;
          const tasks = e.lifecycleTasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
          const onboardingDone = tasks.filter((t) => t.phase === 'onboarding').every((t) => t.done);
          return { ...e, lifecycleTasks: tasks, status: e.status === 'onboarding' && onboardingDone ? 'active' : e.status };
        }),
      }));
    },
    async addDocument(employeeId, meta) {
      await delay();
      set((s) => ({
        employees: s.employees.map((e) =>
          e.id === employeeId ? { ...e, documents: [...e.documents, { id: uid('doc'), name: meta.name.slice(0, 120), kind: meta.kind, sizeKb: meta.sizeKb, addedOn: now().slice(0, 10) }] } : e,
        ),
      }));
    },
    async requestLeave(input) {
      await delay();
      const days = daysBetween(input.start, input.end) + 1;
      if (days < 1) throw new Error('End date must be on or after the start date.');
      set((s) => ({ leave: [{ ...input, days, id: uid('leave'), status: 'pending' }, ...s.leave] }));
    },
    async decideLeave(id, decision, by) {
      await delay();
      set((s) => ({ leave: s.leave.map((l) => (l.id === id ? { ...l, status: decision, decidedBy: by } : l)) }));
    },
    async clockIn(employeeId, status) {
      await delay();
      const date = now().slice(0, 10);
      set((s) => ({
        attendance: [...s.attendance.filter((a) => !(a.employeeId === employeeId && a.date === date)), { employeeId, date, status, hours: 8 }],
      }));
    },
    async updateReview(id, patch) {
      await delay();
      if (patch.rating !== undefined && patch.rating !== null && (patch.rating < 1 || patch.rating > 5)) throw new Error('Rating must be 1–5.');
      set((s) => ({ reviews: s.reviews.map((r) => (r.id === id ? { ...r, ...patch, id } : r)) }));
    },
    async savePolicy(organizationId, policy) {
      await delay();
      if (!policy.title.trim()) throw new Error('Policy title is required.');
      set((s) => ({
        workspaces: s.workspaces.map((w) => {
          if (w.organizationId !== organizationId) return w;
          const exists = policy.id && w.policies.some((p) => p.id === policy.id);
          const updated = { ...policy, id: policy.id ?? uid('pol'), updatedAt: now().slice(0, 10) };
          return {
            ...w,
            policies: exists
              ? w.policies.map((p) => (p.id === policy.id ? { ...p, ...updated } : p))
              : [...w.policies, { ...updated, acknowledgements: 0 }],
          };
        }),
      }));
    },
    async acknowledgePolicy(policyId) {
      await delay();
      if (get().policyAcks.includes(policyId)) return;
      set((s) => ({
        policyAcks: [...s.policyAcks, policyId],
        workspaces: s.workspaces.map((w) => ({ ...w, policies: w.policies.map((p) => (p.id === policyId ? { ...p, acknowledgements: p.acknowledgements + 1 } : p)) })),
      }));
    },
  },

  payroll: {
    async updateCompensation(employeeId, baseMonthly, reason) {
      await delay();
      if (!(baseMonthly > 0)) throw new Error('Base salary must be positive.');
      const date = now().slice(0, 10);
      set((s) => ({
        compensation: s.compensation.map((c) =>
          c.employeeId === employeeId
            ? { ...c, baseMonthly, structureId: structureForBase(baseMonthly).id, effectiveFrom: date, history: [...c.history, { date, baseMonthly, reason: reason || 'Adjustment' }] }
            : c,
        ),
      }));
    },
    async savePayComponent(component) {
      await delay();
      if (!component.name.trim()) throw new Error('Name is required.');
      if (component.calc.value < 0) throw new Error('Value cannot be negative.');
      set((s) => ({
        payComponents: s.payComponents.some((c) => c.id === component.id)
          ? s.payComponents.map((c) => (c.id === component.id ? component : c))
          : [...s.payComponents, component],
      }));
    },
    async setStructureComponents(structureId, componentIds) {
      await delay();
      set((s) => ({ structures: s.structures.map((st) => (st.id === structureId ? { ...st, componentIds } : st)) }));
    },
    async preparePreview(organizationId, period, adjustments) {
      await delay(600);
      if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('Period must be YYYY-MM.');
      const state = get();
      const employees = state.employees.filter((e) => e.organizationId === organizationId && e.status !== 'exited');
      const payslips = employees.flatMap((employee) => {
        const record = state.compensation.find((c) => c.employeeId === employee.id);
        if (!record) return [];
        const structure = state.structures.find((st) => st.id === record.structureId) ?? structureForBase(record.baseMonthly);
        const proRata = employee.status === 'onboarding' && employee.startDate.slice(0, 7) === period ? Math.max(0, (30 - Number(employee.startDate.slice(8, 10)) + 1) / 30) : 1;
        return [buildPayslipPreview({ employee, record, structure, components: state.payComponents, adjustments, period, proRata })];
      });
      const preview: PayrollPreview = {
        id: uid('pr'),
        organizationId,
        period,
        createdAt: now(),
        status: 'draft',
        payslips,
        totals: summarisePayslips(payslips),
        simulated: true,
      };
      set((s) => ({ payrollRuns: [preview, ...s.payrollRuns.filter((r) => !(r.organizationId === organizationId && r.period === period && r.status === 'draft'))] }));
      return preview;
    },
    async approvePreview(id) {
      await delay();
      set((s) => ({ payrollRuns: s.payrollRuns.map((r) => (r.id === id ? { ...r, status: 'approved-preview' } : r)) }));
    },
    async discardPreview(id) {
      await delay();
      set((s) => ({ payrollRuns: s.payrollRuns.filter((r) => r.id !== id || r.status !== 'draft') }));
    },
  },

  engagement: {
    async publishAnnouncement(input) {
      await delay();
      if (!input.title.trim() || !input.body.trim()) throw new Error('Title and message are required.');
      set((s) => ({ announcements: [{ ...input, id: uid('ann'), publishedAt: now() }, ...s.announcements] }));
    },
    async deleteAnnouncement(id) {
      await delay();
      set((s) => ({ announcements: s.announcements.filter((a) => a.id !== id) }));
    },
    async giveRecognition(input) {
      await delay();
      if (!input.message.trim()) throw new Error('Add a message.');
      set((s) => ({ recognition: [{ ...input, id: uid('rec'), at: now(), reactions: 0 }, ...s.recognition] }));
    },
    async reactToRecognition(id) {
      await delay(0);
      set((s) => ({ recognition: s.recognition.map((r) => (r.id === id ? { ...r, reactions: r.reactions + 1 } : r)) }));
    },
    async saveSurvey(survey) {
      await delay();
      if (!survey.title.trim() || survey.questions.length === 0) throw new Error('A survey needs a title and at least one question.');
      set((s) => ({
        surveys: s.surveys.some((x) => x.id === survey.id)
          ? s.surveys.map((x) => (x.id === survey.id ? { ...x, ...survey } : x))
          : [{ ...survey, responses: [] }, ...s.surveys],
      }));
    },
    async respondToSurvey(surveyId, answers) {
      await delay();
      const survey = get().surveys.find((x) => x.id === surveyId);
      if (!survey || survey.status !== 'open') throw new Error('This survey is not open.');
      set((s) => ({ surveys: s.surveys.map((x) => (x.id === surveyId ? { ...x, responses: [...x.responses, { at: now(), answers }] } : x)) }));
    },
    async submitFeedback(input) {
      await delay();
      if (input.body.trim().length < 5) throw new Error('Please write a little more.');
      set((s) => ({ feedback: [{ ...input, id: uid('fb'), at: now(), status: 'new' }, ...s.feedback] }));
    },
    async setFeedbackStatus(id, status) {
      await delay();
      set((s) => ({ feedback: s.feedback.map((f) => (f.id === id ? { ...f, status } : f)) }));
    },
    async saveActivity(activity) {
      await delay();
      if (!activity.title.trim()) throw new Error('Title is required.');
      set((s) => ({
        activities: s.activities.some((a) => a.id === activity.id)
          ? s.activities.map((a) => (a.id === activity.id ? { ...a, ...activity, rsvps: activity.rsvps ?? a.rsvps } : a))
          : [...s.activities, { ...activity, rsvps: activity.rsvps ?? [] }],
      }));
    },
    async toggleActivityRsvp(activityId, employeeId) {
      await delay(0);
      set((s) => ({
        activities: s.activities.map((a) =>
          a.id === activityId ? { ...a, rsvps: a.rsvps.includes(employeeId) ? a.rsvps.filter((r) => r !== employeeId) : [...a.rsvps, employeeId] } : a,
        ),
      }));
    },
    async saveInitiative(initiative) {
      await delay();
      set((s) => ({
        initiatives: s.initiatives.some((i) => i.id === initiative.id)
          ? s.initiatives.map((i) => (i.id === initiative.id ? initiative : i))
          : [...s.initiatives, initiative],
      }));
    },
  },

  social: {
    async toggleRsvp(eventId) {
      await delay();
      const attending = !get().rsvps.includes(eventId);
      set((s) => ({
        rsvps: attending ? [...s.rsvps, eventId] : s.rsvps.filter((e) => e !== eventId),
        events: s.events.map((e) => (e.id === eventId ? { ...e, attendeeCount: e.attendeeCount + (attending ? 1 : -1) } : e)),
      }));
      return { attending };
    },
    async toggleCommunity(communityId) {
      await delay();
      const joined = !get().joinedCommunities.includes(communityId);
      set((s) => ({
        joinedCommunities: joined ? [...s.joinedCommunities, communityId] : s.joinedCommunities.filter((c) => c !== communityId),
        communities: s.communities.map((c) => (c.id === communityId ? { ...c, members: c.members + (joined ? 1 : -1) } : c)),
      }));
      return { joined };
    },
    async postToCommunity(communityId, text) {
      await delay();
      const clean = text.trim().slice(0, 600);
      if (!clean) throw new Error('Write something first.');
      if (!get().joinedCommunities.includes(communityId)) throw new Error('Join the community to post.');
      set((s) => ({
        communities: s.communities.map((c) =>
          c.id === communityId ? { ...c, posts: [{ id: uid('post'), author: s.candidate.displayName, text: clean, at: now() }, ...c.posts] } : c,
        ),
      }));
    },
    async requestConnection(profileId) {
      await delay();
      if (get().privacy.blockedIds.includes(profileId)) throw new Error('Unblock this person first.');
      set((s) => ({ connections: [...s.connections.filter((c) => c.profileId !== profileId), { profileId, status: 'pending', at: now() }] }));
    },
    async removeConnection(profileId) {
      await delay();
      set((s) => ({ connections: s.connections.filter((c) => c.profileId !== profileId) }));
    },
    async sendInvitation(eventId, toName) {
      await delay();
      set((s) => ({
        invitations: [{ id: uid('inv'), eventId, to: toName, from: s.candidate.displayName, at: now(), direction: 'sent', status: 'pending' }, ...s.invitations],
      }));
    },
    async respondInvitation(invitationId, accept) {
      await delay();
      const inv = get().invitations.find((i) => i.id === invitationId);
      if (!inv) throw new Error('Invitation not found');
      set((s) => ({
        invitations: s.invitations.map((i) => (i.id === invitationId ? { ...i, status: accept ? 'accepted' : 'declined' } : i)),
        rsvps: accept && !s.rsvps.includes(inv.eventId) ? [...s.rsvps, inv.eventId] : s.rsvps,
      }));
    },
    async updatePrivacy(patch) {
      await delay();
      set((s) => ({ privacy: { ...s.privacy, ...patch } }));
    },
    async block(profileId) {
      await delay();
      set((s) => ({
        privacy: { ...s.privacy, blockedIds: [...new Set([...s.privacy.blockedIds, profileId])] },
        connections: s.connections.filter((c) => c.profileId !== profileId),
      }));
    },
    async unblock(profileId) {
      await delay();
      set((s) => ({ privacy: { ...s.privacy, blockedIds: s.privacy.blockedIds.filter((id) => id !== profileId) } }));
    },
    async report(input) {
      await delay();
      if (!input.reason) throw new Error('Choose a reason.');
      const id = uid('rpt');
      set((s) => ({ reports: [{ id, targetName: input.targetName, reason: input.reason, details: input.details.slice(0, 1000), at: now(), status: 'submitted' }, ...s.reports] }));
      return { reportId: id };
    },
  },

  demo: {
    async reset() {
      await delay(0);
      resetDemoData();
    },
  },
};

