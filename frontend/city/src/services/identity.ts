import {
  CITY_BRIDGE_STORAGE_KEY,
  DEFAULT_AVATAR,
  decodeAvatar,
  isSafeId,
  parseCityBridge,
  parseDistrict,
  type AvatarConfig,
  type CityBridgePayload,
  type DistrictId,
} from '@grooveli/frontend-domain/public';

export interface CityIdentity {
  displayName: string;
  level: number | null;
  /** 0..1 progress to the next level when the web app supplied it; never invented. */
  levelProgress: number | null;
  avatar: AvatarConfig;
  source: 'bridge' | 'url' | 'guest';
}

export interface CityLaunchParams {
  district: DistrictId | null;
  organizationId: string | null;
  forceDirectory: boolean;
}

/** Validates allowlisted URL parameters. Anything else in the query is ignored. */
export function parseLaunchParams(search: string): CityLaunchParams {
  const p = new URLSearchParams(search);
  const org = p.get('org');
  return {
    district: parseDistrict(p.get('district')),
    organizationId: org && isSafeId(org) ? org : null,
    forceDirectory: p.get('renderer') === '2d',
  };
}

export function readBridge(storage: Pick<Storage, 'getItem'> | null): CityBridgePayload | null {
  try {
    return parseCityBridge(storage?.getItem(CITY_BRIDGE_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

/**
 * Identity resolution order:
 * 1. Same-origin public bridge written by the web app (validated).
 * 2. Cosmetic `?avatar=` code (validated; carries no PII).
 * 3. Guest.
 * The city never receives tokens, emails or private profile data.
 */
export function resolveIdentity(search: string, bridge: CityBridgePayload | null): CityIdentity {
  const urlAvatar = decodeAvatar(new URLSearchParams(search).get('avatar'));
  if (bridge?.avatar) {
    return { displayName: bridge.displayName ?? 'Explorer', level: bridge.level, levelProgress: bridge.levelProgress ?? null, avatar: urlAvatar ?? bridge.avatar, source: 'bridge' };
  }
  if (urlAvatar) return { displayName: 'Explorer', level: null, levelProgress: null, avatar: urlAvatar, source: 'url' };
  return { displayName: 'Guest', level: null, levelProgress: null, avatar: DEFAULT_AVATAR, source: 'guest' };
}
