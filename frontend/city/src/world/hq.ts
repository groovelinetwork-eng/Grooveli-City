import type { AABB, Vec2 } from './layout';
import { itemBox, partitionColliders, partitionSegments, type Partition, type PartitionKind, type PlanItem, type StaffActivity, type StaffPose, type StaffSpec } from './interior';

export { itemBox, partitionSegments };
export type { Partition, PartitionKind, StaffActivity, StaffPose, StaffSpec };
import { buildNavGrid, type NavGrid } from './nav';

/**
 * Company headquarters floor plan (one storey, 20 m × 16 m, metres, origin =
 * floor centre). Same convention as the apartment: the camera sits at the
 * +X/+Z corner, so the north (z = −8) and west (x = −10) walls are the full
 * height cutaway walls and the south/east edges are low walls.
 *
 *   ┌──────── north wall (windows) ────────────────────────────┐
 *   │ EXECUTIVE │ DEPARTMENT BAYS (3)        │ HR & SERVICES      │
 *   │  office   │                            │ (frosted glass)    │
 *   ├─glass─────┤──────── corridor ─────────────┬─HR counter──────┤
 *   │CONFERENCE │ │  OPEN-PLAN WORKSPACE     │C│ staff gates     │
 *   │  room     │ │  (2 desk clusters)       │U│ LOBBY +         │
 *   ├─glass─────┤ │                          │L│ RECEPTION       │
 *   │ INTERVIEW │ │                          │T│                 │
 *   ├─glass─────┤ ├──────────────────────────┘ │ waiting area    │
 *   │ LOUNGE + kitchenette │ TALENT HUB (careers) │   ▲ entrance    │
 *   └──────────────────────────────────────────────────────────┘
 */
export const HQ = { minX: -10, maxX: 10, minZ: -8, maxZ: 8, wallH: 3.0, wallT: 0.16, glassH: 2.75 } as const;

export type FloorFinish = 'wood' | 'carpet' | 'stone' | 'tile' | 'walnut';

export type ZoneId = 'lobby' | 'open-plan' | 'executive' | 'conference' | 'interview' | 'talent' | 'hr' | 'departments' | 'lounge' | 'corridor';

export interface Zone {
  id: ZoneId;
  name: string;
  rect: AABB;
  floor: FloorFinish;
}

const r = (minX: number, maxX: number, minZ: number, maxZ: number): AABB => ({ minX, maxX, minZ, maxZ });

/** Zones in priority order (first match wins in zoneAt). */
export const ZONES: Zone[] = [
  { id: 'executive', name: 'Executive office', rect: r(-10, -5, -8, -3.6), floor: 'walnut' },
  { id: 'departments', name: 'Department offices', rect: r(-5, 2.6, -8, -3.6), floor: 'carpet' },
  { id: 'hr', name: 'HR & employee services', rect: r(2.6, 10, -8, -3.6), floor: 'carpet' },
  { id: 'conference', name: 'Conference room', rect: r(-10, -5, -3.6, 1.4), floor: 'carpet' },
  { id: 'interview', name: 'Interview room', rect: r(-10, -5, 1.4, 4.6), floor: 'carpet' },
  { id: 'lounge', name: 'Employee lounge', rect: r(-10, -3.6, 4.6, 8), floor: 'tile' },
  { id: 'corridor', name: 'Corridor', rect: r(-5, 10, -3.6, -2.2), floor: 'wood' },
  { id: 'corridor', name: 'Corridor', rect: r(-5, -3.6, -2.2, 4.6), floor: 'wood' },
  { id: 'open-plan', name: 'Open-plan workspace', rect: r(-3.6, 3.6, -2.2, 3.8), floor: 'wood' },
  { id: 'talent', name: 'Talent hub', rect: r(-3.6, 2.4, 3.8, 8), floor: 'wood' },
  { id: 'lobby', name: 'Reception & lobby', rect: r(3.6, 10, -2.2, 8), floor: 'stone' },
  { id: 'lobby', name: 'Reception & lobby', rect: r(2.4, 3.6, 3.8, 8), floor: 'stone' },
];

export function zoneAt(p: Vec2): Zone | null {
  return ZONES.find((z) => p.x >= z.rect.minX && p.x <= z.rect.maxX && p.z >= z.rect.minZ && p.z <= z.rect.maxZ) ?? null;
}

// ---------------------------------------------------------------- partitions

export const PARTITIONS: Partition[] = [
  // exterior: full-height cutaway walls at the back, low walls on the camera side
  { id: 'north-wall', kind: 'wall', axis: 'x', at: -8, from: -10, to: 10, height: HQ.wallH },
  { id: 'west-wall', kind: 'wall', axis: 'z', at: -10, from: -8, to: 8, height: HQ.wallH },
  { id: 'south-low', kind: 'low-wall', axis: 'x', at: 8, from: -10, to: 10, doors: [[5.6, 7.8]], height: 0.55 },
  { id: 'east-low', kind: 'low-wall', axis: 'z', at: 10, from: -8, to: 8, height: 0.55 },
  // glass rooms along the west side
  { id: 'exec-east', kind: 'glass', axis: 'z', at: -5, from: -8, to: -3.6, doors: [[-5.0, -4.0]], height: HQ.glassH },
  { id: 'exec-south', kind: 'glass', axis: 'x', at: -3.6, from: -10, to: -5, height: HQ.glassH },
  { id: 'conf-east', kind: 'glass', axis: 'z', at: -5, from: -3.6, to: 1.4, doors: [[-1.6, -0.6]], height: HQ.glassH },
  { id: 'conf-south', kind: 'glass', axis: 'x', at: 1.4, from: -10, to: -5, height: HQ.glassH },
  { id: 'int-east', kind: 'glass', axis: 'z', at: -5, from: 1.4, to: 4.6, doors: [[2.4, 3.4]], height: HQ.glassH },
  { id: 'int-south', kind: 'glass', axis: 'x', at: 4.6, from: -10, to: -5, height: HQ.glassH },
  // HR suite: frosted for privacy; service counter set into the south run
  { id: 'hr-west', kind: 'frosted', axis: 'z', at: 2.6, from: -8, to: -3.6, height: HQ.glassH },
  { id: 'hr-south', kind: 'frosted', axis: 'x', at: -3.6, from: 2.6, to: 10, doors: [[3.0, 4.6], [7.6, 8.6]], counters: [0], height: HQ.glassH },
  // department bay dividers (acoustic fabric, desk height + screen)
  { id: 'bay-divider-1', kind: 'divider', axis: 'z', at: -2.47, from: -8, to: -6.0, height: 1.2 },
  { id: 'bay-divider-2', kind: 'divider', axis: 'z', at: 0.07, from: -8, to: -6.0, height: 1.2 },
  // lobby edge: glass balustrade either side of the staff speed gates
  { id: 'gate-rail-west', kind: 'balustrade', axis: 'x', at: -2.2, from: 3.9, to: 4.92, height: 1.05 },
  { id: 'gate-rail-east', kind: 'balustrade', axis: 'x', at: -2.2, from: 7.78, to: 10, height: 1.05 },
];

// ---------------------------------------------------------------- furniture

export type ItemType =
  | 'exec-desk' | 'exec-chair' | 'guest-chair' | 'bookshelf' | 'plant' | 'tall-plant' | 'floor-lamp'
  | 'conf-table' | 'meeting-chair' | 'credenza' | 'whiteboard'
  | 'interview-desk'
  | 'fridge' | 'kitchen' | 'cafe-table' | 'cafe-chair' | 'armchair' | 'coffee-table' | 'sofa'
  | 'careers-wall' | 'waiting-chair' | 'desk' | 'task-chair' | 'printer' | 'filing'
  | 'secure-cabinets' | 'hr-counter' | 'stool'
  | 'reception' | 'directory-kiosk' | 'info-totem' | 'speed-gate' | 'culture-wall' | 'rug';

export type Item = PlanItem<ItemType>;

const PI = Math.PI;
const H2 = PI / 2;
const items: Item[] = [];
const add = (id: string, type: ItemType, x: number, z: number, w: number, d: number, rot = 0, solid = true, v?: number) => items.push({ id, type, x, z, w, d, rot, solid, v });

// executive office
add('exec-rug', 'rug', -7.6, -5.95, 3.2, 2.5, 0, false, 0);
add('exec-desk', 'exec-desk', -7.7, -6.3, 1.9, 0.85);
add('exec-chair', 'exec-chair', -7.7, -7.15, 0.66, 0.66);
add('exec-guest-1', 'guest-chair', -8.15, -5.2, 0.6, 0.6, PI);
add('exec-guest-2', 'guest-chair', -7.25, -5.2, 0.6, 0.6, PI);
add('exec-bookshelf', 'bookshelf', -9.7, -6.85, 0.42, 1.7, H2);
add('exec-plant', 'tall-plant', -5.5, -7.45, 0.5, 0.5);
add('exec-lamp', 'floor-lamp', -9.55, -4.1, 0.36, 0.36);

// conference room
add('conf-table', 'conf-table', -7.4, -1.1, 2.6, 1.1);
[-8.2, -7.4, -6.6].forEach((x, i) => {
  add(`conf-chair-n${i}`, 'meeting-chair', x, -1.98, 0.55, 0.55, 0);
  add(`conf-chair-s${i}`, 'meeting-chair', x, -0.22, 0.55, 0.55, PI);
});
add('conf-credenza', 'credenza', -9.7, -1.1, 0.42, 1.8, H2);
add('conf-whiteboard', 'whiteboard', -8.6, -3.25, 1.5, 0.5);
add('conf-plant', 'plant', -5.42, 1.0, 0.46, 0.46);

// interview room
add('int-desk', 'interview-desk', -7.6, 3.0, 0.8, 1.5, H2);
add('int-chair-1', 'meeting-chair', -8.35, 2.62, 0.55, 0.55, H2);
add('int-chair-2', 'meeting-chair', -8.35, 3.38, 0.55, 0.55, H2);
add('int-chair-cand', 'meeting-chair', -6.8, 3.0, 0.55, 0.55, -H2);
add('int-plant', 'plant', -9.55, 1.85, 0.46, 0.46);

// lounge & kitchenette
add('lounge-rug', 'rug', -5.3, 6.75, 2.7, 2.2, 0, false, 1);
add('fridge', 'fridge', -9.58, 5.12, 0.65, 0.62, H2);
add('kitchen', 'kitchen', -9.6, 6.2, 0.62, 1.4, H2);
add('cafe-table', 'cafe-table', -7.7, 6.2, 0.56, 0.56);
[PI, PI / 3, -PI / 3].forEach((a, i) => add(`cafe-chair-${i}`, 'cafe-chair', -7.7 + Math.sin(a) * 0.64, 6.2 + Math.cos(a) * 0.64, 0.46, 0.46, a + PI));
add('lounge-armchair', 'armchair', -6.25, 6.75, 0.82, 0.86, H2);
add('lounge-table', 'coffee-table', -5.3, 6.75, 0.6, 0.95);
add('lounge-sofa', 'sofa', -4.3, 6.75, 0.92, 1.8, -H2);
add('lounge-plant-1', 'tall-plant', -3.95, 5.35, 0.5, 0.5);
add('lounge-plant-2', 'plant', -8.2, 7.7, 0.46, 0.46);

// talent hub (recruitment)
add('careers-wall', 'careers-wall', -1.4, 4.35, 1.95, 0.36);
[-2.3, -1.6, -0.9].forEach((x, i) => add(`wait-chair-${i}`, 'waiting-chair', x, 6.3, 0.52, 0.52, PI));
add('rec-desk', 'desk', 1.2, 5.6, 1.3, 0.7, 0, true, 7);
add('rec-chair', 'task-chair', 1.2, 4.8, 0.6, 0.6, 0);
add('rec-guest', 'meeting-chair', 1.2, 6.4, 0.55, 0.55, PI);
add('hub-plant-1', 'tall-plant', -3.2, 7.55, 0.5, 0.5);
add('hub-plant-2', 'plant', 2.0, 7.6, 0.46, 0.46);

// open-plan workspace: two clusters of four benching desks
export const CLUSTERS = [
  { cx: -1.95, cz: 0.75 },
  { cx: 1.35, cz: 0.75 },
];
CLUSTERS.forEach(({ cx, cz }, k) => {
  [-1, 1].forEach((s, j) => {
    const x = cx + s * 0.635;
    add(`op-desk-${k}n${j}`, 'desk', x, cz - 0.36, 1.25, 0.7, PI, true, k * 4 + j);
    add(`op-desk-${k}s${j}`, 'desk', x, cz + 0.36, 1.25, 0.7, 0, true, k * 4 + j + 2);
    add(`op-chair-${k}n${j}`, 'task-chair', x, cz - 1.03, 0.6, 0.6, 0);
    add(`op-chair-${k}s${j}`, 'task-chair', x, cz + 1.03, 0.6, 0.6, PI);
  });
});
add('op-credenza', 'credenza', -2.2, 3.55, 2.0, 0.45, 0, true, 1);
add('op-plant-1', 'tall-plant', 2.05, 3.3, 0.5, 0.5);
add('op-plant-2', 'tall-plant', 3.2, -1.85, 0.5, 0.5);
add('op-printer', 'printer', -3.2, -1.75, 0.55, 0.6, H2);

// department bays along the north wall
export const BAYS = [-3.735, -1.2, 1.335];
BAYS.forEach((bx, k) => {
  [-1, 1].forEach((s, j) => {
    add(`dept-desk-${k}${j}`, 'desk', bx + s * 0.6, -7.45, 1.1, 0.7, 0, true, 10 + k * 2 + j);
    add(`dept-chair-${k}${j}`, 'task-chair', bx + s * 0.6, -6.62, 0.6, 0.6, PI);
  });
});
add('dept-filing', 'filing', -4.7, -5.6, 0.5, 0.6);
add('dept-plant', 'tall-plant', 2.25, -5.8, 0.5, 0.5);

// HR & employee services
add('hr-cabinets', 'secure-cabinets', 4.1, -7.62, 2.4, 0.6);
[6.6, 8.6].forEach((x, j) => {
  add(`hr-desk-${j}`, 'desk', x, -6.3, 1.3, 0.7, 0, true, 20 + j);
  add(`hr-chair-${j}`, 'task-chair', x, -5.5, 0.6, 0.6, PI);
});
add('hr-counter', 'hr-counter', 3.8, -3.6, 1.6, 0.6);
add('hr-stool', 'stool', 3.8, -4.25, 0.42, 0.42);
add('hr-plant', 'plant', 9.55, -4.05, 0.46, 0.46);

// lobby & reception
add('lobby-rug', 'rug', 8.55, 5.4, 2.7, 3.7, 0, false, 2);
add('reception', 'reception', 6.7, 2.5, 3.0, 0.8);
add('reception-chair', 'task-chair', 6.7, 1.75, 0.6, 0.6, 0);
add('reception-credenza', 'credenza', 6.7, 1.15, 2.4, 0.45, 0, true, 2);
add('lobby-sofa', 'sofa', 9.4, 5.4, 0.92, 2.3, -H2);
add('lobby-armchair-1', 'armchair', 8.3, 3.7, 0.82, 0.82, 0);
add('lobby-armchair-2', 'armchair', 8.3, 7.1, 0.82, 0.82, PI);
add('lobby-table', 'coffee-table', 8.25, 5.4, 0.6, 1.0);
add('lobby-plant-1', 'tall-plant', 9.6, 3.35, 0.5, 0.5);
add('lobby-plant-2', 'tall-plant', 5.0, 7.5, 0.5, 0.5);
add('lobby-plant-3', 'plant', 9.6, 7.62, 0.46, 0.46);
add('info-totem', 'info-totem', 9.35, 0.4, 1.0, 0.4, 0);
add('directory-kiosk', 'directory-kiosk', 4.6, -1.15, 0.6, 0.6, PI / 4);
add('culture-wall', 'culture-wall', 3.75, 0.5, 0.3, 5.4, H2);
[5.0, 5.9, 6.8, 7.7].forEach((x, i) => add(`gate-${i}`, 'speed-gate', x, -2.2, 0.16, 1.0, 0));

export const HQ_ITEMS: readonly Item[] = items;

// ---------------------------------------------------------------- wall-mounted

export const HQ_WALL_ITEMS = {
  /** Windows on the north wall (x ranges) and the west wall (z ranges). */
  northWindows: [
    [-9.2, -6.4],
    [-4.6, -2.9],
    [-2.05, -0.35],
    [0.5, 2.2],
    [7.6, 9.6],
  ] as [number, number][],
  westWindows: [[1.9, 4.1]] as [number, number][],
  windowSill: 0.75,
  windowHeight: 1.95,
  conferenceScreen: { z: -1.1, y: 1.55, w: 2.0, h: 1.13 },
  execArt: { z: -4.75, y: 1.6, w: 1.0, h: 1.2 },
  interviewArt: { x: -6.2, y: 1.7 },
  noticeboard: { z: 7.4, y: 1.5, w: 0.95, h: 0.75 },
  onboardingBoard: { x: 6.3, y: 1.75, w: 1.3, h: 0.9 },
  kitchenCabinets: { from: 5.45, to: 6.95 },
  /** Interview scheduling tablet mounted on the glass beside the interview door. */
  scheduleTablet: { x: -4.94, z: 1.95, y: 1.35 },
  /** HR information display on the corridor face of the HR glass. */
  hrInfo: { x: 5.85, z: -3.54, y: 1.55, w: 1.1, h: 0.66 },
};

// ---------------------------------------------------------------- stations

/** Interaction anchors (ids match HQ_STATIONS). All are reachable floor points. */
export const HQ_ANCHORS: Record<string, Vec2> = {
  reception: { x: 6.7, z: 3.55 },
  culture: { x: 4.55, z: 1.6 },
  announcements: { x: 9.2, z: 1.3 },
  directory: { x: 5.15, z: -0.6 },
  employees: { x: 6.35, z: -1.25 },
  careers: { x: -1.4, z: 5.15 },
  recruitment: { x: 0.0, z: 5.6 },
  interview: { x: -4.3, z: 1.95 },
  meeting: { x: -5.6, z: -1.1 },
  departments: { x: -1.2, z: -4.6 },
  hr: { x: 3.8, z: -2.75 },
  records: { x: 4.1, z: -6.5 },
  lounge: { x: -9.0, z: 7.35 },
  management: { x: -6.15, z: -5.35 },
};

export const HQ_SPAWN: Vec2 = { x: 6.7, z: 7.0 };
export const HQ_PLAYER_RADIUS = 0.28;

// ---------------------------------------------------------------- simulated staff

const seat = (id: string, chairId: string, heading: number, activity: StaffActivity, tier: 0 | 1 | 2): StaffSpec => {
  const c = items.find((i) => i.id === chairId)!;
  return { id, x: c.x, z: c.z, heading, pose: 'sit', activity, tier };
};

export const HQ_STAFF: StaffSpec[] = [
  seat('receptionist', 'reception-chair', 0, 'type', 0),
  seat('dev-1', 'op-chair-0n0', 0, 'type', 0),
  seat('dev-2', 'op-chair-0s1', PI, 'type', 1),
  seat('dev-3', 'op-chair-1n1', 0, 'type', 0),
  seat('dev-4', 'op-chair-1s0', PI, 'idle', 2),
  seat('dept-1', 'dept-chair-00', PI, 'type', 1),
  seat('dept-2', 'dept-chair-21', PI, 'type', 0),
  seat('dept-3', 'dept-chair-11', PI, 'idle', 2),
  seat('hr-officer', 'hr-chair-0', PI, 'type', 1),
  seat('executive', 'exec-chair', 0, 'idle', 0),
  seat('meeting-1', 'conf-chair-n0', 0, 'idle', 1),
  seat('meeting-2', 'conf-chair-s2', PI, 'idle', 2),
  { id: 'presenter', x: -9.25, z: -2.35, heading: PI / 3, pose: 'stand', activity: 'talk', tier: 1 },
  seat('interviewer', 'int-chair-1', H2, 'talk', 1),
  seat('candidate', 'int-chair-cand', -H2, 'idle', 1),
  seat('recruiter', 'rec-chair', 0, 'type', 0),
  seat('waiting-candidate', 'wait-chair-1', PI, 'idle', 2),
  { id: 'lounge-a', x: -8.75, z: 5.3, heading: -H2, pose: 'stand', activity: 'idle', tier: 1 },
  { id: 'lounge-b', x: -8.1, z: 5.75, heading: -2.2, pose: 'stand', activity: 'talk', tier: 2 },
  { id: 'walker-1', x: -4.3, z: 3.9, heading: PI, pose: 'stand', activity: 'idle', tier: 1, route: [{ x: -4.3, z: 3.9 }, { x: -4.3, z: -2.9 }, { x: 2.2, z: -2.9 }] },
  { id: 'walker-2', x: 4.3, z: 6.6, heading: -H2, pose: 'stand', activity: 'idle', tier: 2, route: [{ x: 4.3, z: 6.6 }, { x: -0.2, z: 7.2 }] },
];

// ---------------------------------------------------------------- collision

export const HQ_COLLIDERS: AABB[] = [...items.filter((i) => i.solid).map(itemBox), ...partitionColliders(PARTITIONS, HQ.wallT)];
export const HQ_BOUNDS: AABB = { minX: HQ.minX + HQ.wallT / 2, maxX: HQ.maxX - 0.1, minZ: HQ.minZ + HQ.wallT / 2, maxZ: HQ.maxZ - 0.1 };

let grid: NavGrid | null = null;
/** Lazily-built walkability grid for click-to-walk routing. */
export function hqNavGrid(): NavGrid {
  return (grid ??= buildNavGrid(HQ_BOUNDS, HQ_COLLIDERS, HQ_PLAYER_RADIUS + 0.02, 0.2));
}
