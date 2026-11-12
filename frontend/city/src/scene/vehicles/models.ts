import * as THREE from 'three';
import type { VehicleKind } from '../../world/vehicles';
import { VehicleBuilder, archPoints, fillet, insetConvex, yAtZ, zAtY, type P2, type Surface } from './kit';

/**
 * Procedural, brand-free vehicle models matching the Grooveli City vehicle
 * design board. Front is +Z, units are metres. Every model is built at two
 * levels of detail: LOD 0 (close views) and LOD 1 (zoomed-out views: fewer
 * curve segments, no seams, handles, plates or hub caps).
 */

const PAINT: Surface = { color: '#ffffff', paint: 1, gloss: 0.62 };
const GLASS: Surface = { color: '#2c4468', gloss: 0.95, glass: 1 };
const BUS_GLASS: Surface = { color: '#2c4468', gloss: 0.95, glass: 1.5 };
const ROOF_GLASS: Surface = { color: '#1c2a40', gloss: 0.97, glass: 0.6 };
/** Blacked-out pillars blend with the tinted glass. */
const PILLAR_DARK: Surface = { color: '#141c2a', gloss: 0.9 };
const TRIM: Surface = { color: '#16191f', gloss: 0.3 };
const GLOSS_BLACK: Surface = { color: '#0b0d12', gloss: 0.85 };
const CHROME: Surface = { color: '#e2e6ec', gloss: 1 };
/** Panel gaps: a darker shade of the body paint. */
const SEAM: Surface = { color: '#3c3c3c', paint: 1, gloss: 0.3 };
const TYRE: Surface = { color: '#141619', gloss: 0.06 };
const RIM_SILVER: Surface = { color: '#c6ccd4', gloss: 0.92 };
const RIM_DARK: Surface = { color: '#3a404c', gloss: 0.8 };
const LINER: Surface = { color: '#08090c', gloss: 0 };
const HEAD: Surface = { color: '#f3f7ff', gloss: 0.9, glow: 1 };
const TAIL: Surface = { color: '#e3202d', gloss: 0.8, glow: 0.85 };
const AMBER: Surface = { color: '#f59e0b', gloss: 0.7, glow: 0.95 };
const PLATE: Surface = { color: '#eef1f5', gloss: 0.3 };
const BED: Surface = { color: '#2a2f38', gloss: 0.15 };
const ROOF_UNIT: Surface = { color: '#d6dbe2', gloss: 0.4 };
const TAXI_LAMP: Surface = { color: '#fde047', gloss: 0.4, glow: 0.7 };
const DECAL: Surface = { color: '#ffffff', gloss: 0.55 };
const DECAL_GLOW: Surface = { color: '#ffffff', gloss: 0.4, glow: 0.95 };

function wheels(b: VehicleBuilder, axles: readonly number[], r: number, W: number, tyreW: number, rim: Surface) {
  const seg = b.detailed ? 12 : 8; // multiples of 4 put a vertex exactly on the road
  for (const az of axles)
    for (const sx of [1, -1] as const) {
      const x = sx * (W / 2 - tyreW / 2 - 0.02);
      b.axleCyl(r, tyreW, x, r, az, TYRE, seg);
      // rim and hub cap: flat discs on the outer face (the inner face is never seen)
      const face = x + sx * (tyreW / 2 + 0.004);
      b.disc(r * 0.7, sx, face, r, az, rim, seg);
      if (b.detailed) b.disc(r * 0.2, sx, face + sx * 0.004, r, az, TRIM, 6);
    }
}

/** Dark wheel-well liners filling the arch cut-outs between the wheels. */
function liners(b: VehicleBuilder, axles: readonly number[], r: number, gap: number, clr: number, W: number, tyreW: number) {
  const R = r + gap;
  for (const az of axles) b.box(W - 2 * (tyreW + 0.05), r + R - clr - 0.02, 2 * R * 0.96, 0, (clr + r + R) / 2, az, LINER);
}

interface CarSpec {
  L: number;
  W: number;
  clr: number;
  r: number;
  axleF: number;
  axleR: number;
  noseH: number;
  hoodH: number;
  beltH: number;
  deckH: number;
  tailH: number;
  cowlZ: number;
  roofFZ: number;
  roofRZ: number;
  deckZ: number;
  roofH: number;
  cabinW: number;
  grille: 'none' | 'wide' | 'big' | 'chrome';
  tail: 'pair' | 'bar';
  rim: Surface;
  pillar: Surface;
  glassRoof?: boolean;
  rails?: boolean;
  cladding?: boolean;
  chromeLine?: boolean;
  /** Extra pillar between side windows, as a fraction from the front (SUV third window). */
  cPillar?: number;
  /** Pickup: open load bed behind the cab (deckZ = cab back). */
  bed?: { floorH: number };
}

const GAP = 0.05;

/** Body, cabin and trim shared by all passenger cars and the pickup. Returns reference points for extras. */
function buildCar(b: VehicleBuilder, s: CarSpec) {
  const { L, W } = s;
  const fz = L / 2;
  const rz = -L / 2;
  const R = s.r + GAP;
  const archSeg = b.detailed ? 9 : 5;

  // ---- lower body: side silhouette with wheel-arch cut-outs
  let top: P2[] = [
    [fz - 0.04, s.noseH],
    [fz - 0.35, s.noseH + (s.hoodH - s.noseH) * 0.55],
    [s.cowlZ, s.hoodH],
    [(s.cowlZ + s.deckZ) / 2, s.beltH],
  ];
  if (s.bed) top.push([s.deckZ, s.beltH], [s.deckZ - 0.03, s.bed.floorH], [rz + 0.03, s.bed.floorH]);
  else {
    top.push([s.deckZ, s.deckH]);
    if (s.deckZ - (rz + 0.3) > 0.1) top.push([rz + 0.3, s.deckH - 0.02]);
    top.push([rz + 0.05, s.tailH]);
  }
  // fenders: keep at least 15 cm of body above every arch (the rounded flanks pull the outline in by 5 cm)
  for (const az of [s.axleF, s.axleR])
    for (const [dz, k] of [
      [-0.6, 0.8],
      [0, 1],
      [0.6, 0.8],
    ] as const) {
      const z = az + dz * R;
      const need = s.r + R * k + 0.15;
      if (yAtZ(top, z) < need) {
        const i = top.findIndex((p) => p[0] < z);
        if (i > 0) top = [...top.slice(0, i), [z, need], ...top.slice(i)];
      }
    }
  const profile: P2[] = [
    [rz + 0.14, s.clr],
    ...archPoints(s.axleR, s.r, GAP, s.clr, archSeg),
    ...archPoints(s.axleF, s.r, GAP, s.clr, archSeg),
    [fz - 0.2, s.clr],
    [fz - 0.02, s.clr + 0.14],
    [fz, s.noseH - 0.14],
    ...top,
    [rz, s.bed ? s.bed.floorH - 0.08 : s.tailH - 0.22],
    [rz, s.clr + 0.16],
  ];
  // wheels and liners stay true; everything else is shaped: rounded nose/tail in plan, cabin sides leaning in
  liners(b, [s.axleF, s.axleR], s.r, GAP, s.clr, W, 0.24);
  wheels(b, [s.axleF, s.axleR], s.r, W, 0.24, s.rim);
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const lean = s.bed ? 0.07 : 0.11;
  b.warp = (v) => {
    const plan = 1 - 0.11 * smooth(fz - 0.75, fz + 0.02, v.z) - (s.bed ? 0 : 0.07) * smooth(-rz - 0.6, -rz + 0.02, -v.z);
    const up = smooth(s.beltH - 0.02, s.roofH + 0.05, v.y);
    v.x *= plan * (1 - lean * up);
  };
  b.extrude(profile, W, PAINT, { bevel: 0.17, round: 0.05 });

  // ---- cabin (greenhouse)
  const cab = s.cabinW;
  const deckTop = s.bed ? s.beltH : s.deckH;
  const wsA: P2 = [s.cowlZ, s.hoodH - 0.05];
  const wsB: P2 = [s.roofFZ, s.roofH];
  const rwA: P2 = [s.roofRZ, s.roofH];
  const rwB: P2 = [s.deckZ, deckTop - 0.05];
  // rounded roof corners; the glass follows the straight parts
  const front = fillet(wsA, wsB, rwA, 0.24, b.detailed ? 4 : 2);
  const back = fillet(wsB, rwA, rwB, 0.2, b.detailed ? 4 : 2);
  b.extrude([rwB, wsA, ...front, ...back], cab, PAINT, { bevel: 0.13, round: 0.045 });
  b.panel(wsA, front[0]!, cab - 0.16, GLASS, { inset: 0.04 });
  b.panel(back[back.length - 1]!, rwB, cab - 0.18, GLASS, { inset: 0.05 });
  if (s.glassRoof) b.panel(front[front.length - 1]!, back[0]!, cab - 0.14, ROOF_GLASS, { inset: -0.03, thick: 0.012, lift: 0.004 });

  // side windows: the cabin side above the sill, inset by the pillar width
  const yb = s.beltH + 0.02;
  const win = insetConvex([[zAtY(rwA, rwB, yb), yb], [zAtY(wsA, wsB, yb), yb], wsB, rwA], 0.085);
  b.extrude(win, cab + 0.016, GLASS);
  const zF = win[1]![0];
  const zR = win[0]![0];
  const zB = zF - (zF - zR) * (s.bed ? 0.52 : 0.46);
  const pillarH = s.roofH - yb - 0.05;
  b.box(cab + 0.02, pillarH, 0.075, 0, yb + pillarH / 2, zB, s.pillar);
  if (s.cPillar) b.box(cab + 0.02, pillarH, 0.1, 0, yb + pillarH / 2, zF - (zF - zR) * s.cPillar, s.pillar);
  if (s.chromeLine) b.box(cab + 0.026, 0.022, zF - zR + 0.04, 0, yb + 0.072, (zF + zR) / 2, CHROME);
  if (s.rails) b.pair(0.05, 0.05, Math.abs(s.roofFZ - s.roofRZ) - 0.3, cab / 2 - 0.13, s.roofH + 0.035, (s.roofFZ + s.roofRZ) / 2, TRIM);

  // ---- front
  if (s.grille === 'none') {
    b.pair(0.52, 0.06, 0.3, W / 2 - 0.32, s.noseH - 0.02, fz - 0.14, HEAD);
    b.box(W * 0.5, 0.1, 0.06, 0, s.clr + 0.2, fz - 0.01, TRIM);
  } else {
    b.pair(0.46, 0.08, 0.3, W / 2 - 0.31, s.noseH - 0.03, fz - 0.14, HEAD);
    if (s.grille === 'wide') b.box(W * 0.46, 0.14, 0.06, 0, s.noseH - 0.12, fz, GLOSS_BLACK);
    if (s.grille === 'big') b.box(W * 0.56, 0.3, 0.06, 0, s.noseH - 0.2, fz, GLOSS_BLACK);
    if (s.grille === 'chrome') {
      b.box(W * 0.42, 0.27, 0.06, 0, s.noseH - 0.17, fz + 0.004, CHROME);
      b.box(W * 0.36, 0.21, 0.06, 0, s.noseH - 0.17, fz + 0.012, GLOSS_BLACK);
    }
    b.box(W * 0.62, 0.12, 0.06, 0, s.clr + 0.17, fz - 0.01, TRIM);
  }
  if (s.cladding) {
    b.box(W + 0.02, 0.18, 0.1, 0, s.clr + 0.1, fz - 0.06, TRIM);
    b.box(W + 0.02, 0.18, 0.1, 0, s.clr + 0.1, rz + 0.06, TRIM);
  }

  // ---- rear lights
  if (s.bed) b.pair(0.09, 0.3, 0.06, W / 2 - 0.05, s.bed.floorH + 0.14, rz - 0.005, TAIL);
  else {
    b.pair(0.42, 0.11, 0.06, W / 2 - 0.27, s.tailH - 0.1, rz, TAIL);
    if (s.tail === 'bar') b.box(W - 0.5, 0.05, 0.05, 0, s.tailH - 0.1, rz, TAIL);
  }

  // ---- side mirrors (outside the cabin lean)
  const warp = b.warp;
  b.warp = null;
  b.pair(0.09, 0.11, 0.2, cab / 2 + 0.09, s.hoodH + 0.1, s.cowlZ - 0.14, s.pillar === PILLAR_DARK ? GLOSS_BLACK : PAINT);

  b.warp = warp;
  // ---- wheel-arch cladding (SUVs)
  if (s.cladding) {
    for (const az of [s.axleF, s.axleR]) {
      const flare = new THREE.Shape();
      flare.absarc(az, s.r, R + 0.075, 0, Math.PI, false);
      flare.absarc(az, s.r, R, Math.PI, 0, true);
      for (const sx of [1, -1]) b.extrudeShape(flare, 0.05, TRIM, { x: sx * (W / 2 - 0.015) });
    }
    b.pair(0.03, 0.13, s.axleF - s.axleR - 2 * R - 0.05, W / 2 + 0.005, s.clr + 0.075, (s.axleF + s.axleR) / 2, TRIM);
  }

  // ---- close-up details
  if (b.detailed) {
    const sx = W / 2 + 0.004;
    const sill = s.clr + 0.12;
    const seams = [s.axleF - R - 0.08, zB, s.bed ? s.deckZ + 0.04 : s.axleR + R + 0.05];
    for (const z of seams) {
      const topY = Math.min(yAtZ(top, z), s.beltH) - 0.03;
      b.pair(0.008, topY - sill, 0.014, sx, (topY + sill) / 2, z, SEAM);
    }
    const handle = s.chromeLine ? CHROME : PAINT;
    b.pair(0.014, 0.035, 0.15, W / 2 + 0.008, s.beltH - 0.1, zB + 0.22, handle);
    b.pair(0.014, 0.035, 0.15, W / 2 + 0.008, s.beltH - 0.1, seams[2]! + 0.22, handle);
    b.box(0.52, 0.12, 0.02, 0, s.clr + 0.3, fz + 0.005, PLATE);
    b.box(0.52, 0.12, 0.02, 0, s.bed ? s.bed.floorH - 0.3 : s.tailH - 0.34, rz - 0.01, PLATE);
  }
  b.warp = null;
  return { zB, zF, zR, fz, rz, cab };
}

const CARS: Record<'ev' | 'midsize' | 'compact' | 'suv' | 'crossover' | 'exec' | 'service', CarSpec> = {
  ev: { L: 4.6, W: 1.86, clr: 0.16, r: 0.33, axleF: 1.36, axleR: -1.44, noseH: 0.72, hoodH: 0.88, beltH: 0.96, deckH: 0.98, tailH: 0.95, cowlZ: 0.98, roofFZ: 0.18, roofRZ: -0.6, deckZ: -1.8, roofH: 1.44, cabinW: 1.56, grille: 'none', tail: 'pair', rim: RIM_DARK, pillar: PILLAR_DARK, glassRoof: true },
  midsize: { L: 4.75, W: 1.84, clr: 0.18, r: 0.34, axleF: 1.42, axleR: -1.38, noseH: 0.74, hoodH: 0.93, beltH: 0.99, deckH: 1.01, tailH: 0.96, cowlZ: 0.98, roofFZ: 0.1, roofRZ: -0.85, deckZ: -1.62, roofH: 1.46, cabinW: 1.56, grille: 'wide', tail: 'pair', rim: RIM_SILVER, pillar: PILLAR_DARK },
  compact: { L: 4.5, W: 1.8, clr: 0.17, r: 0.32, axleF: 1.3, axleR: -1.35, noseH: 0.72, hoodH: 0.88, beltH: 0.95, deckH: 0.97, tailH: 0.93, cowlZ: 0.88, roofFZ: 0.02, roofRZ: -0.78, deckZ: -1.64, roofH: 1.41, cabinW: 1.52, grille: 'wide', tail: 'bar', rim: RIM_SILVER, pillar: PILLAR_DARK },
  suv: { L: 4.85, W: 1.95, clr: 0.24, r: 0.38, axleF: 1.45, axleR: -1.42, noseH: 0.92, hoodH: 1.1, beltH: 1.17, deckH: 1.16, tailH: 1.1, cowlZ: 0.95, roofFZ: 0.25, roofRZ: -2.12, deckZ: -2.3, roofH: 1.76, cabinW: 1.68, grille: 'big', tail: 'pair', rim: RIM_SILVER, pillar: PILLAR_DARK, rails: true, cladding: true, cPillar: 0.8 },
  crossover: { L: 4.6, W: 1.88, clr: 0.22, r: 0.37, axleF: 1.37, axleR: -1.33, noseH: 0.88, hoodH: 1.05, beltH: 1.12, deckH: 1.1, tailH: 1.04, cowlZ: 0.92, roofFZ: 0.22, roofRZ: -1.45, deckZ: -2.1, roofH: 1.66, cabinW: 1.62, grille: 'big', tail: 'pair', rim: RIM_SILVER, pillar: PILLAR_DARK, rails: true, cladding: true, cPillar: 0.82 },
  exec: { L: 5.0, W: 1.9, clr: 0.17, r: 0.35, axleF: 1.5, axleR: -1.55, noseH: 0.76, hoodH: 0.94, beltH: 1.01, deckH: 1.03, tailH: 0.99, cowlZ: 1.0, roofFZ: 0.05, roofRZ: -1.08, deckZ: -1.84, roofH: 1.47, cabinW: 1.6, grille: 'chrome', tail: 'bar', rim: RIM_SILVER, pillar: PILLAR_DARK, chromeLine: true },
  service: { L: 5.2, W: 1.95, clr: 0.28, r: 0.4, axleF: 1.6, axleR: -1.68, noseH: 1.0, hoodH: 1.2, beltH: 1.3, deckH: 1.3, tailH: 1.3, cowlZ: 1.0, roofFZ: 0.38, roofRZ: -0.72, deckZ: -0.8, roofH: 1.86, cabinW: 1.7, grille: 'big', tail: 'pair', rim: RIM_SILVER, pillar: PAINT, bed: { floorH: 0.98 } },
};

function buildTaxi(b: VehicleBuilder) {
  const s = CARS.midsize;
  const { zR } = buildCar(b, s);
  const mid = (s.roofFZ + s.roofRZ) / 2;
  const y = s.roofH + 0.12;
  b.box(0.12, 0.06, 0.2, 0, s.roofH + 0.02, mid, TRIM);
  b.box(0.64, 0.2, 0.3, 0, y, mid, TAXI_LAMP);
  b.decal('taxi', 'front', { x: 0, y, z: mid + 0.152 }, 0.58, 0.18, DECAL_GLOW).decal('taxi', 'back', { x: 0, y, z: mid - 0.152 }, 0.58, 0.18, DECAL_GLOW);
  const a = s.axleF - (s.r + GAP) - 0.12;
  const c = Math.max(zR, s.axleR + s.r + GAP + 0.1);
  b.flankDecals('checker', s.W / 2 + 0.006, s.beltH - 0.17, (a + c) / 2, a - c, 0.12, DECAL);
}

function buildService(b: VehicleBuilder) {
  const s = CARS.service;
  const { zB, rz, cab } = buildCar(b, s);
  const floor = s.bed!.floorH;
  const bedLen = s.deckZ - 0.03 - (rz + 0.03);
  const bedMid = (s.deckZ + rz) / 2;
  const wallH = s.beltH - floor;
  b.pair(0.07, wallH, bedLen, s.W / 2 - 0.035, floor + wallH / 2, bedMid, PAINT);
  b.box(s.W - 0.14, wallH, 0.07, 0, floor + wallH / 2, rz + 0.035, PAINT);
  b.box(s.W - 0.14, 0.02, bedLen, 0, floor + 0.01, bedMid, BED);
  // roof light bar
  const lz = s.roofFZ - 0.28;
  b.box(cab * 0.78, 0.05, 0.24, 0, s.roofH + 0.03, lz, TRIM);
  b.pair(cab * 0.3, 0.1, 0.22, cab * 0.21, s.roofH + 0.1, lz, AMBER);
  b.box(cab * 0.12, 0.08, 0.2, 0, s.roofH + 0.09, lz, HEAD);
  // push bar and livery
  b.box(s.W * 0.72, 0.34, 0.08, 0, s.noseH - 0.36, s.L / 2 + 0.06, TRIM);
  const doorMid = (s.axleF - s.r - GAP + zB) / 2;
  b.flankDecals('service', s.W / 2 + 0.006, s.beltH - 0.24, doorMid, 1.1, 0.21, DECAL);
  b.flankDecals('chevrons', s.W / 2 + 0.006, floor + 0.16, bedMid, bedLen - 0.12, 0.2, DECAL, true);
}

function buildVan(b: VehicleBuilder) {
  const L = 5.6;
  const W = 2.0;
  const fz = L / 2;
  const rz = -L / 2;
  const clr = 0.26;
  const r = 0.38;
  const gap = 0.07;
  const aF = 1.82;
  const aR = -1.68;
  const seg = b.detailed ? 9 : 5;
  const ws0: P2 = [fz - 0.78, 1.22];
  const ws1: P2 = [fz - 1.5, 2.3];
  b.extrude(
    [
      [rz + 0.1, clr],
      ...archPoints(aR, r, gap, clr, seg),
      ...archPoints(aF, r, gap, clr, seg),
      [fz - 0.18, clr],
      [fz, clr + 0.16],
      [fz, 0.9],
      [fz - 0.1, 1.04],
      ws0,
      ws1,
      [fz - 1.82, 2.5],
      [rz + 0.08, 2.52],
      [rz, 2.42],
      [rz, clr + 0.1],
    ],
    W,
    PAINT,
    { bevel: 0.16, round: 0.05 },
  );
  liners(b, [aF, aR], r, gap, clr, W, 0.26);
  wheels(b, [aF, aR], r, W, 0.26, RIM_SILVER);
  b.panel(ws0, ws1, W - 0.22, GLASS, { inset: 0.05 });
  const zB = 0.6;
  const yb = 1.3;
  const yt = 2.12;
  b.extrude(insetConvex([[zB, yb], [zAtY(ws0, ws1, yb), yb], [zAtY(ws0, ws1, yt), yt], [zB, yt]], 0.07), W + 0.016, GLASS);
  // front
  b.box(1.2, 0.36, 0.06, 0, 0.7, fz + 0.01, GLOSS_BLACK);
  b.pair(0.36, 0.15, 0.24, 0.66, 0.95, fz - 0.1, HEAD);
  b.box(W + 0.02, 0.26, 0.24, 0, clr + 0.14, fz - 0.06, TRIM);
  b.pair(0.1, 0.28, 0.16, W / 2 + 0.1, 1.6, fz - 0.85, TRIM);
  // rear
  b.pair(0.12, 0.5, 0.06, W / 2 - 0.1, 1.0, rz - 0.01, TAIL);
  b.box(W + 0.02, 0.22, 0.2, 0, clr + 0.12, rz + 0.05, TRIM);
  b.pair(0.7, 0.5, 0.03, 0.42, 1.95, rz - 0.008, GLASS);
  // Grooveli livery
  b.flankDecals('vanLogo', W / 2 + 0.006, 1.62, -0.55, 2.2, 0.55, DECAL);
  b.flankDecals('vanStripes', W / 2 + 0.007, 1.16, -2.1, 1.3, 0.38, DECAL, true);
  if (b.detailed) {
    b.box(0.02, 2.0, 0.02, 0, 1.38, rz - 0.012, SEAM);
    b.pair(0.01, 1.85, 0.022, W / 2 + 0.004, 1.32, zB - 0.05, SEAM);
    b.box(0.01, 1.85, 0.022, W / 2 + 0.004, 1.32, -0.95, SEAM);
    b.pair(0.014, 0.04, 0.16, W / 2 + 0.008, 1.15, zB - 0.25, PAINT);
    b.box(0.52, 0.12, 0.02, 0, clr + 0.32, fz + 0.03, PLATE);
    b.box(0.52, 0.12, 0.02, 0, clr + 0.4, rz - 0.04, PLATE);
    b.box(0.8, 0.12, 0.6, 0, 2.58, -0.6, ROOF_UNIT);
  }
}

function buildBus(b: VehicleBuilder) {
  const L = 10.5;
  const W = 2.5;
  const fz = L / 2;
  const rz = -L / 2;
  const clr = 0.32;
  const r = 0.5;
  const gap = 0.08;
  const aF = 2.95;
  const aR = -2.55;
  const seg = b.detailed ? 10 : 6;
  const f0: P2 = [fz, 1.05];
  const f1: P2 = [fz - 0.14, 2.96];
  b.extrude(
    [
      [rz + 0.12, clr],
      ...archPoints(aR, r, gap, clr, seg),
      ...archPoints(aF, r, gap, clr, seg),
      [fz - 0.12, clr],
      [fz, clr + 0.14],
      f0,
      f1,
      [fz - 0.32, 3.06],
      [rz + 0.2, 3.06],
      [rz, 2.9],
      [rz, clr + 0.12],
    ],
    W,
    PAINT,
    { bevel: 0.18, round: 0.06 },
  );
  liners(b, [aF, aR], r, gap, clr, W, 0.3);
  wheels(b, [aF, aR], r, W, 0.3, RIM_SILVER);
  // windscreen + destination display
  b.panel([zAtY(f0, f1, 1.12), 1.12], [zAtY(f0, f1, 2.6), 2.6], W - 0.2, GLASS);
  b.decal('busSign', 'front', { x: 0, y: 2.79, z: zAtY(f0, f1, 2.79) + 0.025 }, 1.9, 0.26, DECAL_GLOW);
  // side window band with mullions and frame
  const w0 = rz + 0.45;
  const w1 = fz - 0.75;
  b.box(W + 0.016, 1.12, w1 - w0, 0, 1.92, (w0 + w1) / 2, BUS_GLASS);
  for (let z = w0 + 1.25; z < w1 - 0.3; z += 1.25) b.box(W + 0.03, 1.12, 0.07, 0, 1.92, z, TRIM);
  b.box(W + 0.024, 0.06, w1 - w0, 0, 1.36, (w0 + w1) / 2, TRIM);
  b.box(W + 0.024, 0.06, w1 - w0, 0, 2.48, (w0 + w1) / 2, TRIM);
  // doors on the right (kerb) side
  for (const z of [fz - 1.0, 0.3]) {
    b.box(0.02, 2.05, 1.05, W / 2 + 0.008, 1.42, z, GLASS);
    if (b.detailed) b.box(0.025, 2.05, 0.03, W / 2 + 0.012, 1.42, z, TRIM);
  }
  // roof equipment
  b.box(1.6, 0.24, 2.2, 0, 3.06 + 0.12, 1.6, ROOF_UNIT);
  b.box(1.4, 0.2, 1.6, 0, 3.06 + 0.1, -2.6, ROOF_UNIT);
  // lights and bumpers
  b.pair(0.42, 0.16, 0.06, 0.88, 0.75, fz + 0.01, HEAD);
  b.pair(0.18, 0.55, 0.06, W / 2 - 0.18, 1.05, rz - 0.01, TAIL);
  b.box(W + 0.02, 0.3, 0.18, 0, clr + 0.12, fz - 0.04, TRIM);
  b.box(W + 0.02, 0.3, 0.18, 0, clr + 0.12, rz + 0.04, TRIM);
  // Grooveli City livery behind the rear wheels
  b.flankDecals('busSwoosh', W / 2 + 0.006, 0.915, -4.15, 1.9, 0.83, DECAL, true);
  b.flankDecals('busText', W / 2 + 0.009, 1.1, -4.15, 1.8, 0.3, DECAL);
  if (b.detailed) {
    b.box(0.52, 0.12, 0.02, 0, clr + 0.35, fz + 0.03, PLATE);
    b.box(0.52, 0.12, 0.02, 0, clr + 0.45, rz - 0.03, PLATE);
    b.pair(0.08, 0.36, 0.12, W / 2 + 0.12, 2.5, fz - 0.25, TRIM);
  }
}

/** Builds one vehicle model as a single merged geometry. */
export function buildVehicle(kind: VehicleKind, lod: 0 | 1): THREE.BufferGeometry {
  const b = new VehicleBuilder(lod);
  switch (kind) {
    case 'taxi':
      buildTaxi(b);
      break;
    case 'service':
      buildService(b);
      break;
    case 'van':
      buildVan(b);
      break;
    case 'bus':
      buildBus(b);
      break;
    default:
      buildCar(b, CARS[kind]);
  }
  return b.build();
}
