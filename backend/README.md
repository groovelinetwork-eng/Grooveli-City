# Grooveli City — Backend

NestJS API in `backend/api`, serving `/api/v1` on port 4000.

## API contract (Swagger)

The full contract for go-live is defined in code and served as Swagger UI.

| What | Where |
|---|---|
| Interactive docs | `http://localhost:4000/api/docs` (run `pnpm dev:api`) |
| Raw spec | `/api/docs/openapi.json`, `/api/docs/openapi.yaml` |
| Committed copies | `backend/api/openapi/openapi.json`, `openapi.yaml`, `ENDPOINTS.md` |
| Source of truth | `backend/api/src/openapi/` — `routes.ts` (endpoints), `schemas.ts` (data shapes), `document.ts` (envelope, auth, errors) |

```bash
pnpm --filter @grooveli/api openapi:check
```

That command builds the API, regenerates `openapi/`, and validates the spec against the OpenAPI 3.0 schema. Run it after every contract change and commit the output.

**205 operations in 18 groups** (plus the presence WebSocket). It covers everything in *Grooveli City — Expanded Product Vision & Requirements* (the "Backend endpoints" section), plus **[added]** endpoints that the doc and the frontend codebase were missing.

### What was added beyond the doc, and why

| Added | Reason |
|---|---|
| `GET /health`, `/health/ready` | Load balancer and orchestrator probes |
| Email verify/resend, change password | Basic account security for a live product |
| `GET /me/export`, `DELETE /me/account` | Nigeria Data Protection Act (NDPA) access and erasure rights |
| Department/location update and delete; vacancy delete; policy archive; announcement edit; review-cycle create | The frontend UI needs them, but the doc only had "create" |
| Document and applicant-CV download links, document delete | Files were metadata-only in the doc; real files need signed download URLs |
| Community post list/delete | Posts were only embedded in the community |
| Messages (`/me/conversations…`) | `allowMessages` privacy setting existed with no messaging endpoints |
| Moderation queue (`/platform/reports…`), org verification | `POST /reports` existed with nothing to review reports |
| Org audit log | Who changed roles, saw CVs or touched payroll; needed for HR data |

### Where the doc and the frontend code disagree (the backend follows the doc)

The frontend's `DataService` (`frontend/web/src/lib/services/contracts.ts`) sends some values that must come from the server:

- `recordAssessment(…, reviewer)`, `decideLeave(…, by)`, `giveRecognition({ from })`: the actor is **taken from the session**, never the body.
- `completeChallenge(id, score, total)`: the server **scores the answers** (`{ answers: number[] }`).
- `attachCv(meta)` and `addDocument(meta)` send metadata only: the API takes a **real multipart file upload**.
- `sendInvitation(eventId, toName)` and `report({ targetName })`: the API takes **IDs** (`profileId`, `targetId`).
- The frontend HTTP adapter (`frontend/web/src/lib/services/http.ts`) posts to `/{group}/{operation}` with base URL `/api`. When the frontend team integrates, it must call the REST paths under `/api/v1`. (Not changed here; integration is out of backend scope.)
- Lists that can grow without bound (jobs, applications, employees, members, leave, attendance, feedback, events, people and so on) return a **page** `{ items, page, pageSize, total }`, as the doc's general rule says. Short reference lists stay plain arrays. Each operation's response schema shows which shape it uses.

## Run it locally

```bash
docker compose -f backend/docker-compose.yml up -d      # Postgres :5440, Mailpit :1025 / UI :8025, S3 (SeaweedFS) :8333
cp backend/api/.env.example backend/api/.env
pnpm --filter @grooveli/api db:migrate                  # apply migrations
pnpm --filter @grooveli/api db:content                  # load career content (missions, challenges, courses…)
pnpm dev:api                                            # http://localhost:4000/api/v1, docs at /api/docs
```

Every email the API sends in development shows up in Mailpit at http://localhost:8025.

Tests (real Postgres database `grooveli_test`, real S3; create it once with `docker exec backend-postgres-1 psql -U grooveli -c "CREATE DATABASE grooveli_test"`):

```bash
pnpm --filter @grooveli/api test:e2e
```

## Implementation status

**Built and tested against a real Postgres (step 1):**

| Area | What's in place |
|---|---|
| Database | Prisma schema and migrations (`backend/api/prisma`): users, sessions, auth tokens, organisations, memberships, invitations, plan modules, audit log |
| Auth endpoints | `POST /auth/signup`, `/auth/login`, `/auth/logout`, `GET /auth/session`, `PUT /auth/session/active-organization`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/password/change`, `/auth/email/verify`, `/auth/email/resend`, `POST /invitations/{token}/accept`, `DELETE /me/account` |
| Sessions | HttpOnly `grooveli_session` cookie (SameSite=Lax, Secure in production); only a SHA-256 of the token is stored; 14-day sliding expiry; revoked on logout, password reset/change and account deletion |
| Passwords | Argon2id (OWASP parameters), 10–128 characters, Have I Been Pwned check (on in production), lockout after 10 failures for 15 minutes, same response time whether or not the email exists |
| Tokens | Email verification (24 h) and password reset (30 min): single use, stored hashed, only the newest one valid |
| Guards (global) | `SessionGuard` (signed in unless `@Public()`/`@OptionalAuth()`; `@PlatformAdmin()`), `OrgAccessGuard` (`@OrgAccess({ perm, orgAdmin, module, orSelf })`: active membership, role permission, plan module → `MODULE_NOT_IN_PLAN`), and a rate limiter (120/min default, stricter per route) |
| Security | CSRF origin check on state-changing requests, CORS allowlist with credentials, helmet headers, 1 MB JSON limit, strict request validation (unknown fields rejected), audit log for sign-up, lockout, password and membership events |
| Platform | Contract error envelope, `X-Request-Id`, `/health` and `/health/ready` (checks the database), env validation at startup, graceful shutdown, `start:prod` runs `prisma migrate deploy` first |

Tested end to end: sign-up, validation errors, duplicate email, cookie flags, session, bad origin, email verification and token reuse, logout, wrong password, login (case-insensitive email), forgot/reset (old sessions revoked), change password, invitation with bad token, account deletion, rate limiting (429 + `Retry-After`).

**Step 2: built and tested (13 end-to-end tests):**

| Area | Endpoints | Notes |
|---|---|---|
| Candidate profile | `GET/PATCH /me/profile`, `POST /me/onboarding`, `POST/GET/DELETE /me/cv`, `GET/PATCH /me/privacy` | Strict validation; photo must be an image data URL; CV stored privately in S3, type checked from file contents (PDF/DOCX), 5 MB cap, 5-minute signed download links |
| Jobs | `GET /jobs`, `GET /jobs/{id}`, `GET /me/job-matches`, `GET /me/job-matches/{id}`, saved jobs (3) | Only open published jobs are listed; drafts are 404; filters, search, sort, pagination |
| Applications | `POST /jobs/{id}/applications`, `GET /me/applications`, `POST /me/applications/{id}/withdraw`, `GET /me/interviews` | No duplicates (unique index), no closed jobs, withdrawn is final, concurrent changes are detected |
| Career progress | `GET /me/progress`, challenges + attempts, assessment, interview simulations, courses + modules, missions + claim, achievements, notifications + read | The server scores challenges (answers never sent beforehand), decides every XP award, and enforces once-only awards with a unique index |

Matching uses skills, experience, salary, work mode, employment type, qualifications and location only. A test proves that changing gender, personality or photo does not change the score.

Career content (missions, challenges, courses, achievements, assessment questions) lives in `prisma/content/career.json`, loaded with `db:content`. It starts from the product team's existing content; the content team can edit the file.

Decisions taken where the doc was silent:
- `PUT/DELETE /me/courses/{id}/modules/{i}` returns `completed` = whether the **whole course** is complete (as the frontend expects).
- Interview-simulation XP is awarded once per role, so repeating one can't farm XP.
- Skill-challenge XP needs at least 50% correct and is awarded once per challenge. Suitable-application XP needs a match score of at least 55 and is capped at 3 a day.

**Step 3: built and tested (18 end-to-end tests):**

| Area | Endpoints | Notes |
|---|---|---|
| Organisations | `GET /orgs`, `GET /orgs/{id}` (public), `POST /orgs` (onboarding), `PATCH /orgs/{id}/profile`, `GET/PATCH /orgs/{id}/workspace` | Onboarding creates the org, the creator as org-admin, locations, departments, policies and emailed invitations in one transaction |
| Members | members list, invitations (create/revoke), roles, suspend/reactivate, `POST /invitations/{token}/accept` | Invitations are emailed, single use, 7-day expiry, only for the invited address. Always one active org-admin (row lock stops two admins demoting each other at once). Suspension cuts access immediately |
| Structure | departments and locations: create, update, delete | Unique department names; can't delete a location still in use or a department with people |
| Plans | `GET/PUT /orgs/{id}/subscription`, `PUT /platform/tiers/{tier}/modules` | Modules come from the plan; platform admins can change what each plan includes; missing module → 403 `MODULE_NOT_IN_PLAN` |
| Platform | `PUT /platform/orgs/{id}/verification` | Platform admins only |
| Audit | `GET /orgs/{id}/audit-log` | Org-admins only. Records sign-up, membership, role, plan, vacancy and pipeline changes, and every CV view |
| Recruitment | vacancies (list/create/replace/status/delete), applications (list, status, applicant CV), interviews (list/schedule/update), talent search + invite, shortlists, assessments + results, analytics | Pipeline moves are checked (e.g. no skipping straight to hired); withdrawn/hired/rejected are final; candidates are notified; vacancies can't go back to draft once they have applications; talent search shows only candidates visible to employers and never returns email, gender, personality or photo; assessment reviewer comes from the session |

**Step 4: built and tested (19 end-to-end tests):**

| Area | Endpoints | Notes |
|---|---|---|
| Employees | list, get, create, update, offboarding start/complete, lifecycle tasks, documents (upload, list, signed link, delete), `GET /orgs/{id}/structure`, `GET /orgs/{id}/dashboard` | HR records link automatically to the member account with the same email (also when an invitation is accepted). Non-HR callers never get emergency contacts, documents or tasks of others. Management loops are rejected. Finishing onboarding tasks activates the employee; finishing offboarding removes their access and moves their reports to their manager |
| Leave | list, request, decide | Working days counted server-side; balance checked against the allowance of the year the leave falls in; overlaps refused; only HR or the direct manager decides, never the requester; requester can cancel |
| Attendance | list, clock-in, clock-out **[added]** | Once a day, only for yourself; late after 09:15 WAT; employees see only themselves, managers their reports, HR everyone |
| Reviews | list, start cycle **[added]**, update | Reviewer defaults to the line manager; employees see their review only once shared; shared reviews are final |
| Policies | list, create, update, archive, acknowledge | Acknowledgements are per version — changing a policy asks everyone to acknowledge again |
| Self-service | `GET /me/employee?orgId=` | Record, leave balance, leave, policies to acknowledge, approved payslips |
| Engagement | announcements (incl. edit), recognition + reactions, surveys + responses, feedback, activities + RSVPs, culture initiatives | Department announcements reach only that department. Anonymous surveys store no user and no time, use a random ID, and hide results under 5 responses; "already answered" is a one-way HMAC marker. Anonymous feedback stores no author |
| Payroll (preview) | compensation, components, structures (incl. upsert **[added]**), previews (create/approve/delete), payslips, reports | Simulation only: `simulated: true`, no payments or filings. Every payslip warns that PAYE/pension/NHF aren't calculated yet. One approved preview per period; approved previews can't be deleted; employees see only their own payslip, and only once approved |
| Workforce analytics | `GET /orgs/{id}/analytics/workforce` | Headcount, departments, locations, employment types, hires/exits, turnover, leave, attendance, ratings, payroll totals — groups under 5 people are merged or hidden |

**Step 5: built and tested (13 end-to-end tests):**

| Area | Endpoints | Notes |
|---|---|---|
| Events | `GET /social/events`, `GET /social/events/{id}`, RSVP, organisation-hosted events **[added]**, platform events **[added]** | Public list; capacity enforced with a row lock (no overbooking); attendee lists respect `showInEventAttendees` and blocks; organisations can only edit their own events; cancelling notifies attendees |
| Communities | list, detail, join/leave, posts (list/create/delete), platform create/update/archive **[added]** | Only members post; posts pass automatic checks (link limit, spam pattern, `CONTENT_BLOCKLIST`) before they're visible; authors or moderators delete; blocked people's posts are hidden from you |
| People & connections | `GET /social/people`, connections (list/request/remove) | Only discoverable, active people; you never see yourself or anyone in a block with you; asking someone who already asked you connects you |
| Invitations | invite to event, list, respond | Follows the invitee's `allowInvitations` (everyone / connections / nobody); blocked, "nobody" and "connections only" all look the same to the sender; accepting RSVPs you |
| Blocks & reports | block/unblock, `POST /reports` | Blocking removes the connection, cancels pending invitations, stops messages and hides both people from each other. Repeat reports aren't duplicated; only participants can report a message |
| Messages **[added]** | conversations (list/start), messages (list/send), mark read | Follows `allowMessages` (default: connections). One conversation per pair; `Idempotency-Key` makes retries safe; unread counts; same content checks as posts |
| Moderation **[added]** | `GET /platform/reports`, resolve, `PUT /platform/users/{id}/suspension` | Actions: dismiss, remove content (posts, messages, jobs, events), warn, suspend. Suspension ends all sessions and refuses sign-in until lifted. The reporter only hears that the report was reviewed |
| City | `GET /city/world`, `GET /city/hq/{orgId}`, `GET /city/me` | Public and cookie-free (except `/city/me`); world cached 60 s. HQs show only published vacancies, opted-in directory entries (name/title/department) and `public-hq` announcements — never emails, internal announcements or private HR data |

Candidate profiles gained two optional social fields **[added]**: `homeDistrict` and `interests`, used by the people directory and never by matching.

**Step 6: built and tested (10 end-to-end tests):**

| Area | Endpoints | Notes |
|---|---|---|
| AI career assistant | `GET/DELETE /me/assistant/thread`, `POST /me/assistant/messages`, `POST /me/assistant/confirm-applications` | Claude (`claude-opus-5-5`) via the official `@anthropic-ai/sdk`, with strict tools: read the caller's job-relevant profile, search jobs, explain a match, propose applications. Personality, gender, photo, name and email are never sent. Proposals submit nothing; only `confirm-applications` applies, and only for jobs the assistant proposed. Server-side refusal fallback is on (`server-side-fallback-2026-07-01`, `fallbacks: "default"`); prompt caching on. No `ANTHROPIC_API_KEY` → 503 |
| Markets billboard | `GET /city/markets` | Live USD/GBP/EUR → NGN rates from ExchangeRate-API (free, attribution shown), stored daily for change and a 30-day chart; refreshed at most every 30 min; serves the last stored rates if the provider is down. `simulated: false`. Needs `MARKETS_PROVIDER=open-er-api`, else 503 |
| Real-time presence | WebSocket `/api/v1/realtime/presence` | Session cookie + allowed Origin; max 2 updates/s; follows `presenceVisibility` and blocks; snapshot on connect, leave on disconnect; heartbeat. In memory — one instance until moved to Redis |
| Games | `GET /games`, sessions, matchmaking, invitations, join, session, result, `PUT /platform/games/{id}` **[added]** | All games start "coming soon"; platform admins switch them on. Invite-friend sessions only for connections; matchmaking pairs players safely (row locks) and never with someone in a block; single-player games start at once. No betting or money |

**Not built yet / needs decisions:**
- **Game engines** (the actual chess/ludo/pool gameplay): sessions can start but nothing finishes them yet, so `/result` returns 409 until an engine exists.
- **AI assistant:** needs a real `ANTHROPIC_API_KEY` and your data-processing agreement; tests use a scripted stand-in, not live Claude.
- **Markets:** stock indices (e.g. NGX ASI) need a licensed data provider.
- **Scaling past one API instance:** move rate limits and presence to Redis.
- Leave allowances are defaults; public holidays aren't excluded yet.
- Payroll statutory rules (PAYE, pension, NHF) and real payments are an open product decision.
- `GET /me/export` (export format decision) and virus scanning of uploads (needs ClamAV or similar).
- Content checks are rule-based (`CONTENT_BLOCKLIST`); talent search matches skill names exactly.

## Needed before the endpoints can be built

### Decisions (owner: product/team)
1. **Payroll:** stay *preview only* at launch, as the doc says (`simulated: true`), or real payroll? Real payroll needs PAYE, pension and NHF rules, plus a payments provider.
2. **Billing:** which payment provider (Paystack or Flutterwave)? Also plan prices. No billing endpoints exist until this is decided.
3. **AI assistant:** which provider and data-processing agreement? The suggestion is Anthropic Claude.
4. **Markets billboard:** a licensed market-data provider, or launch with `simulated: true`.
5. **Real-time presence:** the WebSocket's sign-in handshake and message format (`/realtime/presence` is not in the REST spec).
6. **Games:** stay "coming soon" at launch?
7. **Content admin:** who creates missions, courses, challenges and the assessment, and through what tool?

### Infrastructure
| Need | Suggested |
|---|---|
| Database | PostgreSQL 16 + Prisma (migrations, typed queries) — **in use** |
| Rate limits and cache (multi-instance) | Redis (sessions already live in Postgres) |
| File storage (CVs, HR documents) | S3-compatible bucket, private, encrypted (`S3_SSE=true`), signed URLs — **in use**; virus scanning still needed |
| Email (verification, reset, invitations, notifications) | Any provider with SMTP (Postmark, SES, Resend…) — set `SMTP_*` |
| Secrets | Platform secret manager; never in `.env` files in Git |
| Logs/metrics/errors | Structured JSON logs + Sentry (or similar) |
| Hosting | Container behind HTTPS load balancer; `TRUST_PROXY` set |

### Libraries to add when implementation starts
Already added: `zod` (validation), `@nestjs/throttler`, `helmet`, `@node-rs/argon2`, `cookie-parser`, `nodemailer`. Still to add: `multer` + S3 client (uploads), a Redis store for the rate limiter before running more than one API instance.

### Suggested build order
1. ~~Database schema, auth and sessions, the organisation/role guard, and the plan-module guard.~~ **Done.**
2. ~~Candidate profile, jobs, applications, matching, XP.~~ **Done.**
3. ~~Organisations, members, recruitment.~~ **Done.**
4. ~~HR, then engagement, analytics and payroll (preview).~~ **Done.**
5. ~~Social, messages, moderation, city projections.~~ **Done.**
6. ~~AI assistant, markets, presence, games.~~ **Done.**

Each step needs: the real implementation, tests against a real Postgres (Testcontainers), and `openapi:check` passing.
