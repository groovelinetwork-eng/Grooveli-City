import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as Public from '@grooveli/frontend-domain/public';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe('city data boundary', () => {
  const src = files(join(__dirname, '..', 'src'));

  it('imports domain data only from the public entry point', () => {
    for (const f of src) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/from ['"]@grooveli\/frontend-domain['"]/);
      expect(text, f).not.toMatch(/frontend-domain\/src/);
    }
  });

  it('never reimplements payroll, HR or application submission', () => {
    for (const f of src) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/buildPayslipPreview|illustrativeTax|requestLeave|apply\(\s*jobId/);
    }
  });

  it('public payloads carry no private fields', () => {
    const json = JSON.stringify(Public.PUBLIC_HQS);
    for (const k of ['email', 'baseMonthly', 'documents', 'emergencyContact', 'fitScore', 'lifecycleTasks', 'members']) {
      expect(json).not.toContain(`"${k}"`);
    }
  });
});
