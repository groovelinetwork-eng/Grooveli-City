import type { DataService } from './contracts';

export class ApiNotAvailableError extends Error {
  constructor(public readonly operation: string, cause?: unknown) {
    super(
      `Backend API is not available for "${operation}". The app is configured for api mode, but NestJS endpoints ` +
        'for these proposed contracts do not exist yet. No mock fallback is used.',
    );
    this.name = 'ApiNotAvailableError';
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * HTTP adapter for `api` mode. Every service operation maps to
 * POST {apiUrl}/{group}/{operation} following the PROPOSED contracts in
 * docs/INTEGRATION_CONTRACTS.md. Requests use credentials: 'include' so a
 * backend-owned cookie session can work; no tokens are stored client-side.
 * Failures surface as ApiNotAvailableError — never a silent mock fallback.
 */
export function createHttpService(apiUrl: string): DataService {
  const base = apiUrl.replace(/\/$/, '');
  return new Proxy({} as DataService, {
    get(_t, group: string) {
      return new Proxy(
        {},
        {
          get(_g, operation: string) {
            return async (...args: unknown[]) => {
              const op = `${group}.${operation}`;
              let res: Response;
              try {
                res = await fetch(`${base}/${group}/${operation}`, {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ args }),
                });
              } catch (err) {
                throw new ApiNotAvailableError(op, err);
              }
              if (!res.ok) throw new ApiNotAvailableError(`${op} (HTTP ${res.status})`);
              const body = (await res.json()) as { data: unknown };
              return body.data;
            };
          },
        },
      );
    },
  });
}
