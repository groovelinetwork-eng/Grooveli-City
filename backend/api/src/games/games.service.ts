import { HttpStatus, Injectable } from '@nestjs/common';
import { GameSession, Prisma, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-exception.filter';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService } from '../social/social.service';

export const GAME_IDS = ['chess', 'checkers', 'ludo', 'pool', 'puzzle'] as const;
export type GameId = (typeof GAME_IDS)[number];
export type GameMode = 'invite-friend' | 'matchmaking' | 'solo-challenge' | 'practice';
const MAX_PLAYERS: Record<GameId, number> = { chess: 2, checkers: 2, ludo: 4, pool: 2, puzzle: 1 };
type Actor = { user: User; ip?: string };

/**
 * Game availability and session lifecycle (lobby, invites, matchmaking).
 * No betting or real money. Gameplay state is owned by the game engines,
 * which aren't built yet, so every game starts as "coming-soon".
 */
@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly social: SocialService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = new Map((await this.prisma.gameAvailability.findMany()).map((r) => [r.gameId, r]));
    return {
      games: GAME_IDS.map((id) => {
        const r = rows.get(id);
        return { id, availability: r?.availability ?? 'coming-soon', ...(r?.message ? { message: r.message } : {}) };
      }),
    };
  }

  async setAvailability(gameId: GameId, availability: string, message: string | undefined, actor: Actor) {
    await this.prisma.gameAvailability.upsert({ where: { gameId }, create: { gameId, availability, message: message ?? null }, update: { availability, message: message ?? null } });
    await this.audit.record({ action: 'game.availability_changed', targetType: 'game', targetId: gameId, actorId: actor.user.id, ip: actor.ip, details: { availability } });
    return (await this.list()).games.find((g) => g.id === gameId)!;
  }

  private async assertAvailable(gameId: GameId) {
    const r = await this.prisma.gameAvailability.findUnique({ where: { gameId } });
    if (r?.availability !== 'available') {
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', r?.availability === 'maintenance' ? 'This game is under maintenance' : 'This game is coming soon');
    }
  }

  private async toApi(s: GameSession & { players?: { userId: string }[] }) {
    const players = s.players ?? (await this.prisma.gameSessionPlayer.findMany({ where: { sessionId: s.id }, orderBy: { joinedAt: 'asc' } }));
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: players.map((p) => p.userId) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    return {
      sessionId: s.id,
      gameId: s.gameId,
      status: s.status,
      players: players.map((p) => ({ playerId: p.userId, displayName: names.get(p.userId) ?? 'Player' })),
      ...(s.state !== null ? { state: s.state } : {}),
    };
  }

  async create(user: User, gameId: GameId, mode: GameMode) {
    await this.assertAvailable(gameId);
    if (mode === 'matchmaking') return this.matchmake(user, gameId);
    const solo = mode === 'solo-challenge' || mode === 'practice';
    if (!solo && MAX_PLAYERS[gameId] === 1) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'This game is single-player', { mode: 'Use solo-challenge or practice' });
    const s = await this.prisma.gameSession.create({
      data: { gameId, mode, maxPlayers: solo ? 1 : MAX_PLAYERS[gameId], createdById: user.id, status: solo ? 'active' : 'waiting', players: { create: { userId: user.id } } },
      include: { players: true },
    });
    return this.toApi(s);
  }

  async matchmake(user: User, gameId: GameId) {
    await this.assertAvailable(gameId);
    if (MAX_PLAYERS[gameId] === 1) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'This game is single-player', { gameId: 'Single-player' });
    const blocked = await this.social.blockedIds(user.id);
    const session = await this.prisma.$transaction(async (tx) => {
      // Oldest open lobby with room, without the caller or anyone in a block with them. SKIP LOCKED avoids double-filling.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT s.id FROM "GameSession" s
        WHERE s."gameId" = ${gameId} AND s.mode = 'matchmaking' AND s.status = 'waiting'
          AND (SELECT COUNT(*) FROM "GameSessionPlayer" p WHERE p."sessionId" = s.id) < s."maxPlayers"
          AND NOT EXISTS (SELECT 1 FROM "GameSessionPlayer" p WHERE p."sessionId" = s.id AND (p."userId" = ${user.id} OR p."userId" = ANY(${blocked}::text[])))
        ORDER BY s."createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!rows.length) {
        return tx.gameSession.create({
          data: { gameId, mode: 'matchmaking', maxPlayers: MAX_PLAYERS[gameId], createdById: user.id, players: { create: { userId: user.id } } },
        });
      }
      await tx.gameSessionPlayer.create({ data: { sessionId: rows[0]!.id, userId: user.id } });
      return this.fillIfFull(tx, rows[0]!.id);
    });
    return this.toApi(session);
  }

  private async fillIfFull(tx: Prisma.TransactionClient, sessionId: string) {
    const s = await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId }, include: { players: true } });
    if (s.players.length >= s.maxPlayers && s.status === 'waiting') return tx.gameSession.update({ where: { id: sessionId }, data: { status: 'active' } });
    return s;
  }

  private async session(sessionId: string) {
    const s = await this.prisma.gameSession.findUnique({ where: { id: sessionId }, include: { players: true } });
    if (!s) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Game session not found');
    return s;
  }

  async invite(user: User, sessionId: string, connectionId: string) {
    const s = await this.session(sessionId);
    if (!s.players.some((p) => p.userId === user.id)) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Game session not found');
    if (s.mode !== 'invite-friend' || s.status !== 'waiting') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This session is not taking invitations');
    if (!(await this.social.areConnected(user.id, connectionId)) || (await this.social.isBlocked(user.id, connectionId))) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You can only invite your connections');
    }
    let invite;
    try {
      invite = await this.prisma.gameInvite.create({ data: { sessionId, fromUserId: user.id, toUserId: connectionId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'Already invited');
      throw err;
    }
    await this.notifications.notify(connectionId, { kind: 'social', title: 'Game invitation', body: `${user.displayName} invited you to play ${s.gameId}.`, href: '/city' });
    return { inviteId: invite.id };
  }

  async join(user: User, sessionId: string) {
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "GameSession" WHERE id = ${sessionId} FOR UPDATE`;
      const s = await tx.gameSession.findUnique({ where: { id: sessionId }, include: { players: true } });
      if (!s) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Game session not found');
      if (s.players.some((p) => p.userId === user.id)) return s;
      const invited = await tx.gameInvite.findUnique({ where: { sessionId_toUserId: { sessionId, toUserId: user.id } } });
      if (s.mode !== 'matchmaking' && !invited) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Game session not found');
      if (s.status !== 'waiting' || s.players.length >= s.maxPlayers) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This session is full or has started');
      await tx.gameSessionPlayer.create({ data: { sessionId, userId: user.id } });
      return this.fillIfFull(tx, sessionId);
    });
    return this.toApi(session);
  }

  async get(user: User, sessionId: string) {
    const s = await this.session(sessionId);
    if (!s.players.some((p) => p.userId === user.id)) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Game session not found');
    return this.toApi(s);
  }

  async result(user: User, sessionId: string) {
    const s = await this.session(sessionId);
    if (!s.players.some((p) => p.userId === user.id)) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Game session not found');
    if (s.status !== 'finished' || !s.result || !s.finishedAt) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This game has not finished');
    const outcomes = (s.result as { outcomes?: Record<string, string> }).outcomes ?? {};
    return { sessionId: s.id, gameId: s.gameId, outcome: outcomes[user.id] ?? 'abandoned', finishedAt: s.finishedAt.toISOString() };
  }
}
