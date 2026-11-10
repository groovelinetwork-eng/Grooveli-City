import { describe, expect, it } from 'vitest';
import { AI, AI_ANCHORS, AI_BOUNDS, AI_ITEMS, AI_PARTITIONS, AI_ROBOT_ROUTES, AI_SPAWN, AI_STAFF, aiNavGrid, aiZoneAt } from '../src/world/aiCenter';
import { itemBox, partitionSegments } from '../src/world/interior';
import { findPath, isWalkable } from '../src/world/nav';
import { AI_CENTER_STATIONS, stationIntent } from '../src/app/interiors';
import type { AABB } from '../src/world/layout';

const overlap = (a: AABB, b: AABB, tol = 0.01) => a.minX < b.maxX - tol && a.maxX > b.minX + tol && a.minZ < b.maxZ - tol && a.maxZ > b.minZ + tol;

describe('AI Career Center floor plan', () => {
  const solid = AI_ITEMS.filter((i) => i.solid);

  it('keeps furniture inside the building, apart, and clear of walls and glass', () => {
    for (const i of AI_ITEMS) {
      const b = itemBox(i);
      expect(b.minX, i.id).toBeGreaterThanOrEqual(AI.minX + AI.wallT / 2 - 0.01);
      expect(b.maxX, i.id).toBeLessThanOrEqual(AI.maxX);
      expect(b.minZ, i.id).toBeGreaterThanOrEqual(AI.minZ + AI.wallT / 2 - 0.01);
      expect(b.maxZ, i.id).toBeLessThanOrEqual(AI.maxZ);
    }
    const clashes: string[] = [];
    for (let a = 0; a < solid.length; a++) for (let b = a + 1; b < solid.length; b++) if (overlap(itemBox(solid[a]!), itemBox(solid[b]!))) clashes.push(`${solid[a]!.id} × ${solid[b]!.id}`);
    for (const p of AI_PARTITIONS)
      for (const [s, e] of partitionSegments(p)) {
        const t = p.kind === 'wall' ? AI.wallT / 2 : 0.05;
        const seg: AABB = p.axis === 'x' ? { minX: s, maxX: e, minZ: p.at - t, maxZ: p.at + t } : { minX: p.at - t, maxX: p.at + t, minZ: s, maxZ: e };
        for (const i of solid) if (overlap(seg, itemBox(i), 0.02)) clashes.push(`${i.id} × ${p.id}`);
      }
    expect(clashes).toEqual([]);
  });

  it('places every station on open floor, reachable from the entrance', () => {
    const g = aiNavGrid();
    expect(Object.keys(AI_ANCHORS).sort()).toEqual(AI_CENTER_STATIONS.map((s) => s.id).sort());
    for (const s of AI_CENTER_STATIONS) expect(s.at, s.id).toEqual([AI_ANCHORS[s.id]!.x, AI_ANCHORS[s.id]!.z]);
    expect(isWalkable(g, AI_SPAWN)).toBe(true);
    for (const [id, a] of Object.entries(AI_ANCHORS)) {
      expect(isWalkable(g, a), `${id} on open floor`).toBe(true);
      const path = findPath(g, AI_SPAWN, a);
      expect(path, `${id} reachable`).not.toBeNull();
      const end = path![path!.length - 1]!;
      expect(Math.hypot(end.x - a.x, end.z - a.z), id).toBeLessThan(0.25);
    }
  });

  it('has every required zone furnished', () => {
    for (const id of ['skills-lab', 'pods', 'interview', 'pathway', 'reception', 'hall']) expect(AI_ITEMS.some((i) => aiZoneAt(i)?.id === id), id).toBe(true);
    expect(aiZoneAt(AI_SPAWN)?.id).toBe('reception');
    expect(AI_BOUNDS.maxX).toBeLessThanOrEqual(AI.maxX);
  });

  it('seats people on real seats and keeps walkers and robots on open floor', () => {
    const g = aiNavGrid();
    for (const s of AI_STAFF) {
      if (s.pose === 'sit') expect(AI_ITEMS.some((i) => /chair|stool/.test(i.type) && i.x === s.x && i.z === s.z), s.id).toBe(true);
      for (const p of s.route ?? []) expect(isWalkable(g, p), s.id).toBe(true);
    }
    for (const route of AI_ROBOT_ROUTES) for (const p of route) expect(isWalkable(g, p)).toBe(true);
  });

  it('keeps the original AI Center destinations', () => {
    expect(stationIntent('ai-center', 'assistant')).toEqual({ type: 'openCareerCenter' });
    expect(stationIntent('ai-center', 'matching')).toEqual({ type: 'browseJobs' });
    expect(stationIntent('ai-center', 'learning')).toEqual({ type: 'openLearning' });
    expect(stationIntent('ai-center', 'interview')).toEqual({ type: 'openInterviews' });
    expect(stationIntent('ai-center', 'cv')).toEqual({ type: 'openCv' });
    expect(stationIntent('ai-center', 'pathway')).toEqual({ type: 'openSkills' });
  });
});
