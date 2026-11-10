import { DEMO_SESSION_COOKIE, getPersona, type PersonaId } from '@grooveli/frontend-domain';

/**
 * DEMO SESSION ONLY. A readable cookie naming the chosen demo persona so the
 * middleware can route signed-in vs signed-out users. This is NOT
 * authentication: nothing is verified, anyone can set it, and the backend
 * team owns the real session/SSO design (open decision).
 */
export const DEMO_COOKIE = DEMO_SESSION_COOKIE;

export function isPersonaId(v: unknown): v is PersonaId {
  return typeof v === 'string' && !!getPersona(v);
}

export function writeDemoCookie(personaId: PersonaId) {
  document.cookie = `${DEMO_COOKIE}=${personaId}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
}

export function clearDemoCookie() {
  document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/** Routes requiring a demo session, and where each persona lands. */
export const PROTECTED_PREFIXES = ['/app', '/org', '/onboarding', '/dashboard'];
export const AUTH_PAGES = ['/login', '/signup'];

export function homeForPersona(personaId: PersonaId): string {
  return getPersona(personaId)?.home ?? '/app';
}

/** Only same-site relative paths from our own route tree are accepted as `next`. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!/^\/(app|org|onboarding|social|opportunities|companies)(\/[a-z0-9\-/]*)?(\?[a-z0-9=&\-]*)?$/i.test(next)) return null;
  if (next.startsWith('//')) return null;
  return next;
}
