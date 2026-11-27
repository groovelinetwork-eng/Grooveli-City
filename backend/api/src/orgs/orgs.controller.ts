import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiRequest, CurrentUser, OrgAccess, PlatformAdmin, Public } from '../auth/auth.decorators';
import { PageQuery, zIsoDate } from '../common/pagination';
import { ok } from '../common/responses';
import { ZodPipe, zId } from '../common/zod';
import {
  DepartmentInput,
  InvitationCreate,
  LocationInput,
  OrganizationInput,
  ProfilePatch,
  WorkspacePatch,
  zDistrict,
  zModule,
  zRoles,
  zTier,
} from './org.schemas';
import { OrgInput, OrgsService } from './orgs.service';

const idPipe = new ZodPipe(zId);
const DirectoryQuery = PageQuery.extend({ district: zDistrict.optional(), industry: z.string().trim().max(60).optional(), q: z.string().trim().min(1).max(100).optional() }).strict();
const MembersQuery = PageQuery.extend({ status: z.enum(['active', 'invited', 'suspended']).optional(), q: z.string().trim().min(1).max(100).optional() }).strict();
const AuditQuery = PageQuery.extend({ actorId: zId.optional(), action: z.string().max(60).optional(), from: zIsoDate.optional(), to: zIsoDate.optional() }).strict();
const RolesBody = z.object({ roles: zRoles }).strict();
const StatusBody = z.object({ status: z.enum(['active', 'suspended']) }).strict();
const TierBody = z.object({ tier: zTier }).strict();
const ModulesBody = z.object({ modules: z.array(zModule).max(5).refine((m) => new Set(m).size === m.length, 'Modules must be unique') }).strict();
const VerificationBody = z.object({ verified: z.boolean(), note: z.string().trim().max(500).optional() }).strict();

const actor = (user: User, req: ApiRequest) => ({ user, ip: req.ip });

@Controller()
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  // ── Public ───────────────────────────────────────────────────────────────
  @Public()
  @Get('orgs')
  async list(@Query(new ZodPipe(DirectoryQuery)) q: z.infer<typeof DirectoryQuery>, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return ok(await this.orgs.listPublic(q, q));
  }

  @Public()
  @Get('orgs/:orgId')
  async get(@Param('orgId', idPipe) orgId: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return ok(await this.orgs.getPublic(orgId));
  }

  // ── Onboarding ───────────────────────────────────────────────────────────
  @Throttle({ default: { limit: 3, ttl: 24 * 60 * 60_000 } })
  @Post('orgs')
  async create(@CurrentUser() user: User, @Body(new ZodPipe(OrganizationInput)) body: z.infer<typeof OrganizationInput>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.orgs.create(body as unknown as OrgInput, actor(user, req)), 'Organisation created');
  }

  // ── Profile & workspace ──────────────────────────────────────────────────
  @OrgAccess({ perm: 'org.settings.manage' })
  @Patch('orgs/:orgId/profile')
  async updateProfile(@Param('orgId') orgId: string, @CurrentUser() user: User, @Body(new ZodPipe(ProfilePatch)) body: z.infer<typeof ProfilePatch>, @Req() req: ApiRequest) {
    return ok(await this.orgs.updateProfile(orgId, body, actor(user, req)), 'Profile updated');
  }

  @OrgAccess()
  @Get('orgs/:orgId/workspace')
  async workspace(@Param('orgId') orgId: string) {
    return ok(await this.orgs.workspace(orgId));
  }

  @OrgAccess({ perm: 'org.settings.manage' })
  @Patch('orgs/:orgId/workspace')
  async updateWorkspace(@Param('orgId') orgId: string, @CurrentUser() user: User, @Body(new ZodPipe(WorkspacePatch)) body: z.infer<typeof WorkspacePatch>, @Req() req: ApiRequest) {
    return ok(await this.orgs.updateWorkspace(orgId, body, actor(user, req)), 'Workspace updated');
  }

  // ── Members ──────────────────────────────────────────────────────────────
  @OrgAccess({ perm: 'org.members.manage' })
  @Get('orgs/:orgId/members')
  async members(@Param('orgId') orgId: string, @Query(new ZodPipe(MembersQuery)) q: z.infer<typeof MembersQuery>) {
    return ok(await this.orgs.members(orgId, q, q));
  }

  @OrgAccess({ perm: 'org.members.manage' })
  @Post('orgs/:orgId/invitations')
  async invite(@Param('orgId') orgId: string, @CurrentUser() user: User, @Body(new ZodPipe(InvitationCreate)) body: z.infer<typeof InvitationCreate>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.orgs.invite(orgId, body, actor(user, req)), 'Invitation sent');
  }

  @OrgAccess({ perm: 'org.members.manage' })
  @Delete('orgs/:orgId/invitations/:invitationId')
  async revoke(@Param('orgId') orgId: string, @Param('invitationId', idPipe) id: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    await this.orgs.revokeInvitation(orgId, id, actor(user, req));
    return ok(null, 'Invitation revoked');
  }

  @OrgAccess({ perm: 'org.members.manage' })
  @Put('orgs/:orgId/members/:memberId/roles')
  async setRoles(@Param('orgId') orgId: string, @Param('memberId', idPipe) memberId: string, @CurrentUser() user: User, @Body(new ZodPipe(RolesBody)) body: z.infer<typeof RolesBody>, @Req() req: ApiRequest) {
    return ok(await this.orgs.setRoles(orgId, memberId, body.roles, actor(user, req)), 'Roles updated');
  }

  @OrgAccess({ perm: 'org.members.manage' })
  @Put('orgs/:orgId/members/:memberId/status')
  async setStatus(@Param('orgId') orgId: string, @Param('memberId', idPipe) memberId: string, @CurrentUser() user: User, @Body(new ZodPipe(StatusBody)) body: z.infer<typeof StatusBody>, @Req() req: ApiRequest) {
    return ok(await this.orgs.setStatus(orgId, memberId, body.status, actor(user, req)), 'Status updated');
  }

  // ── Departments & locations ──────────────────────────────────────────────
  @OrgAccess({ perm: 'org.settings.manage' })
  @Post('orgs/:orgId/departments')
  async createDepartment(@Param('orgId') orgId: string, @CurrentUser() user: User, @Body(new ZodPipe(DepartmentInput)) body: z.infer<typeof DepartmentInput>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.orgs.createDepartment(orgId, body, actor(user, req)), 'Department created');
  }

  @OrgAccess({ perm: 'org.settings.manage' })
  @Patch('orgs/:orgId/departments/:departmentId')
  async updateDepartment(@Param('orgId') orgId: string, @Param('departmentId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(DepartmentInput)) body: z.infer<typeof DepartmentInput>, @Req() req: ApiRequest) {
    return ok(await this.orgs.updateDepartment(orgId, id, body, actor(user, req)), 'Department updated');
  }

  @OrgAccess({ perm: 'org.settings.manage' })
  @Delete('orgs/:orgId/departments/:departmentId')
  async deleteDepartment(@Param('orgId') orgId: string, @Param('departmentId', idPipe) id: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    await this.orgs.deleteDepartment(orgId, id, actor(user, req));
    return ok(null, 'Department deleted');
  }

  @OrgAccess({ perm: 'org.settings.manage' })
  @Post('orgs/:orgId/locations')
  async createLocation(@Param('orgId') orgId: string, @CurrentUser() user: User, @Body(new ZodPipe(LocationInput)) body: z.infer<typeof LocationInput>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.orgs.createLocation(orgId, body, actor(user, req)), 'Location added');
  }

  @OrgAccess({ perm: 'org.settings.manage' })
  @Patch('orgs/:orgId/locations/:locationId')
  async updateLocation(@Param('orgId') orgId: string, @Param('locationId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(LocationInput)) body: z.infer<typeof LocationInput>, @Req() req: ApiRequest) {
    return ok(await this.orgs.updateLocation(orgId, id, body, actor(user, req)), 'Location updated');
  }

  @OrgAccess({ perm: 'org.settings.manage' })
  @Delete('orgs/:orgId/locations/:locationId')
  async deleteLocation(@Param('orgId') orgId: string, @Param('locationId', idPipe) id: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    await this.orgs.deleteLocation(orgId, id, actor(user, req));
    return ok(null, 'Location removed');
  }

  // ── Subscription & audit ─────────────────────────────────────────────────
  @OrgAccess({ perm: 'org.billing.view' })
  @Get('orgs/:orgId/subscription')
  async subscription(@Param('orgId') orgId: string) {
    return ok(await this.orgs.subscription(orgId));
  }

  @OrgAccess({ orgAdmin: true })
  @Put('orgs/:orgId/subscription')
  async setTier(@Param('orgId') orgId: string, @CurrentUser() user: User, @Body(new ZodPipe(TierBody)) body: z.infer<typeof TierBody>, @Req() req: ApiRequest) {
    return ok(await this.orgs.setTier(orgId, body.tier, actor(user, req)), 'Plan changed');
  }

  @OrgAccess({ orgAdmin: true })
  @Get('orgs/:orgId/audit-log')
  async auditLog(@Param('orgId') orgId: string, @Query(new ZodPipe(AuditQuery)) q: z.infer<typeof AuditQuery>) {
    return ok(await this.orgs.auditLog(orgId, q, q));
  }

  // ── Platform admin ───────────────────────────────────────────────────────
  @PlatformAdmin()
  @Put('platform/tiers/:tier/modules')
  async setTierModules(@Param('tier', new ZodPipe(zTier)) tier: z.infer<typeof zTier>, @CurrentUser() user: User, @Body(new ZodPipe(ModulesBody)) body: z.infer<typeof ModulesBody>, @Req() req: ApiRequest) {
    await this.orgs.setTierModules(tier, body.modules, actor(user, req));
    return ok(null, 'Plan modules updated');
  }

  @PlatformAdmin()
  @Put('platform/orgs/:orgId/verification')
  async setVerified(@Param('orgId', idPipe) orgId: string, @CurrentUser() user: User, @Body(new ZodPipe(VerificationBody)) body: z.infer<typeof VerificationBody>, @Req() req: ApiRequest) {
    return ok(await this.orgs.setVerified(orgId, body.verified, body.note, actor(user, req)), 'Verification updated');
  }
}
