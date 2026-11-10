import { DISTRICTS, PARK_BLOCK } from '@grooveli/frontend-domain/public';
import { blockBounds, type AABB, type Vec2 } from './layout';
import { PLAZA_RECT, PLAZA_RING } from './plan';

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

const BLOCKS: AABB[] = [...DISTRICTS.map((d) => blockBounds(d.grid)), blockBounds(PARK_BLOCK)];

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
  kind: 'car' | 'taxi' | 'bus' | 'van' | 'exec';
}

const CAR_COLORS = ['#2563eb', '#dc2626', '#f8fafc', '#0f766e', '#ea580c', '#94a3b8', '#7c3aed'];

/** Vehicles circulate on the roads around blocks, one lane per direction. */
export function makeVehicles(count: number): Vehicle[] {
  return Array.from({ length: count }, (_, i) => {
    const b = BLOCKS[(i * 5) % BLOCKS.length]!;
    const clockwise = i % 2 === 0;
    const loop = loopFromBounds(b, -1.5, clockwise);
    const kind: Vehicle['kind'] = i % 7 === 3 ? 'bus' : i % 3 === 0 ? 'taxi' : i % 5 === 1 ? 'van' : i % 5 === 2 ? 'exec' : 'car';
    return {
      loop,
      offset: (i / count) * loopLength(loop) + rand(i + 21) * 6,
      speed: kind === 'bus' ? 4.5 : 7,
      color: kind === 'taxi' ? '#facc15' : kind === 'bus' ? '#2563eb' : kind === 'van' ? '#f8fafc' : kind === 'exec' ? '#111827' : CAR_COLORS[i % CAR_COLORS.length]!,
      pants: '#111827',
      hair: '#111827',
      skin: '#111827',
      kind,
    };
  });
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
