import { Injectable } from '@nestjs/common';
import type { Session, User } from '@prisma/client';
import type { Request, Response } from 'express';
import { newToken, sha256 } from '../common/crypto';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export const SESSION_COOKIE = 'grooveli_session';
const DAY = 24 * 60 * 60 * 1000;
/** Extend the session at most once an hour to keep writes low. */
const SLIDE_EVERY_MS = 60 * 60 * 1000;

/**
 * Server-side sessions: the cookie holds a random token, the database holds
 * only its SHA-256. Revoking a row signs that device out immediately.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  private ttlMs() {
    return env().SESSION_TTL_DAYS * DAY;
  }

  private setCookie(res: Response, token: string, expiresAt: Date) {
    const e = env();
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: e.cookieSecure,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      ...(e.COOKIE_DOMAIN ? { domain: e.COOKIE_DOMAIN } : {}),
    });
  }

  clearCookie(res: Response) {
    const e = env();
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: e.cookieSecure,
      sameSite: 'lax',
      path: '/',
      ...(e.COOKIE_DOMAIN ? { domain: e.COOKIE_DOMAIN } : {}),
    });
  }

  async create(userId: string, req: Request, res: Response): Promise<Session> {
    const token = newToken();
    const expiresAt = new Date(Date.now() + this.ttlMs());
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        expiresAt,
        ip: req.ip ?? null,
        userAgent: req.header('user-agent')?.slice(0, 300) ?? null,
      },
    });
    this.setCookie(res, token, expiresAt);
    return session;
  }

  /** Session + user for the request's cookie, or null. Slides the expiry. */
  async resolve(req: Request, res: Response): Promise<{ session: Session; user: User } | null> {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (!token || token.length > 100) return null;

    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now || session.user.deletedAt || session.user.suspendedAt) {
      if (session) this.clearCookie(res);
      return null;
    }

    if (now - session.lastSeenAt.getTime() > SLIDE_EVERY_MS) {
      const expiresAt = new Date(now + this.ttlMs());
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now), expiresAt } });
      this.setCookie(res, token, expiresAt);
      session.expiresAt = expiresAt;
    }

    const { user, ...rest } = session;
    return { session: rest, user };
  }

  /** Session lookup for non-HTTP transports (WebSocket upgrade). Does not slide the cookie. */
  async userForToken(token: string | undefined): Promise<User | null> {
    if (!token || token.length > 100) return null;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || session.user.deletedAt || session.user.suspendedAt) return null;
    return session.user;
  }

  async revoke(sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }
}
