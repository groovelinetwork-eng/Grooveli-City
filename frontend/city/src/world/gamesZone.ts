import { PLAZA_RING, type Footprint } from './plan';

/**
 * Grooveli Games Zone — layout on Grooveli Plaza and the strip west of it
 * (approved placement, Games Hub reference "Grooveli Games Zone Plaza").
 * Pure data in world metres: north is −Z, the plaza paving is x −14.5…14.5,
 * z −8.6…12.5 (top 0.35 m); the west strip sidewalk top is 0.2 m.
 *
 *   west strip            plaza
 *   ┌────────────┬───────────────────────────────────────┐
 *   │ CHESS      │        ( GAMES HUB )        8-BALL    │
 *   │ terrace    │          pavilion           POOL      │
 *   │            │                             (covered) │
 *   │ CHECKERS   │   open      ( G lounge )    LUDO      │
 *   │ terrace    │   paving     sofas          PUZZLE    │
 *   │            │         [ GAMES ZONE ] steps          │
 *   └────────────┴───────────────────────────────────────┘
 */

/** Game ids shared by the 3D stations, the catalogue and the panels. */
export type GameId = 'chess' | 'checkers' | 'ludo' | 'pool' | 'puzzle';
export type GameStationId = GameId | 'games-hub';

/**
 * City people are drawn 1.45× life size (PERSON_SCALE), so game furniture is
 * modelled life-size and placed at this scale to suit them.
 */
export const FURNITURE_SCALE = 1.3;
export const POOL_SCALE = 1.15;

export const WEST_DECK_Y = 0.2 + 0.12;
export const EAST_DECK_Y = 0.35 + 0.08;

/** Glass pavilion (reception + hub), entrance on its south side facing the lounge. */
export const GAMES_PAVILION = { x: 0, z: -4.9, radius: 3.4, height: 4.3, doorWidth: 2.2 } as const;

/** Raised decks: game areas with a glowing violet edge. */
export interface GameDeck extends Footprint {
  id: GameId;
  /** Deck top height (avatars step up onto it). */
  y: number;
  /** Side the area opens towards (steps / sign). */
  open: 'east' | 'west';
}

export const GAME_DECKS: GameDeck[] = [
  { id: 'chess', minX: -22.3, maxX: -15.6, minZ: -7.6, maxZ: 1.3, y: WEST_DECK_Y, open: 'east' },
  { id: 'checkers', minX: -22.3, maxX: -15.6, minZ: 3.0, maxZ: 11.2, y: WEST_DECK_Y, open: 'east' },
  { id: 'pool', minX: 7.0, maxX: 14.1, minZ: -8.2, maxZ: -1.4, y: EAST_DECK_Y, open: 'west' },
  { id: 'ludo', minX: 7.0, maxX: 14.1, minZ: -0.4, maxZ: 5.4, y: EAST_DECK_Y, open: 'west' },
  { id: 'puzzle', minX: 7.0, maxX: 14.1, minZ: 6.4, maxZ: 12.0, y: EAST_DECK_Y, open: 'west' },
];

export const deckOf = (id: GameId) => GAME_DECKS.find((d) => d.id === id)!;

/** Two-player tables: [x, z, rotation]. Chairs sit on ±x of each table. */
export const CHESS_TABLES: [number, number][] = [
  [-20.6, -4.4],
  [-17.4, -4.4],
  [-20.6, -1.3],
  [-17.4, -1.3],
];
export const CHECKERS_TABLES: [number, number][] = [
  [-20.6, 5.4],
  [-17.4, 5.4],
  [-20.6, 8.6],
  [-17.4, 8.6],
];
/** Pool tables run east–west under the covered pergola. */
export const POOL_TABLES: [number, number][] = [
  [10.8, -6.3],
  [10.8, -3.3],
];
/** Four-seat Ludo tables. */
export const LUDO_TABLES: [number, number][] = [
  [9.3, 1.5],
  [12.4, 1.5],
];
/** Puzzle challenge tables (with a holographic piece above). */
export const PUZZLE_TABLES: [number, number][] = [
  [9.4, 9.6],
  [12.3, 9.6],
];

/** Giant Ludo tokens beside the Ludo tables. */
export const GIANT_TOKENS: { x: number; z: number; color: 'red' | 'blue' | 'yellow' | 'green' }[] = [
  { x: 11.7, z: 4.2, color: 'red' },
  { x: 12.3, z: 4.95, color: 'blue' },
  { x: 7.8, z: 4.5, color: 'yellow' },
  { x: 8.5, z: 4.95, color: 'green' },
];

/** Central lounge: the plaza ring becomes the "G" lounge; curved sofas on its east and west arcs. */
export const LOUNGE = { sofaRadius: 3.65, sofaDepth: 0.85, arcHalf: (40 * Math.PI) / 180 } as const;

/** Big "Games Zone" landmark sign on the south edge, between the steps. */
export const GAMES_ZONE_SIGN = { x: 0, z: 11.85, width: 4.6 } as const;

/** Where each station's interaction prompt sits (on the walkway in front of it). */
export const GAME_STATIONS: { id: GameStationId; label: string; position: { x: number; z: number } }[] = [
  { id: 'games-hub', label: 'Grooveli Games Hub', position: { x: 0, z: -0.9 } },
  { id: 'chess', label: 'Chess', position: { x: -14.9, z: -3.2 } },
  { id: 'checkers', label: 'Checkers', position: { x: -14.9, z: 7.0 } },
  { id: 'pool', label: '8-Ball Pool', position: { x: 6.4, z: -4.8 } },
  { id: 'ludo', label: 'Ludo', position: { x: 6.4, z: 2.5 } },
  { id: 'puzzle', label: 'Puzzles', position: { x: 6.4, z: 9.2 } },
];

function box(x: number, z: number, hw: number, hd: number): Footprint {
  return { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
}

/** Furniture the avatar walks around (approximate footprints). */
export const GAMES_COLLIDERS: Footprint[] = [
  // pavilion glass drum (square fit inside the circle, plus the side wings of the façade)
  box(GAMES_PAVILION.x, GAMES_PAVILION.z, 2.6, 2.6),
  ...CHESS_TABLES.map(([x, z]) => box(x, z, 0.45 * FURNITURE_SCALE, 0.45 * FURNITURE_SCALE)),
  ...CHECKERS_TABLES.map(([x, z]) => box(x, z, 0.45 * FURNITURE_SCALE, 0.45 * FURNITURE_SCALE)),
  ...POOL_TABLES.map(([x, z]) => box(x, z, 1.42 * POOL_SCALE, 0.82 * POOL_SCALE)),
  ...LUDO_TABLES.map(([x, z]) => box(x, z, 0.5 * FURNITURE_SCALE, 0.5 * FURNITURE_SCALE)),
  ...PUZZLE_TABLES.map(([x, z]) => box(x, z, 0.6 * FURNITURE_SCALE, 0.4 * FURNITURE_SCALE)),
  box(-16.6, -6.4, 0.6, 0.6), // knight statue
  box(13.3, 4.5, 0.5, 0.5), // giant dice
  ...GIANT_TOKENS.map((t) => box(t.x, t.z, 0.35, 0.35)),
  box(GAMES_ZONE_SIGN.x, GAMES_ZONE_SIGN.z, GAMES_ZONE_SIGN.width / 2, 0.3),
  // lounge sofas (three straight-ish segments per arc)
  ...[-1, 1].flatMap((side) =>
    [-0.7, 0, 0.7].map((t) => {
      const a = (side < 0 ? Math.PI : 0) + t * LOUNGE.arcHalf;
      return box(PLAZA_RING.x + Math.cos(a) * LOUNGE.sofaRadius, PLAZA_RING.z + Math.sin(a) * LOUNGE.sofaRadius, 0.45, 0.45);
    }),
  ),
];

/** Deck surface height at a point, or null when not on a game deck. */
export function deckHeightAt(p: { x: number; z: number }): number | null {
  for (const d of GAME_DECKS) if (p.x >= d.minX && p.x <= d.maxX && p.z >= d.minZ && p.z <= d.maxZ) return d.y;
  return null;
}
