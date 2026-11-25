import { HttpStatus, Injectable } from '@nestjs/common';
import { LeaveType, Prisma, User } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { OrgContext } from '../auth/auth.decorators';
import { ApiError } from '../common/api-exception.filter';
import { normalizeEmail } from '../common/crypto';
import { PageQuery, isoDate, skipTake, todayUtc, toPage } from '../common/pagination';
import { NotificationService } from '../notifications/notification.service';
import { toApiPolicy } from '../orgs/org.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { DOCX, JPEG, PDF, PNG, sniffType, StorageService } from '../storage/storage.service';
import {
  OFFBOARDING_TASKS,
  ONBOARDING_TASKS,
  toApiAttendance,
  toApiDocument,
  toApiEmployee,
  toApiLeave,
  toApiReview,
  toApiTask,
  toDbEmployeeStatus,
} from './hr.mapper';

type Actor = { user: User; ip?: string };
const DOC_MAX_BYTES = 10 * 1024 * 1024;
const DOC_TYPES = [PDF, PNG, JPEG, DOCX];
const EMPLOYEE_SORT = new Set(['name', 'startDate', 'createdAt', 'title']);
/** Grooveli's launch market is Nigeria (WAT, UTC+1, no DST). */
const ORG_UTC_OFFSET_HOURS = 1;
const LATE_AFTER_MINUTES = 9 * 60 + 15;

const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** Monday–Friday days in [start, end]. Public holidays are not yet excluded (see README). */
export function workingDays(start: Date, end: Date): number {
  let days = 0;
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationService,
  ) { }

  // ── Scope helpers ────────────────────────────────────────────────────────
  private isHr(org: OrgContext) {
    return org.permissions.has('hr.records.manage');
  }
  private me(org: OrgContext) {
    return org.membership.employeeId;
  }
  isSelf(org: OrgContext, employeeId: string) {
    return !!this.me(org) && this.me(org) === employeeId;
  }

  async employee(orgId: string, employeeId: string) {
    const e = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId: orgId }, include: { documents: true, lifecycleTasks: true } });
    if (!e) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Employee not found');
    return e;
  }

  private forbidden(): never {
    throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You do not have permission to do this');
  }

  private async assertStructure(orgId: string, departmentId?: string, locationId?: string, managerId?: string | null, selfId?: string) {
    const fields: Record<string, string> = {};
    if (departmentId && !(await this.prisma.department.findFirst({ where: { id: departmentId, organizationId: orgId } }))) fields.departmentId = 'Not a department of this organisation';
    if (locationId && !(await this.prisma.officeLocation.findFirst({ where: { id: locationId, organizationId: orgId } }))) fields.locationId = 'Not a location of this organisation';
    if (managerId) {
      if (managerId === selfId) fields.managerId = 'An employee cannot manage themself';
      else if (!(await this.prisma.employee.findFirst({ where: { id: managerId, organizationId: orgId, status: { not: 'exited' } } }))) fields.managerId = 'Not an active employee of this organisation';
    }
    if (Object.keys(fields).length) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', Object.values(fields)[0]!, fields);
  }

  // ── Employees ────────────────────────────────────────────────────────────
  async list(org: OrgContext, q: { departmentId?: string; locationId?: string; status?: string; q?: string; sort?: string }, page: PageQuery) {
    const orgId = org.organization.id;
    const sortField = q.sort?.replace(/^-/, '') ?? 'name';
    if (!EMPLOYEE_SORT.has(sortField)) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Unsupported sort', { sort: 'Not sortable' });
    const where: Prisma.EmployeeWhereInput = {
      organizationId: orgId,
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.locationId ? { locationId: q.locationId } : {}),
      ...(q.status ? { status: toDbEmployeeStatus(q.status) } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const full = this.isHr(org);
    const [rows, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: full ? { documents: true, lifecycleTasks: true } : undefined,
        orderBy: [{ [sortField]: q.sort?.startsWith('-') ? 'desc' : 'asc' }, { id: 'asc' }],
        ...skipTake(page),
      }),
      this.prisma.employee.count({ where }),
    ]);
    return toPage(rows.map((e) => toApiEmployee(e, full || this.isSelf(org, e.id))), total, page);
  }

  async get(org: OrgContext, employeeId: string) {
    if (!this.isHr(org) && !this.isSelf(org, employeeId)) this.forbidden();
    return toApiEmployee(await this.employee(org.organization.id, employeeId), true);
  }

  async create(
    org: OrgContext,
    input: { name: string; title: string; departmentId: string; locationId: string; email: string; startDate: string; employmentType: string; baseMonthly: number },
    actor: Actor,
  ) {
    const orgId = org.organization.id;
    await this.assertStructure(orgId, input.departmentId, input.locationId);
    const email = normalizeEmail(input.email);
    const member = await this.prisma.membership.findFirst({ where: { organizationId: orgId, user: { email } } });
    try {
      const employee = await this.prisma.$transaction(async (tx) => {
        const e = await tx.employee.create({
          data: {
            organizationId: orgId, name: input.name, title: input.title, departmentId: input.departmentId, locationId: input.locationId,
            email, startDate: toDate(input.startDate), employmentType: input.employmentType, userId: member?.userId ?? null,
            lifecycleTasks: { create: ONBOARDING_TASKS.map((t, i) => ({ ...t, phase: 'onboarding', sortOrder: i })) },
          },
        });
        await tx.compensation.create({
          data: {
            employeeId: e.id, organizationId: orgId, baseMonthly: input.baseMonthly, effectiveFrom: toDate(input.startDate),
            history: [{ date: input.startDate, baseMonthly: input.baseMonthly, reason: 'Starting salary' }],
          },
        });
        if (member) await tx.membership.update({ where: { id: member.id }, data: { employeeId: e.id, departmentId: input.departmentId } });
        await this.audit.record({ action: 'employee.created', targetType: 'employee', targetId: e.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip }, tx);
        return e;
      });
      return { employeeId: employee.id };
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'An employee with this email already exists');
      throw err;
    }
  }

  async update(org: OrgContext, employeeId: string, patch: Record<string, unknown> & { departmentId?: string; locationId?: string; managerId?: string | null; email?: string; startDate?: string }, actor: Actor) {
    const orgId = org.organization.id;
    const e = await this.employee(orgId, employeeId);
    if (e.status === 'exited') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This employee has exited');
    await this.assertStructure(orgId, patch.departmentId, patch.locationId, patch.managerId, employeeId);
    if (patch.managerId) {
      // Prevent management cycles (A manages B manages A).
      let cursor: string | null = patch.managerId;
      for (let i = 0; cursor && i < 100; i++) {
        if (cursor === employeeId) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'That would create a management loop', { managerId: 'Creates a loop' });
        cursor = (await this.prisma.employee.findUnique({ where: { id: cursor }, select: { managerId: true } }))?.managerId ?? null;
      }
    }
    const data: Prisma.EmployeeUpdateInput = {
      ...(patch as Prisma.EmployeeUpdateInput),
      ...(patch.email ? { email: normalizeEmail(patch.email) } : {}),
      ...(patch.startDate ? { startDate: toDate(patch.startDate) } : {}),
    };
    try {
      const updated = await this.prisma.employee.update({ where: { id: employeeId }, data, include: { documents: true, lifecycleTasks: true } });
      await this.audit.record({ action: 'employee.updated', targetType: 'employee', targetId: employeeId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { fields: Object.keys(patch) } });
      return toApiEmployee(updated, true);
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'An employee with this email already exists');
      throw err;
    }
  }

  async startOffboarding(org: OrgContext, employeeId: string, lastDay: string, actor: Actor) {
    const orgId = org.organization.id;
    const e = await this.employee(orgId, employeeId);
    if (e.status === 'offboarding' || e.status === 'exited') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', `Already ${e.status}`);
    if (toDate(lastDay) < e.startDate) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Last day is before the start date', { lastDay: 'Before start date' });
    const existing = e.lifecycleTasks.filter((t) => t.phase === 'offboarding').length;
    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        status: 'offboarding',
        lastDay: toDate(lastDay),
        ...(existing ? {} : { lifecycleTasks: { create: OFFBOARDING_TASKS.map((t, i) => ({ ...t, phase: 'offboarding', sortOrder: 100 + i })) } }),
      },
      include: { documents: true, lifecycleTasks: true },
    });
    await this.audit.record({ action: 'employee.offboarding_started', targetType: 'employee', targetId: employeeId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { lastDay } });
    return toApiEmployee(updated, true);
  }

  async completeOffboarding(org: OrgContext, employeeId: string, actor: Actor) {
    const orgId = org.organization.id;
    const e = await this.employee(orgId, employeeId);
    if (e.status !== 'offboarding') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Start offboarding first');
    const open = e.lifecycleTasks.filter((t: { phase: string; done: boolean }) => t.phase === 'offboarding' && !t.done);
    if (open.length) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', `Finish the offboarding tasks first (${open.length} open)`);

    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (e.userId) {
        const m = await tx.membership.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId: e.userId } } });
        if (m) {
          if (m.roles.includes('org_admin') && m.status === 'active') {
            const others = await tx.membership.count({ where: { organizationId: orgId, status: 'active', roles: { has: 'org_admin' }, id: { not: m.id } } });
            if (!others) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This employee is the last org-admin; appoint another admin first');
          }
          await tx.membership.delete({ where: { id: m.id } });
          await tx.user.updateMany({ where: { id: e.userId, activeOrganizationId: orgId }, data: { activeOrganizationId: null } });
        }
      }
      // Reports move up to the leaver's manager.
      await tx.employee.updateMany({ where: { managerId: employeeId }, data: { managerId: e.managerId } });
      const u = await tx.employee.update({ where: { id: employeeId }, data: { status: 'exited', exitedAt: new Date(), publicDirectory: false }, include: { documents: true, lifecycleTasks: true } });
      await this.audit.record({ action: 'employee.exited', targetType: 'employee', targetId: employeeId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip }, tx);
      return u;
    });
    return toApiEmployee(updated, true);
  }

  async setTask(org: OrgContext, employeeId: string, taskId: string, done: boolean) {
    await this.employee(org.organization.id, employeeId);
    const t = await this.prisma.lifecycleTask.findFirst({ where: { id: taskId, employeeId } });
    if (!t) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Task not found');
    const updated = await this.prisma.lifecycleTask.update({ where: { id: taskId }, data: { done } });
    // Finishing every onboarding task makes the employee active.
    if (t.phase === 'onboarding' && done) {
      const open = await this.prisma.lifecycleTask.count({ where: { employeeId, phase: 'onboarding', done: false } });
      if (!open) await this.prisma.employee.updateMany({ where: { id: employeeId, status: 'onboarding' }, data: { status: 'active' } });
    }
    return toApiTask(updated);
  }

  // ── Documents ────────────────────────────────────────────────────────────
  async documents(org: OrgContext, employeeId: string) {
    if (!this.isHr(org) && !this.isSelf(org, employeeId)) this.forbidden();
    const e = await this.employee(org.organization.id, employeeId);
    return e.documents.sort((a: { addedOn: Date }, b: { addedOn: Date }) => a.addedOn.getTime() - b.addedOn.getTime()).map(toApiDocument);
  }

  async uploadDocument(org: OrgContext, employeeId: string, file: Express.Multer.File | undefined, meta: { kind: string; name: string }, actor: Actor) {
    const orgId = org.organization.id;
    await this.employee(orgId, employeeId);
    if (!file) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Attach the document as the "file" field', { file: 'Required' });
    if (file.size > DOC_MAX_BYTES) throw new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, 'PAYLOAD_TOO_LARGE', 'Documents can be up to 10 MB');
    const type = sniffType(file.buffer);
    if (!type || !DOC_TYPES.includes(type)) throw new ApiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a PDF, PNG, JPEG or Word (.docx) file');
    const ext = { [PDF]: 'pdf', [PNG]: 'png', [JPEG]: 'jpg', [DOCX]: 'docx' }[type];
    const key = `hr/${orgId}/${employeeId}/${randomUUID()}.${ext}`;
    await this.storage.put(key, file.buffer, type);
    const doc = await this.prisma.employeeDocument.create({
      data: { employeeId, name: meta.name, kind: meta.kind, storageKey: key, contentType: type, sizeKb: Math.max(1, Math.round(file.size / 1024)), uploadedById: actor.user.id },
    });
    await this.audit.record({ action: 'employee.document_uploaded', targetType: 'employee', targetId: employeeId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { documentId: doc.id, kind: meta.kind } });
    return toApiDocument(doc);
  }

  private async doc(orgId: string, employeeId: string, documentId: string) {
    const d = await this.prisma.employeeDocument.findFirst({ where: { id: documentId, employeeId, employee: { organizationId: orgId } } });
    if (!d) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Document not found');
    return d;
  }

  async documentLink(org: OrgContext, employeeId: string, documentId: string, actor: Actor) {
    if (!this.isHr(org) && !this.isSelf(org, employeeId)) this.forbidden();
    const d = await this.doc(org.organization.id, employeeId, documentId);
    const ext = d.storageKey.split('.').pop();
    const { url, expiresAt } = await this.storage.downloadUrl(d.storageKey, d.name.endsWith(`.${ext}`) ? d.name : `${d.name}.${ext}`);
    await this.audit.record({ action: 'employee.document_viewed', targetType: 'employee', targetId: employeeId, actorId: actor.user.id, organizationId: org.organization.id, ip: actor.ip, details: { documentId } });
    return { downloadUrl: url, expiresAt: expiresAt.toISOString() };
  }

  async deleteDocument(org: OrgContext, employeeId: string, documentId: string, actor: Actor) {
    const d = await this.doc(org.organization.id, employeeId, documentId);
    await this.prisma.employeeDocument.delete({ where: { id: d.id } });
    await this.storage.delete(d.storageKey).catch(() => undefined);
    await this.audit.record({ action: 'employee.document_deleted', targetType: 'employee', targetId: employeeId, actorId: actor.user.id, organizationId: org.organization.id, ip: actor.ip, details: { documentId, name: d.name } });
  }

  // ── Leave ────────────────────────────────────────────────────────────────
  private async directReportIds(org: OrgContext) {
    const me = this.me(org);
    if (!me) return [];
    return (await this.prisma.employee.findMany({ where: { organizationId: org.organization.id, managerId: me }, select: { id: true } })).map((e: { id: string }) => e.id);
  }

  /** Employees whose leave/reviews the caller may manage: everyone for HR, direct reports for managers. */
  private async managedScope(org: OrgContext): Promise<{ in: string[] } | undefined> {
    if (this.isHr(org)) return undefined;
    return { in: await this.directReportIds(org) };
  }

  async listLeave(org: OrgContext, q: { status?: string; employeeId?: string; from?: string; to?: string }, page: PageQuery) {
    const canApprove = org.permissions.has('hr.leave.approve');
    const me = this.me(org);
    let employeeFilter: { in: string[] } | string | undefined;
    if (canApprove) {
      const scope = await this.managedScope(org);
      employeeFilter = scope ? { in: [...(scope.in as string[]), ...(me ? [me] : [])] } : undefined;
    } else {
      if (!me) return toPage([], 0, page);
      employeeFilter = me;
    }
    const where: NonNullable<Parameters<typeof this.prisma.leaveRequest.findMany>[0]>['where'] = {
      organizationId: org.organization.id,
      AND: [
        ...(employeeFilter ? [{ employeeId: employeeFilter }] : []),
        ...(q.employeeId ? [{ employeeId: q.employeeId }] : []),
        ...(q.status ? [{ status: q.status as never }] : []),
        ...(q.from ? [{ end: { gte: toDate(q.from) } }] : []),
        ...(q.to ? [{ start: { lte: toDate(q.to) } }] : []),
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({ where, orderBy: [{ start: 'desc' }, { id: 'asc' }], ...skipTake(page) }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return toPage(rows.map(toApiLeave), total, page);
  }

  /** Days left per leave type in a calendar year (default: this year). */
  async leaveBalance(orgId: string, employeeId: string, year = new Date().getUTCFullYear()): Promise<Record<LeaveType, number>> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { leaveAllowances: true } });
    const allowances = org.leaveAllowances as Record<LeaveType, number>;
    const used = await this.prisma.leaveRequest.groupBy({
      by: ['type'],
      where: { employeeId, status: { in: ['pending', 'approved'] }, start: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
      _sum: { days: true },
    });
    const types: LeaveType[] = ['annual', 'sick', 'parental', 'study', 'unpaid'];
    return Object.fromEntries(types.map((t) => [t, Math.max(0, (allowances[t] ?? 0) - (used.find((u: { type: LeaveType; _sum: { days: number | null } }) => u.type === t)?._sum.days ?? 0))])) as Record<LeaveType, number>;
  }

  async requestLeave(org: OrgContext, input: { employeeId: string; type: LeaveType; start: string; end: string; reason: string }, actor: Actor) {
    const orgId = org.organization.id;
    if (!this.isSelf(org, input.employeeId) && !this.isHr(org)) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You can only request leave for yourself');
    }
    const e = await this.employee(orgId, input.employeeId);
    if (e.status === 'exited') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This employee has exited');
    const start = toDate(input.start);
    const end = toDate(input.end);
    if (new Date(start).getUTCFullYear() !== new Date(end).getUTCFullYear()) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Split leave that crosses into a new year into two requests', { end: 'Different year from start' });
    }
    const days = workingDays(start, end);
    if (days === 0) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'The dates contain no working days', { start: 'No working days' });

    const overlap = await this.prisma.leaveRequest.findFirst({
      where: { employeeId: input.employeeId, status: { in: ['pending', 'approved'] }, start: { lte: end }, end: { gte: start } },
    });
    if (overlap) throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'This overlaps another leave request');
    // Checked against the allowance of the year the leave falls in.
    const balance = (await this.leaveBalance(orgId, input.employeeId, start.getUTCFullYear()))[input.type];
    if (days > balance) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', `Not enough ${input.type} leave: ${balance} day(s) left, ${days} requested`);

    const leave = await this.prisma.leaveRequest.create({
      data: { organizationId: orgId, employeeId: input.employeeId, type: input.type, start, end, days, reason: input.reason },
    });
    await this.audit.record({ action: 'leave.requested', targetType: 'leave', targetId: leave.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    if (e.managerId) {
      const manager = await this.prisma.employee.findUnique({ where: { id: e.managerId }, select: { userId: true } });
      if (manager?.userId) {
        await this.notifications.notify(manager.userId, { kind: 'workplace', title: 'Leave request', body: `${e.name} requested ${days} day(s) of ${input.type} leave.`, href: '/org/hr/leave' });
      }
    }
    return toApiLeave(leave);
  }

  async decideLeave(org: OrgContext, leaveId: string, decision: 'approved' | 'rejected' | 'cancelled', actor: Actor) {
    const orgId = org.organization.id;
    const leave = await this.prisma.leaveRequest.findFirst({ where: { id: leaveId, organizationId: orgId }, include: { employee: true } });
    if (!leave) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Leave request not found');
    const own = this.isSelf(org, leave.employeeId);

    if (decision === 'cancelled') {
      const canManage = org.permissions.has('hr.leave.approve') && (this.isHr(org) || (await this.directReportIds(org)).includes(leave.employeeId));
      if (!own && !canManage) this.forbidden();
      if (!['pending', 'approved'].includes(leave.status)) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', `This request is already ${leave.status}`);
      if (leave.status === 'approved' && leave.start <= todayUtc()) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This leave has already started');
    } else {
      if (!org.permissions.has('hr.leave.approve')) this.forbidden();
      if (own) throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You cannot decide your own leave');
      if (!this.isHr(org) && !(await this.directReportIds(org)).includes(leave.employeeId)) this.forbidden();
      if (leave.status !== 'pending') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', `This request is already ${leave.status}`);
    }

    const { count } = await this.prisma.leaveRequest.updateMany({
      where: { id: leave.id, status: leave.status },
      data: { status: decision, decidedById: actor.user.id, decidedByName: actor.user.displayName, decidedAt: new Date() },
    });
    if (count !== 1) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This request changed; reload and try again');
    await this.audit.record({ action: `leave.${decision}`, targetType: 'leave', targetId: leave.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    if (!own && leave.employee.userId) {
      await this.notifications.notify(leave.employee.userId, { kind: 'workplace', title: `Leave ${decision}`, body: `Your ${leave.type} leave from ${isoDate(leave.start)} was ${decision}.`, href: '/org/me' });
    }
    return toApiLeave(await this.prisma.leaveRequest.findUniqueOrThrow({ where: { id: leave.id } }));
  }

  // ── Attendance ───────────────────────────────────────────────────────────
  async attendance(org: OrgContext, q: { employeeId?: string; from?: string; to?: string }, page: PageQuery) {
    // HR sees everyone; managers see their reports and themselves; everyone else only themselves.
    let scope: string[] | undefined;
    if (!this.isHr(org)) {
      const me = this.me(org);
      scope = [...(org.permissions.has('hr.leave.approve') ? await this.directReportIds(org) : []), ...(me ? [me] : [])];
    }
    const where: NonNullable<Parameters<typeof this.prisma.attendanceEntry.findMany>[0]>['where'] = {
      employee: { organizationId: org.organization.id },
      ...(scope ? { AND: [{ employeeId: { in: scope } }] } : {}),
      ...(q.employeeId ? { employeeId: q.employeeId } : {}),
      ...(q.from || q.to ? { date: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.attendanceEntry.findMany({ where, orderBy: [{ date: 'desc' }, { employeeId: 'asc' }], ...skipTake(page) }),
      this.prisma.attendanceEntry.count({ where }),
    ]);
    return toPage(rows.map(toApiAttendance), total, page);
  }

  private localNow() {
    const now = new Date(Date.now() + ORG_UTC_OFFSET_HOURS * 3_600_000);
    return { date: toDate(now.toISOString().slice(0, 10)), minutes: now.getUTCHours() * 60 + now.getUTCMinutes() };
  }

  async clockIn(org: OrgContext, employeeId: string, status: 'present' | 'remote') {
    if (!this.isSelf(org, employeeId)) throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You can only clock in for yourself');
    const { date, minutes } = this.localNow();
    const late = status === 'present' && minutes > LATE_AFTER_MINUTES;
    try {
      const entry = await this.prisma.attendanceEntry.create({ data: { employeeId, date, status: late ? 'late' : status, clockInAt: new Date() } });
      return toApiAttendance(entry);
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'You already clocked in today');
      throw err;
    }
  }

  async clockOut(org: OrgContext, employeeId: string) {
    if (!this.isSelf(org, employeeId)) throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You can only clock out for yourself');
    const { date } = this.localNow();
    const entry = await this.prisma.attendanceEntry.findUnique({ where: { employeeId_date: { employeeId, date } } });
    if (!entry?.clockInAt) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Clock in first');
    if (entry.clockOutAt) throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'You already clocked out today');
    const now = new Date();
    const hours = Math.round(((now.getTime() - entry.clockInAt.getTime()) / 3_600_000) * 100) / 100;
    return toApiAttendance(await this.prisma.attendanceEntry.update({ where: { employeeId_date: { employeeId, date } }, data: { clockOutAt: now, hours: Math.min(24, hours) } }));
  }

  // ── Performance reviews ──────────────────────────────────────────────────
  async reviews(org: OrgContext, q: { cycle?: string; employeeId?: string }) {
    let employeeFilter: { in: string[] } | string | undefined;
    if (org.permissions.has('hr.performance.manage')) {
      const scope = await this.managedScope(org);
      const me = this.me(org);
      employeeFilter = scope ? { in: [...(scope.in as string[]), ...(me ? [me] : [])] } : undefined;
    } else {
      if (!this.me(org)) return [];
      employeeFilter = this.me(org)!;
    }
    const rows = await this.prisma.performanceReview.findMany({
      where: {
        organizationId: org.organization.id,
        AND: [...(employeeFilter ? [{ employeeId: employeeFilter }] : []), ...(q.employeeId ? [{ employeeId: q.employeeId }] : []), ...(q.cycle ? [{ cycle: q.cycle }] : [])],
      },
      orderBy: [{ cycle: 'desc' }, { employeeId: 'asc' }],
      take: 2000,
    });
    // People only see their own review once it is shared (HR sees everything).
    return rows.filter((r) => !this.isSelf(org, r.employeeId) || this.isHr(org) || r.status === 'shared').map(toApiReview);
  }

  async createReviews(org: OrgContext, cycle: string, employeeIds: string[], actor: Actor) {
    const orgId = org.organization.id;
    const scope = await this.managedScope(org);
    const employees = await this.prisma.employee.findMany({ where: { id: { in: employeeIds }, organizationId: orgId, status: { not: 'exited' } } });
    if (employees.length !== new Set(employeeIds).size) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Unknown or exited employee in the list', { employeeIds: 'Unknown employee' });
    if (scope && employees.some((e) => !(scope.in as string[]).includes(e.id))) this.forbidden();
    const existing = await this.prisma.performanceReview.findMany({ where: { cycle, employeeId: { in: employeeIds } }, select: { employeeId: true } });
    if (existing.length) throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', `${existing.length} employee(s) already have a review in this cycle`);

    const managers = new Map((await this.prisma.employee.findMany({ where: { id: { in: employees.map((e) => e.managerId).filter((x): x is string => !!x) } } })).map((m) => [m.id, m]));
    await this.prisma.performanceReview.createMany({
      data: employees.map((e) => {
        const m = e.managerId ? managers.get(e.managerId) : undefined;
        return { organizationId: orgId, employeeId: e.id, cycle, reviewerId: m?.id ?? null, reviewerName: m?.name ?? actor.user.displayName };
      }),
    });
    await this.audit.record({ action: 'review.cycle_started', targetType: 'organization', targetId: orgId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { cycle, count: employees.length } });
    return this.reviews(org, { cycle });
  }

  async updateReview(org: OrgContext, reviewId: string, patch: { status?: string; rating?: number | null; goals?: unknown[]; strengths?: string; improvements?: string }, actor: Actor) {
    const orgId = org.organization.id;
    const r = await this.prisma.performanceReview.findFirst({ where: { id: reviewId, organizationId: orgId } });
    if (!r) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Review not found');
    if (this.isSelf(org, r.employeeId) && !this.isHr(org)) throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You cannot manage your own review');
    const scope = await this.managedScope(org);
    if (scope && !(scope.in as string[]).includes(r.employeeId)) this.forbidden();
    if (r.status === 'shared') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This review has been shared and is final');
    const updated = await this.prisma.performanceReview.update({
      where: { id: r.id },
      data: { ...patch, ...(patch.goals ? { goals: patch.goals as Prisma.InputJsonValue } : {}) } as Prisma.PerformanceReviewUpdateInput,
    });
    await this.audit.record({ action: 'review.updated', targetType: 'review', targetId: r.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { fields: Object.keys(patch) } });
    if (patch.status === 'shared') {
      const e = await this.prisma.employee.findUnique({ where: { id: r.employeeId }, select: { userId: true } });
      if (e?.userId) await this.notifications.notify(e.userId, { kind: 'workplace', title: 'Performance review shared', body: `Your ${r.cycle} review is ready to read.`, href: '/org/me' });
    }
    return toApiReview(updated);
  }

  // ── Policies ─────────────────────────────────────────────────────────────
  async createPolicy(orgId: string, input: { title: string; category: string; body: string }, actor: Actor) {
    const p = await this.prisma.policy.create({ data: { organizationId: orgId, title: input.title, category: input.category.replace(/-/g, '_') as never, body: input.body } });
    await this.audit.record({ action: 'policy.created', targetType: 'policy', targetId: p.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return toApiPolicy(p, 0);
  }

  private async policy(orgId: string, policyId: string) {
    const p = await this.prisma.policy.findFirst({ where: { id: policyId, organizationId: orgId, archivedAt: null } });
    if (!p) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Policy not found');
    return p;
  }

  async replacePolicy(orgId: string, policyId: string, input: { title: string; category: string; body: string }, actor: Actor) {
    const p = await this.policy(orgId, policyId);
    const changed = p.body !== input.body || p.title !== input.title;
    const updated = await this.prisma.policy.update({
      where: { id: p.id },
      data: { title: input.title, category: input.category.replace(/-/g, '_') as never, body: input.body, ...(changed ? { version: { increment: 1 } } : {}) },
    });
    await this.audit.record({ action: 'policy.updated', targetType: 'policy', targetId: p.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { newVersion: updated.version } });
    const acks = await this.prisma.policyAcknowledgement.count({ where: { policyId: p.id, version: updated.version } });
    return toApiPolicy(updated, acks);
  }

  async archivePolicy(orgId: string, policyId: string, actor: Actor) {
    const p = await this.policy(orgId, policyId);
    await this.prisma.policy.update({ where: { id: p.id }, data: { archivedAt: new Date() } });
    await this.audit.record({ action: 'policy.archived', targetType: 'policy', targetId: p.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
  }

  async acknowledgePolicy(orgId: string, policyId: string, actor: Actor) {
    const p = await this.policy(orgId, policyId);
    await this.prisma.policyAcknowledgement.upsert({
      where: { policyId_userId_version: { policyId: p.id, userId: actor.user.id, version: p.version } },
      create: { policyId: p.id, userId: actor.user.id, version: p.version },
      update: {},
    });
  }

  // ── Self-service ─────────────────────────────────────────────────────────
  async selfService(org: OrgContext) {
    const me = this.me(org);
    if (!me) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'You do not have an employee record in this organisation yet');
    const orgId = org.organization.id;
    const [record, leaveBalance, leave, policies, acks, previews] = await Promise.all([
      this.employee(orgId, me),
      this.leaveBalance(orgId, me),
      this.prisma.leaveRequest.findMany({ where: { employeeId: me }, orderBy: { start: 'desc' }, take: 100 }),
      this.prisma.policy.findMany({ where: { organizationId: orgId, archivedAt: null } }),
      this.prisma.policyAcknowledgement.findMany({ where: { userId: org.membership.userId, policy: { organizationId: orgId } } }),
      this.prisma.payrollPreview.findMany({ where: { organizationId: orgId, status: 'approved-preview' }, orderBy: { period: 'desc' }, take: 24 }),
    ]);
    const acked = new Set(acks.map((a) => `${a.policyId}:${a.version}`));
    return {
      record: toApiEmployee(record, true),
      leaveBalance,
      leave: leave.map(toApiLeave),
      policiesToAcknowledge: policies.filter((p) => !acked.has(`${p.id}:${p.version}`)).map((p) => toApiPolicy(p, 0)),
      payslips: previews
        .filter((p) => (p.payslips as { employeeId: string }[]).some((s) => s.employeeId === me))
        .map((p) => ({ previewId: p.id, period: p.period })),
    };
  }

  // ── Structure & dashboard ────────────────────────────────────────────────
  async structure(orgId: string) {
    const [departments, locations, employees] = await Promise.all([
      this.prisma.department.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } }),
      this.prisma.officeLocation.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.employee.findMany({ where: { organizationId: orgId, status: { not: 'exited' } }, select: { id: true, name: true, title: true, managerId: true, departmentId: true }, orderBy: { name: 'asc' }, take: 10000 }),
    ]);
    return {
      departments: departments.map((d) => ({ id: d.id, name: d.name, headEmployeeId: d.headEmployeeId, responsibilities: d.responsibilities, locationId: d.locationId })),
      locations: locations.map((l) => ({ id: l.id, name: l.name, city: l.city, address: l.address, headcountCapacity: l.headcountCapacity })),
      employees,
    };
  }

  async dashboard(org: OrgContext) {
    const orgId = org.organization.id;
    const leaveScope = org.permissions.has('hr.leave.approve') ? await this.managedScope(org) : { in: this.me(org) ? [this.me(org)!] : [] };
    const reviewScope = org.permissions.has('hr.performance.manage') ? await this.managedScope(org) : { in: this.me(org) ? [this.me(org)!] : [] };
    const [openVacancies, pendingLeave, reviewsDue] = await Promise.all([
      this.prisma.job.count({ where: { organizationId: orgId, status: 'published', closesOn: { gte: todayUtc() } } }),
      this.prisma.leaveRequest.count({ where: { organizationId: orgId, status: 'pending', ...(leaveScope ? { employeeId: leaveScope } : {}) } }),
      this.prisma.performanceReview.count({ where: { organizationId: orgId, status: { notIn: ['calibrated', 'shared'] }, ...(reviewScope ? { employeeId: reviewScope } : {}) } }),
    ]);
    return { openVacancies, pendingLeave, reviewsDue, setupChecklist: org.organization.setupChecklist as Record<string, boolean> };
  }
}
