/**
 * CITY-SAFE entry point. `frontend/city` must import only from
 * `@grooveli/frontend-domain/public`. This module deliberately does NOT
 * re-export payroll, compensation, HR records, applicants or private
 * workspace data. A city test enforces this boundary.
 */
import { ORGANIZATIONS } from './fixtures/orgs';
import { JOBS } from './fixtures/jobs';
import { ORG_STAFF } from './fixtures/employees';
import { ORG_STRUCTURE } from './fixtures/structure';
import { SEED_ANNOUNCEMENTS } from './fixtures/social';
import { toPublicHq, type PublicHqProjection } from './projections';

export type {
  AvatarConfig,
  CityBuilding,
  CityDistrict,
  CityEvent,
  CityIntent,
  OrgArea,
  CityPortalAction,
  Community,
  DistrictId,
  PresenceProjection,
  SocialProfile,
} from './types';
export * from './constants';
export * from './avatar';
export * from './navigation';
export { DISTRICTS, BUILDINGS, PARK_BLOCK, DISTRICT_IDS, getDistrict } from './fixtures/city';
export { CITY_EVENTS, COMMUNITIES, SOCIAL_PROFILES } from './fixtures/social';
export { MISSIONS, SKILL_CHALLENGES } from './fixtures/career';
export {
  parseCityBridge,
  cityBridgeSchema,
  type CityBridgePayload,
  type PublicHqProjection,
  type PublicVacancy,
  type PublicDirectoryEntry,
  type PublicAnnouncement,
} from './projections';
export { formatDate, formatDateTime, initials } from './format';
export { progressFromXp } from './xp';

/**
 * Pre-computed public HQ projections for every organisation, built through
 * the public projection so no private field can leak into the city bundle.
 */
export const PUBLIC_HQS: PublicHqProjection[] = ORGANIZATIONS.map((organization) =>
  toPublicHq({
    organization,
    jobs: JOBS,
    departments: ORG_STRUCTURE[organization.id]?.departments,
    employees: ORG_STAFF[organization.id],
    announcements: SEED_ANNOUNCEMENTS,
  }),
);

export function getPublicHq(id: string): PublicHqProjection | undefined {
  return PUBLIC_HQS.find((h) => h.organization.id === id);
}

/** Public job counts per district (for city signage). */
export const PUBLIC_JOB_COUNTS: Record<string, number> = JOBS.filter((j) => j.status === 'published').reduce<Record<string, number>>(
  (acc, j) => {
    acc[j.district] = (acc[j.district] ?? 0) + 1;
    return acc;
  },
  {},
);

export const PUBLIC_TOP_JOBS = JOBS.filter((j) => j.status === 'published')
  .slice()
  .sort((a, b) => b.postedOn.localeCompare(a.postedOn))
  .slice(0, 6)
  .map((j) => ({ id: j.id, title: j.title, organizationId: j.organizationId, district: j.district, workMode: j.workMode }));
