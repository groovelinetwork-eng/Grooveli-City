/**
 * Renders seed rows as PostgreSQL INSERT statements, formatting each value by
 * the column's real type from the migrations (see schema.mjs).
 *
 * Values are written as untyped literals; PostgreSQL coerces them to the
 * target column types in INSERT … VALUES (text, enums, arrays, jsonb, dates).
 * A value of the form { $sql: "<expression>" } is emitted verbatim; it is
 * used only for values generated at execution time (invitation token hashes).
 */
export const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

const arrayElement = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const pgArray = (values) => `{${values.map(arrayElement).join(',')}}`;

const isoToTimestamp = (iso) => {
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d{1,3})?Z$/);
  if (!m) throw new Error(`Not an ISO-8601 UTC timestamp: ${iso}`);
  return `${m[1]} ${m[2]}${(m[3] ?? '.000').padEnd(4, '0')}`;
};

export function formatValue(value, col, where) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object' && !Array.isArray(value) && typeof value.$sql === 'string' && col.type !== 'JSONB') return value.$sql;
  if (col.isArray) {
    if (!Array.isArray(value)) throw new Error(`${where}: expected an array`);
    return quote(pgArray(value));
  }
  switch (col.type) {
    case 'TEXT':
      return quote(value);
    case 'INTEGER':
    case 'DOUBLE PRECISION':
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${where}: expected a number`);
      return String(value);
    case 'BOOLEAN':
      return value ? 'TRUE' : 'FALSE';
    case 'TIMESTAMP(3)':
      return quote(isoToTimestamp(value));
    case 'DATE':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${where}: expected YYYY-MM-DD, got ${value}`);
      return quote(value);
    case 'JSONB':
      return quote(JSON.stringify(value));
    default:
      if (col.enum) return quote(value);
      throw new Error(`${where}: unsupported column type ${col.type}`);
  }
}

/** One multi-row INSERT per chunk; ON CONFLICT DO NOTHING keeps re-runs idempotent and never overwrites. */
export function renderInserts(schema, tableName, rows, chunkSize = 200) {
  const t = schema.tables[tableName];
  if (!t) throw new Error(`Unknown table ${tableName}`);
  if (!rows.length) return '';
  const columns = Object.keys(t.columns).filter((c) => rows.some((r) => r[c] !== undefined));
  const out = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = chunk.map((row, j) => {
      for (const key of Object.keys(row)) if (!t.columns[key]) throw new Error(`${tableName}: unknown column "${key}"`);
      // A missing key would become NULL and silently override a database default.
      for (const c of columns) if (row[c] === undefined) throw new Error(`${tableName}[${i + j}]: missing value for "${c}" (rows of one table must share the same columns)`);
      return `  (${columns.map((c) => formatValue(row[c], t.columns[c], `${tableName}[${i + j}].${c}`)).join(', ')})`;
    });
    out.push(`INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES\n${values.join(',\n')}\nON CONFLICT DO NOTHING;`);
  }
  return out.join('\n\n');
}
