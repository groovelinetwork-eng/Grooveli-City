/**
 * Public runtime configuration. Everything here ships to the browser — never
 * place secrets in NEXT_PUBLIC_* variables.
 */
export type DataMode = 'mock' | 'api';

function readMode(): DataMode {
  const raw = process.env.NEXT_PUBLIC_DATA_MODE ?? 'mock';
  if (raw !== 'mock' && raw !== 'api') {
    throw new Error(`Invalid NEXT_PUBLIC_DATA_MODE "${raw}" — expected "mock" or "api".`);
  }
  return raw;
}

export const config = {
  dataMode: readMode(),
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api',
  cityUrl: process.env.NEXT_PUBLIC_CITY_URL ?? '/city/',
  /** Simulated latency for mock adapters so loading states are exercised. */
  mockLatencyMs: process.env.NODE_ENV === 'test' ? 0 : 250,
} as const;
