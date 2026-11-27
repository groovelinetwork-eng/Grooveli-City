import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { createHash } from 'node:crypto';
import { ApiError } from '../common/api-exception.filter';
import { env } from '../config/env';

// OWASP-recommended Argon2id parameters (19 MiB, 2 iterations).
const OPTIONS = { algorithm: 2 /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 };

@Injectable()
export class PasswordService {
  private readonly logger = new Logger('Password');
  /** Verified against when the email does not exist, so timing doesn't reveal accounts. */
  private dummyHash: Promise<string> = hash('grooveli-dummy-password', OPTIONS);

  hash(password: string) {
    return hash(password, OPTIONS);
  }

  async verify(passwordHash: string | null, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash ?? (await this.dummyHash), password);
    } catch {
      return false;
    }
  }

  /**
   * Rejects passwords found in known breaches, using the Have I Been Pwned
   * range API (k-anonymity: only the first 5 hex chars of the SHA-1 leave the
   * server). Fails open if the service is unreachable. On by default in
   * production; set PASSWORD_BREACH_CHECK=false to disable.
   */
  async assertNotBreached(password: string): Promise<void> {
    if (!env().breachCheck) return;
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'grooveli-api' },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return;
      const body = await res.text();
      const found = body.split('\n').some((line) => {
        const [s, count] = line.trim().split(':');
        return s === suffix && Number(count) > 0;
      });
      if (found) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'This password has appeared in a data breach. Please choose another.', {
          password: 'Found in a known data breach',
        });
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      this.logger.warn(`Breach check skipped: ${(err as Error).message}`);
    }
  }
}
