import { DISTRICTS, PARK_BLOCK } from '@grooveli/frontend-domain/public';
import { COLS, GRID_H, GRID_W, OUTER_ROAD, ROWS, blockBounds, type AABB, type Vec2 } from './layout';
import { PLAZA_RECT, PLAZA_RING } from './plan';
import { TRAFFIC_MIX, VEHICLE_SPECS, type VehicleKind } from './vehicles';

/** Closed rectangular loop; position by distance travelled. */
export interface Loop {
  cx: number;
  cz: number;
  hw: number; // half width
  hd: number; // half depth
  clockwise: boolean;
}

export function loopLength(l: Loop): number {
  return 4 * (l.hw + l.hd);
}

function loopFromBounds(b: AABB, inset: number, clockwise: boolean): Loop {
  return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, hw: (b.maxX - b.minX) / 2 - inset, hd: (b.maxZ - b.minZ) / 2 - inset, clockwise };
}

/** Position and heading (radians, Y rotation) at distance s along a loop. */
export function pointOnLoop(l: Loop, s: number): { p: Vec2; heading: number } {
  const L = loopLength(l);
  let t = ((s % L) + L) % L;
  if (!l.clockwise) t = L - t;
  const w = 2 * l.hw;
  const d = 2 * l.hd;
  const corners: Vec2[] = [
    { x: l.cx - l.hw, z: l.cz - l.hd },
    { x: l.cx + l.hw, z: l.cz - l.hd },
    { x: l.cx + l.hw, z: l.cz + l.hd },
    { x: l.cx - l.hw, z: l.cz + l.hd },
  ];
  const lens = [w, d, w, d];
  for (let i = 0; i < 4; i++) {
    if (t <= lens[i]! || i === 3) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      const f = lens[i]! > 0 ? Math.min(1, t / lens[i]!) : 0;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const forward = l.clockwise ? 1 : -1;
      return { p: { x: a.x + dx * f, z: a.z + dz * f }, heading: Math.atan2(dx * forward, dz * forward) };
    }
    t -= lens[i]!;
  }
  return { p: corners[0]!, heading: 0 };
}

/** Deterministic pseudo-random for ambient placement. */
export function rand(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const BLOCK_GRIDS: { x: number; z: number }[] = [...DISTRICTS.map((d) => d.grid), PARK_BLOCK];
const BLOCKS: AABB[] = BLOCK_GRIDS.map((g) => blockBounds(g));

/** Lane centre distance from the kerb: a quarter of the road, so two lanes share it side by side. */
function laneOffset(roadWidth: number) {
  return Math.min(1.75, Math.max(0.95, roadWidth / 4));
}

/**
 * Traffic loop around a block, in the right-hand quarter of each surrounding
 * road. Neighbouring blocks circulate in opposite senses (checkerboard), so
 * on every shared street both lanes flow the same way — no head-on traffic.
 */
export function trafficLoop(grid: { x: number; z: number }): Loop {
  const b = blockBounds(grid);
  const west = laneOffset(grid.x === 0 ? OUTER_ROAD : COLS[grid.x]![0] - COLS[grid.x - 1]![1]);
  const east = laneOffset(grid.x === GRID_W - 1 ? OUTER_ROAD : COLS[grid.x + 1]![0] - COLS[grid.x]![1]);
  const north = laneOffset(grid.z === 0 ? OUTER_ROAD : ROWS[grid.z]![0] - ROWS[grid.z - 1]![1]);
  const south = laneOffset(grid.z === GRID_H - 1 ? OUTER_ROAD : ROWS[grid.z + 1]![0] - ROWS[grid.z]![1]);
  const minX = b.minX - west;
  const maxX = b.maxX + east;
  const minZ = b.minZ - north;
  const maxZ = b.maxZ + south;
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, hw: (maxX - minX) / 2, hd: (maxZ - minZ) / 2, clockwise: (grid.x + grid.z) % 2 === 0 };
}

export interface Walker {
  loop: Loop;
  offset: number;
  /** 0 = standing idle (chatting, waiting). */
  speed: number;
  color: string;
  pants: string;
  hair: string;
  skin: string;
  shoes?: string;
  /** Backpack colour, or null for none. */
  bag?: string | null;
}

/** Saturated, varied clothing so people read as people in day and night light (few whites). */
const SHIRT_COLORS = ['#1e40af', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0ea5e9', '#f97316', '#14b8a6', '#db2777', '#334155', '#facc15', '#f8fafc', '#65a30d', '#9333ea'];
const PANTS = ['#1f2937', '#334155', '#1e3a8a', '#0f172a', '#78716c', '#7c2d12', '#3f6212', '#64748b'];
const HAIR = ['#1c1917', '#3f2a1d', '#0f0f0f', '#a16207', '#57534e', '#7c2d12', '#d6a756'];
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673b'];
const SHOES = ['#111827', '#f8fafc', '#7c2d12', '#1e3a8a', '#dc2626', '#111827'];
const BAGS = ['#0f172a', '#b45309', '#be123c', '#0f766e'];

function look(i: number) {
  return {
    color: SHIRT_COLORS[(i * 5) % SHIRT_COLORS.length]!,
    pants: PANTS[(i * 3 + 1) % PANTS.length]!,
    hair: HAIR[(i * 4 + 2) % HAIR.length]!,
    skin: SKIN[(i * 7) % SKIN.length]!,
    shoes: SHOES[(i * 11) % SHOES.length]!,
    bag: i % 4 === 1 ? BAGS[(i >> 2) % BAGS.length]! : null,
  };
}

/**
 * Pedestrians: 85 % walk sidewalk loops around blocks, 10 % stroll laps of
 * the plaza, 5 % stand on the plaza (reference: ~20 people spread over it).
 */
export function makePedestrians(count: number): Walker[] {
  return Array.from({ length: count }, (_, i) => {
    const bucket = i % 20;
    if (bucket < 17) {
      const b = BLOCKS[i % BLOCKS.length]!;
      const loop = loopFromBounds(b, 0.7 + rand(i) * 1.1, rand(i + 7) > 0.5);
      return { loop, offset: rand(i + 3) * loopLength(loop), speed: 1.1 + rand(i + 11) * 0.7, ...look(i) };
    }
    if (bucket < 19) {
      const inset = 1 + rand(i + 2) * 5.5;
      const loop = loopFromBounds(PLAZA_RECT, inset, rand(i + 9) > 0.5);
      return { loop, offset: rand(i + 3) * loopLength(loop), speed: 0.9 + rand(i + 5) * 0.6, ...look(i) };
    }
    // Idle: a degenerate loop pins them in place; avoid the ring centre where the player spawns.
    let x = PLAZA_RECT.minX + 1.5 + rand(i + 13) * (PLAZA_RECT.maxX - PLAZA_RECT.minX - 3);
    let z = PLAZA_RECT.minZ + 1.5 + rand(i + 17) * (PLAZA_RECT.maxZ - PLAZA_RECT.minZ - 3);
    if (Math.hypot(x - PLAZA_RING.x, z - PLAZA_RING.z) < PLAZA_RING.radius + 0.5) x += x < 0 ? -PLAZA_RING.radius : PLAZA_RING.radius;
    x = Math.max(PLAZA_RECT.minX + 1, Math.min(PLAZA_RECT.maxX - 1, x));
    z = Math.max(PLAZA_RECT.minZ + 1, Math.min(PLAZA_RECT.maxZ - 1, z));
    return { loop: { cx: x, cz: z, hw: 0, hd: 0.0001, clockwise: true }, offset: rand(i) * 6.28, speed: 0, ...look(i) };
  });
}

export interface Vehicle extends Walker {
  kind: VehicleKind;
  /** Road loop the vehicle circulates on (vehicles on one loop share a speed). */
  loopId: number;
}

/**
 * Vehicles circulate on the roads around blocks (see trafficLoop).
 * Kinds follow TRAFFIC_MIX; colours come from the design-board palette.
 * Everyone on a loop drives at the slowest member's speed, so a car never
 * catches up with (and drives through) a bus or truck ahead of it.
 */
export function makeVehicles(count: number): Vehicle[] {
  const list = Array.from({ length: count }, (_, i): Vehicle => {
    const loopId = (i * 5) % BLOCK_GRIDS.length;
    const loop = trafficLoop(BLOCK_GRIDS[loopId]!);
    const kind = TRAFFIC_MIX[i % TRAFFIC_MIX.length]!;
    const spec = VEHICLE_SPECS[kind];
    return {
      loop,
      loopId,
      offset: (i / count) * loopLength(loop) + rand(i + 21) * 6,
      speed: spec.speed,
      color: spec.colors[Math.floor(rand(i + 41) * spec.colors.length)]!,
      pants: '#111827',
      hair: '#111827',
      skin: '#111827',
      kind,
    };
  });
  const slowest = new Map<number, number>();
  for (const v of list) slowest.set(v.loopId, Math.min(slowest.get(v.loopId) ?? Infinity, v.speed));
  for (const v of list) v.speed = slowest.get(v.loopId)!;
  return list;
}

export interface Quality {
  level: 'low' | 'medium' | 'high';
  dpr: [number, number];
  pedestrians: number;
  vehicles: number;
  shadows: boolean;
  shadowMap: number;
  /** Fraction of authored street trees/props to render. */
  props: number;
  trees: number;
}

export const QUALITY: Record<Quality['level'], Quality> = {
  low: { level: 'low', dpr: [1, 1], pedestrians: 45, vehicles: 8, shadows: false, shadowMap: 0, props: 0.5, trees: 0.5 },
  medium: { level: 'medium', dpr: [1, 1.5], pedestrians: 110, vehicles: 24, shadows: true, shadowMap: 1024, props: 1, trees: 1 },
  high: { level: 'high', dpr: [1, 2], pedestrians: 170, vehicles: 36, shadows: true, shadowMap: 2048, props: 1, trees: 1 },
};
