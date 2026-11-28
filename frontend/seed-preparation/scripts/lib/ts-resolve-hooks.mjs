/**
 * Module-resolution hooks so plain Node (with built-in TypeScript type
 * stripping) can import the frontend's mock-data sources directly:
 *  - extensionless relative imports (`./types`) resolve to `.ts` / `index.ts`
 *  - the workspace alias `@grooveli/frontend-domain` resolves to its sources
 * Read-only: nothing is compiled to disk.
 */
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

let aliases = {};

export function initialize(data) {
  aliases = data?.aliases ?? {};
}

const isFile = (p) => existsSync(p) && statSync(p).isFile();

// The mock sources are ES modules; saying so up front skips Node's CommonJS-first
// detection (and its warning) for packages without "type": "module" (frontend/web).
const hit = (url) => ({ url, shortCircuit: true, ...(url.endsWith('.ts') ? { format: 'module-typescript' } : {}) });

export async function resolve(specifier, context, next) {
  if (aliases[specifier]) return hit(pathToFileURL(aliases[specifier]).href);
  if (specifier.startsWith('file:') && specifier.endsWith('.ts')) return hit(specifier);
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const p = fileURLToPath(new URL(specifier, context.parentURL));
    for (const candidate of [p, `${p}.ts`, `${p}/index.ts`]) {
      if (isFile(candidate)) return hit(pathToFileURL(candidate).href);
    }
  }
  return next(specifier, context);
}
