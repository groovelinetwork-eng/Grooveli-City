import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ApiError } from '../common/api-exception.filter';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/** Refetch at most this often; the provider updates daily. */
const REFRESH_MS = 30 * 60 * 1000;
const CHART_DAYS = 30;
const PAIRS = [
  { base: 'USD', name: 'US dollar / naira' },
  { base: 'GBP', name: 'British pound / naira' },
  { base: 'EUR', name: 'Euro / naira' },
] as const;

/** https://www.exchangerate-api.com/docs/free — free, no key, attribution required. */
const OpenErApiResponse = z.object({
  result: z.literal('success'),
  time_last_update_unix: z.number().int(),
  rates: z.record(z.string(), z.number().positive()),
});

export type FetchJson = (url: string) => Promise<unknown>;

/**
 * Global Markets billboard data (display only — no trading). Live FX rates
 * against the naira. Equity indices need a licensed market-data provider
 * (open product decision) and are not included.
 */
@Injectable()
export class MarketsService {
  private readonly logger = new Logger('Markets');
  private cache: { at: number; data: unknown } | null = null;
  /** Overridable in tests. */
  fetchJson: FetchJson = async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  constructor(private readonly prisma: PrismaService) {}

  async snapshot() {
    if (env().MARKETS_PROVIDER !== 'open-er-api') {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', 'Market data is not configured');
    }
    if (this.cache && Date.now() - this.cache.at < REFRESH_MS) return this.cache.data;

    try {
      await this.refresh();
    } catch (err) {
      // Serve the last stored rates if the provider is down.
      this.logger.warn(`Market data refresh failed: ${(err as Error).message}`);
    }
    const data = await this.build();
    if (!data) throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', 'Market data is temporarily unavailable');
    this.cache = { at: Date.now(), data };
    return data;
  }

  private async refresh() {
    for (const p of PAIRS) {
      const body = OpenErApiResponse.parse(await this.fetchJson(`https://open.er-api.com/v6/latest/${p.base}`));
      const ngn = body.rates.NGN;
      if (!ngn) throw new Error(`No NGN rate for ${p.base}`);
      const asOf = new Date(body.time_last_update_unix * 1000);
      const date = new Date(`${asOf.toISOString().slice(0, 10)}T00:00:00Z`);
      const symbol = `${p.base}/NGN`;
      await this.prisma.marketRate.upsert({
        where: { symbol_date: { symbol, date } },
        create: { symbol, date, value: ngn, asOf },
        update: { value: ngn, asOf },
      });
    }
  }

  private async build() {
    const quotes = [];
    let asOf: Date | null = null;
    let chart: { symbol: string; points: { t: string; v: number }[] } | null = null;
    for (const p of PAIRS) {
      const symbol = `${p.base}/NGN`;
      const rows = await this.prisma.marketRate.findMany({ where: { symbol }, orderBy: { date: 'desc' }, take: CHART_DAYS });
      if (!rows.length) continue;
      const [latest, previous] = rows;
      const change = previous ? latest!.value - previous.value : 0;
      quotes.push({
        symbol,
        name: p.name,
        price: round(latest!.value),
        change: round(change),
        changePct: previous ? round((change / previous.value) * 100) : 0,
        currency: 'NGN',
      });
      if (!asOf || latest!.asOf > asOf) asOf = latest!.asOf;
      if (!chart && rows.length >= 2) {
        chart = { symbol, points: rows.slice().reverse().map((r) => ({ t: r.asOf.toISOString(), v: round(r.value) })) };
      }
    }
    if (!quotes.length || !asOf) return null;
    return {
      asOf: asOf.toISOString(),
      // Provider publishes once a day.
      delayedMinutes: Math.min(1440, Math.max(0, Math.round((Date.now() - asOf.getTime()) / 60_000))),
      source: 'ExchangeRate-API',
      attribution: 'Rates By Exchange Rate API (exchangerate-api.com)',
      simulated: false,
      quotes,
      chart,
    };
  }
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
