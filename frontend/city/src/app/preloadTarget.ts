import { PLACED_BUILDINGS, type PlacedBuilding, type Vec2 } from '../world/layout';

/** Start preparing a company HQ once the player is this close to its entrance (metres). */
export const PRELOAD_RADIUS = 24;

/** The company HQ whose entrance is nearest within the radius (apartment / AI Center excluded), or null. */
export function preloadTargetAt(p: Vec2, radius = PRELOAD_RADIUS): PlacedBuilding | null {
  let best: PlacedBuilding | null = null;
  let bestD = radius;
  for (const b of PLACED_BUILDINGS) {
    if (!b.enterable || !b.entrance || b.district === 'apartment' || b.district === 'ai-center') continue;
    const d = Math.hypot(b.entrance.x - p.x, b.entrance.z - p.z);
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}
