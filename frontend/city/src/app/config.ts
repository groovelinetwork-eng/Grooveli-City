export type DataMode = 'mock' | 'api';

function mode(): DataMode {
  const raw = import.meta.env.VITE_DATA_MODE ?? 'mock';
  if (raw !== 'mock' && raw !== 'api') throw new Error(`Invalid VITE_DATA_MODE "${raw}"`);
  return raw;
}

/**
 * Validates an external destination from configuration: absolute http(s) only,
 * no embedded credentials. Anything else is treated as "not configured".
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

export const cityConfig = {
  /** Canonical web app origin for business workflows. */
  webUrl: (import.meta.env.VITE_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  dataMode: mode(),
  /** Market charts page for the Global Markets billboard; null until a destination is approved and configured. */
  marketsUrl: safeExternalUrl(import.meta.env.VITE_MARKETS_URL),
} as const;
