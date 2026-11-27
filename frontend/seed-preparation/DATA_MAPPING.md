# Data mapping: frontend mock data → database

This document maps each mock dataset onto the database tables.

The target is the backend's real schema, `backend/api/prisma/schema.prisma` and its 6 migrations. Table and column names below are the database names. The OpenAPI models were not used to design the tables, because API responses don't map one-to-one onto rows.

The counts are for the default generation. `VALIDATION_REPORT.md` holds the counts for the version actually generated.

**Conventions**

- **IDs.** Mock IDs are kept wherever possible, because they already fit the database's ID format (text, at most 64 characters). Organisation IDs in particular are unchanged, because the 3D city places each HQ building by organisation ID. Where an ID had to change, the change is listed in `ID_MAPPING.json`.
- **Dates.** Dates are written as `YYYY-MM-DD` into `DATE` columns. Timestamps are written as UTC into `TIMESTAMP(3)` columns. `--anchor-date` shifts every date by the same number of days, including dates inside JSON fields such as application history.
- **Server-side defaults.** `@default(cuid())` and `@updatedAt` are filled in by Prisma, not by the database, so the seed supplies `id`, `createdAt` and `updatedAt` explicitly. They default to the mock "now", 2026-11-09 09:00 UTC, shifted the same way as the other dates.
- **Enums.** Enums use the database labels, which are the Prisma `@map` values, for example `org-admin`, `on-leave` and `remote-work`. These are the same strings the frontend uses.
- **Emails.** Every email uses a reserved `.example` domain (RFC 2606). No real personal information appears anywhere.
- **No invented records.** People, attributions, totals, files and financial results are never made up. Where the mock has only a total, the total is not turned into rows.

## 1. Mock data inventory

| Source file | Mock dataset | Records | Seeded into |
|---|---|--:|---|
| `frontend/domain/src/fixtures/orgs.ts` | `ORGANIZATIONS` | 9 | `Organization` (9) |
| `frontend/domain/src/fixtures/workspaces.ts` | `WORKSPACES` (members, invitations, policies, workflows, checklist) | 2 | `Organization`, `Membership`, `Invitation`, `Policy`, `OfficeLocation`, `Department` |
| `frontend/domain/src/fixtures/structure.ts` | `ORG_STRUCTURE` (locations, departments) | 2 orgs | Same data as the workspaces (checked to be identical) |
| `frontend/domain/src/fixtures/jobs.ts` | `JOBS` | 32 | `Job` (32) |
| `frontend/domain/src/fixtures/recruitment.ts` | `TALENT_POOL` | 40 | `User`, `CandidateProfile` |
| | `SEED_APPLICATIONS` | 71 | `Application` (60, after resolving 11 duplicates, §5) |
| | `SEED_INTERVIEWS` / `SEED_ASSESSMENTS` / `SEED_SHORTLISTS` | 8 / 3 / 1 | `Interview` / `Assessment` / `Shortlist` |
| `frontend/domain/src/fixtures/employees.ts`, `employee-records.ts` | `ORG_STAFF` → `ORG_EMPLOYEES` | 42 | `Employee` (42), `LifecycleTask` (20) |
| | `EmployeeRecord.documents` | 98 | **Not seeded** (§4) |
| `frontend/domain/src/fixtures/compensation.ts` | `ORG_HR` (attendance, leave, reviews, compensation) | 600 / 15 / 40 / 42 | `AttendanceEntry`, `LeaveRequest`, `PerformanceReview`, `Compensation` |
| | `PAY_COMPONENTS`, `COMPENSATION_STRUCTURES` | 5 / 4 | `PayComponent` (10), `CompensationStructure` (8): one copy per organisation |
| | `LEAVE_ALLOWANCE` | 1 | `Organization.leaveAllowances` |
| `frontend/domain/src/fixtures/social.ts` | `CITY_EVENTS` | 8 | `CityEvent` (8) |
| | `COMMUNITIES` (with posts) | 6 (6 posts) | `Community`, `CommunityPost`, `CommunityMember` |
| | `SOCIAL_PROFILES` | 8 | `User`, `CandidateProfile` |
| | `SEED_ANNOUNCEMENTS` / `SEED_RECOGNITION` / `SEED_INITIATIVES` | 4 / 6 / 4 | `Announcement` / `Recognition` / `CultureInitiative` |
| | `SEED_SURVEYS` (with responses) | 2 (39) | `Survey`, `SurveyResponse` |
| | `SEED_FEEDBACK` | 3 | `FeedbackItem` (2; `fb-k-2` excluded, §6) |
| | `SEED_ACTIVITIES` (with RSVPs) | 4 (30 RSVPs) | `TeamActivity` (4), `ActivityRsvp` (13, §3) |
| | `WORKFORCE_HISTORY` | 2 orgs | **Not seeded**: analytics are computed by the backend |
| `frontend/domain/src/fixtures/career.ts` | `DEMO_CANDIDATE` | 1 | `User`, `CandidateProfile` |
| | `MISSIONS`, `SKILL_CHALLENGES`, `COURSES`, `ACHIEVEMENTS` | 4 / 8 / 5 / 6 | **Already in the backend** (`prisma/content/career.json`) |
| `frontend/domain/src/permissions.ts` | `PERSONAS` | 6 | `User`, `Membership` (test accounts) |
| | `DEFAULT_TIER_MODULES` | 3 | **Not needed**: identical to the backend default |
| `frontend/domain/src/fixtures/city.ts` | `DISTRICTS`, `BUILDINGS` | 11 / – | **Not seeded**: frontend-owned city layout |
| `frontend/web/src/lib/store/state.ts` | `createInitialState()`: saved job, welcome notification, connection, event invitation, privacy settings | 1 each | `SavedJob`, `Notification`, `Connection`, `EventInvitation`, `CandidateProfile` privacy columns |
| | XP, challenge results, course progress, missions claimed, AI thread, payroll runs, RSVPs, reports | 0 each | Nothing to seed |
| `frontend/web/src/app/app/missions/page.tsx` | Career assessment questions (inline) | 3 | **Already in the backend** (`career.json`) |
| `frontend/city/src/services/games.ts` | `GAME_CATALOGUE` | 5 | **Not seeded**: static copy; the backend reports "coming-soon" with no row |
| `frontend/city/src/services/presence.ts`, `markets.ts` | Simulated presence, mock market snapshot | – | **Never seeded**: live and provider data |

## 2. Accounts and access (least privilege)

**60 accounts.** Each one exists because a person signs in, or because a preserved record requires a user. Nobody gets an account to make the numbers match the mock.

| Accounts | Who | Why an account is needed | Memberships |
|--:|---|---|---|
| 1 | `seed-platform-admin` "Grooveli City Team" | `CityEvent.createdById` is required for the 6 events no organisation admin hosts. Also the platform-admin test account. | – (`platformRole = admin`) |
| 1 | `cand-demo` Tolu Adebayo | Candidate persona | – |
| 5 | Workspace members (Ifeoma Nwosu is one account across 2 organisations; Grace Ayodele is also social profile `soc-3`) | Sign in (personas) | Their mock roles |
| 1 | `soc-2` Kofi Asante | Employee + line-manager persona | Kestrel `employee` + `manager`, linked to `emp-kestrel-01` |
| 6 | `user-emp-kestrel-04` … `-09` | Senders of the 6 recognition records (`Recognition.fromUserId` is required) | Kestrel `employee` only, linked to their HR records |
| 40 | `talent-NN` | Applicants (`Application.candidateId` is a required user foreign key) | – |
| 6 | Remaining `soc-N` | People in Social → People: post authors, the connection | – |

**Why most employee records have no account.** The backend doesn't require one:
- `Employee.userId` is optional.
- HR adds employees without accounts.
- A membership is linked to its employee record only when someone with a matching email joins.

So 35 of the 42 HR records are just HR records, with no login and no membership. They still appear correctly in the directory, leave, attendance, reviews and payroll.

**Membership counts.**

| Organisation | Mock workspace members | Seeded members | Made up of |
|---|--:|--:|---|
| Kestrel | 4 | 11 | The 4 mock members, plus Kofi (the employee persona, who in the mock signs in as a Kestrel employee but isn't in the workspace member list), plus the 6 recognition senders |
| Amberline | 2 | 2 | The 2 mock members |

The previous version of the package seeded 32 Kestrel members because it gave every HR record an account. The backend doesn't require that, so it has been removed.

**What each kind of account can do.** Effective permissions come from the backend's own role matrix, `backend/api/src/auth/permissions.ts`:

| Kind of account | Roles | Permissions |
|---|---|---|
| Every non-test membership | `employee` only | `hr.directory.view`, `engagement.participate`, `self.service` |
| Test accounts | Their mock persona roles | Recruiter, HR, payroll and admin rights exist only on these accounts |
| Kofi (persona) | `employee` + `manager` | Adds `recruitment.view`, `hr.leave.approve`, `hr.performance.manage`. The backend limits leave and review powers to his direct reports (`directReportIds`/`managedScope` in `hr.service.ts`). |

None of the non-test accounts can sign in: they keep the placeholder hash, and the provisioning script can only provision the 8 test accounts.

**Test accounts (one per role).** There is no separate "employer" role in the backend. An employer is an organisation account, so the organisation admin covers it.

| Role | Email | Memberships |
|---|---|---|
| Candidate | `tolu.adebayo@candidate.example` | – |
| Organisation admin / employer | `ifeoma@kestrel.example` | Kestrel org-admin; Amberline org-admin |
| HR manager | `daniel@kestrel.example` | Kestrel hr-manager |
| Recruiter | `zainab@kestrel.example` | Kestrel recruiter (Engineering, Product) |
| Payroll officer | `chidi@kestrel.example` | Kestrel payroll-officer |
| HR manager + recruiter | `grace@amberline.example` | Amberline hr-manager + recruiter |
| Employee + line manager | `kofi@kestrel.example` | Kestrel employee + manager, record `emp-kestrel-01` |
| Platform administrator | `platform-admin@grooveli.example` | – (`platformRole = admin`) |

**Other user columns:**

| Column | Value |
|---|---|
| `passwordHash` | The placeholder `!seed:password-not-set`. Argon2 rejects it, so nobody can sign in until provisioned. |
| `accountType` | `candidate` for the demo candidate, talent and social-only people; `organization` for everyone else |
| `emailVerifiedAt` | The seed timestamp |
| `onboardingComplete` | `true`. Talent search only lists onboarded candidates. |
| `activeOrganizationId` | The account's first membership |
| Never seeded | `Session`, `AuthToken`, `AuditLog`, `DataExportRequest` |

## 3. Entity mappings

### Organisations and structure

| Mock → table | Field mapping and transformations | Relationships |
|---|---|---|
| `OrganizationPublicProfile` → `Organization` (9) | Public fields map 1:1: `culture` as jsonb; `values`, `benefits`, `workArrangements` as text[]. `tier`, `workflows` and `setupChecklist` come from the workspace where one exists (Kestrel `enterprise`, Amberline `starter`), otherwise the defaults apply. `leaveAllowances` uses the frontend `LEAVE_ALLOWANCE`. | IDs unchanged |
| `OfficeLocation` → `OfficeLocation` (4); `Department` → `Department` (7) | 1:1, plus `organizationId`. `headEmployeeId` is kept. | → `Organization` |
| `OrgMember` → `Membership` (6) | Roles and `active` status map directly; `departmentId` and `recruitingFor` are kept | → `User`, `Organization` |
| Persona and recognition senders → `Membership` (7) | See §2 | ↔ `Employee.userId` |
| `Invitation` → `Invitation` (1) | `tokenHash` is generated by PostgreSQL at run time from random data, so the seed holds no usable token. `expiresAt` = `sentAt` + 7 days. `invitedById` = the organisation's admin. | → `Organization`, `User` |
| `Policy` → `Policy` (6) | `version = 1`. The `acknowledgements` total is **not** turned into rows (§4). | → `Organization` |

### Candidates, jobs and recruitment

| Mock → table | Field mapping and transformations |
|---|---|
| Demo `CandidateProfile` → `User` + `CandidateProfile` | 1:1 (skills, experience, education, preferences and personality as jsonb), plus the mock `PrivacySettings` columns. `cvFile` is null. |
| `TalentProfile` → `User` + `CandidateProfile` (40) | `qualifications` → `certifications`. `location`, `expectedSalary`, `workModes` and `employmentTypes` → `preferences`. `visibility = employers`; not discoverable in Social, as in the mock. |
| `SocialProfile` → `User` + `CandidateProfile` (8) | `district` → `homeDistrict`; `interests`, `headline` and `avatar` kept. `visibility = private`. |
| `Job` → `Job` (32) | 1:1. `createdAt`/`updatedAt` = `postedOn`. |
| `Application` → `Application` (60) | Duplicates resolved (§5). `simulated` dropped; `source = candidate`. `history` kept as is, with dates shifted. |
| `Interview` (8), `Shortlist` (1), `Assessment` (3) | 1:1. `organizationId` comes from the job. Assessment results gain `reviewerId` (matched by name) and `at`. No references needed re-pointing (§5). |

### HR

| Mock → table | Field mapping and transformations |
|---|---|
| `EmployeeRecord` → `Employee` (42) | 1:1. `userId` is set only for the 7 records with an account. `emp-kestrel-01` takes the persona's identity (§6). |
| `LifecycleTask` (20), `AttendanceEntry` (600), `LeaveRequest` (15) | 1:1. Leave's `decidedBy` (a name such as "People team") → `decidedByName`. |
| `PerformanceReview` → `PerformanceReview` (40) | `reviewer` → `reviewerName`, plus `reviewerId` when the reviewer has an account. The 5 reviews whose reviewer was the generated name "Thabo Abubakar" now name Kofi Asante (§6). |

### Payroll (preview configuration only)

| Mock → table | Field mapping and transformations |
|---|---|
| `PayComponent` (10), `CompensationStructure` (8) | Global in the mock but per-organisation in the database, and the ID is the primary key. Each is copied for Kestrel and Amberline with the organisation code appended (`pc-housing` → `pc-housing-k`, `pc-housing-a`). `calc` splits into `calcType` + `calcValue`. |
| `CompensationRecord` → `Compensation` (42) | `structureId` is remapped per organisation; `bankOnFile` is kept, with no bank details. |
| Payroll previews | **None.** Financial results are never invented. |

### Engagement

| Mock → table | Field mapping and transformations |
|---|---|
| `Announcement` (4) | `authorId` matched from the author's name (Ifeoma, Daniel, Grace) |
| `Recognition` (6) | `fromUserId` = the sender's account (§2). The `reactions` total is **not** turned into rows. |
| `Survey` (2) + `SurveyResponse` (39) | Responses have no user, and anonymous ones no timestamp either. No `SurveyRespondent` markers are written: they are HMACs keyed by the backend's `HASH_SECRET`, and the answers belong to nobody. |
| `FeedbackItem` (2 of 3) | The two anonymous items; `fb-k-2` excluded (§6) |
| `TeamActivity` (4) + `ActivityRsvp` (13 of 30) | An RSVP is stored per membership. RSVPs from the 7 employees with accounts are kept; the other 17 aren't, because no account is created just to carry an RSVP. |
| `CultureInitiative` (4) | 1:1 |

### Social and city

| Mock → table | Field mapping and transformations |
|---|---|
| `CityEvent` (8) | 1:1. `createdById` = the host organisation's admin, otherwise the platform account. |
| `Community` (6), posts → `CommunityPost` (6) + `CommunityMember` (6) | Post IDs are prefixed with the community (`p1` → `com-builders-p1`), because the mock reuses `p1`. Authors ("Kofi A.") are matched to social-profile accounts and added as members, because only members can post. |
| Event invitation (1), connection (1), welcome notification (1) | As in the mock. The notification body is reworded: the mock text says data is "stored only in this browser". |

## 4. Not migrated

| Entity | Mock records / total | Why |
|---|--:|---|
| `EmployeeDocument` | 98 | Metadata only. Each row needs a `storageKey` for a real stored file, and no files or file URLs are invented. The records are kept in `seed-data.json` under `unsupported`. |
| `Policy.acknowledgements` (totals) | 90 | Totals only, with no names. An acknowledgement is an attestation by a named person, so none are invented. |
| `Recognition.reactions` (totals) | 48 | Totals only, with no names; reactions are not attributed to people |
| RSVPs of employees without an account | 17 | No accounts are created to carry them (§2) |
| `CityEvent.attendeeCount` | 649 | Computed from attendee rows; no attendee accounts are invented |
| `Community.members` | 6,780 | Computed from member rows |
| `Community.affinity` | 6 | No column |
| `WORKFORCE_HISTORY` | 2 orgs | No table |
| `Application.simulated`, `PresenceProjection.source`, `CityBuilding`/`CityDistrict` placement | – | Frontend-only |

**Already handled by the backend:**

- **Career content** is loaded by `pnpm --filter @grooveli/api db:content`. It is identical to the frontend except one deliberate wording change ("Submit your first application").
- **Tier modules and game availability** fall back to matching defaults.

## 5. Duplicate applications (11)

The mock's generator assigned the same talent to the same vacancy twice. Every pair has an identical cover letter and a single-step history, and the fit scores are random, so all of them are generator collisions. The database allows one application per candidate per vacancy (`Application_jobId_candidateId_key`).

**How the canonical record was chosen.** It is selected by evidence, never by combining histories. The criteria apply in order:
1. the record other records reference (interviews, assessment results, shortlists);
2. the furthest pipeline progression, where rejected and withdrawn don't count as progression;
3. the earliest submission, since the later record repeats it;
4. fixture order.

| Candidate | Vacancy | Kind | Kept | Dropped | Why |
|---|---|---|---|---|---|
| talent-01 | job-k-backend | conflicting | `app-seed-6` (interview) | `app-seed-1` (submitted) | Only record referenced (interview `int-seed-2`, shortlist `sl-backend`) |
| talent-03 | job-k-frontend | conflicting | `app-seed-7` (hired) | `app-seed-12` (submitted) | Furthest progression |
| talent-05 | job-k-pd | conflicting | `app-seed-18` (offer) | `app-seed-13` (shortlisted) | Furthest progression |
| talent-35 | job-k-people | conflicting | `app-seed-23` (offer) | `app-seed-28` (rejected) | Furthest progression; the rejected copy has no history explaining a rejection after an offer |
| talent-37 | job-k-devops | conflicting | `app-seed-29` (interview) | `app-seed-34` (submitted) | Only record referenced (interview `int-seed-8`) |
| talent-07 | job-k-intern | conflicting | `app-seed-36` (hired) | `app-seed-41` (screening) | Furthest progression |
| talent-04 | job-k-sec | conflicting | `app-seed-52` (shortlisted) | `app-seed-47` (submitted) | Furthest progression |
| talent-39 | job-k-intern | repeated | `app-seed-35` (submitted) | `app-seed-40` (submitted) | Identical status and time; first in fixture order |
| talent-36 | job-k-sec | repeated | `app-seed-51` (interview) | `app-seed-46` (interview) | Earliest submission (28 Oct vs 29 Oct) |
| talent-09 | job-a-healthtech | repeated | `app-seed-70` (submitted) | `app-seed-65` (submitted) | Earliest submission (31 Oct vs 1 Nov) |
| talent-17 | job-a-healthtech | repeated | `app-seed-71` (offer) | `app-seed-66` (offer) | Earliest submission (30 Oct vs 31 Oct) |

No dropped record is referenced by anything, so no interview, shortlist or assessment had to be re-pointed. Each kept record keeps its own history, status and fit score. The full details are in `ID_MAPPING.json` → `remapped.applicationMerges`.

## 6. Resolved data issues

**1. Employee persona identity: merged into one person, Kofi Asante.**

The evidence shows one person:
- `EMPLOYEE_PERSONA_ID` is defined as "the head of Kestrel Engineering" and resolves to `emp-kestrel-01`.
- That record's title is Engineering Manager, and it heads Engineering.
- The persona is "Engineering manager using self-service".
- Social profile `soc-2` "Kofi Asante" has the headline Engineering Manager in the tech district.
- Kofi is also the Engineering interviewer and assessment reviewer in the recruitment fixtures.
- The record's name, "Thabo Abubakar", comes only from the random name generator (`buildStaff`), and no hand-written mock source refers to it. No other employee is called Kofi Asante.

The generator re-checks this evidence on every run, and would report a conflict instead of merging if it stopped holding.

| What changed | From | To |
|---|---|---|
| `Employee.name` (`emp-kestrel-01`) | Thabo Abubakar | Kofi Asante |
| `Employee.email` | `thabo.abubakar@kestrel.example` | `kofi@kestrel.example`, the same as the account, which is how the backend links members to records |
| `Employee.avatar` | The generated record's random avatar | `soc-2`'s avatar, so the person looks the same in the city, social and HR views |
| `PerformanceReview.reviewerName` (5 reviews) | Thabo Abubakar | Kofi Asante, with `reviewerId` set to `soc-2` |

Employment data is unchanged: title, department, manager, start date, status, leave, attendance, reviews, compensation and recognition received. The mock fixtures themselves were not modified.

**2. Duplicate applications.** See §5.

**3. `fb-k-2` (non-anonymous feedback without an author) is excluded.** The backend always records the author of non-anonymous feedback and shows it (`engagement.service.ts`). The mock names no author, and inventing one or relabelling the item as anonymous would misrepresent it.

**4. Employee accounts.** Least privilege, as described in §2.

**5. Synthetic attributions removed.** Policy acknowledgements and recognition reactions are no longer assigned to people (§4).

## 7. Record count change

The previous version had **1,360** rows; this one has **1,134** (−226):

| Change | Rows |
|---|--:|
| Accounts no longer created for HR records | −35 |
| Their memberships | −35 |
| Invented policy acknowledgements | −90 |
| Invented recognition reactions | −48 |
| RSVPs of employees without an account | −17 |
| `fb-k-2` excluded | −1 |

The number of applications is still 60. The canonical records now come from the evidence-based selection in §5.
