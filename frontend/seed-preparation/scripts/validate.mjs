#!/usr/bin/env node
/**
 * Validates the seed package against the real database schema and writes
 * VALIDATION_REPORT.md.
 *
 *   node frontend/seed-preparation/scripts/validate.mjs            static checks only
 *   node frontend/seed-preparation/scripts/validate.mjs --dry-run  static checks + execution on an
 *                                                                   in-memory PostgreSQL (PGlite)
 *
 * The dry run needs @electric-sql/pglite, which is NOT a project dependency.
 * Install it outside the repository and point PGLITE_MODULE at its entry:
 *   npm install --prefix /tmp/pglite @electric-sql/pglite@0.3.14
 *   PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js node …/validate.mjs --dry-run
 * It applies backend/api/prisma/migrations to throwaway in-memory databases
 * (recording them in _prisma_migrations the way `prisma migrate deploy` does),
 * runs seed.sql and post-seed-verify.sql there, and discards everything on exit.
 * It never connects to a PostgreSQL server.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { integrityChecks } from './lib/integrity.mjs';
import { BACKEND_PERMISSIONS, MIGRATIONS_DIR, OPENAPI, OUTPUT, PACKAGE_DIR, REPO_ROOT } from './lib/paths.mjs';
import { isRequired, loadSchema } from './lib/schema.mjs';

const dryRun = process.argv.includes('--dry-run');
const schema = loadSchema(MIGRATIONS_DIR);
const seed = JSON.parse(readFileSync(OUTPUT.seedData, 'utf8'));
const mapping = JSON.parse(readFileSync(OUTPUT.idMapping, 'utf8'));
const sql = readFileSync(OUTPUT.seedSql, 'utf8');
const verifySql = readFileSync(OUTPUT.verifySql, 'utf8');
const checklist = readFileSync(OUTPUT.apiChecklist, 'utf8');
const T = seed.tables;
const PLACEHOLDER = seed.meta.passwordHashPlaceholder;
const testIds = new Set(seed.meta.testAccountIds);

const checks = [];
const check = (group, name, problems) => checks.push({ group, name, ok: problems.length === 0, problems: problems.slice(0, 15), total: problems.length });

// ── Schema ──────────────────────────────────────────────────────────────────
check('Schema', 'Every migration statement understood by the schema reader', schema.unhandled);
check('Schema', 'Every seeded table exists in the database schema', Object.keys(T).filter((t) => !schema.tables[t]).map((t) => `unknown table ${t}`));
const colProblems = [];
const shapeProblems = [];
for (const [t, rows] of Object.entries(T)) {
  const cols = schema.tables[t]?.columns ?? {};
  const first = JSON.stringify(Object.keys(rows[0] ?? {}).sort());
  rows.forEach((r, i) => {
    for (const k of Object.keys(r)) if (!cols[k]) colProblems.push(`${t}[${i}]: column "${k}" does not exist`);
    if (JSON.stringify(Object.keys(r).sort()) !== first) shapeProblems.push(`${t}[${i}]: different column set from row 0`);
  });
}
check('Schema', 'Every seeded column exists in its table', colProblems);
check('Schema', 'Rows of a table share one column set (no accidental NULLs over defaults)', shapeProblems);

// ── Required fields and types ───────────────────────────────────────────────
const isSql = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.$sql === 'string';
const typeOk = (v, col) => {
  if (isSql(v)) return true;
  const one = (x) => {
    if (col.enum) return schema.enums[col.enum].includes(x);
    switch (col.type) {
      case 'TEXT': return typeof x === 'string';
      case 'INTEGER': return Number.isInteger(x) && x >= -2147483648 && x <= 2147483647;
      case 'DOUBLE PRECISION': return typeof x === 'number' && Number.isFinite(x);
      case 'BOOLEAN': return typeof x === 'boolean';
      case 'TIMESTAMP(3)': return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(x) && !Number.isNaN(Date.parse(x));
      case 'DATE': return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x));
      case 'JSONB': return x !== undefined;
      default: return false;
    }
  };
  return col.isArray ? Array.isArray(v) && v.every(one) : one(v);
};
const missing = [];
const badTypes = [];
const badEnums = [];
for (const [t, rows] of Object.entries(T)) {
  for (const [name, col] of Object.entries(schema.tables[t]?.columns ?? {})) {
    rows.forEach((r, i) => {
      const v = r[name];
      if (isRequired(col) && (v === undefined || v === null)) missing.push(`${t}[${i}] (${r.id ?? ''}): required "${name}" missing`);
      if (v === undefined || v === null) {
        if (col.notNull && v === null) missing.push(`${t}[${i}]: NOT NULL "${name}" is null`);
        return;
      }
      if (!typeOk(v, col)) (col.enum ? badEnums : badTypes).push(`${t}[${i}].${name} = ${JSON.stringify(v).slice(0, 60)} (${col.enum ?? col.type}${col.isArray ? '[]' : ''})`);
    });
  }
}
check('Fields', 'Required fields (NOT NULL without database default) are present', missing);
check('Fields', 'Values match column data types', badTypes);
check('Fields', 'Enum values are valid database enum labels', badEnums);

// ── Keys ────────────────────────────────────────────────────────────────────
const keyOf = (r, cols) => (cols.some((c) => r[c] === null || r[c] === undefined) ? null : JSON.stringify(cols.map((c) => r[c])));
const dupes = (label, rows, cols, out) => {
  const seen = new Map();
  rows.forEach((r, i) => {
    const k = keyOf(r, cols);
    if (k === null) return;
    if (seen.has(k)) out.push(`${label} (${cols.join(', ')}) = ${k} in rows ${seen.get(k)} and ${i}`);
    else seen.set(k, i);
  });
};
const pkDupes = [];
const ukDupes = [];
for (const [t, rows] of Object.entries(T)) {
  const st = schema.tables[t];
  if (!st) continue;
  dupes(`${t} primary key`, rows, st.primaryKey, pkDupes);
  for (const u of st.uniques) dupes(`${t} ${u.name}`, rows, u.columns, ukDupes);
}
check('Keys', 'Primary keys are unique', pkDupes);
check('Keys', 'Unique constraints hold (email, org+email, job+candidate, org+department name, …)', ukDupes);
const index = (t, cols) => new Set((T[t] ?? []).map((r) => JSON.stringify(cols.map((c) => r[c]))));
const fkProblems = [];
for (const [t, rows] of Object.entries(T)) {
  for (const fk of schema.tables[t]?.foreignKeys ?? []) {
    const targets = index(fk.references, fk.referencedColumns);
    rows.forEach((r, i) => {
      if (fk.columns.some((c) => r[c] === null || r[c] === undefined)) return;
      const k = JSON.stringify(fk.columns.map((c) => r[c]));
      if (!targets.has(k)) fkProblems.push(`${t}[${i}] ${fk.columns.join(',')} → ${fk.references}: ${k} not in seed`);
    });
  }
}
check('Keys', 'Foreign keys resolve to seeded rows (nothing has to pre-exist)', fkProblems);
const order = seed.meta.insertionOrder;
const orderProblems = [];
for (const t of order) {
  for (const fk of schema.tables[t]?.foreignKeys ?? []) {
    if (fk.references !== t && order.includes(fk.references) && order.indexOf(fk.references) > order.indexOf(t)) orderProblems.push(`${t} is inserted before its parent ${fk.references}`);
  }
}
const sqlOrder = [...sql.matchAll(/^-- (\w+): (\d+) row\(s\)$/gm)].map((m) => m[1]);
if (JSON.stringify(sqlOrder) !== JSON.stringify(order)) orderProblems.push('seed.sql table order differs from meta.insertionOrder');
check('Keys', 'Insertion order puts every parent table before its children (seed.sql follows it)', orderProblems);

// ── Logical references (columns without a database foreign key) ────────────
const ids = (t, col = 'id') => new Set((T[t] ?? []).map((r) => r[col]));
const U = ids('User');
const EMP = new Map((T.Employee ?? []).map((e) => [e.id, e]));
const MEM = new Map((T.Membership ?? []).map((m) => [m.id, m]));
const logical = [];
const ref = (t, col, set, label, { array = false, optional = true } = {}) =>
  (T[t] ?? []).forEach((r, i) => {
    for (const v of array ? r[col] ?? [] : [r[col]]) if (!(optional && (v === null || v === undefined)) && !set.has(v)) logical.push(`${t}[${i}].${col} = ${v}: no such ${label}`);
  });
ref('Membership', 'employeeId', new Set(EMP.keys()), 'employee');
ref('Membership', 'departmentId', ids('Department'), 'department');
ref('Membership', 'recruitingFor', ids('Department'), 'department', { array: true });
ref('Employee', 'userId', U, 'user');
ref('Employee', 'departmentId', ids('Department'), 'department', { optional: false });
ref('Employee', 'locationId', ids('OfficeLocation'), 'location', { optional: false });
ref('Employee', 'managerId', new Set(EMP.keys()), 'employee');
ref('Department', 'headEmployeeId', new Set(EMP.keys()), 'employee');
ref('PerformanceReview', 'reviewerId', U, 'user');
ref('Compensation', 'structureId', ids('CompensationStructure'), 'structure');
ref('CompensationStructure', 'componentIds', ids('PayComponent'), 'pay component', { array: true });
ref('Shortlist', 'jobId', ids('Job'), 'job');
ref('Shortlist', 'applicationIds', ids('Application'), 'application', { array: true });
ref('Assessment', 'jobId', ids('Job'), 'job');
ref('Announcement', 'authorId', U, 'user', { optional: false });
ref('Recognition', 'fromUserId', U, 'user', { optional: false });
ref('Recognition', 'toEmployeeId', new Set(EMP.keys()), 'employee', { optional: false });
ref('ActivityRsvp', 'membershipId', new Set(MEM.keys()), 'membership');
ref('CityEvent', 'createdById', U, 'user', { optional: false });
ref('CityEvent', 'hostOrganizationId', ids('Organization'), 'organization');
ref('CityEvent', 'communityId', ids('Community'), 'community');
ref('EventAttendee', 'userId', U, 'user');
ref('EventInvitation', 'fromUserId', U, 'user');
ref('EventInvitation', 'toUserId', U, 'user');
ref('CommunityMember', 'userId', U, 'user');
ref('CommunityPost', 'authorId', U, 'user');
ref('Connection', 'requesterId', U, 'user');
ref('Connection', 'addresseeId', U, 'user');
ref('Invitation', 'invitedById', U, 'user');
(T.Assessment ?? []).forEach((a) => a.results.forEach((r) => !ids('Application').has(r.applicationId) && logical.push(`Assessment ${a.id}: result for missing application ${r.applicationId}`)));
const jobOrg = new Map((T.Job ?? []).map((j) => [j.id, j.organizationId]));
for (const t of ['Shortlist', 'Assessment']) (T[t] ?? []).forEach((s) => jobOrg.get(s.jobId) !== s.organizationId && logical.push(`${t} ${s.id}: organisation differs from its job`));
const appById = new Map((T.Application ?? []).map((a) => [a.id, a]));
(T.Interview ?? []).forEach((iv) => {
  const a = appById.get(iv.applicationId);
  if (a && (a.jobId !== iv.jobId || a.candidateId !== iv.candidateId)) logical.push(`Interview ${iv.id}: job/candidate differ from its application`);
});
for (const t of ['LeaveRequest', 'PerformanceReview', 'Compensation']) (T[t] ?? []).forEach((r) => EMP.get(r.employeeId)?.organizationId !== r.organizationId && logical.push(`${t} for ${r.employeeId}: organisation differs from the employee's`));
(T.FeedbackItem ?? []).forEach((f) => !f.anonymous && (!f.authorId || !f.authorName) && logical.push(`FeedbackItem ${f.id}: non-anonymous without an author`));
check('Relationships', 'References without a database foreign key point at real rows (and the same organisation)', logical);

// ── Data decisions ──────────────────────────────────────────────────────────
const decisions = [];
const identity = seed.report.identity;
const personaRecord = EMP.get(identity.employeeRecord);
const personaUser = T.User.find((u) => u.id === identity.account);
if (identity.decision.startsWith('merged')) {
  if (personaRecord.name !== personaUser.displayName) decisions.push('Employee persona: record name differs from the account name');
  if (personaRecord.email !== personaUser.email) decisions.push('Employee persona: record email differs from the account email');
  if (personaRecord.userId !== personaUser.id) decisions.push('Employee persona: record not linked to the account');
  const generated = identity.changes.find((c) => c.field === 'Employee.name')?.from;
  if (generated && JSON.stringify(T).includes(generated)) decisions.push(`Employee persona: generated name "${generated}" still appears in seeded rows`);
}
for (const m of seed.report.applicationMerges) {
  const kept = T.Application.filter((a) => a.jobId === m.jobId && a.candidateId === m.candidateId);
  if (kept.length !== 1 || kept[0].id !== m.canonical.id) decisions.push(`Merge ${m.jobId}/${m.candidateId}: canonical ${m.canonical.id} not the single seeded application`);
  for (const d of m.dropped) if (JSON.stringify(T).includes(`"${d.id}"`)) decisions.push(`Merge: dropped ${d.id} is still referenced`);
}
if ((T.PolicyAcknowledgement ?? []).length || (T.RecognitionReaction ?? []).length) decisions.push('Synthetic acknowledgements or reactions are present');
check('Decisions', 'Persona identity consistent; one canonical application per candidate and vacancy; no synthetic attributions', decisions);

// ── Accounts, memberships and permissions ───────────────────────────────────
const permSrc = readFileSync(BACKEND_PERMISSIONS, 'utf8');
const block = permSrc.slice(permSrc.indexOf('ROLE_PERMISSIONS'), permSrc.indexOf('};', permSrc.indexOf('ROLE_PERMISSIONS')));
const ROLE_PERMISSIONS = Object.fromEntries([...block.matchAll(/['"]?([\w-]+)['"]?:\s*\[([^\]]*)\]/g)].map((m) => [m[1], [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])]));
const BASELINE = new Set(ROLE_PERMISSIONS.employee ?? []);
const permsOf = (roles) => new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? [`UNKNOWN ROLE ${r}`]));
const membershipsByUser = new Map();
for (const m of MEM.values()) membershipsByUser.set(m.userId, [...(membershipsByUser.get(m.userId) ?? []), m]);
const mem = [];
for (const m of MEM.values()) {
  if (!m.roles.length) mem.push(`Membership ${m.id}: no roles`);
  if (m.employeeId) {
    const e = EMP.get(m.employeeId);
    if (e && e.organizationId !== m.organizationId) mem.push(`Membership ${m.id}: employee of another organisation`);
    if (e && e.userId !== m.userId) mem.push(`Membership ${m.id}: employee linked to a different user`);
  }
  if (m.departmentId && !(T.Department ?? []).some((d) => d.id === m.departmentId && d.organizationId === m.organizationId)) mem.push(`Membership ${m.id}: department of another organisation`);
}
for (const e of EMP.values()) if (e.userId && !(membershipsByUser.get(e.userId) ?? []).some((m) => m.organizationId === e.organizationId && m.employeeId === e.id)) mem.push(`Employee ${e.id}: linked user without a membership pointing back`);
for (const u of T.User) if (u.activeOrganizationId && !(membershipsByUser.get(u.id) ?? []).some((m) => m.organizationId === u.activeOrganizationId)) mem.push(`User ${u.id}: active organisation is not one of their memberships`);
for (const o of new Set([...MEM.values()].map((m) => m.organizationId))) if (![...MEM.values()].some((m) => m.organizationId === o && m.roles.includes('org-admin'))) mem.push(`Organisation ${o}: members but no org-admin`);
check('Accounts', 'Membership consistency (employee ↔ user ↔ membership, active organisation, an org-admin per staffed organisation)', mem);

const perm = [];
if (!Object.keys(ROLE_PERMISSIONS).length) perm.push('could not read ROLE_PERMISSIONS from backend/api/src/auth/permissions.ts');
const intended = new Map(mapping.testAccounts.map((t) => [t.userId, t]));
for (const m of MEM.values()) {
  const p = permsOf(m.roles);
  const elevated = [...p].filter((x) => !BASELINE.has(x));
  if (!testIds.has(m.userId)) {
    if (elevated.length) perm.push(`${m.userId} (${m.organizationId}): not a test account but holds ${elevated.join(', ')}`);
    if (JSON.stringify(m.roles) !== '["employee"]') perm.push(`${m.userId}: roles ${m.roles.join('+')} (expected employee only)`);
  } else {
    const want = intended.get(m.userId)?.memberships.find((x) => x.organizationId === m.organizationId);
    if (!want || JSON.stringify(want.roles) !== JSON.stringify(m.roles)) perm.push(`${m.userId} (${m.organizationId}): roles differ from the intended test-account roles`);
  }
}
for (const u of T.User) if (u.platformRole !== 'none' && !(testIds.has(u.id) && intended.get(u.id)?.platformRole === u.platformRole)) perm.push(`${u.id}: platformRole ${u.platformRole} without being the designated platform test account`);
const employeesWithAccounts = [...EMP.values()].filter((e) => e.userId);
const accountReasons = mapping.accounts.filter((a) => employeesWithAccounts.some((e) => e.userId === a.userId) && !testIds.has(a.userId));
for (const a of accountReasons) if (!/fromUserId is required/.test(a.reason)) perm.push(`${a.userId}: employee account without a schema-required reason`);
check('Accounts', 'Least privilege: only test accounts hold elevated permissions; every other membership is exactly "employee"; employee accounts exist only where a record requires a user', perm);

const auth = [];
const emails = new Map();
for (const u of T.User) {
  if (u.passwordHash !== PLACEHOLDER) auth.push(`User ${u.id}: password hash is not the placeholder`);
  if (!/@[a-z0-9.-]+\.example$/.test(u.email)) auth.push(`User ${u.id}: email ${u.email} is not on a reserved .example domain`);
  if (u.email !== u.email.trim().toLowerCase()) auth.push(`User ${u.id}: email not lowercased/trimmed`);
  if (emails.has(u.email)) auth.push(`Duplicate email ${u.email}`);
  emails.set(u.email, u.id);
}
for (const t of ['Session', 'AuthToken', 'AuditLog', 'DataExportRequest']) if (T[t]?.length) auth.push(`${t} rows must never be seeded`);
if ((T.Invitation ?? []).some((i) => !isSql(i.tokenHash))) auth.push('Invitation token hashes must be generated at execution time');
const prov = readFileSync(`${PACKAGE_DIR}/scripts/provision-accounts.mjs`, 'utf8');
if (/--all/.test(prov.replace(/^\s*\*.*$/gm, ''))) auth.push('provision-accounts.mjs still offers --all');
check('Accounts', 'No usable credentials in the package; placeholder hashes only; reserved emails; only test accounts can be provisioned', auth);

// ── SQL safety ──────────────────────────────────────────────────────────────
const sqlProblems = [];
const allowed = new Set(['BEGIN', 'COMMIT', 'DO', 'DECLARE', 'END', 'INSERT', 'ON', 'IF', 'RAISE', 'SELECT', 'FROM', 'JOIN', 'WHERE']);
for (const s of new Set([...sql.matchAll(/^(?!--|\s|\(|\)|$)([A-Z]+)/gm)].map((m) => m[1]))) if (!allowed.has(s)) sqlProblems.push(`unexpected top-level keyword ${s}`);
if (/^\s*(DROP|TRUNCATE|DELETE|UPDATE|ALTER|CREATE|GRANT|REVOKE)\b/im.test(sql)) sqlProblems.push('destructive or schema-changing statement found');
if (!/^BEGIN;$/m.test(sql) || !/^COMMIT;$/m.test(sql)) sqlProblems.push('not wrapped in a single transaction');
for (const [needle, label] of [
  ["current_setting('grooveli.seed_allow', true)", 'development acknowledgement guard'],
  ["current_setting('grooveli.seed_target', true), '') <> current_database()", 'target database guard'],
  ["to_regclass('_prisma_migrations')", 'migration compatibility guard'],
  ['seed accounts collide with existing accounts', 'existing-account guard'],
  ['seed organisation ids belong to other organisations', 'existing-organisation guard'],
]) if (!sql.includes(needle)) sqlProblems.push(`missing ${label}`);
for (const m of schema.migrations) if (!sql.includes(`'${m}'`)) sqlProblems.push(`migration guard does not list ${m}`);
const inserts = [...sql.matchAll(/^INSERT INTO "(\w+)"/gm)].length;
const conflicts = [...sql.matchAll(/^ON CONFLICT DO NOTHING;$/gm)].length;
if (inserts !== conflicts) sqlProblems.push(`${inserts} INSERTs but ${conflicts} ON CONFLICT DO NOTHING clauses`);
const sqlCounts = Object.fromEntries([...sql.matchAll(/^-- (\w+): (\d+) row\(s\)$/gm)].map((m) => [m[1], Number(m[2])]));
for (const [t, rows] of Object.entries(T)) if (sqlCounts[t] !== rows.length) sqlProblems.push(`${t}: seed.sql says ${sqlCounts[t]}, seed-data.json has ${rows.length}`);
check('SQL', 'seed.sql: insert-only, one transaction, ON CONFLICT DO NOTHING on every insert, all guards present', sqlProblems);
const vProblems = [];
// Split on semicolons outside single-quoted literals.
const splitStatements = (text) => {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (const ch of text.replace(/^--.*$/gm, '')) {
    if (ch === "'") inQuote = !inQuote;
    if (ch === ';' && !inQuote) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
};
const vStatements = splitStatements(verifySql);
if (vStatements.length !== 2) vProblems.push(`expected 2 statements, found ${vStatements.length}`);
for (const s of vStatements) if (!/^SELECT\b/i.test(s)) vProblems.push(`non-SELECT statement: ${s.slice(0, 60)}`);
check('SQL', 'post-seed-verify.sql is read-only (SELECT statements only)', vProblems);

// ── Checklist endpoints exist in OpenAPI ────────────────────────────────────
const openapi = JSON.parse(readFileSync(OPENAPI, 'utf8'));
const templates = Object.entries(openapi.paths).flatMap(([p, ops]) => Object.keys(ops).filter((m) => /^(get|post|put|patch|delete)$/.test(m)).map((m) => ({ method: m.toUpperCase(), re: new RegExp(`^${p.replace(/\{[^}]+\}/g, '[^/]+')}$`), p })));
const requests = [...checklist.matchAll(/^\| ☐ \|[^|]*\| `(GET|POST|PUT|PATCH|DELETE) ([^`]+)` \|/gm)].map((m) => ({ method: m[1], path: m[2].split('?')[0] }));
const unknown = requests.filter((r) => !templates.some((t) => t.method === r.method && t.re.test(r.path))).map((r) => `${r.method} ${r.path}`);
if (!requests.length) unknown.push('no requests found in the checklist');
check('Checklist', `Every request in POST_SEED_API_CHECKLIST.md (${requests.length}) is a documented OpenAPI operation`, unknown);

// ── Determinism ─────────────────────────────────────────────────────────────
const hash = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const files = [OUTPUT.seedData, OUTPUT.seedSql, OUTPUT.idMapping, OUTPUT.verifySql, OUTPUT.apiChecklist];
const before = files.map(hash);
const genArgs = seed.meta.dates.shiftDays ? [`--anchor-date=${seed.meta.dates.anchorDate}`] : [];
const regen = spawnSync(process.execPath, [`${PACKAGE_DIR}/scripts/generate.mjs`, ...genArgs], { encoding: 'utf8' });
const after = files.map(hash);
check('Determinism', 'Regenerating from the same mock data and anchor date gives byte-identical files', [
  ...(regen.status !== 0 ? [`generator failed: ${regen.stderr.slice(0, 300)}`] : []),
  ...files.filter((_, i) => before[i] !== after[i]).map((f) => `${relative(PACKAGE_DIR, f)} changed`),
]);

// ── Dry run ─────────────────────────────────────────────────────────────────
const dry = dryRun ? await runDry() : { ran: false, reason: '--dry-run not requested' };

async function runDry() {
  let PGlite;
  try {
    ({ PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite'));
  } catch (e) {
    return { ran: false, reason: `PGlite not available (${e.message.split('\n')[0]}). See the header of this script.` };
  }
  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const fresh = async ({ record = true } = {}) => {
    const db = new PGlite();
    for (const m of migrations) await db.exec(readFileSync(`${MIGRATIONS_DIR}/${m}/migration.sql`, 'utf8'));
    if (record) {
      await db.exec(`CREATE TABLE "_prisma_migrations" ("id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ, "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
      for (const [i, m] of migrations.entries()) {
        const checksum = createHash('sha256').update(readFileSync(`${MIGRATIONS_DIR}/${m}/migration.sql`)).digest('hex');
        await db.query(`INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1, $2, now(), $3, 1)`, [`m${i}`, checksum, m]);
      }
    }
    return db;
  };
  const dbName = async (db) => (await db.query('SELECT current_database() AS d')).rows[0].d;
  const allow = async (db) => db.exec(`SET grooveli.seed_allow = 'development'; SET grooveli.seed_target = '${await dbName(db)}'`);
  const counts = async (db) => {
    const out = {};
    for (const t of Object.keys(T)) out[t] = (await db.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n;
    return out;
  };
  const run = async (db, text = sql) => {
    try {
      await db.exec(text);
      return null;
    } catch (e) {
      await db.exec('ROLLBACK').catch(() => {});
      return e.message;
    }
  };
  const verify = async (db) => {
    const results = await db.exec(verifySql);
    const rows = results[0].rows;
    return { rows, failed: rows.filter((r) => !r.ok), roles: results[1].rows };
  };
  const steps = [];
  const step = (name, ok, detail) => steps.push({ name, ok, detail });
  const expected = Object.fromEntries(Object.entries(T).map(([t, r]) => [t, r.length]));
  const diff = (a, b) => Object.keys(b).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${a[k]} vs ${b[k]}`);
  const refusal = async (name, setup, pattern) => {
    const db = await fresh(setup.fresh);
    if (setup.before) await setup.before(db);
    if (setup.allow !== false) await allow(db);
    if (setup.session) await db.exec(setup.session);
    const err = await run(db);
    const c = await counts(db);
    const wrote = Object.entries(c).filter(([t, n]) => n > (setup.baseline?.[t] ?? 0)).map(([t]) => t);
    step(name, !!err && pattern.test(err) && wrote.length === 0, err ? err.replace(/^.*?Grooveli seed refused: /, '').slice(0, 150) : 'ran without being refused!');
  };

  const probe = await fresh();
  const version = (await probe.query('SELECT version() AS v')).rows[0].v.split(' on ')[0];
  step(`Apply ${migrations.length} backend migrations to an empty in-memory database and record them in _prisma_migrations`, true, version);

  await refusal('Refuses without grooveli.seed_allow = development', { allow: false }, /development\/staging only/);
  await refusal('Refuses when grooveli.seed_target does not name the connected database', { allow: false, session: "SET grooveli.seed_allow = 'development'; SET grooveli.seed_target = 'some-other-db'" }, /seed_target/);
  await refusal('Refuses when the database has no _prisma_migrations table', { fresh: { record: false } }, /no _prisma_migrations/);
  await refusal('Refuses when a migration is not applied', { before: (db) => db.exec(`DELETE FROM "_prisma_migrations" WHERE migration_name = '${migrations.at(-1)}'`) }, /migrations not applied/);
  await refusal('Refuses when the database has a migration the seed was not generated against', { before: (db) => db.exec(`INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name) VALUES ('x', 'x', now(), '29991231000000_future_change')`) }, /not generated against/);
  await refusal('Refuses when a migration is unfinished or failed', { before: (db) => db.exec(`INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name) VALUES ('y', 'y', NULL, '29991231000001_failed')`) }, /unfinished or failed/);

  const db = await fresh();
  await allow(db);
  const t0 = Date.now();
  let err = await run(db);
  const c1 = await counts(db);
  step('First run commits; every table has exactly the expected rows', !err && diff(c1, expected).length === 0, err ?? `${Object.values(c1).reduce((a, b) => a + b, 0)} rows in ${Object.keys(c1).length} tables, ${Date.now() - t0} ms`);
  err = await run(db);
  const c2 = await counts(db);
  step('Second run is a no-op (idempotent, nothing overwritten)', !err && diff(c2, c1).length === 0, err ?? 'row counts unchanged');

  for (const [name, q] of integrityChecks({ placeholder: PLACEHOLDER, testAccountIds: [...testIds], seedUserIds: T.User.map((u) => u.id), platformAdminIds: T.User.filter((u) => u.platformRole === 'admin').map((u) => u.id) })) {
    const bad = (await db.query(q)).rows[0].bad;
    step(name, bad === 0, `${bad} violation(s)`);
  }

  let v = await verify(db);
  step(`post-seed-verify.sql reports every line ok (${v.rows.length} lines)`, v.failed.length === 0, v.failed.length ? v.failed.map((r) => r.check_name).join('; ') : 'all ok');
  await db.exec(`UPDATE "User" SET "passwordHash" = '$argon2id$dry-run-stand-in' WHERE id = ANY(ARRAY[${[...testIds].map((x) => `'${x}'`).join(', ')}])`);
  v = await verify(db);
  step('After provisioning the test accounts, verification still passes', v.failed.length === 0, v.failed.map((r) => r.check_name).join('; ') || 'all ok');
  await db.exec(`UPDATE "User" SET "passwordHash" = '$argon2id$dry-run-stand-in' WHERE id = 'talent-01'`);
  v = await verify(db);
  step('Verification flags a non-test account that has a usable password', v.failed.some((r) => /usable password/.test(r.check_name)), v.failed.map((r) => r.check_name).join('; ') || 'not flagged!');
  const roleRows = v.roles;

  const anchor = seed.meta.dates.anchorDate;
  const q1 = async (text) => (await db.query(text)).rows[0].n;
  const visibility = {
    organizations: await q1(`SELECT count(*)::int AS n FROM "Organization" WHERE "deletedAt" IS NULL`),
    jobsVisibleOnAnchorDay: await q1(`SELECT count(*)::int AS n FROM "Job" WHERE status = 'published' AND "closesOn" >= DATE '${anchor}'`),
    jobsVisibleToday: await q1(`SELECT count(*)::int AS n FROM "Job" WHERE status = 'published' AND "closesOn" >= CURRENT_DATE`),
    publicDirectoryEntries: await q1(`SELECT count(*)::int AS n FROM "Employee" WHERE "publicDirectory" AND status <> 'exited'`),
    publicHqAnnouncements: await q1(`SELECT count(*)::int AS n FROM "Announcement" WHERE audience = 'public-hq'`),
    upcomingEventsOnAnchorDay: await q1(`SELECT count(*)::int AS n FROM "CityEvent" WHERE "end" >= TIMESTAMP '${anchor} 00:00:00' AND "cancelledAt" IS NULL`),
    talentSearchable: await q1(`SELECT count(*)::int AS n FROM "CandidateProfile" p JOIN "User" u ON u.id = p."userId" WHERE p.visibility IN ('public','employers') AND u."onboardingComplete" AND u."deletedAt" IS NULL`),
    socialPeople: await q1(`SELECT count(*)::int AS n FROM "CandidateProfile" WHERE "profileDiscoverable"`),
  };

  const seedEmail = T.User.find((u) => u.id === seed.meta.testAccountIds.find((x) => x !== 'seed-platform-admin')).email;
  await refusal(
    'Aborts and writes nothing when a seed email belongs to an existing account',
    { before: (db2) => db2.exec(`INSERT INTO "User" (id, email, "passwordHash", "displayName", "accountType", "updatedAt") VALUES ('existing-real-user', '${seedEmail}', 'x', 'Existing person', 'candidate', now())`), baseline: { User: 1 } },
    /collide with existing accounts/,
  );
  await refusal(
    'Aborts and writes nothing when a seed organisation id belongs to a different organisation',
    { before: (db2) => db2.exec(`INSERT INTO "Organization" (id, name, "updatedAt") VALUES ('${T.Organization[0].id}', 'Someone else', now())`), baseline: { Organization: 1 } },
    /belong to other organisations/,
  );

  return { ran: true, engine: `PGlite (${version}, in-memory WebAssembly build)`, steps, visibility, roleRows };
}

// ── Report ──────────────────────────────────────────────────────────────────
const failed = checks.filter((c) => !c.ok).length + (dry.ran ? dry.steps.filter((s) => !s.ok).length : 0);
const m = seed.meta;
const lines = [];
const p = (s = '') => lines.push(s);
const total = Object.values(T).reduce((a, r) => a + r.length, 0);
p('# Seed package: validation report');
p();
p(`> Generated by \`frontend/seed-preparation/scripts/validate.mjs\`${dryRun ? ' `--dry-run`' : ''}. Do not edit by hand.`);
p();
p('## Result');
p();
p(failed === 0 ? `**All checks passed** (${checks.length} static checks${dry.ran ? `, ${dry.steps.length} dry-run steps` : ''}).` : `**${failed} check(s) failed.** See below.`);
p();
p(dry.ran
  ? `The SQL was executed against **${dry.engine}** with all ${schema.migrations.length} backend migrations applied. It has **not** been executed against a PostgreSQL server, staging or the Render database, and the backend API has not been run against the seeded data.`
  : `**The SQL has not been executed against any database** (${dry.reason}). Only the static checks below ran.`);
p();
p(`- Schema source: \`${m.schema.source}\` (${m.schema.migrations.length} migrations, latest \`${m.schema.migrations.at(-1)}\`)`);
p(`- Dates: mock today ${m.dates.mockToday}, anchor ${m.dates.anchorDate} (shift ${m.dates.shiftDays} days)`);
p(`- Rows: **${total}** in ${Object.keys(T).length} tables; accounts: ${T.User.length} (${testIds.size} test accounts)`);
p();
p('## Seeded rows by table');
p();
p('| Table | Rows |');
p('|---|--:|');
for (const t of order) p(`| ${t} | ${T[t].length} |`);
p();
p('Source dataset sizes (`seed-data.json` → `meta.counts.source`) and the reasons for every difference are in DATA_MAPPING.md.');
p();
p('## Employee persona identity');
p();
p(`Decision: **${identity.decision}** (record \`${identity.employeeRecord}\` ↔ account \`${identity.account}\`).`);
p();
for (const e of identity.evidence) p(`- ${e}`);
p();
if (identity.changes.length) {
  p('| Field | From | To |');
  p('|---|---|---|');
  for (const c of identity.changes) p(`| ${c.field} | ${c.from} | ${c.to} |`);
  p();
  p(`${identity.kept ?? ''} References rewritten: ${identity.rewrittenReferences.length} (${identity.rewrittenReferences.map((r) => r.split(':')[0]).join(', ')}).`);
  p();
}
p('## Duplicate applications');
p();
p('| Candidate | Vacancy | Kind | Kept | Dropped | Why the kept record |');
p('|---|---|---|---|---|---|');
for (const x of seed.report.applicationMerges) p(`| \`${x.candidateId}\` | \`${x.jobId}\` | ${x.classification} | \`${x.canonical.id}\` (${x.canonical.status}) | ${x.dropped.map((d) => `\`${d.id}\` (${d.status})`).join(', ')} | ${x.reason}${x.remappedReferences.length ? `; re-pointed: ${x.remappedReferences.join(', ')}` : ''} |`);
p();
p('Histories are never combined: the kept record keeps its own history, status and fit score.');
p();
p('## Rejected records');
p();
p('| Entity | Id | Reason |');
p('|---|---|---|');
for (const r of seed.report.rejected) p(`| ${r.entity} | \`${r.id}\` | ${r.reason} |`);
p();
p('## Warnings');
p();
p(seed.report.warnings.length ? seed.report.warnings.map((w) => `- ${w}`).join('\n') : 'None.');
p();
p('## Not migrated');
p();
p('| Entity | Mock records / total | Why |');
p('|---|--:|---|');
for (const u of seed.report.unsupported) p(`| ${u.entity} | ${u.count} | ${u.reason} |`);
p();
p('## Accounts and permissions');
p();
p(`Effective permissions come from the backend's own role matrix (\`backend/api/src/auth/permissions.ts\`). The baseline "employee" permissions are: ${[...BASELINE].map((x) => `\`${x}\``).join(', ')}.`);
p();
p('| Account | Organisation | Roles | Permissions beyond the employee baseline | Can sign in after provisioning |');
p('|---|---|---|---|---|');
for (const mm of [...MEM.values()].sort((a, b) => a.organizationId.localeCompare(b.organizationId) || a.userId.localeCompare(b.userId))) {
  const elevated = [...permsOf(mm.roles)].filter((x) => !BASELINE.has(x));
  p(`| \`${T.User.find((u) => u.id === mm.userId).email}\` | ${mm.organizationId} | ${mm.roles.join(', ')} | ${elevated.length ? elevated.join(', ') : '–'} | ${testIds.has(mm.userId) ? 'yes (test account)' : 'no (locked)'} |`);
}
p();
p(`Accounts without an organisation membership: ${T.User.filter((u) => !membershipsByUser.has(u.id)).length} (candidate, talent, social and platform accounts). Platform admin: ${T.User.filter((u) => u.platformRole === 'admin').map((u) => `\`${u.email}\``).join(', ')}.`);
p();
p('## Static checks');
p();
p('| Group | Check | Result |');
p('|---|---|---|');
for (const c of checks) p(`| ${c.group} | ${c.name} | ${c.ok ? 'Pass' : `**Fail** (${c.total})`} |`);
for (const c of checks.filter((x) => !x.ok)) {
  p();
  p(`### ${c.name}`);
  for (const x of c.problems) p(`- ${x}`);
  if (c.total > c.problems.length) p(`- … and ${c.total - c.problems.length} more`);
}
p();
p('## Dry run');
p();
if (!dry.ran) p(`Not run: ${dry.reason}`);
else {
  p(`Engine: ${dry.engine}. Each step uses a throwaway database, discarded after the run.`);
  p();
  p('| Step | Result | Detail |');
  p('|---|---|---|');
  for (const s of dry.steps) p(`| ${s.name} | ${s.ok ? 'Pass' : '**Fail**'} | ${String(s.detail).replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`);
  p();
  p('Database-level numbers that the API filters from (same filters as the backend services):');
  p();
  p('| Measure | Value |');
  p('|---|--:|');
  const labels = {
    organizations: 'Organisations (city HQs, public directory)',
    jobsVisibleOnAnchorDay: `Published vacancies still open on the anchor day (${m.dates.anchorDate})`,
    jobsVisibleToday: 'Published vacancies still open on the day this report was generated',
    publicDirectoryEntries: 'Public HQ directory entries (all organisations)',
    publicHqAnnouncements: 'Public HQ announcements',
    upcomingEventsOnAnchorDay: 'City events not ended on the anchor day',
    talentSearchable: 'Candidates in employer talent search',
    socialPeople: 'Discoverable people (including the demo candidate)',
  };
  for (const [k, val] of Object.entries(dry.visibility)) p(`| ${labels[k]} | ${val} |`);
}
p();
p('## File fingerprints');
p();
p('| File | SHA-256 |');
p('|---|---|');
files.forEach((f, i) => p(`| \`${relative(PACKAGE_DIR, f)}\` | \`${after[i]}\` |`));
p();
writeFileSync(OUTPUT.validationReport, lines.join('\n'));

console.log(`${failed === 0 ? 'PASS' : 'FAIL'}: ${checks.length} static checks${dry.ran ? ` + ${dry.steps.length} dry-run steps` : ' (no dry run)'} → ${relative(REPO_ROOT, OUTPUT.validationReport)}`);
for (const c of checks.filter((x) => !x.ok)) console.log(`  FAIL ${c.name}: ${c.problems[0]}`);
if (dry.ran) for (const s of dry.steps.filter((x) => !x.ok)) console.log(`  FAIL ${s.name}: ${s.detail}`);
process.exit(failed === 0 ? 0 : 1);
