/**
 * Camera framing measured from the day-view reference
 * (docs/VISUAL_RECONSTRUCTION_PLAN.md §1): orthographic, facing north with no
 * yaw, ~48° above the horizon, 20 px per metre at 1600 px wide, the player
 * framed ~100 px below screen centre.
 */
export const CAMERA = {
  pitchDeg: 48,
  distance: 140,
  /** Look-at point sits this far north (−Z) of the player. */
  leadZ: -8,
  /** Pixels per metre at the reference width. */
  baseZoom: 20,
  refWidth: 1600,
  minZoom: 10,
  maxZoom: 40,
} as const;

const pitch = (CAMERA.pitchDeg * Math.PI) / 180;
export const CAMERA_OFFSET = { y: Math.sin(pitch) * CAMERA.distance, z: Math.cos(pitch) * CAMERA.distance };

/** Viewport-aware ortho zoom: the reference framing on desktop, a wider view on small screens. */
export function effectiveZoom(level: number, viewportWidth: number): number {
  const k = Math.min(1.4, Math.max(0.55, viewportWidth / CAMERA.refWidth));
  return level * k;
}

/**
 * Shared city view state. App queues manual quarter turns / resets; the Player
 * rig applies them, eases the yaw and reports entrance assistance.
 */
export interface CityView {
  /** Current (eased) camera yaw; 0 = looking north. */
  yaw: number;
  /** Pending manual quarter turns (+1 = rotate view right). */
  turn: number;
  /** Pending request to return to the default north view. */
  reset: boolean;
  /** Continuous rotation while a touch rotate button is held: −1 left, +1 right, 0 none. */
  spin: number;
}

export function createCityView(): CityView {
  return { yaw: 0, turn: 0, reset: false, spin: 0 };
}

/** Hold-to-rotate speed for the touch camera buttons (radians per second). */
export const SPIN_SPEED = 1.6;
