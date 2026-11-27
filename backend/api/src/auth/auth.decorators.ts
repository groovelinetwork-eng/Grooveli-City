import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Membership, Organization, OrgModule, Session, User } from '@prisma/client';
import type { Request } from 'express';
import type { Permission } from './permissions';

export interface AuthContext {
  user: User;
  session: Session;
}

export interface OrgContext {
  organization: Organization;
  membership: Membership;
  permissions: Set<Permission>;
  /** False when the caller got in through `orSelf` without holding the permission. */
  hasPermission: boolean;
}

export type ApiRequest = Request & { requestId?: string; auth?: AuthContext; org?: OrgContext };

export const IS_PUBLIC = 'grooveli:public';
export const IS_OPTIONAL_AUTH = 'grooveli:optional-auth';
export const IS_PLATFORM_ADMIN = 'grooveli:platform-admin';
export const ORG_ACCESS = 'grooveli:org-access';

/** No session needed. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Works signed out; `auth` is filled when signed in. */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH, true);
/** Grooveli platform staff only. */
export const PlatformAdmin = () => SetMetadata(IS_PLATFORM_ADMIN, true);

export interface OrgAccessRule {
  /** Any one of these permissions in the organisation named by the :orgId route param. */
  perm?: Permission | Permission[];
  /** Require the org-admin role. */
  orgAdmin?: boolean;
  /** Module the organisation's plan must include. */
  module?: OrgModule;
  /** Let any active member through; the handler must then restrict to the caller's own data when hasPermission is false. */
  orSelf?: boolean;
  /** Name of the route/query parameter holding the organisation ID (default "orgId"). */
  param?: string;
  /** Read the organisation ID from the query string instead of the path. */
  fromQuery?: boolean;
}

/** Requires an active membership of :orgId (plus the given permission/module, if any). */
export const OrgAccess = (rule: OrgAccessRule = {}) => SetMetadata(ORG_ACCESS, rule);

export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<ApiRequest>().auth);
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<ApiRequest>().auth?.user);
export const CurrentOrg = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<ApiRequest>().org);
