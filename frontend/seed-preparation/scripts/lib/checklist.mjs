/**
 * Builds POST_SEED_API_CHECKLIST.md from the generated seed, so expected
 * numbers always match the data. Every row names an endpoint template; the
 * validator checks each one against backend/api/openapi/openapi.json.
 */

/** @param {any} f facts computed by generate.mjs */
export function buildChecklist(f) {
  const rows = [];
  const section = (title, intro) => rows.push({ section: title, intro });
  const row = (as, method, tpl, path, expect) => rows.push({ as, method, tpl, path: path ?? tpl, expect });
  const acct = (role) => f.testAccounts.find((t) => t.role === role);
  const who = (role) => `${role} (\`${acct(role).email}\`)`;
  const c = f.counts;

  section('A. Health and public data', 'No sign-in. Date-dependent numbers assume the seed was generated with `--anchor-date` set to the day it was run, and that you check on that same day.');
  row('anyone', 'GET', '/health', null, '`200`, `data.status = "ok"`');
  row('anyone', 'GET', '/health/ready', null, '`200`, `data.checks.database = "ok"`');
  row('anyone', 'GET', '/orgs', null, `\`data.total = ${c.orgs}\` (page size 20 by default, so \`items\` holds ${Math.min(20, c.orgs)})`);
  row('anyone', 'GET', '/orgs/{orgId}', '/orgs/kestrel-systems', `\`200\`, \`profile.name = "Kestrel Systems"\`, ${c.hq.k.vacancies} vacancies`);
  row('anyone', 'GET', '/jobs', null, `\`data.total = ${c.openJobs}\` (published and not yet closed: the public filter)`);
  row('anyone', 'GET', '/jobs', '/jobs?organizationId=kestrel-systems', `\`data.total = ${c.jobsKestrel}\``);
  row('anyone', 'GET', '/jobs/{jobId}', '/jobs/job-k-backend', '`200`, `organizationId = "kestrel-systems"`, `status = "published"`');
  row('anyone', 'GET', '/city/world', null, `\`hqs\` has ${c.orgs} entries; the \`jobCounts\` values add up to ${c.openJobs}; \`events\` holds the events that haven't ended (${c.events} on the anchor day)`);
  row('anyone', 'GET', '/city/hq/{orgId}', '/city/hq/kestrel-systems', `${c.hq.k.vacancies} vacancies, ${c.hq.k.departments} departments, ${c.hq.k.directory} directory entries, ${c.hq.k.announcements} announcement(s)`);
  row('anyone', 'GET', '/city/hq/{orgId}', '/city/hq/amberline-health', `${c.hq.a.vacancies} vacancies, ${c.hq.a.departments} departments, ${c.hq.a.directory} directory entries, ${c.hq.a.announcements} announcement(s)`);
  row('anyone', 'GET', '/city/hq/{orgId}', '/city/hq/saffron-salt', `\`200\`, ${c.hq.s.vacancies} vacancies, 0 departments, 0 directory entries (no private workspace in the mock)`);
  row('anyone', 'GET', '/social/events', null, `\`data.total = ${c.events}\` on the anchor day; the total falls as events end (the last ends ${c.lastEventEndsDays} days after the anchor)`);
  row('anyone', 'GET', '/social/communities', null, `\`data.total = ${c.communities}\``);
  row('anyone', 'GET', '/social/communities/{communityId}/posts', '/social/communities/com-builders/posts', `\`data.total = ${c.postsBuilders}\``);
  row('anyone', 'GET', '/games', null, 'All 5 games `coming-soon` (nothing seeded; backend default)');

  section('B. Sign-in, session and memberships', 'Sign in with `POST /auth/login` `{ "email", "password" }` using the development password set by `provision-accounts.mjs`, keep the cookie, then call `GET /auth/session`.');
  for (const t of f.testAccounts) {
    const m = t.memberships.length
      ? t.memberships.map((x) => `\`${x.organizationId}\` [${x.roles.join(', ')}]${x.employeeId ? ` employee \`${x.employeeId}\`` : ''}`).join('; ')
      : 'no memberships';
    row(who(t.role), 'GET', '/auth/session', null, `\`user.email = "${t.email}"\`, ${m}${t.memberships[0] ? `, \`activeOrganizationId = "${t.memberships[0].organizationId}"\`` : ''}`);
  }
  row(who('Organisation admin'), 'PUT', '/auth/session/active-organization', null, 'Body `{ "organizationId": "amberline-health" }` → `200`, `activeOrganizationId = "amberline-health"`');
  row(who('HR manager'), 'PUT', '/auth/session/active-organization', null, 'Body `{ "organizationId": "amberline-health" }` → refused (not a member)');
  row('a non-test seeded account, e.g. `talent-01@talent.example`', 'POST', '/auth/login', null, '`401`: the account is locked (placeholder hash) because only test accounts are provisioned');
  row(who('Candidate'), 'POST', '/auth/login', null, 'Wrong password → `401 UNAUTHENTICATED`');

  section('C. Candidate', `Signed in as ${who('Candidate')}.`);
  row('Candidate', 'GET', '/me/profile', null, '`displayName = "Tolu Adebayo"`, 5 skills, `visibility = "employers"`');
  row('Candidate', 'GET', '/me/privacy', null, '`presenceVisibility = "connections"`, `allowInvitations = "connections"`');
  row('Candidate', 'GET', '/me/saved-jobs', null, `[\`job-m-hrops\`] (${c.tolu.saved})`);
  row('Candidate', 'GET', '/me/applications', null, `\`data.total = ${c.tolu.applications}\``);
  row('Candidate', 'GET', '/me/notifications', null, `\`data.total = ${c.tolu.notifications}\` (welcome)`);
  row('Candidate', 'GET', '/me/connections', null, `${c.tolu.connections} connection (\`soc-3\`, connected)`);
  row('Candidate', 'GET', '/me/invitations', null, `${c.tolu.invitations} received, pending (from Grace Ayodele)`);
  row('Candidate', 'GET', '/social/people', null, `\`data.total = ${c.people}\` (discoverable people, excluding yourself)`);
  row('Candidate', 'GET', '/me/job-matches', null, '`200`, ranked list of open vacancies with explainable scores');

  section('D. Organisation workspace', `Signed in as ${who('Organisation admin')} unless stated.`);
  row('Organisation admin', 'GET', '/orgs/{orgId}/workspace', '/orgs/kestrel-systems/workspace', `tier \`enterprise\`, ${c.locations.k} locations, ${c.hq.k.departments} departments, ${c.policies.k} policies, ${c.invitations.k} pending invitation`);
  row('Organisation admin', 'GET', '/orgs/{orgId}/members', '/orgs/kestrel-systems/members', `\`data.total = ${c.members.k}\` (${c.memberBreakdown.k})`);
  row('Organisation admin', 'GET', '/orgs/{orgId}/members', '/orgs/amberline-health/members', `\`data.total = ${c.members.a}\``);
  row('Organisation admin', 'GET', '/orgs/{orgId}/subscription', '/orgs/amberline-health/subscription', '`tier = "starter"`, modules recruitment + hr');
  row('Organisation admin', 'GET', '/orgs/{orgId}/structure', '/orgs/kestrel-systems/structure', `${c.hq.k.departments} departments with heads, ${c.locations.k} locations`);

  section('E. Employees and HR', 'The HR directory returns limited fields to people without `hr.records.manage`.');
  row(who('HR manager'), 'GET', '/orgs/{orgId}/hr/employees', '/orgs/kestrel-systems/hr/employees', `\`data.total = ${c.employees.k}\`, full records`);
  row(who('HR manager'), 'GET', '/orgs/{orgId}/hr/leave', '/orgs/kestrel-systems/hr/leave', `\`data.total = ${c.leave.k}\``);
  row(who('HR manager'), 'GET', '/orgs/{orgId}/hr/reviews', '/orgs/kestrel-systems/hr/reviews', `${c.reviews.k} reviews`);
  row(who('HR manager'), 'GET', '/orgs/{orgId}/hr/policies', '/orgs/kestrel-systems/hr/policies', `${c.policies.k} policies, each with 0 acknowledgements (none are seeded)`);
  row(who('HR manager'), 'GET', '/orgs/{orgId}/hr/attendance', '/orgs/kestrel-systems/hr/attendance', `\`data.total = ${c.attendance.k}\` with no date filter`);
  row(who('Employee + line manager'), 'GET', '/me/employee', '/me/employee?orgId=kestrel-systems', '`record.id = "emp-kestrel-01"`, `record.name = "Kofi Asante"`, Engineering Manager');
  row('Employee + line manager', 'GET', '/orgs/{orgId}/hr/employees', '/orgs/kestrel-systems/hr/employees', `\`data.total = ${c.employees.k}\`, limited fields except your own record`);
  row('Employee + line manager', 'GET', '/orgs/{orgId}/hr/leave', '/orgs/kestrel-systems/hr/leave', `\`data.total = ${c.kofiLeave}\`: your own requests plus your direct reports' only`);

  section('F. Recruitment', `Signed in as ${who('Recruiter')}.`);
  row('Recruiter', 'GET', '/orgs/{orgId}/recruitment/vacancies', '/orgs/kestrel-systems/recruitment/vacancies', `\`data.total = ${c.jobsKestrel}\` (any status)`);
  row('Recruiter', 'GET', '/orgs/{orgId}/recruitment/applications', '/orgs/kestrel-systems/recruitment/applications', `\`data.total = ${c.apps.k}\``);
  row('Recruiter', 'GET', '/orgs/{orgId}/recruitment/interviews', '/orgs/kestrel-systems/recruitment/interviews', `${c.interviews.k} interviews`);
  row('Recruiter', 'GET', '/orgs/{orgId}/recruitment/shortlists', '/orgs/kestrel-systems/recruitment/shortlists', `${c.shortlists.k} shortlist with ${c.shortlistSize} applications`);
  row('Recruiter', 'GET', '/orgs/{orgId}/recruitment/assessments', '/orgs/kestrel-systems/recruitment/assessments', `${c.assessments.k} assessments`);
  row('Recruiter', 'GET', '/orgs/{orgId}/recruitment/talent', '/orgs/kestrel-systems/recruitment/talent', `\`data.total = ${c.talent}\` (onboarded candidates visible to employers)`);

  section('G. Payroll preview and engagement', 'Payroll stays a simulated preview. No previews are seeded.');
  row(who('Payroll officer'), 'GET', '/orgs/{orgId}/payroll/compensation', '/orgs/kestrel-systems/payroll/compensation', `\`data.total = ${c.comp.k}\``);
  row('Payroll officer', 'GET', '/orgs/{orgId}/payroll/components', '/orgs/kestrel-systems/payroll/components', `${c.components.k} components (ids end in \`-k\`)`);
  row('Payroll officer', 'GET', '/orgs/{orgId}/payroll/structures', '/orgs/kestrel-systems/payroll/structures', `${c.structures.k} structures`);
  row('Payroll officer', 'GET', '/orgs/{orgId}/payroll/previews', '/orgs/kestrel-systems/payroll/previews', '0 previews');
  row(who('HR manager'), 'GET', '/orgs/{orgId}/engagement/announcements', '/orgs/kestrel-systems/engagement/announcements', `\`data.total = ${c.ann.k}\``);
  row('HR manager', 'GET', '/orgs/{orgId}/engagement/recognition', '/orgs/kestrel-systems/engagement/recognition', `\`data.total = ${c.recognition.k}\`, each with 0 reactions (none are seeded)`);
  row('HR manager', 'GET', '/orgs/{orgId}/engagement/surveys', '/orgs/kestrel-systems/engagement/surveys', `${c.surveys.k} surveys with aggregated results (${c.surveyResponses} responses, above the anonymity threshold of 5)`);
  row('HR manager', 'GET', '/orgs/{orgId}/engagement/feedback', '/orgs/kestrel-systems/engagement/feedback', `\`data.total = ${c.feedback.k}\``);
  row('HR manager', 'GET', '/orgs/{orgId}/engagement/activities', '/orgs/kestrel-systems/engagement/activities', `${c.activities.k} activities, ${c.rsvps.k} RSVPs in total`);
  row('HR manager', 'GET', '/orgs/{orgId}/engagement/initiatives', '/orgs/kestrel-systems/engagement/initiatives', `${c.initiatives.k} initiatives`);
  row(who('Organisation admin'), 'GET', '/orgs/{orgId}/analytics/workforce', '/orgs/kestrel-systems/analytics/workforce', '`200` (enterprise plan includes analytics)');

  section('H. Career content', `Needs \`pnpm --filter @grooveli/api db:content\`. Signed in as ${who('Candidate')}.`);
  row('Candidate', 'GET', '/career/missions', null, `${c.career.missions} missions`);
  row('Candidate', 'GET', '/career/challenges', null, `${c.career.challenges} challenges, with no \`answer\` fields`);
  row('Candidate', 'GET', '/career/courses', null, `${c.career.courses} courses`);
  row('Candidate', 'GET', '/career/assessment', null, `${c.career.assessment} questions`);
  row('Candidate', 'GET', '/me/achievements', null, `${c.career.achievements} achievements, none unlocked`);
  row('Candidate', 'GET', '/me/progress', null, '`progress.xp = 0`, `events` empty (XP is never seeded)');

  section('I. Role-based restrictions (must be refused)', 'Each must fail with the status shown. If any returns `200`, stop and investigate before using the data.');
  row('not signed in', 'GET', '/me/profile', null, '`401 UNAUTHENTICATED`');
  row('Candidate', 'GET', '/orgs/{orgId}/workspace', '/orgs/kestrel-systems/workspace', '`404 NOT_FOUND` (not a member)');
  row(who('HR manager + recruiter'), 'GET', '/orgs/{orgId}/hr/employees', '/orgs/kestrel-systems/hr/employees', '`404 NOT_FOUND` (Amberline member only)');
  row('Employee + line manager', 'GET', '/orgs/{orgId}/members', '/orgs/kestrel-systems/members', '`403 FORBIDDEN` (needs `org.members.manage`)');
  row('Employee + line manager', 'GET', '/orgs/{orgId}/payroll/compensation', '/orgs/kestrel-systems/payroll/compensation', '`403 FORBIDDEN`');
  row('Employee + line manager', 'GET', '/orgs/{orgId}/hr/employees/{employeeId}', '/orgs/kestrel-systems/hr/employees/emp-kestrel-02', '`403 FORBIDDEN` (not HR, not self)');
  row('Employee + line manager', 'GET', '/orgs/{orgId}/analytics/workforce', '/orgs/kestrel-systems/analytics/workforce', '`403 FORBIDDEN`');
  row('Recruiter', 'GET', '/orgs/{orgId}/payroll/compensation', '/orgs/kestrel-systems/payroll/compensation', '`403 FORBIDDEN`');
  row('Recruiter', 'GET', '/orgs/{orgId}/hr/employees/{employeeId}', '/orgs/kestrel-systems/hr/employees/emp-kestrel-02', '`403 FORBIDDEN`');
  row('Payroll officer', 'GET', '/orgs/{orgId}/recruitment/vacancies', '/orgs/kestrel-systems/recruitment/vacancies', '`403 FORBIDDEN`');
  row('HR manager', 'GET', '/orgs/{orgId}/members', '/orgs/kestrel-systems/members', '`403 FORBIDDEN` (org-admin only)');
  row('Organisation admin', 'GET', '/orgs/{orgId}/payroll/compensation', '/orgs/amberline-health/payroll/compensation', '`403 MODULE_NOT_IN_PLAN` (starter): the rows are in the database but the plan hides them');
  row('Organisation admin', 'GET', '/orgs/{orgId}/engagement/announcements', '/orgs/amberline-health/engagement/announcements', '`403 MODULE_NOT_IN_PLAN` (starter)');
  row('Organisation admin', 'GET', '/platform/reports', null, '`403 FORBIDDEN` (not a platform admin)');
  row(who('Platform administrator'), 'GET', '/platform/reports', null, '`200`, `data.total = 0`');

  // ── Render ────────────────────────────────────────────────────────────────
  const out = [];
  const p = (s = '') => out.push(s);
  p('# Post-seed API verification checklist');
  p();
  p('> Generated by `frontend/seed-preparation/scripts/generate.mjs` from the seeded data. Every endpoint below is checked against `backend/api/openapi/openapi.json` by `validate.mjs`. Do not edit by hand.');
  p();
  p('Run these against the **development or staging API** you seeded, after `provision-accounts.mjs` has set the test-account password. Paths are relative to `/api/v1`.');
  p();
  p('```bash');
  p('API=http://localhost:4000/api/v1; JAR=$(mktemp)');
  p('curl -s -c "$JAR" -H "content-type: application/json" -d \'{"email":"zainab@kestrel.example","password":"<dev password>"}\' "$API/auth/login"');
  p('curl -s -b "$JAR" "$API/orgs/kestrel-systems/recruitment/vacancies" | jq .data.total');
  p('```');
  p();
  p('**Database counts and API counts are different things.** The API filters and paginates, so many numbers below are smaller than the row counts in `post-seed-verify.sql`:');
  p();
  p('| Reason an API number differs from the database | Example |');
  p('|---|---|');
  p(`| Public endpoints show only published, still-open vacancies and events that haven't ended | \`/jobs\` and \`/social/events\` depend on the date you check |`);
  p('| Paginated lists return 20 items by default | Compare `data.total`, not the length of `data.items` |');
  p('| Permissions narrow results | A line manager sees only their own and their direct reports\' leave |');
  p('| The organisation\'s plan hides whole modules | Amberline (starter) has engagement and payroll rows in the database, but the API returns `403 MODULE_NOT_IN_PLAN` |');
  p('| Viewer-specific filters | `/social/people` excludes the viewer and blocked people |');
  p('| Totals computed from rows | Event attendees, community members, policy acknowledgements and reactions start at 0 |');
  p();
  p(`Anchor date of this package: **${f.anchorDate}**. If you seed on a different day, regenerate first (see BACKEND_HANDOFF.md), or the date-dependent numbers will be lower.`);
  for (const r of rows) {
    if (r.section) {
      p();
      p(`## ${r.section}`);
      p();
      if (r.intro) {
        p(r.intro);
        p();
      }
      p('| ✓ | As | Request | Expected |');
      p('|---|---|---|---|');
      continue;
    }
    p(`| ☐ | ${r.as} | \`${r.method} ${r.path}\` | ${r.expect} |`);
  }
  p();
  return { markdown: out.join('\n'), endpoints: rows.filter((r) => !r.section).map((r) => ({ method: r.method, path: r.tpl })) };
}
