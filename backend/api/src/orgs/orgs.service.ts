import { HttpStatus, Injectable } from '@nestjs/common';
import { OrgRole, Prisma, SubscriptionTier, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_TIER_MODULES, toApiRole, toDbRole, ApiRole } from '../auth/permissions';
import { ApiError } from '../common/api-exception.filter';
import { newToken, normalizeEmail, sha256 } from '../common/crypto';
import { PageQuery, skipTake, todayUtc, toPage } from '../common/pagination';
import { toApiJob } from '../jobs/job.mapper';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  toApiDepartment,
  toApiInvitation,
  toApiLocation,
  toApiMember,
  toApiOrgProfile,
  toApiPolicy,
  toDbPolicyCategory,
} from './org.mapper';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
type Tx = Prisma.TransactionClient;
type Actor = { user: User; ip?: string };

export interface OrgInput {
  profile: Record<string, unknown> & { name: string; district?: string; culture: Record<string, string> };
  locations: { name: string; city: string; address: string; headcountCapacity: number }[];
  departments: { name: string; responsibilities: string }[];
  policies: { title: string; category: string; body: string }[];
  invites: { email: string; roles: ApiRole[] }[];
  tier: SubscriptionTier;
}

@Injectable()
export class OrgsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async modulesFor(tier: SubscriptionTier) {
    const row = await this.prisma.tierModules.findUnique({ where: { tier } });
    return row?.modules ?? DEFAULT_TIER_MODULES[tier];
  }

  // ── Public directory ─────────────────────────────────────────────────────
  async listPublic(q: { district?: string; industry?: string; q?: string }, page: PageQuery) {
    const where: Prisma.OrganizationWhereInput = {
      deletedAt: null,
      ...(q.district ? { district: q.district } : {}),
      ...(q.industry ? { industry: { equals: q.industry, mode: 'insensitive' } } : {}),
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { tagline: { contains: q.q, mode: 'insensitive' } }, { industry: { contains: q.q, mode: 'insensitive' } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.organization.findMany({ where, orderBy: [{ verified: 'desc' }, { name: 'asc' }], ...skipTake(page) }),
      this.prisma.organization.count({ where }),
    ]);
    return toPage(rows.map(toApiOrgProfile), total, page);
  }

  async getPublic(orgId: string) {
    const org = await this.prisma.organization.findFirst({ where: { id: orgId, deletedAt: null } });
    if (!org) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Organisation not found');
    const jobs = await this.prisma.job.findMany({
      where: { organizationId: orgId, status: 'published', closesOn: { gte: todayUtc() } },
      orderBy: { postedOn: 'desc' },
      take: 100,
    });
    return {
      profile: toApiOrgProfile(org),
      vacancies: jobs.map((j) => {
        const a = toApiJob(j);
        return { id: a.id, title: a.title, department: a.department, workMode: a.workMode, employmentType: a.employmentType, postedOn: a.postedOn };
      }),
    };
  }

  // ── Onboarding ───────────────────────────────────────────────────────────
  async create(input: OrgInput, actor: Actor): Promise<{ organizationId: string }> {
    const invitesToSend: { email: string; token: string }[] = [];
    const orgName = input.profile.name;
    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          ...(input.profile as Prisma.OrganizationCreateInput),
          district: input.profile.district ?? 'corporate',
          tier: input.tier,
          setupChecklist: { profile: true, locations: input.locations.length > 0, departments: input.departments.length > 0, policies: input.policies.length > 0, team: input.invites.length > 0 },
        },
      });
      await tx.membership.create({ data: { organizationId: created.id, userId: actor.user.id, roles: ['org_admin'] } });

      const locations = [];
      for (const l of input.locations) locations.push(await tx.officeLocation.create({ data: { ...l, organizationId: created.id } }));
      for (const d of input.departments) {
        await tx.department.create({ data: { ...d, organizationId: created.id, locationId: locations[0]?.id ?? null } });
      }
      for (const p of input.policies) {
        await tx.policy.create({ data: { organizationId: created.id, title: p.title, category: toDbPolicyCategory(p.category), body: p.body } });
      }
      for (const inv of input.invites) {
        if (normalizeEmail(inv.email) === actor.user.email) continue;
        const token = newToken();
        await tx.invitation.create({
          data: {
            organizationId: created.id, email: normalizeEmail(inv.email), roles: inv.roles.map(toDbRole),
            tokenHash: sha256(token), invitedById: actor.user.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          },
        });
        invitesToSend.push({ email: normalizeEmail(inv.email), token });
      }
      await tx.user.update({
        where: { id: actor.user.id },
        data: { activeOrganizationId: created.id, ...(actor.user.accountType === 'organization' ? { onboardingComplete: true } : {}) },
      });
      await this.audit.record(
        { action: 'org.created', targetType: 'organization', targetId: created.id, actorId: actor.user.id, organizationId: created.id, ip: actor.ip, details: { tier: input.tier } },
        tx,
      );
      return created;
    });

    for (const i of invitesToSend) await this.sendInvitationEmail(i.email, i.token, orgName, actor.user.displayName);
    return { organizationId: org.id };
  }

  private async sendInvitationEmail(email: string, token: string, orgName: string, inviter: string) {
    await this.mail.send({
      to: email,
      subject: `${inviter} invited you to ${orgName} on Grooveli City`,
      text: `${inviter} invited you to join ${orgName} on Grooveli City.\n\nAccept the invitation:\n${this.mail.link(`/invitations/accept?token=${token}`)}\n\nSign in or create an account with this email address (${email}). The link expires in 7 days.`,
    });
  }

  // ── Profile & workspace ──────────────────────────────────────────────────
  async updateProfile(orgId: string, patch: Record<string, unknown>, actor: Actor) {
    const org = await this.prisma.organization.update({ where: { id: orgId }, data: patch as Prisma.OrganizationUpdateInput });
    await this.audit.record({ action: 'org.profile.updated', targetType: 'organization', targetId: orgId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { fields: Object.keys(patch) } });
    return toApiOrgProfile(org);
  }

  async policies(orgId: string) {
    const rows = await this.prisma.policy.findMany({ where: { organizationId: orgId, archivedAt: null }, orderBy: { createdAt: 'asc' } });
    const counts = await Promise.all(rows.map((p) => this.prisma.policyAcknowledgement.count({ where: { policyId: p.id, version: p.version } })));
    return rows.map((p, i) => toApiPolicy(p, counts[i]!));
  }

  async workspace(orgId: string) {
    const [org, locations, departments, policies, members, invitations] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
      this.prisma.officeLocation.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.department.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } }),
      this.policies(orgId),
      this.prisma.membership.findMany({ where: { organizationId: orgId }, include: { user: { select: { displayName: true, email: true } } }, orderBy: { createdAt: 'asc' }, take: 1000 }),
      this.prisma.invitation.findMany({ where: { organizationId: orgId, status: 'pending' }, orderBy: { sentAt: 'desc' }, take: 500 }),
    ]);
    return {
      organizationId: orgId,
      tier: org.tier,
      locations: locations.map(toApiLocation),
      departments: departments.map(toApiDepartment),
      policies,
      members: members.map(toApiMember),
      invitations: invitations.map(toApiInvitation),
      workflows: org.workflows as { id: string; name: string; steps: string[] }[],
      setupChecklist: org.setupChecklist as Record<string, boolean>,
    };
  }

  async updateWorkspace(orgId: string, patch: { workflows?: unknown; setupChecklist?: unknown }, actor: Actor) {
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(patch.workflows !== undefined ? { workflows: patch.workflows as Prisma.InputJsonValue } : {}),
        ...(patch.setupChecklist !== undefined ? { setupChecklist: patch.setupChecklist as Prisma.InputJsonValue } : {}),
      },
    });
    await this.audit.record({ action: 'org.workspace.updated', targetType: 'organization', targetId: orgId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { fields: Object.keys(patch) } });
    return this.workspace(orgId);
  }

  // ── Members & invitations ────────────────────────────────────────────────
  async members(orgId: string, q: { status?: 'active' | 'invited' | 'suspended'; q?: string }, page: PageQuery) {
    if (q.status === 'invited') {
      const where: Prisma.InvitationWhereInput = { organizationId: orgId, status: 'pending', ...(q.q ? { email: { contains: q.q, mode: 'insensitive' } } : {}) };
      const [rows, total] = await Promise.all([
        this.prisma.invitation.findMany({ where, orderBy: { sentAt: 'desc' }, ...skipTake(page) }),
        this.prisma.invitation.count({ where }),
      ]);
      return toPage(
        rows.map((i) => ({ id: i.id, name: i.email, email: i.email, roles: i.roles.map(toApiRole), departmentId: null, recruitingFor: [], status: 'invited' as const })),
        total,
        page,
      );
    }
    const where: Prisma.MembershipWhereInput = {
      organizationId: orgId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { user: { OR: [{ displayName: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.membership.findMany({ where, include: { user: { select: { displayName: true, email: true } } }, orderBy: { createdAt: 'asc' }, ...skipTake(page) }),
      this.prisma.membership.count({ where }),
    ]);
    return toPage(rows.map(toApiMember), total, page);
  }

  async invite(orgId: string, input: { email: string; roles: ApiRole[] }, actor: Actor) {
    const email = normalizeEmail(input.email);
    const [member, pending, org] = await Promise.all([
      this.prisma.membership.findFirst({ where: { organizationId: orgId, user: { email } } }),
      this.prisma.invitation.findFirst({ where: { organizationId: orgId, email, status: 'pending', expiresAt: { gt: new Date() } } }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
    ]);
    if (member) throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'This person is already a member');
    if (pending) throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'An invitation is already pending for this email');

    const sentToday = await this.prisma.invitation.count({ where: { organizationId: orgId, sentAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (sentToday >= 50) throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Invitation limit reached (50 a day)');

    const token = newToken();
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId: orgId, email, roles: input.roles.map(toDbRole), tokenHash: sha256(token),
        invitedById: actor.user.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    await this.audit.record({ action: 'member.invited', targetType: 'invitation', targetId: invitation.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { email, roles: input.roles } });
    await this.sendInvitationEmail(email, token, org.name, actor.user.displayName);
    return toApiInvitation(invitation);
  }

  async revokeInvitation(orgId: string, invitationId: string, actor: Actor) {
    const inv = await this.prisma.invitation.findFirst({ where: { id: invitationId, organizationId: orgId } });
    if (!inv) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Invitation not found');
    if (inv.status === 'accepted') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This invitation was already accepted');
    await this.prisma.invitation.update({ where: { id: inv.id }, data: { status: 'revoked' } });
    await this.audit.record({ action: 'member.invitation_revoked', targetType: 'invitation', targetId: inv.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
  }

  /** Throws unless at least one other active org-admin would remain. */
  private async assertAnotherAdmin(tx: Tx, orgId: string, exceptMembershipId: string) {
    const others = await tx.membership.count({
      where: { organizationId: orgId, status: 'active', roles: { has: 'org_admin' }, id: { not: exceptMembershipId } },
    });
    if (others === 0) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'The organisation must keep at least one active org-admin');
  }

  private async lockOrg(tx: Tx, orgId: string) {
    // Serialises admin changes in one organisation so two requests can't each remove "the other" admin.
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${orgId} FOR UPDATE`;
  }

  async setRoles(orgId: string, memberId: string, roles: ApiRole[], actor: Actor) {
    const dbRoles = roles.map(toDbRole);
    const member = await this.prisma.$transaction(async (tx) => {
      await this.lockOrg(tx, orgId);
      const m = await tx.membership.findFirst({ where: { id: memberId, organizationId: orgId } });
      if (!m) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Member not found');
      if (m.roles.includes('org_admin') && !dbRoles.includes('org_admin')) await this.assertAnotherAdmin(tx, orgId, m.id);
      const updated = await tx.membership.update({ where: { id: m.id }, data: { roles: dbRoles }, include: { user: { select: { displayName: true, email: true } } } });
      await this.audit.record(
        { action: 'member.roles_changed', targetType: 'membership', targetId: m.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { from: m.roles.map(toApiRole), to: roles } },
        tx,
      );
      return updated;
    });
    return toApiMember(member);
  }

  async setStatus(orgId: string, memberId: string, status: 'active' | 'suspended', actor: Actor) {
    const member = await this.prisma.$transaction(async (tx) => {
      await this.lockOrg(tx, orgId);
      const m = await tx.membership.findFirst({ where: { id: memberId, organizationId: orgId } });
      if (!m) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Member not found');
      if (status === 'suspended' && m.status === 'active' && m.roles.includes('org_admin')) await this.assertAnotherAdmin(tx, orgId, m.id);
      const updated = await tx.membership.update({ where: { id: m.id }, data: { status }, include: { user: { select: { displayName: true, email: true } } } });
      if (status === 'suspended') {
        await tx.user.updateMany({ where: { id: m.userId, activeOrganizationId: orgId }, data: { activeOrganizationId: null } });
      }
      await this.audit.record({ action: `member.${status === 'active' ? 'reactivated' : 'suspended'}`, targetType: 'membership', targetId: m.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip }, tx);
      return updated;
    });
    return toApiMember(member);
  }

  // ── Departments & locations ──────────────────────────────────────────────
  private async assertLocation(orgId: string, locationId: string | null) {
    if (locationId && !(await this.prisma.officeLocation.findFirst({ where: { id: locationId, organizationId: orgId } }))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Unknown location', { locationId: 'Not a location of this organisation' });
    }
  }

  private uniqueName(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'A department with this name already exists');
    }
    throw err;
  }

  async createDepartment(orgId: string, input: { name: string; headEmployeeId: string | null; responsibilities: string; locationId: string | null }, actor: Actor) {
    await this.assertLocation(orgId, input.locationId);
    const d = await this.prisma.department.create({ data: { ...input, organizationId: orgId } }).catch((e) => this.uniqueName(e));
    await this.audit.record({ action: 'department.created', targetType: 'department', targetId: d.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return toApiDepartment(d);
  }

  async updateDepartment(orgId: string, id: string, input: { name: string; headEmployeeId: string | null; responsibilities: string; locationId: string | null }, actor: Actor) {
    const existing = await this.prisma.department.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Department not found');
    await this.assertLocation(orgId, input.locationId);
    const d = await this.prisma.department.update({ where: { id }, data: input }).catch((e) => this.uniqueName(e));
    await this.audit.record({ action: 'department.updated', targetType: 'department', targetId: id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return toApiDepartment(d);
  }

  async deleteDepartment(orgId: string, id: string, actor: Actor) {
    const existing = await this.prisma.department.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Department not found');
    const members = await this.prisma.membership.count({ where: { organizationId: orgId, departmentId: id } });
    if (members > 0) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Move the people in this department first');
    await this.prisma.department.delete({ where: { id } });
    await this.audit.record({ action: 'department.deleted', targetType: 'department', targetId: id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { name: existing.name } });
  }

  async createLocation(orgId: string, input: { name: string; city: string; address: string; headcountCapacity: number }, actor: Actor) {
    const l = await this.prisma.officeLocation.create({ data: { ...input, organizationId: orgId } });
    await this.audit.record({ action: 'location.created', targetType: 'location', targetId: l.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return toApiLocation(l);
  }

  async updateLocation(orgId: string, id: string, input: { name: string; city: string; address: string; headcountCapacity: number }, actor: Actor) {
    const existing = await this.prisma.officeLocation.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Location not found');
    const l = await this.prisma.officeLocation.update({ where: { id }, data: input });
    await this.audit.record({ action: 'location.updated', targetType: 'location', targetId: id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return toApiLocation(l);
  }

  async deleteLocation(orgId: string, id: string, actor: Actor) {
    const existing = await this.prisma.officeLocation.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Location not found');
    const deps = await this.prisma.department.count({ where: { locationId: id } });
    if (deps > 0) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Departments still use this location');
    await this.prisma.officeLocation.delete({ where: { id } });
    await this.audit.record({ action: 'location.deleted', targetType: 'location', targetId: id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { name: existing.name } });
  }

  // ── Subscription ─────────────────────────────────────────────────────────
  async subscription(orgId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    return { tier: org.tier, modules: await this.modulesFor(org.tier) };
  }

  async setTier(orgId: string, tier: SubscriptionTier, actor: Actor) {
    const before = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    await this.prisma.organization.update({ where: { id: orgId }, data: { tier } });
    await this.audit.record({ action: 'org.tier_changed', targetType: 'organization', targetId: orgId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { from: before.tier, to: tier } });
    return this.subscription(orgId);
  }

  // ── Audit log ────────────────────────────────────────────────────────────
  async auditLog(orgId: string, q: { actorId?: string; action?: string; from?: string; to?: string }, page: PageQuery) {
    const where: Prisma.AuditLogWhereInput = {
      organizationId: orgId,
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.from || q.to ? { at: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, ...skipTake(page) }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
    const actors = new Map((await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    return toPage(
      rows.map((r) => ({
        id: r.id, at: r.at.toISOString(), actorId: r.actorId ?? '', actorName: (r.actorId && actors.get(r.actorId)) || 'System',
        action: r.action, targetType: r.targetType, targetId: r.targetId, ip: r.ip ?? '', details: r.details as Record<string, unknown>,
      })),
      total,
      page,
    );
  }

  // ── Platform admin ───────────────────────────────────────────────────────
  async setTierModules(tier: SubscriptionTier, modules: string[], actor: Actor) {
    await this.prisma.tierModules.upsert({ where: { tier }, create: { tier, modules: modules as never }, update: { modules: modules as never } });
    await this.audit.record({ action: 'platform.tier_modules_changed', targetType: 'tier', targetId: tier, actorId: actor.user.id, ip: actor.ip, details: { modules } });
  }

  async setVerified(orgId: string, verified: boolean, note: string | undefined, actor: Actor) {
    const org = await this.prisma.organization.findFirst({ where: { id: orgId, deletedAt: null } });
    if (!org) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Organisation not found');
    const updated = await this.prisma.organization.update({ where: { id: orgId }, data: { verified } });
    await this.audit.record({ action: verified ? 'org.verified' : 'org.unverified', targetType: 'organization', targetId: orgId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: note ? { note } : {} });
    return toApiOrgProfile(updated);
  }
}

export type { OrgRole };
