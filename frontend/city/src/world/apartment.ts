import type { AABB, Vec2 } from './layout';

/**
 * Apartment layout reconstructed from refeerences/apartment-reference.png.
 * Metres; origin = floor centre. +X runs toward screen right-down, +Z toward
 * screen left-down (camera sits at the +X/+Z corner). The two cutaway walls are
 * the west wall (x = −HALF, door) and the north wall (z = −HALF, window).
 */
export const ROOM = { half: 4.25, wallH: 2.85, wallT: 0.14 } as const;
const H = ROOM.half;

export interface Furniture {
  id: string;
  /** Centre on the floor. */
  x: number;
  z: number;
  /** Footprint along X and Z after rotation. */
  w: number;
  d: number;
  /** Y rotation (radians). 0 = front faces +Z. */
  rot: number;
  solid: boolean;
}

export const FURNITURE: Furniture[] = [
  { id: 'bed', x: -2.85, z: -3.12, w: 1.75, d: 2.25, rot: 0, solid: true },
  { id: 'sofa-green-back', x: -3.78, z: -0.93, w: 0.95, d: 2.1, rot: Math.PI / 2, solid: true },
  { id: 'chair-dining', x: -3.7, z: 0.95, w: 0.5, d: 0.5, rot: Math.PI / 2, solid: true },
  { id: 'desk', x: -1.0, z: -3.6, w: 1.5, d: 0.72, rot: 0, solid: true },
  { id: 'chair-office', x: -1.0, z: -2.75, w: 0.6, d: 0.6, rot: Math.PI + 0.35, solid: true },
  { id: 'cooler', x: 0.65, z: -3.6, w: 0.75, d: 0.5, rot: 0, solid: true },
  { id: 'side-table', x: 1.93, z: -3.65, w: 0.62, d: 0.62, rot: 0, solid: true },
  { id: 'plant', x: 3.75, z: -3.78, w: 0.5, d: 0.5, rot: 0, solid: true },
  { id: 'fridge', x: 3.72, z: -2.35, w: 0.6, d: 0.55, rot: -Math.PI / 2, solid: true },
  { id: 'radio-table', x: 3.25, z: -1.62, w: 0.62, d: 0.48, rot: -Math.PI / 2, solid: true },
  { id: 'sofa-brown', x: -2.07, z: 3.3, w: 2.9, d: 1.08, rot: Math.PI, solid: true },
  { id: 'sofa-green-front', x: 0.75, z: 1.35, w: 1.0, d: 2.3, rot: -Math.PI / 2, solid: true },
  { id: 'toilet', x: 3.72, z: 3.3, w: 0.5, d: 0.7, rot: 0, solid: true },
  { id: 'basin', x: 3.75, z: 2.45, w: 0.55, d: 0.55, rot: 0, solid: false },
  { id: 'bucket', x: 3.85, z: 1.85, w: 0.4, d: 0.4, rot: 0, solid: true },
  { id: 'jerrycans', x: 3.7, z: 1.15, w: 0.5, d: 0.4, rot: 0.4, solid: true },
  { id: 'barrel', x: 3.85, z: 0.5, w: 0.65, d: 0.65, rot: 0, solid: true },
];

/** Wall-mounted items (no footprint). */
export const WALL_ITEMS = {
  door: { z: 1.55, width: 1.0, height: 2.1 },
  window: { x: 2.05, width: 2.3, sill: 1.05, height: 1.3 },
  statsDisplay: { z: -1.45, y: 1.75, width: 0.95, height: 0.7 },
  trophyShelf: { z: 0.3, y: 1.55, width: 1.1 },
  sconces: [
    { wall: 'west' as const, at: -0.7, y: 2.25 },
    { wall: 'north' as const, at: -1.2, y: 2.25 },
  ],
};

/** Interaction anchors for the apartment stations (ids match APARTMENT_STATIONS). */
export const APARTMENT_ANCHORS: Record<string, Vec2> = {
  desk: { x: -1.65, z: -2.55 },
  laptop: { x: -0.35, z: -2.6 },
  cv: { x: 1.93, z: -2.85 },
  trophies: { x: -3.05, z: 0.3 },
  stats: { x: -3.0, z: -1.45 },
  phone: { x: 2.6, z: -1.62 },
};

export const APARTMENT_SPAWN: Vec2 = { x: -2.95, z: 0.55 };

/** Collision boxes: solid furniture plus the room bounds (the front is open but kept walkable only inside). */
export const APARTMENT_COLLIDERS: AABB[] = FURNITURE.filter((f) => f.solid).map((f) => ({ minX: f.x - f.w / 2, maxX: f.x + f.w / 2, minZ: f.z - f.d / 2, maxZ: f.z + f.d / 2 }));
export const APARTMENT_BOUNDS: AABB = { minX: -H + ROOM.wallT, maxX: H, minZ: -H + ROOM.wallT, maxZ: H };
