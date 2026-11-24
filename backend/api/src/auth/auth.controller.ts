import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-exception.filter';
import { ok } from '../common/responses';
import { ZodPipe, zEmail, zId, zNewPassword, zToken } from '../common/zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiRequest, AuthContext, CurrentAuth, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

const MIN = 60_000;
const HOUR = 60 * MIN;

const SignupBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: zEmail,
    password: zNewPassword,
    accountType: z.enum(['candidate', 'organization']),
  })
  .strict();
const LoginBody = z.object({ email: zEmail, password: z.string().min(1).max(128) }).strict();
const ActiveOrgBody = z.object({ organizationId: zId.nullable() }).strict();
const EmailBody = z.object({ email: zEmail }).strict();
const ResetBody = z.object({ token: zToken, password: zNewPassword }).strict();
const ChangePasswordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: zNewPassword }).strict();
const TokenBody = z.object({ token: zToken }).strict();
const DeleteAccountBody = z.object({ password: z.string().min(1).max(128) }).strict();

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @Post('auth/signup')
  async signup(@Body(new ZodPipe(SignupBody)) body: z.infer<typeof SignupBody>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(HttpStatus.CREATED);
    return ok(await this.auth.signup(body, req, res), 'Account created');
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * MIN } })
  @HttpCode(200)
  @Post('auth/login')
  async login(@Body(new ZodPipe(LoginBody)) body: z.infer<typeof LoginBody>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    return ok(await this.auth.login(body, req, res), 'Signed in');
  }

  @HttpCode(200)
  @Post('auth/logout')
  async logout(@CurrentAuth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(auth.session.id, res);
    return ok(null, 'Signed out');
  }

  @Get('auth/session')
  async session(@CurrentAuth() auth: AuthContext) {
    return ok(await this.auth.sessionView(auth.user.id));
  }

  @Put('auth/session/active-organization')
  async setActiveOrganization(@CurrentAuth() auth: AuthContext, @Body(new ZodPipe(ActiveOrgBody)) body: z.infer<typeof ActiveOrgBody>) {
    return ok(await this.auth.setActiveOrganization(auth.user.id, body.organizationId));
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: HOUR } })
  @HttpCode(202)
  @Post('auth/password/forgot')
  async forgotPassword(@Body(new ZodPipe(EmailBody)) body: z.infer<typeof EmailBody>) {
    await this.auth.forgotPassword(body.email);
    return ok(null, 'If an account exists for that email, a reset link is on its way');
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  @HttpCode(200)
  @Post('auth/password/reset')
  async resetPassword(@Body(new ZodPipe(ResetBody)) body: z.infer<typeof ResetBody>, @Req() req: ApiRequest) {
    await this.auth.resetPassword(body.token, body.password, req.ip);
    return ok(null, 'Password updated. Please sign in.');
  }

  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @HttpCode(200)
  @Post('auth/password/change')
  async changePassword(@CurrentAuth() auth: AuthContext, @Body(new ZodPipe(ChangePasswordBody)) body: z.infer<typeof ChangePasswordBody>, @Req() req: ApiRequest) {
    await this.auth.changePassword(auth.user.id, auth.session.id, body.currentPassword, body.newPassword, req.ip);
    return ok(null, 'Password changed. Other devices have been signed out.');
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  @HttpCode(200)
  @Post('auth/email/verify')
  async verifyEmail(@Body(new ZodPipe(TokenBody)) body: z.infer<typeof TokenBody>) {
    await this.auth.verifyEmail(body.token);
    return ok(null, 'Email confirmed');
  }

  @Throttle({ default: { limit: 3, ttl: HOUR } })
  @HttpCode(202)
  @Post('auth/email/resend')
  async resendVerification(@CurrentAuth() auth: AuthContext) {
    await this.auth.resendVerification(auth.user.id);
    return ok(null, 'Verification email sent');
  }

  @HttpCode(200)
  @Post('invitations/:token/accept')
  async acceptInvitation(@Param('token', new ZodPipe(zToken)) token: string, @CurrentAuth() auth: AuthContext, @Req() req: ApiRequest) {
    return ok(await this.auth.acceptInvitation(token, auth.user, req.ip), 'Invitation accepted');
  }

  // ── Account ──────────────────────────────────────────────────────────────
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @Delete('me/account')
  async deleteAccount(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(DeleteAccountBody)) body: z.infer<typeof DeleteAccountBody>,
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!(await this.passwords.verify(auth.user.passwordHash, body.password))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Password is incorrect', { password: 'Incorrect' });
    }

    // Refuse if this would leave any organisation without an active org-admin.
    const adminOf = await this.prisma.membership.findMany({
      where: { userId: auth.user.id, status: 'active', roles: { has: 'org_admin' }, organization: { deletedAt: null } },
      select: { organizationId: true, organization: { select: { name: true } } },
    });
    for (const m of adminOf) {
      const others = await this.prisma.membership.count({
        where: { organizationId: m.organizationId, status: 'active', roles: { has: 'org_admin' }, userId: { not: auth.user.id } },
      });
      if (others === 0) {
        throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', `You are the last admin of ${m.organization.name}. Make someone else an admin first.`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membership.deleteMany({ where: { userId: auth.user.id } });
      await tx.user.update({ where: { id: auth.user.id }, data: { deletedAt: new Date(), activeOrganizationId: null } });
      await tx.session.updateMany({ where: { userId: auth.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ action: 'user.deleted', targetType: 'user', targetId: auth.user.id, actorId: auth.user.id, ip: req.ip }, tx);
    });
    this.sessions.clearCookie(res);
    return ok(null, 'Your account has been deleted. Personal data is removed within 30 days.');
  }
}
