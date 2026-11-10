import { BUILDINGS, DISTRICTS, PARK_BLOCK, type CityBuilding, type DistrictId } from '@grooveli/frontend-domain/public';
import { BUILDING_PLANS, DECOR_BUILDINGS, MINOR_STREETS, PLAZA_RECT, PLAZA_RING, type BuildingStyle, type Footprint } from './plan';

/**
 * World layout. Units ≈ metres; origin = plaza ring centre. The street grid is
 * deliberately non-uniform to match the day-view reference
 * (docs/VISUAL_RECONSTRUCTION_PLAN.md §2): a wide avenue west of the plaza, a
 * narrow street east of it, and a minor street through the block above it.
 */
export const GRID_W = 4;
export const GRID_H = 3;
/** Block extents (x) per grid column, including the sidewalk ring. */
export const COLS: readonly [number, number][] = [
  [-68, -31],
  [-25, 17.5],
  [22.5, 62.5],
  [68.5, 104.5],
];
/** Block extents (z) per grid row, including the sidewalk ring. */
export const ROWS: readonly [number, number][] = [
  [-48, -14],
  [-10.2, 15],
  [22, 54],
];
export const OUTER_ROAD = 7;
export const SIDEWALK = 2.5;
export const SIDEWALK_H = 0.2;
export const PLAZA_H = 0.35;
export const PLAYER_RADIUS = 0.6;
export const INTERACT_RADIUS = 3.4;

export interface Vec2 {
  x: number;
  z: number;
}

export type AABB = Footprint;

export function blockBounds(grid: { x: number; z: number }): AABB {
  const c = COLS[grid.x]!;
  const r = ROWS[grid.z]!;
  return { minX: c[0], maxX: c[1], minZ: r[0], maxZ: r[1] };
}

export function blockCenter(grid: { x: number; z: number }): Vec2 {
  const b = blockBounds(grid);
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
}

export const WORLD_BOUNDS: AABB = {
  minX: COLS[0]![0] - OUTER_ROAD,
  maxX: COLS[GRID_W - 1]![1] + OUTER_ROAD,
  minZ: ROWS[0]![0] - OUTER_ROAD,
  maxZ: ROWS[GRID_H - 1]![1] + OUTER_ROAD,
};

/** Road surfaces between and around blocks (for markings, traffic, crosswalks). */
export interface Road extends AABB {
  axis: 'x' | 'z'; // direction of travel
  minor?: boolean;
}

export const ROADS: Road[] = (() => {
  const out: Road[] = [];
  const xs: [number, number][] = [[WORLD_BOUNDS.minX, COLS[0]![0]]];
  for (let i = 0; i < GRID_W - 1; i++) xs.push([COLS[i]![1], COLS[i + 1]![0]]);
  xs.push([COLS[GRID_W - 1]![1], WORLD_BOUNDS.maxX]);
  const zs: [number, number][] = [[WORLD_BOUNDS.minZ, ROWS[0]![0]]];
  for (let j = 0; j < GRID_H - 1; j++) zs.push([ROWS[j]![1], ROWS[j + 1]![0]]);
  zs.push([ROWS[GRID_H - 1]![1], WORLD_BOUNDS.maxZ]);
  for (const [a, b] of xs) out.push({ minX: a, maxX: b, minZ: WORLD_BOUNDS.minZ, maxZ: WORLD_BOUNDS.maxZ, axis: 'z' });
  for (const [a, b] of zs) out.push({ minX: WORLD_BOUNDS.minX, maxX: WORLD_BOUNDS.maxX, minZ: a, maxZ: b, axis: 'x' });
  for (const m of MINOR_STREETS) out.push({ ...m, axis: 'z', minor: true });
  return out;
})();

export interface PlacedBuilding extends CityBuilding {
  center: Vec2;
  w: number;
  d: number;
  h: number;
  aabb: AABB;
  entrance: Vec2 | null;
  style: BuildingStyle;
  body: string;
  accent: string;
  seed: number;
  decor: boolean;
}

function fallbackPlan(b: CityBuilding) {
  // Buildings without an authored plan are placed from fixture offsets.
  const district = DISTRICTS.find((d) => d.id === b.district)!;
  const bb = blockBounds(district.grid);
  const c = blockCenter(district.grid);
  const hw = (bb.maxX - bb.minX) / 2 - SIDEWALK - 1;
  const hd = (bb.maxZ - bb.minZ) / 2 - SIDEWALK - 1;
  const w = Math.min(hw, b.size.w * hw * 0.8);
  const d = Math.min(hd, b.size.d * hd * 0.8);
  const x = c.x + b.offset.x * (hw - w / 2);
  const z = c.z + b.offset.z * (hd - d / 2);
  return { rect: { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }, h: b.size.h * 5, style: 'midrise' as BuildingStyle };
}

export function placeBuilding(b: CityBuilding): PlacedBuilding {
  const plan = BUILDING_PLANS[b.id] ?? fallbackPlan(b);
  const { rect } = plan;
  const center = { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 };
  const side = 'entrance' in plan ? plan.entrance : undefined;
  const entrance = !b.enterable ? null : side === 'north' ? { x: center.x, z: rect.minZ - 1.3 } : { x: center.x, z: rect.maxZ + 1.3 };
  return {
    ...b,
    center,
    w: rect.maxX - rect.minX,
    d: rect.maxZ - rect.minZ,
    h: plan.h,
    aabb: rect,
    entrance,
    style: plan.style,
    body: ('body' in plan && plan.body) || '#e5e9ef',
    accent: ('accent' in plan && plan.accent) || b.color,
    seed: ('seed' in plan && plan.seed) || 1,
    decor: false,
  };
}

export const PLACED_BUILDINGS: PlacedBuilding[] = BUILDINGS.map(placeBuilding);

/** Decor buildings as placed buildings (non-interactive, never enterable). */
export const DECOR_PLACED: PlacedBuilding[] = DECOR_BUILDINGS.map((d) => {
  const center = { x: (d.rect.minX + d.rect.maxX) / 2, z: (d.rect.minZ + d.rect.maxZ) / 2 };
  const grid = { x: COLS.findIndex((c) => center.x >= c[0] && center.x <= c[1]), z: ROWS.findIndex((r) => center.z >= r[0] && center.z <= r[1]) };
  const district = DISTRICTS.find((x) => x.grid.x === grid.x && x.grid.z === grid.z)?.id ?? 'plaza';
  return {
    id: d.id,
    district,
    name: d.name,
    kind: 'filler',
    offset: { x: 0, z: 0 },
    size: { w: 1, d: 1, h: 1 },
    color: d.accent ?? '#64748b',
    enterable: false,
    center,
    w: d.rect.maxX - d.rect.minX,
    d: d.rect.maxZ - d.rect.minZ,
    h: d.h,
    aabb: d.rect,
    entrance: null,
    style: d.style,
    body: d.body ?? '#e5e9ef',
    accent: d.accent ?? '#64748b',
    seed: d.seed ?? 1,
    decor: true,
  };
});

export const ALL_BUILDINGS: PlacedBuilding[] = [...PLACED_BUILDINGS, ...DECOR_PLACED];
export const COLLIDERS: AABB[] = ALL_BUILDINGS.filter((b) => b.style !== 'flat').map((b) => b.aabb);

/**
 * Each district has an info kiosk on the sidewalk facing the plaza row.
 * The plaza's "kiosk" is the glowing central disc.
 */
export function districtKiosk(id: DistrictId): Vec2 {
  const d = DISTRICTS.find((x) => x.id === id)!;
  if (id === 'plaza') return { x: PLAZA_RING.x, z: PLAZA_RING.z + 0.6 };
  const b = blockBounds(d.grid);
  const c = blockCenter(d.grid);
  // Tech's block centre is the minor street; keep its kiosk on the sidewalk beside it.
  const x = id === 'tech' ? -8.5 : c.x;
  return d.grid.z === 2 ? { x, z: b.minZ + 1.2 } : { x, z: b.maxZ - 1.2 };
}

/** Where a district's in-world name label sits (just off the kiosk, over the street). */
export function districtLabelPoint(id: DistrictId): Vec2 {
  const d = DISTRICTS.find((x) => x.id === id)!;
  const k = districtKiosk(id);
  if (d.grid.z === 2) return { x: k.x + 6.5, z: k.z - 3.4 };
  // North-row labels sit on the far (north) street so they never cover the plaza view.
  if (d.grid.z === 0) return { x: k.x, z: blockBounds(d.grid).minZ - 3.4 };
  return { x: k.x, z: k.z + 3.4 };
}

/** Interactive city fixtures that are not buildings (e.g. the Global Markets billboard). */
export type CityFeatureId = 'markets-board';

export type Interactable =
  | { kind: 'district'; id: string; district: DistrictId; label: string; position: Vec2 }
  | { kind: 'building'; id: string; district: DistrictId; label: string; position: Vec2; building: PlacedBuilding }
  | { kind: 'feature'; id: CityFeatureId; district: DistrictId; label: string; position: Vec2; buildingId: string };

const MARKETS_BUILDING = 'b-tech-tower';

/** Interaction point on the sidewalk in front of the Global Markets billboard (its building's south face). */
function marketsBoardPoint(): Vec2 {
  const b = ALL_BUILDINGS.find((x) => x.id === MARKETS_BUILDING)!;
  return { x: b.center.x, z: b.aabb.maxZ + 1.3 };
}

export const INTERACTABLES: Interactable[] = [
  ...DISTRICTS.map((d) => ({ kind: 'district' as const, id: `kiosk-${d.id}`, district: d.id, label: d.name, position: districtKiosk(d.id) })),
  ...PLACED_BUILDINGS.filter((b) => b.entrance).map((b) => ({
    kind: 'building' as const,
    id: b.id,
    district: b.district,
    label: b.name,
    position: b.entrance!,
    building: b,
  })),
  { kind: 'feature', id: 'markets-board', district: 'tech', label: 'Global Markets charts', position: marketsBoardPoint(), buildingId: MARKETS_BUILDING },
];

export const PARK_CENTER = blockCenter(PARK_BLOCK);

/** District whose block (plus half the surrounding street) contains the point. */
export function districtAt(p: Vec2): DistrictId | null {
  for (const d of DISTRICTS) {
    const b = blockBounds(d.grid);
    if (p.x >= b.minX - 3 && p.x <= b.maxX + 3 && p.z >= b.minZ - 3 && p.z <= b.maxZ + 3) return d.id;
  }
  return null;
}

function inside(p: Vec2, r: AABB) {
  return p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
}

/** Walking surface height: road 0, sidewalks/blocks 0.2, raised plaza 0.35. */
export function groundHeight(p: Vec2): number {
  if (inside(p, PLAZA_RECT)) return PLAZA_H;
  for (const c of COLS) for (const r of ROWS) if (p.x >= c[0] && p.x <= c[1] && p.z >= r[0] && p.z <= r[1]) return SIDEWALK_H;
  return 0;
}

/** Spawn: deep-linked HQ entrance, district kiosk, otherwise just south of the plaza ring (reference framing). */
export function spawnPoint(opts: { district?: DistrictId | null; organizationId?: string | null }): Vec2 {
  if (opts.organizationId) {
    const hq = PLACED_BUILDINGS.find((b) => b.organizationId === opts.organizationId && b.entrance);
    if (hq) return { x: hq.entrance!.x, z: hq.entrance!.z + (hq.entrance!.z > hq.center.z ? 1.5 : -1.5) };
  }
  if (opts.district && opts.district !== 'plaza') {
    const k = districtKiosk(opts.district);
    return { x: k.x, z: k.z + 1.5 };
  }
  return { x: PLAZA_RING.x, z: PLAZA_RING.z + 3.2 };
}
