#!/usr/bin/env node
/**
 * Grooveli seed generator.
 *
 * Reads the frontend mock data (read-only) and the backend database schema
 * (Prisma migrations, read-only), and writes the seed package:
 *   seed-data.json               rows keyed by table, using real database column names
 *   seed.sql                     transactional, insert-only, idempotent PostgreSQL seed with safety guards
 *   post-seed-verify.sql         read-only checks to run after seeding
 *   ID_MAPPING.json              accounts, identity decision, merges, derived and remapped IDs
 *   POST_SEED_API_CHECKLIST.md   API smoke tests with the numbers this data should produce
 *
 * Deterministic: the same mock data and the same --anchor-date always produce
 * byte-identical output. No clock, no randomness. (Invitation token hashes are
 * the one exception: PostgreSQL generates them when the seed runs, so no
 * usable invitation token is ever written to the repository.)
 *
 * Usage (from the repository root, Node 22.18+ / 23.6+ / 24+):
 *   node frontend/seed-preparation/scripts/generate.mjs
 *   node frontend/seed-preparation/scripts/generate.mjs --anchor-date=2026-12-01
 *
 * --anchor-date moves every date and timestamp by the same number of days so
 * that the mock "today" (DEMO_TODAY) lands on the given day. Use the day the
 * seed will run, otherwise vacancies and events may already be in the past
 * (the API hides closed vacancies and ended events). Default: no shift.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildChecklist } from './lib/checklist.mjs';
import { integrityChecks } from './lib/integrity.mjs';
import { DOMAIN_SRC, loadMockSources, MIGRATIONS_DIR, OUTPUT, REPO_ROOT, requireTypeStripping, WEB_STATE } from './lib/paths.mjs';
import { insertionOrder, loadSchema } from './lib/schema.mjs';
import { quote, renderInserts } from './lib/sql.mjs';

requireTypeStripping();

// ── Options ─────────────────────────────────────────────────────────────────
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const anchorDate = args['anchor-date'] ?? null;
if (anchorDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
  console.error('--anchor-date must be YYYY-MM-DD');
  process.exit(1);
}

// ── Sources ─────────────────────────────────────────────────────────────────
const schema = loadSchema(MIGRATIONS_DIR);
if (schema.unhandled.length) {
  console.error('Migration statements the schema reader does not understand (refusing to guess):\n' + schema.unhandled.join('\n'));
  process.exit(1);
}
const { domain: D, state: S } = await loadMockSources();

/** Account passwords are never generated here. Argon2 rejects this value, so accounts stay locked until provisioned. */
const PASSWORD_PLACEHOLDER = '!seed:password-not-set';

const DAY_MS = 86_400_000;
const shiftDays = anchorDate === null ? 0 : Math.round((Date.parse(`${anchorDate}T00:00:00Z`) - Date.parse(`${D.DEMO_TODAY}T00:00:00Z`)) / DAY_MS);
const shiftMs = shiftDays * DAY_MS;
const date = (s) => (s == null ? null : new Date(Date.parse(`${s}T00:00:00Z`) + shiftMs).toISOString().slice(0, 10));
const ts = (s) => (s == null ? null : new Date(Date.parse(s) + shiftMs).toISOString());
const dateAsTs = (s) => (s == null ? null : ts(`${s}T00:00:00.000Z`));
const addDaysTs = (iso, days) => new Date(Date.parse(iso) + days * DAY_MS).toISOString();
const SEED_TS = ts(D.DEMO_NOW);
const ANCHOR = date(D.DEMO_TODAY);

// ── Collectors ──────────────────────────────────────────────────────────────
const tables = {};
const add = (table, row) => (tables[table] ??= []).push(row);
const sourceCounts = {};
const count = (label, n) => (sourceCounts[label] = n);
const rejected = [];
const warnings = [];
const unsupported = [];
const transformations = [];
const accounts = [];

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');
const DEFAULT_PREFERENCES = { desiredRoles: [], locations: [], minSalary: 0, workModes: [], employmentTypes: [] };
const DISTRICTS = new Set(D.DISTRICT_IDS);
const byId = (a, b) => a.id.localeCompare(b.id);

// ── Organisations ───────────────────────────────────────────────────────────
count('organizations', S.organizations.length);
count('workspaces', S.workspaces.length);
const workspaceByOrg = new Map(S.workspaces.map((w) => [w.organizationId, w]));
const orgCode = (orgId) => {
  const dep = workspaceByOrg.get(orgId)?.departments[0]?.id ?? D.ORG_STRUCTURE[orgId]?.departments[0]?.id;
  const m = dep?.match(/^dep-([a-z0-9]+)-/);
  return m ? m[1] : slug(orgId);
};

for (const o of S.organizations) {
  const ws = workspaceByOrg.get(o.id);
  if (!DISTRICTS.has(o.district)) warnings.push(`Organization ${o.id}: unknown district "${o.district}"`);
  add('Organization', {
    id: o.id, name: o.name, tagline: o.tagline, logoColor: o.logoColor, logoGlyph: o.logoGlyph, industry: o.industry, district: o.district,
    description: o.description, website: o.website, size: o.size, structure: o.structure, workArrangements: o.workArrangements, values: o.values,
    culture: o.culture, benefits: o.benefits, headquarters: o.headquarters, verified: o.verified, tier: ws?.tier ?? 'starter',
    workflows: ws?.workflows ?? [], setupChecklist: ws?.setupChecklist ?? {}, leaveAllowances: D.LEAVE_ALLOWANCE,
    createdAt: SEED_TS, updatedAt: SEED_TS, deletedAt: null,
  });
}
transformations.push('Organization.tier/workflows/setupChecklist come from the private workspace mock where one exists (2 of 9); the other organisations use the backend defaults (starter, no workflows, empty checklist).');
transformations.push(`Organization.leaveAllowances uses the frontend's LEAVE_ALLOWANCE (${JSON.stringify(D.LEAVE_ALLOWANCE)}), which differs from the database default.`);

// ── Accounts ────────────────────────────────────────────────────────────────
const users = new Map();
const usersByName = new Map();
const userByEmail = new Map();

function addUser({ id, email, displayName, accountType, platformRole = 'none', sources, reason, testAccountFor = null }) {
  const normalisedEmail = email.trim().toLowerCase();
  if (users.has(id)) throw new Error(`Duplicate user id ${id}`);
  if (userByEmail.has(normalisedEmail)) throw new Error(`Duplicate email ${normalisedEmail} (${id} and ${userByEmail.get(normalisedEmail)})`);
  if (!/@[a-z0-9.-]+\.example$/.test(normalisedEmail)) throw new Error(`Seed emails must use the reserved .example domain: ${normalisedEmail}`);
  users.set(id, {
    id, email: normalisedEmail, passwordHash: PASSWORD_PLACEHOLDER, displayName, accountType, platformRole, emailVerifiedAt: SEED_TS,
    onboardingComplete: true, activeOrganizationId: null, failedLoginCount: 0, lockedUntil: null, suspendedAt: null,
    createdAt: SEED_TS, updatedAt: SEED_TS, deletedAt: null,
  });
  userByEmail.set(normalisedEmail, id);
  usersByName.set(displayName, [...(usersByName.get(displayName) ?? []), id]);
  accounts.push({ userId: id, email: normalisedEmail, displayName, accountType, platformRole, reason, sources, testAccountFor });
}

const memberships = [];
function userIdForName(name, context, { orgId } = {}) {
  let ids = usersByName.get(name) ?? [];
  if (orgId && ids.length > 1) ids = ids.filter((id) => memberships.some((m) => m.userId === id && m.organizationId === orgId));
  if (ids.length === 1) return ids[0];
  if (ids.length > 1) warnings.push(`${context}: name "${name}" matches several accounts; left unlinked`);
  return null;
}

addUser({
  id: 'seed-platform-admin', email: 'platform-admin@grooveli.example', displayName: 'Grooveli City Team', accountType: 'organization', platformRole: 'admin',
  sources: ['derived'], reason: 'Required as CityEvent.createdById for events no organisation admin hosts; also the platform-admin test account.', testAccountFor: 'Platform administrator',
});

count('candidateProfiles (demo candidate)', 1);
const candidate = S.candidate;
addUser({
  id: candidate.id, email: 'tolu.adebayo@candidate.example', displayName: candidate.displayName, accountType: 'candidate',
  sources: ['DEMO_CANDIDATE (frontend/domain/src/fixtures/career.ts)', 'persona: candidate'], reason: 'Candidate persona (signs in).', testAccountFor: 'Candidate',
});

const socialByName = new Map(D.SOCIAL_PROFILES.map((p) => [p.name, p]));
const socialIds = new Set(D.SOCIAL_PROFILES.map((p) => p.id));
count('socialProfiles', D.SOCIAL_PROFILES.length);
count('talentPool', D.TALENT_POOL.length);
count('personas', D.PERSONAS.length);

// Workspace members: one account per person, across organisations.
const memberAccounts = new Map(); // email -> userId
for (const ws of S.workspaces) {
  for (const m of ws.members) {
    const email = m.email.toLowerCase();
    if (memberAccounts.has(email)) {
      accounts.find((a) => a.userId === memberAccounts.get(email)).sources.push(`workspace member ${m.id} (${ws.organizationId})`);
      continue;
    }
    const social = socialByName.get(m.name);
    const persona = D.PERSONAS.find((p) => p.displayName === m.name);
    addUser({
      id: social ? social.id : `user-${slug(m.name)}`, email, displayName: m.name, accountType: 'organization',
      sources: [`workspace member ${m.id} (${ws.organizationId})`, ...(persona ? [`persona: ${persona.id}`] : []), ...(social ? [`social profile ${social.id}`] : [])],
      reason: 'Workspace member in the mock (signs in).',
      testAccountFor: persona ? persona.label : m.roles.includes('hr-manager') && m.roles.includes('recruiter') ? 'HR manager + recruiter' : null,
    });
    memberAccounts.set(email, social ? social.id : `user-${slug(m.name)}`);
  }
}

// ── Employee persona identity ───────────────────────────────────────────────
// The mock links the employee persona (Kofi Asante) to HR record EMPLOYEE_PERSONA_ID, defined in
// employees.ts as "the head of Kestrel Engineering". That record's name comes from the random name
// generator. Merge only if the evidence says it is the same person and the generated name is not used
// for anyone else in the hand-written mock sources; otherwise report a conflict and keep them apart.
const employeePersona = D.PERSONAS.find((p) => p.id === 'employee');
const personaEmployee = S.employees.find((e) => e.id === D.EMPLOYEE_PERSONA_ID);
const kofiSocial = socialByName.get(employeePersona.displayName);
const employeePersonaUserId = kofiSocial ? kofiSocial.id : `user-${slug(employeePersona.displayName)}`;
const personaEmail = `${slug(employeePersona.displayName.split(' ')[0])}@${personaEmployee.email.split('@')[1]}`;
const generatedName = personaEmployee.name;
const handWritten = [
  ...readdirSync(join(DOMAIN_SRC, 'fixtures')).map((f) => join(DOMAIN_SRC, 'fixtures', f)),
  join(DOMAIN_SRC, 'permissions.ts'),
  WEB_STATE,
];
const generatedNameUsedIn = handWritten.filter((f) => readFileSync(f, 'utf8').includes(generatedName)).map((f) => relative(REPO_ROOT, f).replace(/\\/g, '/'));
const personaHeadOf = (workspaceByOrg.get(personaEmployee.organizationId)?.departments ?? []).filter((d) => d.headEmployeeId === personaEmployee.id).map((d) => d.name);
const evidence = [
  `EMPLOYEE_PERSONA_ID is defined as "the head of Kestrel Engineering" (frontend/domain/src/fixtures/employees.ts) and resolves to ${personaEmployee.id}.`,
  `${personaEmployee.id}: title "${personaEmployee.title}", head of ${personaHeadOf.join(', ') || 'no department'}.`,
  `Persona "${employeePersona.displayName}": "${employeePersona.description}" (frontend/domain/src/permissions.ts).`,
  ...(kofiSocial ? [`Social profile ${kofiSocial.id} "${kofiSocial.name}": headline "${kofiSocial.headline}", district ${kofiSocial.district}.`] : []),
  `"${employeePersona.displayName}" is also the Engineering interviewer and assessment reviewer in the recruitment fixtures.`,
  `"${generatedName}" is produced by the random name generator (buildStaff) and appears in no hand-written mock source${generatedNameUsedIn.length ? `, except: ${generatedNameUsedIn.join(', ')}` : ''}.`,
];
const otherRecordWithPersonaName = S.employees.some((e) => e.id !== personaEmployee.id && e.name === employeePersona.displayName);
const sameRole = !kofiSocial || kofiSocial.headline === personaEmployee.title;
const mergeIdentity = generatedName === employeePersona.displayName || (!generatedNameUsedIn.length && !otherRecordWithPersonaName && sameRole);
const identity = {
  decision: mergeIdentity ? 'merged: one person, canonical name "' + employeePersona.displayName + '"' : 'conflict: kept apart',
  evidence,
  employeeRecord: personaEmployee.id,
  account: employeePersonaUserId,
  changes: [],
  rewrittenReferences: [],
};
const employeeOverride = new Map();
if (mergeIdentity) {
  employeeOverride.set(personaEmployee.id, { name: employeePersona.displayName, email: personaEmail, avatar: kofiSocial?.avatar ?? personaEmployee.avatar });
  identity.changes.push(
    { field: 'Employee.name', from: generatedName, to: employeePersona.displayName },
    { field: 'Employee.email', from: personaEmployee.email, to: personaEmail, why: 'one email for the person: the account and the HR record match (the backend links members to employees by email)' },
    ...(kofiSocial ? [{ field: 'Employee.avatar', from: 'random avatar of the generated record', to: `avatar of social profile ${kofiSocial.id}`, why: 'one appearance for the person in the city, social and HR views' }] : []),
  );
  identity.kept = 'Employment data stays as in the record: title, department, manager, start date, status, leave, attendance, reviews, compensation, recognition received.';
} else {
  warnings.push(`Employee persona "${employeePersona.displayName}" and HR record ${personaEmployee.id} ("${generatedName}") may be different people; not merged. The persona has no employee record. Evidence: ${evidence.join(' ')}`);
}
addUser({
  id: employeePersonaUserId, email: personaEmail, displayName: employeePersona.displayName, accountType: 'organization',
  sources: ['persona: employee', ...(mergeIdentity ? [`HR employee record ${personaEmployee.id}`] : []), ...(kofiSocial ? [`social profile ${kofiSocial.id}`] : [])],
  reason: 'Employee + line-manager persona (signs in; self-service).', testAccountFor: 'Employee + line manager',
});

// ── Employee accounts: least privilege ──────────────────────────────────────
// The backend does not need an account per HR record (Employee.userId is optional). An employee
// gets an account and a membership only when a preserved record must reference them as a user:
// Recognition.fromUserId is required. Nothing else creates employee accounts.
count('employees', S.employees.length);
const employeeById = new Map(S.employees.map((e) => [e.id, e]));
const employeeUser = new Map(); // employeeId -> userId
if (mergeIdentity) employeeUser.set(personaEmployee.id, employeePersonaUserId);
const employeeName = (e) => employeeOverride.get(e.id)?.name ?? e.name;
const needAccount = new Map(); // employeeId -> reasons
for (const r of S.recognition) {
  const sender = S.employees.find((e) => e.organizationId === r.organizationId && employeeName(e) === r.from);
  if (sender && !employeeUser.has(sender.id)) needAccount.set(sender.id, [...(needAccount.get(sender.id) ?? []), `sender of recognition ${r.id} (Recognition.fromUserId is required)`]);
}
for (const [employeeId, reasons] of [...needAccount].sort(([a], [b]) => a.localeCompare(b))) {
  const e = employeeById.get(employeeId);
  const id = `user-${e.id}`;
  addUser({ id, email: e.email, displayName: e.name, accountType: 'organization', sources: [`HR employee record ${e.id}`], reason: reasons.join('; ') });
  employeeUser.set(e.id, id);
}
transformations.push(`Employee accounts follow least privilege: only ${employeeUser.size} of ${S.employees.length} HR records get an account and membership: the employee persona, plus the ${needAccount.size} recognition senders (Recognition.fromUserId is required). Every other record stays an HR record without a login; the backend supports that (Employee.userId is optional).`);

// Talent pool (applicants; Application.candidateId is a required user FK) and remaining social profiles.
for (const t of D.TALENT_POOL) {
  addUser({ id: t.id, email: `${t.id}@talent.example`, displayName: t.name, accountType: 'candidate', sources: [`TALENT_POOL ${t.id}`], reason: 'Applicant: Application.candidateId must be a user.' });
}
for (const p of D.SOCIAL_PROFILES) {
  if (users.has(p.id)) continue;
  addUser({ id: p.id, email: `${p.id}@social.example`, displayName: p.name, accountType: 'candidate', sources: [`SOCIAL_PROFILES ${p.id}`], reason: 'Person in Social → People (author of community posts, connections).' });
}

// ── Candidate profiles ──────────────────────────────────────────────────────
const profile = (userId, p) =>
  add('CandidateProfile', {
    userId, headline: p.headline ?? '', location: p.location ?? '', gender: p.gender ?? null, yearsExperience: p.yearsExperience ?? 0,
    orientation: p.orientation ?? 'open', personality: p.personality ?? null, avatar: p.avatar ?? D.DEFAULT_AVATAR, photoDataUrl: p.photoDataUrl ?? null,
    summary: p.summary ?? '', skills: p.skills ?? [], certifications: p.certifications ?? [], experience: p.experience ?? [], education: p.education ?? [],
    preferences: p.preferences ?? DEFAULT_PREFERENCES, visibility: p.visibility ?? 'private', cvKey: null, cvName: null, cvSizeKb: null, cvContentType: null,
    cvAddedAt: null, presenceVisibility: p.presenceVisibility ?? 'everyone', showInEventAttendees: p.showInEventAttendees ?? true,
    allowInvitations: p.allowInvitations ?? 'everyone', allowMessages: p.allowMessages ?? 'connections', profileDiscoverable: p.profileDiscoverable ?? true,
    homeDistrict: p.homeDistrict ?? 'plaza', interests: p.interests ?? [], createdAt: SEED_TS, updatedAt: SEED_TS,
  });

if (candidate.cvFile) unsupported.push({ entity: 'CandidateProfile.cvFile', count: 1, reason: 'CV metadata without a stored file.' });
profile(candidate.id, { ...candidate, ...S.privacy });
transformations.push('Demo candidate: CandidateProfile takes the profile fixture plus the mock privacy settings. The account is seeded as onboarded so the candidate flows can be tested straight away.');
for (const t of D.TALENT_POOL) {
  profile(t.id, {
    headline: t.headline, location: t.location, yearsExperience: t.yearsExperience, avatar: t.avatar, skills: t.skills, certifications: t.qualifications,
    preferences: { desiredRoles: [], locations: [t.location], minSalary: t.expectedSalary, workModes: t.workModes, employmentTypes: t.employmentTypes },
    visibility: 'employers', profileDiscoverable: false,
  });
}
transformations.push('TalentProfile → User + CandidateProfile: qualifications → certifications; expectedSalary/workModes/employmentTypes/location → preferences; visibility "employers" (talent search); not listed in Social → People, as in the mock.');
for (const p of D.SOCIAL_PROFILES) {
  profile(p.id, { headline: p.headline, avatar: p.avatar, homeDistrict: p.district, interests: p.interests, visibility: 'private', profileDiscoverable: true });
}
transformations.push('SocialProfile → CandidateProfile (headline, avatar, district → homeDistrict, interests), visibility "private" so social-only people stay out of employer talent search. Kofi Asante and Grace Ayodele are each one account across their social profile and organisation roles.');

// ── Structure: locations, departments, memberships, invitations, policies ──
for (const ws of S.workspaces) {
  const structure = D.ORG_STRUCTURE[ws.organizationId];
  if (structure && JSON.stringify(structure.locations) !== JSON.stringify(ws.locations)) warnings.push(`${ws.organizationId}: ORG_STRUCTURE locations differ from the workspace; the workspace copy is used`);
  for (const l of ws.locations) add('OfficeLocation', { id: l.id, organizationId: ws.organizationId, name: l.name, city: l.city, address: l.address, headcountCapacity: l.headcountCapacity, createdAt: SEED_TS, updatedAt: SEED_TS });
  for (const d of ws.departments)
    add('Department', { id: d.id, organizationId: ws.organizationId, name: d.name, headEmployeeId: d.headEmployeeId, responsibilities: d.responsibilities, locationId: d.locationId, createdAt: SEED_TS, updatedAt: SEED_TS });
  for (const m of ws.members) {
    if (m.status === 'invited') {
      rejected.push({ entity: 'OrgMember', id: m.id, reason: 'status "invited" has no Membership equivalent (pending invitations are Invitation rows)' });
      continue;
    }
    memberships.push({ id: m.id, organizationId: ws.organizationId, userId: memberAccounts.get(m.email.toLowerCase()), roles: m.roles, status: m.status, departmentId: m.departmentId, recruitingFor: m.recruitingFor, employeeId: null });
  }
}
count('workspaceMembers', S.workspaces.reduce((n, w) => n + w.members.length, 0));
memberships.push({
  id: `mem-${orgCode(personaEmployee.organizationId)}-${employeePersonaUserId}`, organizationId: personaEmployee.organizationId, userId: employeePersonaUserId,
  roles: employeePersona.roles, status: 'active', departmentId: mergeIdentity ? personaEmployee.departmentId : null, recruitingFor: [], employeeId: mergeIdentity ? personaEmployee.id : null,
});
for (const employeeId of [...employeeUser.keys()].sort()) {
  if (employeeId === personaEmployee.id) continue;
  const e = employeeById.get(employeeId);
  memberships.push({ id: `mem-${e.id}`, organizationId: e.organizationId, userId: employeeUser.get(e.id), roles: ['employee'], status: 'active', departmentId: e.departmentId, recruitingFor: [], employeeId: e.id });
}
for (const m of memberships) add('Membership', { ...m, createdAt: SEED_TS, updatedAt: SEED_TS });
transformations.push('Employee memberships carry the single role "employee" (directory, engagement participation, self-service). The employee persona keeps its mock roles employee + manager, which the backend limits to the persona\'s direct reports.');
const membershipByEmployee = new Map(memberships.filter((m) => m.employeeId).map((m) => [m.employeeId, m.id]));
for (const m of memberships) {
  const u = users.get(m.userId);
  if (u && !u.activeOrganizationId) u.activeOrganizationId = m.organizationId;
}
const adminOf = (orgId) => memberships.find((m) => m.organizationId === orgId && m.roles.includes('org-admin'))?.userId ?? null;

count('invitations (workspace)', S.workspaces.reduce((n, w) => n + w.invitations.length, 0));
for (const ws of S.workspaces) {
  for (const inv of ws.invitations) {
    const sentAt = ts(inv.sentAt);
    add('Invitation', {
      id: inv.id, organizationId: ws.organizationId, email: inv.email.toLowerCase(), roles: inv.roles,
      tokenHash: { $sql: "encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex')" },
      status: inv.status, invitedById: adminOf(ws.organizationId), sentAt, expiresAt: addDaysTs(sentAt, 7), acceptedAt: null,
    });
  }
}
transformations.push('Invitation.tokenHash is generated by PostgreSQL at execution time from random data, so nobody holds the raw token: seeded invitations can be listed and revoked, not accepted (as in the mock). expiresAt = sentAt + 7 days (the backend TTL).');

count('policies', S.workspaces.reduce((n, w) => n + w.policies.length, 0));
let ackTotal = 0;
for (const ws of S.workspaces) {
  for (const p of ws.policies) {
    const at = dateAsTs(p.updatedAt);
    ackTotal += p.acknowledgements;
    add('Policy', { id: p.id, organizationId: ws.organizationId, title: p.title, category: p.category, body: p.body, version: 1, archivedAt: null, createdAt: at, updatedAt: at });
  }
}
unsupported.push({ entity: 'Policy.acknowledgements (number)', count: ackTotal, reason: 'The mock stores a total only, not who acknowledged. An acknowledgement is an attestation by a named person, so none are invented; totals start at 0.' });

// ── Jobs and recruitment ────────────────────────────────────────────────────
count('jobs', S.jobs.length);
const jobs = new Map(S.jobs.map((j) => [j.id, j]));
for (const j of S.jobs) {
  if (!DISTRICTS.has(j.district)) warnings.push(`Job ${j.id}: unknown district ${j.district}`);
  add('Job', {
    id: j.id, organizationId: j.organizationId, title: j.title, department: j.department, district: j.district, location: j.location,
    workMode: j.workMode, employmentType: j.employmentType, level: j.level, minYears: j.minYears, salaryMin: j.salaryMin, salaryMax: j.salaryMax,
    skills: j.skills, requiredQualifications: j.requiredQualifications, description: j.description, responsibilities: j.responsibilities,
    postedOn: date(j.postedOn), closesOn: date(j.closesOn), status: j.status, createdAt: dateAsTs(j.postedOn), updatedAt: dateAsTs(j.postedOn),
  });
}
count('savedJobs', S.savedJobIds.length);
for (const jobId of S.savedJobIds) add('SavedJob', { userId: candidate.id, jobId, createdAt: SEED_TS });

// Duplicate applications (same candidate, same vacancy): the database allows one. The canonical record is
// chosen by evidence, never by merging histories: (1) the record that other records reference
// (interviews, assessment results, shortlists), (2) the furthest pipeline progression (a rejected or
// withdrawn record does not count as progression), (3) the earliest submission (the later one repeats
// it), (4) fixture order.
count('applications', S.applications.length);
const PROGRESSION = { submitted: 1, screening: 2, shortlisted: 3, interview: 4, offer: 5, hired: 6, rejected: 0, withdrawn: 0 };
const linksOf = (a) => ({
  interviews: S.interviews.filter((i) => i.applicationId === a.id).map((i) => i.id),
  assessments: S.assessments.filter((x) => x.results.some((r) => r.applicationId === a.id)).map((x) => x.id),
  shortlists: S.shortlists.filter((x) => x.applicationIds.includes(a.id)).map((x) => x.id),
});
const linkCount = (l) => l.interviews.length + l.assessments.length + l.shortlists.length;
const groups = new Map();
S.applications.forEach((a, index) => {
  const key = `${a.jobId}|${a.candidateId}`;
  groups.set(key, [...(groups.get(key) ?? []), { a, index, links: linksOf(a) }]);
});
const applicationRemap = new Map();
const keep = new Set();
const merges = [];
for (const [key, group] of groups) {
  const [jobId, candidateId] = key.split('|');
  if (!jobs.has(jobId) || !users.has(candidateId)) {
    for (const g of group) rejected.push({ entity: 'Application', id: g.a.id, reason: `references missing ${!jobs.has(jobId) ? `job ${jobId}` : `candidate ${candidateId}`}` });
    continue;
  }
  if (group.length === 1) {
    keep.add(group[0].a.id);
    continue;
  }
  const ranked = [...group].sort(
    (x, y) =>
      Math.sign(linkCount(y.links)) - Math.sign(linkCount(x.links)) ||
      PROGRESSION[y.a.status] - PROGRESSION[x.a.status] ||
      Date.parse(x.a.submittedAt) - Date.parse(y.a.submittedAt) ||
      x.index - y.index,
  );
  const [canonical, ...dropped] = ranked;
  const runnerUp = dropped[0];
  const repeated = group.every((g) => g.a.status === group[0].a.status && JSON.stringify(g.a.history.map((h) => h.status)) === JSON.stringify(group[0].a.history.map((h) => h.status)));
  let reason;
  if (Math.sign(linkCount(canonical.links)) !== Math.sign(linkCount(runnerUp.links))) {
    const l = canonical.links;
    reason = `the only record other records reference (${[...l.interviews.map((i) => `interview ${i}`), ...l.assessments.map((i) => `assessment ${i}`), ...l.shortlists.map((i) => `shortlist ${i}`)].join(', ')})`;
  } else if (PROGRESSION[canonical.a.status] !== PROGRESSION[runnerUp.a.status]) {
    reason = `furthest pipeline progression (${canonical.a.status} vs ${runnerUp.a.status}${PROGRESSION[runnerUp.a.status] === 0 ? '; a rejected/withdrawn duplicate has no history explaining an outcome after the other record\'s progress' : ''})`;
  } else if (canonical.a.submittedAt !== runnerUp.a.submittedAt) {
    reason = `same status (${canonical.a.status}); earliest submission (${canonical.a.submittedAt.slice(0, 10)} vs ${runnerUp.a.submittedAt.slice(0, 10)}), the later record repeats it`;
  } else {
    reason = `same status and submission time; nothing distinguishes them, so the first in fixture order is kept`;
  }
  keep.add(canonical.a.id);
  const remapped = [];
  for (const d of dropped) {
    applicationRemap.set(d.a.id, canonical.a.id);
    for (const i of d.links.interviews) remapped.push(`interview ${i}`);
    for (const i of d.links.assessments) remapped.push(`assessment ${i} result`);
    for (const i of d.links.shortlists) remapped.push(`shortlist ${i}`);
    if (linkCount(d.links)) warnings.push(`Application ${d.a.id} (dropped duplicate) had linked records; they are re-pointed to ${canonical.a.id}`);
    rejected.push({ entity: 'Application', id: d.a.id, reason: `duplicate of ${canonical.a.id} (job ${jobId}, candidate ${candidateId}); the database allows one application per candidate per vacancy. Canonical: ${canonical.a.id}, chosen because: ${reason}.` });
  }
  const summary = (g) => ({ id: g.a.id, status: g.a.status, submittedAt: ts(g.a.submittedAt), history: g.a.history.map((h) => h.status), fitScore: g.a.fitScore, linked: g.links });
  merges.push({
    jobId, candidateId, classification: repeated ? 'repeated fixture data' : 'conflicting application history',
    canonical: summary(canonical), dropped: dropped.map(summary), reason, remappedReferences: remapped,
    note: 'The canonical record keeps its own history; histories are never combined.',
  });
}
const applications = new Map();
for (const a of S.applications) {
  if (!keep.has(a.id)) continue;
  if (users.get(a.candidateId).displayName !== a.candidateName) warnings.push(`Application ${a.id}: candidateName differs from the candidate account name`);
  const history = a.history.map((h) => ({ ...h, at: ts(h.at) }));
  const submittedAt = ts(a.submittedAt);
  applications.set(a.id, a);
  add('Application', {
    id: a.id, jobId: a.jobId, candidateId: a.candidateId, candidateName: a.candidateName, status: a.status, coverLetter: a.coverLetter,
    fitScore: Math.round(a.fitScore), history, source: 'candidate', submittedAt, updatedAt: history.map((h) => h.at).concat(submittedAt).sort().at(-1),
  });
}
transformations.push('Application.simulated is frontend-only and dropped; Application.source = "candidate".');
const resolveApplication = (id) => applicationRemap.get(id) ?? (applications.has(id) ? id : null);

count('interviews', S.interviews.length);
for (const i of S.interviews) {
  const applicationId = resolveApplication(i.applicationId);
  if (!applicationId) {
    rejected.push({ entity: 'Interview', id: i.id, reason: `references missing application ${i.applicationId}` });
    continue;
  }
  add('Interview', {
    id: i.id, applicationId, jobId: i.jobId, candidateId: i.candidateId, candidateName: i.candidateName, scheduledAt: ts(i.scheduledAt),
    durationMin: i.durationMin, format: i.format, interviewers: i.interviewers, status: i.status, notes: i.notes, scorecard: i.scorecard,
    createdAt: SEED_TS, updatedAt: SEED_TS,
  });
}
count('shortlists', S.shortlists.length);
for (const s of S.shortlists) {
  const ids = [...new Set(s.applicationIds.map(resolveApplication).filter(Boolean))];
  add('Shortlist', { id: s.id, organizationId: jobs.get(s.jobId).organizationId, jobId: s.jobId, name: s.name, applicationIds: ids, createdAt: SEED_TS, updatedAt: SEED_TS });
}
count('assessments', S.assessments.length);
for (const a of S.assessments) {
  const orgId = jobs.get(a.jobId).organizationId;
  const results = a.results
    .map((r) => ({ applicationId: resolveApplication(r.applicationId), score: r.score, reviewer: r.reviewer, reviewerId: userIdForName(r.reviewer, `Assessment ${a.id}`, { orgId }), at: SEED_TS }))
    .filter((r) => r.applicationId);
  add('Assessment', { id: a.id, organizationId: orgId, jobId: a.jobId, title: a.title, kind: a.kind, questions: a.questions, results, createdAt: SEED_TS, updatedAt: SEED_TS });
}
transformations.push('Assessment.results gain reviewerId (matched by reviewer name) and at (seed time), which the database stores and the mock does not.');

// ── HR ──────────────────────────────────────────────────────────────────────
let documentCount = 0;
let taskCount = 0;
for (const e of S.employees) {
  const o = employeeOverride.get(e.id) ?? {};
  add('Employee', {
    id: e.id, organizationId: e.organizationId, userId: employeeUser.get(e.id) ?? null, name: o.name ?? e.name, title: e.title, departmentId: e.departmentId,
    locationId: e.locationId, managerId: e.managerId, email: (o.email ?? e.email).toLowerCase(), startDate: date(e.startDate), employmentType: e.employmentType,
    status: e.status, avatar: o.avatar ?? e.avatar, publicDirectory: e.publicDirectory, emergencyContact: e.emergencyContact, lastDay: null, exitedAt: null,
    createdAt: SEED_TS, updatedAt: SEED_TS,
  });
  e.lifecycleTasks.forEach((t, i) => {
    taskCount++;
    add('LifecycleTask', { id: t.id, employeeId: e.id, phase: t.phase, label: t.label, owner: t.owner, done: t.done, sortOrder: i });
  });
  documentCount += e.documents.length;
}
count('employeeDocuments', documentCount);
count('lifecycleTasks', taskCount);
unsupported.push({
  entity: 'EmployeeDocument', count: documentCount,
  reason: 'Metadata only in the mock; each database row needs a storageKey for a real stored file, and no files or file URLs are invented. Kept in seed-data.json under "unsupported".',
  records: S.employees.flatMap((e) => e.documents.map((d) => ({ employeeId: e.id, ...d, addedOn: date(d.addedOn) }))),
});

count('leaveRequests', S.leave.length);
for (const l of S.leave) {
  add('LeaveRequest', {
    id: l.id, organizationId: employeeById.get(l.employeeId).organizationId, employeeId: l.employeeId, type: l.type, start: date(l.start), end: date(l.end),
    days: l.days, reason: l.reason, status: l.status, decidedById: null, decidedByName: l.decidedBy ?? null, decidedAt: null, createdAt: SEED_TS,
  });
}
count('attendance', S.attendance.length);
for (const a of S.attendance) add('AttendanceEntry', { employeeId: a.employeeId, date: date(a.date), status: a.status, clockInAt: null, clockOutAt: null, hours: a.hours });

count('performanceReviews', S.reviews.length);
for (const r of S.reviews) {
  const orgId = employeeById.get(r.employeeId).organizationId;
  const rewrite = mergeIdentity && r.reviewer === generatedName;
  const reviewerName = rewrite ? employeePersona.displayName : r.reviewer;
  if (rewrite) identity.rewrittenReferences.push(`PerformanceReview ${r.id}: reviewer "${generatedName}" → "${reviewerName}"`);
  add('PerformanceReview', {
    id: r.id, organizationId: orgId, employeeId: r.employeeId, cycle: r.cycle, reviewerId: userIdForName(reviewerName, `Review ${r.id}`, { orgId }), reviewerName,
    status: r.status, rating: r.rating, goals: r.goals, strengths: r.strengths, improvements: r.improvements, createdAt: SEED_TS, updatedAt: SEED_TS,
  });
}
transformations.push('PerformanceReview.reviewerName is kept; reviewerId is set only when the reviewer has an account (most reviewers are HR records without one).');

// ── Payroll configuration (preview only; no payroll runs exist in the mock) ─
count('payComponents', S.payComponents.length);
count('compensationStructures', S.structures.length);
count('compensationRecords', S.compensation.length);
const payrollOrgs = [...new Set(S.compensation.map((c) => employeeById.get(c.employeeId).organizationId))].sort();
const payrollIds = [];
const scoped = (id, orgId) => `${id}-${orgCode(orgId)}`;
for (const orgId of payrollOrgs) {
  for (const c of S.payComponents) {
    add('PayComponent', { id: scoped(c.id, orgId), organizationId: orgId, name: c.name, kind: c.kind, calcType: c.calc.type, calcValue: c.calc.value, taxable: c.taxable });
    payrollIds.push({ table: 'PayComponent', organizationId: orgId, mockId: c.id, seedId: scoped(c.id, orgId) });
  }
  for (const s of S.structures) {
    add('CompensationStructure', { id: scoped(s.id, orgId), organizationId: orgId, grade: s.grade, minBase: s.minBase, maxBase: s.maxBase, componentIds: s.componentIds.map((x) => scoped(x, orgId)) });
    payrollIds.push({ table: 'CompensationStructure', organizationId: orgId, mockId: s.id, seedId: scoped(s.id, orgId) });
  }
}
transformations.push(`Pay components and salary structures are global in the mock but per-organisation in the database (ids are primary keys), so each is copied for every organisation with compensation data (${payrollOrgs.join(', ')}) with the organisation code appended (pc-housing → pc-housing-k). Compensation.structureId and CompensationStructure.componentIds are remapped the same way.`);
for (const c of S.compensation) {
  const orgId = employeeById.get(c.employeeId).organizationId;
  add('Compensation', {
    employeeId: c.employeeId, organizationId: orgId, structureId: c.structureId ? scoped(c.structureId, orgId) : null, baseMonthly: c.baseMonthly, currency: c.currency,
    effectiveFrom: date(c.effectiveFrom), bankOnFile: c.bankOnFile, history: c.history.map((h) => ({ ...h, date: date(h.date) })),
  });
}
count('payrollPreviews', S.payrollRuns.length);

// ── Engagement ──────────────────────────────────────────────────────────────
count('announcements', S.announcements.length);
for (const a of S.announcements) {
  const authorId = userIdForName(a.author, `Announcement ${a.id}`, { orgId: a.organizationId });
  if (!authorId) {
    rejected.push({ entity: 'Announcement', id: a.id, reason: `author "${a.author}" does not match an account (authorId is required)` });
    continue;
  }
  add('Announcement', { id: a.id, organizationId: a.organizationId, title: a.title, body: a.body, authorId, author: a.author, audience: a.audience, departmentId: a.departmentId ?? null, pinned: a.pinned, publishedAt: ts(a.publishedAt), updatedAt: ts(a.publishedAt) });
}

count('recognition', S.recognition.length);
let reactionTotal = 0;
for (const r of S.recognition) {
  const fromUserId = userIdForName(r.from, `Recognition ${r.id}`, { orgId: r.organizationId });
  if (!fromUserId) {
    rejected.push({ entity: 'Recognition', id: r.id, reason: `sender "${r.from}" does not match an account (fromUserId is required)` });
    continue;
  }
  reactionTotal += r.reactions;
  add('Recognition', { id: r.id, organizationId: r.organizationId, fromUserId, from: r.from, toEmployeeId: r.toEmployeeId, value: r.value, message: r.message, at: ts(r.at) });
}
unsupported.push({ entity: 'Recognition.reactions (number)', count: reactionTotal, reason: 'The mock stores a total only, not who reacted; no reactions are attributed to people. Totals start at 0.' });

count('surveys', S.surveys.length);
let responseCount = 0;
for (const s of S.surveys) {
  add('Survey', { id: s.id, organizationId: s.organizationId, title: s.title, status: s.status, anonymous: s.anonymous, questions: s.questions, closesOn: date(s.closesOn), createdAt: SEED_TS, updatedAt: SEED_TS });
  s.responses.forEach((resp, i) => {
    responseCount++;
    add('SurveyResponse', { id: `${s.id}-r${String(i + 1).padStart(2, '0')}`, surveyId: s.id, userId: null, answers: resp.answers, at: s.anonymous ? null : ts(resp.at) });
  });
}
count('surveyResponses', responseCount);
transformations.push('Survey responses become SurveyResponse rows without a user (the mock responses have no author, and anonymous responses never store one or a timestamp). No SurveyRespondent markers are written: they are HMACs keyed by the backend HASH_SECRET and the mock responses belong to no account. Seeded users can therefore still answer the surveys.');

count('feedback', S.feedback.length);
for (const f of S.feedback) {
  if (!f.anonymous) {
    // The backend always stores the author of non-anonymous feedback (engagement.service.ts); an
    // author-less non-anonymous item would be misrepresented, and no author is invented.
    rejected.push({ entity: 'FeedbackItem', id: f.id, reason: 'non-anonymous but the mock has no author. The backend always records the author of non-anonymous feedback and shows it; inventing one or making it anonymous would misrepresent it.' });
    continue;
  }
  add('FeedbackItem', { id: f.id, organizationId: f.organizationId, category: f.category, body: f.body, status: f.status, anonymous: true, authorId: null, authorName: null, at: ts(f.at) });
}

count('activities', S.activities.length);
let rsvpWithoutAccount = 0;
for (const a of S.activities) {
  add('TeamActivity', { id: a.id, organizationId: a.organizationId, title: a.title, date: date(a.date), location: a.location, kind: a.kind, createdAt: SEED_TS, updatedAt: SEED_TS });
  for (const employeeId of a.rsvps) {
    const membershipId = membershipByEmployee.get(employeeId);
    if (!membershipId) {
      rsvpWithoutAccount++;
      continue;
    }
    add('ActivityRsvp', { activityId: a.id, membershipId, at: SEED_TS });
  }
}
count('activityRsvps', S.activities.reduce((n, a) => n + a.rsvps.length, 0));
unsupported.push({ entity: 'TeamActivity.rsvps of employees without an account', count: rsvpWithoutAccount, reason: 'An RSVP is stored per membership. Employees who have no account for any other reason are not given one just to carry an RSVP, so those RSVPs are not seeded; RSVP totals are lower than in the mock.' });
transformations.push('TeamActivity.rsvps hold employee ids in the mock; the database stores membership ids, so each is mapped through the employee → membership link (only for employees with an account).');

count('cultureInitiatives', S.initiatives.length);
for (const c of S.initiatives) add('CultureInitiative', { id: c.id, organizationId: c.organizationId, title: c.title, owner: c.owner, progress: c.progress, status: c.status, createdAt: SEED_TS, updatedAt: SEED_TS });

// ── Social ──────────────────────────────────────────────────────────────────
count('communities', S.communities.length);
for (const c of S.communities) add('Community', { id: c.id, name: c.name, description: c.description, topic: c.topic, district: c.district, archivedAt: null, createdAt: SEED_TS, updatedAt: SEED_TS });
const communityMembers = new Set();
const postIds = [];
let postCount = 0;
const authorFromShortName = (short) => {
  const m = short.match(/^(\S+)\s+(\S)\.$/);
  if (!m) return userIdForName(short, 'CommunityPost');
  const hits = [...users.values()].filter((u) => socialIds.has(u.id) && u.displayName.split(' ')[0] === m[1] && u.displayName.split(' ').at(-1)?.startsWith(m[2]));
  return hits.length === 1 ? hits[0].id : null;
};
for (const c of S.communities) {
  for (const p of c.posts) {
    postCount++;
    const authorId = authorFromShortName(p.author);
    if (!authorId) {
      rejected.push({ entity: 'CommunityPost', id: `${c.id}/${p.id}`, reason: `author "${p.author}" does not match a social profile account` });
      continue;
    }
    const id = `${c.id}-${p.id}`;
    postIds.push({ communityId: c.id, mockId: p.id, seedId: id });
    add('CommunityPost', { id, communityId: c.id, authorId, authorName: p.author, text: p.text, removedAt: null, removedBy: null, createdAt: ts(p.at) });
    communityMembers.add(`${c.id}|${authorId}`);
  }
}
count('communityPosts', postCount);
for (const communityId of S.joinedCommunities) communityMembers.add(`${communityId}|${candidate.id}`);
for (const key of [...communityMembers].sort()) {
  const [communityId, userId] = key.split('|');
  add('CommunityMember', { communityId, userId, at: SEED_TS });
}
transformations.push('CommunityPost ids are prefixed with their community id (p1 → com-builders-p1): the mock reuses p1, p2 … in every community, but the database id is global.');
transformations.push('Community post authors ("Kofi A.") are matched to social-profile accounts by first name and last initial and become community members (the API only lets members post). authorName keeps the mock display text.');
unsupported.push({ entity: 'Community.members (number)', count: S.communities.reduce((n, c) => n + c.members, 0), reason: 'Member totals are computed from CommunityMember rows; no accounts are invented to match them.' });
unsupported.push({ entity: 'Community.affinity', count: S.communities.length, reason: 'Personality affinity for social recommendations has no database column.' });

count('events', S.events.length);
for (const e of S.events) {
  add('CityEvent', {
    id: e.id, title: e.title, kind: e.kind, district: e.district, venue: e.venue, start: ts(e.start), end: ts(e.end), host: e.host,
    hostOrganizationId: e.hostOrganizationId ?? null, description: e.description, capacity: e.capacity, tags: e.tags, communityId: e.communityId ?? null,
    createdById: (e.hostOrganizationId && adminOf(e.hostOrganizationId)) ?? 'seed-platform-admin', cancelledAt: null, createdAt: SEED_TS, updatedAt: SEED_TS,
  });
}
unsupported.push({ entity: 'CityEvent.attendeeCount', count: S.events.reduce((n, e) => n + e.attendeeCount, 0), reason: 'Attendee totals are computed from EventAttendee rows; no attendee accounts are invented. Seeded events start with 0 attendees.' });
transformations.push("CityEvent.createdById = the host organisation's org-admin account when there is one, otherwise the platform account.");
count('eventRsvps (candidate)', S.rsvps.length);
for (const eventId of S.rsvps) add('EventAttendee', { eventId, userId: candidate.id, at: SEED_TS });

count('eventInvitations', S.invitations.length);
for (const inv of S.invitations) {
  const other = userIdForName(inv.direction === 'received' ? inv.from : inv.to, `Event invitation ${inv.id}`);
  if (!other) {
    rejected.push({ entity: 'EventInvitation', id: inv.id, reason: 'the other person does not match an account' });
    continue;
  }
  const [fromUserId, toUserId] = inv.direction === 'received' ? [other, candidate.id] : [candidate.id, other];
  add('EventInvitation', { id: inv.id, eventId: inv.eventId, fromUserId, toUserId, status: inv.status, createdAt: ts(inv.at), respondedAt: null });
}
count('connections', S.connections.length);
for (const c of S.connections) {
  if (!users.has(c.profileId)) {
    rejected.push({ entity: 'Connection', id: c.profileId, reason: 'profile has no account' });
    continue;
  }
  add('Connection', { requesterId: candidate.id, addresseeId: c.profileId, status: c.status, createdAt: ts(c.at), respondedAt: c.status === 'connected' ? ts(c.at) : null });
}
count('notifications', S.notifications.length);
for (const n of S.notifications) {
  const body = n.id === 'n-welcome' ? 'Welcome to Grooveli City. This development account was created from the Grooveli seed package.' : n.body;
  if (body !== n.body) transformations.push(`Notification ${n.id}: body rewritten; the mock text says data is "stored only in this browser", which is untrue once it is in the database.`);
  add('Notification', { id: n.id, userId: candidate.id, kind: n.kind, title: n.title, body, href: n.href ?? null, readAt: n.read ? ts(n.at) : null, at: ts(n.at) });
}

tables.User = [...users.values()];

const notSeeded = [
  { entity: 'Career content (missions, challenges, courses, achievements, assessment questions)', reason: 'Already in backend/api/prisma/content/career.json, loaded with `pnpm --filter @grooveli/api db:content`. Identical to the frontend fixtures except one deliberate wording change (achievement "ach-first-app" drops "(simulated)").' },
  { entity: 'TierModules', reason: 'The mock has no overrides; the backend falls back to DEFAULT_TIER_MODULES, which matches the frontend exactly.' },
  { entity: 'GameAvailability / game catalogue', reason: 'The backend reports every game "coming-soon" when no row exists, matching the frontend. Titles and descriptions are static frontend copy.' },
  { entity: 'City layout (DISTRICTS, BUILDINGS, interiors)', reason: 'Frontend-owned 3D placement; buildings find their organisation by id, which the seed keeps unchanged.' },
  { entity: 'WORKFORCE_HISTORY', reason: 'Analytics are computed by the backend from live records; there is no table for historical series.' },
  { entity: 'Payroll previews, XP events, challenge attempts, assistant messages, presence, market rates', reason: 'Empty in the mock initial state and/or backend-generated (authoritative XP, simulated payroll results, AI output, live presence, provider data). None are invented.' },
  { entity: 'Sessions, auth tokens, audit log, password hashes', reason: 'Never seeded. Accounts are locked until provisioned (see BACKEND_HANDOFF.md).' },
];

// ── Outputs ─────────────────────────────────────────────────────────────────
const order = insertionOrder(schema, Object.keys(tables));
const tableCounts = Object.fromEntries(order.map((t) => [t, tables[t].length]));
const testAccounts = accounts.filter((a) => a.testAccountFor).map(({ userId, email, displayName, testAccountFor }) => ({
  role: testAccountFor, userId, email, displayName,
  platformRole: users.get(userId).platformRole,
  memberships: memberships.filter((m) => m.userId === userId).map((m) => ({ organizationId: m.organizationId, roles: m.roles, employeeId: m.employeeId })),
}));
const testAccountIds = testAccounts.map((t) => t.userId);
const seedUserIds = [...users.keys()];
const platformAdminIds = [...users.values()].filter((u) => u.platformRole === 'admin').map((u) => u.id);

const meta = {
  package: 'Grooveli City seed package (development / staging only)',
  generator: 'frontend/seed-preparation/scripts/generate.mjs',
  sources: ['frontend/domain/src (fixtures, personas)', 'frontend/web/src/lib/store/state.ts (createInitialState)'],
  schema: { source: relative(REPO_ROOT, MIGRATIONS_DIR).replace(/\\/g, '/'), migrations: schema.migrations },
  dates: { mockToday: D.DEMO_TODAY, anchorDate: anchorDate ?? D.DEMO_TODAY, shiftDays, seedTimestamp: SEED_TS },
  passwordHashPlaceholder: PASSWORD_PLACEHOLDER,
  testAccountIds,
  insertionOrder: order,
  counts: { source: sourceCounts, seeded: tableCounts },
};
writeFileSync(
  OUTPUT.seedData,
  JSON.stringify(
    {
      meta,
      report: { rejected, warnings, unsupported: unsupported.map(({ records, ...u }) => u), notSeeded, transformations, identity, applicationMerges: merges },
      tables: Object.fromEntries(order.map((t) => [t, tables[t]])),
      unsupported: Object.fromEntries(unsupported.filter((u) => u.records).map((u) => [u.entity, u.records])),
    },
    null,
    2,
  ) + '\n',
);

writeFileSync(
  OUTPUT.idMapping,
  JSON.stringify(
    {
      note: 'Every mock id is kept unchanged unless listed here. User ids reuse the mock id where one exists (cand-demo, talent-NN, soc-N); otherwise they are derived. All emails use reserved .example domains.',
      testAccounts,
      employeePersonaIdentity: identity,
      accounts,
      derivedIds: {
        users: 'user-<name-slug> for workspace members without a social profile; user-<employeeId> for the employee accounts; seed-platform-admin.',
        memberships: `mock OrgMember ids are kept (mem-k-1 …); employee memberships are mem-<employeeId>; the employee persona is ${memberships.find((m) => m.userId === employeePersonaUserId).id}.`,
        surveyResponses: '<surveyId>-rNN in mock order.',
        communityPosts: '<communityId>-<mock post id>.',
      },
      remapped: {
        applicationMerges: merges,
        payroll: payrollIds,
        communityPosts: postIds,
        activityRsvps: 'employee id → membership id, for employees with an account.',
      },
    },
    null,
    2,
  ) + '\n',
);

// ── seed.sql ────────────────────────────────────────────────────────────────
const seedPairs = (rows, a, b) => rows.map((r) => `    (${quote(r[a])}, ${quote(r[b])})`).join(',\n');
const sql = [
  '-- Grooveli City: development / staging seed. GENERATED FILE, do not edit by hand.',
  '-- Generator: frontend/seed-preparation/scripts/generate.mjs (from the frontend mock data)',
  `-- Schema: backend/api/prisma/migrations (${schema.migrations.length} migrations, latest ${schema.migrations.at(-1)})`,
  `-- Dates: mock today ${D.DEMO_TODAY} → anchor ${ANCHOR} (shift ${shiftDays} days). Regenerate with --anchor-date=<day of seeding>.`,
  '--',
  '-- Safety (guards run first; any failure aborts the whole transaction and writes nothing):',
  "--   1. grooveli.seed_allow must be 'development' (an acknowledgement, not proof of a safe target);",
  '--   2. grooveli.seed_target must equal current_database() (the operator names the database they verified);',
  '--   3. _prisma_migrations must list exactly the migrations this seed was generated against, all finished;',
  '--   4. no seed email or user id may belong to a different existing account; no seed organisation id may',
  '--      belong to a differently named organisation.',
  '--   Then: one transaction, INSERT … ON CONFLICT DO NOTHING only (no DROP, TRUNCATE, DELETE, UPDATE or',
  '--   schema change); a repeat run inserts nothing and never overwrites rows (and does not move dates).',
  `--   No usable passwords: every account has the placeholder hash ${quote(PASSWORD_PLACEHOLDER)}.`,
  '--',
  '-- Run (psql), after the checks in BACKEND_HANDOFF.md:',
  '--   PGOPTIONS="-c grooveli.seed_allow=development -c grooveli.seed_target=<database name>" \\',
  '--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f frontend/seed-preparation/seed.sql',
  '',
  'BEGIN;',
  '',
  'DO $guard$',
  'BEGIN',
  "  IF coalesce(current_setting('grooveli.seed_allow', true), '') <> 'development' THEN",
  "    RAISE EXCEPTION 'Grooveli seed refused: development/staging only. Set grooveli.seed_allow = ''development'' for this session to confirm.';",
  '  END IF;',
  "  IF coalesce(current_setting('grooveli.seed_target', true), '') <> current_database() THEN",
  "    RAISE EXCEPTION 'Grooveli seed refused: set grooveli.seed_target to the name of the database you verified (this session is connected to %).', current_database();",
  '  END IF;',
  'END',
  '$guard$;',
  '',
  'DO $guard$',
  'DECLARE',
  `  expected text[] := ARRAY[${schema.migrations.map(quote).join(', ')}];`,
  '  applied text[];',
  '  missing text;',
  '  extra text;',
  'BEGIN',
  "  IF to_regclass('_prisma_migrations') IS NULL THEN",
  "    RAISE EXCEPTION 'Grooveli seed refused: no _prisma_migrations table. Apply the backend migrations first (pnpm --filter @grooveli/api db:deploy).';",
  '  END IF;',
  '  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN',
  "    RAISE EXCEPTION 'Grooveli seed refused: a migration is unfinished or failed. Resolve it with prisma migrate first.';",
  '  END IF;',
  '  SELECT array_agg(migration_name) INTO applied FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;',
  "  SELECT string_agg(m, ', ') INTO missing FROM unnest(expected) AS m WHERE NOT (m = ANY(coalesce(applied, '{}')));",
  "  SELECT string_agg(m, ', ') INTO extra FROM unnest(coalesce(applied, '{}')) AS m WHERE NOT (m = ANY(expected));",
  '  IF missing IS NOT NULL THEN',
  "    RAISE EXCEPTION 'Grooveli seed refused: migrations not applied: %', missing;",
  '  END IF;',
  '  IF extra IS NOT NULL THEN',
  "    RAISE EXCEPTION 'Grooveli seed refused: the database has migrations this seed was not generated against: %. Regenerate and validate the seed first.', extra;",
  '  END IF;',
  'END',
  '$guard$;',
  '',
  'DO $guard$',
  'DECLARE clash text;',
  'BEGIN',
  "  SELECT string_agg(u.email || ' (existing id ' || u.id || ')', ', ') INTO clash",
  '  FROM "User" u',
  '  JOIN (VALUES',
  seedPairs(tables.User, 'id', 'email'),
  '  ) AS seed(id, email) ON u.email = seed.email OR u.id = seed.id',
  '  WHERE u.id <> seed.id OR u.email <> seed.email;',
  '  IF clash IS NOT NULL THEN',
  "    RAISE EXCEPTION 'Grooveli seed refused: seed accounts collide with existing accounts: %', clash;",
  '  END IF;',
  "  SELECT string_agg(o.id || ' (existing name ' || o.name || ')', ', ') INTO clash",
  '  FROM "Organization" o',
  '  JOIN (VALUES',
  seedPairs(tables.Organization, 'id', 'name'),
  '  ) AS seed(id, name) ON o.id = seed.id',
  '  WHERE o.name <> seed.name;',
  '  IF clash IS NOT NULL THEN',
  "    RAISE EXCEPTION 'Grooveli seed refused: seed organisation ids belong to other organisations: %', clash;",
  '  END IF;',
  `  IF EXISTS (SELECT 1 FROM "User" WHERE id = ${quote(candidate.id)}) THEN`,
  "    RAISE NOTICE 'Grooveli seed: seed data is already present. Nothing existing will change (dates are not moved); only missing rows are added.';",
  '  END IF;',
  'END',
  '$guard$;',
  '',
  ...order.flatMap((t) => [`-- ${t}: ${tables[t].length} row(s)`, renderInserts(schema, t, tables[t]), '']),
  'COMMIT;',
  '',
].join('\n');
writeFileSync(OUTPUT.seedSql, sql);

// ── post-seed-verify.sql (read-only) ────────────────────────────────────────
const verifyRows = [];
for (const t of order) {
  const st = schema.tables[t];
  const keyCol = st.columns.id ? 'id' : st.primaryKey[0];
  const keys = [...new Set(tables[t].map((r) => r[keyCol]))];
  verifyRows.push(`  SELECT ${quote(`rows: ${t}`)}, ${tables[t].length}, (SELECT count(*)::int FROM "${t}" WHERE "${keyCol}" = ANY(ARRAY[${keys.map(quote).join(', ')}]::text[]))`);
}
for (const [name, q] of integrityChecks({ placeholder: PASSWORD_PLACEHOLDER, testAccountIds, seedUserIds, platformAdminIds })) {
  verifyRows.push(`  SELECT ${quote(`check: ${name}`)}, 0, (${q.replace(/ AS bad$/, '').replace(/^SELECT /, 'SELECT ').replace(/::int AS bad/, '::int')})`);
}
const verifySql = [
  '-- Grooveli seed: post-seed verification. GENERATED FILE. Read-only (SELECT only).',
  '-- Run: psql "$DATABASE_URL" -f frontend/seed-preparation/post-seed-verify.sql',
  '-- "rows:" lines count only the seeded rows (by id), so other development data does not affect them.',
  '-- Every line must show ok = true. Before provisioning, no account has a usable password; afterwards only the test accounts do.',
  'SELECT check_name, expected, actual, actual = expected AS ok FROM (',
  verifyRows.join('\n  UNION ALL\n'),
  ') AS v(check_name, expected, actual)',
  'ORDER BY ok, check_name;',
  '',
  '-- Seeded accounts with organisation roles (least-privilege review):',
  'SELECT m."organizationId", u.email, m.roles, m."employeeId", u."platformRole", (u."passwordHash" <> ' + quote(PASSWORD_PLACEHOLDER) + ') AS can_sign_in',
  'FROM "Membership" m JOIN "User" u ON u.id = m."userId"',
  `WHERE u.id = ANY(ARRAY[${seedUserIds.map(quote).join(', ')}]::text[])`,
  'ORDER BY m."organizationId", m.roles::text, u.email;',
  '',
].join('\n');
writeFileSync(OUTPUT.verifySql, verifySql);

// ── API checklist ───────────────────────────────────────────────────────────
const T = tables;
const inOrg = (rows, org, f = (r) => r.organizationId) => rows.filter((r) => f(r) === org).length;
const jobOrg = new Map(T.Job.map((j) => [j.id, j.organizationId]));
const hq = (org) => ({
  vacancies: T.Job.filter((j) => j.organizationId === org && j.status === 'published').length,
  departments: inOrg(T.Department, org),
  directory: T.Employee.filter((e) => e.organizationId === org && e.publicDirectory && e.status !== 'exited').length,
  announcements: T.Announcement.filter((a) => a.organizationId === org && a.audience === 'public-hq').length,
});
const career = JSON.parse(readFileSync(join(REPO_ROOT, 'backend', 'api', 'prisma', 'content', 'career.json'), 'utf8'));
const directReports = new Set([personaEmployee.id, ...T.Employee.filter((e) => e.managerId === personaEmployee.id).map((e) => e.id)]);
const k = 'kestrel-systems';
const roleBreakdown = (org) => {
  const ms = T.Membership.filter((m) => m.organizationId === org);
  const named = ms.filter((m) => !(m.roles.length === 1 && m.roles[0] === 'employee'));
  return `${named.map((m) => `${users.get(m.userId).displayName} [${m.roles.join(', ')}]`).join(', ')} + ${ms.length - named.length} with role employee only`;
};
const lastEnd = T.CityEvent.map((e) => e.end).sort().at(-1);
const { markdown } = buildChecklist({
  anchorDate: meta.dates.anchorDate,
  testAccounts,
  counts: {
    orgs: T.Organization.length,
    openJobs: T.Job.filter((j) => j.status === 'published').length,
    jobsKestrel: inOrg(T.Job, k),
    hq: { k: hq(k), a: hq('amberline-health'), s: hq('saffron-salt') },
    events: T.CityEvent.length,
    lastEventEndsDays: Math.ceil((Date.parse(lastEnd) - Date.parse(`${meta.dates.anchorDate}T00:00:00Z`)) / DAY_MS),
    communities: T.Community.length,
    postsBuilders: T.CommunityPost.filter((p) => p.communityId === 'com-builders').length,
    people: T.CandidateProfile.filter((p) => p.profileDiscoverable && p.userId !== candidate.id).length,
    talent: T.CandidateProfile.filter((p) => ['public', 'employers'].includes(p.visibility) && users.get(p.userId).onboardingComplete).length,
    locations: { k: inOrg(T.OfficeLocation, k) },
    policies: { k: inOrg(T.Policy, k) },
    invitations: { k: inOrg(T.Invitation, k) },
    members: { k: inOrg(T.Membership, k), a: inOrg(T.Membership, 'amberline-health') },
    memberBreakdown: { k: roleBreakdown(k) },
    employees: { k: inOrg(T.Employee, k) },
    leave: { k: inOrg(T.LeaveRequest, k) },
    kofiLeave: T.LeaveRequest.filter((l) => directReports.has(l.employeeId)).length,
    reviews: { k: inOrg(T.PerformanceReview, k) },
    attendance: { k: T.AttendanceEntry.filter((a) => employeeById.get(a.employeeId).organizationId === k).length },
    apps: { k: T.Application.filter((a) => jobOrg.get(a.jobId) === k).length },
    interviews: { k: T.Interview.filter((i) => jobOrg.get(i.jobId) === k).length },
    shortlists: { k: inOrg(T.Shortlist, k) },
    shortlistSize: T.Shortlist[0]?.applicationIds.length ?? 0,
    assessments: { k: inOrg(T.Assessment, k) },
    comp: { k: inOrg(T.Compensation, k) },
    components: { k: inOrg(T.PayComponent, k) },
    structures: { k: inOrg(T.CompensationStructure, k) },
    ann: { k: inOrg(T.Announcement, k) },
    recognition: { k: inOrg(T.Recognition, k) },
    surveys: { k: inOrg(T.Survey, k) },
    surveyResponses: T.SurveyResponse.length,
    feedback: { k: inOrg(T.FeedbackItem, k) },
    activities: { k: inOrg(T.TeamActivity, k) },
    rsvps: { k: T.ActivityRsvp.filter((r) => T.TeamActivity.find((a) => a.id === r.activityId).organizationId === k).length },
    initiatives: { k: inOrg(T.CultureInitiative, k) },
    career: { missions: career.missions.length, challenges: career.challenges.length, courses: career.courses.length, achievements: career.achievements.length, assessment: career.assessmentQuestions.length },
    tolu: {
      saved: T.SavedJob.length,
      applications: T.Application.filter((a) => a.candidateId === candidate.id).length,
      notifications: T.Notification.filter((n) => n.userId === candidate.id).length,
      connections: T.Connection.length,
      invitations: T.EventInvitation.length,
    },
  },
});
writeFileSync(OUTPUT.apiChecklist, markdown);

const total = Object.values(tableCounts).reduce((a, b) => a + b, 0);
console.log(`Seed package written (${total} rows in ${order.length} tables, date shift ${shiftDays} days).`);
console.log(`Accounts: ${users.size} (${testAccounts.length} test accounts). Rejected: ${rejected.length}, warnings: ${warnings.length}, unsupported entities: ${unsupported.length}.`);
