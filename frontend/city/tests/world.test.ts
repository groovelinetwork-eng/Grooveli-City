import { describe, expect, it } from 'vitest';
import { DISTRICTS } from '@grooveli/frontend-domain/public';
import { ALL_BUILDINGS, COLLIDERS, INTERACTABLES, PLACED_BUILDINGS, PLAZA_H, SIDEWALK_H, WORLD_BOUNDS, districtAt, districtKiosk, groundHeight, spawnPoint } from '../src/world/layout';
import { PLAZA_RECT, PLAZA_RING } from '../src/world/plan';
import { buildCityProps } from '../src/world/props';
import { inputToWorld, nearestInteractable, resolveCircleAabb, seek, step } from '../src/world/movement';
import { QUALITY, loopLength, makePedestrians, makeVehicles, pointOnLoop } from '../src/world/ambient';

describe('layout', () => {
  it('places all 11 documented places with a kiosk inside their block', () => {
    expect(DISTRICTS).toHaveLength(11);
    for (const d of DISTRICTS) expect(districtAt(districtKiosk(d.id))).toBe(d.id);
  });

  it('gives every enterable building an entrance outside its collider', () => {
    for (const b of PLACED_BUILDINGS.filter((x) => x.enterable)) {
      const e = b.entrance!;
      const inside = e.x > b.aabb.minX && e.x < b.aabb.maxX && e.z > b.aabb.minZ && e.z < b.aabb.maxZ;
      expect(inside).toBe(false);
    }
  });

  it('has apartment, AI center and company HQ interactables', () => {
    const ids = INTERACTABLES.map((i) => i.id);
    expect(ids).toContain('b-apartment');
    expect(ids).toContain('b-ai-center');
    expect(ids).toContain('b-kestrel');
  });

  it('spawns at deep-linked HQ or district, otherwise the plaza', () => {
    expect(districtAt(spawnPoint({}))).toBe('plaza');
    expect(districtAt(spawnPoint({ district: 'finance' }))).toBe('finance');
    expect(districtAt(spawnPoint({ organizationId: 'kestrel-systems' }))).toBe('tech');
  });
});

describe('movement & collision', () => {
  it('maps input for the north-facing reference camera (screen up = −Z, right = +X)', () => {
    expect(inputToWorld({ x: 0, y: 1 })).toEqual({ x: 0, z: -1 });
    expect(inputToWorld({ x: 1, y: 0 })).toEqual({ x: 1, z: -0 });
    const diag = inputToWorld({ x: 1, y: 1 });
    expect(Math.hypot(diag.x, diag.z)).toBeCloseTo(1);
  });

  it('pushes the player out of buildings', () => {
    const box = COLLIDERS[0]!;
    const inside = { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 };
    const out = resolveCircleAabb(inside, 0.5, box);
    const stillInside = out.x > box.minX && out.x < box.maxX && out.z > box.minZ && out.z < box.maxZ;
    expect(stillInside).toBe(false);
  });

  it('never lets the player walk through a building or leave the world', () => {
    const b = PLACED_BUILDINGS.find((x) => x.id === 'b-kestrel')!;
    let p = { x: b.center.x, z: b.aabb.maxZ + 2 };
    for (let i = 0; i < 200; i++) p = step(p, { x: 0, z: -1 }, 1 / 30);
    expect(p.z).toBeGreaterThanOrEqual(b.aabb.maxZ);
    let q = { x: 0, z: 0 };
    for (let i = 0; i < 2000; i++) q = step(q, { x: 1, z: 0 }, 1 / 30);
    expect(q.x).toBeLessThanOrEqual(WORLD_BOUNDS.maxX);
  });

  it('caps the timestep to avoid tunnelling', () => {
    const p = step({ x: 0, z: 0 }, { x: 1, z: 0 }, 5, []);
    expect(p.x).toBeLessThanOrEqual(0.71);
  });

  it('seeks toward tap targets and stops on arrival', () => {
    expect(seek({ x: 0, z: 0 }, { x: 10, z: 0 })).toEqual({ x: 1, z: 0 });
    expect(seek({ x: 0, z: 0 }, { x: 0.1, z: 0 })).toEqual({ x: 0, z: 0 });
    expect(seek({ x: 0, z: 0 }, null)).toEqual({ x: 0, z: 0 });
  });

  it('finds the nearest interactable within range only', () => {
    const k = districtKiosk('tech');
    expect(nearestInteractable({ x: k.x + 0.5, z: k.z })?.id).toBe('kiosk-tech');
    expect(nearestInteractable({ x: 999, z: 999 })).toBeNull();
  });
});

describe('ambient life', () => {
  it('moves continuously around closed loops', () => {
    const loop = { cx: 0, cz: 0, hw: 5, hd: 5, clockwise: true };
    expect(loopLength(loop)).toBe(40);
    const a = pointOnLoop(loop, 0).p;
    const b = pointOnLoop(loop, 40).p;
    expect(a.x).toBeCloseTo(b.x);
    expect(a.z).toBeCloseTo(b.z);
    const mid = pointOnLoop(loop, 5).p;
    expect(Math.abs(mid.x) <= 5 && Math.abs(mid.z) <= 5).toBe(true);
  });

  it('scales density with quality settings', () => {
    expect(makePedestrians(QUALITY.low.pedestrians)).toHaveLength(QUALITY.low.pedestrians);
    expect(QUALITY.high.pedestrians).toBeGreaterThan(QUALITY.low.pedestrians);
    const cars = makeVehicles(QUALITY.high.vehicles);
    expect(cars.some((c) => c.kind === 'taxi')).toBe(true);
  });
});

describe('reference reconstruction layout', () => {
  it('spawns on the plaza just south of the ring, inside the plaza kiosk radius', () => {
    const p = spawnPoint({});
    expect(p.x).toBeCloseTo(PLAZA_RING.x);
    expect(p.z).toBeGreaterThan(PLAZA_RING.z);
    expect(nearestInteractable(p)?.id).toBe('kiosk-plaza');
    expect(groundHeight(p)).toBe(PLAZA_H);
  });

  it('places the reference neighbours around the plaza', () => {
    const at = (id: string) => DISTRICTS.find((d) => d.id === id)!.grid;
    expect(at('tech')).toEqual({ x: 1, z: 0 }); // north: office + markets board
    expect(at('healthcare')).toEqual({ x: 2, z: 0 }); // north-east: HOSPITAL sign
    expect(at('hospitality')).toEqual({ x: 2, z: 1 }); // east: rooftop-dining mall
    expect(at('ai-center')).toEqual({ x: 1, z: 2 }); // south label
  });

  it('keeps the plaza stage walkable and every other building solid and non-overlapping', () => {
    const stage = ALL_BUILDINGS.find((b) => b.id === 'b-plaza-stage')!;
    expect(COLLIDERS).not.toContainEqual(stage.aabb);
    const solid = ALL_BUILDINGS.filter((b) => b.style !== 'flat');
    for (let i = 0; i < solid.length; i++)
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i]!.aabb;
        const b = solid[j]!.aabb;
        const overlap = a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
        expect(overlap, `${solid[i]!.id} overlaps ${solid[j]!.id}`).toBe(false);
      }
  });

  it('keeps every building inside its block, off roads and the plaza', () => {
    for (const b of ALL_BUILDINGS.filter((x) => x.style !== 'flat')) {
      const c = b.center;
      expect(groundHeight(c), b.id).toBe(SIDEWALK_H);
      const r = b.aabb;
      expect(r.maxX < PLAZA_RECT.minX || r.minX > PLAZA_RECT.maxX || r.maxZ < PLAZA_RECT.minZ || r.minZ > PLAZA_RECT.maxZ, b.id).toBe(true);
    }
  });

  it('never plants street props inside buildings', () => {
    const props = buildCityProps();
    for (const t of props.trees.filter((x) => x.y <= SIDEWALK_H + 0.01))
      for (const b of ALL_BUILDINGS.filter((x) => x.style !== 'flat')) {
        const inside = t.x > b.aabb.minX && t.x < b.aabb.maxX && t.z > b.aabb.minZ && t.z < b.aabb.maxZ;
        expect(inside, `tree at ${t.x},${t.z} inside ${b.id}`).toBe(false);
      }
    expect(props.trees.length).toBeGreaterThan(150);
    expect(props.umbrellas.length).toBeGreaterThan(10);
  });

  it('puts most pedestrians on sidewalks with only a light crowd on the plaza', () => {
    const people = makePedestrians(QUALITY.high.pedestrians);
    const onPlaza = people.filter((w) => {
      const p = pointOnLoop(w.loop, w.offset).p;
      return p.x > PLAZA_RECT.minX && p.x < PLAZA_RECT.maxX && p.z > PLAZA_RECT.minZ && p.z < PLAZA_RECT.maxZ;
    });
    expect(onPlaza.length).toBeGreaterThan(8);
    expect(onPlaza.length).toBeLessThan(30);
  });
});
