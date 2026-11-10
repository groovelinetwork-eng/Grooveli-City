import {
  CITY_EVENTS,
  PUBLIC_HQS,
  PUBLIC_JOB_COUNTS,
  type CityBridgePayload,
  type CityEvent,
  type DistrictId,
  type PublicHqProjection,
} from '@grooveli/frontend-domain/public';

/**
 * Public world data for the city. Starts from public fixtures and overlays
 * public-only updates (published vacancies, public-HQ announcements) from the
 * web app's same-origin bridge. Private data never enters this module.
 */
export interface WorldData {
  hqs: PublicHqProjection[];
  events: CityEvent[];
  jobCounts: Record<string, number>;
  source: 'fixtures' | 'fixtures+bridge';
}

export function buildWorldData(bridge: CityBridgePayload | null): WorldData {
  if (!bridge || Object.keys(bridge.publicOrgUpdates).length === 0) {
    return { hqs: PUBLIC_HQS, events: CITY_EVENTS, jobCounts: PUBLIC_JOB_COUNTS, source: 'fixtures' };
  }
  const hqs = PUBLIC_HQS.map((hq) => {
    const upd = bridge.publicOrgUpdates[hq.organization.id];
    return upd ? { ...hq, vacancies: upd.vacancies, announcements: upd.announcements } : hq;
  });
  const jobCounts: Record<string, number> = {};
  for (const hq of hqs) jobCounts[hq.organization.district] = (jobCounts[hq.organization.district] ?? 0) + hq.vacancies.length;
  return { hqs, events: CITY_EVENTS, jobCounts, source: 'fixtures+bridge' };
}

export function eventsIn(data: WorldData, district: DistrictId): CityEvent[] {
  return data.events.filter((e) => e.district === district).sort((a, b) => a.start.localeCompare(b.start));
}
