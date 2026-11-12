import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WHITE_UV, decalUV, type DecalName } from './atlas';

/**
 * Vehicle modelling kit. Vehicles are authored in metres with the front at +Z,
 * the ground at y = 0 and side profiles given as (z, y) points. Every part is
 * tagged with a surface (base colour + per-vertex material channels), and a
 * finished vehicle merges into ONE geometry, so each vehicle type renders as a
 * single instanced draw call with the shared vehicle material.
 */
export type P2 = readonly [z: number, y: number];

export interface Surface {
  color: string;
  /** 1 = tinted by the instance (body paint) colour. */
  paint?: number;
  /** 0 matte … 1 mirror-like (drives roughness and metalness). */
  gloss?: number;
  /** Emissive strength (lamps, signs), scaled by day/night. */
  glow?: number;
  /** Window glass: brightened and lit from inside at night. */
  glass?: number;
}

/** Interpolates the z where segment a→b crosses height y. */
export function zAtY(a: P2, b: P2, y: number): number {
  const t = (y - a[1]) / (b[1] - a[1]);
  return a[0] + (b[0] - a[0]) * t;
}

/** Linear interpolation of a polyline's y at z (polyline sorted by z, either direction). */
export function yAtZ(line: readonly P2[], z: number): number {
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const lo = Math.min(a[0], b[0]);
    const hi = Math.max(a[0], b[0]);
    if (z >= lo && z <= hi) return hi === lo ? Math.max(a[1], b[1]) : a[1] + ((b[1] - a[1]) * (z - a[0])) / (b[0] - a[0]);
  }
  return line[line.length - 1]![1];
}

/** Shrinks a convex, counter-clockwise (z right, y up) polygon by d. */
export function insetConvex(poly: readonly P2[], d: number): P2[] {
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dz = (b[0] - a[0]) / len;
    const dy = (b[1] - a[1]) / len;
    return { p: [a[0] - dy * d, a[1] + dz * d] as const, d: [dz, dy] as const };
  });
  return lines.map((l2, i) => {
    const l1 = lines[(i - 1 + n) % n]!;
    const cross = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
    const wz = l2.p[0] - l1.p[0];
    const wy = l2.p[1] - l1.p[1];
    const t = (wz * l2.d[1] - wy * l2.d[0]) / cross;
    return [l1.p[0] + l1.d[0] * t, l1.p[1] + l1.d[1] * t] as const;
  });
}

/** Points of a wheel-arch cut-out on a profile's bottom edge, traversed rear → front. */
export function archPoints(axleZ: number, wheelR: number, gap: number, bottom: number, segments: number): P2[] {
  const R = wheelR + gap;
  const pts: P2[] = [[axleZ - R, bottom]];
  for (let k = 0; k <= segments; k++) {
    const a = Math.PI - (Math.PI * k) / segments;
    pts.push([axleZ + R * Math.cos(a), wheelR + R * Math.sin(a)]);
  }
  pts.push([axleZ + R, bottom]);
  return pts;
}

export interface ExtrudeOpts {
  /** Rounding across the vehicle (x): how far in from each side the edges start to curve. */
  bevel?: number;
  /** Rounding within the profile: how far the side faces' outline is pulled in. */
  round?: number;
  x?: number;
}

/** Rounds the corner at p (between a→p and p→c) with a quadratic curve; returns the curve points. */
export function fillet(a: P2, p: P2, c: P2, t: number, segments: number): P2[] {
  const la = Math.hypot(a[0] - p[0], a[1] - p[1]);
  const lc = Math.hypot(c[0] - p[0], c[1] - p[1]);
  const q0: P2 = [p[0] + ((a[0] - p[0]) * t) / la, p[1] + ((a[1] - p[1]) * t) / la];
  const q2: P2 = [p[0] + ((c[0] - p[0]) * t) / lc, p[1] + ((c[1] - p[1]) * t) / lc];
  const out: P2[] = [];
  for (let k = 0; k <= segments; k++) {
    const u = k / segments;
    const w0 = (1 - u) * (1 - u);
    const w1 = 2 * u * (1 - u);
    const w2 = u * u;
    out.push([w0 * q0[0] + w1 * p[0] + w2 * q2[0], w0 * q0[1] + w1 * p[1] + w2 * q2[1]]);
  }
  return out;
}

export class VehicleBuilder {
  private parts: THREE.BufferGeometry[] = [];
  /** Optional vertex deformation applied to parts added while it is set (plan-view taper, tumblehome). */
  warp: ((v: THREE.Vector3) => void) | null = null;

  constructor(readonly lod: 0 | 1) {}

  get detailed(): boolean {
    return this.lod === 0;
  }

  /** Adds a geometry with a surface; `uv` keeps the geometry's own UVs remapped into an atlas rect. */
  add(geo: THREE.BufferGeometry, s: Surface, uv?: { u0: number; v0: number; u1: number; v1: number }): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const n = pos.count;
    if (this.warp) {
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        this.warp(v.fromBufferAttribute(pos, i));
        pos.setXYZ(i, v.x, v.y, v.z);
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', pos);
    out.setAttribute('normal', g.getAttribute('normal'));
    const uvs = new Float32Array(n * 2);
    const src = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
    for (let i = 0; i < n; i++) {
      if (uv && src) {
        uvs[i * 2] = uv.u0 + src.getX(i) * (uv.u1 - uv.u0);
        uvs[i * 2 + 1] = uv.v0 + src.getY(i) * (uv.v1 - uv.v0);
      } else {
        uvs[i * 2] = WHITE_UV[0];
        uvs[i * 2 + 1] = WHITE_UV[1];
      }
    }
    out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const c = new THREE.Color(s.color);
    const colors = new Float32Array(n * 3);
    const surf = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      colors.set([c.r, c.g, c.b], i * 3);
      surf.set([s.paint ?? 0, s.gloss ?? 0.3, s.glow ?? 0, s.glass ?? 0], i * 4);
    }
    out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    out.setAttribute('surf', new THREE.BufferAttribute(surf, 4));
    this.parts.push(out);
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, s: Surface, rotX = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotX) g.rotateX(rotX);
    return this.add(g.translate(x, y, z), s);
  }

  /** Box mirrored on both sides (x and -x). */
  pair(w: number, h: number, d: number, x: number, y: number, z: number, s: Surface): this {
    return this.box(w, h, d, x, y, z, s).box(w, h, d, -x, y, z, s);
  }

  /** Cylinder whose axis runs across the vehicle (x). */
  axleCyl(r: number, width: number, x: number, y: number, z: number, s: Surface, segments = 14): this {
    return this.add(new THREE.CylinderGeometry(r, r, width, segments).rotateZ(Math.PI / 2).translate(x, y, z), s);
  }

  /** Flat disc facing outward along ±x (wheel rims, hub caps). */
  disc(r: number, side: 1 | -1, x: number, y: number, z: number, s: Surface, segments = 12): this {
    return this.add(new THREE.CircleGeometry(r, segments).rotateY((side * Math.PI) / 2).translate(x, y, z), s);
  }

  /** Side profile (z, y; counter-clockwise) extruded across the vehicle, centred on x. */
  extrude(profile: readonly P2[], width: number, s: Surface, opts: ExtrudeOpts = {}): this {
    const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
    return this.extrudeShape(shape, width, s, opts);
  }

  extrudeShape(shape: THREE.Shape, width: number, s: Surface, opts: ExtrudeOpts = {}): this {
    const bevel = Math.min(opts.bevel ?? 0, width / 4);
    const round = Math.min(opts.round ?? bevel * 0.7, bevel);
    const segs = this.detailed ? 2 : 1;
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: width - 2 * bevel,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: round,
      bevelOffset: -round,
      bevelSegments: segs,
      curveSegments: this.detailed ? 10 : 5,
    });
    // shape x → vehicle z, shape y → y, extrusion → x (rotation keeps winding)
    g.translate(0, 0, -(width - 2 * bevel) / 2);
    g.rotateY(-Math.PI / 2);
    if (opts.x) g.translate(opts.x, 0, 0);
    return this.add(g, s);
  }

  /** Thin plate lying along the profile segment a→b (windscreens, rear windows, glass roofs). */
  panel(a: P2, b: P2, width: number, s: Surface, opts: { inset?: number; lift?: number; thick?: number } = {}): this {
    const inset = opts.inset ?? 0;
    const thick = opts.thick ?? 0.03;
    const dz = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dz, dy);
    const ux = dz / len;
    const uy = dy / len;
    // outward normal of a counter-clockwise profile edge
    const nz = uy;
    const ny = -ux;
    const lift = (opts.lift ?? 0.012) + thick / 2;
    const g = new THREE.BoxGeometry(width, thick, Math.max(0.01, len - 2 * inset));
    g.rotateX(Math.atan2(-uy, ux));
    g.translate(0, (a[1] + b[1]) / 2 + ny * lift, (a[0] + b[0]) / 2 + nz * lift);
    return this.add(g, s);
  }

  /**
   * Flat decal quad from the atlas. side: +1/-1 = right/left flank (normal ±x),
   * 'front'/'back' = facing ±z. `mirror` keeps graphics pointing rearward on both flanks.
   */
  decal(name: DecalName, side: 1 | -1 | 'front' | 'back', at: { x: number; y: number; z: number }, w: number, h: number, s: Surface, mirror = false): this {
    const g = new THREE.PlaneGeometry(w, h);
    if (side === 1) g.rotateY(Math.PI / 2);
    else if (side === -1) g.rotateY(-Math.PI / 2);
    else if (side === 'back') g.rotateY(Math.PI);
    if (mirror && side === -1) {
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    }
    g.translate(at.x, at.y, at.z);
    return this.add(g, s, decalUV(name));
  }

  /** Decal on both flanks at |x| = halfWidth. */
  flankDecals(name: DecalName, halfWidth: number, y: number, z: number, w: number, h: number, s: Surface, mirror = false): this {
    return this.decal(name, 1, { x: halfWidth, y, z }, w, h, s, mirror).decal(name, -1, { x: -halfWidth, y, z }, w, h, s, mirror);
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false);
    if (!g) throw new Error('vehicle geometry merge failed');
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
