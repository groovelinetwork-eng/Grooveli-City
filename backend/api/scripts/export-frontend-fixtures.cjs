// Snapshots the frontend's demo data (frontend/domain/src) into
// prisma/seed/frontend-fixtures.json for the demo seed. Re-run after the
// frontend team changes their fixtures:
//   pnpm --filter @grooveli/api seed:export
const { join: joinPath } = require('node:path');
const { readdirSync } = require('node:fs');
/** esbuild ships with the frontend toolchain (Vite); use that copy from the workspace store. */
function loadEsbuild() {
  try {
    return require('esbuild');
  } catch {
    const store = joinPath(__dirname, '..', '..', '..', 'node_modules', '.pnpm');
    const dir = readdirSync(store).filter((d) => d.startsWith('esbuild@')).sort().pop();
    if (!dir) throw new Error('esbuild not found: run pnpm install at the repo root');
    return require(joinPath(store, dir, 'node_modules', 'esbuild'));
  }
}
const { build } = loadEsbuild();
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', '..', '..');
const entry = join(root, 'frontend', 'domain', 'src', 'index.ts');
const outFile = join(__dirname, '..', 'prisma', 'seed', 'frontend-fixtures.json');

(async () => {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'error',
    nodePaths: [join(root, 'frontend', 'domain', 'node_modules'), join(root, 'node_modules')],
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require);
  const d = mod.exports;

  const snapshot = {
    demoToday: d.DEMO_TODAY,
    personas: d.PERSONAS,
    employeePersonaId: d.EMPLOYEE_PERSONA_ID,
    organizations: d.ORGANIZATIONS,
    workspaces: d.WORKSPACES,
    jobs: d.JOBS,
    employees: d.ORG_EMPLOYEES,
    hr: d.ORG_HR,
    payComponents: d.PAY_COMPONENTS,
    compensationStructures: d.COMPENSATION_STRUCTURES,
    leaveAllowance: d.LEAVE_ALLOWANCE,
    talentPool: d.TALENT_POOL,
    applications: d.SEED_APPLICATIONS,
    interviews: d.SEED_INTERVIEWS,
    assessments: d.SEED_ASSESSMENTS,
    shortlists: d.SEED_SHORTLISTS,
    demoCandidate: d.DEMO_CANDIDATE,
    events: d.CITY_EVENTS,
    communities: d.COMMUNITIES,
    socialProfiles: d.SOCIAL_PROFILES,
    announcements: d.SEED_ANNOUNCEMENTS,
    recognition: d.SEED_RECOGNITION,
    surveys: d.SEED_SURVEYS,
    feedback: d.SEED_FEEDBACK,
    activities: d.SEED_ACTIVITIES,
    initiatives: d.SEED_INITIATIVES,
  };
  const missing = Object.entries(snapshot).filter(([, v]) => v === undefined).map(([k]) => k);
  if (missing.length) throw new Error(`Fixtures not exported by frontend/domain: ${missing.join(', ')}`);
  mkdirSync(join(outFile, '..'), { recursive: true });
  writeFileSync(outFile, JSON.stringify(snapshot, null, 1) + '\n');
  const counts = Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v === 'object' ? Object.keys(v).length : v]));
  console.log('Wrote', outFile, counts);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
