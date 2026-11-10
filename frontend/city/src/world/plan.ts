/**
 * Authored architectural plan for the city, reconstructed from the day-view
 * reference (docs/VISUAL_RECONSTRUCTION_PLAN.md). World units are metres;
 * the origin is the centre of the Grooveli Plaza ring.
 *
 * Every fixture building gets an explicit footprint and an architectural
 * style. Decor buildings are city-only (non-interactive) and exist purely for
 * the reference's density; they still collide.
 */

export type BuildingStyle =
  | 'glassOffice'
  | 'markets'
  | 'hospital'
  | 'signTower'
  | 'mall'
  | 'roundTower'
  | 'billboardBlock'
  | 'tower'
  | 'midrise'
  | 'civic'
  | 'shop'
  | 'flat';

export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface BuildingPlan {
  rect: Footprint;
  h: number;
  style: BuildingStyle;
  /** Façade palette: body colour and accent. */
  body?: string;
  accent?: string;
  /** Side of the footprint the entrance sits on. Default south (+Z, toward the camera). */
  entrance?: 'north' | 'south';
  /** Seed for deterministic façade variation. */
  seed?: number;
}

export const BUILDING_PLANS: Record<string, BuildingPlan> = {
  // University (0,0) — round green-roof tower, top-left of the reference.
  'b-academy': { rect: { minX: -50, maxX: -34, minZ: -33, maxZ: -17 }, h: 16, style: 'roundTower', body: '#dfe7ef', accent: '#3b82c4' },
  'b-library': { rect: { minX: -64, maxX: -53, minZ: -29, maxZ: -17 }, h: 7, style: 'civic', body: '#e8dcc6', accent: '#4d7c0f' },
  // Technology Hub (1,0) — the two buildings directly above the plaza.
  'b-kestrel': { rect: { minX: -21, maxX: -7.5, minZ: -30, maxZ: -16.5 }, h: 15, style: 'glassOffice', body: '#eef2f6', accent: '#1e3a8a' },
  'b-tech-tower': { rect: { minX: 3, maxX: 16, minZ: -29, maxZ: -16.5 }, h: 13, style: 'markets', body: '#e9edf2', accent: '#0f2a5c' },
  'b-tech-lab': { rect: { minX: -21, maxX: -8, minZ: -45, maxZ: -34 }, h: 9, style: 'midrise', body: '#d5dde6', accent: '#0e7490', seed: 3 },
  // Healthcare (2,0) — hospital with the Grooveli billboard, top-right.
  'b-amberline': { rect: { minX: 25, maxX: 44, minZ: -34, maxZ: -16.5 }, h: 11, style: 'hospital', body: '#f4f6f8', accent: '#2563eb' },
  'b-pharmacy': { rect: { minX: 26, maxX: 40, minZ: -45, maxZ: -37 }, h: 5, style: 'shop', body: '#f1f5f9', accent: '#dc2626', seed: 5 },
  // Finance (3,0)
  'b-copperleaf': { rect: { minX: 72, maxX: 88, minZ: -38, maxZ: -17 }, h: 26, style: 'tower', body: '#c7b299', accent: '#78350f', seed: 7 },
  'b-exchange': { rect: { minX: 91, maxX: 101, minZ: -32, maxZ: -17 }, h: 9, style: 'civic', body: '#efe6d2', accent: '#a16207' },
  // Creative (0,1) — billboard building west of the plaza.
  'b-halcyon': { rect: { minX: -50, maxX: -35, minZ: -8, maxZ: 2.5 }, h: 9, style: 'billboardBlock', body: '#e9eef4', accent: '#9d174d' },
  'b-studio': { rect: { minX: -64, maxX: -53, minZ: -7, maxZ: -1 }, h: 8, style: 'midrise', body: '#f3d9e4', accent: '#db2777', seed: 11 },
  // Plaza — the stage is the flat central disc (walkable, no collider).
  'b-plaza-stage': { rect: { minX: -2.3, maxX: 2.3, minZ: -1.1, maxZ: 3.5 }, h: 0, style: 'flat' },
  // Hospitality (2,1) — rooftop-dining mall east of the plaza.
  'b-saffron': { rect: { minX: 24.5, maxX: 52, minZ: -1.5, maxZ: 12.4 }, h: 7.5, style: 'mall', body: '#eef1f4', accent: '#9a3412' },
  'b-cafe': { rect: { minX: 54.5, maxX: 60.5, minZ: -7, maxZ: 4 }, h: 4.5, style: 'shop', body: '#fde7cf', accent: '#fb923c', seed: 13 },
  // Recruitment (3,1) — careers tower.
  'b-meridian': { rect: { minX: 74, maxX: 96, minZ: -6, maxZ: 11 }, h: 12, style: 'glassOffice', body: '#f2ede4', accent: '#b45309' },
  // Apartment (0,2)
  'b-apartment': { rect: { minX: -58, maxX: -43, minZ: 29, maxZ: 47 }, h: 10, style: 'midrise', body: '#e9e2f3', accent: '#6b21a8', entrance: 'north', seed: 17 },
  'b-apts-2': { rect: { minX: -40.5, maxX: -34, minZ: 27, maxZ: 40 }, h: 10, style: 'midrise', body: '#ede4f6', accent: '#7e22ce', entrance: 'north', seed: 19 },
  // AI Career Center (1,2) — south of the plaza; entrance faces the plaza.
  'b-ai-center': { rect: { minX: -14, maxX: 8, minZ: 31, maxZ: 48 }, h: 9, style: 'glassOffice', body: '#e6f4f2', accent: '#0f766e', entrance: 'north' },
  // Corporate (2,2)
  'b-orbitwell': { rect: { minX: 26, maxX: 40, minZ: 33, maxZ: 48 }, h: 12, style: 'tower', body: '#c9d3e3', accent: '#312e81', entrance: 'north', seed: 23 },
  'b-tidewater': { rect: { minX: 44, maxX: 59, minZ: 37, maxZ: 50 }, h: 14, style: 'midrise', body: '#d6dce4', accent: '#475569', entrance: 'north', seed: 29 },
  'b-corp-tower': { rect: { minX: 44, maxX: 53, minZ: 28, maxZ: 34 }, h: 14, style: 'tower', body: '#aab6c8', accent: '#1e293b', seed: 31 },
};

/** City-only buildings that fill the reference's density. Not interactive. */
export interface DecorBuilding extends BuildingPlan {
  id: string;
  name: string;
}

export const DECOR_BUILDINGS: DecorBuilding[] = [
  { id: 'd-careers-tower', name: 'Careers Tower', rect: { minX: 47, maxX: 59, minZ: -35, maxZ: -17.5 }, h: 19, style: 'signTower', body: '#e7ecf2', accent: '#1d4ed8' },
  { id: 'd-tech-north', name: 'Hub Annex', rect: { minX: 2, maxX: 16, minZ: -45, maxZ: -33 }, h: 20, style: 'tower', body: '#cfd8e3', accent: '#334155', seed: 37 },
  { id: 'd-uni-north', name: 'Faculty Hall', rect: { minX: -64, maxX: -51, minZ: -45, maxZ: -34 }, h: 10, style: 'midrise', body: '#efe3cf', accent: '#166534', seed: 41 },
  { id: 'd-health-north', name: 'Clinic Annex', rect: { minX: 44, maxX: 59, minZ: -45, maxZ: -38 }, h: 9, style: 'midrise', body: '#f1f5f9', accent: '#ef4444', seed: 43 },
  { id: 'd-finance-north', name: 'Ledger House', rect: { minX: 72, maxX: 100, minZ: -45, maxZ: -41 }, h: 12, style: 'midrise', body: '#e7dccb', accent: '#92400e', seed: 47 },
  { id: 'd-creative-south', name: 'Gallery Lofts', rect: { minX: -64, maxX: -54, minZ: 1, maxZ: 12 }, h: 6, style: 'shop', body: '#fbe4ec', accent: '#be185d', seed: 53 },
  { id: 'd-hosp-east', name: 'Market Hall', rect: { minX: 54.5, maxX: 60.5, minZ: 6, maxZ: 12 }, h: 5, style: 'shop', body: '#fff1dd', accent: '#ea580c', seed: 59 },
  { id: 'd-recruit-north', name: 'Talent Lofts', rect: { minX: 98, maxX: 102, minZ: -7, maxZ: 11 }, h: 8, style: 'midrise', body: '#f5e9d6', accent: '#b45309', seed: 61 },
  { id: 'd-ai-east', name: 'Model Labs', rect: { minX: 10.5, maxX: 15, minZ: 31, maxZ: 48 }, h: 7, style: 'midrise', body: '#dff3ef', accent: '#0f766e', seed: 67 },
  { id: 'd-ai-west', name: 'Data Commons', rect: { minX: -22.5, maxX: -16.5, minZ: 31, maxZ: 48 }, h: 6, style: 'midrise', body: '#e7eef0', accent: '#155e75', seed: 71 },
  { id: 'd-apt-south', name: 'Garden Flats', rect: { minX: -40.5, maxX: -34, minZ: 42, maxZ: 51 }, h: 7, style: 'midrise', body: '#efe6f6', accent: '#7e22ce', seed: 73 },
];

/** The plaza paving and its central ring (reference: x 505–1085 px, y 265–580 px). */
export const PLAZA_RECT: Footprint = { minX: -14.5, maxX: 14.5, minZ: -8.6, maxZ: 12.5 };
export const PLAZA_RING = { x: 0, z: 1.2, radius: 6.3, discRadius: 2.3 };
/** Minor north–south street between the two buildings above the plaza. */
export const MINOR_STREETS: Footprint[] = [{ minX: -5.5, maxX: -0.5, minZ: -48, maxZ: -14 }];
