import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthTokenType, Prisma, User } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-exception.filter';
import { newToken, normalizeEmail, sha256 } from '../common/crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { toApiRole } from './permissions';
import { SessionService } from './session.service';

const MINUTE = 60 * 1000;
const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;
const TOKEN_TTL: Record<AuthTokenType, number> = {
  email_verify: 24 * 60 * MINUTE,
  password_reset: 30 * MINUTE,
};

export interface SessionView {
  user: { id: string; displayName: string; email: string; emailVerified: boolean };
  memberships: { organizationId: string; roles: string[]; employeeId?: string }[];
  activeOrganizationId: string | null;
  onboardingComplete: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  // ── Session view ─────────────────────────────────────────────────────────
  async sessionView(userId: string): Promise<SessionView> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'active', organization: { deletedAt: null } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const memberships = user.memberships.map((m) => ({
      organizationId: m.organizationId,
      roles: m.roles.map(toApiRole),
      ...(m.employeeId ? { employeeId: m.employeeId } : {}),
    }));
    const active = memberships.some((m) => m.organizationId === user.activeOrganizationId) ? user.activeOrganizationId : null;
    return {
      user: { id: user.id, displayName: user.displayName, email: user.email, emailVerified: !!user.emailVerifiedAt },
      memberships,
      activeOrganizationId: active,
      onboardingComplete: user.onboardingComplete,
    };
  }

  // ── Sign-up / sign-in ────────────────────────────────────────────────────
  async signup(
    input: { name: string; email: string; password: string; accountType: 'candidate' | 'organization' },
    req: Request,
    res: Response,
  ): Promise<SessionView> {
    const email = normalizeEmail(input.email);
    await this.passwords.assertNotBreached(input.password);
    const passwordHash = await this.passwords.hash(input.password);

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: { email, passwordHash, displayName: input.name.trim(), accountType: input.accountType },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'We could not create an account with these details. Try signing in or resetting your password.');
      }
      throw err;
    }

    await this.sendVerification(user);
    await this.sessions.create(user.id, req, res);
    await this.audit.record({ action: 'user.signup', targetType: 'user', targetId: user.id, actorId: user.id, ip: req.ip });
    return this.sessionView(user.id);
  }

  async login(input: { email: string; password: string }, req: Request, res: Response): Promise<SessionView> {
    const email = normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const invalid = () => new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Incorrect email or password');

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      // Still verify, so a locked account takes the same time to answer.
      await this.passwords.verify(null, input.password);
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Too many failed attempts. Try again in a few minutes or reset your password.');
    }

    const valid = await this.passwords.verify(user && !user.deletedAt ? user.passwordHash : null, input.password);
    if (!user || user.deletedAt || !valid) {
      if (user && !user.deletedAt) {
        const failed = user.failedLoginCount + 1;
        await this.prisma.user.update({
          where: { id: user.id },
          data: failed >= MAX_FAILED_LOGINS
            ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * MINUTE) }
            : { failedLoginCount: failed },
        });
        if (failed >= MAX_FAILED_LOGINS) {
          await this.audit.record({ action: 'user.locked', targetType: 'user', targetId: user.id, ip: req.ip });
        }
      }
      throw invalid();
    }

    if (user.suspendedAt) throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'This account has been suspended. Contact support.');
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    await this.sessions.create(user.id, req, res);
    return this.sessionView(user.id);
  }

  async logout(sessionId: string, res: Response) {
    await this.sessions.revoke(sessionId);
    this.sessions.clearCookie(res);
  }

  async setActiveOrganization(userId: string, organizationId: string | null): Promise<SessionView> {
    if (organizationId) {
      const membership = await this.prisma.membership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        include: { organization: { select: { deletedAt: true } } },
      });
      if (!membership || membership.status !== 'active' || membership.organization.deletedAt) {
        throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You are not an active member of this organisation');
      }
    }
    await this.prisma.user.update({ where: { id: userId }, data: { activeOrganizationId: organizationId } });
    return this.sessionView(userId);
  }

  // ── Tokens ───────────────────────────────────────────────────────────────
  private async issueToken(userId: string, type: AuthTokenType): Promise<string> {
    const token = newToken();
    await this.prisma.$transaction([
      // Only the newest token of each type is valid.
      this.prisma.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.authToken.create({
        data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TOKEN_TTL[type]) },
      }),
    ]);
    return token;
  }

  /** Marks the token used and returns its user ID; throws if invalid. */
  private async consumeToken(token: string, type: AuthTokenType): Promise<string> {
    const row = await this.prisma.authToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.type !== type || row.usedAt || row.expiresAt <= new Date()) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'This link is invalid or has expired', { token: 'Invalid or expired' });
    }
    const { count } = await this.prisma.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (count !== 1) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'This link has already been used', { token: 'Already used' });
    return row.userId;
  }

  // ── Email verification ───────────────────────────────────────────────────
  async sendVerification(user: Pick<User, 'id' | 'email' | 'displayName' | 'emailVerifiedAt'>) {
    if (user.emailVerifiedAt) return;
    const token = await this.issueToken(user.id, 'email_verify');
    await this.mail.send({
      to: user.email,
      subject: 'Confirm your Grooveli City email',
      text: `Hi ${user.displayName},\n\nConfirm your email address:\n${this.mail.link(`/verify-email?token=${token}`)}\n\nThe link expires in 24 hours. If you did not sign up, ignore this email.`,
    });
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.sendVerification(user);
  }

  async verifyEmail(token: string) {
    const userId = await this.consumeToken(token, 'email_verify');
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    await this.audit.record({ action: 'user.email_verified', targetType: 'user', targetId: userId, actorId: userId });
  }

  // ── Passwords ────────────────────────────────────────────────────────────
  async forgotPassword(emailInput: string) {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(emailInput) } });
    if (!user || user.deletedAt) return; // Same response either way.
    const token = await this.issueToken(user.id, 'password_reset');
    await this.mail.send({
      to: user.email,
      subject: 'Reset your Grooveli City password',
      text: `Hi ${user.displayName},\n\nReset your password:\n${this.mail.link(`/reset-password?token=${token}`)}\n\nThe link expires in 30 minutes and works once. If you did not ask for this, ignore this email; your password has not changed.`,
    });
  }

  async resetPassword(token: string, password: string, ip?: string) {
    await this.passwords.assertNotBreached(password);
    const userId = await this.consumeToken(token, 'password_reset');
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } });
    await this.sessions.revokeAllForUser(userId);
    await this.audit.record({ action: 'user.password_reset', targetType: 'user', targetId: userId, actorId: userId, ip });
  }

  async changePassword(userId: string, sessionId: string, current: string, next: string, ip?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, current))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Current password is incorrect', { currentPassword: 'Incorrect' });
    }
    if (current === next) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Choose a new password', { newPassword: 'Must differ from the current password' });
    }
    await this.passwords.assertNotBreached(next);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await this.passwords.hash(next) } });
    await this.sessions.revokeAllForUser(userId, sessionId);
    await this.audit.record({ action: 'user.password_changed', targetType: 'user', targetId: userId, actorId: userId, ip });
  }

  // ── Organisation invitations ─────────────────────────────────────────────
  async acceptInvitation(token: string, user: User, ip?: string): Promise<SessionView> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: { organization: { select: { deletedAt: true } } },
    });
    if (!invitation || invitation.organization.deletedAt) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Invitation not found');
    if (invitation.status !== 'pending') {
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', `This invitation has been ${invitation.status}`);
    }
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'expired' } });
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This invitation has expired. Ask for a new one.');
    }
    if (normalizeEmail(invitation.email) !== user.email) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'This invitation was sent to a different email address');
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, status: 'pending' },
        data: { status: 'accepted', acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This invitation was already used');

      const existing = await tx.membership.findUnique({
        where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } },
      });
      // Link the HR employee record with the same email, if HR already created one.
      const employee = await tx.employee.findFirst({ where: { organizationId: invitation.organizationId, email: user.email, status: { not: 'exited' } } });
      if (employee) await tx.employee.update({ where: { id: employee.id }, data: { userId: user.id } });
      const link = employee ? { employeeId: employee.id, departmentId: employee.departmentId } : {};
      if (existing) {
        const roles = [...new Set([...existing.roles, ...invitation.roles])];
        await tx.membership.update({ where: { id: existing.id }, data: { roles, ...link } });
      } else {
        await tx.membership.create({ data: { organizationId: invitation.organizationId, userId: user.id, roles: invitation.roles, ...link } });
      }
      // Accepting an invitation emailed to this address proves the address.
      await tx.user.update({
        where: { id: user.id },
        data: { activeOrganizationId: invitation.organizationId, ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }) },
      });
      await this.audit.record(
        {
          action: 'member.joined', targetType: 'membership', targetId: user.id, actorId: user.id,
          organizationId: invitation.organizationId, ip, details: { invitationId: invitation.id, roles: invitation.roles.map(toApiRole) },
        },
        tx,
      );
    });
    return this.sessionView(user.id);
  }
}
