/**
 * Writes the contract to backend/api/openapi/ so it can be reviewed in Git,
 * shared with the frontend and fed to client generators:
 *   openapi.json, openapi.yaml, ENDPOINTS.md
 * Run: pnpm --filter @grooveli/api openapi:export
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dump } from 'js-yaml';
import { buildOpenApiDocument, endpointTable } from './document';
import { routes } from './routes';

const outDir = join(__dirname, '..', '..', 'openapi');
mkdirSync(outDir, { recursive: true });

const doc = buildOpenApiDocument();
writeFileSync(join(outDir, 'openapi.json'), JSON.stringify(doc, null, 2) + '\n');
writeFileSync(join(outDir, 'openapi.yaml'), dump(doc, { noRefs: true, lineWidth: 140 }));

const added = routes.filter((r) => r.added).length;
writeFileSync(
  join(outDir, 'ENDPOINTS.md'),
  [
    '# Grooveli City API — endpoint list',
    '',
    '> Generated from `src/openapi/routes.ts` by `pnpm openapi:export`. Do not edit by hand.',
    '',
    `Base URL: \`/api/v1\`. **${routes.length} operations**, of which **${added}** are marked **[added]** (not in the frontend's original list; added for production).`,
    'Interactive docs: run the API and open `/api/docs`.',
    endpointTable(),
    '',
  ].join('\n'),
);

console.log(`Wrote ${routes.length} operations to ${outDir}`);
