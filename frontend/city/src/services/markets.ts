import { parseMarketSnapshot, type MarketSnapshot } from '@grooveli/frontend-domain/public';

/**
 * Market feed for the Global Markets billboard.
 *
 * - `MockMarketsAdapter` (default until the backend endpoint exists): fictional
 *   Grooveli fixture instruments whose prices are a deterministic function of
 *   time, so figures genuinely change between refreshes and stay consistent
 *   across reloads. Always flagged `simulated`.
 * - `HttpMarketsAdapter`: GETs the backend endpoint (docs/MARKETS_FEED_CONTRACT.md),
 *   validates the payload against the shared contract, sends no credentials.
 */
export interface MarketsAdapter {
  readonly kind: 'mock' | 'http';
  fetchSnapshot(signal?: AbortSignal): Promise<MarketSnapshot>;
}

// ------------------------------------------------------------------ mock

interface MockInstrument {
  symbol: string;
  name: string;
  base: number;
  /** Relative swing amplitude. */
  vol: number;
  currency: string;
  seed: number;
}

/** Fictional instruments (Grooveli fixture companies) — never real tickers in mock mode. */
export const MOCK_INSTRUMENTS: MockInstrument[] = [
  { symbol: 'GRO', name: 'Grooveli 50 Index', base: 4820, vol: 0.018, currency: 'PTS', seed: 11 },
  { symbol: 'KST', name: 'Kestrel Systems', base: 142.5, vol: 0.03, currency: 'NGN', seed: 23 },
  { symbol: 'ORB', name: 'Orbitwell Analytics', base: 88.2, vol: 0.035, currency: 'NGN', seed: 37 },
  { symbol: 'CPL', name: 'Copperleaf Finance', base: 64.9, vol: 0.025, currency: 'NGN', seed: 53 },
];

const BUCKET_S = 30;
const CHART_POINTS = 48;
const CHART_STEP_S = 60;
const REFERENCE_S = 6 * 3600;

function hash01(seed: number, n: number) {
  let x = (seed * 374761393 + n * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return (((x ^ (x >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}

/** Price of a mock instrument at a time (seconds): layered slow waves + per-bucket noise. */
export function mockPrice(i: MockInstrument, tSec: number): number {
  const s = i.seed;
  const wave = 0.6 * Math.sin(tSec / 5400 + s) + 0.3 * Math.sin(tSec / 1300 + s * 1.7) + 0.1 * Math.sin(tSec / 310 + s * 2.3);
  const noise = hash01(s, Math.floor(tSec / BUCKET_S)) * 0.08;
  return i.base * (1 + i.vol * (wave + noise));
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function mockSnapshot(now: Date): MarketSnapshot {
  const t = Math.floor(now.getTime() / 1000 / BUCKET_S) * BUCKET_S;
  const quotes = MOCK_INSTRUMENTS.map((i) => {
    const price = mockPrice(i, t);
    const ref = mockPrice(i, t - REFERENCE_S);
    const d = i.base >= 1000 ? 1 : 2;
    return { symbol: i.symbol, name: i.name, price: round(price, d), change: round(price - ref, d), changePct: round(((price - ref) / ref) * 100, 2), currency: i.currency };
  });
  const lead = MOCK_INSTRUMENTS[0]!;
  const points = Array.from({ length: CHART_POINTS }, (_, k) => {
    const ts = t - (CHART_POINTS - 1 - k) * CHART_STEP_S;
    return { t: new Date(ts * 1000).toISOString(), v: round(mockPrice(lead, ts), 1) };
  });
  return {
    asOf: new Date(t * 1000).toISOString(),
    delayedMinutes: 0,
    source: 'Grooveli demo feed',
    attribution: 'Simulated demo data — not real market prices',
    simulated: true,
    quotes,
    chart: { symbol: lead.symbol, points },
  };
}

export class MockMarketsAdapter implements MarketsAdapter {
  readonly kind = 'mock' as const;
  constructor(private readonly clock: () => Date = () => new Date()) {}
  async fetchSnapshot(): Promise<MarketSnapshot> {
    return mockSnapshot(this.clock());
  }
}

// ------------------------------------------------------------------ http

export class HttpMarketsAdapter implements MarketsAdapter {
  readonly kind = 'http' as const;
  constructor(
    private readonly url: string,
    private readonly timeoutMs = 8000,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}
  async fetchSnapshot(signal?: AbortSignal): Promise<MarketSnapshot> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const res = await this.fetchImpl(this.url, { method: 'GET', credentials: 'omit', headers: { Accept: 'application/json' }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`Market feed responded ${res.status}`);
      const snap = parseMarketSnapshot(await res.json());
      if (!snap) throw new Error('Market feed payload does not match the contract');
      return snap;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

/** Feed endpoint from config: absolute http(s) or a same-origin path; anything else is ignored. */
export function safeFeedUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  try {
    const u = new URL(v);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

export function createMarketsAdapter(feedUrl: string | null): MarketsAdapter {
  return feedUrl ? new HttpMarketsAdapter(feedUrl) : new MockMarketsAdapter();
}

// ------------------------------------------------------------------ board model (pure; drawn by the billboard)

export interface BoardRow {
  symbol: string;
  name: string;
  price: string;
  change: string;
  trend: 'up' | 'down' | 'flat';
}

export interface BoardModel {
  title: string;
  badge: string;
  rows: BoardRow[];
  chart: { symbol: string; last: string; high: string; low: string; trend: 'up' | 'down' | 'flat'; path: [number, number][] } | null;
  footer: string;
}

export function formatPrice(v: number): string {
  const digits = Math.abs(v) >= 1000 ? 1 : Math.abs(v) < 10 ? 4 : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const trendOf = (v: number): BoardRow['trend'] => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Turns a validated snapshot into exactly what the board shows (text, colours, normalised chart path). */
export function marketsBoardModel(s: MarketSnapshot, opts: { fallback?: boolean } = {}): BoardModel {
  const rows = s.quotes.slice(0, 4).map((q) => ({
    symbol: q.symbol,
    name: q.name,
    price: formatPrice(q.price),
    change: `${q.changePct > 0 ? '+' : ''}${q.changePct.toFixed(2)}%`,
    trend: trendOf(q.changePct),
  }));
  let chart: BoardModel['chart'] = null;
  if (s.chart && s.chart.points.length >= 2) {
    const vs = s.chart.points.map((p) => p.v);
    const hi = Math.max(...vs);
    const lo = Math.min(...vs);
    const span = hi - lo || 1;
    const n = vs.length - 1;
    chart = {
      symbol: s.chart.symbol,
      last: formatPrice(vs[n]!),
      high: formatPrice(hi),
      low: formatPrice(lo),
      trend: trendOf(vs[n]! - vs[0]!),
      // x 0..1 left→right, y 0..1 bottom→top
      path: vs.map((v, k) => [k / n, (v - lo) / span]),
    };
  }
  const when = `as of ${hhmm(s.asOf)}`;
  const footer = s.simulated
    ? `${opts.fallback ? 'Live feed unavailable · ' : ''}Simulated demo data · ${when}`
    : `${s.attribution || s.source} · ${s.delayedMinutes ? `delayed ${s.delayedMinutes} min` : 'real time'} · ${when}`;
  return { title: 'GLOBAL MARKETS', badge: s.simulated ? 'SIMULATED' : s.delayedMinutes ? `DELAYED ${s.delayedMinutes}M` : 'LIVE', rows, chart, footer };
}
