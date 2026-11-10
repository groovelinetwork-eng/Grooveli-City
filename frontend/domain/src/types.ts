/**
 * PROPOSED frontend contracts (see docs/INTEGRATION_CONTRACTS.md).
 * These are not backend-approved schemas. They describe the shapes the
 * frontend mock adapters produce and the API adapters expect.
 */

export type Id = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;

// ── Identity ────────────────────────────────────────────────────────────────
export type Gender = 'female' | 'male' | 'non-binary' | 'self-describe' | 'prefer-not';
export type ProfessionalOrientation =
  | 'employee'
  | 'freelancer'
  | 'entrepreneur'
  | 'student'
  | 'open';

/** Personality traits personalise SOCIAL features only — never hiring/matching. */
export interface PersonalityTraits {
  energy: 'introverted' | 'extroverted' | 'balanced';
  thinking: 'creative' | 'analytical' | 'balanced';
  workStyle: 'collaborative' | 'independent' | 'balanced';
  outlook: 'adventurous' | 'reserved' | 'balanced';
  role: 'leader' | 'supporter' | 'balanced';
}

export interface AvatarConfig {
  body: 0 | 1 | 2; // slim / regular / broad
  skin: number; // index into SKIN_TONES
  hair: number; // index into HAIR_STYLES
  hairColor: number; // index into HAIR_COLORS
  outfit: number; // index into OUTFITS
  outfitColor: number; // index into OUTFIT_COLORS
  accessory: number; // index into ACCESSORIES
}

export type PersonaId =
  | 'candidate'
  | 'org-admin'
  | 'hr-manager'
  | 'recruiter'
  | 'payroll-officer'
  | 'employee';

export interface IdentitySession {
  personaId: PersonaId;
  displayName: string;
  /** Demo mode only — no credential verification takes place. */
  mode: 'demo';
  memberships: OrganizationMembership[];
  activeOrganizationId: Id | null;
}

// ── Career ──────────────────────────────────────────────────────────────────
export interface SkillRating {
  name: string;
  level: number; // 0–100 self/assessed
}

export interface ExperienceEntry {
  id: Id;
  title: string;
  company: string;
  start: string;
  end: string | null;
  summary: string;
}

export interface EducationEntry {
  id: Id;
  school: string;
  qualification: string;
  year: string;
}

export interface CandidateProfile {
  id: Id;
  displayName: string;
  headline: string;
  location: string;
  gender: Gender | null;
  yearsExperience: number;
  orientation: ProfessionalOrientation;
  personality: PersonalityTraits | null;
  avatar: AvatarConfig;
  photoDataUrl: string | null;
  summary: string;
  skills: SkillRating[];
  certifications: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  preferences: JobPreferences;
  cvFile: { name: string; sizeKb: number; addedAt: ISODateTime } | null;
  /** Visible to employers? */
  visibility: 'public' | 'employers' | 'private';
}

export interface JobPreferences {
  desiredRoles: string[];
  locations: string[];
  minSalary: number; // monthly NGN
  workModes: WorkMode[];
  employmentTypes: EmploymentType[];
}

export type WorkMode = 'remote' | 'hybrid' | 'onsite';
export type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'internship' | 'freelance';
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'lead';

export type DistrictId =
  | 'plaza'
  | 'corporate'
  | 'recruitment'
  | 'university'
  | 'tech'
  | 'creative'
  | 'healthcare'
  | 'hospitality'
  | 'finance'
  | 'apartment'
  | 'ai-center';

export interface Job {
  id: Id;
  organizationId: Id;
  title: string;
  department: string;
  district: DistrictId;
  location: string;
  workMode: WorkMode;
  employmentType: EmploymentType;
  level: ExperienceLevel;
  minYears: number;
  salaryMin: number; // monthly NGN
  salaryMax: number;
  skills: string[];
  requiredQualifications: string[];
  description: string;
  responsibilities: string[];
  postedOn: ISODate;
  closesOn: ISODate;
  status: 'draft' | 'published' | 'closed';
}

export type ApplicationStatus =
  | 'submitted'
  | 'screening'
  | 'shortlisted'
  | 'interview'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'withdrawn';

export interface Application {
  id: Id;
  jobId: Id;
  candidateId: Id;
  candidateName: string;
  status: ApplicationStatus;
  submittedAt: ISODateTime;
  coverLetter: string;
  /** Explainable fit snapshot at submission time (synthetic heuristic). */
  fitScore: number;
  history: { status: ApplicationStatus; at: ISODateTime; note?: string }[];
  /** Always true in this build: nothing is sent to a real employer. */
  simulated: true;
}

export interface Interview {
  id: Id;
  applicationId: Id;
  jobId: Id;
  candidateId: Id;
  candidateName: string;
  scheduledAt: ISODateTime;
  durationMin: number;
  format: 'video' | 'onsite' | 'phone' | 'virtual-hq';
  interviewers: string[];
  status: 'scheduled' | 'completed' | 'cancelled';
  notes: string;
  scorecard: { criterion: string; score: number }[];
}

export type XpReason =
  | 'profile-complete'
  | 'cv-upload'
  | 'career-assessment'
  | 'skill-challenge'
  | 'suitable-application'
  | 'interview-simulation'
  | 'course-complete'
  | 'mission-complete';

export interface XpEvent {
  id: Id;
  reason: XpReason;
  amount: number;
  at: ISODateTime;
  ref?: string;
}

export interface CareerProgress {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  reputation: number;
}

export interface MissionObjective {
  id: string;
  label: string;
  /** Key evaluated by the mission engine against candidate state. */
  check:
    | 'profile-complete'
    | 'cv-uploaded'
    | 'assessment-done'
    | 'applications-3'
    | 'interview-sim-done'
    | 'skill-challenge-done'
    | 'course-done';
}

export interface Mission {
  id: Id;
  title: string;
  description: string;
  kind: 'career' | 'skill';
  objectives: MissionObjective[];
  rewardXp: number;
  district: DistrictId;
  orientations: ProfessionalOrientation[] | 'all';
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface SkillChallenge {
  id: Id;
  title: string;
  skill: string;
  district: DistrictId;
  xp: number;
  questions: QuizQuestion[];
}

export interface Course {
  id: Id;
  title: string;
  provider: string;
  skill: string;
  hours: number;
  modules: string[];
  xp: number;
}

export interface Achievement {
  id: Id;
  title: string;
  description: string;
  icon: string;
  /** Unlock rule evaluated locally — authoritative unlocks are backend-owned. */
  rule:
    | { type: 'xp'; min: number }
    | { type: 'applications'; min: number }
    | { type: 'missions'; min: number }
    | { type: 'challenges'; min: number }
    | { type: 'profile-complete' };
}

export interface NotificationItem {
  id: Id;
  at: ISODateTime;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  kind: 'application' | 'interview' | 'mission' | 'system' | 'social' | 'workplace';
}

export interface AIMessage {
  id: Id;
  role: 'user' | 'assistant';
  text: string;
  at: ISODateTime;
  /** Structured payloads the UI can render (job cards, confirmations). */
  jobIds?: Id[];
  pendingApplicationJobIds?: Id[];
}

// ── Organisations ───────────────────────────────────────────────────────────
export type OrgRole = 'org-admin' | 'hr-manager' | 'recruiter' | 'payroll-officer' | 'manager' | 'employee';
export type SubscriptionTier = 'starter' | 'growth' | 'enterprise';

export interface OrganizationMembership {
  organizationId: Id;
  roles: OrgRole[];
  employeeId?: Id;
}

export interface OfficeLocation {
  id: Id;
  name: string;
  city: string;
  address: string;
  headcountCapacity: number;
}

export interface Department {
  id: Id;
  name: string;
  headEmployeeId: Id | null;
  responsibilities: string;
  locationId: Id | null;
}

/** Public-safe organisation profile — the only org shape allowed in city payloads. */
export interface OrganizationPublicProfile {
  id: Id;
  name: string;
  tagline: string;
  logoColor: string;
  logoGlyph: string;
  industry: string;
  district: DistrictId;
  description: string;
  website: string;
  size: '1-10' | '11-50' | '51-200' | '201-1000' | '1000+';
  structure: string;
  workArrangements: WorkMode[];
  values: string[];
  culture: {
    environment: string;
    leadership: string;
    collaboration: string;
    development: string;
    inclusion: string;
    workLife: string;
  };
  benefits: string[];
  headquarters: string;
  verified: boolean;
}

export interface OrganizationPrivateWorkspace {
  organizationId: Id;
  tier: SubscriptionTier;
  locations: OfficeLocation[];
  departments: Department[];
  policies: Policy[];
  members: OrgMember[];
  invitations: Invitation[];
  workflows: { id: Id; name: string; steps: string[] }[];
  setupChecklist: Record<string, boolean>;
}

export interface OrgMember {
  id: Id;
  name: string;
  email: string;
  roles: OrgRole[];
  departmentId: Id | null;
  recruitingFor: Id[]; // department ids
  status: 'active' | 'invited' | 'suspended';
}

export interface Invitation {
  id: Id;
  email: string;
  roles: OrgRole[];
  sentAt: ISODateTime;
  status: 'pending' | 'accepted' | 'revoked';
}

export interface Policy {
  id: Id;
  title: string;
  category: 'leave' | 'conduct' | 'remote-work' | 'benefits' | 'security' | 'other';
  body: string;
  updatedAt: ISODate;
  acknowledgements: number;
}

// ── Recruitment ─────────────────────────────────────────────────────────────
export interface TalentProfile {
  id: Id;
  name: string;
  headline: string;
  location: string;
  yearsExperience: number;
  skills: SkillRating[];
  expectedSalary: number;
  workModes: WorkMode[];
  employmentTypes: EmploymentType[];
  qualifications: string[];
  avatar: AvatarConfig;
}

export interface Assessment {
  id: Id;
  jobId: Id;
  title: string;
  kind: 'skills-test' | 'case-study' | 'work-sample';
  questions: string[];
  results: { applicationId: Id; score: number; reviewer: string }[];
}

export interface Shortlist {
  id: Id;
  jobId: Id;
  name: string;
  applicationIds: Id[];
}

// ── HR ──────────────────────────────────────────────────────────────────────
export type EmployeeStatus = 'active' | 'onboarding' | 'offboarding' | 'on-leave' | 'exited';

export interface EmployeeRecord {
  id: Id;
  organizationId: Id;
  name: string;
  title: string;
  departmentId: Id;
  locationId: Id;
  managerId: Id | null;
  email: string;
  startDate: ISODate;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  avatar: AvatarConfig;
  /** Opt-in to the PUBLIC HQ directory (name + title only). */
  publicDirectory: boolean;
  documents: EmployeeDocument[];
  lifecycleTasks: LifecycleTask[];
  emergencyContact: string;
}

export interface EmployeeDocument {
  id: Id;
  name: string;
  kind: 'contract' | 'id' | 'certificate' | 'policy-ack' | 'other';
  addedOn: ISODate;
  /** Documents are metadata only in the frontend build — no file storage. */
  sizeKb: number;
}

export interface LifecycleTask {
  id: Id;
  phase: 'onboarding' | 'offboarding';
  label: string;
  owner: string;
  done: boolean;
}

export interface AttendanceEntry {
  employeeId: Id;
  date: ISODate;
  status: 'present' | 'remote' | 'late' | 'absent' | 'leave';
  hours: number;
}

export type LeaveType = 'annual' | 'sick' | 'parental' | 'study' | 'unpaid';

export interface LeaveRequest {
  id: Id;
  employeeId: Id;
  type: LeaveType;
  start: ISODate;
  end: ISODate;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decidedBy?: string;
}

export interface PerformanceReview {
  id: Id;
  employeeId: Id;
  cycle: string;
  reviewer: string;
  status: 'not-started' | 'self-review' | 'manager-review' | 'calibrated' | 'shared';
  rating: number | null; // 1–5
  goals: { title: string; progress: number }[];
  strengths: string;
  improvements: string;
}

// ── Payroll (SYNTHETIC PREVIEW ONLY) ────────────────────────────────────────
export interface PayComponent {
  id: Id;
  name: string;
  kind: 'allowance' | 'deduction';
  /** Percentage of base salary or fixed monthly NGN. */
  calc: { type: 'percent'; value: number } | { type: 'fixed'; value: number };
  taxable: boolean;
}

export interface CompensationStructure {
  id: Id;
  grade: string;
  minBase: number;
  maxBase: number;
  componentIds: Id[];
}

export interface CompensationRecord {
  employeeId: Id;
  structureId: Id;
  baseMonthly: number;
  currency: 'NGN';
  effectiveFrom: ISODate;
  bankOnFile: boolean;
  history: { date: ISODate; baseMonthly: number; reason: string }[];
}

export interface PayrollAdjustment {
  employeeId: Id;
  kind: 'bonus' | 'deduction';
  label: string;
  amount: number;
}

export interface PayslipLine {
  label: string;
  amount: number;
  kind: 'earning' | 'deduction';
}

export interface PayslipPreview {
  employeeId: Id;
  employeeName: string;
  period: string; // YYYY-MM
  lines: PayslipLine[];
  gross: number;
  totalDeductions: number;
  net: number;
  warnings: string[];
}

export interface PayrollPreview {
  id: Id;
  organizationId: Id;
  period: string;
  createdAt: ISODateTime;
  status: 'draft' | 'approved-preview';
  payslips: PayslipPreview[];
  totals: { gross: number; deductions: number; net: number; headcount: number };
  /** Always true — no funds move and no statutory filing occurs. */
  simulated: true;
}

// ── Engagement ──────────────────────────────────────────────────────────────
export interface Announcement {
  id: Id;
  organizationId: Id;
  title: string;
  body: string;
  author: string;
  publishedAt: ISODateTime;
  audience: 'all' | 'department' | 'public-hq';
  departmentId?: Id;
  pinned: boolean;
}

export interface Recognition {
  id: Id;
  organizationId: Id;
  from: string;
  toEmployeeId: Id;
  value: string;
  message: string;
  at: ISODateTime;
  reactions: number;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  kind: 'scale' | 'text';
}

export interface EngagementSurvey {
  id: Id;
  organizationId: Id;
  title: string;
  status: 'draft' | 'open' | 'closed';
  anonymous: boolean;
  questions: SurveyQuestion[];
  responses: { at: ISODateTime; answers: Record<string, number | string> }[];
  closesOn: ISODate;
}

export interface FeedbackItem {
  id: Id;
  organizationId: Id;
  category: 'idea' | 'concern' | 'praise' | 'question';
  body: string;
  at: ISODateTime;
  status: 'new' | 'acknowledged' | 'actioned';
  anonymous: boolean;
}

export interface TeamActivity {
  id: Id;
  organizationId: Id;
  title: string;
  date: ISODate;
  location: string;
  kind: 'social' | 'learning' | 'wellbeing' | 'volunteering';
  rsvps: Id[];
}

export interface CultureInitiative {
  id: Id;
  organizationId: Id;
  title: string;
  owner: string;
  progress: number;
  status: 'planned' | 'active' | 'done';
}

export interface WorkforceMetric {
  key: string;
  label: string;
  series: { label: string; value: number }[];
}

// ── Social / city ───────────────────────────────────────────────────────────
export interface CityDistrict {
  id: DistrictId;
  name: string;
  tagline: string;
  description: string;
  color: string;
  /** Block grid coordinates (world units derived by the city). */
  grid: { x: number; z: number };
  industries: string[];
  actions: CityPortalAction[];
}

export interface CityPortalAction {
  label: string;
  intent: CityIntent;
}

export interface CityBuilding {
  id: Id;
  district: DistrictId;
  name: string;
  kind: 'hq' | 'landmark' | 'residential' | 'venue' | 'service' | 'filler';
  organizationId?: Id;
  /** Offset within the district block, in block-local units (-1..1). */
  offset: { x: number; z: number };
  size: { w: number; d: number; h: number };
  color: string;
  enterable: boolean;
}

export interface CityEvent {
  id: Id;
  title: string;
  kind: 'career-fair' | 'meetup' | 'workshop' | 'social' | 'conference';
  district: DistrictId;
  venue: string;
  start: ISODateTime;
  end: ISODateTime;
  host: string;
  hostOrganizationId?: Id;
  description: string;
  capacity: number;
  attendeeCount: number;
  tags: string[];
  communityId?: Id;
}

export interface Community {
  id: Id;
  name: string;
  description: string;
  topic: string;
  members: number;
  district: DistrictId;
  /** Personality affinity used ONLY to personalise social recommendations. */
  affinity: Partial<PersonalityTraits>;
  posts: { id: Id; author: string; text: string; at: ISODateTime }[];
}

export interface SocialProfile {
  id: Id;
  name: string;
  headline: string;
  district: DistrictId;
  avatar: AvatarConfig;
  interests: string[];
}

export interface PresenceProjection {
  id: Id;
  displayName: string;
  avatar: AvatarConfig;
  district: DistrictId;
  position: { x: number; z: number };
  status: 'exploring' | 'at-event' | 'in-building' | 'idle';
  /** Always 'simulated' until a realtime backend contract is approved. */
  source: 'simulated';
}

export interface PrivacySettings {
  presenceVisibility: 'everyone' | 'connections' | 'hidden';
  showInEventAttendees: boolean;
  allowInvitations: 'everyone' | 'connections' | 'nobody';
  allowMessages: 'everyone' | 'connections' | 'nobody';
  profileDiscoverable: boolean;
  blockedIds: Id[];
}

// ── City → web navigation ───────────────────────────────────────────────────
/**
 * Allowlisted organisation workspace areas a city HQ object may open. The web
 * workspace (and, in production, the backend) decides whether the signed-in
 * member may see them — the city never checks or implies access.
 */
export type OrgArea =
  | 'overview'
  | 'people'
  | 'structure'
  | 'hr-leave'
  | 'hr-attendance'
  | 'hr-documents'
  | 'hr-lifecycle'
  | 'hr-performance'
  | 'hr-policies'
  | 'payroll'
  | 'analytics'
  | 'recruitment-pipeline'
  | 'recruitment-interviews'
  | 'recruitment-analytics'
  | 'engagement'
  | 'engagement-recognition'
  | 'engagement-activities'
  | 'engagement-culture'
  | 'settings';

export type CityIntent =
  | { type: 'viewJob'; jobId: Id }
  | { type: 'browseJobs'; district?: DistrictId }
  | { type: 'viewOrganization'; organizationId: Id }
  | { type: 'openRecruitment'; organizationId: Id }
  | { type: 'openEmployeePortal'; organizationId: Id }
  | { type: 'openOrgArea'; organizationId: Id; area: OrgArea }
  | { type: 'openCareerCenter' }
  | { type: 'openDashboard' }
  | { type: 'openProfile' }
  | { type: 'openCv' }
  | { type: 'openAchievements' }
  | { type: 'openMissions'; district?: DistrictId }
  | { type: 'openLearning' }
  | { type: 'openSkills' }
  | { type: 'openInterviews' }
  | { type: 'openNotifications' }
  | { type: 'openApplications' }
  | { type: 'viewEvent'; eventId: Id }
  | { type: 'viewCommunity'; communityId: Id }
  | { type: 'openSocial' }
  | { type: 'openPrivacy' }
  | { type: 'signIn' };
