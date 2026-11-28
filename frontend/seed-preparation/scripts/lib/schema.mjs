/**
 * Reads the backend's database schema from its Prisma migration SQL
 * (backend/api/prisma/migrations/*\/migration.sql), read-only.
 *
 * The migrations are the authoritative description of the database that the
 * seed is inserted into: column types, NOT NULL, defaults, enums, primary
 * keys, unique indexes and foreign keys. OpenAPI models are NOT used here,
 * because API response shapes do not map one-to-one onto tables.
 *
 * Handles the statement forms Prisma emits: CREATE TYPE … AS ENUM,
 * CREATE TABLE, ALTER TABLE … ADD COLUMN / DROP COLUMN / ADD CONSTRAINT …
 * FOREIGN KEY, CREATE UNIQUE INDEX. Anything else that changes columns is
 * reported in `unhandled` so the validator can fail loudly.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const unquoteList = (s) => s.split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean);

function parseColumn(def) {
  // def: `TEXT NOT NULL DEFAULT 'x'` | `"OrgRole"[]` | `DOUBLE PRECISION NOT NULL` | `TIMESTAMP(3)`
  const notNull = /\bNOT NULL\b/.test(def);
  const hasDefault = /\bDEFAULT\b/.test(def);
  const typeStr = def.replace(/\s+NOT NULL.*$/, '').replace(/\s+DEFAULT\b.*$/, '').trim();
  const isArray = typeStr.endsWith('[]');
  const base = typeStr.replace(/\[\]$/, '').replace(/^"|"$/g, '');
  return { type: base, isArray, notNull, hasDefault, raw: def };
}

export function loadSchema(migrationsDir) {
  const enums = {};
  const tables = {};
  const unhandled = [];
  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const table = (name) => (tables[name] ??= { name, columns: {}, primaryKey: [], uniques: [], foreignKeys: [] });

  for (const dir of migrations) {
    const sql = readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8');
    const statements = sql
      .split(/;[ \t]*(?:\r?\n|$)/)
      .map((s) => s.replace(/^[ \t]*--.*$/gm, '').trim())
      .filter(Boolean);

    for (const st of statements) {
      let m;
      if ((m = st.match(/^CREATE TYPE "(\w+)" AS ENUM \(([\s\S]*)\)$/))) {
        enums[m[1]] = [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]);
      } else if ((m = st.match(/^CREATE TABLE "(\w+)" \(([\s\S]*)\)$/))) {
        const t = table(m[1]);
        for (const rawLine of m[2].split(/\r?\n/)) {
          const line = rawLine.trim().replace(/,$/, '');
          if (!line) continue;
          let c;
          if ((c = line.match(/^"(\w+)"\s+(.+)$/))) t.columns[c[1]] = parseColumn(c[2]);
          else if ((c = line.match(/^CONSTRAINT "\w+" PRIMARY KEY \(([^)]*)\)$/))) t.primaryKey = unquoteList(c[1]);
          else unhandled.push(`${dir}: CREATE TABLE ${m[1]}: ${line}`);
        }
      } else if ((m = st.match(/^ALTER TABLE "(\w+)"\s+([\s\S]*)$/))) {
        const t = table(m[1]);
        const fk = m[2].match(/^ADD CONSTRAINT "(\w+)" FOREIGN KEY \(([^)]*)\) REFERENCES "(\w+)"\(([^)]*)\)(.*)$/s);
        if (fk) {
          t.foreignKeys.push({ name: fk[1], columns: unquoteList(fk[2]), references: fk[3], referencedColumns: unquoteList(fk[4]), rule: fk[5].trim() });
          continue;
        }
        for (const rawLine of m[2].split(/\r?\n/)) {
          const line = rawLine.trim().replace(/,$/, '');
          if (!line) continue;
          let c;
          if ((c = line.match(/^ADD COLUMN\s+"(\w+)"\s+(.+)$/))) t.columns[c[1]] = parseColumn(c[2]);
          else if ((c = line.match(/^DROP COLUMN\s+"(\w+)"$/))) delete t.columns[c[1]];
          else unhandled.push(`${dir}: ALTER TABLE ${m[1]}: ${line}`);
        }
      } else if ((m = st.match(/^CREATE UNIQUE INDEX "(\w+)" ON "(\w+)"\(([^)]*)\)$/))) {
        table(m[2]).uniques.push({ name: m[1], columns: unquoteList(m[3]) });
      } else if (/^CREATE INDEX\b/.test(st)) {
        // non-unique index: irrelevant to seeding
      } else {
        unhandled.push(`${dir}: ${st.slice(0, 120)}`);
      }
    }
  }

  for (const t of Object.values(tables)) {
    for (const col of Object.values(t.columns)) col.enum = enums[col.type] ? col.type : null;
  }
  return { migrations, enums, tables, unhandled };
}

/** Required = NOT NULL without a database default (Prisma's @default(cuid()) and @updatedAt are client-side). */
export const isRequired = (col) => col.notNull && !col.hasDefault;

/** Parent-before-child order for the given tables, following real foreign keys only. */
export function insertionOrder(schema, tableNames) {
  const wanted = new Set(tableNames);
  const order = [];
  const state = new Map();
  const visit = (name, path) => {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') throw new Error(`Foreign-key cycle: ${[...path, name].join(' → ')}`);
    state.set(name, 'visiting');
    for (const fk of schema.tables[name]?.foreignKeys ?? []) {
      if (wanted.has(fk.references) && fk.references !== name) visit(fk.references, [...path, name]);
    }
    state.set(name, 'done');
    order.push(name);
  };
  for (const n of [...tableNames].sort()) visit(n, []);
  return order;
}
