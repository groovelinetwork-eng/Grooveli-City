import { z } from 'zod';

/**
 * Market feed contract for the city's Global Markets billboard.
 * The backend endpoint (see docs/MARKETS_FEED_CONTRACT.md) must return a
 * payload matching `marketSnapshotSchema`; the city validates every response
 * and never trusts unvalidated data. Prices are display-only (no trading).
 */
const isoDateTime = z.string().datetime({ offset: true });
const finite = z.number().finite();

export const marketQuoteSchema = z.object({
  /** Display ticker, e.g. "NGXASI", "USD/NGN". */
  symbol: z.string().regex(/^[A-Za-z0-9.^=/_-]{1,16}$/),
  name: z.string().min(1).max(60),
  price: finite,
  /** Absolute change vs the reference (previous close / session open). */
  change: finite,
  /** Percentage change, e.g. 0.42 means +0.42 %. */
  changePct: finite,
  currency: z.string().max(8),
});

export const marketPointSchema = z.object({ t: isoDateTime, v: finite });

export const marketSnapshotSchema = z.object({
  /** When the figures were valid (provider timestamp, not fetch time). */
  asOf: isoDateTime,
  /** Provider delay in minutes (0 = real time). */
  delayedMinutes: z.number().int().min(0).max(1440),
  /** Provider name. */
  source: z.string().min(1).max(80),
  /** Credit line the licence requires on screen. */
  attribution: z.string().max(140),
  /** True for demo/mock data; the board then labels everything as simulated. */
  simulated: z.boolean().default(false),
  quotes: z.array(marketQuoteSchema).min(1).max(8),
  /** Intraday series for the board's chart (optional). */
  chart: z
    .object({
      symbol: z.string().regex(/^[A-Za-z0-9.^=/_-]{1,16}$/),
      points: z.array(marketPointSchema).min(2).max(500),
    })
    .nullable()
    .default(null),
});

export type MarketQuote = z.infer<typeof marketQuoteSchema>;
export type MarketSnapshot = z.infer<typeof marketSnapshotSchema>;

/** Validates an untrusted payload; returns null when it doesn't match the contract. */
export function parseMarketSnapshot(raw: unknown): MarketSnapshot | null {
  const r = marketSnapshotSchema.safeParse(raw);
  return r.success ? r.data : null;
}
