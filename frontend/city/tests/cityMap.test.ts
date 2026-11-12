import { describe, expect, it } from 'vitest';
import { DISTRICTS, PARK_BLOCK } from '@grooveli/frontend-domain/public';
import { cityMapModel, mapDistrictAt } from '../src/world/mapData';
import { ALL_BUILDINGS, PLACED_BUILDINGS, ROADS, blockBounds, districtAt } from '../src/world/layout';
import { buildMarkings } from '../src/world/streets';

describe('city map model (derived from the 3D world data)', () => {
  const m = cityMapModel();

  it('represents every district by its real block, with its enterable landmarks', () => {
    expect(m.districts.map((d) => d.id).sort()).toEqual(DISTRICTS.map((d) => d.id).sort());
    for (const d of m.districts) {
      expect(d.block).toEqual(blockBounds(DISTRICTS.find((x) => x.id === d.id)!.grid));
      expect(d.label.x).toBeTypeOf('number');
    }
    const ai = m.districts.find((d) => d.id === 'ai-center')!;
    expect(ai.landmarks).toContain('AI Career Center');
    expect(m.districts.find((d) => d.id === 'apartment')!.landmarks).toContain('Your Apartment');
  });

  it('draws every non-flat building footprint at its world position', () => {
    expect(m.buildings.length).toBe(ALL_BUILDINGS.filter((b) => b.style !== 'flat' && b.h > 0).length);
    for (const b of m.buildings) {
      const src = ALL_BUILDINGS.find((x) => x.id === b.id)!;
      expect(b.rect).toEqual(src.aabb);
      if (b.landmark) expect(b.entrance).toEqual(src.entrance);
    }
    expect(m.buildings.filter((b) => b.landmark).length).toBe(PLACED_BUILDINGS.filter((b) => b.entrance).length);
  });

  it('uses the same roads, markings and park as the 3D ground', () => {
    expect(m.roads).toEqual(ROADS.filter((r) => !r.minor));
    expect(m.markings).toEqual(buildMarkings());
    expect(m.park.block).toEqual(blockBounds(PARK_BLOCK));
    expect(m.trees.length).toBeGreaterThan(50);
  });

  it('agrees with the world on where a point is', () => {
    for (const d of m.districts) {
      const c = { x: (d.lot.minX + d.lot.maxX) / 2, z: (d.lot.minZ + d.lot.maxZ) / 2 };
      expect(mapDistrictAt(c)).toBe(d.id);
      expect(districtAt(c)).toBe(d.id);
    }
  });
});
