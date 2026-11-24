import { Schema, arr, bool, date, dateTime, enumOf, id, idArr, int, nullable, obj, period, record, ref, str, text } from './schema-helpers';
import type { OrgModule, Permission } from './schemas';

/**
 * The endpoint catalogue. One entry per operation; document.ts turns these
 * into OpenAPI paths with the shared envelope, auth, error responses and
 * permission metadata. Paths are relative to the server URL (/api/v1).
 */

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Who may call the operation.
 * - public: no session needed
 * - optional: works signed out; richer when signed in
 * - user: any signed-in user
 * - platform: Grooveli platform staff only
 * - member: any active member of {orgId}
 * - org-admin: holds the org-admin role in {orgId}
 * - a Permission (or several = any of them) in {orgId}
 */
export type Access = 'public' | 'optional' | 'user' | 'platform' | 'member' | 'org-admin' | Permission | Permission[];

export interface Route {
  method: Method;
  path: string;
  operationId: string;
  summary: string;
  tag: string;
  access: Access;
  /** Extra rule shown next to the access requirement, e.g. "or self". */
  accessNote?: string;
  module?: OrgModule;
  description?: string;
  query?: Record<string, Schema>;
  /** Query parameters that are required. */
  requiredQuery?: string[];
  body?: Schema;
  multipart?: { fields: Record<string, Schema>; required: string[]; maxMb: number; types: string[] };
  /** Response data. null → data is null. */
  returns?: Schema | null;
  /** Paginated list of this item schema. */
  page?: Schema;
  status?: 200 | 201 | 202;
  /** Adds 409 CONFLICT. */
  conflict?: string;
  /** Adds 409 NOT_ALLOWED_IN_STATE. */
  state?: string;
  /** Response is not wrapped in the envelope (games). */
  raw?: boolean;
  /** Not in the original frontend list — added for production. */
  added?: boolean;
  /** Stricter per-route rate limit, e.g. "5/min per IP". */
  rateLimit?: string;
  /** Cache-Control for public reads. */
  cache?: string;
  /** Sets or clears the session cookie. */
  setsCookie?: boolean;
  /** Accepts Idempotency-Key. */
  idempotent?: boolean;
}

type Opts = Omit<Route, 'method' | 'path' | 'operationId' | 'summary' | 'tag' | 'access'> & {
  access?: Access;
};
type Def = [Method, string, string, string, Opts?];

function section(tag: string, defaults: { prefix?: string; access: Access; module?: OrgModule }, defs: Def[]): Route[] {
  return defs.map(([method, path, operationId, summary, opts = {}]) => ({
    method,
    path: path.startsWith('…') ? `${defaults.prefix}${path.slice(1)}` : path,
    operationId,
    summary,
    tag,
    module: defaults.module,
    ...opts,
    access: opts.access ?? defaults.access,
  }));
}

// Reusable query params
const sortQ = { sort: str({ description: 'Field name, prefix with - for descending, e.g. -postedOn' }) };
const dateRange = { from: date(), to: date() };
const leaveStatus = enumOf(['pending', 'approved', 'rejected', 'cancelled']);

// ─────────────────────────────────────────────────────────────────────────────
const system = section('System', { access: 'public' }, [
  ['get', '/health', 'getHealth', 'Liveness probe', { returns: ref('Health'), added: true, description: 'Returns 200 while the process is up. Not rate limited. For load balancers.' }],
  ['get', '/health/ready', 'getReadiness', 'Readiness probe', { returns: ref('Health'), added: true, description: 'Checks database, cache and object storage. Returns 503 SERVICE_UNAVAILABLE when a dependency is down.' }],
]);

const auth = section('Auth', { access: 'public' }, [
  ['post', '/auth/signup', 'signup', 'Create an account', {
    body: ref('SignupRequest'), returns: ref('Session'), status: 201, setsCookie: true, rateLimit: '5/hour per IP',
    conflict: 'Email already registered (returned as a generic message to avoid account enumeration)',
    description: 'Creates the user, starts a session and sends a verification email. accountType "organization" sends the user to organisation onboarding (POST /orgs).',
  }],
  ['post', '/auth/login', 'login', 'Sign in', {
    body: ref('LoginRequest'), returns: ref('Session'), setsCookie: true, rateLimit: '10/15min per IP+email',
    description: 'Wrong email or password both return 401 UNAUTHENTICATED with the same message. Repeated failures lock the account for 15 minutes.',
  }],
  ['post', '/auth/logout', 'logout', 'Sign out', { access: 'user', returns: null, setsCookie: true, description: 'Revokes the session server-side and clears the cookie.' }],
  ['get', '/auth/session', 'getSession', 'Current session', { access: 'user', returns: ref('Session'), description: 'Returns 401 when signed out. The frontend calls this on load.' }],
  ['put', '/auth/session/active-organization', 'setActiveOrganization', 'Switch active organisation', {
    access: 'user', body: obj({ organizationId: nullable(id()) }, { strict: true }), returns: ref('Session'),
    description: 'organizationId must be one of the caller\'s memberships (403 otherwise). null switches to the candidate view.',
  }],
  ['post', '/auth/password/forgot', 'forgotPassword', 'Request a password reset email', {
    body: obj({ email: str({ format: 'email' }) }, { strict: true }), returns: null, status: 202, rateLimit: '3/hour per email',
    description: 'Always returns 202, whether or not the email exists. The token is single use and expires in 30 minutes.',
  }],
  ['post', '/auth/password/reset', 'resetPassword', 'Set a new password with a reset token', {
    body: obj({ token: text(256, { minLength: 16 }), password: str({ minLength: 10, maxLength: 128, format: 'password' }) }, { strict: true }),
    returns: null, rateLimit: '10/hour per IP', description: 'Revokes every existing session for the user.',
  }],
  ['post', '/auth/password/change', 'changePassword', 'Change password while signed in', {
    access: 'user', added: true, rateLimit: '5/hour per user',
    body: obj({ currentPassword: str({ format: 'password', maxLength: 128 }), newPassword: str({ minLength: 10, maxLength: 128, format: 'password' }) }, { strict: true }),
    returns: null, description: 'Revokes all other sessions.',
  }],
  ['post', '/auth/email/verify', 'verifyEmail', 'Confirm an email address', {
    added: true, body: obj({ token: text(256, { minLength: 16 }) }, { strict: true }), returns: null, rateLimit: '10/hour per IP',
  }],
  ['post', '/auth/email/resend', 'resendVerificationEmail', 'Resend the verification email', {
    access: 'user', added: true, returns: null, status: 202, rateLimit: '3/hour per user',
  }],
  ['post', '/invitations/{token}/accept', 'acceptOrgInvitation', 'Accept an organisation invitation', {
    access: 'user', returns: ref('Session'),
    description: 'The signed-in email must match the invited email. Invitations expire after 7 days.',
    state: 'Invitation revoked, expired or already accepted',
  }],
]);

const account = section('Account', { access: 'user' }, [
  ['get', '/me/export', 'requestDataExport', 'Request a copy of my data', {
    added: true, status: 202, returns: obj({ requestId: id(), status: enumOf(['queued', 'ready']) }), rateLimit: '1/day per user',
    description: 'NDPA (Nigeria Data Protection Act) access request. A download link is emailed when ready.',
  }],
  ['delete', '/me/account', 'deleteAccount', 'Delete my account', {
    added: true, body: obj({ password: str({ format: 'password', maxLength: 128 }) }, { strict: true }), returns: null, setsCookie: true,
    state: 'Caller is the last org-admin of an organisation',
    description: 'Soft-deletes now, purges personal data after 30 days. Employment records owned by an organisation are kept per its retention policy.',
  }],
]);

const profile = section('Candidate profile', { access: 'user' }, [
  ['get', '/me/profile', 'getMyProfile', 'My candidate profile', { returns: ref('CandidateProfile') }],
  ['post', '/me/onboarding', 'completeOnboarding', 'Complete candidate onboarding', {
    body: ref('CandidateProfileInput'), returns: obj({ xp: ref('XpDecision') }), conflict: 'Onboarding already complete',
  }],
  ['patch', '/me/profile', 'updateMyProfile', 'Update my profile', { body: ref('CandidateProfilePatch'), returns: obj({ xp: nullable(ref('XpDecision')) }) }],
  ['post', '/me/cv', 'uploadCv', 'Upload or replace my CV', {
    multipart: { fields: { file: str({ format: 'binary' }) }, required: ['file'], maxMb: 5, types: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
    returns: obj({ xp: ref('XpDecision') }), rateLimit: '10/hour per user',
    description: 'Files are virus-scanned and stored privately. The type is checked from file contents, not the extension.',
  }],
  ['get', '/me/cv', 'getCv', 'My CV metadata and download link', { returns: nullable(ref('CvInfo')) }],
  ['delete', '/me/cv', 'deleteCv', 'Delete my CV', { returns: null }],
  ['get', '/me/privacy', 'getPrivacy', 'My privacy settings', { returns: ref('PrivacySettings') }],
  ['patch', '/me/privacy', 'updatePrivacy', 'Update privacy settings', { body: ref('PrivacySettingsPatch'), returns: ref('PrivacySettings') }],
]);

const jobQ = {
  q: text(100, { description: 'Free-text search over title, skills and organisation' }),
  district: ref('DistrictId'),
  organizationId: id(),
  workMode: ref('WorkMode'),
  employmentType: ref('EmploymentType'),
  level: ref('ExperienceLevel'),
  minSalary: int({ minimum: 0 }),
  ...sortQ,
};

const jobs = section('Jobs & applications', { access: 'user' }, [
  ['get', '/jobs', 'listJobs', 'Search published jobs', { access: 'public', query: jobQ, page: ref('Job'), cache: 'public, max-age=30' }],
  ['get', '/jobs/{jobId}', 'getJob', 'Job details', { access: 'public', returns: ref('Job'), cache: 'public, max-age=30', description: 'Draft jobs return 404 to the public.' }],
  ['get', '/me/job-matches', 'listJobMatches', 'Jobs ranked for me', {
    page: ref('JobMatch'), query: { minScore: int({ minimum: 0, maximum: 100 }) },
    description: 'Ranking uses skills, experience, location, salary, work mode, employment type and qualifications only.',
  }],
  ['get', '/me/job-matches/{jobId}', 'getJobMatch', 'My match for one job', { returns: ref('MatchResult') }],
  ['get', '/me/saved-jobs', 'listSavedJobs', 'IDs of my saved jobs', { returns: idArr(500) }],
  ['put', '/me/saved-jobs/{jobId}', 'saveJob', 'Save a job', { returns: obj({ saved: bool() }) }],
  ['delete', '/me/saved-jobs/{jobId}', 'unsaveJob', 'Unsave a job', { returns: obj({ saved: bool() }) }],
  ['post', '/jobs/{jobId}/applications', 'applyToJob', 'Apply to a job', {
    body: obj({ coverLetter: text(5000) }, { strict: true }), status: 201, idempotent: true, rateLimit: '30/day per user',
    returns: obj({ application: ref('Application'), xp: ref('XpDecision') }),
    conflict: 'Already applied to this job', state: 'Job is not published or has closed',
  }],
  ['get', '/me/applications', 'listMyApplications', 'My applications', { page: ref('Application'), query: { status: ref('ApplicationStatus') } }],
  ['post', '/me/applications/{applicationId}/withdraw', 'withdrawApplication', 'Withdraw an application', {
    returns: ref('Application'), state: 'Application already withdrawn, hired or rejected',
  }],
  ['get', '/me/interviews', 'listMyInterviews', 'My interviews', { returns: arr(ref('Interview')), query: dateRange }],
]);

const career = section('Career progress', { access: 'user' }, [
  ['get', '/me/progress', 'getProgress', 'My XP, level and recent XP events', { returns: obj({ progress: ref('CareerProgress'), events: arr(ref('XpEvent')) }) }],
  ['get', '/career/challenges', 'listChallenges', 'Skill challenges', { returns: arr(ref('SkillChallengePublic')), query: { district: ref('DistrictId') } }],
  ['post', '/career/challenges/{challengeId}/attempts', 'attemptChallenge', 'Submit a challenge attempt', {
    body: obj({ answers: arr(int({ minimum: 0 }), { maxItems: 50 }) }, { strict: true }), returns: ref('ChallengeAttemptResult'),
    rateLimit: '20/hour per user', description: 'Answers are indexes into each question\'s options, in question order.',
  }],
  ['get', '/career/assessment', 'getAssessment', 'Career assessment questions', { returns: arr(ref('QuizQuestionPublic')) }],
  ['post', '/career/assessment', 'submitAssessment', 'Submit the career assessment', {
    body: obj({ answers: record(text(200)) }, { strict: true }), returns: obj({ xp: ref('XpDecision') }),
  }],
  ['post', '/career/interview-simulations', 'recordInterviewSimulation', 'Record an interview simulation', {
    body: obj({ role: text(80, { minLength: 1 }), score: int({ minimum: 0, maximum: 100 }) }, { strict: true }),
    returns: obj({ xp: ref('XpDecision') }), rateLimit: '10/day per user',
  }],
  ['get', '/career/courses', 'listCourses', 'Courses with my progress', { returns: arr(ref('CourseWithProgress')) }],
  ['put', '/me/courses/{courseId}/modules/{moduleIndex}', 'completeCourseModule', 'Mark a course module complete', {
    returns: obj({ completed: bool(), xp: nullable(ref('XpDecision')) }),
  }],
  ['delete', '/me/courses/{courseId}/modules/{moduleIndex}', 'uncompleteCourseModule', 'Mark a course module not complete', {
    returns: obj({ completed: bool(), xp: nullable(ref('XpDecision')) }), description: 'XP already awarded is not taken back.',
  }],
  ['get', '/career/missions', 'listMissions', 'Missions with my progress', { returns: arr(ref('MissionWithProgress')) }],
  ['post', '/me/missions/{missionId}/claim', 'claimMission', 'Claim a completed mission', {
    returns: obj({ xp: ref('XpDecision') }), conflict: 'Already claimed', state: 'Objectives not all complete',
  }],
  ['get', '/me/achievements', 'listAchievements', 'Achievements and whether I unlocked them', { returns: arr(ref('AchievementWithStatus')) }],
  ['get', '/me/notifications', 'listNotifications', 'My notifications', { page: ref('NotificationItem'), query: { unread: bool() } }],
  ['post', '/me/notifications/read', 'markNotificationsRead', 'Mark notifications read', {
    body: obj({ ids: { oneOf: [idArr(200), enumOf(['all'])] } }, { strict: true }), returns: null,
  }],
]);

const assistant = section('AI assistant', { access: 'user' }, [
  ['get', '/me/assistant/thread', 'getAssistantThread', 'My assistant conversation', { returns: arr(ref('AIMessage')) }],
  ['post', '/me/assistant/messages', 'sendAssistantMessage', 'Send a message to the assistant', {
    body: obj({ text: text(2000, { minLength: 1 }) }, { strict: true }), returns: ref('AIMessage'), rateLimit: '30/hour per user',
    description: 'Claude (claude-opus-5-5) with tools to read the caller’s job-relevant profile, search jobs, explain matches and propose applications. It never submits anything. Personality, gender, photo and contact details are never sent to the model. 503 SERVICE_UNAVAILABLE when ANTHROPIC_API_KEY is not set or Claude is unavailable.',
  }],
  ['post', '/me/assistant/confirm-applications', 'confirmAssistantApplications', 'Submit applications the assistant suggested', {
    body: obj({ jobIds: idArr(10) }, { strict: true }), returns: obj({ submitted: arr(ref('Application')), skipped: arr(obj({ jobId: id(), reason: str() })) }),
    idempotent: true, description: 'Only jobIds the assistant suggested in this thread are accepted. Closed jobs and duplicates are skipped and listed.',
  }],
  ['delete', '/me/assistant/thread', 'clearAssistantThread', 'Clear my assistant conversation', { returns: null }],
]);

const orgsS = section('Organisations', { access: 'member' }, [
  ['get', '/orgs', 'listOrganizations', 'Public organisation directory', {
    access: 'public', page: ref('OrganizationPublicProfile'), cache: 'public, max-age=60',
    query: { district: ref('DistrictId'), industry: text(60), q: text(100) },
  }],
  ['get', '/orgs/{orgId}', 'getOrganization', 'Public organisation profile and vacancies', {
    access: 'public', cache: 'public, max-age=60',
    returns: obj({ profile: ref('OrganizationPublicProfile'), vacancies: arr(ref('PublicVacancy')) }),
  }],
  ['post', '/orgs', 'createOrganization', 'Onboard a new organisation', {
    access: 'user', body: ref('OrganizationInput'), returns: obj({ organizationId: id() }), status: 201, idempotent: true,
    rateLimit: '3/day per user', description: 'The caller becomes the first org-admin. Invitations in the body are emailed. New organisations start unverified.',
  }],
  ['patch', '/orgs/{orgId}/profile', 'updateOrganizationProfile', 'Update the public profile', {
    access: 'org.settings.manage', body: ref('OrganizationProfilePatch'), returns: ref('OrganizationPublicProfile'),
  }],
  ['get', '/orgs/{orgId}/workspace', 'getWorkspace', 'Private workspace', { returns: ref('OrganizationPrivateWorkspace') }],
  ['patch', '/orgs/{orgId}/workspace', 'updateWorkspace', 'Update workflows and setup checklist', {
    access: 'org.settings.manage', body: ref('WorkspacePatch'), returns: ref('OrganizationPrivateWorkspace'),
  }],
  ['get', '/orgs/{orgId}/members', 'listMembers', 'Members', { access: 'org.members.manage', page: ref('OrgMember'), query: { status: enumOf(['active', 'invited', 'suspended']), q: text(100) } }],
  ['post', '/orgs/{orgId}/invitations', 'inviteMember', 'Invite a member', {
    access: 'org.members.manage', body: ref('InvitationCreate'), returns: ref('Invitation'), status: 201, rateLimit: '50/day per org',
    conflict: 'Already a member or has a pending invitation',
  }],
  ['delete', '/orgs/{orgId}/invitations/{invitationId}', 'revokeInvitation', 'Revoke an invitation', { access: 'org.members.manage', returns: null, state: 'Invitation already accepted' }],
  ['put', '/orgs/{orgId}/members/{memberId}/roles', 'setMemberRoles', 'Set a member\'s roles', {
    access: 'org.members.manage', body: obj({ roles: arr(ref('OrgRole'), { minItems: 1, uniqueItems: true }) }, { strict: true }),
    returns: ref('OrgMember'), state: 'Would leave the organisation without an active org-admin',
  }],
  ['put', '/orgs/{orgId}/members/{memberId}/status', 'setMemberStatus', 'Suspend or reactivate a member', {
    access: 'org.members.manage', body: obj({ status: enumOf(['active', 'suspended']) }, { strict: true }),
    returns: ref('OrgMember'), state: 'Would suspend the last active org-admin',
    description: 'Suspending revokes the member\'s access to this organisation immediately.',
  }],
  ['post', '/orgs/{orgId}/departments', 'createDepartment', 'Create a department', { access: 'org.settings.manage', body: ref('DepartmentInput'), returns: ref('Department'), status: 201, conflict: 'Name already used' }],
  ['patch', '/orgs/{orgId}/departments/{departmentId}', 'updateDepartment', 'Update a department', { access: 'org.settings.manage', added: true, body: ref('DepartmentInput'), returns: ref('Department') }],
  ['delete', '/orgs/{orgId}/departments/{departmentId}', 'deleteDepartment', 'Delete a department', { access: 'org.settings.manage', added: true, returns: null, state: 'Department still has employees' }],
  ['post', '/orgs/{orgId}/locations', 'createLocation', 'Add an office location', { access: 'org.settings.manage', body: ref('OfficeLocationInput'), returns: ref('OfficeLocation'), status: 201 }],
  ['patch', '/orgs/{orgId}/locations/{locationId}', 'updateLocation', 'Update an office location', { access: 'org.settings.manage', added: true, body: ref('OfficeLocationInput'), returns: ref('OfficeLocation') }],
  ['delete', '/orgs/{orgId}/locations/{locationId}', 'deleteLocation', 'Remove an office location', { access: 'org.settings.manage', added: true, returns: null, state: 'Location still has employees or departments' }],
  ['get', '/orgs/{orgId}/structure', 'getStructure', 'Org chart', { access: 'hr.directory.view', returns: ref('OrgStructure') }],
  ['get', '/orgs/{orgId}/subscription', 'getSubscription', 'Plan and enabled modules', { access: 'org.billing.view', returns: ref('SubscriptionInfo') }],
  ['put', '/orgs/{orgId}/subscription', 'setSubscription', 'Change plan', {
    access: 'org-admin', body: obj({ tier: ref('SubscriptionTier') }, { strict: true }), returns: ref('SubscriptionInfo'),
    description: 'Billing is not live yet; changing plan only changes enabled modules. Data in a module that gets disabled is kept, not deleted.',
  }],
  ['put', '/platform/tiers/{tier}/modules', 'setTierModules', 'Set which modules a plan includes', {
    access: 'platform', body: obj({ modules: arr(ref('OrgModule'), { uniqueItems: true }) }, { strict: true }), returns: null,
  }],
  ['put', '/platform/orgs/{orgId}/verification', 'setOrganizationVerified', 'Mark an organisation verified', {
    access: 'platform', added: true, body: obj({ verified: bool(), note: text(500) }, { strict: true, optional: ['note'] }), returns: ref('OrganizationPublicProfile'),
  }],
  ['get', '/orgs/{orgId}/audit-log', 'listAuditLog', 'Audit log', {
    access: 'org-admin', added: true, page: ref('AuditEntry'),
    query: { actorId: id(), action: text(60), ...dateRange },
    description: 'Role changes, record edits, document and CV access, payroll actions. Kept 2 years; read-only.',
  }],
  ['get', '/orgs/{orgId}/dashboard', 'getOrgDashboard', 'Workspace dashboard counts', { returns: ref('OrgDashboard') }],
]);

const rec = section('Recruitment', { prefix: '/orgs/{orgId}/recruitment', access: 'recruitment.view', module: 'recruitment' }, [
  ['get', '…/vacancies', 'listVacancies', 'Vacancies (any status)', { page: ref('Job'), query: { status: enumOf(['draft', 'published', 'closed']), q: text(100), ...sortQ } }],
  ['post', '…/vacancies', 'createVacancy', 'Create a vacancy', { access: 'recruitment.manage', body: ref('JobInput'), returns: obj({ jobId: id() }), status: 201, idempotent: true }],
  ['put', '…/vacancies/{jobId}', 'replaceVacancy', 'Replace a vacancy', { access: 'recruitment.manage', body: ref('JobInput'), returns: ref('Job'), state: 'Vacancy is closed' }],
  ['put', '…/vacancies/{jobId}/status', 'setVacancyStatus', 'Publish, close or return a vacancy to draft', {
    access: 'recruitment.manage', body: obj({ status: enumOf(['draft', 'published', 'closed']) }, { strict: true }), returns: ref('Job'),
    state: 'Transition not allowed (e.g. closed → draft, or publishing with closesOn in the past)',
  }],
  ['delete', '…/vacancies/{jobId}', 'deleteVacancy', 'Delete a draft vacancy', { access: 'recruitment.manage', added: true, returns: null, state: 'Only drafts with no applications can be deleted; close the vacancy instead' }],
  ['get', '…/applications', 'listApplications', 'Applications', { page: ref('Application'), query: { jobId: id(), status: ref('ApplicationStatus'), ...sortQ } }],
  ['get', '…/applications/{applicationId}/cv', 'getApplicantCv', 'Applicant CV download link', {
    added: true, returns: nullable(ref('CvInfo')), description: 'Every access is written to the audit log.',
  }],
  ['post', '…/applications/{applicationId}/status', 'setApplicationStatus', 'Move an application through the pipeline', {
    access: 'recruitment.manage', body: obj({ status: ref('ApplicationStatus'), note: text(1000) }, { strict: true, optional: ['note'] }),
    returns: ref('Application'), state: 'Application is withdrawn, or the transition is not allowed',
    description: 'The candidate is notified. Setting "withdrawn" is not allowed here.',
  }],
  ['get', '…/interviews', 'listInterviews', 'Interviews', { returns: arr(ref('Interview')), query: { jobId: id(), ...dateRange } }],
  ['post', '…/interviews', 'scheduleInterview', 'Schedule an interview', { access: 'recruitment.manage', body: ref('InterviewCreate'), returns: obj({ interviewId: id() }), status: 201, state: 'Application is withdrawn or rejected' }],
  ['patch', '…/interviews/{interviewId}', 'updateInterview', 'Update an interview', { access: 'recruitment.manage', body: ref('InterviewPatch'), returns: ref('Interview') }],
  ['get', '…/talent', 'searchTalent', 'Search candidates visible to employers', {
    page: ref('TalentProfile'),
    query: { skills: text(300, { description: 'Comma-separated' }), location: text(80), minYears: int({ minimum: 0 }), maxSalary: int({ minimum: 0 }), workMode: ref('WorkMode') },
    description: 'Only candidates with visibility "public" or "employers". Never filters or ranks on personality, gender or photo.',
  }],
  ['post', '…/talent/{talentId}/invitations', 'inviteTalent', 'Invite a candidate to apply', {
    access: 'recruitment.manage', body: obj({ jobId: id() }, { strict: true }), returns: obj({ application: ref('Application') }), status: 201,
    conflict: 'Candidate already applied', rateLimit: '100/day per org',
  }],
  ['get', '…/shortlists', 'listShortlists', 'Shortlists', { returns: arr(ref('Shortlist')), query: { jobId: id() } }],
  ['post', '…/shortlists', 'createShortlist', 'Create a shortlist', { access: 'recruitment.manage', body: obj({ jobId: id(), name: text(80, { minLength: 1 }), applicationIds: idArr() }, { strict: true }), returns: ref('Shortlist'), status: 201 }],
  ['put', '…/shortlists/{shortlistId}/applications/{applicationId}', 'addToShortlist', 'Add an application to a shortlist', { access: 'recruitment.manage', returns: ref('Shortlist') }],
  ['delete', '…/shortlists/{shortlistId}/applications/{applicationId}', 'removeFromShortlist', 'Remove an application from a shortlist', { access: 'recruitment.manage', returns: ref('Shortlist') }],
  ['get', '…/assessments', 'listAssessments', 'Assessments', { returns: arr(ref('Assessment')), query: { jobId: id() } }],
  ['post', '…/assessments', 'createAssessment', 'Create an assessment', {
    access: 'recruitment.manage', status: 201, returns: ref('Assessment'),
    body: obj({ jobId: id(), title: text(120, { minLength: 1 }), kind: enumOf(['skills-test', 'case-study', 'work-sample']), questions: arr(text(1000), { minItems: 1, maxItems: 50 }) }, { strict: true }),
  }],
  ['post', '…/assessments/{assessmentId}/results', 'recordAssessmentResult', 'Record a candidate\'s result', {
    access: 'recruitment.manage', body: obj({ applicationId: id(), score: int({ minimum: 0, maximum: 100 }) }, { strict: true }), returns: ref('Assessment'),
    description: 'The reviewer is taken from the session.',
  }],
  ['get', '…/analytics', 'getRecruitmentAnalytics', 'Recruitment metrics', { returns: arr(ref('WorkforceMetric')), query: dateRange }],
]);

const HR = '/orgs/{orgId}/hr';
const hr = section('HR', { prefix: HR, access: 'hr.records.manage', module: 'hr' }, [
  ['get', '…/employees', 'listEmployees', 'Employee directory', {
    access: 'hr.directory.view', page: ref('EmployeeRecord'),
    query: { departmentId: id(), locationId: id(), status: ref('EmployeeStatus'), q: text(100), ...sortQ },
    description: 'Callers without hr.records.manage get directory fields only (no emergencyContact, documents or lifecycleTasks).',
  }],
  ['get', '…/employees/{employeeId}', 'getEmployee', 'Employee record', { access: 'hr.records.manage', accessNote: 'or the employee themself', returns: ref('EmployeeRecord') }],
  ['post', '…/employees', 'createEmployee', 'Add an employee', {
    body: ref('EmployeeCreate'), returns: obj({ employeeId: id() }), status: 201, idempotent: true, conflict: 'Email already used in this organisation',
    description: 'Creates the record in "onboarding" status with default onboarding tasks, and the compensation record when payroll is enabled.',
  }],
  ['patch', '…/employees/{employeeId}', 'updateEmployee', 'Update an employee record', { body: ref('EmployeePatch'), returns: ref('EmployeeRecord'), state: 'Employee has exited' }],
  ['post', '…/employees/{employeeId}/offboarding', 'startOffboarding', 'Start offboarding', {
    body: obj({ lastDay: date() }, { strict: true }), returns: ref('EmployeeRecord'), state: 'Already offboarding or exited',
  }],
  ['post', '…/employees/{employeeId}/offboarding/complete', 'completeOffboarding', 'Complete offboarding', {
    returns: ref('EmployeeRecord'), state: 'Not offboarding, or offboarding tasks still open',
    description: 'Sets status to "exited" and removes the employee\'s organisation membership.',
  }],
  ['put', '…/employees/{employeeId}/tasks/{taskId}', 'setLifecycleTask', 'Tick or untick an on/offboarding task', { body: obj({ done: bool() }, { strict: true }), returns: ref('LifecycleTask') }],
  ['get', '…/employees/{employeeId}/documents', 'listEmployeeDocuments', 'Employee documents', { accessNote: 'or the employee themself', returns: arr(ref('EmployeeDocument')) }],
  ['post', '…/employees/{employeeId}/documents', 'uploadEmployeeDocument', 'Upload an employee document', {
    status: 201, returns: ref('EmployeeDocument'), rateLimit: '60/hour per org',
    multipart: {
      fields: { file: str({ format: 'binary' }), kind: enumOf(['contract', 'id', 'certificate', 'policy-ack', 'other']), name: text(120, { minLength: 1 }) },
      required: ['file', 'kind', 'name'], maxMb: 10,
      types: ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    },
    description: 'Encrypted at rest and virus-scanned.',
  }],
  ['get', '…/employees/{employeeId}/documents/{documentId}', 'getEmployeeDocumentLink', 'Download link for a document', {
    added: true, accessNote: 'or the employee themself', returns: obj({ downloadUrl: str({ format: 'uri' }), expiresAt: dateTime() }),
    description: 'Short-lived signed URL. Every access is written to the audit log.',
  }],
  ['delete', '…/employees/{employeeId}/documents/{documentId}', 'deleteEmployeeDocument', 'Delete a document', { added: true, returns: null }],
  ['get', '…/leave', 'listLeave', 'Leave requests', {
    access: 'hr.leave.approve', accessNote: 'or own requests with self.service', page: ref('LeaveRequest'),
    query: { status: leaveStatus, employeeId: id(), ...dateRange },
    description: 'Managers see their direct reports; HR sees everyone.',
  }],
  ['post', '…/leave', 'requestLeave', 'Request leave', {
    access: 'self.service', body: ref('LeaveCreate'), returns: ref('LeaveRequest'), status: 201,
    conflict: 'Overlaps an existing pending or approved request', state: 'Not enough leave balance',
    description: 'employeeId must be the caller\'s own employee record unless the caller has hr.records.manage. Days are calculated by the server, excluding weekends and public holidays.',
  }],
  ['post', '…/leave/{leaveId}/decision', 'decideLeave', 'Approve, reject or cancel leave', {
    access: 'hr.leave.approve', accessNote: '"cancelled" by the requester is also allowed', body: obj({ decision: enumOf(['approved', 'rejected', 'cancelled']) }, { strict: true }),
    returns: ref('LeaveRequest'), state: 'Already decided, or leave already started',
    description: 'Approvers cannot decide their own requests.',
  }],
  ['get', '…/attendance', 'listAttendance', 'Attendance', { access: 'hr.directory.view', page: ref('AttendanceEntry'), query: { employeeId: id(), ...dateRange } }],
  ['post', '…/attendance/clock-in', 'clockIn', 'Clock in for today', {
    access: 'self.service', body: obj({ employeeId: id(), status: enumOf(['present', 'remote']) }, { strict: true }),
    returns: ref('AttendanceEntry'), conflict: 'Already clocked in today', description: 'Only for the caller\'s own employee record. The server sets the date and marks late arrivals.',
  }],
  ['post', '…/attendance/clock-out', 'clockOut', 'Clock out for today', {
    access: 'self.service', added: true, body: obj({ employeeId: id() }, { strict: true }), returns: ref('AttendanceEntry'),
    conflict: 'Already clocked out today', state: 'Not clocked in today', description: 'Only for the caller’s own employee record. Sets the hours worked.',
  }],
  ['get', '…/reviews', 'listReviews', 'Performance reviews', {
    access: 'hr.performance.manage', accessNote: 'or own reviews with self.service', returns: arr(ref('PerformanceReview')), query: { cycle: text(40), employeeId: id() },
  }],
  ['post', '…/reviews', 'createReviews', 'Start a review cycle', {
    access: 'hr.performance.manage', added: true, status: 201, returns: arr(ref('PerformanceReview')),
    body: obj({ cycle: text(40, { minLength: 1 }), employeeIds: idArr(5000) }, { strict: true }),
    conflict: 'A review already exists for that employee and cycle', description: 'Creates one "not-started" review per employee; the reviewer is each employee’s manager.',
  }],
  ['patch', '…/reviews/{reviewId}', 'updateReview', 'Update a performance review', {
    access: 'hr.performance.manage', body: ref('PerformanceReviewPatch'), returns: ref('PerformanceReview'), state: 'Review already shared',
  }],
  ['get', '…/policies', 'listPolicies', 'HR policies', { access: 'member', returns: arr(ref('Policy')) }],
  ['post', '…/policies', 'createPolicy', 'Create a policy', { access: 'hr.policies.manage', body: ref('PolicyInput'), returns: ref('Policy'), status: 201 }],
  ['put', '…/policies/{policyId}', 'replacePolicy', 'Update a policy', {
    access: 'hr.policies.manage', body: ref('PolicyInput'), returns: ref('Policy'), description: 'A changed policy resets acknowledgements; employees are asked to acknowledge again.',
  }],
  ['delete', '…/policies/{policyId}', 'deletePolicy', 'Archive a policy', { access: 'hr.policies.manage', added: true, returns: null, description: 'Archived, not erased: acknowledgement records are kept for audit.' }],
  ['post', '…/policies/{policyId}/acknowledge', 'acknowledgePolicy', 'Acknowledge a policy', { access: 'self.service', returns: null }],
  ['get', '/me/employee', 'getMyEmployment', 'My employee self-service view', {
    access: 'self.service', module: 'hr', query: { orgId: id() }, requiredQuery: ['orgId'], returns: ref('EmployeeSelfService'),
  }],
]);

const pay = section('Payroll (preview)', { prefix: '/orgs/{orgId}/payroll', access: 'payroll.view', module: 'payroll' }, [
  ['get', '…/compensation', 'listCompensation', 'Compensation records', { page: ref('CompensationRecord'), query: { departmentId: id() } }],
  ['put', '…/compensation/{employeeId}', 'setCompensation', 'Change base salary', { access: 'payroll.prepare', body: ref('CompensationUpdate'), returns: ref('CompensationRecord'), description: 'Appends to history. Must stay within the employee\'s structure range (warns otherwise).' }],
  ['get', '…/components', 'listPayComponents', 'Allowances and deductions', { returns: arr(ref('PayComponent')) }],
  ['put', '…/components/{componentId}', 'upsertPayComponent', 'Create or replace a pay component', { access: 'payroll.prepare', body: ref('PayComponent'), returns: ref('PayComponent') }],
  ['get', '…/structures', 'listStructures', 'Salary structures', { returns: arr(ref('CompensationStructure')) }],
  ['put', '…/structures/{structureId}', 'upsertStructure', 'Create or replace a salary structure', {
    access: 'payroll.prepare', added: true, returns: ref('CompensationStructure'),
    body: obj({ grade: text(40, { minLength: 1 }), minBase: int({ minimum: 0 }), maxBase: int({ minimum: 0 }), componentIds: arr(str(), { maxItems: 50 }) }, { strict: true }),
  }],
  ['put', '…/structures/{structureId}/components', 'setStructureComponents', 'Set a structure\'s components', { access: 'payroll.prepare', body: obj({ componentIds: idArr() }, { strict: true }), returns: ref('CompensationStructure') }],
  ['get', '…/previews', 'listPayrollPreviews', 'Payroll previews', { returns: arr(ref('PayrollPreview')), query: { period: period() } }],
  ['post', '…/previews', 'createPayrollPreview', 'Generate a payroll preview', {
    access: 'payroll.prepare', body: ref('PayrollPreviewCreate'), returns: ref('PayrollPreview'), status: 201, idempotent: true,
    conflict: 'An approved preview already exists for this period',
    description: 'Simulation only: simulated is always true, nothing is paid or filed. Tax and pension rules are pending.',
  }],
  ['post', '…/previews/{previewId}/approve', 'approvePayrollPreview', 'Approve a preview', { access: 'payroll.prepare', returns: ref('PayrollPreview'), state: 'Already approved', description: 'Marks it "approved-preview". Never creates a payment or a filing.' }],
  ['delete', '…/previews/{previewId}', 'deletePayrollPreview', 'Delete a draft preview', { access: 'payroll.prepare', returns: null, state: 'Approved previews cannot be deleted' }],
  ['get', '…/previews/{previewId}/payslips/{employeeId}', 'getPayslip', 'One payslip preview', { accessNote: 'or the employee themself', returns: ref('PayslipPreview') }],
  ['get', '…/reports', 'getPayrollReport', 'Payroll totals by period and department', { returns: arr(ref('PayrollReportRow')), query: { from: period(), to: period() } }],
]);

const eng = section('Engagement', { prefix: '/orgs/{orgId}/engagement', access: 'engagement.participate', module: 'engagement' }, [
  ['get', '…/announcements', 'listAnnouncements', 'Announcements', { page: ref('Announcement'), description: 'Department announcements are only shown to that department (and managers of engagement).' }],
  ['post', '…/announcements', 'createAnnouncement', 'Post an announcement', { access: 'engagement.manage', body: ref('AnnouncementInput'), returns: ref('Announcement'), status: 201 }],
  ['put', '…/announcements/{announcementId}', 'updateAnnouncement', 'Edit an announcement', { access: 'engagement.manage', added: true, body: ref('AnnouncementInput'), returns: ref('Announcement') }],
  ['delete', '…/announcements/{announcementId}', 'deleteAnnouncement', 'Delete an announcement', { access: 'engagement.manage', returns: null }],
  ['get', '…/recognition', 'listRecognition', 'Recognition wall', { page: ref('Recognition') }],
  ['post', '…/recognition', 'giveRecognition', 'Recognise a colleague', { body: ref('RecognitionInput'), returns: ref('Recognition'), status: 201, rateLimit: '20/day per user', state: 'Cannot recognise yourself' }],
  ['post', '…/recognition/{recognitionId}/reactions', 'reactToRecognition', 'React to a recognition', { returns: obj({ reactions: int() }), description: 'One reaction per person; repeating is a no-op.' }],
  ['get', '…/surveys', 'listSurveys', 'Engagement surveys', { returns: arr(ref('EngagementSurvey')), description: 'results is filled only for engagement.manage and never identifies respondents of anonymous surveys.' }],
  ['put', '…/surveys/{surveyId}', 'upsertSurvey', 'Create or update a survey', {
    access: 'engagement.manage', body: ref('SurveyInput'), returns: ref('EngagementSurvey'), state: 'Questions cannot change once the survey has responses',
  }],
  ['post', '…/surveys/{surveyId}/responses', 'respondToSurvey', 'Answer a survey', {
    body: ref('SurveyResponseInput'), returns: null, status: 201, conflict: 'Already responded', state: 'Survey is not open',
    description: 'For anonymous surveys the response is stored without any link to the respondent; only a one-way "has responded" marker is kept.',
  }],
  ['get', '…/feedback', 'listFeedback', 'Feedback', { access: 'engagement.manage', accessNote: 'participants see only their own non-anonymous items', page: ref('FeedbackItem'), query: { status: enumOf(['new', 'acknowledged', 'actioned']), category: enumOf(['idea', 'concern', 'praise', 'question']) } }],
  ['post', '…/feedback', 'submitFeedback', 'Submit feedback', { body: ref('FeedbackInput'), returns: ref('FeedbackItem'), status: 201, rateLimit: '10/day per user' }],
  ['put', '…/feedback/{feedbackId}/status', 'setFeedbackStatus', 'Update feedback status', { access: 'engagement.manage', body: obj({ status: enumOf(['new', 'acknowledged', 'actioned']) }, { strict: true }), returns: ref('FeedbackItem') }],
  ['get', '…/activities', 'listActivities', 'Team activities', { returns: arr(ref('TeamActivity')), query: dateRange }],
  ['put', '…/activities/{activityId}', 'upsertActivity', 'Create or update an activity', { access: 'engagement.manage', body: ref('TeamActivityInput'), returns: ref('TeamActivity') }],
  ['put', '…/activities/{activityId}/rsvps/me', 'rsvpActivity', 'RSVP to an activity', { returns: ref('TeamActivity'), state: 'Activity is in the past' }],
  ['delete', '…/activities/{activityId}/rsvps/me', 'cancelActivityRsvp', 'Cancel my RSVP', { returns: ref('TeamActivity') }],
  ['get', '…/initiatives', 'listInitiatives', 'Culture initiatives', { returns: arr(ref('CultureInitiative')) }],
  ['put', '…/initiatives/{initiativeId}', 'upsertInitiative', 'Create or update an initiative', { access: 'engagement.manage', body: ref('CultureInitiativeInput'), returns: ref('CultureInitiative') }],
]);

const analytics = section('Analytics', { access: 'analytics.view', module: 'analytics' }, [
  ['get', '/orgs/{orgId}/analytics/workforce', 'getWorkforceAnalytics', 'Workforce metrics', {
    returns: arr(ref('WorkforceMetric')), query: dateRange,
    description: 'Totals only. Groups smaller than 5 people are suppressed so no individual can be identified.',
  }],
]);

const socialS = section('Social', { access: 'user' }, [
  ['get', '/social/events', 'listEvents', 'City events', { access: 'public', page: ref('CityEvent'), cache: 'public, max-age=60', query: { district: ref('DistrictId'), kind: enumOf(['career-fair', 'meetup', 'workshop', 'social', 'conference']), ...dateRange } }],
  ['get', '/social/events/{eventId}', 'getEvent', 'Event details and visible attendees', { access: 'optional', returns: ref('CityEventDetail') }],
  ['put', '/me/events/{eventId}/rsvp', 'rsvpEvent', 'RSVP to an event', { returns: obj({ attending: bool() }), state: 'Event is full or has ended' }],
  ['delete', '/me/events/{eventId}/rsvp', 'cancelEventRsvp', 'Cancel my RSVP', { returns: obj({ attending: bool() }) }],
  ['get', '/social/communities', 'listCommunities', 'Communities', { access: 'optional', page: ref('Community'), query: { district: ref('DistrictId'), q: text(100) } }],
  ['get', '/social/communities/{communityId}', 'getCommunity', 'Community and recent posts', { access: 'optional', returns: ref('Community') }],
  ['put', '/me/communities/{communityId}', 'joinCommunity', 'Join a community', { returns: obj({ joined: bool() }) }],
  ['delete', '/me/communities/{communityId}', 'leaveCommunity', 'Leave a community', { returns: obj({ joined: bool() }) }],
  ['get', '/social/communities/{communityId}/posts', 'listCommunityPosts', 'Community posts', { access: 'optional', added: true, page: ref('CommunityPost') }],
  ['post', '/social/communities/{communityId}/posts', 'createCommunityPost', 'Post in a community', {
    accessNote: 'members of the community only', body: obj({ text: text(2000, { minLength: 1 }) }, { strict: true }),
    returns: ref('CommunityPost'), status: 201, rateLimit: '30/hour per user', description: 'Text is run through content moderation before it is visible.',
  }],
  ['delete', '/social/communities/{communityId}/posts/{postId}', 'deleteCommunityPost', 'Delete a post', { added: true, accessNote: 'author or platform moderator', returns: null }],
  ['get', '/social/people', 'listPeople', 'People to connect with', { page: ref('SocialProfile'), query: { district: ref('DistrictId'), q: text(100) }, description: 'Excludes blocked users and anyone with profileDiscoverable false.' }],
  ['get', '/me/connections', 'listConnections', 'My connections', { returns: arr(ref('Connection')) }],
  ['post', '/me/connections', 'requestConnection', 'Send a connection request', {
    body: obj({ profileId: id() }, { strict: true }), returns: ref('Connection'), status: 201, rateLimit: '50/day per user',
    conflict: 'Already connected or pending', description: 'If the other person already requested you, this accepts it. Blocked either way returns 404.',
  }],
  ['delete', '/me/connections/{profileId}', 'removeConnection', 'Remove a connection or cancel a request', { returns: null }],
  ['get', '/me/invitations', 'listEventInvitations', 'Event invitations sent and received', { returns: arr(ref('EventInvitation')) }],
  ['post', '/social/events/{eventId}/invitations', 'inviteToEvent', 'Invite someone to an event', {
    body: obj({ profileId: id() }, { strict: true }), returns: obj({ invitationId: id() }), status: 201, rateLimit: '50/day per user',
    description: 'Respects the invitee\'s allowInvitations setting and blocks (both return 403 without saying why).',
  }],
  ['post', '/me/invitations/{invitationId}/response', 'respondToEventInvitation', 'Accept or decline an invitation', { body: obj({ accept: bool() }, { strict: true }), returns: null, state: 'Already answered' }],
  ['put', '/me/blocks/{profileId}', 'blockUser', 'Block someone', { returns: null, description: 'Also removes any connection and cancels pending invitations between you.' }],
  ['delete', '/me/blocks/{profileId}', 'unblockUser', 'Unblock someone', { returns: null }],
  ['post', '/reports', 'reportContent', 'Report a user or content', { body: ref('ReportInput'), returns: obj({ reportId: id() }), status: 201, rateLimit: '20/day per user' }],
]);

const messages = section('Messages', { access: 'user' }, [
  ['get', '/me/conversations', 'listConversations', 'My conversations', { added: true, page: ref('Conversation') }],
  ['post', '/me/conversations', 'startConversation', 'Start (or reopen) a conversation', {
    added: true, body: obj({ profileId: id() }, { strict: true }), returns: ref('Conversation'), status: 201, rateLimit: '30/day per user',
    description: 'Respects the other person’s allowMessages setting and blocks (403 without saying why). Returns the existing conversation if there is one.',
  }],
  ['get', '/me/conversations/{conversationId}/messages', 'listMessages', 'Messages in a conversation', {
    added: true, page: ref('Message'), query: { before: dateTime({ description: 'Return messages older than this' }) },
  }],
  ['post', '/me/conversations/{conversationId}/messages', 'sendMessage', 'Send a message', {
    added: true, body: obj({ text: text(4000, { minLength: 1 }) }, { strict: true }), returns: ref('Message'), status: 201, idempotent: true,
    rateLimit: '60/min per user', state: 'Either person has blocked the other',
  }],
  ['post', '/me/conversations/{conversationId}/read', 'markConversationRead', 'Mark a conversation read', { added: true, returns: null }],
]);

const moderation = section('Moderation', { access: 'platform' }, [
  ['get', '/platform/reports', 'listReports', 'Reports queue', { added: true, page: ref('ModerationReport'), query: { status: enumOf(['open', 'actioned', 'dismissed']), targetType: str() } }],
  ['post', '/platform/reports/{reportId}/resolution', 'resolveReport', 'Resolve a report', {
    added: true, returns: ref('ModerationReport'), state: 'Already resolved',
    body: obj({ action: enumOf(['dismiss', 'remove-content', 'warn-user', 'suspend-user']), note: text(1000) }, { strict: true, optional: ['note'] }),
    description: 'The reporter is told the report was handled, never what action was taken against whom. remove-content works for community posts, messages, jobs (closed) and events (cancelled); suspend-user ends all sessions and blocks sign-in.',
  }],
  ['put', '/platform/users/{userId}/suspension', 'setUserSuspension', 'Suspend or reinstate an account', {
    added: true, body: obj({ suspended: bool(), note: text(1000) }, { strict: true, optional: ['note'] }),
    returns: obj({ userId: id(), suspended: bool() }), state: 'Platform admins cannot be suspended',
    description: 'Suspending revokes every session and refuses sign-in until reinstated. Recorded in the audit log.',
  }],
  ['post', '/platform/events', 'createPlatformEvent', 'Create a city event', { added: true, body: ref('EventInput'), returns: ref('CityEvent'), status: 201 }],
  ['patch', '/platform/events/{eventId}', 'updatePlatformEvent', 'Update a city event', { added: true, body: ref('EventPatch'), returns: ref('CityEvent'), state: 'Capacity below current attendees' }],
  ['delete', '/platform/events/{eventId}', 'cancelPlatformEvent', 'Cancel a city event', { added: true, returns: null, description: 'Attendees are notified; pending invitations are cancelled.' }],
  ['post', '/platform/communities', 'createCommunity', 'Create a community', {
    added: true, status: 201, returns: ref('Community'),
    body: obj({ name: text(80, { minLength: 1 }), description: text(1000), topic: text(80), district: ref('DistrictId') }, { strict: true }),
  }],
  ['patch', '/platform/communities/{communityId}', 'updateCommunity', 'Update or archive a community', {
    added: true, returns: ref('Community'),
    body: obj({ name: text(80), description: text(1000), topic: text(80), district: ref('DistrictId'), archived: bool() }, { strict: true, optional: ['name', 'description', 'topic', 'district', 'archived'] }),
  }],
]);

const orgEvents = section('Social', { access: 'org.settings.manage' }, [
  ['post', '/orgs/{orgId}/events', 'createOrgEvent', 'Host an event as the organisation', {
    added: true, status: 201, body: ref('EventInput'), returns: ref('CityEvent'), description: 'host is the organisation name; hostOrganizationId is set.',
  }],
  ['patch', '/orgs/{orgId}/events/{eventId}', 'updateOrgEvent', 'Update an event the organisation hosts', { added: true, body: ref('EventPatch'), returns: ref('CityEvent') }],
  ['delete', '/orgs/{orgId}/events/{eventId}', 'cancelOrgEvent', 'Cancel an event the organisation hosts', { added: true, returns: null }],
]);

const city = section('City', { access: 'public' }, [
  ['get', '/city/world', 'getCityWorld', 'City world snapshot', { returns: ref('CityWorld'), cache: 'public, max-age=60, stale-while-revalidate=300', description: 'Public data only; served without cookies.' }],
  ['get', '/city/hq/{orgId}', 'getCityHq', 'One organisation HQ', { returns: ref('PublicHqProjection'), cache: 'public, max-age=60' }],
  ['get', '/city/me', 'getCityMe', 'Signed-in player summary', { access: 'optional', returns: nullable(ref('CityMe')), description: 'data is null when signed out (no 401).' }],
  ['get', '/city/markets', 'getMarkets', 'Markets billboard snapshot', { returns: ref('MarketSnapshot'), cache: 'public, max-age=300', description: 'Display only — no trading. Live FX rates (USD, GBP, EUR → NGN) from ExchangeRate-API with the required attribution; change is day-on-day. 503 SERVICE_UNAVAILABLE when MARKETS_PROVIDER is not set. Equity indices need a licensed provider (open decision).' }],
]);

const gameMode = enumOf(['invite-friend', 'matchmaking', 'solo-challenge', 'practice']);
const gamesS = section('Games', { access: 'user' }, [
  ['get', '/games', 'listGames', 'Game availability', { access: 'public', raw: true, returns: ref('GameList'), cache: 'public, max-age=60' }],
  ['post', '/games/{gameId}/sessions', 'createGameSession', 'Start a game session', { raw: true, body: obj({ mode: gameMode }, { strict: true }), returns: ref('GameSession'), status: 201, state: 'Game not available' }],
  ['post', '/games/{gameId}/matchmaking', 'joinMatchmaking', 'Join matchmaking', { raw: true, returns: ref('GameSession'), state: 'Game not available' }],
  ['post', '/games/sessions/{sessionId}/invitations', 'inviteToGame', 'Invite a connection', { raw: true, body: obj({ connectionId: id() }, { strict: true }), returns: obj({ inviteId: id() }), status: 201 }],
  ['post', '/games/sessions/{sessionId}/join', 'joinGameSession', 'Join a session', { raw: true, returns: ref('GameSession'), state: 'Session full or finished' }],
  ['get', '/games/sessions/{sessionId}', 'getGameSession', 'Session state', { raw: true, returns: ref('GameSession') }],
  ['get', '/games/sessions/{sessionId}/result', 'getGameResult', 'Session result', { raw: true, returns: ref('GameResult'), state: 'Session not finished' }],
  ['put', '/platform/games/{gameId}', 'setGameAvailability', 'Set a game’s availability', {
    access: 'platform', added: true, returns: obj({ id: ref('GameId'), availability: enumOf(['coming-soon', 'available', 'maintenance']), message: str() }, { optional: ['message'] }),
    body: obj({ availability: enumOf(['coming-soon', 'available', 'maintenance']), message: text(200) }, { strict: true, optional: ['message'] }),
    description: 'Enveloped (unlike the player-facing game endpoints).',
  }],
]);

export const routes: Route[] = [
  ...system, ...auth, ...account, ...profile, ...jobs, ...career, ...assistant, ...orgsS,
  ...rec, ...hr, ...pay, ...eng, ...analytics, ...socialS, ...orgEvents, ...messages, ...moderation, ...city, ...gamesS,
];

export const TAGS: { name: string; description: string }[] = [
  { name: 'System', description: 'Health checks for load balancers and orchestrators.' },
  { name: 'Auth', description: 'Sign-up, sign-in, sessions, password reset, email verification and invitations.' },
  { name: 'Account', description: 'Data export and account deletion (NDPA rights).' },
  { name: 'Candidate profile', description: 'Profile, onboarding, CV and privacy. Personality and gender never feed job matching.' },
  { name: 'Jobs & applications', description: 'Job search, matching, saved jobs and applications.' },
  { name: 'Career progress', description: 'XP, missions, challenges, courses, achievements and notifications. The backend decides every XP award.' },
  { name: 'AI assistant', description: 'Career assistant. Suggests only; nothing is submitted without the confirm call.' },
  { name: 'Organisations', description: 'Organisation onboarding, profile, members, structure and plan.' },
  { name: 'Recruitment', description: 'Requires the recruitment module.' },
  { name: 'HR', description: 'Requires the hr module.' },
  { name: 'Payroll (preview)', description: 'Requires the payroll module. Simulation only — no money moves and nothing is filed.' },
  { name: 'Engagement', description: 'Requires the engagement module. Anonymous items never reveal who sent them.' },
  { name: 'Analytics', description: 'Requires the analytics module. Aggregates only.' },
  { name: 'Social', description: 'Events, communities, connections, invitations, blocks and reports.' },
  { name: 'Messages', description: 'Direct messages between users. Respects allowMessages and blocks.' },
  { name: 'Moderation', description: 'Platform staff only: the reports queue.' },
  { name: 'City', description: 'Public data for the 3D city. Never returns private data.' },
  { name: 'Games', description: 'Not live yet — every game reports "coming-soon". Responses are NOT wrapped in the envelope.' },
];

/** Shared descriptions for path parameters. */
export const PATH_PARAMS: Record<string, string> = {
  orgId: 'Organisation ID',
  jobId: 'Job / vacancy ID',
  applicationId: 'Application ID',
  interviewId: 'Interview ID',
  talentId: 'Talent (candidate) ID',
  shortlistId: 'Shortlist ID',
  assessmentId: 'Assessment ID',
  employeeId: 'Employee record ID',
  taskId: 'Lifecycle task ID',
  documentId: 'Document ID',
  leaveId: 'Leave request ID',
  reviewId: 'Performance review ID',
  policyId: 'Policy ID',
  componentId: 'Pay component ID',
  structureId: 'Compensation structure ID',
  previewId: 'Payroll preview ID',
  announcementId: 'Announcement ID',
  recognitionId: 'Recognition ID',
  surveyId: 'Survey ID',
  feedbackId: 'Feedback item ID',
  activityId: 'Team activity ID',
  initiativeId: 'Culture initiative ID',
  memberId: 'Organisation member ID',
  invitationId: 'Invitation ID',
  departmentId: 'Department ID',
  locationId: 'Office location ID',
  eventId: 'City event ID',
  communityId: 'Community ID',
  postId: 'Community post ID',
  profileId: 'Social profile ID',
  challengeId: 'Skill challenge ID',
  courseId: 'Course ID',
  moduleIndex: 'Zero-based module index',
  missionId: 'Mission ID',
  sessionId: 'Game session ID',
  gameId: 'Game ID',
  tier: 'Subscription tier',
  token: 'Invitation token from the email link',
  conversationId: 'Conversation ID',
  reportId: 'Report ID',
  userId: 'User ID',
};

