import { HttpStatus, Injectable } from '@nestjs/common';
import { APP_NAME, APP_VERSION } from '@grooveli/shared';
import { ApiError } from './common/api-exception.filter';

type Check = () => Promise<void>;

@Injectable()
export class AppService {
  /** Dependency checks registered by modules (database, cache, storage…). */
  private readonly checks = new Map<string, Check>();

  registerReadinessCheck(name: string, check: Check) {
    this.checks.set(name, check);
  }

  getStatus() {
    return { name: APP_NAME, version: APP_VERSION, status: 'running', timestamp: new Date().toISOString() };
  }

  health() {
    return { status: 'ok' as const, version: APP_VERSION, timestamp: new Date().toISOString() };
  }

  async readiness() {
    const results: Record<string, 'ok' | 'down'> = {};
    await Promise.all(
      [...this.checks].map(async ([name, check]) => {
        try {
          await check();
          results[name] = 'ok';
        } catch {
          results[name] = 'down';
        }
      }),
    );
    if (Object.values(results).includes('down')) {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', `Not ready: ${JSON.stringify(results)}`);
    }
    return { ...this.health(), checks: results };
  }
}
