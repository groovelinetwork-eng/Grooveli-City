#!/usr/bin/env node
/**
 * Gives the designated TEST accounts a password after seed.sql has run. For
 * the BACKEND TEAM, in a development or staging database they have verified.
 *
 * Seeded accounts are created locked (a placeholder hash that can never
 * verify). This script hashes a password you supply at run time with the
 * backend's own library and parameters (@node-rs/argon2, Argon2id m=19456
 * t=2 p=1, as in backend/api/src/auth/password.service.ts), one salt per
 * account, and stores it. Only the test accounts listed in ID_MAPPING.json
 * (one per role) can be provisioned: every other seeded account stays locked.
 * Only accounts that still have the placeholder are touched, so a password
 * someone has already set is never changed.
 *
 * The password is read from SEED_ACCOUNT_PASSWORD and never printed or
 * written to a file. Never commit it.
 *
 *   node frontend/seed-preparation/scripts/provision-accounts.mjs --list
 *       lists the test accounts (no database, no password)
 *
 *   SEED_ALLOW=development SEED_TARGET_DATABASE=<db name> SEED_ACCOUNT_PASSWORD='…' DATABASE_URL='…' \
 *     node frontend/seed-preparation/scripts/provision-accounts.mjs
 *       updates the database through backend/api's Prisma client (needs `pnpm install`)
 *
 *   SEED_ALLOW=development SEED_TARGET_DATABASE=<db name> SEED_ACCOUNT_PASSWORD='…' \
 *     node frontend/seed-preparation/scripts/provision-accounts.mjs --sql | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
 *       prints an UPDATE script instead (pipe it straight into psql; do not save it)
 *
 * SEED_TARGET_DATABASE is the name of the database you verified; the script
 * refuses to touch a database with any other name.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { OUTPUT, REPO_ROOT } from './lib/paths.mjs';
import { quote } from './lib/sql.mjs';

// Keep identical to backend/api/src/auth/password.service.ts.
const ARGON2_OPTIONS = { algorithm: 2 /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 };

const flags = new Set(process.argv.slice(2));
const seed = JSON.parse(readFileSync(OUTPUT.seedData, 'utf8'));
const mapping = JSON.parse(readFileSync(OUTPUT.idMapping, 'utf8'));
const PLACEHOLDER = seed.meta.passwordHashPlaceholder;
const seededIds = new Set(seed.tables.User.map((u) => u.id));
const targets = mapping.testAccounts.map((t) => ({ userId: t.userId, email: t.email, role: t.role }));

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
for (const f of flags) if (!['--list', '--sql'].includes(f)) fail(`Unknown option ${f}. Only the test accounts can be provisioned.`);

if (flags.has('--list')) {
  console.log(`${targets.length} test account(s) can be provisioned (every other seeded account stays locked):`);
  for (const t of targets) console.log(`  ${t.email.padEnd(40)} ${t.role}`);
  process.exit(0);
}

if (process.env.SEED_ALLOW !== 'development') fail('Refused: set SEED_ALLOW=development to confirm this is a development or staging database.');
if (process.env.NODE_ENV === 'production') fail('Refused: NODE_ENV=production.');
const targetDb = process.env.SEED_TARGET_DATABASE ?? '';
if (!/^[\w.-]{1,63}$/.test(targetDb)) fail('Set SEED_TARGET_DATABASE to the name of the database you verified.');
const password = process.env.SEED_ACCOUNT_PASSWORD ?? '';
if (password.length < 12) fail('Set SEED_ACCOUNT_PASSWORD (at least 12 characters). It is never printed or stored in plain text.');
for (const t of targets) if (!seededIds.has(t.userId)) fail(`Not a seeded account: ${t.userId}`);

const backendRequire = createRequire(join(REPO_ROOT, 'backend', 'api', 'package.json'));
const load = (name, override) => {
  try {
    return override ? createRequire(import.meta.url)(override) : backendRequire(name);
  } catch {
    fail(`Cannot load ${name} from backend/api. Run \`pnpm install\` at the repository root first.`);
  }
};
const { hash } = load('@node-rs/argon2', process.env.ARGON2_MODULE);

if (flags.has('--sql')) {
  const out = [
    '-- Grooveli seed: test-account provisioning. Contains password hashes: pipe into psql, do not save.',
    'BEGIN;',
    'DO $guard$',
    'BEGIN',
    `  IF current_database() <> ${quote(targetDb)} THEN`,
    "    RAISE EXCEPTION 'Provisioning refused: connected to %, not the verified database.', current_database();",
    '  END IF;',
    'END',
    '$guard$;',
  ];
  for (const t of targets) {
    out.push(`UPDATE "User" SET "passwordHash" = ${quote(await hash(password, ARGON2_OPTIONS))}, "updatedAt" = now() WHERE id = ${quote(t.userId)} AND "passwordHash" = ${quote(PLACEHOLDER)};`);
  }
  out.push('COMMIT;', '');
  process.stdout.write(out.join('\n'));
  console.error(`Provisioning SQL for ${targets.length} test account(s) written to stdout.`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) fail('Set DATABASE_URL (development or staging database only).');
let urlDb = '';
try {
  urlDb = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
} catch {
  fail('DATABASE_URL is not a valid URL.');
}
if (urlDb !== targetDb) fail(`Refused: DATABASE_URL points at database "${urlDb}", not SEED_TARGET_DATABASE "${targetDb}".`);
const { PrismaClient } = load('@prisma/client');
const prisma = new PrismaClient();
let updated = 0;
try {
  const [{ current_database: connected }] = await prisma.$queryRawUnsafe('SELECT current_database()');
  if (connected !== targetDb) fail(`Refused: connected to "${connected}", not "${targetDb}".`);
  for (const t of targets) {
    const r = await prisma.user.updateMany({ where: { id: t.userId, passwordHash: PLACEHOLDER }, data: { passwordHash: await hash(password, ARGON2_OPTIONS) } });
    updated += r.count;
    console.log(`${r.count ? 'provisioned' : 'skipped (missing or already has a password)'}  ${t.email}`);
  }
} finally {
  await prisma.$disconnect();
}
console.log(`${updated} of ${targets.length} test account(s) provisioned.`);
