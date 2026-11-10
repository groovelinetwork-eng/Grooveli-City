import { afterEach, describe, expect, it, vi } from 'vitest';
import { CITY_BRIDGE_STORAGE_KEY, DEFAULT_AVATAR, PUBLIC_HQS, encodeAvatar, type CityBridgePayload } from '@grooveli/frontend-domain/public';
import { parseLaunchParams, readBridge, resolveIdentity } from '../src/services/identity';
import { buildWorldData } from '../src/services/world-data';
import { MAX_PRESENCE_HZ, SimulatedPresenceAdapter, UnavailableLivePresenceAdapter } from '../src/services/presence';
import { HQ_STATIONS, stationIntent } from '../src/app/interiors';
import { webHref } from '../src/app/settings';

const bridge = (over: Partial<CityBridgePayload> = {}): CityBridgePayload => ({
  version: 1,
  displayName: 'Tolu Adebayo',
  level: 4,
  avatar: { ...DEFAULT_AVATAR, hair: 2 },
  publicOrgUpdates: {},
  updatedAt: '2026-11-09T09:00:00Z',
  ...over,
});

describe('launch params', () => {
  it('accepts only allowlisted values', () => {
    expect(parseLaunchParams('?district=tech&org=kestrel-systems&renderer=2d')).toEqual({ district: 'tech', organizationId: 'kestrel-systems', forceDirectory: true });
    expect(parseLaunchParams('?district=<script>&org=https://evil.example&token=abc')).toEqual({ district: null, organizationId: null, forceDirectory: false });
  });
});

describe('identity', () => {
  it('prefers the same-origin bridge, then URL avatar, then guest', () => {
    expect(resolveIdentity('', bridge())).toMatchObject({ displayName: 'Tolu Adebayo', level: 4, source: 'bridge' });
    const code = encodeAvatar({ ...DEFAULT_AVATAR, skin: 1 });
    expect(resolveIdentity(`?avatar=${code}`, null)).toMatchObject({ displayName: 'Explorer', source: 'url', avatar: { skin: 1 } });
    expect(resolveIdentity('?avatar=99-99', null)).toMatchObject({ displayName: 'Guest', source: 'guest' });
  });

  it('rejects tampered bridge payloads', () => {
    const store = { getItem: (k: string) => (k === CITY_BRIDGE_STORAGE_KEY ? JSON.stringify({ ...bridge(), level: 'nine' }) : null) };
    expect(readBridge(store)).toBeNull();
    expect(readBridge({ getItem: () => '{not json' })).toBeNull();
    expect(readBridge(null)).toBeNull();
  });
});

describe('world data', () => {
  it('uses public fixtures without a bridge', () => {
    const d = buildWorldData(null);
    expect(d.source).toBe('fixtures');
    expect(d.hqs).toBe(PUBLIC_HQS);
  });

  it('overlays only public vacancies/announcements from the web bridge', () => {
    const d = buildWorldData(
      bridge({
        publicOrgUpdates: {
          'kestrel-systems': {
            vacancies: [{ id: 'job-new-role', title: 'Platform Lead', department: 'Engineering', workMode: 'remote', employmentType: 'full-time', postedOn: '2026-11-09' }],
            announcements: [{ id: 'ann-x', title: 'Open day', body: 'Come visit', publishedAt: '2026-11-09T09:00:00Z' }],
          },
        },
      }),
    );
    const k = d.hqs.find((h) => h.organization.id === 'kestrel-systems')!;
    expect(k.vacancies.map((v) => v.title)).toEqual(['Platform Lead']);
    expect(k.announcements[0]!.title).toBe('Open day');
    expect(d.jobCounts.tech).toBe(1);
  });
});

describe('presence', () => {
  afterEach(() => vi.useRealTimers());

  it('labels every projection as simulated', () => {
    const a = new SimulatedPresenceAdapter(1, () => 1000);
    expect(a.kind).toBe('simulated');
    for (const p of a.snapshot()) expect(p.source).toBe('simulated');
  });

  it('bounds the update rate', () => {
    expect(() => new SimulatedPresenceAdapter(MAX_PRESENCE_HZ + 1)).toThrow();
    vi.useFakeTimers();
    const cb = vi.fn();
    const unsub = new SimulatedPresenceAdapter(1, () => 0).subscribe(cb);
    vi.advanceTimersByTime(3000);
    unsub();
    expect(cb.mock.calls.length).toBeLessThanOrEqual(4);
    vi.advanceTimersByTime(3000);
    expect(cb.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('refuses to fake live presence', () => {
    expect(() => new UnavailableLivePresenceAdapter().subscribe()).toThrow(/not available/);
  });
});

describe('city → web intents', () => {
  it('routes stations to canonical web workflows with return context', () => {
    const hq = PUBLIC_HQS.find((h) => h.organization.id === 'kestrel-systems')!;
    expect(stationIntent('hq', 'employees', hq)).toEqual({ type: 'openEmployeePortal', organizationId: 'kestrel-systems' });
    expect(stationIntent('apartment', 'cv')).toEqual({ type: 'openCv' });
    expect(stationIntent('hq', 'management', hq)).toEqual({ type: 'openOrgArea', organizationId: 'kestrel-systems', area: 'overview' });
    expect(stationIntent('hq', 'records', hq)).toEqual({ type: 'openOrgArea', organizationId: 'kestrel-systems', area: 'people' });
    expect(stationIntent('hq', 'recruitment', hq)).toEqual({ type: 'openRecruitment', organizationId: 'kestrel-systems' });
    // every HQ station resolves to a valid, allowlisted web route
    for (const s of HQ_STATIONS) expect(() => new URL(webHref(stationIntent('hq', s.id, hq), 'tech'))).not.toThrow();
    expect(stationIntent('ai-center', 'assistant')).toEqual({ type: 'openCareerCenter' });
    const url = new URL(webHref({ type: 'viewJob', jobId: 'job-k-backend' }, 'tech'));
    expect(url.origin).toBe('http://localhost:3000');
    expect(url.pathname).toBe('/opportunities/job-k-backend');
    expect(url.searchParams.get('from')).toBe('city');
    expect(url.searchParams.get('district')).toBe('tech');
  });
});
