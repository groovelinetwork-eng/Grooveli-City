import { z } from 'zod';
import type { CityIntent, DistrictId, OrgArea } from './types';

/**
 * City → web navigation. City scene interactions emit typed intents which map
 * to canonical, allowlisted web routes. IDs are validated; return context is an
 * allowlisted district id (never an arbitrary URL); no tokens/PII in URLs.
 */
export const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const DISTRICT_ID_LIST: DistrictId[] = [
  'plaza', 'corporate', 'recruitment', 'university', 'tech', 'creative',
  'healthcare', 'hospitality', 'finance', 'apartment', 'ai-center',
];

export const districtIdSchema = z.enum(DISTRICT_ID_LIST as [DistrictId, ...DistrictId[]]);
export const safeIdSchema = z.string().regex(SAFE_ID);

export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID.test(id);
}

export function parseDistrict(value: unknown): DistrictId | null {
  const r = districtIdSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** Org workspace area → existing web route (all under the access-checked /org layout). */
export const ORG_AREA_PATHS: Record<OrgArea, string> = {
  overview: '/org',
  people: '/org/people',
  structure: '/org/structure',
  'hr-leave': '/org/hr/leave',
  'hr-attendance': '/org/hr/attendance',
  'hr-documents': '/org/hr/documents',
  'hr-lifecycle': '/org/hr/lifecycle',
  'hr-performance': '/org/hr/performance',
  'hr-policies': '/org/hr/policies',
  payroll: '/org/payroll',
  analytics: '/org/analytics',
  'recruitment-pipeline': '/org/recruitment/pipeline',
  'recruitment-interviews': '/org/recruitment/interviews',
  'recruitment-analytics': '/org/recruitment/analytics',
  engagement: '/org/engagement',
  'engagement-recognition': '/org/engagement/recognition',
  'engagement-activities': '/org/engagement/activities',
  'engagement-culture': '/org/engagement/culture',
  settings: '/org/settings',
};

export function intentToPath(intent: CityIntent): string {
  const q = (params: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
    const str = s.toString();
    return str ? `?${str}` : '';
  };
  const id = (v: string) => {
    if (!isSafeId(v)) throw new Error('Unsafe id in navigation intent');
    return v;
  };
  switch (intent.type) {
    case 'viewJob':
      return `/opportunities/${id(intent.jobId)}`;
    case 'browseJobs':
      return `/opportunities${q({ district: intent.district })}`;
    case 'viewOrganization':
      return `/companies/${id(intent.organizationId)}`;
    case 'openRecruitment':
      return `/org/recruitment${q({ org: id(intent.organizationId) })}`;
    case 'openEmployeePortal':
      return `/org/me${q({ org: id(intent.organizationId) })}`;
    case 'openOrgArea': {
      if (!Object.prototype.hasOwnProperty.call(ORG_AREA_PATHS, intent.area)) throw new Error('Unknown organisation area');
      return `${ORG_AREA_PATHS[intent.area]}${q({ org: id(intent.organizationId) })}`;
    }
    case 'openCareerCenter':
      return '/app/career-center';
    case 'openDashboard':
      return '/app';
    case 'openProfile':
      return '/app/profile';
    case 'openCv':
      return '/app/cv';
    case 'openAchievements':
      return '/app/achievements';
    case 'openMissions':
      return `/app/missions${q({ district: intent.district })}`;
    case 'openLearning':
      return '/app/learning';
    case 'openSkills':
      return '/app/skills';
    case 'openInterviews':
      return '/app/interviews';
    case 'openNotifications':
      return '/app/notifications';
    case 'openApplications':
      return '/app/applications';
    case 'viewEvent':
      return `/social/events/${id(intent.eventId)}`;
    case 'viewCommunity':
      return `/social/communities/${id(intent.communityId)}`;
    case 'openSocial':
      return '/social';
    case 'openPrivacy':
      return '/app/settings';
    case 'signIn':
      return '/login';
  }
}

/** Build a full web URL for an intent, appending safe return-to-city context. */
export function buildWebUrl(webBase: string, intent: CityIntent, from?: { district?: DistrictId | null }): string {
  const path = intentToPath(intent);
  const url = new URL(path, webBase.endsWith('/') ? webBase : `${webBase}/`);
  url.searchParams.set('from', 'city');
  if (from?.district && parseDistrict(from.district)) url.searchParams.set('district', from.district);
  return url.toString();
}

/** Web → city link. Only cosmetic avatar code and an allowlisted district/org id. */
export function buildCityUrl(
  cityBase: string,
  opts: { district?: DistrictId | null; organizationId?: string | null; avatarCode?: string | null } = {},
): string {
  const params = new URLSearchParams();
  if (opts.district && parseDistrict(opts.district)) params.set('district', opts.district);
  if (opts.organizationId && isSafeId(opts.organizationId)) params.set('org', opts.organizationId);
  if (opts.avatarCode && /^\d{1,2}(-\d{1,2}){6}$/.test(opts.avatarCode)) params.set('avatar', opts.avatarCode);
  const qs = params.toString();
  return qs ? `${cityBase}${cityBase.includes('?') ? '&' : '?'}${qs}` : cityBase;
}

export interface ReturnContext {
  fromCity: boolean;
  district: DistrictId | null;
}

export function parseReturnContext(search: URLSearchParams): ReturnContext {
  return {
    fromCity: search.get('from') === 'city',
    district: parseDistrict(search.get('district')),
  };
}
