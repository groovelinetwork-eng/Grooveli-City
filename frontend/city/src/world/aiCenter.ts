import type { AABB, Vec2 } from './layout';
import { buildNavGrid, type NavGrid } from './nav';
import { itemBox, partitionColliders, type Partition, type PlanItem, type StaffSpec } from './interior';

/**
 * AI Career Center floor plan (16 m × 13 m, metres, origin = floor centre).
 * Same cutaway convention as the apartment/HQ: camera at the +X/+Z corner,
 * full-height walls north (z = −6.5) and west (x = −8), low walls south/east.
 *
 *   ┌──────────── north wall ─────────────────────────────┐
 *   │ SKILLS LAB        │ INTELLIGENCE WALL │ POD │ POD │ POD │
 *   │ terminals, collab │  (LED wall)       │  consultation   │
 *   ├─glass──door───────┘                   └─────────────────┤
 *   │ INTERVIEW │          ◎ AI CORE            │ RECEPTION   │
 *   │ chamber   │        (holographic)          │ AI guide    │
 *   ├─frosted───┘                               │ waiting     │
 *   │ CAREER PATHWAY MAP  · data racks          │   ▲ entrance│
 *   └──────────────────────────────────────────────────────────┘
 */
export const AI = { minX: -8, maxX: 8, minZ: -6.5, maxZ: 6.5, wallH: 3.2, wallT: 0.16, glassH: 2.8 } as const;

export type AiFloor = 'resin' | 'composite' | 'carpet' | 'acoustic' | 'wood';
export type AiZoneId = 'skills-lab' | 'pods' | 'intelligence' | 'interview' | 'pathway' | 'reception' | 'hall';

export interface AiZone {
  id: AiZoneId;
  name: string;
  rect: AABB;
  floor: AiFloor;
}

const r = (minX: number, maxX: number, minZ: number, maxZ: number): AABB => ({ minX, maxX, minZ, maxZ });

/** Zones in priority order (first match wins); the hall is the base floor. */
export const AI_ZONES: AiZone[] = [
  { id: 'skills-lab', name: 'Skills development lab', rect: r(-8, -2.5, -6.5, -2.5), floor: 'composite' },
  { id: 'pods', name: 'AI consultation pods', rect: r(2.6, 8, -6.5, -2.8), floor: 'carpet' },
  { id: 'intelligence', name: 'Career intelligence wall', rect: r(-2.5, 2.6, -6.5, -4.4), floor: 'composite' },
  { id: 'interview', name: 'Interview practice chamber', rect: r(-8, -4.2, -1.4, 2.6), floor: 'acoustic' },
  { id: 'pathway', name: 'Career pathway map', rect: r(-8, -2.0, 3.2, 6.5), floor: 'composite' },
  { id: 'reception', name: 'Reception & AI guide', rect: r(3.5, 8, -1.2, 6.5), floor: 'wood' },
  { id: 'hall', name: 'AI core hall', rect: r(-8, 8, -6.5, 6.5), floor: 'resin' },
];

export function aiZoneAt(p: Vec2): AiZone | null {
  return AI_ZONES.find((z) => p.x >= z.rect.minX && p.x <= z.rect.maxX && p.z >= z.rect.minZ && p.z <= z.rect.maxZ) ?? null;
}

export const AI_PARTITIONS: Partition[] = [
  { id: 'north-wall', kind: 'wall', axis: 'x', at: -6.5, from: -8, to: 8, height: AI.wallH },
  { id: 'west-wall', kind: 'wall', axis: 'z', at: -8, from: -6.5, to: 6.5, height: AI.wallH },
  { id: 'south-low', kind: 'low-wall', axis: 'x', at: 6.5, from: -8, to: 8, doors: [[4.4, 6.4]], height: 0.55 },
  { id: 'east-low', kind: 'low-wall', axis: 'z', at: 8, from: -6.5, to: 6.5, height: 0.55 },
  { id: 'lab-south', kind: 'glass', axis: 'x', at: -2.5, from: -8, to: -2.5, doors: [[-4.4, -3.3]], height: AI.glassH },
  { id: 'int-north', kind: 'frosted', axis: 'x', at: -1.4, from: -8, to: -4.2, height: AI.glassH },
  { id: 'int-east', kind: 'glass', axis: 'z', at: -4.2, from: -1.4, to: 2.6, doors: [[1.3, 2.3]], height: AI.glassH },
  { id: 'int-south', kind: 'frosted', axis: 'x', at: 2.6, from: -8, to: -4.2, height: AI.glassH },
  { id: 'pod-divider-1', kind: 'divider', axis: 'z', at: 2.6, from: -6.5, to: -4.9, height: 1.5 },
  { id: 'pod-divider-2', kind: 'divider', axis: 'z', at: 4.4, from: -6.5, to: -4.9, height: 1.5 },
  { id: 'pod-divider-3', kind: 'divider', axis: 'z', at: 6.2, from: -6.5, to: -4.9, height: 1.5 },
];

export type AiItemType =
  | 'core'
  | 'core-terminal'
  | 'column'
  | 'pod-console'
  | 'pod-chair'
  | 'lab-desk'
  | 'task-chair'
  | 'assess-kiosk'
  | 'collab-table'
  | 'stool'
  | 'int-desk'
  | 'meeting-chair'
  | 'feedback-stand'
  | 'tripod'
  | 'holo-table'
  | 'milestone-totem'
  | 'rack'
  | 'ai-desk'
  | 'welcome-kiosk'
  | 'info-totem'
  | 'sofa'
  | 'coffee-table'
  | 'plant'
  | 'robot';

export type AiItem = PlanItem<AiItemType>;

const PI = Math.PI;
const H2 = PI / 2;
const items: AiItem[] = [];
const add = (id: string, type: AiItemType, x: number, z: number, w: number, d: number, rot = 0, solid = true, v?: number) => items.push({ id, type, x, z, w, d, rot, solid, v });

/** The AI core sits on a circular platform in the hall. */
export const CORE = { x: 0, z: -0.6, platform: 2.05, plinth: 0.75 } as const;

// ---- AI core + surrounding terminals (each faces the core)
add('core', 'core', CORE.x, CORE.z, CORE.plinth * 2, CORE.plinth * 2);
[PI / 4, -PI / 4, PI].forEach((a, i) => add(`core-terminal-${i}`, 'core-terminal', CORE.x + Math.sin(a) * 2.35, CORE.z + Math.cos(a) * 2.35, 0.5, 0.5, a + PI, true, i));

// ---- structure
add('column-1', 'column', 2.6, -2.55, 0.46, 0.46);
add('column-2', 'column', -2.0, 3.0, 0.46, 0.46);

// ---- consultation pods along the north wall
export const POD_X = [3.5, 5.3, 7.1];
POD_X.forEach((cx, k) => {
  add(`pod-console-${k}`, 'pod-console', cx, -5.95, 1.3, 0.6, 0, true, k);
  add(`pod-chair-${k}`, 'pod-chair', cx, -5.15, 0.6, 0.6, PI);
});

// ---- skills lab
[-6.9, -5.3].forEach((x, k) => {
  add(`lab-desk-${k}`, 'lab-desk', x, -5.95, 1.3, 0.6, 0, true, k);
  add(`lab-chair-${k}`, 'task-chair', x, -5.15, 0.6, 0.6, PI);
});
add('assess-kiosk', 'assess-kiosk', -3.4, -5.95, 0.7, 0.5);
export const COLLAB = { x: -4.9, z: -3.6 };
add('collab-table', 'collab-table', COLLAB.x, COLLAB.z, 0.9, 0.9);
[H2, -H2, 0].forEach((a, i) => add(`collab-stool-${i}`, 'stool', COLLAB.x + Math.sin(a) * 0.78, COLLAB.z + Math.cos(a) * 0.78, 0.44, 0.44, a + PI));

// ---- interview practice chamber
add('int-desk', 'int-desk', -6.5, 0.6, 0.7, 1.3, H2);
add('int-chair-cand', 'meeting-chair', -5.7, 0.6, 0.55, 0.55, -H2);
add('int-chair-coach', 'meeting-chair', -6.5, 1.75, 0.55, 0.55, PI);
add('feedback-stand', 'feedback-stand', -7.35, -0.75, 0.6, 0.45, PI / 4);
add('tripod', 'tripod', -6.55, -0.75, 0.45, 0.45, PI / 6);

// ---- career pathway map + data racks
export const HOLO = { x: -4.8, z: 4.9, r: 1.0 };
add('holo-table', 'holo-table', HOLO.x, HOLO.z, HOLO.r * 2, HOLO.r * 2);
add('milestone-totem', 'milestone-totem', -2.6, 5.9, 0.5, 0.5, PI / 4);
[3.6, 4.25, 4.9].forEach((z, i) => add(`rack-${i}`, 'rack', -7.6, z, 0.6, 0.6, H2, true, i));

// ---- reception & arrival
add('ai-desk', 'ai-desk', 6.0, 2.0, 2.6, 0.8);
add('guide-chair', 'task-chair', 6.0, 1.3, 0.6, 0.6, 0);
add('welcome-kiosk', 'welcome-kiosk', 4.2, 4.0, 0.6, 0.6, PI / 4);
add('info-totem', 'info-totem', 7.2, -0.6, 1.0, 0.4);
add('lounge-sofa', 'sofa', 7.35, 4.6, 0.9, 2.0, -H2);
add('lounge-table', 'coffee-table', 6.65, 4.6, 0.5, 0.9);
add('plant-1', 'plant', 7.6, 6.1, 0.46, 0.46);
add('plant-2', 'plant', 3.9, 6.1, 0.46, 0.46);
add('plant-3', 'plant', -2.3, -6.1, 0.46, 0.46);
add('guide-robot', 'robot', 4.2, 2.3, 0.5, 0.5, PI / 4);

export const AI_ITEMS: readonly AiItem[] = items;

/** Wall-mounted installations (north wall x ranges, west wall z ranges). */
export const AI_WALL_ITEMS = {
  intelligenceWall: { x: 0, w: 4.6, y: 0.45, h: 2.3 },
  labAssessment: { x: -6.1, y: 1.95, w: 2.8, h: 1.0 },
  labPathways: { x: -3.4, y: 1.95, w: 1.2, h: 0.7 },
  certificates: [-5.9, -4.95, -4.0, -3.05],
  certY: 1.6,
  interviewDisplay: { z: 0.6, y: 1.55, w: 1.9, h: 1.07 },
  acoustic: [
    [-1.2, -0.25],
    [1.45, 2.45],
  ] as [number, number][],
};

export const AI_ANCHORS: Record<string, Vec2> = {
  reception: { x: 4.75, z: 4.6 },
  assistant: { x: 0, z: 1.05 },
  guidance: { x: POD_X[0]!, z: -4.3 },
  cv: { x: POD_X[1]!, z: -4.3 },
  jobs: { x: POD_X[2]!, z: -4.3 },
  learning: { x: -6.1, z: -4.35 },
  assessment: { x: -3.4, z: -4.95 },
  matching: { x: 0, z: -4.15 },
  interview: { x: -3.6, z: 1.8 },
  pathway: { x: -3.4, z: 4.4 },
};

export const AI_SPAWN: Vec2 = { x: 5.4, z: 5.6 };
export const AI_PLAYER_RADIUS = 0.28;

const seat = (id: string, chairId: string, heading: number, activity: StaffSpec['activity'], tier: 0 | 1 | 2): StaffSpec => {
  const c = items.find((i) => i.id === chairId)!;
  return { id, x: c.x, z: c.z, heading, pose: 'sit', activity, tier };
};

export const AI_STAFF: StaffSpec[] = [
  seat('guide', 'guide-chair', 0, 'type', 0),
  seat('pod-user-1', 'pod-chair-0', PI, 'type', 0),
  seat('pod-user-3', 'pod-chair-2', PI, 'talk', 1),
  seat('learner-1', 'lab-chair-0', PI, 'type', 0),
  seat('learner-2', 'lab-chair-1', PI, 'type', 1),
  seat('collab-1', 'collab-stool-0', -H2, 'talk', 1),
  seat('collab-2', 'collab-stool-1', H2, 'talk', 2),
  seat('candidate', 'int-chair-cand', -H2, 'talk', 0),
  { id: 'wall-viewer-1', x: -0.95, z: -3.85, heading: PI, pose: 'stand', activity: 'idle', tier: 1 },
  { id: 'wall-viewer-2', x: 0.95, z: -3.8, heading: PI + 0.35, pose: 'stand', activity: 'talk', tier: 2 },
  { id: 'core-visitor', x: -2.02, z: 1.41, heading: 2.35, pose: 'stand', activity: 'type', tier: 0 },
  { id: 'pathway-explorer', x: -3.75, z: 5.7, heading: -2.2, pose: 'stand', activity: 'talk', tier: 1 },
  { id: 'staff-walker', x: 3.0, z: 4.8, heading: -H2, pose: 'stand', activity: 'idle', tier: 1, route: [{ x: 3.0, z: 4.8 }, { x: -1.4, z: 4.6 }, { x: -1.4, z: 1.9 }] },
];

/** Roaming service robots (decorative; routes stay on open floor). */
export const AI_ROBOT_ROUTES: Vec2[][] = [
  [
    { x: -1.0, z: 2.2 },
    { x: 2.4, z: 1.6 },
    { x: 2.2, z: -1.6 },
  ],
];

export const AI_COLLIDERS: AABB[] = [...items.filter((i) => i.solid).map(itemBox), ...partitionColliders(AI_PARTITIONS, AI.wallT)];
export const AI_BOUNDS: AABB = { minX: AI.minX + AI.wallT / 2, maxX: AI.maxX - 0.1, minZ: AI.minZ + AI.wallT / 2, maxZ: AI.maxZ - 0.1 };

let grid: NavGrid | null = null;
export function aiNavGrid(): NavGrid {
  return (grid ??= buildNavGrid(AI_BOUNDS, AI_COLLIDERS, AI_PLAYER_RADIUS + 0.02, 0.2));
}
