# Grooveli City API — endpoint list

> Generated from `src/openapi/routes.ts` by `pnpm openapi:export`. Do not edit by hand.

Base URL: `/api/v1`. **205 operations**, of which **41** are marked **[added]** (not in the frontend's original list; added for production).
Interactive docs: run the API and open `/api/docs`.

## System

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/health` | Liveness probe **[added]** | Public |  |
| GET | `/health/ready` | Readiness probe **[added]** | Public |  |

## Auth

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| POST | `/auth/signup` | Create an account | Public |  |
| POST | `/auth/login` | Sign in | Public |  |
| POST | `/auth/logout` | Sign out | Signed in |  |
| GET | `/auth/session` | Current session | Signed in |  |
| PUT | `/auth/session/active-organization` | Switch active organisation | Signed in |  |
| POST | `/auth/password/forgot` | Request a password reset email | Public |  |
| POST | `/auth/password/reset` | Set a new password with a reset token | Public |  |
| POST | `/auth/password/change` | Change password while signed in **[added]** | Signed in |  |
| POST | `/auth/email/verify` | Confirm an email address **[added]** | Public |  |
| POST | `/auth/email/resend` | Resend the verification email **[added]** | Signed in |  |
| POST | `/invitations/{token}/accept` | Accept an organisation invitation | Signed in |  |

## Account

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/me/export` | Request a copy of my data **[added]** | Signed in |  |
| DELETE | `/me/account` | Delete my account **[added]** | Signed in |  |

## Candidate profile

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/me/profile` | My candidate profile | Signed in |  |
| POST | `/me/onboarding` | Complete candidate onboarding | Signed in |  |
| PATCH | `/me/profile` | Update my profile | Signed in |  |
| POST | `/me/cv` | Upload or replace my CV | Signed in |  |
| GET | `/me/cv` | My CV metadata and download link | Signed in |  |
| DELETE | `/me/cv` | Delete my CV | Signed in |  |
| GET | `/me/privacy` | My privacy settings | Signed in |  |
| PATCH | `/me/privacy` | Update privacy settings | Signed in |  |

## Jobs & applications

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/jobs` | Search published jobs | Public |  |
| GET | `/jobs/{jobId}` | Job details | Public |  |
| GET | `/me/job-matches` | Jobs ranked for me | Signed in |  |
| GET | `/me/job-matches/{jobId}` | My match for one job | Signed in |  |
| GET | `/me/saved-jobs` | IDs of my saved jobs | Signed in |  |
| PUT | `/me/saved-jobs/{jobId}` | Save a job | Signed in |  |
| DELETE | `/me/saved-jobs/{jobId}` | Unsave a job | Signed in |  |
| POST | `/jobs/{jobId}/applications` | Apply to a job | Signed in |  |
| GET | `/me/applications` | My applications | Signed in |  |
| POST | `/me/applications/{applicationId}/withdraw` | Withdraw an application | Signed in |  |
| GET | `/me/interviews` | My interviews | Signed in |  |

## Career progress

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/me/progress` | My XP, level and recent XP events | Signed in |  |
| GET | `/career/challenges` | Skill challenges | Signed in |  |
| POST | `/career/challenges/{challengeId}/attempts` | Submit a challenge attempt | Signed in |  |
| GET | `/career/assessment` | Career assessment questions | Signed in |  |
| POST | `/career/assessment` | Submit the career assessment | Signed in |  |
| POST | `/career/interview-simulations` | Record an interview simulation | Signed in |  |
| GET | `/career/courses` | Courses with my progress | Signed in |  |
| PUT | `/me/courses/{courseId}/modules/{moduleIndex}` | Mark a course module complete | Signed in |  |
| DELETE | `/me/courses/{courseId}/modules/{moduleIndex}` | Mark a course module not complete | Signed in |  |
| GET | `/career/missions` | Missions with my progress | Signed in |  |
| POST | `/me/missions/{missionId}/claim` | Claim a completed mission | Signed in |  |
| GET | `/me/achievements` | Achievements and whether I unlocked them | Signed in |  |
| GET | `/me/notifications` | My notifications | Signed in |  |
| POST | `/me/notifications/read` | Mark notifications read | Signed in |  |

## AI assistant

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/me/assistant/thread` | My assistant conversation | Signed in |  |
| POST | `/me/assistant/messages` | Send a message to the assistant | Signed in |  |
| POST | `/me/assistant/confirm-applications` | Submit applications the assistant suggested | Signed in |  |
| DELETE | `/me/assistant/thread` | Clear my assistant conversation | Signed in |  |

## Organisations

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/orgs` | Public organisation directory | Public |  |
| GET | `/orgs/{orgId}` | Public organisation profile and vacancies | Public |  |
| POST | `/orgs` | Onboard a new organisation | Signed in |  |
| PATCH | `/orgs/{orgId}/profile` | Update the public profile | `org.settings.manage` |  |
| GET | `/orgs/{orgId}/workspace` | Private workspace | Active member of the organisation |  |
| PATCH | `/orgs/{orgId}/workspace` | Update workflows and setup checklist | `org.settings.manage` |  |
| GET | `/orgs/{orgId}/members` | Members | `org.members.manage` |  |
| POST | `/orgs/{orgId}/invitations` | Invite a member | `org.members.manage` |  |
| DELETE | `/orgs/{orgId}/invitations/{invitationId}` | Revoke an invitation | `org.members.manage` |  |
| PUT | `/orgs/{orgId}/members/{memberId}/roles` | Set a member's roles | `org.members.manage` |  |
| PUT | `/orgs/{orgId}/members/{memberId}/status` | Suspend or reactivate a member | `org.members.manage` |  |
| POST | `/orgs/{orgId}/departments` | Create a department | `org.settings.manage` |  |
| PATCH | `/orgs/{orgId}/departments/{departmentId}` | Update a department **[added]** | `org.settings.manage` |  |
| DELETE | `/orgs/{orgId}/departments/{departmentId}` | Delete a department **[added]** | `org.settings.manage` |  |
| POST | `/orgs/{orgId}/locations` | Add an office location | `org.settings.manage` |  |
| PATCH | `/orgs/{orgId}/locations/{locationId}` | Update an office location **[added]** | `org.settings.manage` |  |
| DELETE | `/orgs/{orgId}/locations/{locationId}` | Remove an office location **[added]** | `org.settings.manage` |  |
| GET | `/orgs/{orgId}/structure` | Org chart | `hr.directory.view` |  |
| GET | `/orgs/{orgId}/subscription` | Plan and enabled modules | `org.billing.view` |  |
| PUT | `/orgs/{orgId}/subscription` | Change plan | org-admin role |  |
| PUT | `/platform/tiers/{tier}/modules` | Set which modules a plan includes | Grooveli platform admin |  |
| PUT | `/platform/orgs/{orgId}/verification` | Mark an organisation verified **[added]** | Grooveli platform admin |  |
| GET | `/orgs/{orgId}/audit-log` | Audit log **[added]** | org-admin role |  |
| GET | `/orgs/{orgId}/dashboard` | Workspace dashboard counts | Active member of the organisation |  |

## Recruitment

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/orgs/{orgId}/recruitment/vacancies` | Vacancies (any status) | `recruitment.view` | recruitment |
| POST | `/orgs/{orgId}/recruitment/vacancies` | Create a vacancy | `recruitment.manage` | recruitment |
| PUT | `/orgs/{orgId}/recruitment/vacancies/{jobId}` | Replace a vacancy | `recruitment.manage` | recruitment |
| PUT | `/orgs/{orgId}/recruitment/vacancies/{jobId}/status` | Publish, close or return a vacancy to draft | `recruitment.manage` | recruitment |
| DELETE | `/orgs/{orgId}/recruitment/vacancies/{jobId}` | Delete a draft vacancy **[added]** | `recruitment.manage` | recruitment |
| GET | `/orgs/{orgId}/recruitment/applications` | Applications | `recruitment.view` | recruitment |
| GET | `/orgs/{orgId}/recruitment/applications/{applicationId}/cv` | Applicant CV download link **[added]** | `recruitment.view` | recruitment |
| POST | `/orgs/{orgId}/recruitment/applications/{applicationId}/status` | Move an application through the pipeline | `recruitment.manage` | recruitment |
| GET | `/orgs/{orgId}/recruitment/interviews` | Interviews | `recruitment.view` | recruitment |
| POST | `/orgs/{orgId}/recruitment/interviews` | Schedule an interview | `recruitment.manage` | recruitment |
| PATCH | `/orgs/{orgId}/recruitment/interviews/{interviewId}` | Update an interview | `recruitment.manage` | recruitment |
| GET | `/orgs/{orgId}/recruitment/talent` | Search candidates visible to employers | `recruitment.view` | recruitment |
| POST | `/orgs/{orgId}/recruitment/talent/{talentId}/invitations` | Invite a candidate to apply | `recruitment.manage` | recruitment |
| GET | `/orgs/{orgId}/recruitment/shortlists` | Shortlists | `recruitment.view` | recruitment |
| POST | `/orgs/{orgId}/recruitment/shortlists` | Create a shortlist | `recruitment.manage` | recruitment |
| PUT | `/orgs/{orgId}/recruitment/shortlists/{shortlistId}/applications/{applicationId}` | Add an application to a shortlist | `recruitment.manage` | recruitment |
| DELETE | `/orgs/{orgId}/recruitment/shortlists/{shortlistId}/applications/{applicationId}` | Remove an application from a shortlist | `recruitment.manage` | recruitment |
| GET | `/orgs/{orgId}/recruitment/assessments` | Assessments | `recruitment.view` | recruitment |
| POST | `/orgs/{orgId}/recruitment/assessments` | Create an assessment | `recruitment.manage` | recruitment |
| POST | `/orgs/{orgId}/recruitment/assessments/{assessmentId}/results` | Record a candidate's result | `recruitment.manage` | recruitment |
| GET | `/orgs/{orgId}/recruitment/analytics` | Recruitment metrics | `recruitment.view` | recruitment |

## HR

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/orgs/{orgId}/hr/employees` | Employee directory | `hr.directory.view` | hr |
| GET | `/orgs/{orgId}/hr/employees/{employeeId}` | Employee record | `hr.records.manage` (or the employee themself) | hr |
| POST | `/orgs/{orgId}/hr/employees` | Add an employee | `hr.records.manage` | hr |
| PATCH | `/orgs/{orgId}/hr/employees/{employeeId}` | Update an employee record | `hr.records.manage` | hr |
| POST | `/orgs/{orgId}/hr/employees/{employeeId}/offboarding` | Start offboarding | `hr.records.manage` | hr |
| POST | `/orgs/{orgId}/hr/employees/{employeeId}/offboarding/complete` | Complete offboarding | `hr.records.manage` | hr |
| PUT | `/orgs/{orgId}/hr/employees/{employeeId}/tasks/{taskId}` | Tick or untick an on/offboarding task | `hr.records.manage` | hr |
| GET | `/orgs/{orgId}/hr/employees/{employeeId}/documents` | Employee documents | `hr.records.manage` (or the employee themself) | hr |
| POST | `/orgs/{orgId}/hr/employees/{employeeId}/documents` | Upload an employee document | `hr.records.manage` | hr |
| GET | `/orgs/{orgId}/hr/employees/{employeeId}/documents/{documentId}` | Download link for a document **[added]** | `hr.records.manage` (or the employee themself) | hr |
| DELETE | `/orgs/{orgId}/hr/employees/{employeeId}/documents/{documentId}` | Delete a document **[added]** | `hr.records.manage` | hr |
| GET | `/orgs/{orgId}/hr/leave` | Leave requests | `hr.leave.approve` (or own requests with self.service) | hr |
| POST | `/orgs/{orgId}/hr/leave` | Request leave | `self.service` | hr |
| POST | `/orgs/{orgId}/hr/leave/{leaveId}/decision` | Approve, reject or cancel leave | `hr.leave.approve` ("cancelled" by the requester is also allowed) | hr |
| GET | `/orgs/{orgId}/hr/attendance` | Attendance | `hr.directory.view` | hr |
| POST | `/orgs/{orgId}/hr/attendance/clock-in` | Clock in for today | `self.service` | hr |
| POST | `/orgs/{orgId}/hr/attendance/clock-out` | Clock out for today **[added]** | `self.service` | hr |
| GET | `/orgs/{orgId}/hr/reviews` | Performance reviews | `hr.performance.manage` (or own reviews with self.service) | hr |
| POST | `/orgs/{orgId}/hr/reviews` | Start a review cycle **[added]** | `hr.performance.manage` | hr |
| PATCH | `/orgs/{orgId}/hr/reviews/{reviewId}` | Update a performance review | `hr.performance.manage` | hr |
| GET | `/orgs/{orgId}/hr/policies` | HR policies | Active member of the organisation | hr |
| POST | `/orgs/{orgId}/hr/policies` | Create a policy | `hr.policies.manage` | hr |
| PUT | `/orgs/{orgId}/hr/policies/{policyId}` | Update a policy | `hr.policies.manage` | hr |
| DELETE | `/orgs/{orgId}/hr/policies/{policyId}` | Archive a policy **[added]** | `hr.policies.manage` | hr |
| POST | `/orgs/{orgId}/hr/policies/{policyId}/acknowledge` | Acknowledge a policy | `self.service` | hr |
| GET | `/me/employee` | My employee self-service view | `self.service` | hr |

## Payroll (preview)

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/orgs/{orgId}/payroll/compensation` | Compensation records | `payroll.view` | payroll |
| PUT | `/orgs/{orgId}/payroll/compensation/{employeeId}` | Change base salary | `payroll.prepare` | payroll |
| GET | `/orgs/{orgId}/payroll/components` | Allowances and deductions | `payroll.view` | payroll |
| PUT | `/orgs/{orgId}/payroll/components/{componentId}` | Create or replace a pay component | `payroll.prepare` | payroll |
| GET | `/orgs/{orgId}/payroll/structures` | Salary structures | `payroll.view` | payroll |
| PUT | `/orgs/{orgId}/payroll/structures/{structureId}` | Create or replace a salary structure **[added]** | `payroll.prepare` | payroll |
| PUT | `/orgs/{orgId}/payroll/structures/{structureId}/components` | Set a structure's components | `payroll.prepare` | payroll |
| GET | `/orgs/{orgId}/payroll/previews` | Payroll previews | `payroll.view` | payroll |
| POST | `/orgs/{orgId}/payroll/previews` | Generate a payroll preview | `payroll.prepare` | payroll |
| POST | `/orgs/{orgId}/payroll/previews/{previewId}/approve` | Approve a preview | `payroll.prepare` | payroll |
| DELETE | `/orgs/{orgId}/payroll/previews/{previewId}` | Delete a draft preview | `payroll.prepare` | payroll |
| GET | `/orgs/{orgId}/payroll/previews/{previewId}/payslips/{employeeId}` | One payslip preview | `payroll.view` (or the employee themself) | payroll |
| GET | `/orgs/{orgId}/payroll/reports` | Payroll totals by period and department | `payroll.view` | payroll |

## Engagement

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/orgs/{orgId}/engagement/announcements` | Announcements | `engagement.participate` | engagement |
| POST | `/orgs/{orgId}/engagement/announcements` | Post an announcement | `engagement.manage` | engagement |
| PUT | `/orgs/{orgId}/engagement/announcements/{announcementId}` | Edit an announcement **[added]** | `engagement.manage` | engagement |
| DELETE | `/orgs/{orgId}/engagement/announcements/{announcementId}` | Delete an announcement | `engagement.manage` | engagement |
| GET | `/orgs/{orgId}/engagement/recognition` | Recognition wall | `engagement.participate` | engagement |
| POST | `/orgs/{orgId}/engagement/recognition` | Recognise a colleague | `engagement.participate` | engagement |
| POST | `/orgs/{orgId}/engagement/recognition/{recognitionId}/reactions` | React to a recognition | `engagement.participate` | engagement |
| GET | `/orgs/{orgId}/engagement/surveys` | Engagement surveys | `engagement.participate` | engagement |
| PUT | `/orgs/{orgId}/engagement/surveys/{surveyId}` | Create or update a survey | `engagement.manage` | engagement |
| POST | `/orgs/{orgId}/engagement/surveys/{surveyId}/responses` | Answer a survey | `engagement.participate` | engagement |
| GET | `/orgs/{orgId}/engagement/feedback` | Feedback | `engagement.manage` (participants see only their own non-anonymous items) | engagement |
| POST | `/orgs/{orgId}/engagement/feedback` | Submit feedback | `engagement.participate` | engagement |
| PUT | `/orgs/{orgId}/engagement/feedback/{feedbackId}/status` | Update feedback status | `engagement.manage` | engagement |
| GET | `/orgs/{orgId}/engagement/activities` | Team activities | `engagement.participate` | engagement |
| PUT | `/orgs/{orgId}/engagement/activities/{activityId}` | Create or update an activity | `engagement.manage` | engagement |
| PUT | `/orgs/{orgId}/engagement/activities/{activityId}/rsvps/me` | RSVP to an activity | `engagement.participate` | engagement |
| DELETE | `/orgs/{orgId}/engagement/activities/{activityId}/rsvps/me` | Cancel my RSVP | `engagement.participate` | engagement |
| GET | `/orgs/{orgId}/engagement/initiatives` | Culture initiatives | `engagement.participate` | engagement |
| PUT | `/orgs/{orgId}/engagement/initiatives/{initiativeId}` | Create or update an initiative | `engagement.manage` | engagement |

## Analytics

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/orgs/{orgId}/analytics/workforce` | Workforce metrics | `analytics.view` | analytics |

## Social

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/social/events` | City events | Public |  |
| GET | `/social/events/{eventId}` | Event details and visible attendees | Public; personalised when signed in |  |
| PUT | `/me/events/{eventId}/rsvp` | RSVP to an event | Signed in |  |
| DELETE | `/me/events/{eventId}/rsvp` | Cancel my RSVP | Signed in |  |
| GET | `/social/communities` | Communities | Public; personalised when signed in |  |
| GET | `/social/communities/{communityId}` | Community and recent posts | Public; personalised when signed in |  |
| PUT | `/me/communities/{communityId}` | Join a community | Signed in |  |
| DELETE | `/me/communities/{communityId}` | Leave a community | Signed in |  |
| GET | `/social/communities/{communityId}/posts` | Community posts **[added]** | Public; personalised when signed in |  |
| POST | `/social/communities/{communityId}/posts` | Post in a community | Signed in (members of the community only) |  |
| DELETE | `/social/communities/{communityId}/posts/{postId}` | Delete a post **[added]** | Signed in (author or platform moderator) |  |
| GET | `/social/people` | People to connect with | Signed in |  |
| GET | `/me/connections` | My connections | Signed in |  |
| POST | `/me/connections` | Send a connection request | Signed in |  |
| DELETE | `/me/connections/{profileId}` | Remove a connection or cancel a request | Signed in |  |
| GET | `/me/invitations` | Event invitations sent and received | Signed in |  |
| POST | `/social/events/{eventId}/invitations` | Invite someone to an event | Signed in |  |
| POST | `/me/invitations/{invitationId}/response` | Accept or decline an invitation | Signed in |  |
| PUT | `/me/blocks/{profileId}` | Block someone | Signed in |  |
| DELETE | `/me/blocks/{profileId}` | Unblock someone | Signed in |  |
| POST | `/reports` | Report a user or content | Signed in |  |
| POST | `/orgs/{orgId}/events` | Host an event as the organisation **[added]** | `org.settings.manage` |  |
| PATCH | `/orgs/{orgId}/events/{eventId}` | Update an event the organisation hosts **[added]** | `org.settings.manage` |  |
| DELETE | `/orgs/{orgId}/events/{eventId}` | Cancel an event the organisation hosts **[added]** | `org.settings.manage` |  |

## Messages

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/me/conversations` | My conversations **[added]** | Signed in |  |
| POST | `/me/conversations` | Start (or reopen) a conversation **[added]** | Signed in |  |
| GET | `/me/conversations/{conversationId}/messages` | Messages in a conversation **[added]** | Signed in |  |
| POST | `/me/conversations/{conversationId}/messages` | Send a message **[added]** | Signed in |  |
| POST | `/me/conversations/{conversationId}/read` | Mark a conversation read **[added]** | Signed in |  |

## Moderation

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/platform/reports` | Reports queue **[added]** | Grooveli platform admin |  |
| POST | `/platform/reports/{reportId}/resolution` | Resolve a report **[added]** | Grooveli platform admin |  |
| PUT | `/platform/users/{userId}/suspension` | Suspend or reinstate an account **[added]** | Grooveli platform admin |  |
| POST | `/platform/events` | Create a city event **[added]** | Grooveli platform admin |  |
| PATCH | `/platform/events/{eventId}` | Update a city event **[added]** | Grooveli platform admin |  |
| DELETE | `/platform/events/{eventId}` | Cancel a city event **[added]** | Grooveli platform admin |  |
| POST | `/platform/communities` | Create a community **[added]** | Grooveli platform admin |  |
| PATCH | `/platform/communities/{communityId}` | Update or archive a community **[added]** | Grooveli platform admin |  |

## City

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/city/world` | City world snapshot | Public |  |
| GET | `/city/hq/{orgId}` | One organisation HQ | Public |  |
| GET | `/city/me` | Signed-in player summary | Public; personalised when signed in |  |
| GET | `/city/markets` | Markets billboard snapshot | Public |  |

## Games

| Method | Path | Summary | Access | Module |
|---|---|---|---|---|
| GET | `/games` | Game availability | Public |  |
| POST | `/games/{gameId}/sessions` | Start a game session | Signed in |  |
| POST | `/games/{gameId}/matchmaking` | Join matchmaking | Signed in |  |
| POST | `/games/sessions/{sessionId}/invitations` | Invite a connection | Signed in |  |
| POST | `/games/sessions/{sessionId}/join` | Join a session | Signed in |  |
| GET | `/games/sessions/{sessionId}` | Session state | Signed in |  |
| GET | `/games/sessions/{sessionId}/result` | Session result | Signed in |  |
| PUT | `/platform/games/{gameId}` | Set a game’s availability **[added]** | Grooveli platform admin |  |
