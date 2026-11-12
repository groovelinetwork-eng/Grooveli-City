import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildVehicle } from '../src/scene/vehicles/models';
import { insetConvex, archPoints } from '../src/scene/vehicles/kit';
import { decalUV, WHITE_UV, DECAL_PX, ATLAS_SIZE } from '../src/scene/vehicles/atlas';
import { TRAFFIC_MIX, VEHICLE_KINDS, VEHICLE_PALETTE, VEHICLE_SPECS } from '../src/world/vehicles';
import { QUALITY, makeVehicles, pointOnLoop, trafficLoop, type Loop } from '../src/world/ambient';
import { GRID_H, GRID_W } from '../src/world/layout';

const models = new Map(VEHICLE_KINDS.map((k) => [k, [buildVehicle(k, 0), buildVehicle(k, 1)] as const]));
const tris = (g: THREE.BufferGeometry) => g.getAttribute('position').count / 3;

/** Bounding box of the vertices whose `surf` channel matches. */
function boxWhere(g: THREE.BufferGeometry, pick: (surf: number[]) => boolean) {
  const pos = g.getAttribute('position');
  const surf = g.getAttribute('surf');
  const b = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) if (pick([surf.getX(i), surf.getY(i), surf.getZ(i), surf.getW(i)])) b.expandByPoint(v.fromBufferAttribute(pos, i));
  return b;
}

describe('vehicle models', () => {
  it('builds every catalogue vehicle to its documented size, standing on the road', () => {
    for (const kind of VEHICLE_KINDS) {
      const spec = VEHICLE_SPECS[kind];
      for (const g of models.get(kind)!) {
        const bb = g.boundingBox!;
        const size = bb.getSize(new THREE.Vector3());
        expect(size.z, `${kind} length`).toBeGreaterThan(spec.length - 0.02);
        expect(size.z, `${kind} length`).toBeLessThan(spec.length + 0.15);
        // width includes mirrors (bus mirrors reach ~0.16 m beyond each side)
        expect(size.x, `${kind} width`).toBeGreaterThan(spec.width - 0.02);
        expect(size.x, `${kind} width`).toBeLessThan(spec.width + 0.36);
        expect(size.y, `${kind} height`).toBeGreaterThan(spec.height - 0.12);
        expect(size.y, `${kind} height`).toBeLessThan(spec.height + 0.12);
        expect(bb.min.y, `${kind} wheels on the ground`).toBeCloseTo(0, 2);
        expect(Math.abs(bb.max.x + bb.min.x), `${kind} centred`).toBeLessThan(0.02);
      }
    }
  });

  it('carries the attributes the shared material needs, in matching counts', () => {
    for (const [kind, [g]] of models) {
      const n = g.getAttribute('position').count;
      for (const a of ['normal', 'uv', 'color', 'surf']) expect(g.getAttribute(a)?.count, `${kind} ${a}`).toBe(n);
      expect(g.index).toBeNull();
    }
  });

  it('faces forward: headlamps at the front (+z), red tail lamps at the rear', () => {
    for (const [kind, [g]] of models) {
      const glow = boxWhere(g, (s) => s[2] > 0.9 && s[0] === 0);
      expect(glow.max.z, `${kind} headlamps`).toBeGreaterThan(VEHICLE_SPECS[kind].length / 2 - 0.4);
      const pos = g.getAttribute('position');
      const col = g.getAttribute('color');
      const surf = g.getAttribute('surf');
      let tailMaxZ = -Infinity;
      for (let i = 0; i < pos.count; i++) if (surf.getZ(i) > 0.8 && col.getX(i) > 0.6 && col.getY(i) < 0.1) tailMaxZ = Math.max(tailMaxZ, pos.getZ(i));
      expect(tailMaxZ, `${kind} tail lamps`).toBeLessThan(-VEHICLE_SPECS[kind].length / 2 + 0.2);
    }
  });

  it('has windows (glass) and body paint on every vehicle', () => {
    for (const [kind, [g]] of models) {
      expect(boxWhere(g, (s) => s[3] > 0).isEmpty(), `${kind} glass`).toBe(false);
      const paint = boxWhere(g, (s) => s[0] === 1);
      expect(paint.getSize(new THREE.Vector3()).z, `${kind} painted body`).toBeGreaterThan(VEHICLE_SPECS[kind].length * 0.9);
    }
  });

  it('gives each type a distinct silhouette (length / width / height signature)', () => {
    const sig = VEHICLE_KINDS.map((k) => {
      const s = models.get(k)![0].boundingBox!.getSize(new THREE.Vector3());
      return `${s.z.toFixed(2)}|${s.y.toFixed(2)}`;
    });
    // taxi shares the midsize body by design, but its roof sign changes the height
    expect(new Set(sig).size).toBe(VEHICLE_KINDS.length);
    const h = (k: (typeof VEHICLE_KINDS)[number]) => models.get(k)![0].boundingBox!.max.y;
    expect(h('suv')).toBeGreaterThan(h('midsize') + 0.25);
    expect(h('van')).toBeGreaterThan(h('suv') + 0.5);
    expect(h('bus')).toBeGreaterThan(h('van'));
  });

  it('keeps triangle budgets, with a lighter far LOD', () => {
    for (const [kind, [near, far]] of models) {
      expect(tris(far), kind).toBeLessThan(tris(near));
      expect(tris(near), kind).toBeLessThan(kind === 'bus' ? 4000 : 3000);
    }
  });
});

describe('modelling kit', () => {
  it('insets a convex window outline evenly', () => {
    const sq = insetConvex(
      [
        [0, 0],
        [2, 0],
        [2, 1],
        [0, 1],
      ],
      0.1,
    );
    expect(sq[0]![0]).toBeCloseTo(0.1);
    expect(sq[0]![1]).toBeCloseTo(0.1);
    expect(sq[2]![0]).toBeCloseTo(1.9);
    expect(sq[2]![1]).toBeCloseTo(0.9);
  });

  it('cuts wheel arches as a half circle clear of the tyre', () => {
    const pts = archPoints(1, 0.35, 0.06, 0.2, 8);
    const top = Math.max(...pts.map((p) => p[1]));
    expect(top).toBeCloseTo(0.35 + 0.41);
    expect(pts[0]).toEqual([1 - 0.41, 0.2]);
  });

  it('maps decals inside the atlas and keeps the white block separate', () => {
    for (const name of Object.keys(DECAL_PX) as (keyof typeof DECAL_PX)[]) {
      const r = decalUV(name);
      expect(r.u0).toBeGreaterThanOrEqual(0);
      expect(r.u1).toBeLessThanOrEqual(1);
      expect(r.v0).toBeGreaterThanOrEqual(0);
      expect(r.v1).toBeLessThanOrEqual(1);
    }
    const w = decalUV('white');
    expect(WHITE_UV[0]).toBeGreaterThan(w.u0);
    expect(WHITE_UV[0]).toBeLessThan(w.u1);
    expect(WHITE_UV[1]).toBeGreaterThan(w.v0);
    expect(WHITE_UV[1]).toBeLessThan(w.v1);
    expect(ATLAS_SIZE.w).toBe(1024);
  });
});

describe('traffic mix', () => {
  it('shows every vehicle type at medium/high quality and eight types even at low', () => {
    for (const q of ['medium', 'high'] as const) expect(new Set(makeVehicles(QUALITY[q].vehicles).map((v) => v.kind)).size).toBe(VEHICLE_KINDS.length);
    expect(new Set(makeVehicles(QUALITY.low.vehicles).map((v) => v.kind)).size).toBe(8);
    expect(new Set(TRAFFIC_MIX)).toEqual(new Set(VEHICLE_KINDS));
  });

  it('paints vehicles from the design palette and keeps taxis yellow', () => {
    const palette = new Set<string>(Object.values(VEHICLE_PALETTE));
    for (const v of makeVehicles(QUALITY.high.vehicles)) {
      expect(palette.has(v.color)).toBe(true);
      if (v.kind === 'taxi') expect(v.color).toBe(VEHICLE_PALETTE.yellow);
    }
  });

  it('is deterministic and never lets a vehicle catch the one ahead on its loop', () => {
    const a = makeVehicles(QUALITY.high.vehicles);
    expect(makeVehicles(QUALITY.high.vehicles)).toEqual(a);
    const byLoop = new Map<number, typeof a>();
    for (const v of a) byLoop.set(v.loopId, [...(byLoop.get(v.loopId) ?? []), v]);
    for (const list of byLoop.values()) {
      expect(new Set(list.map((v) => v.speed)).size).toBe(1);
      expect(new Set(list.map((v) => v.loop.clockwise)).size).toBe(1);
      // bumper-to-bumper gap stays constant over time (same speed), check it is roomy
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const pa = pointOnLoop(list[i]!.loop, list[i]!.offset).p;
          const pb = pointOnLoop(list[j]!.loop, list[j]!.offset).p;
          expect(Math.hypot(pa.x - pb.x, pa.z - pb.z)).toBeGreaterThan(8);
        }
    }
  });
});

/** The four straight edges of a loop with their travel direction. */
function edges(l: Loop) {
  const w = 2 * l.hw;
  const d = 2 * l.hd;
  // counter-clockwise loops are traversed from the west edge
  const lens = l.clockwise ? [w, d, w, d] : [d, w, d, w];
  return lens.map((len, k) => {
    const s0 = lens.slice(0, k).reduce((sum, x) => sum + x, 0);
    const a = pointOnLoop(l, s0 + 0.01).p;
    const b = pointOnLoop(l, s0 + len - 0.01).p;
    return { a, b, vertical: Math.abs(a.x - b.x) < 1e-6 };
  });
}

describe('traffic lanes', () => {
  it('keeps both lanes of every shared street apart and flowing the same way', () => {
    const loops = [];
    for (let x = 0; x < GRID_W; x++) for (let z = 0; z < GRID_H; z++) loops.push(trafficLoop({ x, z }));
    let shared = 0;
    for (let i = 0; i < loops.length; i++)
      for (let j = i + 1; j < loops.length; j++)
        for (const e of edges(loops[i]!))
          for (const f of edges(loops[j]!)) {
            if (e.vertical !== f.vertical) continue;
            const gap = e.vertical ? Math.abs(e.a.x - f.a.x) : Math.abs(e.a.z - f.a.z);
            const [e0, e1] = e.vertical ? [e.a.z, e.b.z] : [e.a.x, e.b.x];
            const [f0, f1] = f.vertical ? [f.a.z, f.b.z] : [f.a.x, f.b.x];
            const overlap = Math.min(Math.max(e0, e1), Math.max(f0, f1)) - Math.max(Math.min(e0, e1), Math.min(f0, f1));
            if (gap > 4 || overlap < 2) continue;
            shared++;
            expect(gap, 'lane separation').toBeGreaterThan(1.89);
            expect(Math.sign(e1 - e0), 'same direction on a shared street').toBe(Math.sign(f1 - f0));
          }
    expect(shared).toBeGreaterThan(10);
  });
});
