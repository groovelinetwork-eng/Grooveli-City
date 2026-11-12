import type { PublicHqProjection } from '@grooveli/frontend-domain/public';
import { BAYS } from '../../world/hq';
import { brandMaterials, makeHqMaterials, type HqMaterials } from './hqMaterials';
import {
  analyticsTexture,
  announcementsTexture,
  artTexture,
  cultureTexture,
  deptSignTexture,
  directoryTexture,
  hiringStepsTexture,
  hrInfoTexture,
  logoTexture,
  meetingScreenTexture,
  noticeboardTexture,
  onboardingTexture,
  rugTexture,
  scheduleTexture,
  screenTexture,
  vacanciesTexture,
  wayfindingTexture,
  whiteboardTexture,
} from './hqTextures';

/**
 * Company HQ resources, cached for the session instead of rebuilt (and
 * disposed) on every visit:
 * - the shared office materials (same for every company),
 * - brand materials per brand colour,
 * - the canvas textures per company (logos, boards, screens, signage), kept
 *   for the MAX_TEXTURE_SETS most recently used companies.
 * HqPreloader builds them ahead of time while the player walks up, so
 * entering only has to place the room.
 */
export const MAX_TEXTURE_SETS = 3;

let shared: HqMaterials | null = null;
export function hqMaterials(): HqMaterials {
  return (shared ??= makeHqMaterials());
}

const brands = new Map<string, ReturnType<typeof brandMaterials>>();
export function hqBrandMaterials(color: string) {
  let b = brands.get(color);
  if (!b) {
    b = brandMaterials(color);
    brands.set(color, b);
  }
  return b;
}

/** One thunk per texture, so preparation can be spread over idle time. */
function textureBuilders(hq: PublicHqProjection) {
  const org = hq.organization;
  return {
    logo: () => logoTexture(org),
    logoDark: () => logoTexture(org, true),
    culture: () => cultureTexture(org),
    vacancies: () => vacanciesTexture(hq),
    how: () => hiringStepsTexture(org.logoColor),
    notices: () => announcementsTexture(hq),
    directory: () => directoryTexture(hq),
    hrInfo: () => hrInfoTexture(),
    onboarding: () => onboardingTexture(org.logoColor),
    analytics: () => analyticsTexture(org.logoColor),
    meeting: () => meetingScreenTexture(org),
    schedule: () => scheduleTexture(org.logoColor),
    noticeboard: () => noticeboardTexture(org),
    whiteboard: () => whiteboardTexture(),
    screens: () => [0, 1, 2, 3, 4, 5].map(screenTexture),
    art: () => [artTexture(1)],
    rugs: () => [rugTexture(0), rugTexture(1), rugTexture(2)],
    depts: () => BAYS.map((_, i) => deptSignTexture(hq.departments[i] ?? ['Team space', 'Project room', 'Hot desks'][i]!, org.logoColor)),
    wayLobby: () => wayfindingTexture([
      ['Workspace & departments', '↑'],
      ['HR & employee services', '↑'],
      ['Talent hub & lounge', '←'],
    ]),
    wayCorridor: () => wayfindingTexture([
      ['Executive office', '↑'],
      ['Conference room', '←'],
      ['Interview room · Lounge', '↓'],
    ]),
    services: () => wayfindingTexture([['Employee services', '↓']]),
  };
}

type Builders = ReturnType<typeof textureBuilders>;
export type HqTextureSet = { [K in keyof Builders]: ReturnType<Builders[K]> };
type Partial = { -readonly [K in keyof HqTextureSet]?: HqTextureSet[K] };

const sets = new Map<PublicHqProjection, HqTextureSet>();
const partial = new Map<PublicHqProjection, Partial>();

function remember(hq: PublicHqProjection, set: HqTextureSet) {
  sets.delete(hq);
  sets.set(hq, set); // most recently used last
  while (sets.size > MAX_TEXTURE_SETS) {
    const [oldest, old] = sets.entries().next().value!;
    sets.delete(oldest);
    Object.values(old).flat().forEach((t) => t.dispose());
  }
}

/**
 * Builds the next missing texture for this HQ; returns true once the whole set
 * is ready. Used by idle-time preparation (one small step per idle slice).
 */
export function prepareHqTextureStep(hq: PublicHqProjection): boolean {
  if (sets.has(hq)) return true;
  const done = partial.get(hq) ?? {};
  partial.set(hq, done);
  const builders = textureBuilders(hq);
  const next = (Object.keys(builders) as (keyof Builders)[]).find((k) => done[k] === undefined);
  if (next) {
    (done as Record<string, unknown>)[next] = builders[next]();
    return false;
  }
  partial.delete(hq);
  remember(hq, done as HqTextureSet);
  return true;
}

export function hqTextureSet(hq: PublicHqProjection): HqTextureSet {
  const ready = sets.get(hq);
  if (ready) {
    remember(hq, ready);
    return ready;
  }
  while (!prepareHqTextureStep(hq));
  return sets.get(hq)!;
}

export function isHqPrepared(hq: PublicHqProjection) {
  return sets.has(hq);
}

/** Every texture of a prepared HQ (for background GPU upload). */
export function hqTextures(hq: PublicHqProjection) {
  const set = sets.get(hq);
  return set ? Object.values(set).flat() : [];
}

/** HQs whose shader programs are already compiled this session (visited or warmed up). */
const warm = new Set<PublicHqProjection>();
export function markHqWarm(hq: PublicHqProjection) {
  warm.add(hq);
}
export function isHqWarm(hq: PublicHqProjection) {
  return warm.has(hq);
}
