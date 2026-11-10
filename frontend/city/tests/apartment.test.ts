import { describe, expect, it } from 'vitest';
import { APARTMENT_STATIONS } from '../src/app/interiors';
import { APARTMENT_ANCHORS, APARTMENT_BOUNDS, APARTMENT_COLLIDERS, APARTMENT_SPAWN, FURNITURE, ROOM } from '../src/world/apartment';
import { inputToRoom, step } from '../src/world/movement';

const inside = (p: { x: number; z: number }, b: { minX: number; maxX: number; minZ: number; maxZ: number }) => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;

describe('apartment reconstruction layout', () => {
  it('keeps every station as a physical object with a reachable anchor', () => {
    for (const s of APARTMENT_STATIONS) {
      const a = APARTMENT_ANCHORS[s.id];
      expect(a, s.id).toBeDefined();
      expect(inside(a!, APARTMENT_BOUNDS), s.id).toBe(true);
      for (const c of APARTMENT_COLLIDERS) expect(inside(a!, c), `${s.id} anchor inside furniture`).toBe(false);
      expect(s.at).toEqual([a!.x, a!.z]);
    }
    expect(APARTMENT_STATIONS.map((s) => s.id).sort()).toEqual(['cv', 'desk', 'laptop', 'phone', 'stats', 'trophies']);
  });

  it('has no overlapping furniture and everything stays inside the room', () => {
    const solid = FURNITURE.filter((f) => f.solid);
    for (let i = 0; i < solid.length; i++) {
      const a = APARTMENT_COLLIDERS[i]!;
      expect(a.minX >= -ROOM.half - 0.01 && a.maxX <= ROOM.half + 0.01 && a.minZ >= -ROOM.half - 0.01 && a.maxZ <= ROOM.half + 0.01, solid[i]!.id).toBe(true);
      for (let j = i + 1; j < solid.length; j++) {
        const b = APARTMENT_COLLIDERS[j]!;
        const overlap = a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
        expect(overlap, `${solid[i]!.id} overlaps ${solid[j]!.id}`).toBe(false);
      }
    }
  });

  it('spawns the avatar on open floor and lets it walk without passing through furniture or walls', () => {
    for (const c of APARTMENT_COLLIDERS) expect(inside(APARTMENT_SPAWN, c)).toBe(false);
    let p = { ...APARTMENT_SPAWN };
    for (let i = 0; i < 300; i++) p = step(p, inputToRoom({ x: 0, y: 1 }), 1 / 30, APARTMENT_COLLIDERS, 2.6, APARTMENT_BOUNDS, 0.28);
    expect(p.x).toBeGreaterThanOrEqual(APARTMENT_BOUNDS.minX);
    expect(p.z).toBeGreaterThanOrEqual(APARTMENT_BOUNDS.minZ);
    for (const c of APARTMENT_COLLIDERS) expect(inside(p, c)).toBe(false);
  });

  it('maps screen input for the corner camera (up = toward the back corner)', () => {
    const up = inputToRoom({ x: 0, y: 1 });
    expect(up.x).toBeLessThan(0);
    expect(up.z).toBeLessThan(0);
  });
});
