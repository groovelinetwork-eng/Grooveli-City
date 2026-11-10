/**
 * Typed frontend service contracts (PROPOSED — see docs/INTEGRATION_CONTRACTS.md).
 * `mock` implements these against the local demo store; `http` targets the
 * future NestJS API and fails visibly until those endpoints exist.
 */
import type {
  AIMessage,
  Announcement,
  Application,
  ApplicationStatus,
  CandidateProfile,
  CultureInitiative,
  Department,
  EmployeeRecord,
  EngagementSurvey,
  FeedbackItem,
  Interview,
  Job,
  LeaveRequest,
  OfficeLocation,
  OrganizationPrivateWorkspace,
  OrganizationPublicProfile,
  OrgModule,
  OrgRole,
  PayComponent,
  PayrollAdjustment,
  PayrollPreview,
  PerformanceReview,
  PersonaId,
  Policy,
  PrivacySettings,
  SubscriptionTier,
  TeamActivity,
  XpDecision,
} from '@grooveli/frontend-domain';

export interface AuthService {
  /** Demo persona sign-in. No credentials are verified. */
  signInDemo(personaId: PersonaId, opts?: { displayName?: string }): Promise<{ home: string }>;
  signOut(): Promise<void>;
  switchOrganization(organizationId: string): Promise<void>;
}

export interface CandidateService {
  completeOnboarding(profile: CandidateProfile): Promise<{ xp: XpDecision }>;
  updateProfile(patch: Partial<CandidateProfile>): Promise<{ xp: XpDecision | null }>;
  attachCv(meta: { name: string; sizeKb: number }): Promise<{ xp: XpDecision }>;
  removeCv(): Promise<void>;
}

export interface JobsService {
  toggleSave(jobId: string): Promise<{ saved: boolean }>;
  /** SIMULATED submission — nothing is sent to an employer. */
  apply(jobId: string, input: { coverLetter: string }): Promise<{ application: Application; xp: XpDecision }>;
  withdraw(applicationId: string): Promise<void>;
}

export interface CareerService {
  completeChallenge(challengeId: string, score: number, total: number): Promise<{ xp: XpDecision }>;
  completeAssessment(answers: Record<string, string>): Promise<{ xp: XpDecision }>;
  recordInterviewSimulation(role: string, score: number): Promise<{ xp: XpDecision }>;
  toggleCourseModule(courseId: string, moduleIndex: number): Promise<{ completed: boolean; xp: XpDecision | null }>;
  claimMission(missionId: string): Promise<{ xp: XpDecision }>;
  markNotificationsRead(ids: string[] | 'all'): Promise<void>;
}

export interface AssistantService {
  /** Rule-based simulated assistant — no AI inference. */
  send(text: string): Promise<AIMessage>;
  /** Requires an explicit user confirmation step in the UI before calling. */
  confirmApplications(jobIds: string[]): Promise<{ submitted: Application[] }>;
  clear(): Promise<void>;
}

export interface OrganizationInput {
  profile: Omit<OrganizationPublicProfile, 'id' | 'verified' | 'district'> & { district?: OrganizationPublicProfile['district'] };
  locations: Omit<OfficeLocation, 'id'>[];
  departments: { name: string; responsibilities: string }[];
  policies: { title: string; category: Policy['category']; body: string }[];
  invites: { email: string; roles: OrgRole[] }[];
  tier: SubscriptionTier;
}

export interface OrganizationService {
  create(input: OrganizationInput): Promise<{ organizationId: string }>;
  updateProfile(organizationId: string, patch: Partial<OrganizationPublicProfile>): Promise<void>;
  updateWorkspace(organizationId: string, patch: Partial<OrganizationPrivateWorkspace>): Promise<void>;
  invite(organizationId: string, email: string, roles: OrgRole[]): Promise<void>;
  revokeInvite(organizationId: string, invitationId: string): Promise<void>;
  setMemberRoles(organizationId: string, memberId: string, roles: OrgRole[]): Promise<void>;
  setMemberStatus(organizationId: string, memberId: string, status: 'active' | 'suspended'): Promise<void>;
  addDepartment(organizationId: string, dep: Omit<Department, 'id'>): Promise<void>;
  addLocation(organizationId: string, loc: Omit<OfficeLocation, 'id'>): Promise<void>;
  setTier(organizationId: string, tier: SubscriptionTier): Promise<void>;
  setTierModules(tier: SubscriptionTier, modules: OrgModule[]): Promise<void>;
}

export interface RecruitmentService {
  saveVacancy(job: Job): Promise<{ jobId: string }>;
  setVacancyStatus(jobId: string, status: Job['status']): Promise<void>;
  moveApplication(applicationId: string, status: ApplicationStatus, note?: string): Promise<void>;
  scheduleInterview(input: Omit<Interview, 'id' | 'status' | 'notes' | 'scorecard'>): Promise<{ interviewId: string }>;
  updateInterview(id: string, patch: Partial<Interview>): Promise<void>;
  inviteTalent(talentId: string, jobId: string): Promise<{ application: Application }>;
  saveShortlist(jobId: string, name: string, applicationIds: string[]): Promise<void>;
  toggleShortlist(shortlistId: string, applicationId: string): Promise<void>;
  recordAssessment(assessmentId: string, applicationId: string, score: number, reviewer: string): Promise<void>;
  createAssessment(jobId: string, title: string, kind: 'skills-test' | 'case-study' | 'work-sample', questions: string[]): Promise<void>;
}

export interface HrService {
  addEmployee(input: Pick<EmployeeRecord, 'organizationId' | 'name' | 'title' | 'departmentId' | 'locationId' | 'email' | 'startDate' | 'employmentType'> & { baseMonthly: number }): Promise<{ employeeId: string }>;
  updateEmployee(id: string, patch: Partial<EmployeeRecord>): Promise<void>;
  startOffboarding(id: string, lastDay: string): Promise<void>;
  completeOffboarding(id: string): Promise<void>;
  toggleLifecycleTask(employeeId: string, taskId: string): Promise<void>;
  addDocument(employeeId: string, meta: { name: string; kind: EmployeeRecord['documents'][number]['kind']; sizeKb: number }): Promise<void>;
  requestLeave(input: Omit<LeaveRequest, 'id' | 'status' | 'decidedBy'>): Promise<void>;
  decideLeave(id: string, decision: 'approved' | 'rejected' | 'cancelled', by: string): Promise<void>;
  clockIn(employeeId: string, status: 'present' | 'remote'): Promise<void>;
  updateReview(id: string, patch: Partial<PerformanceReview>): Promise<void>;
  savePolicy(organizationId: string, policy: Omit<Policy, 'acknowledgements' | 'updatedAt' | 'id'> & { id?: string }): Promise<void>;
  acknowledgePolicy(policyId: string): Promise<void>;
}

export interface PayrollService {
  updateCompensation(employeeId: string, baseMonthly: number, reason: string): Promise<void>;
  savePayComponent(component: PayComponent): Promise<void>;
  setStructureComponents(structureId: string, componentIds: string[]): Promise<void>;
  /** Builds a SIMULATED preview. No funds move; nothing is filed. */
  preparePreview(organizationId: string, period: string, adjustments: PayrollAdjustment[]): Promise<PayrollPreview>;
  approvePreview(id: string): Promise<void>;
  discardPreview(id: string): Promise<void>;
}

export interface EngagementService {
  publishAnnouncement(input: Omit<Announcement, 'id' | 'publishedAt'>): Promise<void>;
  deleteAnnouncement(id: string): Promise<void>;
  giveRecognition(input: { organizationId: string; from: string; toEmployeeId: string; value: string; message: string }): Promise<void>;
  reactToRecognition(id: string): Promise<void>;
  saveSurvey(survey: Omit<EngagementSurvey, 'responses'>): Promise<void>;
  respondToSurvey(surveyId: string, answers: Record<string, number | string>): Promise<void>;
  submitFeedback(input: Omit<FeedbackItem, 'id' | 'at' | 'status'>): Promise<void>;
  setFeedbackStatus(id: string, status: FeedbackItem['status']): Promise<void>;
  saveActivity(activity: Omit<TeamActivity, 'rsvps'> & { rsvps?: string[] }): Promise<void>;
  toggleActivityRsvp(activityId: string, employeeId: string): Promise<void>;
  saveInitiative(initiative: CultureInitiative): Promise<void>;
}

export interface SocialService {
  toggleRsvp(eventId: string): Promise<{ attending: boolean }>;
  toggleCommunity(communityId: string): Promise<{ joined: boolean }>;
  postToCommunity(communityId: string, text: string): Promise<void>;
  requestConnection(profileId: string): Promise<void>;
  removeConnection(profileId: string): Promise<void>;
  sendInvitation(eventId: string, toName: string): Promise<void>;
  respondInvitation(invitationId: string, accept: boolean): Promise<void>;
  updatePrivacy(patch: Partial<PrivacySettings>): Promise<void>;
  block(profileId: string): Promise<void>;
  unblock(profileId: string): Promise<void>;
  report(input: { targetName: string; reason: string; details: string }): Promise<{ reportId: string }>;
}

export interface DemoAdminService {
  reset(): Promise<void>;
}

export interface DataService {
  auth: AuthService;
  candidate: CandidateService;
  jobs: JobsService;
  career: CareerService;
  assistant: AssistantService;
  organizations: OrganizationService;
  recruitment: RecruitmentService;
  hr: HrService;
  payroll: PayrollService;
  engagement: EngagementService;
  social: SocialService;
  demo: DemoAdminService;
}
