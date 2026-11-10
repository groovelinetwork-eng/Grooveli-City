import {
  CITY_EVENTS,
  COMMUNITIES,
  COMPENSATION_STRUCTURES,
  DEMO_CANDIDATE,
  JOBS,
  ORGANIZATIONS,
  ORG_EMPLOYEES,
  ORG_HR,
  PAY_COMPONENTS,
  SEED_ACTIVITIES,
  SEED_ANNOUNCEMENTS,
  SEED_APPLICATIONS,
  SEED_ASSESSMENTS,
  SEED_FEEDBACK,
  SEED_INITIATIVES,
  SEED_INTERVIEWS,
  SEED_RECOGNITION,
  SEED_SHORTLISTS,
  SEED_SURVEYS,
  WORKSPACES,
  type AIMessage,
  type Announcement,
  type Application,
  type Assessment,
  type AttendanceEntry,
  type CandidateProfile,
  type CityEvent,
  type Community,
  type CompensationRecord,
  type CompensationStructure,
  type CultureInitiative,
  type EmployeeRecord,
  type EngagementSurvey,
  type FeedbackItem,
  type Interview,
  type Job,
  type LeaveRequest,
  type NotificationItem,
  type OrgModule,
  type OrganizationPrivateWorkspace,
  type OrganizationPublicProfile,
  type PayComponent,
  type PayrollPreview,
  type PerformanceReview,
  type PersonaId,
  type PrivacySettings,
  type Recognition,
  type Shortlist,
  type SubscriptionTier,
  type TeamActivity,
  type XpEvent,
} from '@grooveli/frontend-domain';

export const STATE_VERSION = 2;

export interface DemoSession {
  personaId: PersonaId;
  activeOrganizationId: string | null;
  signedInAt: string;
}

export interface Connection {
  profileId: string;
  status: 'pending' | 'connected';
  at: string;
}

export interface SocialInvitation {
  id: string;
  eventId: string;
  to: string; // display name of invitee (synthetic profile)
  from: string;
  at: string;
  direction: 'sent' | 'received';
  status: 'pending' | 'accepted' | 'declined';
}

export interface SafetyReport {
  id: string;
  targetName: string;
  reason: string;
  details: string;
  at: string;
  status: 'submitted';
}

export interface DemoState {
  stateVersion: number;
  session: DemoSession | null;

  // Candidate
  candidate: CandidateProfile;
  candidateOnboarded: boolean;
  savedJobIds: string[];
  xp: XpEvent[];
  challengeResults: { challengeId: string; score: number; total: number; at: string }[];
  courseProgress: Record<string, number[]>; // courseId -> completed module indexes
  assessmentDone: boolean;
  interviewSims: { at: string; score: number; role: string }[];
  missionsClaimed: string[];
  notifications: NotificationItem[];
  aiThread: AIMessage[];

  // Marketplace (shared by candidate & employer views)
  jobs: Job[];
  applications: Application[];
  interviews: Interview[];

  // Organisations
  organizations: OrganizationPublicProfile[];
  workspaces: OrganizationPrivateWorkspace[];
  tierModules: Partial<Record<SubscriptionTier, OrgModule[]>>;
  assessments: Assessment[];
  shortlists: Shortlist[];

  // HR
  employees: EmployeeRecord[];
  attendance: AttendanceEntry[];
  leave: LeaveRequest[];
  reviews: PerformanceReview[];

  // Payroll (synthetic preview)
  compensation: CompensationRecord[];
  payComponents: PayComponent[];
  structures: CompensationStructure[];
  payrollRuns: PayrollPreview[];

  // Engagement
  announcements: Announcement[];
  recognition: Recognition[];
  surveys: EngagementSurvey[];
  feedback: FeedbackItem[];
  activities: TeamActivity[];
  initiatives: CultureInitiative[];
  policyAcks: string[]; // policy ids acknowledged by current employee persona

  // Social
  events: CityEvent[];
  communities: Community[];
  rsvps: string[];
  joinedCommunities: string[];
  connections: Connection[];
  invitations: SocialInvitation[];
  privacy: PrivacySettings;
  reports: SafetyReport[];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function createInitialState(): DemoState {
  return clone({
    stateVersion: STATE_VERSION,
    session: null,
    candidate: DEMO_CANDIDATE,
    candidateOnboarded: false,
    savedJobIds: ['job-m-hrops'],
    xp: [],
    challengeResults: [],
    courseProgress: {},
    assessmentDone: false,
    interviewSims: [],
    missionsClaimed: [],
    notifications: [
      {
        id: 'n-welcome',
        at: '2026-11-09T08:00:00.000Z',
        title: 'Welcome to Grooveli',
        body: 'This is a demo build: everything you see is synthetic data stored only in this browser.',
        read: false,
        kind: 'system',
      },
    ],
    aiThread: [],
    jobs: JOBS,
    applications: SEED_APPLICATIONS,
    interviews: SEED_INTERVIEWS,
    organizations: ORGANIZATIONS,
    workspaces: WORKSPACES,
    tierModules: {},
    assessments: SEED_ASSESSMENTS,
    shortlists: SEED_SHORTLISTS,
    employees: Object.values(ORG_EMPLOYEES).flat(),
    attendance: Object.values(ORG_HR).flatMap((h) => h.attendance),
    leave: Object.values(ORG_HR).flatMap((h) => h.leave),
    reviews: Object.values(ORG_HR).flatMap((h) => h.reviews),
    compensation: Object.values(ORG_HR).flatMap((h) => h.compensation),
    payComponents: PAY_COMPONENTS,
    structures: COMPENSATION_STRUCTURES,
    payrollRuns: [],
    announcements: SEED_ANNOUNCEMENTS,
    recognition: SEED_RECOGNITION,
    surveys: SEED_SURVEYS,
    feedback: SEED_FEEDBACK,
    activities: SEED_ACTIVITIES,
    initiatives: SEED_INITIATIVES,
    policyAcks: [],
    events: CITY_EVENTS,
    communities: COMMUNITIES,
    rsvps: [],
    joinedCommunities: [],
    connections: [{ profileId: 'soc-3', status: 'connected', at: '2026-10-20T10:00:00.000Z' }],
    invitations: [
      {
        id: 'inv-seed-1',
        eventId: 'evt-plaza-meetup',
        to: 'You',
        from: 'Grace Ayodele',
        at: '2026-11-08T12:00:00.000Z',
        direction: 'received',
        status: 'pending',
      },
    ],
    privacy: {
      presenceVisibility: 'connections',
      showInEventAttendees: true,
      allowInvitations: 'connections',
      allowMessages: 'connections',
      profileDiscoverable: true,
      blockedIds: [],
    },
    reports: [],
  } satisfies DemoState);
}
