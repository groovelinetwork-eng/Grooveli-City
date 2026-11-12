/**
 * City traffic vehicle catalogue (Iteration 5 Task 3), from the Grooveli City
 * vehicle design board (refeerences/vehicles/vehicle-design-system.png).
 * Pure data: the 3D models in scene/vehicles are built to these dimensions.
 * Models are generic, brand-free interpretations of each vehicle category;
 * only Grooveli's own livery appears on the van, bus and service truck.
 */
export type VehicleKind = 'ev' | 'midsize' | 'compact' | 'suv' | 'crossover' | 'taxi' | 'van' | 'bus' | 'service' | 'exec';

/** Vehicle theme colours from the design board. */
export const VEHICLE_PALETTE = {
  white: '#eef2f6',
  silver: '#b4bcc8',
  black: '#15181e',
  blue: '#1f66d1',
  red: '#d32535',
  yellow: '#f5c21b',
  teal: '#22b394',
} as const;

const P = VEHICLE_PALETTE;

export interface VehicleSpec {
  kind: VehicleKind;
  label: string;
  /** Design-board category the model is a generic interpretation of. */
  category: string;
  /** Body dimensions in metres (length along travel, width without mirrors, height). */
  length: number;
  width: number;
  height: number;
  /** Cruising speed, m/s. */
  speed: number;
  colors: readonly string[];
}

export const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec> = {
  ev: { kind: 'ev', label: 'Electric sedan', category: 'Tesla-style electric sedan', length: 4.6, width: 1.86, height: 1.45, speed: 7, colors: [P.white, P.black, P.red, P.blue, P.silver] },
  midsize: { kind: 'midsize', label: 'Midsize sedan', category: 'Camry-style midsize sedan', length: 4.75, width: 1.84, height: 1.48, speed: 7, colors: [P.blue, P.silver, P.red, P.white, P.black] },
  compact: { kind: 'compact', label: 'Compact sedan', category: 'Honda-style compact sedan', length: 4.5, width: 1.8, height: 1.43, speed: 7, colors: [P.silver, P.white, P.teal, P.red, P.blue] },
  suv: { kind: 'suv', label: 'SUV', category: 'Toyota-style SUV', length: 4.85, width: 1.95, height: 1.83, speed: 7, colors: [P.white, P.black, P.silver, P.blue] },
  crossover: { kind: 'crossover', label: 'Crossover SUV', category: 'CR-V-style crossover', length: 4.6, width: 1.88, height: 1.72, speed: 7, colors: [P.red, P.teal, P.white, P.blue, P.silver] },
  taxi: { kind: 'taxi', label: 'City taxi', category: 'Modern taxi', length: 4.75, width: 1.84, height: 1.72, speed: 7, colors: [P.yellow] },
  van: { kind: 'van', label: 'Delivery van', category: 'Logistics van (Grooveli livery)', length: 5.6, width: 2.0, height: 2.55, speed: 6.5, colors: [P.white] },
  bus: { kind: 'bus', label: 'City bus', category: 'Public transport (Grooveli City livery)', length: 10.5, width: 2.5, height: 3.25, speed: 4.5, colors: [P.blue] },
  service: { kind: 'service', label: 'Service truck', category: 'City services pickup', length: 5.2, width: 1.95, height: 2.0, speed: 6, colors: [P.white] },
  exec: { kind: 'exec', label: 'Executive sedan', category: 'Premium executive sedan', length: 5.0, width: 1.9, height: 1.5, speed: 7, colors: [P.black, P.black, P.silver, P.white] },
};

export const VEHICLE_KINDS = Object.keys(VEHICLE_SPECS) as VehicleKind[];

/**
 * Repeating traffic mix. 11 entries (coprime with the 12 road loops) so each
 * loop carries a varied set; the first 8 (low quality) already show 8 types.
 */
export const TRAFFIC_MIX: readonly VehicleKind[] = ['taxi', 'ev', 'suv', 'bus', 'midsize', 'van', 'crossover', 'compact', 'exec', 'taxi', 'service'];
