import { describe, expect, it } from 'vitest';
import { HQ, HQ_ANCHORS, HQ_BOUNDS, HQ_COLLIDERS, HQ_ITEMS, HQ_SPAWN, HQ_STAFF, PARTITIONS, hqNavGrid, itemBox, partitionSegments, zoneAt } from '../src/world/hq';
import { findPath, isWalkable } from '../src/world/nav';
import { HQ_STATIONS } from '../src/app/interiors';
import type { AABB } from '../src/world/layout';

const overlap = (a: AABB, b: AABB, tol = 0.01) => a.minX < b.maxX - tol && a.maxX > b.minX + tol && a.minZ < b.maxZ - tol && a.maxZ > b.minZ + tol;

describe('HQ floor plan', () => {
  const solid = HQ_ITEMS.filter((i) => i.solid);

  it('keeps furniture inside the building and apart', () => {
    for (const i of HQ_ITEMS) {
      const b = itemBox(i);
      expect(b.minX, i.id).toBeGreaterThanOrEqual(HQ.minX + HQ.wallT / 2 - 0.01);
      expect(b.maxX, i.id).toBeLessThanOrEqual(HQ.maxX);
      expect(b.minZ, i.id).toBeGreaterThanOrEqual(HQ.minZ + HQ.wallT / 2 - 0.01);
      expect(b.maxZ, i.id).toBeLessThanOrEqual(HQ.maxZ);
    }
    const clashes: string[] = [];
    for (let a = 0; a < solid.length; a++) for (let b = a + 1; b < solid.length; b++) if (overlap(itemBox(solid[a]!), itemBox(solid[b]!))) clashes.push(`${solid[a]!.id} × ${solid[b]!.id}`);
    expect(clashes).toEqual([]);
  });

  it('never places furniture through walls or glass', () => {
    const clashes: string[] = [];
    for (const p of PARTITIONS)
      for (const [s, e] of partitionSegments(p)) {
        const t = p.kind === 'wall' ? HQ.wallT / 2 : 0.05;
        const seg: AABB = p.axis === 'x' ? { minX: s, maxX: e, minZ: p.at - t, maxZ: p.at + t } : { minX: p.at - t, maxX: p.at + t, minZ: s, maxZ: e };
        for (const i of solid) if (overlap(seg, itemBox(i), 0.02)) clashes.push(`${i.id} × ${p.id}`);
      }
    expect(clashes).toEqual([]);
  });

  it('has an anchor for every station, each on open floor and reachable from the entrance', () => {
    const g = hqNavGrid();
    expect(Object.keys(HQ_ANCHORS).sort()).toEqual(HQ_STATIONS.map((s) => s.id).sort());
    for (const s of HQ_STATIONS) expect(s.at, s.id).toEqual([HQ_ANCHORS[s.id]!.x, HQ_ANCHORS[s.id]!.z]);
    expect(isWalkable(g, HQ_SPAWN)).toBe(true);
    for (const [id, a] of Object.entries(HQ_ANCHORS)) {
      expect(isWalkable(g, a), `${id} on open floor`).toBe(true);
      const path = findPath(g, HQ_SPAWN, a);
      expect(path, `${id} reachable`).not.toBeNull();
      const end = path![path!.length - 1]!;
      expect(Math.hypot(end.x - a.x, end.z - a.z), id).toBeLessThan(0.25);
    }
  });

  it('routes around glass walls instead of through them', () => {
    const g = hqNavGrid();
    // Lobby → conference room must enter through the conference door gap (x = −5, z ∈ [−1.6, −0.6]).
    const path = findPath(g, HQ_SPAWN, { x: -7.4, z: -2.6 })!;
    expect(path).not.toBeNull();
    const crossing = path.find((p, i) => i > 0 && (path[i - 1]!.x - -5) * (p.x - -5) <= 0);
    expect(crossing).toBeDefined();
  });

  it('covers the required zones', () => {
    const zones = new Set(['executive', 'conference', 'interview', 'lounge', 'open-plan', 'talent', 'lobby', 'hr', 'departments'].map(String));
    for (const id of zones) expect(HQ_ITEMS.some((i) => zoneAt(i)?.id === id), id).toBe(true);
    expect(zoneAt(HQ_SPAWN)?.id).toBe('lobby');
  });

  it('seats simulated staff on real chairs and keeps walkers on open floor', () => {
    const g = hqNavGrid();
    for (const s of HQ_STAFF) {
      if (s.pose === 'sit') expect(HQ_ITEMS.some((i) => /chair|stool/.test(i.type) && i.x === s.x && i.z === s.z), s.id).toBe(true);
      for (const p of s.route ?? []) expect(isWalkable(g, p), s.id).toBe(true);
    }
    expect(HQ_COLLIDERS.length).toBeGreaterThan(HQ_ITEMS.filter((i) => i.solid).length);
    expect(HQ_BOUNDS.maxX).toBeLessThanOrEqual(HQ.maxX);
  });
});
