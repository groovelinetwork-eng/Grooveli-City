# Grooveli City — Backend endpoints (simple list)

The endpoints the frontend needs and the payloads it sends and expects. Paths are the frontend's **proposal**: change them if you need to and tell us, and we'll update the frontend.

The data shapes at the bottom come straight from the frontend's TypeScript types in `frontend/domain/src/types.ts`.

## The basics

- **Base URL:** `http://localhost:4000/api/v1`. Every path below starts from here.
- **Every response** uses the envelope already in `packages/shared`:
  ```json
  { "success": true, "data": { }, "message": "OK" }
  ```
  On an error, set `success` to `false` and add an error code:
  ```json
  { "success": false, "message": "Title is required", "error": { "code": "VALIDATION_FAILED", "fields": { "title": "Required" } } }
  ```
  Use these error codes: `VALIDATION_FAILED` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `MODULE_NOT_IN_PLAN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `NOT_ALLOWED_IN_STATE` (409), `RATE_LIMITED` (429).
- **Lists** return `{ items, page, pageSize, total }` and accept `?page=&pageSize=`.
- **Auth** uses an httpOnly session cookie. "Me" endpoints never take a user ID; get it from the session. CORS must allow credentials from `http://localhost:3000`.
- **Formats:** dates are `YYYY-MM-DD` and timestamps are ISO-8601. Money is a whole number of naira (NGN) per month.
- **Permission checks:** in the **Access** column, `perm.name` means the caller needs that permission in the organisation (see [Roles](#roles-and-permissions)). The backend must check it on every call; the frontend checks are only for the UI.
- **Path shorthand:** `…` at the start of a path stands for that section's prefix. For example, in Recruitment, `…/vacancies` means `/orgs/{orgId}/recruitment/vacancies`.

---

## 1. Auth

| Method | Path | Request body | Returns | Access |
|---|---|---|---|---|
| POST | `/auth/signup` | `{ name, email, password, accountType: "candidate" \| "organization" }` | `Session` + sets cookie | Public |
| POST | `/auth/login` | `{ email, password }` | `Session` + sets cookie | Public |
| POST | `/auth/logout` | — | `null` | Signed in |
| GET | `/auth/session` | — | `Session` (401 if signed out) | Signed in |
| PUT | `/auth/session/active-organization` | `{ organizationId }` | `Session` | Signed in |
| POST | `/auth/password/forgot` | `{ email }` | `null` | Public |
| POST | `/auth/password/reset` | `{ token, password }` | `null` | Public |
| POST | `/invitations/{token}/accept` | — | `Session` | Signed in |

`Session`:
```ts
{
  user: { id, displayName, email },
  memberships: { organizationId, roles: OrgRole[], employeeId?: string }[],
  activeOrganizationId: string | null,
  onboardingComplete: boolean
}
```

## 2. Candidate profile and settings

| Method | Path | Request body | Returns |
|---|---|---|---|
| GET | `/me/profile` | — | `CandidateProfile` |
| POST | `/me/onboarding` | `CandidateProfile` | `{ xp: XpDecision }` |
| PATCH | `/me/profile` | `Partial<CandidateProfile>` | `{ xp: XpDecision \| null }` |
| POST | `/me/cv` | multipart, field `file` | `{ xp: XpDecision }` |
| GET | `/me/cv` | — | `{ name, sizeKb, addedAt, downloadUrl } \| null` |
| DELETE | `/me/cv` | — | `null` |
| GET | `/me/privacy` | — | `PrivacySettings` |
| PATCH | `/me/privacy` | `Partial<PrivacySettings>` | `PrivacySettings` |

All require a signed-in user.

## 3. Jobs and applications (candidate side)

| Method | Path | Request body | Returns | Access |
|---|---|---|---|---|
| GET | `/jobs?q=&district=&organizationId=&workMode=&employmentType=&level=&minSalary=` | — | page of `Job` | Public |
| GET | `/jobs/{jobId}` | — | `Job` | Public |
| GET | `/me/job-matches` | — | `{ job: Job, match: MatchResult }[]` | Signed in |
| GET | `/me/job-matches/{jobId}` | — | `MatchResult` | Signed in |
| GET | `/me/saved-jobs` | — | `string[]` (job IDs) | Signed in |
| PUT | `/me/saved-jobs/{jobId}` | — | `{ saved: true }` | Signed in |
| DELETE | `/me/saved-jobs/{jobId}` | — | `{ saved: false }` | Signed in |
| POST | `/jobs/{jobId}/applications` | `{ coverLetter }` | `{ application: Application, xp: XpDecision }` | Signed in |
| GET | `/me/applications` | — | `Application[]` | Signed in |
| POST | `/me/applications/{applicationId}/withdraw` | — | `Application` | Signed in |
| GET | `/me/interviews` | — | `Interview[]` | Signed in |

## 4. Career progress (XP, missions, learning, notifications)

All require a signed-in user. The backend decides XP and levels; the frontend only displays them.

| Method | Path | Request body | Returns |
|---|---|---|---|
| GET | `/me/progress` | — | `{ progress: CareerProgress, events: XpEvent[] }` |
| GET | `/career/challenges` | — | `SkillChallenge[]` (without the `answer` field) |
| POST | `/career/challenges/{challengeId}/attempts` | `{ answers: number[] }` | `{ score, total, xp: XpDecision }` |
| GET | `/career/assessment` | — | `QuizQuestion[]` |
| POST | `/career/assessment` | `{ answers: Record<questionId, string> }` | `{ xp: XpDecision }` |
| POST | `/career/interview-simulations` | `{ role, score }` | `{ xp: XpDecision }` |
| GET | `/career/courses` | — | `(Course & { completedModules: number[] })[]` |
| PUT | `/me/courses/{courseId}/modules/{moduleIndex}` | — | `{ completed: boolean, xp: XpDecision \| null }` |
| DELETE | `/me/courses/{courseId}/modules/{moduleIndex}` | — | `{ completed: false, xp: null }` |
| GET | `/career/missions` | — | `(Mission & { done: Record<objectiveId, boolean>, claimed: boolean })[]` |
| POST | `/me/missions/{missionId}/claim` | — | `{ xp: XpDecision }` |
| GET | `/me/achievements` | — | `(Achievement & { unlocked: boolean })[]` |
| GET | `/me/notifications` | — | page of `NotificationItem` |
| POST | `/me/notifications/read` | `{ ids: string[] \| "all" }` | `null` |

## 5. AI career assistant

All require a signed-in user. The assistant may only **suggest** applications. Nothing is submitted until the user confirms.

| Method | Path | Request body | Returns |
|---|---|---|---|
| GET | `/me/assistant/thread` | — | `AIMessage[]` |
| POST | `/me/assistant/messages` | `{ text }` | `AIMessage` (assistant reply, may include `jobIds`, `pendingApplicationJobIds`) |
| POST | `/me/assistant/confirm-applications` | `{ jobIds: string[] }` | `{ submitted: Application[] }` |
| DELETE | `/me/assistant/thread` | — | `null` |

## 6. Organisations and members

| Method | Path | Request body | Returns | Access |
|---|---|---|---|---|
| GET | `/orgs?district=&industry=&q=` | — | `OrganizationPublicProfile[]` | Public |
| GET | `/orgs/{orgId}` | — | `{ profile: OrganizationPublicProfile, vacancies: PublicVacancy[] }` | Public |
| POST | `/orgs` | `OrganizationInput` | `{ organizationId }` | Signed in (the creator becomes `org-admin`) |
| PATCH | `/orgs/{orgId}/profile` | `Partial<OrganizationPublicProfile>` | `OrganizationPublicProfile` | `org.settings.manage` |
| GET | `/orgs/{orgId}/workspace` | — | `OrganizationPrivateWorkspace` | Member |
| PATCH | `/orgs/{orgId}/workspace` | `Partial<OrganizationPrivateWorkspace>` (`workflows`, `setupChecklist`) | `OrganizationPrivateWorkspace` | `org.settings.manage` |
| GET | `/orgs/{orgId}/members` | — | `OrgMember[]` | `org.members.manage` |
| POST | `/orgs/{orgId}/invitations` | `{ email, roles: OrgRole[] }` | `Invitation` | `org.members.manage` |
| DELETE | `/orgs/{orgId}/invitations/{invitationId}` | — | `null` | `org.members.manage` |
| PUT | `/orgs/{orgId}/members/{memberId}/roles` | `{ roles: OrgRole[] }` (at least one; keep at least one `org-admin`) | `OrgMember` | `org.members.manage` |
| PUT | `/orgs/{orgId}/members/{memberId}/status` | `{ status: "active" \| "suspended" }` | `OrgMember` | `org.members.manage` |
| POST | `/orgs/{orgId}/departments` | `{ name, headEmployeeId, responsibilities, locationId }` | `Department` | `org.settings.manage` |
| POST | `/orgs/{orgId}/locations` | `{ name, city, address, headcountCapacity }` | `OfficeLocation` | `org.settings.manage` |
| GET | `/orgs/{orgId}/structure` | — | `{ departments: Department[], locations: OfficeLocation[], employees: { id, name, title, managerId, departmentId }[] }` | `hr.directory.view` |
| GET | `/orgs/{orgId}/subscription` | — | `{ tier: SubscriptionTier, modules: OrgModule[] }` | `org.billing.view` |
| PUT | `/orgs/{orgId}/subscription` | `{ tier: SubscriptionTier }` | `{ tier, modules }` | `org-admin` |
| PUT | `/platform/tiers/{tier}/modules` | `{ modules: OrgModule[] }` | `null` | Platform admin |
| GET | `/orgs/{orgId}/dashboard` | — | `{ openVacancies, pendingLeave, reviewsDue, setupChecklist }` | Member |

`OrganizationInput` (organisation onboarding):
```ts
{
  profile: Omit<OrganizationPublicProfile, 'id' | 'verified'>,   // district optional
  locations: { name, city, address, headcountCapacity }[],
  departments: { name, responsibilities }[],
  policies: { title, category: Policy['category'], body }[],
  invites: { email, roles: OrgRole[] }[],
  tier: SubscriptionTier
}
```

## 7. Recruitment (employer side)

Prefix: `/orgs/{orgId}/recruitment`. The organisation's plan must include the `recruitment` module. Reading needs `recruitment.view`; changing anything needs `recruitment.manage`.

| Method | Path | Request body | Returns |
|---|---|---|---|
| GET | `…/vacancies` | — | `Job[]` (any status) |
| POST | `…/vacancies` | `Job` without `id` | `{ jobId }` |
| PUT | `…/vacancies/{jobId}` | `Job` | `Job` |
| PUT | `…/vacancies/{jobId}/status` | `{ status: "draft" \| "published" \| "closed" }` | `Job` |
| GET | `…/applications?jobId=&status=` | — | `Application[]` |
| POST | `…/applications/{applicationId}/status` | `{ status: ApplicationStatus, note? }` | `Application` |
| GET | `…/interviews?jobId=&from=&to=` | — | `Interview[]` |
| POST | `…/interviews` | `{ applicationId, jobId, candidateId, candidateName, scheduledAt, durationMin, format, interviewers: string[] }` | `{ interviewId }` |
| PATCH | `…/interviews/{interviewId}` | `Partial<Interview>` (`status`, `notes`, `scorecard`, `scheduledAt`) | `Interview` |
| GET | `…/talent?skills=&location=&minYears=&maxSalary=&workMode=` | — | `TalentProfile[]` (only candidates visible to employers) |
| POST | `…/talent/{talentId}/invitations` | `{ jobId }` | `{ application: Application }` |
| GET | `…/shortlists` | — | `Shortlist[]` |
| POST | `…/shortlists` | `{ jobId, name, applicationIds: string[] }` | `Shortlist` |
| PUT | `…/shortlists/{shortlistId}/applications/{applicationId}` | — | `Shortlist` |
| DELETE | `…/shortlists/{shortlistId}/applications/{applicationId}` | — | `Shortlist` |
| GET | `…/assessments` | — | `Assessment[]` |
| POST | `…/assessments` | `{ jobId, title, kind: "skills-test" \| "case-study" \| "work-sample", questions: string[] }` | `Assessment` |
| POST | `…/assessments/{assessmentId}/results` | `{ applicationId, score }` (0–100; the reviewer comes from the session) | `Assessment` |
| GET | `…/analytics` | — | `WorkforceMetric[]` |

## 8. HR

Prefix: `/orgs/{orgId}/hr`. The organisation's plan must include the `hr` module.

| Method | Path | Request body | Returns | Access |
|---|---|---|---|---|
| GET | `…/employees?departmentId=&locationId=&status=&q=` | — | `EmployeeRecord[]` | `hr.directory.view` |
| GET | `…/employees/{employeeId}` | — | `EmployeeRecord` | `hr.records.manage` or self |
| POST | `…/employees` | `{ name, title, departmentId, locationId, email, startDate, employmentType, baseMonthly }` | `{ employeeId }` | `hr.records.manage` |
| PATCH | `…/employees/{employeeId}` | `Partial<EmployeeRecord>` | `EmployeeRecord` | `hr.records.manage` |
| POST | `…/employees/{employeeId}/offboarding` | `{ lastDay }` | `EmployeeRecord` | `hr.records.manage` |
| POST | `…/employees/{employeeId}/offboarding/complete` | — | `EmployeeRecord` | `hr.records.manage` |
| PUT | `…/employees/{employeeId}/tasks/{taskId}` | `{ done: boolean }` | `LifecycleTask` | `hr.records.manage` |
| GET | `…/employees/{employeeId}/documents` | — | `EmployeeDocument[]` | `hr.records.manage` or self |
| POST | `…/employees/{employeeId}/documents` | multipart: `file`, `kind`, `name` | `EmployeeDocument` | `hr.records.manage` |
| GET | `…/leave?status=&employeeId=&from=&to=` | — | `LeaveRequest[]` | `hr.leave.approve` or own |
| POST | `…/leave` | `{ employeeId, type: LeaveType, start, end, reason }` (the server calculates `days`) | `LeaveRequest` | `self.service` |
| POST | `…/leave/{leaveId}/decision` | `{ decision: "approved" \| "rejected" \| "cancelled" }` | `LeaveRequest` | `hr.leave.approve` (cancel: own) |
| GET | `…/attendance?from=&to=&employeeId=` | — | `AttendanceEntry[]` | `hr.directory.view` |
| POST | `…/attendance/clock-in` | `{ employeeId, status: "present" \| "remote" }` | `AttendanceEntry` | `self.service` |
| GET | `…/reviews?cycle=&employeeId=` | — | `PerformanceReview[]` | `hr.performance.manage` or own |
| PATCH | `…/reviews/{reviewId}` | `Partial<PerformanceReview>` (`rating` 1–5) | `PerformanceReview` | `hr.performance.manage` |
| GET | `…/policies` | — | `Policy[]` | Member |
| POST | `…/policies` | `{ title, category, body }` | `Policy` | `hr.policies.manage` |
| PUT | `…/policies/{policyId}` | `{ title, category, body }` | `Policy` | `hr.policies.manage` |
| POST | `…/policies/{policyId}/acknowledge` | — | `null` | `self.service` |
| GET | `/me/employee?orgId=` | — | `{ record: EmployeeRecord, leaveBalance, leave: LeaveRequest[], policiesToAcknowledge: Policy[], payslips: { previewId, period }[] }` | `self.service` |

## 9. Payroll (preview only)

Prefix: `/orgs/{orgId}/payroll`. The organisation's plan must include the `payroll` module.

> **Payroll is a preview only.** No money moves and nothing is filed. Every preview must return `simulated: true`. Tax and pension rules are still an open decision.

| Method | Path | Request body | Returns | Access |
|---|---|---|---|---|
| GET | `…/compensation` | — | `CompensationRecord[]` | `payroll.view` |
| PUT | `…/compensation/{employeeId}` | `{ baseMonthly, reason }` (`baseMonthly` > 0) | `CompensationRecord` | `payroll.prepare` |
| GET | `…/components` | — | `PayComponent[]` | `payroll.view` |
| PUT | `…/components/{componentId}` | `PayComponent` | `PayComponent` | `payroll.prepare` |
| GET | `…/structures` | — | `CompensationStructure[]` | `payroll.view` |
| PUT | `…/structures/{structureId}/components` | `{ componentIds: string[] }` | `CompensationStructure` | `payroll.prepare` |
| GET | `…/previews` | — | `PayrollPreview[]` | `payroll.view` |
| POST | `…/previews` | `{ period: "YYYY-MM", adjustments: PayrollAdjustment[] }` | `PayrollPreview` | `payroll.prepare` |
| POST | `…/previews/{previewId}/approve` | — | `PayrollPreview` | `payroll.prepare` |
| DELETE | `…/previews/{previewId}` | — | `null` | `payroll.prepare` |
| GET | `…/previews/{previewId}/payslips/{employeeId}` | — | `PayslipPreview` | `payroll.view` or own |
| GET | `…/reports?from=&to=` | — | `{ period, department, gross, deductions, net }[]` | `payroll.view` |

## 10. Engagement

Prefix: `/orgs/{orgId}/engagement`. The organisation's plan must include the `engagement` module. Taking part needs `engagement.participate`; managing needs `engagement.manage`.

| Method | Path | Request body | Returns |
|---|---|---|---|
| GET | `…/announcements` | — | `Announcement[]` |
| POST | `…/announcements` | `{ title, body, audience: "all" \| "department" \| "public-hq", departmentId?, pinned }` | `Announcement` |
| DELETE | `…/announcements/{id}` | — | `null` |
| GET | `…/recognition` | — | `Recognition[]` |
| POST | `…/recognition` | `{ toEmployeeId, value, message }` | `Recognition` |
| POST | `…/recognition/{id}/reactions` | — | `{ reactions: number }` |
| GET | `…/surveys` | — | `EngagementSurvey[]` (managers get aggregated results; never who answered an anonymous survey) |
| PUT | `…/surveys/{surveyId}` | `{ title, status, anonymous, questions: SurveyQuestion[], closesOn }` | `EngagementSurvey` |
| POST | `…/surveys/{surveyId}/responses` | `{ answers: Record<questionId, number \| string> }` (one response per person) | `null` |
| GET | `…/feedback` | — | `FeedbackItem[]` (anonymous items have no author) |
| POST | `…/feedback` | `{ category, body, anonymous }` (`body` at least 5 characters) | `FeedbackItem` |
| PUT | `…/feedback/{id}/status` | `{ status: "new" \| "acknowledged" \| "actioned" }` | `FeedbackItem` |
| GET | `…/activities` | — | `TeamActivity[]` |
| PUT | `…/activities/{activityId}` | `{ title, date, location, kind }` | `TeamActivity` |
| PUT | `…/activities/{activityId}/rsvps/me` | — | `TeamActivity` |
| DELETE | `…/activities/{activityId}/rsvps/me` | — | `TeamActivity` |
| GET | `…/initiatives` | — | `CultureInitiative[]` |
| PUT | `…/initiatives/{initiativeId}` | `{ title, owner, progress, status }` | `CultureInitiative` |

## 11. Analytics

| Method | Path | Request body | Returns | Access |
|---|---|---|---|---|
| GET | `/orgs/{orgId}/analytics/workforce` | — | `WorkforceMetric[]` (totals only, no personal data) | `analytics.view` (`analytics` module) |

## 12. Social

| Method | Path | Request body | Returns | Access |
|---|---|---|---|---|
| GET | `/social/events?district=&kind=&from=&to=` | — | `CityEvent[]` | Public |
| GET | `/social/events/{eventId}` | — | `CityEvent & { attendees: { id, name }[] }` (only attendees who allow it) | Public |
| PUT | `/me/events/{eventId}/rsvp` | — | `{ attending: true }` | Signed in |
| DELETE | `/me/events/{eventId}/rsvp` | — | `{ attending: false }` | Signed in |
| GET | `/social/communities` | — | `Community[]` | Public |
| GET | `/social/communities/{communityId}` | — | `Community` | Public |
| PUT | `/me/communities/{communityId}` | — | `{ joined: true }` | Signed in |
| DELETE | `/me/communities/{communityId}` | — | `{ joined: false }` | Signed in |
| POST | `/social/communities/{communityId}/posts` | `{ text }` | `{ id, author, text, at }` | Members of the community |
| GET | `/social/people` | — | `SocialProfile[]` (no blocked or hidden users) | Signed in |
| GET | `/me/connections` | — | `{ profileId, status: "pending" \| "connected" }[]` | Signed in |
| POST | `/me/connections` | `{ profileId }` | `{ profileId, status }` | Signed in |
| DELETE | `/me/connections/{profileId}` | — | `null` | Signed in |
| GET | `/me/invitations` | — | `{ id, eventId, fromName, toName, status, direction: "sent" \| "received" }[]` | Signed in |
| POST | `/social/events/{eventId}/invitations` | `{ profileId }` | `{ invitationId }` | Signed in |
| POST | `/me/invitations/{invitationId}/response` | `{ accept: boolean }` | `null` | Signed in |
| PUT | `/me/blocks/{profileId}` | — | `null` | Signed in |
| DELETE | `/me/blocks/{profileId}` | — | `null` | Signed in |
| POST | `/reports` | `{ targetId, reason, details }` | `{ reportId }` | Signed in |

## 13. 3D city (public data only)

The city is open to guests, so it calls these **without cookies** (except `/city/me`). Never return private data from them.

| Method | Path | Request body | Returns | Access |
|---|---|---|---|---|
| GET | `/city/world` | — | `{ hqs: PublicHqProjection[], events: CityEvent[], jobCounts: Record<districtId, number> }` (cacheable for 60 s) | Public |
| GET | `/city/hq/{orgId}` | — | `PublicHqProjection` | Public |
| GET | `/city/me` | — | `{ displayName, level, levelProgress, avatar: AvatarConfig }` | Signed in, optional |
| GET | `/city/markets` | — | `MarketSnapshot` (see `docs/MARKETS_FEED_CONTRACT.md`) | Public |
| WS | `/realtime/presence` | — | stream of `PresenceProjection` (at most 2 updates per second; must respect `presenceVisibility`) | Signed in |

## 14. Games (not needed yet)

Every game shows "Coming soon" for now. The full proposal is in `docs/GAMES_CONTRACT.md`. There is no betting or real money. These responses are **not** wrapped in the envelope: the city reads them directly.

| Method | Path | Request body | Returns |
|---|---|---|---|
| GET | `/games` | — | `{ games: { id, availability: "coming-soon" \| "available" \| "maintenance", message? }[] }` |
| POST | `/games/{gameId}/sessions` | `{ mode: "invite-friend" \| "matchmaking" \| "solo-challenge" \| "practice" }` | `GameSession` |
| POST | `/games/{gameId}/matchmaking` | — | `GameSession` |
| POST | `/games/sessions/{sessionId}/invitations` | `{ connectionId }` | `{ inviteId }` |
| POST | `/games/sessions/{sessionId}/join` | — | `GameSession` |
| GET | `/games/sessions/{sessionId}` | — | `GameSession` |
| GET | `/games/sessions/{sessionId}/result` | — | `{ sessionId, gameId, outcome: "win" \| "loss" \| "draw" \| "abandoned", finishedAt }` |

`gameId` is one of `chess`, `checkers`, `ludo`, `pool`, `puzzle`.

`GameSession`:
```ts
{
  sessionId,
  gameId,
  status: "waiting" | "active" | "finished" | "cancelled",
  players: { playerId, displayName }[],
  state?: unknown   // opaque game state; the city never reads it
}
```

---

## Roles and permissions

| Permission | org-admin | hr-manager | recruiter | payroll-officer | manager | employee |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| org.settings.manage | ✓ | | | | | |
| org.members.manage | ✓ | | | | | |
| org.billing.view | ✓ | | | | | |
| recruitment.view | ✓ | ✓ | ✓ | | ✓ | |
| recruitment.manage | ✓ | | ✓ | | | |
| hr.directory.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| hr.records.manage | ✓ | ✓ | | | | |
| hr.leave.approve | ✓ | ✓ | | | ✓ | |
| hr.performance.manage | ✓ | ✓ | | | ✓ | |
| hr.policies.manage | ✓ | ✓ | | | | |
| payroll.view | ✓ | ✓ | | ✓ | | |
| payroll.prepare | | | | ✓ | | |
| engagement.manage | ✓ | ✓ | | | | |
| engagement.participate | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| analytics.view | ✓ | ✓ | | ✓ | | |
| self.service | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

The source of truth is `frontend/domain/src/permissions.ts`. If the table and that file ever disagree, follow the file.

**Modules included in each plan** (a proposal; pricing hasn't been decided):

| Plan | Modules |
|---|---|
| `starter` | recruitment, hr |
| `growth` | recruitment, hr, payroll, engagement |
| `enterprise` | recruitment, hr, payroll, engagement, analytics |

If an organisation's plan doesn't include a module, return `403 MODULE_NOT_IN_PLAN`.

## Rules the backend must enforce

- **Job matching must never use** personality traits, gender or photos.
- **XP is awarded once per reason** where it applies (profile complete, CV upload, assessment), and the backend decides every award.
- **Applications:** reject applying to a closed job or applying twice. Once an application is withdrawn, its status cannot change.
- **Members:** at least one `org-admin` must always remain.
- **Payroll is a preview only.** It never creates a payment or a filing.
- **Anonymous surveys and feedback** never reveal who sent them.
- **Blocking someone** also removes the connection, and blocks invitations and messages between the two users.
- **The AI assistant** never submits applications without the user's confirmation call.

---

## Data shapes

Copied from `frontend/domain/src/types.ts`; that file is the source of truth. `Id` is a string, `ISODate` is `YYYY-MM-DD` and `ISODateTime` is an ISO-8601 timestamp.

### Enums

```ts
type OrgRole = 'org-admin' | 'hr-manager' | 'recruiter' | 'payroll-officer' | 'manager' | 'employee';
type SubscriptionTier = 'starter' | 'growth' | 'enterprise';
type OrgModule = 'recruitment' | 'hr' | 'payroll' | 'engagement' | 'analytics';
type DistrictId = 'plaza' | 'corporate' | 'recruitment' | 'university' | 'tech' | 'creative'
  | 'healthcare' | 'hospitality' | 'finance' | 'apartment' | 'ai-center';
type WorkMode = 'remote' | 'hybrid' | 'onsite';
type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'internship' | 'freelance';
type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'lead';
type ApplicationStatus = 'submitted' | 'screening' | 'shortlisted' | 'interview' | 'offer'
  | 'hired' | 'rejected' | 'withdrawn';
type XpReason = 'profile-complete' | 'cv-upload' | 'career-assessment' | 'skill-challenge'
  | 'suitable-application' | 'interview-simulation' | 'course-complete' | 'mission-complete';
type LeaveType = 'annual' | 'sick' | 'parental' | 'study' | 'unpaid';
type EmployeeStatus = 'active' | 'onboarding' | 'offboarding' | 'on-leave' | 'exited';
```

### Candidate

```ts
interface CandidateProfile {
  id; displayName; headline; location;
  gender: 'female' | 'male' | 'non-binary' | 'self-describe' | 'prefer-not' | null;
  yearsExperience: number;
  orientation: 'employee' | 'freelancer' | 'entrepreneur' | 'student' | 'open';
  personality: PersonalityTraits | null;   // social features only, never matching
  avatar: AvatarConfig;
  photoDataUrl: string | null;
  summary: string;
  skills: { name: string; level: number }[];   // level 0–100
  certifications: string[];
  experience: { id; title; company; start; end: string | null; summary }[];
  education: { id; school; qualification; year }[];
  preferences: {
    desiredRoles: string[]; locations: string[]; minSalary: number;
    workModes: WorkMode[]; employmentTypes: EmploymentType[];
  };
  cvFile: { name; sizeKb: number; addedAt: ISODateTime } | null;
  visibility: 'public' | 'employers' | 'private';
}

interface PersonalityTraits {
  energy: 'introverted' | 'extroverted' | 'balanced';
  thinking: 'creative' | 'analytical' | 'balanced';
  workStyle: 'collaborative' | 'independent' | 'balanced';
  outlook: 'adventurous' | 'reserved' | 'balanced';
  role: 'leader' | 'supporter' | 'balanced';
}

interface AvatarConfig { body: 0 | 1 | 2; skin; hair; hairColor; outfit; outfitColor; accessory }   // all numbers (style indexes)

interface PrivacySettings {
  presenceVisibility: 'everyone' | 'connections' | 'hidden';
  showInEventAttendees: boolean;
  allowInvitations: 'everyone' | 'connections' | 'nobody';
  allowMessages: 'everyone' | 'connections' | 'nobody';
  profileDiscoverable: boolean;
  blockedIds: Id[];
}
```

### Jobs and applications

```ts
interface Job {
  id; organizationId; title; department; district: DistrictId; location;
  workMode: WorkMode; employmentType: EmploymentType; level: ExperienceLevel;
  minYears: number; salaryMin: number; salaryMax: number;   // monthly NGN
  skills: string[]; requiredQualifications: string[];
  description: string; responsibilities: string[];
  postedOn: ISODate; closesOn: ISODate;
  status: 'draft' | 'published' | 'closed';
}

interface Application {
  id; jobId; candidateId; candidateName;
  status: ApplicationStatus;
  submittedAt: ISODateTime;
  coverLetter: string;
  fitScore: number;
  history: { status: ApplicationStatus; at: ISODateTime; note?: string }[];
}

interface Interview {
  id; applicationId; jobId; candidateId; candidateName;
  scheduledAt: ISODateTime; durationMin: number;
  format: 'video' | 'onsite' | 'phone' | 'virtual-hq';
  interviewers: string[];
  status: 'scheduled' | 'completed' | 'cancelled';
  notes: string;
  scorecard: { criterion: string; score: number }[];
}

interface MatchResult {
  score: number;   // 0–100
  band: 'excellent' | 'good' | 'fair' | 'weak';
  constraints: {
    key: 'location' | 'salary' | 'experience' | 'employmentType' | 'qualifications' | 'workMode';
    label; passed: boolean; detail;
  }[];
  matchedSkills: string[]; missingSkills: string[];
  reasons: string[]; gaps: string[];
}

interface TalentProfile {
  id; name; headline; location; yearsExperience: number;
  skills: { name; level }[]; expectedSalary: number;
  workModes: WorkMode[]; employmentTypes: EmploymentType[];
  qualifications: string[]; avatar: AvatarConfig;
}

interface Shortlist { id; jobId; name; applicationIds: Id[] }

interface Assessment {
  id; jobId; title; kind: 'skills-test' | 'case-study' | 'work-sample';
  questions: string[];
  results: { applicationId; score: number; reviewer: string }[];
}
```

### Career

```ts
interface XpDecision { award: number; reason: string }
interface XpEvent { id; reason: XpReason; amount: number; at: ISODateTime; ref?: string }
interface CareerProgress { xp; level; xpIntoLevel; xpForNextLevel; reputation }   // all numbers

interface QuizQuestion { id; prompt; options: string[]; answer: number; explanation }   // never send `answer` before the attempt
interface SkillChallenge { id; title; skill; district: DistrictId; xp: number; questions: QuizQuestion[] }
interface Course { id; title; provider; skill; hours: number; modules: string[]; xp: number }

interface Mission {
  id; title; description; kind: 'career' | 'skill';
  objectives: { id; label; check: 'profile-complete' | 'cv-uploaded' | 'assessment-done'
    | 'applications-3' | 'interview-sim-done' | 'skill-challenge-done' | 'course-done' }[];
  rewardXp: number; district: DistrictId;
  orientations: string[] | 'all';
}

interface Achievement { id; title; description; icon; rule: object }

interface NotificationItem {
  id; at: ISODateTime; title; body; href?: string; read: boolean;
  kind: 'application' | 'interview' | 'mission' | 'system' | 'social' | 'workplace';
}

interface AIMessage {
  id; role: 'user' | 'assistant'; text; at: ISODateTime;
  jobIds?: Id[]; pendingApplicationJobIds?: Id[];
}
```

### Organisations

```ts
interface OrganizationPublicProfile {
  id; name; tagline; logoColor; logoGlyph; industry; district: DistrictId;
  description; website;
  size: '1-10' | '11-50' | '51-200' | '201-1000' | '1000+';
  structure: string; workArrangements: WorkMode[]; values: string[];
  culture: { environment; leadership; collaboration; development; inclusion; workLife };
  benefits: string[]; headquarters: string; verified: boolean;
}

interface OrganizationPrivateWorkspace {
  organizationId; tier: SubscriptionTier;
  locations: OfficeLocation[]; departments: Department[]; policies: Policy[];
  members: OrgMember[]; invitations: Invitation[];
  workflows: { id; name; steps: string[] }[];
  setupChecklist: Record<string, boolean>;
}

interface OfficeLocation { id; name; city; address; headcountCapacity: number }
interface Department { id; name; headEmployeeId: Id | null; responsibilities; locationId: Id | null }
interface OrgMember { id; name; email; roles: OrgRole[]; departmentId: Id | null; recruitingFor: Id[]; status: 'active' | 'invited' | 'suspended' }
interface Invitation { id; email; roles: OrgRole[]; sentAt: ISODateTime; status: 'pending' | 'accepted' | 'revoked' }
interface Policy { id; title; category: 'leave' | 'conduct' | 'remote-work' | 'benefits' | 'security' | 'other'; body; updatedAt: ISODate; acknowledgements: number }
```

### HR

```ts
interface EmployeeRecord {
  id; organizationId; name; title; departmentId; locationId;
  managerId: Id | null; email; startDate: ISODate;
  employmentType: EmploymentType; status: EmployeeStatus;
  avatar: AvatarConfig;
  publicDirectory: boolean;   // opt-in to the public HQ directory (name and title only)
  documents: EmployeeDocument[];
  lifecycleTasks: LifecycleTask[];
  emergencyContact: string;
}

interface EmployeeDocument { id; name; kind: 'contract' | 'id' | 'certificate' | 'policy-ack' | 'other'; addedOn: ISODate; sizeKb: number }
interface LifecycleTask { id; phase: 'onboarding' | 'offboarding'; label; owner; done: boolean }
interface AttendanceEntry { employeeId; date: ISODate; status: 'present' | 'remote' | 'late' | 'absent' | 'leave'; hours: number }
interface LeaveRequest { id; employeeId; type: LeaveType; start: ISODate; end: ISODate; days: number; reason; status: 'pending' | 'approved' | 'rejected' | 'cancelled'; decidedBy?: string }

interface PerformanceReview {
  id; employeeId; cycle; reviewer;
  status: 'not-started' | 'self-review' | 'manager-review' | 'calibrated' | 'shared';
  rating: number | null;   // 1–5
  goals: { title; progress: number }[];
  strengths; improvements;
}
```

### Payroll (preview)

```ts
interface PayComponent { id; name; kind: 'allowance' | 'deduction'; calc: { type: 'percent' | 'fixed'; value: number }; taxable: boolean }
interface CompensationStructure { id; grade; minBase: number; maxBase: number; componentIds: Id[] }
interface CompensationRecord { employeeId; structureId; baseMonthly: number; currency: 'NGN'; effectiveFrom: ISODate; bankOnFile: boolean; history: { date; baseMonthly; reason }[] }
interface PayrollAdjustment { employeeId; kind: 'bonus' | 'deduction'; label; amount: number }

interface PayslipPreview {
  employeeId; employeeName; period;   // YYYY-MM
  lines: { label; amount: number; kind: 'earning' | 'deduction' }[];
  gross: number; totalDeductions: number; net: number; warnings: string[];
}

interface PayrollPreview {
  id; organizationId; period; createdAt: ISODateTime;
  status: 'draft' | 'approved-preview';
  payslips: PayslipPreview[];
  totals: { gross; deductions; net; headcount };
  simulated: true;   // always
}
```

### Engagement

```ts
interface Announcement { id; organizationId; title; body; author; publishedAt: ISODateTime; audience: 'all' | 'department' | 'public-hq'; departmentId?: Id; pinned: boolean }
interface Recognition { id; organizationId; from; toEmployeeId; value; message; at: ISODateTime; reactions: number }
interface EngagementSurvey { id; organizationId; title; status: 'draft' | 'open' | 'closed'; anonymous: boolean; questions: { id; text; kind: 'scale' | 'text' }[]; closesOn: ISODate }
interface FeedbackItem { id; organizationId; category: 'idea' | 'concern' | 'praise' | 'question'; body; at: ISODateTime; status: 'new' | 'acknowledged' | 'actioned'; anonymous: boolean }
interface TeamActivity { id; organizationId; title; date: ISODate; location; kind: 'social' | 'learning' | 'wellbeing' | 'volunteering'; rsvps: Id[] }
interface CultureInitiative { id; organizationId; title; owner; progress: number; status: 'planned' | 'active' | 'done' }
interface WorkforceMetric { key; label; series: { label; value: number }[] }
```

### Social and city

```ts
interface CityEvent {
  id; title; kind: 'career-fair' | 'meetup' | 'workshop' | 'social' | 'conference';
  district: DistrictId; venue; start: ISODateTime; end: ISODateTime;
  host; hostOrganizationId?: Id; description;
  capacity: number; attendeeCount: number; tags: string[]; communityId?: Id;
}

interface Community { id; name; description; topic; members: number; district: DistrictId; posts: { id; author; text; at }[] }
interface SocialProfile { id; name; headline; district: DistrictId; avatar: AvatarConfig; interests: string[] }

interface PublicHqProjection {   // the only organisation shape the 3D city may receive
  organization: { id; name; tagline; logoColor; logoGlyph; industry; district; description;
                  website; values; culture; benefits; workArrangements; size; verified };
  vacancies: { id; title; department; workMode; employmentType; postedOn }[];   // published only
  departments: string[];
  directory: { name; title; department }[];   // opted-in employees only
  announcements: { id; title; body; publishedAt }[];   // audience 'public-hq' only
}

interface PresenceProjection {
  id; displayName; avatar: AvatarConfig; district: DistrictId;
  position: { x: number; z: number };
  status: 'exploring' | 'at-event' | 'in-building' | 'idle';
}
```

The full `MarketSnapshot` schema is in `frontend/domain/src/markets.ts` and `docs/MARKETS_FEED_CONTRACT.md`.
