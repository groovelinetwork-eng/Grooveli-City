import {
  Schema,
  arr,
  bool,
  date,
  dateTime,
  enumOf,
  extend,
  id,
  idArr,
  int,
  money,
  nullable,
  num,
  obj,
  omit,
  partial,
  pct,
  period,
  record,
  ref,
  str,
  strArr,
  text,
} from './schema-helpers';

/**
 * Component schemas. Source of truth for the shapes is
 * frontend/domain/src/types.ts — keep the two in step.
 */

// ── Enums ────────────────────────────────────────────────────────────────────
export const ORG_ROLES = ['org-admin', 'hr-manager', 'recruiter', 'payroll-officer', 'manager', 'employee'] as const;
export const TIERS = ['starter', 'growth', 'enterprise'] as const;
export const MODULES = ['recruitment', 'hr', 'payroll', 'engagement', 'analytics'] as const;
export const DISTRICTS = [
  'plaza', 'corporate', 'recruitment', 'university', 'tech', 'creative',
  'healthcare', 'hospitality', 'finance', 'apartment', 'ai-center',
] as const;
export const PERMISSIONS = [
  'org.settings.manage', 'org.members.manage', 'org.billing.view', 'recruitment.view', 'recruitment.manage',
  'hr.directory.view', 'hr.records.manage', 'hr.leave.approve', 'hr.performance.manage', 'hr.policies.manage',
  'payroll.view', 'payroll.prepare', 'engagement.manage', 'engagement.participate', 'analytics.view', 'self.service',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export type OrgModule = (typeof MODULES)[number];

export const ERROR_CODES = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  MODULE_NOT_IN_PLAN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NOT_ALLOWED_IN_STATE: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

const enums: Record<string, Schema> = {
  OrgRole: enumOf(ORG_ROLES),
  SubscriptionTier: enumOf(TIERS),
  OrgModule: enumOf(MODULES),
  Permission: enumOf(PERMISSIONS),
  DistrictId: enumOf(DISTRICTS),
  WorkMode: enumOf(['remote', 'hybrid', 'onsite']),
  EmploymentType: enumOf(['full-time', 'part-time', 'contract', 'internship', 'freelance']),
  ExperienceLevel: enumOf(['entry', 'mid', 'senior', 'lead']),
  ApplicationStatus: enumOf(['submitted', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']),
  XpReason: enumOf([
    'profile-complete', 'cv-upload', 'career-assessment', 'skill-challenge',
    'suitable-application', 'interview-simulation', 'course-complete', 'mission-complete',
  ]),
  LeaveType: enumOf(['annual', 'sick', 'parental', 'study', 'unpaid']),
  EmployeeStatus: enumOf(['active', 'onboarding', 'offboarding', 'on-leave', 'exited']),
  Gender: enumOf(['female', 'male', 'non-binary', 'self-describe', 'prefer-not']),
  ProfessionalOrientation: enumOf(['employee', 'freelancer', 'entrepreneur', 'student', 'open']),
  ErrorCode: enumOf(Object.keys(ERROR_CODES)),
};

// ── Envelope & common ────────────────────────────────────────────────────────
const common: Record<string, Schema> = {
  ApiError: obj(
    {
      success: enumOf([false] as unknown as string[], { type: 'boolean' }),
      message: str({ example: 'Title is required' }),
      error: obj(
        {
          code: ref('ErrorCode'),
          fields: record(str(), { description: 'Per-field validation messages (VALIDATION_FAILED only)' }),
          requestId: str({ description: 'Echo of X-Request-Id; quote it when reporting a problem' }),
        },
        { optional: ['fields', 'requestId'] },
      ),
    },
    { description: 'Every non-2xx response uses this envelope.' },
  ),
  PageMeta: obj({
    page: int({ minimum: 1, example: 1 }),
    pageSize: int({ minimum: 1, maximum: 100, example: 20 }),
    total: int({ minimum: 0, example: 134 }),
  }),
  XpDecision: obj(
    { award: int({ minimum: 0, description: 'XP granted by this call (0 when already awarded for this reason)' }), reason: str() },
    { description: 'The backend decides every XP award; the frontend only displays it.' },
  ),
  Health: obj({
    status: enumOf(['ok', 'degraded', 'down']),
    version: str(),
    timestamp: dateTime(),
    checks: record(enumOf(['ok', 'down']), { description: 'Dependency checks (readiness only): database, cache, storage…' }),
  }, { optional: ['checks'] }),
};

// ── Auth ─────────────────────────────────────────────────────────────────────
const password = str({ minLength: 10, maxLength: 128, format: 'password', description: 'At least 10 characters; checked against known-breached passwords' });
const email = str({ format: 'email', maxLength: 254 });

const auth: Record<string, Schema> = {
  SignupRequest: obj(
    { name: text(80, { minLength: 1 }), email, password, accountType: enumOf(['candidate', 'organization']) },
    { strict: true },
  ),
  LoginRequest: obj({ email, password: str({ minLength: 1, maxLength: 128, format: 'password' }) }, { strict: true }),
  Membership: obj(
    { organizationId: id(), roles: arr(ref('OrgRole'), { minItems: 1 }), employeeId: id() },
    { optional: ['employeeId'] },
  ),
  Session: obj({
    user: obj({ id: id(), displayName: str(), email, emailVerified: bool() }, { optional: ['emailVerified'] }),
    memberships: arr(ref('Membership')),
    activeOrganizationId: nullable(id()),
    onboardingComplete: bool(),
  }),
};

// ── Candidate ────────────────────────────────────────────────────────────────
const balanced = (a: string, b: string) => enumOf([a, b, 'balanced']);
const PersonalityTraits = obj(
  {
    energy: balanced('introverted', 'extroverted'),
    thinking: balanced('creative', 'analytical'),
    workStyle: balanced('collaborative', 'independent'),
    outlook: balanced('adventurous', 'reserved'),
    role: balanced('leader', 'supporter'),
  },
  { description: 'Used for SOCIAL features only — never for job matching or hiring.' },
);
const styleIndex = () => int({ minimum: 0, maximum: 63 });
const AvatarConfig = obj({
  body: enumOf([0, 1, 2], { description: '0 slim, 1 regular, 2 broad' }),
  skin: styleIndex(),
  hair: styleIndex(),
  hairColor: styleIndex(),
  outfit: styleIndex(),
  outfitColor: styleIndex(),
  accessory: styleIndex(),
});
const SkillRating = obj({ name: text(60, { minLength: 1 }), level: pct() });
const JobPreferences = obj({
  desiredRoles: strArr(20, 80),
  locations: strArr(20, 80),
  minSalary: money(),
  workModes: arr(ref('WorkMode'), { uniqueItems: true }),
  employmentTypes: arr(ref('EmploymentType'), { uniqueItems: true }),
});
const CandidateProfile = obj({
  id: id(),
  displayName: text(80, { minLength: 1 }),
  headline: text(140),
  location: text(80),
  gender: nullable(ref('Gender')),
  yearsExperience: int({ minimum: 0, maximum: 60 }),
  orientation: ref('ProfessionalOrientation'),
  personality: nullable(ref('PersonalityTraits')),
  avatar: ref('AvatarConfig'),
  photoDataUrl: nullable(str({ maxLength: 700_000, description: 'data:image/(png|jpeg|webp);base64,… up to ~512 KB. Never used for matching.' })),
  summary: text(2000),
  skills: arr(ref('SkillRating'), { maxItems: 50 }),
  certifications: strArr(30, 120),
  experience: arr(
    obj({ id: id(), title: text(100), company: text(100), start: text(10), end: nullable(text(10)), summary: text(1000) }),
    { maxItems: 30 },
  ),
  education: arr(obj({ id: id(), school: text(120), qualification: text(120), year: text(4) }), { maxItems: 20 }),
  preferences: ref('JobPreferences'),
  cvFile: nullable(obj({ name: str(), sizeKb: int({ minimum: 0 }), addedAt: dateTime() })),
  visibility: enumOf(['public', 'employers', 'private']),
  homeDistrict: ref('DistrictId'),
  interests: strArr(15, 40),
});
const PrivacySettings = obj({
  presenceVisibility: enumOf(['everyone', 'connections', 'hidden']),
  showInEventAttendees: bool(),
  allowInvitations: enumOf(['everyone', 'connections', 'nobody']),
  allowMessages: enumOf(['everyone', 'connections', 'nobody']),
  profileDiscoverable: bool(),
  blockedIds: idArr(1000),
});

const candidate: Record<string, Schema> = {
  PersonalityTraits,
  AvatarConfig,
  SkillRating,
  JobPreferences,
  CandidateProfile,
  CandidateProfileInput: omit(CandidateProfile, ['id', 'cvFile'], { strict: true }),
  CandidateProfilePatch: partial(omit(CandidateProfile, ['id', 'cvFile'])),
  PrivacySettings,
  PrivacySettingsPatch: partial(omit(PrivacySettings, ['blockedIds']), 'Blocks are managed with /me/blocks/{profileId}.'),
  CvInfo: obj({ name: str(), sizeKb: int(), addedAt: dateTime(), downloadUrl: str({ format: 'uri', description: 'Short-lived signed URL (expires in 5 minutes)' }) }),
};

// ── Jobs & recruitment ───────────────────────────────────────────────────────
const Job = obj({
  id: id(),
  organizationId: id(),
  title: text(120, { minLength: 1 }),
  department: text(80),
  district: ref('DistrictId'),
  location: text(80),
  workMode: ref('WorkMode'),
  employmentType: ref('EmploymentType'),
  level: ref('ExperienceLevel'),
  minYears: int({ minimum: 0, maximum: 40 }),
  salaryMin: money(),
  salaryMax: money('Whole naira (NGN) per month; must be ≥ salaryMin'),
  skills: strArr(30, 60),
  requiredQualifications: strArr(20, 120),
  description: text(10000),
  responsibilities: strArr(30, 300),
  postedOn: date(),
  closesOn: date({ description: 'Must be on or after postedOn' }),
  status: enumOf(['draft', 'published', 'closed']),
});
const Application = obj({
  id: id(),
  jobId: id(),
  candidateId: id(),
  candidateName: str(),
  status: ref('ApplicationStatus'),
  submittedAt: dateTime(),
  coverLetter: text(5000),
  fitScore: pct(),
  history: arr(obj({ status: ref('ApplicationStatus'), at: dateTime(), note: text(1000) }, { optional: ['note'] })),
});
const Interview = obj({
  id: id(),
  applicationId: id(),
  jobId: id(),
  candidateId: id(),
  candidateName: str(),
  scheduledAt: dateTime(),
  durationMin: int({ minimum: 10, maximum: 480 }),
  format: enumOf(['video', 'onsite', 'phone', 'virtual-hq']),
  interviewers: strArr(10, 80),
  status: enumOf(['scheduled', 'completed', 'cancelled']),
  notes: text(5000),
  scorecard: arr(obj({ criterion: text(80), score: int({ minimum: 1, maximum: 5 }) }), { maxItems: 20 }),
});
const recruitment: Record<string, Schema> = {
  Job,
  JobInput: omit(Job, ['id', 'organizationId', 'postedOn'], { strict: true }),
  Application,
  Interview,
  InterviewCreate: obj(
    {
      applicationId: id(), jobId: id(), candidateId: id(), candidateName: text(80),
      scheduledAt: dateTime({ description: 'Must be in the future' }),
      durationMin: int({ minimum: 10, maximum: 480 }),
      format: enumOf(['video', 'onsite', 'phone', 'virtual-hq']),
      interviewers: strArr(10, 80),
    },
    { strict: true },
  ),
  InterviewPatch: partial(obj({
    status: enumOf(['scheduled', 'completed', 'cancelled']),
    notes: text(5000),
    scorecard: arr(obj({ criterion: text(80), score: int({ minimum: 1, maximum: 5 }) }), { maxItems: 20 }),
    scheduledAt: dateTime(),
  })),
  MatchResult: obj(
    {
      score: pct(),
      band: enumOf(['excellent', 'good', 'fair', 'weak']),
      constraints: arr(obj({
        key: enumOf(['location', 'salary', 'experience', 'employmentType', 'qualifications', 'workMode']),
        label: str(), passed: bool(), detail: str(),
      })),
      matchedSkills: arr(str()),
      missingSkills: arr(str()),
      reasons: arr(str()),
      gaps: arr(str()),
    },
    { description: 'Explainable match. Never uses personality traits, gender or photos.' },
  ),
  JobMatch: obj({ job: ref('Job'), match: ref('MatchResult') }),
  TalentProfile: obj({
    id: id(), name: str(), headline: str(), location: str(), yearsExperience: int(),
    skills: arr(ref('SkillRating')), expectedSalary: money(),
    workModes: arr(ref('WorkMode')), employmentTypes: arr(ref('EmploymentType')),
    qualifications: arr(str()), avatar: ref('AvatarConfig'),
  }),
  Shortlist: obj({ id: id(), jobId: id(), name: text(80), applicationIds: idArr() }),
  Assessment: obj({
    id: id(), jobId: id(), title: text(120),
    kind: enumOf(['skills-test', 'case-study', 'work-sample']),
    questions: strArr(50, 1000),
    results: arr(obj({ applicationId: id(), score: pct(), reviewer: str() })),
  }),
  PublicVacancy: obj({
    id: id(), title: str(), department: str(), workMode: ref('WorkMode'),
    employmentType: ref('EmploymentType'), postedOn: date(),
  }),
};

// ── Career ───────────────────────────────────────────────────────────────────
const QuizQuestionPublic = obj(
  { id: id(), prompt: str(), options: arr(str(), { minItems: 2, maxItems: 8 }) },
  { description: 'The answer and explanation are never sent before an attempt.' },
);
const objectiveCheck = enumOf([
  'profile-complete', 'cv-uploaded', 'assessment-done', 'applications-3',
  'interview-sim-done', 'skill-challenge-done', 'course-done',
]);
const Mission = obj({
  id: id(), title: str(), description: str(), kind: enumOf(['career', 'skill']),
  objectives: arr(obj({ id: id(), label: str(), check: objectiveCheck })),
  rewardXp: int({ minimum: 0 }), district: ref('DistrictId'),
  orientations: { oneOf: [arr(ref('ProfessionalOrientation')), enumOf(['all'])] },
});
const Course = obj({
  id: id(), title: str(), provider: str(), skill: str(), hours: num({ minimum: 0 }),
  modules: arr(str()), xp: int({ minimum: 0 }),
});
const Achievement = obj({
  id: id(), title: str(), description: str(), icon: str(),
  rule: obj({ type: enumOf(['xp', 'applications', 'missions', 'challenges', 'profile-complete']), min: int() }, { optional: ['min'] }),
});
const career: Record<string, Schema> = {
  XpEvent: obj({ id: id(), reason: ref('XpReason'), amount: int(), at: dateTime(), ref: str() }, { optional: ['ref'] }),
  CareerProgress: obj({ xp: int(), level: int({ minimum: 1 }), xpIntoLevel: int(), xpForNextLevel: int(), reputation: int() }),
  QuizQuestionPublic,
  SkillChallengePublic: obj({
    id: id(), title: str(), skill: str(), district: ref('DistrictId'), xp: int(),
    questions: arr(ref('QuizQuestionPublic')),
  }),
  ChallengeAttemptResult: obj({
    score: int({ minimum: 0 }), total: int({ minimum: 1 }), xp: ref('XpDecision'),
    review: arr(obj({ questionId: id(), correct: bool(), answer: int(), explanation: str() }), { description: 'Revealed only after the attempt' }),
  }, { optional: ['review'] }),
  Course,
  CourseWithProgress: extend(ref('Course'), { completedModules: arr(int({ minimum: 0 })) }),
  Mission,
  MissionWithProgress: extend(ref('Mission'), { done: record(bool()), claimed: bool() }),
  Achievement,
  AchievementWithStatus: extend(ref('Achievement'), { unlocked: bool(), unlockedAt: nullable(dateTime()) }, ['unlockedAt']),
  NotificationItem: obj(
    {
      id: id(), at: dateTime(), title: str(), body: str(),
      href: str({ description: 'Relative in-app path only' }), read: bool(),
      kind: enumOf(['application', 'interview', 'mission', 'system', 'social', 'workplace']),
    },
    { optional: ['href'] },
  ),
  AIMessage: obj(
    {
      id: id(), role: enumOf(['user', 'assistant']), text: str(), at: dateTime(),
      jobIds: idArr(20), pendingApplicationJobIds: idArr(20),
    },
    { optional: ['jobIds', 'pendingApplicationJobIds'] },
  ),
};

// ── Organisations ────────────────────────────────────────────────────────────
const OrganizationPublicProfile = obj({
  id: id(),
  name: text(100, { minLength: 1 }),
  tagline: text(140),
  logoColor: str({ pattern: '^#[0-9A-Fa-f]{6}$', example: '#1E6FFF' }),
  logoGlyph: text(4),
  industry: text(60),
  district: ref('DistrictId'),
  description: text(5000),
  website: str({ format: 'uri', maxLength: 300 }),
  size: enumOf(['1-10', '11-50', '51-200', '201-1000', '1000+']),
  structure: text(200),
  workArrangements: arr(ref('WorkMode'), { uniqueItems: true }),
  values: strArr(12, 60),
  culture: obj({
    environment: text(1000), leadership: text(1000), collaboration: text(1000),
    development: text(1000), inclusion: text(1000), workLife: text(1000),
  }),
  benefits: strArr(30, 120),
  headquarters: text(120),
  verified: bool({ description: 'Set by platform staff only' }),
});
const OfficeLocation = obj({ id: id(), name: text(80), city: text(60), address: text(200), headcountCapacity: int({ minimum: 0 }) });
const Department = obj({ id: id(), name: text(80), headEmployeeId: nullable(id()), responsibilities: text(1000), locationId: nullable(id()) });
const OrgMember = obj({
  id: id(), name: str(), email, roles: arr(ref('OrgRole'), { minItems: 1 }),
  departmentId: nullable(id()), recruitingFor: idArr(), status: enumOf(['active', 'invited', 'suspended']),
});
const Invitation = obj({
  id: id(), email, roles: arr(ref('OrgRole'), { minItems: 1 }), sentAt: dateTime(),
  status: enumOf(['pending', 'accepted', 'revoked', 'expired']),
});
const policyCategory = enumOf(['leave', 'conduct', 'remote-work', 'benefits', 'security', 'other']);
const Policy = obj({ id: id(), title: text(120), category: policyCategory, body: text(20000), updatedAt: date(), acknowledgements: int({ minimum: 0 }) });
const PolicyInput = obj({ title: text(120, { minLength: 1 }), category: policyCategory, body: text(20000, { minLength: 1 }) }, { strict: true });
const Workflow = obj({ id: id(), name: text(80), steps: strArr(20, 120) });

const orgs: Record<string, Schema> = {
  OrganizationPublicProfile,
  OrganizationProfilePatch: partial(omit(OrganizationPublicProfile, ['id', 'verified'])),
  OrganizationInput: obj(
    {
      profile: omit(OrganizationPublicProfile, ['id', 'verified', 'district'], { strict: false }),
      locations: arr(omit(OfficeLocation, ['id'], { strict: true }), { maxItems: 50 }),
      departments: arr(obj({ name: text(80, { minLength: 1 }), responsibilities: text(1000) }, { strict: true }), { maxItems: 100 }),
      policies: arr(PolicyInput, { maxItems: 50 }),
      invites: arr(obj({ email, roles: arr(ref('OrgRole'), { minItems: 1 }) }, { strict: true }), { maxItems: 50 }),
      tier: ref('SubscriptionTier'),
    },
    { strict: true, description: 'Organisation onboarding. The caller becomes the first org-admin. profile.district is optional.' },
  ),
  OfficeLocation,
  OfficeLocationInput: omit(OfficeLocation, ['id'], { strict: true }),
  Department,
  DepartmentInput: omit(Department, ['id'], { strict: true }),
  OrgMember,
  Invitation,
  InvitationCreate: obj({ email, roles: arr(ref('OrgRole'), { minItems: 1, uniqueItems: true }) }, { strict: true }),
  Policy,
  PolicyInput,
  Workflow,
  OrganizationPrivateWorkspace: obj({
    organizationId: id(), tier: ref('SubscriptionTier'),
    locations: arr(ref('OfficeLocation')), departments: arr(ref('Department')), policies: arr(ref('Policy')),
    members: arr(ref('OrgMember')), invitations: arr(ref('Invitation')),
    workflows: arr(ref('Workflow')), setupChecklist: record(bool()),
  }),
  WorkspacePatch: partial(obj({ workflows: arr(ref('Workflow'), { maxItems: 50 }), setupChecklist: record(bool()) })),
  OrgStructure: obj({
    departments: arr(ref('Department')),
    locations: arr(ref('OfficeLocation')),
    employees: arr(obj({ id: id(), name: str(), title: str(), managerId: nullable(id()), departmentId: id() })),
  }),
  AuditEntry: obj({
    id: id(), at: dateTime(), actorId: id(), actorName: str(), action: str({ example: 'member.roles.changed' }),
    targetType: str(), targetId: id(), ip: str({ description: 'Truncated to /24 (IPv4) or /48 (IPv6)' }), details: record({}),
  }),
  SubscriptionInfo: obj({ tier: ref('SubscriptionTier'), modules: arr(ref('OrgModule')) }),
  OrgDashboard: obj({
    openVacancies: int({ minimum: 0 }), pendingLeave: int({ minimum: 0 }), reviewsDue: int({ minimum: 0 }),
    setupChecklist: record(bool()),
  }),
};

// ── HR ───────────────────────────────────────────────────────────────────────
const EmployeeDocument = obj({
  id: id(), name: text(120), kind: enumOf(['contract', 'id', 'certificate', 'policy-ack', 'other']),
  addedOn: date(), sizeKb: int({ minimum: 0 }),
});
const LifecycleTask = obj({ id: id(), phase: enumOf(['onboarding', 'offboarding']), label: str(), owner: str(), done: bool() });
const EmployeeRecord = obj({
  id: id(), organizationId: id(), name: text(80), title: text(80), departmentId: id(), locationId: id(),
  managerId: nullable(id()), email, startDate: date(), employmentType: ref('EmploymentType'),
  status: ref('EmployeeStatus'), avatar: ref('AvatarConfig'),
  publicDirectory: bool({ description: 'Opt-in to the public HQ directory (name and title only)' }),
  documents: arr(ref('EmployeeDocument')), lifecycleTasks: arr(ref('LifecycleTask')),
  emergencyContact: text(200),
});
const LeaveRequest = obj(
  {
    id: id(), employeeId: id(), type: ref('LeaveType'), start: date(), end: date(),
    days: int({ minimum: 0, description: 'Working days, calculated by the server' }), reason: text(1000),
    status: enumOf(['pending', 'approved', 'rejected', 'cancelled']), decidedBy: str(),
  },
  { optional: ['decidedBy'] },
);
const PerformanceReview = obj({
  id: id(), employeeId: id(), cycle: text(40), reviewer: str(),
  status: enumOf(['not-started', 'self-review', 'manager-review', 'calibrated', 'shared']),
  rating: nullable(int({ minimum: 1, maximum: 5 })),
  goals: arr(obj({ title: text(200), progress: pct() }), { maxItems: 20 }),
  strengths: text(5000), improvements: text(5000),
});
const hr: Record<string, Schema> = {
  EmployeeDocument,
  LifecycleTask,
  EmployeeRecord,
  EmployeeCreate: obj(
    {
      name: text(80, { minLength: 1 }), title: text(80), departmentId: id(), locationId: id(), email,
      startDate: date(), employmentType: ref('EmploymentType'), baseMonthly: money(),
    },
    { strict: true },
  ),
  EmployeePatch: partial(omit(EmployeeRecord, ['id', 'organizationId', 'documents', 'lifecycleTasks', 'status'])),
  AttendanceEntry: obj({
    employeeId: id(), date: date(), status: enumOf(['present', 'remote', 'late', 'absent', 'leave']),
    hours: num({ minimum: 0, maximum: 24 }),
  }),
  LeaveRequest,
  LeaveCreate: obj(
    { employeeId: id(), type: ref('LeaveType'), start: date(), end: date({ description: 'On or after start' }), reason: text(1000) },
    { strict: true },
  ),
  PerformanceReview,
  PerformanceReviewPatch: partial(omit(PerformanceReview, ['id', 'employeeId', 'cycle', 'reviewer'])),
  LeaveBalance: record(num({ minimum: 0 }), { description: 'Remaining days keyed by LeaveType' }),
  EmployeeSelfService: obj({
    record: ref('EmployeeRecord'),
    leaveBalance: ref('LeaveBalance'),
    leave: arr(ref('LeaveRequest')),
    policiesToAcknowledge: arr(ref('Policy')),
    payslips: arr(obj({ previewId: id(), period: period() })),
  }),
};

// ── Payroll (preview only) ───────────────────────────────────────────────────
const PayComponent = obj({
  id: id(), name: text(80), kind: enumOf(['allowance', 'deduction']),
  calc: obj({ type: enumOf(['percent', 'fixed']), value: num({ minimum: 0, description: 'percent: 0–100; fixed: whole NGN per month' }) }),
  taxable: bool(),
});
const PayslipPreview = obj({
  employeeId: id(), employeeName: str(), period: period(),
  lines: arr(obj({ label: str(), amount: int(), kind: enumOf(['earning', 'deduction']) })),
  gross: int(), totalDeductions: int(), net: int(), warnings: arr(str()),
});
const payroll: Record<string, Schema> = {
  PayComponent,
  CompensationStructure: obj({ id: id(), grade: text(40), minBase: money(), maxBase: money(), componentIds: idArr() }),
  CompensationRecord: obj({
    employeeId: id(), structureId: id(), baseMonthly: money(), currency: enumOf(['NGN']),
    effectiveFrom: date(), bankOnFile: bool({ description: 'Bank details are never returned by the API' }),
    history: arr(obj({ date: date(), baseMonthly: money(), reason: str() })),
  }),
  CompensationUpdate: obj({ baseMonthly: int({ minimum: 1 }), reason: text(500, { minLength: 1 }), structureId: nullable(str({ description: 'Assign a salary structure [added]' })) }, { strict: true, optional: ['structureId'] }),
  PayrollAdjustment: obj({ employeeId: id(), kind: enumOf(['bonus', 'deduction']), label: text(80), amount: int({ minimum: 1 }) }, { strict: true }),
  PayslipPreview,
  PayrollPreview: obj({
    id: id(), organizationId: id(), period: period(), createdAt: dateTime(),
    status: enumOf(['draft', 'approved-preview']),
    payslips: arr(ref('PayslipPreview')),
    totals: obj({ gross: int(), deductions: int(), net: int(), headcount: int() }),
    simulated: enumOf([true] as unknown as string[], { type: 'boolean', description: 'Always true. No money moves and nothing is filed.' }),
  }),
  PayrollPreviewCreate: obj({ period: period(), adjustments: arr(ref('PayrollAdjustment'), { maxItems: 5000 }) }, { strict: true }),
  PayrollReportRow: obj({ period: period(), department: str(), gross: int(), deductions: int(), net: int() }),
};

// ── Engagement ───────────────────────────────────────────────────────────────
const SurveyQuestion = obj({ id: id(), text: text(300), kind: enumOf(['scale', 'text']) });
const engagement: Record<string, Schema> = {
  Announcement: obj(
    {
      id: id(), organizationId: id(), title: text(120), body: text(10000), author: str(), publishedAt: dateTime(),
      audience: enumOf(['all', 'department', 'public-hq']), departmentId: id(), pinned: bool(),
    },
    { optional: ['departmentId'] },
  ),
  AnnouncementInput: obj(
    {
      title: text(120, { minLength: 1 }), body: text(10000, { minLength: 1 }),
      audience: enumOf(['all', 'department', 'public-hq']),
      departmentId: id('Required when audience is "department"'), pinned: bool(),
    },
    { strict: true, optional: ['departmentId'] },
  ),
  Recognition: obj({
    id: id(), organizationId: id(), from: str(), toEmployeeId: id(), value: text(60), message: text(1000),
    at: dateTime(), reactions: int({ minimum: 0 }),
  }),
  RecognitionInput: obj({ toEmployeeId: id(), value: text(60, { minLength: 1 }), message: text(1000, { minLength: 1 }) }, { strict: true }),
  SurveyQuestion,
  EngagementSurvey: obj(
    {
      id: id(), organizationId: id(), title: text(120), status: enumOf(['draft', 'open', 'closed']),
      anonymous: bool(), questions: arr(ref('SurveyQuestion'), { maxItems: 50 }), closesOn: date(),
      respondedByMe: bool(),
      results: nullable(obj({
        responseCount: int({ minimum: 0 }),
        questions: arr(obj(
          {
            questionId: id(),
            average: nullable(num()),
            distribution: record(int(), { description: 'Scale questions: count per score' }),
            textAnswers: arr(str(), { description: 'Text questions: answers without author or timestamp' }),
          },
          { optional: ['distribution', 'textAnswers'] },
        )),
      }, { description: 'Aggregated results — engagement.manage only. Hidden while fewer than 5 responses on anonymous surveys.' })),
    },
  ),
  SurveyInput: obj(
    {
      title: text(120, { minLength: 1 }), status: enumOf(['draft', 'open', 'closed']), anonymous: bool(),
      questions: arr(ref('SurveyQuestion'), { minItems: 1, maxItems: 50 }), closesOn: date(),
    },
    { strict: true },
  ),
  SurveyResponseInput: obj({ answers: record({ oneOf: [int({ minimum: 1, maximum: 5 }), text(2000)] }) }, { strict: true }),
  FeedbackItem: obj({
    id: id(), organizationId: id(), category: enumOf(['idea', 'concern', 'praise', 'question']),
    body: text(5000), at: dateTime(), status: enumOf(['new', 'acknowledged', 'actioned']), anonymous: bool(),
    author: nullable(str({ description: 'Always null for anonymous items' })),
  }),
  FeedbackInput: obj(
    { category: enumOf(['idea', 'concern', 'praise', 'question']), body: text(5000, { minLength: 5 }), anonymous: bool() },
    { strict: true },
  ),
  TeamActivity: obj({
    id: id(), organizationId: id(), title: text(120), date: date(), location: text(120),
    kind: enumOf(['social', 'learning', 'wellbeing', 'volunteering']), rsvps: idArr(5000),
  }),
  TeamActivityInput: obj(
    { title: text(120, { minLength: 1 }), date: date(), location: text(120), kind: enumOf(['social', 'learning', 'wellbeing', 'volunteering']) },
    { strict: true },
  ),
  CultureInitiative: obj({ id: id(), organizationId: id(), title: text(120), owner: text(80), progress: pct(), status: enumOf(['planned', 'active', 'done']) }),
  CultureInitiativeInput: obj(
    { title: text(120, { minLength: 1 }), owner: text(80), progress: pct(), status: enumOf(['planned', 'active', 'done']) },
    { strict: true },
  ),
  WorkforceMetric: obj(
    { key: str(), label: str(), series: arr(obj({ label: str(), value: num() })) },
    { description: 'Aggregates only — never personal data. Buckets under 5 people are suppressed.' },
  ),
};

// ── Social & city ────────────────────────────────────────────────────────────
const CityEvent = obj(
  {
    id: id(), title: str(), kind: enumOf(['career-fair', 'meetup', 'workshop', 'social', 'conference']),
    district: ref('DistrictId'), venue: str(), start: dateTime(), end: dateTime(), host: str(),
    hostOrganizationId: id(), description: str(), capacity: int({ minimum: 0 }), attendeeCount: int({ minimum: 0 }),
    tags: arr(str()), communityId: id(),
  },
  { optional: ['hostOrganizationId', 'communityId'] },
);
const CommunityPost = obj({ id: id(), author: str(), text: text(2000), at: dateTime() });
const social: Record<string, Schema> = {
  Conversation: obj({
    id: id(), with: ref('SocialProfile'), lastMessageAt: nullable(dateTime()), lastMessagePreview: nullable(text(140)), unread: int({ minimum: 0 }),
  }),
  Message: obj({ id: id(), conversationId: id(), fromMe: bool(), text: text(4000), at: dateTime(), readAt: nullable(dateTime()) }),
  ModerationReport: obj({
    id: id(), targetType: str(), targetId: id(), reason: str(), details: str(), reporterId: id(), createdAt: dateTime(),
    status: enumOf(['open', 'actioned', 'dismissed']), resolution: nullable(obj({ action: str(), note: str(), by: str(), at: dateTime() })),
  }),
  CityEvent,
  CityEventDetail: extend(ref('CityEvent'), {
    attendees: arr(obj({ id: id(), name: str() }), { description: 'Only attendees whose privacy settings allow it' }),
    attendingByMe: bool(),
  }, ['attendingByMe']),
  CommunityPost,
  EventInput: obj(
    {
      title: text(120, { minLength: 1 }), kind: enumOf(['career-fair', 'meetup', 'workshop', 'social', 'conference']), district: ref('DistrictId'),
      venue: text(120, { minLength: 1 }), start: dateTime({ description: 'In the future' }), end: dateTime({ description: 'After start' }),
      description: text(5000), capacity: int({ minimum: 1, maximum: 100000 }), tags: strArr(10, 30), communityId: nullable(id()),
      host: text(120, { description: 'Platform events only' }),
    },
    { strict: true, optional: ['communityId', 'host'] },
  ),
  EventPatch: obj(
    {
      title: text(120), kind: enumOf(['career-fair', 'meetup', 'workshop', 'social', 'conference']), district: ref('DistrictId'), venue: text(120),
      start: dateTime(), end: dateTime(), description: text(5000), capacity: int({ minimum: 1 }), tags: strArr(10, 30), communityId: nullable(id()),
    },
    { strict: true, optional: ['title', 'kind', 'district', 'venue', 'start', 'end', 'description', 'capacity', 'tags', 'communityId'] },
  ),
  Community: obj({
    id: id(), name: str(), description: str(), topic: str(), members: int({ minimum: 0 }),
    district: ref('DistrictId'), posts: arr(ref('CommunityPost')), joinedByMe: bool(),
  }, { optional: ['joinedByMe'] }),
  SocialProfile: obj({ id: id(), name: str(), headline: str(), district: ref('DistrictId'), avatar: ref('AvatarConfig'), interests: arr(str()) }),
  Connection: obj({ profileId: id(), status: enumOf(['pending', 'connected']), direction: enumOf(['sent', 'received']) }, { optional: ['direction'] }),
  EventInvitation: obj({
    id: id(), eventId: id(), fromName: str(), toName: str(),
    status: enumOf(['pending', 'accepted', 'declined']), direction: enumOf(['sent', 'received']),
  }),
  ReportInput: obj(
    {
      targetType: enumOf(['profile', 'community-post', 'organization', 'job', 'event', 'message']),
      targetId: id(),
      reason: enumOf(['spam', 'harassment', 'hate', 'scam', 'impersonation', 'inappropriate', 'other']),
      details: text(2000),
    },
    { strict: true, optional: ['targetType', 'details'] },
  ),
  PublicHqProjection: obj(
    {
      organization: obj({
        id: id(), name: str(), tagline: str(), logoColor: str(), logoGlyph: str(), industry: str(),
        district: ref('DistrictId'), description: str(), website: str(), values: arr(str()),
        culture: OrganizationPublicProfile.properties!.culture, benefits: arr(str()),
        workArrangements: arr(ref('WorkMode')), size: str(), verified: bool(),
      }),
      vacancies: arr(ref('PublicVacancy'), { description: 'Published vacancies only' }),
      departments: arr(str()),
      directory: arr(obj({ name: str(), title: str(), department: str() }), { description: 'Opted-in employees only' }),
      announcements: arr(obj({ id: id(), title: str(), body: str(), publishedAt: dateTime() }), { description: "Audience 'public-hq' only" }),
    },
    { description: 'The only organisation shape the 3D city may receive.' },
  ),
  CityWorld: obj({
    hqs: arr(ref('PublicHqProjection')),
    events: arr(ref('CityEvent')),
    jobCounts: record(int({ minimum: 0 }), { description: 'Published job count keyed by DistrictId' }),
  }),
  CityMe: obj({ displayName: str(), level: int(), levelProgress: num({ minimum: 0, maximum: 1 }), avatar: ref('AvatarConfig') }),
  MarketQuote: obj({
    symbol: str({ pattern: '^[A-Za-z0-9.^=/_-]{1,16}$', example: 'NGXASI' }), name: text(60, { minLength: 1 }),
    price: num(), change: num(), changePct: num({ description: '0.42 means +0.42 %' }), currency: text(8),
  }),
  MarketSnapshot: obj(
    {
      asOf: dateTime({ description: 'Provider timestamp, not fetch time' }),
      delayedMinutes: int({ minimum: 0, maximum: 1440 }),
      source: text(80, { minLength: 1 }),
      attribution: text(140),
      simulated: bool({ default: false }),
      quotes: arr(ref('MarketQuote'), { minItems: 1, maxItems: 8 }),
      chart: nullable(obj({
        symbol: str({ pattern: '^[A-Za-z0-9.^=/_-]{1,16}$' }),
        points: arr(obj({ t: dateTime(), v: num() }), { minItems: 2, maxItems: 500 }),
      })),
    },
    { description: 'Display only — no trading. Matches marketSnapshotSchema in frontend/domain/src/markets.ts.' },
  ),
  PresenceProjection: obj({
    id: id(), displayName: str(), avatar: ref('AvatarConfig'), district: ref('DistrictId'),
    position: obj({ x: num(), z: num() }),
    status: enumOf(['exploring', 'at-event', 'in-building', 'idle']),
  }),
};

// ── Games ────────────────────────────────────────────────────────────────────
const gameId = enumOf(['chess', 'checkers', 'ludo', 'pool', 'puzzle']);
const games: Record<string, Schema> = {
  GameId: gameId,
  GameList: obj({
    games: arr(obj({ id: ref('GameId'), availability: enumOf(['coming-soon', 'available', 'maintenance']), message: str() }, { optional: ['message'] })),
  }),
  GameSession: obj(
    {
      sessionId: id(), gameId: ref('GameId'), status: enumOf(['waiting', 'active', 'finished', 'cancelled']),
      players: arr(obj({ playerId: id(), displayName: str() })),
      state: { description: 'Opaque game state; the city never reads it' },
    },
    { optional: ['state'] },
  ),
  GameResult: obj({
    sessionId: id(), gameId: ref('GameId'), outcome: enumOf(['win', 'loss', 'draw', 'abandoned']), finishedAt: dateTime(),
  }),
};

export const schemas: Record<string, Schema> = {
  ...enums, ...common, ...auth, ...candidate, ...recruitment, ...career, ...orgs,
  ...hr, ...payroll, ...engagement, ...social, ...games,
};
