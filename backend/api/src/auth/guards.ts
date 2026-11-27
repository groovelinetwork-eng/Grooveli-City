import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { ApiError } from '../common/api-exception.filter';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApiRequest,
  IS_OPTIONAL_AUTH,
  IS_PLATFORM_ADMIN,
  IS_PUBLIC,
  ORG_ACCESS,
  OrgAccessRule,
} from './auth.decorators';
import { DEFAULT_TIER_MODULES, permissionsFor } from './permissions';
import { SessionService } from './session.service';

/**
 * Global guard. Every route requires a signed-in user unless marked @Public()
 * or @OptionalAuth(). Fills req.auth.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly sessions: SessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const optional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH, targets);
    const req = ctx.switchToHttp().getRequest<ApiRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();

    // Public routes (e.g. the city) never read cookies, so they stay cacheable and never leak private data.
    if (isPublic) return true;

    const resolved = await this.sessions.resolve(req, res);
    if (resolved) req.auth = resolved;
    if (optional) return true;
    if (!resolved) throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Please sign in');

    if (this.reflector.getAllAndOverride<boolean>(IS_PLATFORM_ADMIN, targets) && resolved.user.platformRole !== 'admin') {
      throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You do not have permission to do this');
    }
    return true;
  }
}

/**
 * Global guard for @OrgAccess routes: active membership of the organisation,
 * the required permission/role, and the plan module. Fills req.org.
 */
@Injectable()
export class OrgAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<OrgAccessRule | undefined>(ORG_ACCESS, [ctx.getHandler(), ctx.getClass()]);
    if (!rule) return true;
    const req = ctx.switchToHttp().getRequest<ApiRequest>();
    if (!req.auth) throw new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Please sign in');

    const key = rule.param ?? 'orgId';
    const raw = rule.fromQuery ? req.query[key] : req.params[key];
    const orgId = typeof raw === 'string' ? raw : '';
    if (!orgId) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', `${key} is required`, { [key]: 'Required' });

    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: req.auth.user.id } },
      include: { organization: true },
    });
    // Non-members get 404 so organisation IDs cannot be probed.
    if (!membership || membership.organization.deletedAt) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');
    if (membership.status !== 'active') throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Your access to this organisation is suspended');

    const permissions = permissionsFor(membership.roles);
    const needed = rule.perm ? (Array.isArray(rule.perm) ? rule.perm : [rule.perm]) : [];
    let hasPermission = needed.length === 0 || needed.some((p) => permissions.has(p));
    if (rule.orgAdmin && !membership.roles.includes('org_admin')) hasPermission = false;
    if (!hasPermission && !rule.orSelf) throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You do not have permission to do this');

    if (rule.module) {
      const tier = membership.organization.tier;
      const row = await this.prisma.tierModules.findUnique({ where: { tier } });
      const modules = row?.modules ?? DEFAULT_TIER_MODULES[tier];
      if (!modules.includes(rule.module)) {
        throw new ApiError(HttpStatus.FORBIDDEN, 'MODULE_NOT_IN_PLAN', `Your plan does not include ${rule.module}`);
      }
    }

    const { organization, ...m } = membership;
    req.org = { organization, membership: m, permissions, hasPermission };
    return true;
  }
}
