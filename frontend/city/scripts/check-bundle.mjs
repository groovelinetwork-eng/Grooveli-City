// Fails if private/HR/payroll markers appear in the built city bundle.
// Run after `vite build`: node scripts/check-bundle.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const FORBIDDEN = ['baseMonthly', 'payslip', 'expectedSalary', 'talent-', 'app-seed', 'mem-k-', 'emergencyContact', 'coverLetter', 'fitScore', 'bankOnFile', 'illustrativeTax', '@kestrel.example', '@amberline.example'];
let failed = false;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  const src = readFileSync(join(dir, f), 'utf8');
  for (const k of FORBIDDEN) {
    if (src.includes(k)) {
      console.error(`✗ ${f} contains forbidden marker "${k}"`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log('✓ city bundle contains no private HR/payroll/applicant markers');
