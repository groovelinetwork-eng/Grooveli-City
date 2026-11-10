import type { AABB, Vec2 } from './layout';

/**
 * Shared floor-plan vocabulary for walkable interiors (HQ, AI Career Center):
 * partitions with door openings, furniture footprints, simulated staff.
 */
export type PartitionKind = 'wall' | 'low-wall' | 'glass' | 'frosted' | 'divider' | 'balustrade';

export interface Partition {
  id: string;
  kind: PartitionKind;
  /** Axis the partition runs along, its fixed coordinate and extent. */
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  /** Door openings along the run [start, end]. */
  doors?: [number, number][];
  /** Indexes into `doors` that are service counters (low header, no door leaf). */
  counters?: number[];
  height: number;
}

/** Partition run split into solid segments around its door openings. */
export function partitionSegments(p: Partition): [number, number][] {
  const doors = [...(p.doors ?? [])].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let s = p.from;
  for (const [a, b] of doors) {
    if (a > s) out.push([s, a]);
    s = b;
  }
  if (p.to > s) out.push([s, p.to]);
  return out;
}

/** Thin collision boxes for every solid partition segment. */
export function partitionColliders(parts: Partition[], wallT: number): AABB[] {
  const out: AABB[] = [];
  for (const p of parts) {
    const t = p.kind === 'wall' ? wallT / 2 : p.kind === 'low-wall' ? 0.09 : 0.05;
    for (const [a, b] of partitionSegments(p)) {
      out.push(p.axis === 'x' ? { minX: a, maxX: b, minZ: p.at - t, maxZ: p.at + t } : { minX: p.at - t, maxX: p.at + t, minZ: a, maxZ: b });
    }
  }
  return out;
}

export interface PlanItem<T extends string = string> {
  id: string;
  type: T;
  x: number;
  z: number;
  /** World-aligned footprint (after rotation). */
  w: number;
  d: number;
  /** Y rotation; 0 = front faces +Z. */
  rot: number;
  solid: boolean;
  /** Free-form variant seed for accessories / colours. */
  v?: number;
}

export function itemBox(i: Pick<PlanItem, 'x' | 'z' | 'w' | 'd'>): AABB {
  return { minX: i.x - i.w / 2, maxX: i.x + i.w / 2, minZ: i.z - i.d / 2, maxZ: i.z + i.d / 2 };
}

export type StaffPose = 'sit' | 'stand';
export type StaffActivity = 'idle' | 'type' | 'talk';

export interface StaffSpec {
  id: string;
  x: number;
  z: number;
  heading: number;
  pose: StaffPose;
  activity: StaffActivity;
  /** Lowest quality level that shows this person. */
  tier: 0 | 1 | 2;
  /** Ping-pong walking route (overrides x/z). */
  route?: Vec2[];
}
