import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');
const cityRoot = resolve(webRoot, '../city');
const cityDist = resolve(cityRoot, 'dist');
const webPublicCity = resolve(webRoot, 'public/city');

console.log('📦 Preparing 3D City static bundle for Next.js...');

try {
  console.log('🔨 Building @grooveli/city...');
  execSync('pnpm --filter @grooveli/city build', {
    cwd: resolve(webRoot, '../..'),
    stdio: 'inherit',
  });
} catch (err) {
  console.warn('⚠️ Building directly inside city directory...', err);
  execSync('npx vite build', {
    cwd: cityRoot,
    stdio: 'inherit',
  });
}

if (!existsSync(cityDist)) {
  console.error(`❌ City dist not found at ${cityDist}`);
  process.exit(1);
}

// Copy city dist to frontend/web/public/city
mkdirSync(resolve(webRoot, 'public'), { recursive: true });
rmSync(webPublicCity, { recursive: true, force: true });
cpSync(cityDist, webPublicCity, { recursive: true });

console.log('✅ 3D City successfully bundled into frontend/web/public/city');

