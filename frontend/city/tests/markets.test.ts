import { describe, expect, it } from 'vitest';
import { cityConfig, safeExternalUrl } from '../src/app/config';
import { ALL_BUILDINGS, COLLIDERS, INTERACTABLES } from '../src/world/layout';
import { nearestInteractable } from '../src/world/movement';

describe('Global Markets billboard', () => {
  it('accepts only absolute http(s) destinations without credentials', () => {
    expect(safeExternalUrl('https://charts.example.com/markets')).toBe('https://charts.example.com/markets');
    expect(safeExternalUrl('  http://example.com  ')).toBe('http://example.com/');
    for (const bad of ['', '   ', undefined, null, 'javascript:alert(1)', 'data:text/html,hi', '/markets', 'charts.example.com', 'ftp://example.com', 'https://user:pass@example.com/']) {
      expect(safeExternalUrl(bad as string | null | undefined), String(bad)).toBeNull();
    }
  });

  it('has no destination until one is configured', () => {
    expect(cityConfig.marketsUrl).toBeNull();
  });

  it('exposes an interaction point on the sidewalk in front of the board', () => {
    const f = INTERACTABLES.find((i) => i.kind === 'feature' && i.id === 'markets-board')!;
    expect(f).toBeDefined();
    const b = ALL_BUILDINGS.find((x) => x.id === 'b-tech-tower')!;
    expect(f.position.x).toBeGreaterThan(b.aabb.minX);
    expect(f.position.x).toBeLessThan(b.aabb.maxX);
    expect(f.position.z).toBeGreaterThan(b.aabb.maxZ); // south (camera-facing) side
    for (const c of COLLIDERS) {
      const inside = f.position.x > c.minX && f.position.x < c.maxX && f.position.z > c.minZ && f.position.z < c.maxZ;
      expect(inside).toBe(false);
    }
    expect(nearestInteractable(f.position)?.id).toBe('markets-board');
  });
});
