import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PLACED_BUILDINGS } from '../src/world/layout';
import { PRELOAD_RADIUS, preloadTargetAt } from '../src/app/preloadTarget';
import { roundedBoxCacheSize, roundedBoxGeometry } from '../src/scene/interior/roundedBox';
import { sharedGeometry, sharedStandard } from '../src/scene/sharedGeometry';
import { HIDDEN_SCENE, inHiddenScene } from '../src/scene/sceneActive';

// jsdom has no 2D canvas: a permissive stand-in lets the HQ texture painters run.
beforeAll(() => {
  const noop = () => undefined;
  const obj = (): unknown => new Proxy({}, { get: () => noop });
  const context = (canvas: HTMLCanvasElement) =>
    new Proxy(
      {},
      {
        get: (_t, k) => {
          if (k === 'canvas') return canvas;
          if (k === 'measureText') return (s: string) => ({ width: String(s).length * 8 });
          if (k === 'getImageData' || k === 'createImageData') return (_x: number, _y: number, w = 1, h = 1) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
          if (typeof k === 'string' && /^(create|get)/.test(k)) return obj;
          return noop;
        },
        set: () => true,
      },
    );
  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
    return context(this);
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe('background preparation target', () => {
  const hqs = PLACED_BUILDINGS.filter((b) => b.enterable && b.entrance && b.district !== 'apartment' && b.district !== 'ai-center');

  it('picks the company HQ whose entrance the player is walking up to', () => {
    expect(hqs.length).toBeGreaterThan(0);
    const b = hqs[0]!;
    expect(preloadTargetAt({ x: b.entrance!.x, z: b.entrance!.z + 3 })?.id).toBe(b.id);
  });

  it('ignores HQs that are far away and never targets the apartment or AI Center', () => {
    const b = hqs[0]!;
    const far = { x: b.entrance!.x + PRELOAD_RADIUS * 4, z: b.entrance!.z + PRELOAD_RADIUS * 4 };
    const t = preloadTargetAt(far);
    if (t) expect(Math.hypot(t.entrance!.x - far.x, t.entrance!.z - far.z)).toBeLessThan(PRELOAD_RADIUS);
    for (const other of PLACED_BUILDINGS.filter((x) => x.entrance && (x.district === 'apartment' || x.district === 'ai-center'))) {
      expect(preloadTargetAt(other.entrance!, 0.5)).toBeNull();
    }
  });
});

describe('shared interior geometry', () => {
  it('builds each rounded-box size once, centred and at the requested size', () => {
    const before = roundedBoxCacheSize();
    const a = roundedBoxGeometry(1.2, 0.4, 0.6, 0.04, 3);
    const b = roundedBoxGeometry(1.2, 0.4, 0.6, 0.04, 3);
    expect(a).toBe(b);
    expect(roundedBoxCacheSize()).toBe(before + 1);
    a.computeBoundingBox();
    const size = a.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(1.2, 3);
    expect(size.y).toBeCloseTo(0.4, 3);
    expect(size.z).toBeCloseTo(0.6, 3);
    expect(a.boundingBox!.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-6);
    expect(a.getAttribute('normal').count).toBe(a.getAttribute('position').count);
  });

  it('shares avatar primitives and plain materials', () => {
    expect(sharedGeometry('capsule', 0.072, 0.3, 4, 12)).toBe(sharedGeometry('capsule', 0.072, 0.3, 4, 12));
    expect(sharedGeometry('sphere', 0.15, 24, 18)).not.toBe(sharedGeometry('sphere', 0.15, 24, 16));
    const m = sharedStandard('#22d3ee', 1, 0, '#22d3ee', 0.3);
    expect(sharedStandard('#22d3ee', 1, 0, '#22d3ee', 0.3)).toBe(m);
    expect(m.roughness).toBe(1);
    expect(m.emissiveIntensity).toBe(0.3);
  });
});

describe('hidden scenes', () => {
  it('marks every object inside a hidden scene so it ignores pointer events', () => {
    const street = new THREE.Group();
    const building = new THREE.Mesh();
    street.add(building);
    const interiorFloor = new THREE.Mesh();
    interiorFloor.visible = false; // invisible click targets inside the active scene still work
    expect(inHiddenScene(building)).toBe(false);
    street.userData[HIDDEN_SCENE] = true;
    expect(inHiddenScene(building)).toBe(true);
    expect(inHiddenScene(interiorFloor)).toBe(false);
  });
});

describe('HQ resources', () => {
  it('prepares an HQ texture set step by step, then reuses it on every visit', async () => {
    const { DEMO_HQ } = await import('../src/scene/hq/HqOffice');
    const { hqTextureSet, isHqPrepared, prepareHqTextureStep, hqTextures, hqMaterials, hqBrandMaterials } = await import('../src/scene/hq/hqResources');
    expect(isHqPrepared(DEMO_HQ)).toBe(false);
    let steps = 0;
    while (!prepareHqTextureStep(DEMO_HQ)) steps++;
    expect(steps).toBeGreaterThan(10); // one texture per idle slice
    expect(isHqPrepared(DEMO_HQ)).toBe(true);
    const set = hqTextureSet(DEMO_HQ);
    expect(hqTextureSet(DEMO_HQ)).toBe(set);
    expect(hqTextures(DEMO_HQ).length).toBeGreaterThan(20);
    expect(hqMaterials()).toBe(hqMaterials());
    expect(hqBrandMaterials('#2563eb')).toBe(hqBrandMaterials('#2563eb'));
  });
});
