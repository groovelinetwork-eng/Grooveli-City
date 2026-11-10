import { COLLIDERS, INTERACTABLES, INTERACT_RADIUS, PLAYER_RADIUS, WORLD_BOUNDS, type AABB, type Interactable, type Vec2 } from './layout';

export const WALK_SPEED = 7; // units per second

/**
 * Screen-relative input → world direction for the city camera. At yaw 0 the
 * camera looks north (reference framing): screen up = −Z, screen right = +X.
 * A turned camera (entrance assist / manual rotation) rotates the mapping so
 * "up" always means up the screen.
 */
export function inputToWorld(input: { x: number; y: number }, yaw = 0): Vec2 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const x = input.x * c - input.y * s;
  const z = -input.x * s - input.y * c;
  const len = Math.hypot(x, z);
  return len > 1 ? { x: x / len, z: z / len } : { x, z };
}

/** Screen input → room direction for the interior camera (sits at the +X/+Z corner). */
export function inputToRoom(input: { x: number; y: number }): Vec2 {
  const s = Math.SQRT1_2;
  const x = (input.x - input.y) * s;
  const z = (-input.x - input.y) * s;
  const len = Math.hypot(x, z);
  return len > 1 ? { x: x / len, z: z / len } : { x, z };
}

/** Push a circle out of an AABB if overlapping. */
export function resolveCircleAabb(p: Vec2, r: number, box: AABB): Vec2 {
  const cx = Math.max(box.minX, Math.min(p.x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(p.z, box.maxZ));
  const dx = p.x - cx;
  const dz = p.z - cz;
  const dist = Math.hypot(dx, dz);
  if (dist >= r) return p;
  if (dist === 0) {
    // Centre inside the box: push out along the shallowest axis.
    const pushes = [
      { x: box.minX - r, z: p.z, d: p.x - box.minX },
      { x: box.maxX + r, z: p.z, d: box.maxX - p.x },
      { x: p.x, z: box.minZ - r, d: p.z - box.minZ },
      { x: p.x, z: box.maxZ + r, d: box.maxZ - p.z },
    ].sort((a, b) => a.d - b.d);
    return { x: pushes[0]!.x, z: pushes[0]!.z };
  }
  const k = r / dist;
  return { x: cx + dx * k, z: cz + dz * k };
}

export function clampToBounds(p: Vec2, r: number, b: AABB = WORLD_BOUNDS): Vec2 {
  return { x: Math.max(b.minX + r, Math.min(b.maxX - r, p.x)), z: Math.max(b.minZ + r, Math.min(b.maxZ - r, p.z)) };
}

export function step(pos: Vec2, dir: Vec2, dt: number, colliders: AABB[] = COLLIDERS, speed = WALK_SPEED, bounds: AABB = WORLD_BOUNDS, radius = PLAYER_RADIUS): Vec2 {
  const clampedDt = Math.min(dt, 0.1); // avoid tunnelling after tab switches
  let next = { x: pos.x + dir.x * speed * clampedDt, z: pos.z + dir.z * speed * clampedDt };
  for (const box of colliders) next = resolveCircleAabb(next, radius, box);
  return clampToBounds(next, radius, bounds);
}

/** Direction toward a tap/click target; zero when arrived. */
export function seek(pos: Vec2, target: Vec2 | null, arriveDist = 0.3): Vec2 {
  if (!target) return { x: 0, z: 0 };
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const d = Math.hypot(dx, dz);
  return d < arriveDist ? { x: 0, z: 0 } : { x: dx / d, z: dz / d };
}

export function nearestInteractable(pos: Vec2, items: Interactable[] = INTERACTABLES, radius = INTERACT_RADIUS): Interactable | null {
  let best: Interactable | null = null;
  let bestD = radius;
  for (const it of items) {
    const d = Math.hypot(it.position.x - pos.x, it.position.z - pos.z);
    if (d <= bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}
