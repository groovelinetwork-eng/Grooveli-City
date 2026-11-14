import { z } from 'zod';
import type { GameId } from '../world/gamesZone';

/**
 * Grooveli Games — typed catalogue and service abstraction.
 *
 * The 3D Games Zone only shows physical stations and information panels. Game
 * rules, sessions, matchmaking, invitations and results belong to a future
 * games backend (see docs/GAMES_CONTRACT.md); nothing here simulates them.
 *
 * A game is playable in the city only when BOTH are true:
 *   1. the games service reports it `available`, and
 *   2. a frontend client for it is registered in GAME_CLIENTS.
 * Neither exists yet, so every game is shown as "Coming soon".
 */
export const GAME_IDS = ['chess', 'checkers', 'ludo', 'pool', 'puzzle'] as const satisfies readonly GameId[];

export const gameAvailabilitySchema = z.enum(['coming-soon', 'available', 'maintenance']);
export type GameAvailability = z.infer<typeof gameAvailabilitySchema>;

/** Ways a game can be played once the backend supports it. */
export const playModeSchema = z.enum(['invite-friend', 'matchmaking', 'solo-challenge', 'practice']);
export type PlayMode = z.infer<typeof playModeSchema>;

export interface GameDefinition {
  id: GameId;
  title: string;
  tagline: string;
  description: string;
  players: { min: number; max: number };
  /** Modes planned for this game (not yet available). */
  plannedModes: PlayMode[];
  accent: string;
}

/** Product copy for the five planned games (static frontend content). */
export const GAME_CATALOGUE: Record<GameId, GameDefinition> = {
  chess: {
    id: 'chess',
    title: 'Chess',
    tagline: 'Think ahead, play fair',
    description: 'Classic two-player chess at the terrace tables — challenge a colleague or a new connection to a thoughtful match.',
    players: { min: 2, max: 2 },
    plannedModes: ['invite-friend', 'matchmaking'],
    accent: '#a78bfa',
  },
  checkers: {
    id: 'checkers',
    title: 'Checkers',
    tagline: 'Quick, friendly, strategic',
    description: 'Fast-paced draughts for a short break between applications, interviews or meetings.',
    players: { min: 2, max: 2 },
    plannedModes: ['invite-friend', 'matchmaking'],
    accent: '#f472b6',
  },
  ludo: {
    id: 'ludo',
    title: 'Ludo',
    tagline: 'Roll, race, connect',
    description: 'The much-loved race board game for two to four players — a relaxed way to meet people around the city.',
    players: { min: 2, max: 4 },
    plannedModes: ['invite-friend', 'matchmaking'],
    accent: '#facc15',
  },
  pool: {
    id: 'pool',
    title: '8-Ball Pool',
    tagline: 'Line up the perfect shot',
    description: 'Head-to-head 8-ball pool on the covered pool deck — aim, power and a steady hand.',
    players: { min: 2, max: 2 },
    plannedModes: ['invite-friend', 'matchmaking'],
    accent: '#22c55e',
  },
  puzzle: {
    id: 'puzzle',
    title: 'Puzzles',
    tagline: 'Sharpen your problem solving',
    description: 'Logic and pattern challenges you can play on your own at the puzzle tables.',
    players: { min: 1, max: 1 },
    plannedModes: ['solo-challenge', 'practice'],
    accent: '#38bdf8',
  },
};

export const MODE_LABEL: Record<PlayMode, string> = {
  'invite-friend': 'Invite a friend',
  matchmaking: 'Find an opponent',
  'solo-challenge': 'Solo challenges',
  practice: 'Practice',
};

/** Per-game status from the games service (API payload, validated). */
export const gameListingSchema = z.object({
  id: z.enum(GAME_IDS),
  availability: gameAvailabilitySchema,
  /** Optional short status message from the service (e.g. maintenance notice). */
  message: z.string().max(200).optional(),
});
export type GameListing = z.infer<typeof gameListingSchema>;
export const gameListResponseSchema = z.object({ games: z.array(gameListingSchema) });

export const gameSessionSchema = z.object({
  sessionId: z.string().min(1),
  gameId: z.enum(GAME_IDS),
  status: z.enum(['waiting', 'active', 'finished', 'cancelled']),
  players: z.array(z.object({ playerId: z.string(), displayName: z.string() })),
  /** Opaque, game-specific state owned by the backend; the city never interprets it. */
  state: z.unknown().optional(),
});
export type GameSession = z.infer<typeof gameSessionSchema>;

export const gameResultSchema = z.object({
  sessionId: z.string(),
  gameId: z.enum(GAME_IDS),
  outcome: z.enum(['win', 'loss', 'draw', 'abandoned']),
  finishedAt: z.string(),
});
export type GameResult = z.infer<typeof gameResultSchema>;

export type GamesFailure = { ok: false; reason: 'not-available' | 'unauthenticated' | 'error'; message: string };
export type SessionResult = { ok: true; session: GameSession } | GamesFailure;
export type InviteResult = { ok: true; inviteId: string } | GamesFailure;

/** Everything the city will need from a games backend. */
export interface GamesService {
  /** 'unavailable' = no games backend configured (current state). */
  readonly mode: 'unavailable' | 'api';
  listGames(): Promise<GameListing[]>;
  createSession(gameId: GameId, mode: PlayMode): Promise<SessionResult>;
  findMatch(gameId: GameId): Promise<SessionResult>;
  invite(sessionId: string, connectionId: string): Promise<InviteResult>;
  joinSession(sessionId: string): Promise<SessionResult>;
  getSession(sessionId: string): Promise<GameSession | null>;
  getResult(sessionId: string): Promise<GameResult | null>;
}

const NOT_AVAILABLE: GamesFailure = { ok: false, reason: 'not-available', message: 'Grooveli Games are not available yet.' };

/** Default: no backend. Every game is "Coming soon" and no session can be created. */
export class UnavailableGamesService implements GamesService {
  readonly mode = 'unavailable' as const;
  async listGames(): Promise<GameListing[]> {
    return GAME_IDS.map((id) => ({ id, availability: 'coming-soon' }));
  }
  async createSession(_gameId: GameId, _mode: PlayMode): Promise<SessionResult> {
    return NOT_AVAILABLE;
  }
  async findMatch(_gameId: GameId): Promise<SessionResult> {
    return NOT_AVAILABLE;
  }
  async invite(_sessionId: string, _connectionId: string): Promise<InviteResult> {
    return NOT_AVAILABLE;
  }
  async joinSession(_sessionId: string): Promise<SessionResult> {
    return NOT_AVAILABLE;
  }
  async getSession(_sessionId: string): Promise<GameSession | null> {
    return null;
  }
  async getResult(_sessionId: string): Promise<GameResult | null> {
    return null;
  }
}

/**
 * HTTP adapter for the proposed games API (docs/GAMES_CONTRACT.md). Responses
 * are validated; anything unexpected is treated as unavailable. Session calls
 * are only reachable once a game is playable (see isPlayable).
 */
export class HttpGamesService implements GamesService {
  readonly mode = 'api' as const;
  constructor(private readonly base: string) {}

  private async request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T | null> {
    try {
      const res = await fetch(`${this.base.replace(/\/$/, '')}${path}`, { credentials: 'same-origin', headers: { accept: 'application/json', 'content-type': 'application/json' }, ...init });
      if (!res.ok) return null;
      const parsed = schema.safeParse(await res.json());
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async listGames(): Promise<GameListing[]> {
    const data = await this.request('/games', gameListResponseSchema);
    const byId = new Map((data?.games ?? []).map((g) => [g.id, g]));
    // games the service does not mention stay "Coming soon"
    return GAME_IDS.map((id) => byId.get(id) ?? { id, availability: 'coming-soon' as const });
  }
  private async session(path: string, body?: unknown): Promise<SessionResult> {
    const s = await this.request(path, gameSessionSchema, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    return s ? { ok: true, session: s } : { ok: false, reason: 'error', message: 'The games service could not complete this request.' };
  }
  createSession(gameId: GameId, mode: PlayMode) {
    return this.session(`/games/${gameId}/sessions`, { mode });
  }
  findMatch(gameId: GameId) {
    return this.session(`/games/${gameId}/matchmaking`);
  }
  async invite(sessionId: string, connectionId: string): Promise<InviteResult> {
    const r = await this.request(`/games/sessions/${encodeURIComponent(sessionId)}/invitations`, z.object({ inviteId: z.string() }), { method: 'POST', body: JSON.stringify({ connectionId }) });
    return r ? { ok: true, inviteId: r.inviteId } : { ok: false, reason: 'error', message: 'The invitation could not be sent.' };
  }
  joinSession(sessionId: string) {
    return this.session(`/games/sessions/${encodeURIComponent(sessionId)}/join`);
  }
  getSession(sessionId: string) {
    return this.request(`/games/sessions/${encodeURIComponent(sessionId)}`, gameSessionSchema);
  }
  getResult(sessionId: string) {
    return this.request(`/games/sessions/${encodeURIComponent(sessionId)}/result`, gameResultSchema);
  }
}

export function createGamesService(apiBase: string | null): GamesService {
  return apiBase ? new HttpGamesService(apiBase) : new UnavailableGamesService();
}

/**
 * Frontend game clients (board UI, rules presentation) registered per game.
 * Empty until a game is actually built; keeps "Play" hidden even if the
 * backend were to report a game as available.
 */
export const GAME_CLIENTS: Partial<Record<GameId, true>> = {};

export function isPlayable(listing: GameListing | undefined): boolean {
  return !!listing && listing.availability === 'available' && GAME_CLIENTS[listing.id] === true;
}

export const AVAILABILITY_LABEL: Record<GameAvailability, string> = {
  'coming-soon': 'Coming soon',
  available: 'Available',
  maintenance: 'Temporarily unavailable',
};

/** What the panel shows: the service status, unless no client exists yet (then "Coming soon"). */
export function displayAvailability(listing: GameListing | undefined): GameAvailability {
  if (!listing) return 'coming-soon';
  if (listing.availability === 'available' && !isPlayable(listing)) return 'coming-soon';
  return listing.availability;
}
