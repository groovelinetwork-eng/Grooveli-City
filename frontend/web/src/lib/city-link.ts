'use client';

import { buildCityUrl, encodeAvatar, type DistrictId } from '@grooveli/frontend-domain';
import { config } from './config';
import { useDemoStore } from './store/store';

/**
 * Web → city link. Carries only an allowlisted district/org id and a cosmetic
 * avatar code (no names, tokens or PII). When the city is served same-origin
 * via the /city proxy it additionally reads the public bridge payload.
 */
export function useCityHref(opts: { district?: DistrictId | null; organizationId?: string | null } = {}) {
  const avatar = useDemoStore((s) => (s.session?.personaId === 'candidate' ? s.candidate.avatar : null));
  return buildCityUrl(config.cityUrl, { ...opts, avatarCode: avatar ? encodeAvatar(avatar) : null });
}
