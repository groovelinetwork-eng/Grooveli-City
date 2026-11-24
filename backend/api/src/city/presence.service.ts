import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { User } from '@prisma/client';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { SESSION_COOKIE, SessionService } from '../auth/session.service';
import { DEFAULT_AVATAR } from '../candidate/profile';
import { env } from '../config/env';
import { API_PREFIX } from '../openapi/document';
import { PrismaService } from '../prisma/prisma.service';

export const PRESENCE_PATH = `/${API_PREFIX}/realtime/presence`;
/** At most 2 accepted updates per second per player. */
const MIN_UPDATE_INTERVAL_MS = 500;
/** How often privacy settings, connections and blocks are re-read for a player. */
const RELATIONSHIP_TTL_MS = 60_000;
const HEARTBEAT_MS = 30_000;

const Update = z
  .object({
    type: z.literal('update'),
    district: z.enum(['plaza', 'corporate', 'recruitment', 'university', 'tech', 'creative', 'healthcare', 'hospitality', 'finance', 'apartment', 'ai-center']),
    position: z.object({ x: z.number().finite().min(-10_000).max(10_000), z: z.number().finite().min(-10_000).max(10_000) }).strict(),
    status: z.enum(['exploring', 'at-event', 'in-building', 'idle']),
  })
  .strict();

interface Projection {
  id: string;
  displayName: string;
  avatar: object;
  district: string;
  position: { x: number; z: number };
  status: string;
}

interface Player {
  ws: WebSocket;
  alive: boolean;
  projection: Projection | null;
  lastUpdateAt: number;
  visibility: 'everyone' | 'connections' | 'hidden';
  connections: Set<string>;
  blocked: Set<string>;
  loadedAt: number;
}

/**
 * Live player presence for the 3D city over a WebSocket at /api/v1/realtime/presence.
 *
 * Client → server: { type: "update", district, position: {x, z}, status }
 * Server → client: { type: "snapshot", players }, { type: "presence", player }, { type: "leave", id }, { type: "error", message }
 *
 * Sign-in uses the normal session cookie; the Origin must be an allowed web origin.
 * Who sees whom follows presenceVisibility (everyone / connections / hidden) and blocks.
 * State is in memory on this instance: run one instance, or move it to Redis pub/sub before scaling out.
 */
@Injectable()
export class PresenceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Presence');
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  private readonly players = new Map<string, Player>();
  private heartbeat?: NodeJS.Timeout;
  private server?: Server;
  private readonly onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => void this.upgrade(req, socket, head);

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap() {
    this.server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    this.server.on('upgrade', this.onUpgrade);
    this.heartbeat = setInterval(() => {
      for (const [id, p] of this.players) {
        if (!p.alive) {
          p.ws.terminate();
          this.remove(id, p.ws);
          continue;
        }
        p.alive = false;
        p.ws.ping();
      }
    }, HEARTBEAT_MS);
  }

  onApplicationShutdown() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.server?.off('upgrade', this.onUpgrade);
    for (const p of this.players.values()) p.ws.close(1001, 'Server shutting down');
    this.wss.close();
  }

  /** Number of connected players (for health/metrics). */
  get size() {
    return this.players.size;
  }

  private reject(socket: Duplex, status: number, message: string) {
    socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  private async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    try {
      const path = (req.url ?? '').split('?')[0];
      if (path !== PRESENCE_PATH) return; // other upgrade handlers may own other paths
      const origin = req.headers.origin;
      if (origin && !env().corsOrigins.includes(origin)) return this.reject(socket, 403, 'Forbidden');
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      const user = await this.sessions.userForToken(token);
      if (!user) return this.reject(socket, 401, 'Unauthorized');
      this.wss.handleUpgrade(req, socket, head, (ws) => void this.connect(user, ws));
    } catch (err) {
      this.logger.error(`Upgrade failed: ${(err as Error).message}`);
      this.reject(socket, 500, 'Internal Server Error');
    }
  }

  private async loadRelationships(userId: string, p: Pick<Player, 'visibility' | 'connections' | 'blocked' | 'loadedAt'>) {
    const [profile, connections, blocks] = await Promise.all([
      this.prisma.candidateProfile.findUnique({ where: { userId }, select: { presenceVisibility: true } }),
      this.prisma.connection.findMany({ where: { status: 'connected', OR: [{ requesterId: userId }, { addresseeId: userId }] } }),
      this.prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } }),
    ]);
    p.visibility = profile?.presenceVisibility ?? 'everyone';
    p.connections = new Set(connections.map((c) => (c.requesterId === userId ? c.addresseeId : c.requesterId)));
    p.blocked = new Set(blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));
    p.loadedAt = Date.now();
  }

  /** May `viewerId` see `subject`? */
  private canSee(viewerId: string, subjectId: string, subject: Player) {
    if (viewerId === subjectId || !subject.projection) return false;
    if (subject.blocked.has(viewerId)) return false;
    const viewer = this.players.get(viewerId);
    if (viewer?.blocked.has(subjectId)) return false;
    if (subject.visibility === 'hidden') return false;
    if (subject.visibility === 'connections') return subject.connections.has(viewerId);
    return true;
  }

  private send(ws: WebSocket, msg: object) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  private async connect(user: User, ws: WebSocket) {
    const existing = this.players.get(user.id);
    if (existing) existing.ws.close(4000, 'Connected elsewhere');

    const player: Player = { ws, alive: true, projection: null, lastUpdateAt: 0, visibility: 'everyone', connections: new Set(), blocked: new Set(), loadedAt: 0 };
    await this.loadRelationships(user.id, player);
    this.players.set(user.id, player);
    const profile = await this.prisma.candidateProfile.findUnique({ where: { userId: user.id }, select: { avatar: true } });
    const base = { id: user.id, displayName: user.displayName, avatar: (profile?.avatar as object) ?? DEFAULT_AVATAR };

    ws.on('pong', () => (player.alive = true));
    ws.on('close', () => this.remove(user.id, ws));
    ws.on('error', () => this.remove(user.id, ws));
    ws.on('message', (raw) => void this.onMessage(user.id, player, base, raw.toString()));

    this.send(ws, {
      type: 'snapshot',
      players: [...this.players].filter(([id, p]) => this.canSee(user.id, id, p)).map(([, p]) => p.projection),
    });
  }

  private async onMessage(userId: string, player: Player, base: Pick<Projection, 'id' | 'displayName' | 'avatar'>, raw: string) {
    let parsed: z.infer<typeof Update>;
    try {
      parsed = Update.parse(JSON.parse(raw));
    } catch {
      return this.send(player.ws, { type: 'error', message: 'Invalid message' });
    }
    const now = Date.now();
    if (now - player.lastUpdateAt < MIN_UPDATE_INTERVAL_MS) return; // over 2/s: dropped silently
    player.lastUpdateAt = now;
    if (now - player.loadedAt > RELATIONSHIP_TTL_MS) await this.loadRelationships(userId, player);

    const wasVisibleTo = new Set([...this.players.keys()].filter((id) => this.canSee(id, userId, player)));
    player.projection = { ...base, district: parsed.district, position: parsed.position, status: parsed.status };
    for (const [id, other] of this.players) {
      if (this.canSee(id, userId, player)) this.send(other.ws, { type: 'presence', player: player.projection });
      else if (wasVisibleTo.has(id)) this.send(other.ws, { type: 'leave', id: userId });
    }
  }

  private remove(userId: string, ws: WebSocket) {
    const p = this.players.get(userId);
    if (!p || p.ws !== ws) return; // a newer connection replaced this one
    this.players.delete(userId);
    for (const [id, other] of this.players) if (this.canSee(id, userId, p)) this.send(other.ws, { type: 'leave', id: userId });
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
