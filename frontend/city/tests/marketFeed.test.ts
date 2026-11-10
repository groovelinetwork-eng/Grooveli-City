import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { marketSnapshotSchema, parseMarketSnapshot, type MarketSnapshot } from '@grooveli/frontend-domain/public';
import { HttpMarketsAdapter, MOCK_INSTRUMENTS, MockMarketsAdapter, marketsBoardModel, mockSnapshot, safeFeedUrl, type MarketsAdapter } from '../src/services/markets';
import { useMarketFeed } from '../src/services/useMarketFeed';

const T0 = new Date('2026-11-10T14:00:00Z');
const later = (s: number) => new Date(T0.getTime() + s * 1000);

const live: MarketSnapshot = {
  asOf: new Date().toISOString(),
  delayedMinutes: 15,
  source: 'Example Provider',
  attribution: 'Data by Example Provider',
  simulated: false,
  quotes: [
    { symbol: 'NGXASI', name: 'NGX All-Share', price: 98123.4, change: 412.1, changePct: 0.42, currency: 'NGN' },
    { symbol: 'USD/NGN', name: 'US dollar / naira', price: 1532.25, change: -3.5, changePct: -0.23, currency: 'NGN' },
  ],
  chart: {
    symbol: 'NGXASI',
    points: [
      { t: '2026-11-10T13:00:00Z', v: 97710.2 },
      { t: '2026-11-10T13:30:00Z', v: 97500 },
      { t: '2026-11-10T14:00:00Z', v: 98123.4 },
    ],
  },
};

describe('market feed contract', () => {
  it('accepts a valid payload and rejects malformed ones', () => {
    expect(parseMarketSnapshot(live)).not.toBeNull();
    expect(parseMarketSnapshot({ ...live, quotes: [] })).toBeNull();
    expect(parseMarketSnapshot({ ...live, asOf: 'yesterday' })).toBeNull();
    expect(parseMarketSnapshot({ ...live, quotes: [{ ...live.quotes[0]!, price: Number.NaN }] })).toBeNull();
    expect(parseMarketSnapshot({ ...live, quotes: [{ ...live.quotes[0]!, symbol: '<script>' }] })).toBeNull();
    expect(parseMarketSnapshot('not json')).toBeNull();
  });
});

describe('mock market feed (data, not a drawing)', () => {
  it('produces contract-valid, simulated snapshots for fictional instruments', () => {
    const s = mockSnapshot(T0);
    expect(marketSnapshotSchema.safeParse(s).success).toBe(true);
    expect(s.simulated).toBe(true);
    expect(s.quotes.map((q) => q.symbol)).toEqual(MOCK_INSTRUMENTS.map((i) => i.symbol));
    for (const q of s.quotes) expect(q.changePct).toBeCloseTo((q.change / (q.price - q.change)) * 100, 1);
  });

  it('moves over time but is deterministic for the same moment', () => {
    const a = mockSnapshot(T0);
    expect(mockSnapshot(T0)).toEqual(a);
    const b = mockSnapshot(later(60));
    expect(b.quotes.map((q) => q.price)).not.toEqual(a.quotes.map((q) => q.price));
    expect(b.asOf > a.asOf).toBe(true);
  });

  it('builds the chart series up to the snapshot time', () => {
    const s = mockSnapshot(T0);
    const pts = s.chart!.points;
    expect(pts.length).toBe(48);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.t > pts[i - 1]!.t).toBe(true);
    expect(pts[pts.length - 1]!.t).toBe(s.asOf);
    expect(new Set(pts.map((p) => p.v)).size).toBeGreaterThan(10);
  });

  it('serves fresh data through the adapter on every call', async () => {
    let now = T0;
    const adapter = new MockMarketsAdapter(() => now);
    const first = await adapter.fetchSnapshot();
    now = later(90);
    const second = await adapter.fetchSnapshot();
    expect(second.quotes[0]!.price).not.toBe(first.quotes[0]!.price);
  });
});

describe('http market feed', () => {
  it('validates the response and never sends credentials', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(live), { status: 200 }));
    const snap = await new HttpMarketsAdapter('https://api.example.com/v1/city/markets', 8000, fetchImpl as unknown as typeof fetch).fetchSnapshot();
    expect(snap.quotes[0]!.symbol).toBe('NGXASI');
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.credentials).toBe('omit');
    expect(init.method).toBe('GET');
  });

  it('fails on HTTP errors and on payloads that break the contract', async () => {
    const err = new HttpMarketsAdapter('/api', 8000, (async () => new Response('down', { status: 503 })) as unknown as typeof fetch);
    await expect(err.fetchSnapshot()).rejects.toThrow(/503/);
    const bad = new HttpMarketsAdapter('/api', 8000, (async () => new Response(JSON.stringify({ quotes: 'x' }), { status: 200 })) as unknown as typeof fetch);
    await expect(bad.fetchSnapshot()).rejects.toThrow(/contract/);
  });

  it('accepts only http(s) or same-origin feed URLs', () => {
    expect(safeFeedUrl('/api/v1/city/markets')).toBe('/api/v1/city/markets');
    expect(safeFeedUrl('https://api.example.com/m')).toBe('https://api.example.com/m');
    for (const b of ['', '//evil.example/x', 'javascript:alert(1)', 'https://u:p@x.example/', 'ftp://x.example']) expect(safeFeedUrl(b), b).toBeNull();
  });
});

describe('board model', () => {
  it('is computed from the snapshot (prices, colours, chart scaled to the data)', () => {
    const m = marketsBoardModel(live);
    expect(m.badge).toBe('DELAYED 15M');
    expect(m.rows[0]).toMatchObject({ symbol: 'NGXASI', price: '98,123.4', change: '+0.42%', trend: 'up' });
    expect(m.rows[1]).toMatchObject({ symbol: 'USD/NGN', price: '1,532.3', change: '-0.23%', trend: 'down' });
    expect(m.chart!.path[0]![0]).toBe(0);
    expect(m.chart!.path[2]![0]).toBe(1);
    expect(Math.max(...m.chart!.path.map((p) => p[1]))).toBe(1);
    expect(Math.min(...m.chart!.path.map((p) => p[1]))).toBe(0);
    expect(m.chart!.high).toBe('98,123.4');
    expect(m.footer).toMatch(/Data by Example Provider · delayed 15 min · as of/);
  });

  it('labels simulated and fallback data on the board itself', () => {
    const m = marketsBoardModel(mockSnapshot(T0), { fallback: true });
    expect(m.badge).toBe('SIMULATED');
    expect(m.footer).toMatch(/^Live feed unavailable · Simulated demo data/);
    const a = marketsBoardModel(mockSnapshot(T0));
    const b = marketsBoardModel(mockSnapshot(later(120)));
    expect(b.rows.map((r) => r.price)).not.toEqual(a.rows.map((r) => r.price));
  });
});

describe('useMarketFeed', () => {
  it('falls back to labelled simulated data when the live feed fails', async () => {
    const failing: MarketsAdapter = { kind: 'http', fetchSnapshot: async () => Promise.reject(new Error('Market feed responded 503')) };
    const { result, unmount } = renderHook(() => useMarketFeed(failing, 60000));
    await waitFor(() => expect(result.current.status).toBe('fallback'));
    expect(result.current.snapshot?.simulated).toBe(true);
    expect(result.current.error).toMatch(/503/);
    unmount();
  });

  it('keeps the last live snapshot through a brief outage and refreshes on the interval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    const flaky: MarketsAdapter = {
      kind: 'http',
      fetchSnapshot: async () => {
        calls++;
        if (calls === 2) throw new Error('timeout');
        return { ...live, asOf: new Date().toISOString(), quotes: [{ ...live.quotes[0]!, price: 98000 + calls }] };
      },
    };
    const { result, unmount } = renderHook(() => useMarketFeed(flaky, 15000));
    await waitFor(() => expect(result.current.snapshot?.quotes[0]!.price).toBe(98001));
    await vi.advanceTimersByTimeAsync(15000);
    await waitFor(() => expect(result.current.error).toBe('timeout'));
    expect(result.current.status).toBe('live');
    expect(result.current.snapshot?.quotes[0]!.price).toBe(98001);
    await vi.advanceTimersByTimeAsync(15000);
    await waitFor(() => expect(result.current.snapshot?.quotes[0]!.price).toBe(98003));
    unmount();
    vi.useRealTimers();
  });
});
