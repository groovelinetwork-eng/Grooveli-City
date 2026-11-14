import { DISTRICTS, PARK_BLOCK } from '@grooveli/frontend-domain/public';
import { ALL_BUILDINGS, INTERACTABLES, SIDEWALK_H, blockBounds, type AABB } from './layout';
import { MINOR_STREETS, PLAZA_RECT } from './plan';
import { rand } from './ambient';

export interface TreeP {
  x: number;
  z: number;
  y: number;
  s: number;
  /** Colour variant 0..2. */
  v: number;
  planter: boolean;
}
export interface PointP {
  x: number;
  z: number;
  y: number;
  rot: number;
}
export interface BoxP {
  x: number;
  z: number;
  y: number;
  w: number;
  d: number;
  h: number;
}

export interface CityProps {
  trees: TreeP[];
  lamps: PointP[];
  umbrellas: PointP[];
  tables: PointP[];
  benches: PointP[];
  hedges: BoxP[];
  bollards: PointP[];
  banners: PointP[];
  shelters: PointP[];
  hvac: BoxP[];
}

const Y = SIDEWALK_H;

function blocked(x: number, z: number, pad: number) {
  if (ALL_BUILDINGS.some((b) => b.style !== 'flat' && x > b.aabb.minX - pad && x < b.aabb.maxX + pad && z > b.aabb.minZ - pad && z < b.aabb.maxZ + pad)) return true;
  if (INTERACTABLES.some((i) => Math.hypot(i.position.x - x, i.position.z - z) < 2.4)) return true;
  if (MINOR_STREETS.some((m) => x > m.minX - 0.6 && x < m.maxX + 0.6 && z > m.minZ && z < m.maxZ)) return true;
  if (x > PLAZA_RECT.minX - 0.4 && x < PLAZA_RECT.maxX + 0.4 && z > PLAZA_RECT.minZ - 0.4 && z < PLAZA_RECT.maxZ + 0.4) return true;
  return false;
}

/** Points along the inside of a block's curb, every `step` metres, skipping corners. */
function alongCurb(b: AABB, inset: number, step: number, phase: number): PointP[] {
  const out: PointP[] = [];
  const edges: [number, number, number, number, number][] = [
    // x0, z0, dx, dz, rot (rotation faces the road)
    [b.minX + 3, b.minZ + inset, 1, 0, Math.PI],
    [b.minX + 3, b.maxZ - inset, 1, 0, 0],
    [b.minX + inset, b.minZ + 3, 0, 1, -Math.PI / 2],
    [b.maxX - inset, b.minZ + 3, 0, 1, Math.PI / 2],
  ];
  for (const [x0, z0, dx, dz, rot] of edges) {
    const len = dx ? b.maxX - b.minX - 6 : b.maxZ - b.minZ - 6;
    for (let s = phase; s <= len; s += step) out.push({ x: x0 + dx * s, z: z0 + dz * s, y: Y, rot });
  }
  return out;
}

function roofTrees(rect: AABB, h: number, n: number, seed: number): TreeP[] {
  const out: TreeP[] = [];
  for (let i = 0; i < n; i++) {
    const fx = 0.2 + rand(seed + i * 3) * 0.6;
    const fz = 0.2 + rand(seed + i * 5) * 0.6;
    out.push({ x: rect.minX + (rect.maxX - rect.minX) * fx, z: rect.minZ + (rect.maxZ - rect.minZ) * fz, y: h + Y + 0.5, s: 0.7 + rand(seed + i) * 0.3, v: i % 3, planter: false });
  }
  return out;
}

export function buildCityProps(): CityProps {
  const trees: TreeP[] = [];
  const lamps: PointP[] = [];
  const umbrellas: PointP[] = [];
  const tables: PointP[] = [];
  const benches: PointP[] = [];
  const hedges: BoxP[] = [];
  const bollards: PointP[] = [];
  const banners: PointP[] = [];
  const shelters: PointP[] = [];
  const hvac: BoxP[] = [];

  // Street trees and lamps along every block's curb.
  const blocks = [...DISTRICTS.map((d) => blockBounds(d.grid)), blockBounds(PARK_BLOCK)];
  blocks.forEach((b, bi) => {
    alongCurb(b, 1.15, 5.2, 1.5).forEach((p, i) => {
      if (!blocked(p.x, p.z, 0.9)) trees.push({ x: p.x, z: p.z, y: Y, s: 0.72 + rand(bi * 100 + i) * 0.22, v: (bi + i) % 3, planter: true });
    });
    alongCurb(b, 0.45, 13, 4.75).forEach((p) => {
      if (!blocked(p.x, p.z, 0.4)) lamps.push(p);
    });
  });

  // ---- Plaza block (reference: landscaped strips around the plaza paving).
  // West strip: the Games Zone's Chess and Checkers terraces (world/gamesZone.ts) — trees and
  // benches frame them on the outer sidewalk (low shrubs between the decks are part of the zone).
  for (const [x, z] of [
    [-23.6, -6],
    [-23.6, -2],
    [-23.6, 5.6],
    [-23.6, 9.6],
  ] as const)
    trees.push({ x, z, y: Y, s: 0.72, v: z > 0 ? 0 : 1, planter: true });
  benches.push({ x: -23.6, z: 1.8, y: Y, rot: Math.PI / 2 }, { x: -23.6, z: 12.2, y: Y, rot: Math.PI / 2 });
  for (const z of [-8.2, 2.2, 11.7]) banners.push({ x: -15.05, z, y: Y, rot: Math.PI / 2 });
  // Games Zone: planter trees and benches on the open paving west of the lounge.
  for (const [x, z] of [
    [-12.6, -6.9],
    [-12.6, 10.9],
    [-8.4, -7.6],
  ] as const)
    trees.push({ x, z, y: 0.35, s: 0.8, v: 1, planter: true });
  benches.push({ x: -12.9, z: 2.2, y: 0.35, rot: Math.PI / 2 }, { x: -9.6, z: 11.4, y: 0.35, rot: 0 });
  // East strip.
  for (let z = -6; z <= 12; z += 4.5) trees.push({ x: 16.3, z, y: Y, s: 0.78, v: 2, planter: true });
  banners.push({ x: 15.3, z: 2.4, y: Y, rot: -Math.PI / 2 });
  for (let z = -5; z < 12; z += 4.5) hedges.push({ x: 15.2, z: z + 2.2, y: Y, w: 0.8, d: 2.2, h: 0.6 });
  // South strip planters and corner gardens.
  for (const x of [-12.5, -6.5, 6.5, 12.5]) hedges.push({ x, z: 13.4, y: Y, w: 3.2, d: 0.9, h: 0.6 });
  hedges.push({ x: -11.8, z: -9.45, y: Y, w: 3, d: 0.8, h: 0.6 }, { x: 11.8, z: -9.45, y: Y, w: 3, d: 0.8, h: 0.6 });
  banners.push({ x: -13.6, z: 13.6, y: Y, rot: 0 }, { x: 8.4, z: 13.7, y: Y, rot: 0 });
  shelters.push({ x: -5, z: -9.5, y: Y, rot: 0 }, { x: -19.2, z: 12.4, y: Y, rot: 0 });
  // Glowing bollards around the plaza paving (reference: light posts on each edge).
  const P = PLAZA_RECT;
  for (let x = P.minX; x <= P.maxX + 0.01; x += (P.maxX - P.minX) / 6) {
    bollards.push({ x, z: P.minZ - 0.35, y: Y, rot: 0 }, { x, z: P.maxZ + 0.35, y: Y, rot: 0 });
  }
  for (let z = P.minZ + (P.maxZ - P.minZ) / 4; z < P.maxZ - 0.5; z += (P.maxZ - P.minZ) / 4) {
    bollards.push({ x: P.minX - 0.35, z, y: Y, rot: 0 }, { x: P.maxX + 0.35, z, y: Y, rot: 0 });
  }

  // ---- West of the avenue: café row under umbrellas (reference bottom-left).
  for (const [x, z] of [
    [-35, 4.6],
    [-35, 8.2],
    [-35, 11.8],
    [-38.6, 6.4],
    [-38.6, 10],
  ] as const) {
    umbrellas.push({ x, z, y: Y, rot: 0 });
    tables.push({ x, z, y: Y, rot: 0 });
  }
  // Pavement cafés in front of the tech offices.
  for (const x of [-17.8, -14.2, -10.6]) {
    umbrellas.push({ x, z: -15.3, y: Y, rot: 0 });
    tables.push({ x, z: -15.3, y: Y, rot: 0 });
  }

  // ---- Rooftops.
  const byId = (id: string) => ALL_BUILDINGS.find((b) => b.id === id)!;
  const mall = byId('b-saffron');
  // Terrace dining on the mall (reference right side).
  for (let x = mall.aabb.minX + 4; x < mall.aabb.maxX - 2; x += 4.6)
    for (let z = mall.aabb.minZ + 2.5; z < mall.aabb.maxZ - 1.5; z += 3.6) {
      if (x < mall.aabb.minX + 17 && z > mall.aabb.maxZ - 8) continue;
      umbrellas.push({ x, z, y: mall.h + Y + 0.21, rot: 0 });
      tables.push({ x, z, y: mall.h + Y + 0.21, rot: 0 });
    }
  for (let x = mall.aabb.minX + 1.4; x < mall.aabb.maxX; x += 4.6) trees.push({ x, z: mall.aabb.maxZ - 1.2, y: mall.h + Y + 0.21, s: 0.75, v: 1, planter: true });
  for (let z = mall.aabb.minZ + 1.5; z < mall.aabb.maxZ; z += 3.4) trees.push({ x: mall.aabb.minX + 1.3, z, y: mall.h + Y + 0.21, s: 0.7, v: 0, planter: true });
  trees.push(...roofTrees(byId('b-kestrel').aabb, byId('b-kestrel').h, 6, 5));
  trees.push(...roofTrees(byId('b-tech-tower').aabb, byId('b-tech-tower').h, 5, 9));
  const acad = byId('b-academy');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    trees.push({ x: acad.center.x + Math.cos(a) * 4.6, z: acad.center.z + Math.sin(a) * 4.6, y: acad.h + Y + 0.5, s: 0.75, v: i % 3, planter: false });
  }
  trees.push({ x: acad.center.x, z: acad.center.z, y: acad.h + Y + 0.5, s: 1, v: 0, planter: false });
  // Roof plant on plain buildings.
  for (const b of ALL_BUILDINGS)
    if (['midrise', 'tower', 'hospital', 'civic', 'glassOffice', 'billboardBlock', 'signTower'].includes(b.style) && b.id !== 'b-kestrel') {
      hvac.push({ x: b.center.x - b.w * 0.18, z: b.center.z - b.d * 0.15, y: b.h + Y + 0.4, w: Math.min(3, b.w * 0.25), d: Math.min(2.4, b.d * 0.2), h: 1.1 });
      if (b.w > 9) hvac.push({ x: b.center.x + b.w * 0.2, z: b.center.z + b.d * 0.1, y: b.h + Y + 0.4, w: 1.6, d: 1.6, h: 0.8 });
    }

  // ---- Park.
  const park = blockBounds(PARK_BLOCK);
  for (let i = 0; i < 26; i++) {
    const x = park.minX + 4 + rand(i + 300) * (park.maxX - park.minX - 8);
    const z = park.minZ + 4 + rand(i + 400) * (park.maxZ - park.minZ - 8);
    if (Math.hypot(x - (park.minX + park.maxX) / 2 - 4, z - (park.minZ + park.maxZ) / 2 - 2) > 8.5) trees.push({ x, z, y: Y, s: 1 + rand(i) * 0.5, v: i % 3, planter: false });
  }

  return { trees, lamps, umbrellas, tables, benches, hedges, bollards, banners, shelters, hvac };
}
