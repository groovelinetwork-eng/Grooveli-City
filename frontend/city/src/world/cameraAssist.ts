import { CAMERA } from '../scene/camera';
import { ALL_BUILDINGS, INTERACT_RADIUS, PLACED_BUILDINGS, type Vec2 } from './layout';

/**
 * Entrance-aware camera assistance for the city's orthographic follow camera.
 *
 * The city camera normally looks north (yaw 0 = camera on the +Z side). Some
 * entrances face north, i.e. away from that view, so the building hides the
 * door and the player. When the player approaches an entrance the current
 * view cannot see, the camera turns to the entrance's side; it holds that
 * view while the player stays near (hysteresis: activate < release radius)
 * and returns to the player's own view once they walk away.
 */
export interface EntranceView {
  id: string;
  buildingId: string;
  name: string;
  x: number;
  z: number;
  /** Outward facing direction of the door (unit, horizontal). */
  normal: Vec2;
  /** Interaction radius (same as the building prompt). */
  radius: number;
  /** Assistance starts inside this distance… */
  activate: number;
  /** …and ends beyond this one. */
  release: number;
  /** Camera yaw that looks at the door from the side it faces. */
  preferredYaw: number;
}

export const ENTRANCE_VIEWS: EntranceView[] = PLACED_BUILDINGS.filter((b) => b.entrance).map((b) => {
  const e = b.entrance!;
  const normal = e.z < b.center.z ? { x: 0, z: -1 } : { x: 0, z: 1 };
  return {
    id: `entrance:${b.id}`,
    buildingId: b.id,
    name: b.name,
    x: e.x,
    z: e.z,
    normal,
    radius: INTERACT_RADIUS,
    activate: 7,
    release: 10.5,
    preferredYaw: Math.atan2(normal.x, normal.z),
  };
});

interface Box3 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  h: number;
}
const BOXES: Box3[] = ALL_BUILDINGS.filter((b) => b.style !== 'flat' && b.h > 0).map((b) => ({ ...b.aabb, h: b.h + 0.5 }));

const PITCH = (CAMERA.pitchDeg * Math.PI) / 180;

/** Horizontal unit vector from the look-at point toward the camera. */
export function cameraSide(yaw: number): Vec2 {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** Does the line of sight from the player (chest height) to the camera pass through a building? */
export function playerOccluded(p: Vec2, yaw: number, boxes: Box3[] = BOXES): boolean {
  const c = Math.cos(PITCH);
  const dir = { x: Math.sin(yaw) * c, y: Math.sin(PITCH), z: Math.cos(yaw) * c };
  const o = { x: p.x, y: 1.2, z: p.z };
  for (const b of boxes) {
    let t0 = 0.4;
    let t1 = 300;
    const axes: [number, number, number, number][] = [
      [o.x, dir.x, b.minX, b.maxX],
      [o.y, dir.y, 0, b.h],
      [o.z, dir.z, b.minZ, b.maxZ],
    ];
    let hit = true;
    for (const [oo, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-9) {
        if (oo < lo || oo > hi) {
          hit = false;
          break;
        }
        continue;
      }
      let a = (lo - oo) / d;
      let bb = (hi - oo) / d;
      if (a > bb) [a, bb] = [bb, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, bb);
      if (t0 > t1) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/** The door faces the camera and nothing blocks the view of the player. */
export function entranceVisible(e: EntranceView, p: Vec2, yaw: number): boolean {
  const s = cameraSide(yaw);
  if (e.normal.x * s.x + e.normal.z * s.z < 0.3) return false;
  return !playerOccluded(p, yaw);
}

export interface AssistState {
  /** Entrance the camera is currently turned toward. */
  active: string | null;
  /** Entrance the player overrode manually (no auto-turn until they leave it). */
  suppressed: string | null;
}

export const NO_ASSIST: AssistState = { active: null, suppressed: null };

const dist = (p: Vec2, e: EntranceView) => Math.hypot(p.x - e.x, p.z - e.z);
const byId = (id: string | null) => (id ? ENTRANCE_VIEWS.find((e) => e.id === id) ?? null : null);

/** One controller step. Returns the same object when nothing changed. */
export function stepAssist(s: AssistState, p: Vec2, yaw: number, enabled: boolean): AssistState {
  let next = s;
  const sup = byId(s.suppressed);
  if (sup && dist(p, sup) > sup.release) next = { ...next, suppressed: null };
  const act = byId(next.active);
  if (act) {
    if (!enabled || dist(p, act) > act.release) next = { ...next, active: null };
    return next;
  }
  if (!enabled) return next;
  let best: EntranceView | null = null;
  let bestD = Infinity;
  for (const e of ENTRANCE_VIEWS) {
    const d = dist(p, e);
    if (d < e.activate && d < bestD && e.id !== next.suppressed) {
      best = e;
      bestD = d;
    }
  }
  if (best && !entranceVisible(best, p, yaw)) next = { ...next, active: best.id };
  return next;
}

/** Player turned the view by hand: stop assisting the current entrance until they leave it. */
export function manualOverride(s: AssistState): AssistState {
  return s.active ? { active: null, suppressed: s.active } : s;
}

export function activeEntrance(s: AssistState): EntranceView | null {
  return byId(s.active);
}

/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}
