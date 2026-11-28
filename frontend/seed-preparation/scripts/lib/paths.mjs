import { register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const PACKAGE_DIR = resolve(here, '..', '..');
export const REPO_ROOT = resolve(PACKAGE_DIR, '..', '..');
export const DOMAIN_SRC = join(REPO_ROOT, 'frontend', 'domain', 'src');
export const WEB_STATE = join(REPO_ROOT, 'frontend', 'web', 'src', 'lib', 'store', 'state.ts');
export const MIGRATIONS_DIR = join(REPO_ROOT, 'backend', 'api', 'prisma', 'migrations');
export const OUTPUT = {
  seedData: join(PACKAGE_DIR, 'seed-data.json'),
  seedSql: join(PACKAGE_DIR, 'seed.sql'),
  idMapping: join(PACKAGE_DIR, 'ID_MAPPING.json'),
  verifySql: join(PACKAGE_DIR, 'post-seed-verify.sql'),
  apiChecklist: join(PACKAGE_DIR, 'POST_SEED_API_CHECKLIST.md'),
  validationReport: join(PACKAGE_DIR, 'VALIDATION_REPORT.md'),
};
export const OPENAPI = join(REPO_ROOT, 'backend', 'api', 'openapi', 'openapi.json');
export const BACKEND_PERMISSIONS = join(REPO_ROOT, 'backend', 'api', 'src', 'auth', 'permissions.ts');

/** Fails early with a clear message on Node versions without TypeScript type stripping. */
export function requireTypeStripping() {
  if (!process.features?.typescript) {
    console.error(
      'This script imports the frontend mock data (TypeScript) directly and needs Node with built-in type stripping:\n' +
        'Node 22.18+, 23.6+ or 24+. Current: ' + process.version,
    );
    process.exit(1);
  }
  // web/package.json has no "type" field, so Node warns while reparsing state.ts as ESM. Harmless here;
  // replace the default warning printer with one that skips only that warning.
  process.removeAllListeners('warning');
  process.on('warning', (w) => {
    if (w.code === 'MODULE_TYPELESS_PACKAGE_JSON') return;
    console.warn(`${w.name}: ${w.message}`);
  });
}

/** Imports the frontend's mock-data sources (read-only). */
export async function loadMockSources() {
  register('./ts-resolve-hooks.mjs', import.meta.url, {
    data: {
      aliases: {
        '@grooveli/frontend-domain': join(DOMAIN_SRC, 'index.ts'),
        '@grooveli/frontend-domain/public': join(DOMAIN_SRC, 'public.ts'),
      },
    },
  });
  const domain = await import(pathToFileURL(join(DOMAIN_SRC, 'index.ts')).href);
  const { createInitialState } = await import(pathToFileURL(WEB_STATE).href);
  return { domain, state: createInitialState() };
}
