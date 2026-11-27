import { HttpStatus, Injectable } from '@nestjs/common';
import { Compensation, CompensationStructure, PayComponent, PayrollPreview, Prisma, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { OrgContext } from '../auth/auth.decorators';
import { ApiError } from '../common/api-exception.filter';
import { PageQuery, isoDate, skipTake, todayUtc, toPage } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

type Actor = { user: User; ip?: string };
type Line = { label: string; amount: number; kind: 'earning' | 'deduction' };
type Payslip = {
  employeeId: string; employeeName: string; period: string; lines: Line[];
  gross: number; totalDeductions: number; net: number; warnings: string[];
  /** Internal, for reports; stripped from API output. */
  departmentId?: string;
};
export type Adjustment = { employeeId: string; kind: 'bonus' | 'deduction'; label: string; amount: number };

/** Shown on every payslip until statutory rules are agreed (open product decision). */
const STATUTORY_WARNING = 'Statutory deductions (PAYE, pension, NHF) are not calculated yet.';

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  // ── Mappers ──────────────────────────────────────────────────────────────
  private toApiComponent = (c: PayComponent) => ({ id: c.id, name: c.name, kind: c.kind, calc: { type: c.calcType, value: c.calcValue }, taxable: c.taxable });
  private toApiStructure = (s: CompensationStructure) => ({ id: s.id, grade: s.grade, minBase: s.minBase, maxBase: s.maxBase, componentIds: s.componentIds });
  private toApiCompensation = (c: Compensation) => ({
    employeeId: c.employeeId, structureId: c.structureId ?? '', baseMonthly: c.baseMonthly, currency: 'NGN' as const,
    effectiveFrom: isoDate(c.effectiveFrom), bankOnFile: c.bankOnFile, history: c.history as { date: string; baseMonthly: number; reason: string }[],
  });
  private toApiPreview = (p: PayrollPreview) => ({
    id: p.id, organizationId: p.organizationId, period: p.period, createdAt: p.createdAt.toISOString(), status: p.status,
    payslips: (p.payslips as Payslip[]).map(({ departmentId: _d, ...s }) => s),
    totals: p.totals as { gross: number; deductions: number; net: number; headcount: number },
    simulated: true as const,
  });

  private async assertOwnId(existing: { organizationId: string } | null, orgId: string) {
    if (existing && existing.organizationId !== orgId) throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'That ID is already in use');
  }

  // ── Compensation ─────────────────────────────────────────────────────────
  async compensation(orgId: string, departmentId: string | undefined, page: PageQuery) {
    const where: Prisma.CompensationWhereInput = { organizationId: orgId, employee: { status: { not: 'exited' }, ...(departmentId ? { departmentId } : {}) } };
    const [rows, total] = await Promise.all([
      this.prisma.compensation.findMany({ where, orderBy: { employeeId: 'asc' }, ...skipTake(page) }),
      this.prisma.compensation.count({ where }),
    ]);
    return toPage(rows.map(this.toApiCompensation), total, page);
  }

  async setCompensation(orgId: string, employeeId: string, input: { baseMonthly: number; reason: string; structureId?: string | null }, actor: Actor) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId: orgId } });
    if (!employee) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Employee not found');
    if (employee.status === 'exited') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This employee has exited');
    if (input.structureId && !(await this.prisma.compensationStructure.findFirst({ where: { id: input.structureId, organizationId: orgId } }))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Unknown salary structure', { structureId: 'Not a structure of this organisation' });
    }
    const existing = await this.prisma.compensation.findUnique({ where: { employeeId } });
    const today = isoDate(new Date());
    const history = [...((existing?.history as object[]) ?? []), { date: today, baseMonthly: input.baseMonthly, reason: input.reason }];
    const data = {
      baseMonthly: input.baseMonthly, effectiveFrom: todayUtc(), history: history as Prisma.InputJsonValue,
      ...(input.structureId !== undefined ? { structureId: input.structureId } : {}),
    };
    const c = await this.prisma.compensation.upsert({ where: { employeeId }, create: { employeeId, organizationId: orgId, ...data }, update: data });
    await this.audit.record({
      action: 'compensation.changed', targetType: 'employee', targetId: employeeId, actorId: actor.user.id, organizationId: orgId, ip: actor.ip,
      details: { from: existing?.baseMonthly ?? null, to: input.baseMonthly },
    });
    return this.toApiCompensation(c);
  }

  // ── Components & structures ──────────────────────────────────────────────
  async components(orgId: string) {
    return (await this.prisma.payComponent.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } })).map(this.toApiComponent);
  }

  async upsertComponent(orgId: string, id: string, input: { name: string; kind: string; calc: { type: string; value: number }; taxable: boolean }, actor: Actor) {
    await this.assertOwnId(await this.prisma.payComponent.findUnique({ where: { id } }), orgId);
    const data = { name: input.name, kind: input.kind, calcType: input.calc.type, calcValue: input.calc.value, taxable: input.taxable };
    const c = await this.prisma.payComponent.upsert({ where: { id }, create: { id, organizationId: orgId, ...data }, update: data });
    await this.audit.record({ action: 'pay_component.saved', targetType: 'pay_component', targetId: id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return this.toApiComponent(c);
  }

  async structures(orgId: string) {
    return (await this.prisma.compensationStructure.findMany({ where: { organizationId: orgId }, orderBy: { minBase: 'asc' } })).map(this.toApiStructure);
  }

  private async assertComponents(orgId: string, ids: string[]) {
    const found = await this.prisma.payComponent.count({ where: { id: { in: ids }, organizationId: orgId } });
    if (found !== new Set(ids).size) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Unknown pay component', { componentIds: 'Unknown component' });
  }

  async upsertStructure(orgId: string, id: string, input: { grade: string; minBase: number; maxBase: number; componentIds: string[] }, actor: Actor) {
    await this.assertOwnId(await this.prisma.compensationStructure.findUnique({ where: { id } }), orgId);
    await this.assertComponents(orgId, input.componentIds);
    const data = { ...input, componentIds: [...new Set(input.componentIds)] };
    const s = await this.prisma.compensationStructure.upsert({ where: { id }, create: { id, organizationId: orgId, ...data }, update: data });
    await this.audit.record({ action: 'pay_structure.saved', targetType: 'pay_structure', targetId: id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
    return this.toApiStructure(s);
  }

  async setStructureComponents(orgId: string, id: string, componentIds: string[], actor: Actor) {
    const s = await this.prisma.compensationStructure.findFirst({ where: { id, organizationId: orgId } });
    if (!s) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Salary structure not found');
    return this.upsertStructure(orgId, id, { grade: s.grade, minBase: s.minBase, maxBase: s.maxBase, componentIds }, actor);
  }

  // ── Previews ─────────────────────────────────────────────────────────────
  async previews(orgId: string, period?: string) {
    const rows = await this.prisma.payrollPreview.findMany({ where: { organizationId: orgId, ...(period ? { period } : {}) }, orderBy: [{ period: 'desc' }, { createdAt: 'desc' }], take: 120 });
    return rows.map(this.toApiPreview);
  }

  /** Pure calculation of one payslip. Simulation only. */
  private payslip(
    e: { id: string; name: string; departmentId: string },
    comp: Compensation,
    structure: CompensationStructure | undefined,
    components: Map<string, PayComponent>,
    adjustments: Adjustment[],
    period: string,
  ): Payslip {
    const base = comp.baseMonthly;
    const lines: Line[] = [{ label: 'Basic salary', amount: base, kind: 'earning' }];
    for (const id of structure?.componentIds ?? []) {
      const c = components.get(id);
      if (!c) continue;
      const amount = Math.round(c.calcType === 'percent' ? (base * c.calcValue) / 100 : c.calcValue);
      lines.push({ label: c.name, amount, kind: c.kind === 'allowance' ? 'earning' : 'deduction' });
    }
    for (const a of adjustments) lines.push({ label: a.label, amount: a.amount, kind: a.kind === 'bonus' ? 'earning' : 'deduction' });

    const gross = lines.filter((l) => l.kind === 'earning').reduce((s, l) => s + l.amount, 0);
    const totalDeductions = lines.filter((l) => l.kind === 'deduction').reduce((s, l) => s + l.amount, 0);
    const warnings = [STATUTORY_WARNING];
    if (!comp.bankOnFile) warnings.push('No bank details on file.');
    if (!structure) warnings.push('No salary structure assigned.');
    else if (base < structure.minBase || base > structure.maxBase) warnings.push(`Base salary is outside the ${structure.grade} range.`);
    if (gross - totalDeductions < 0) warnings.push('Deductions exceed earnings.');
    return { employeeId: e.id, employeeName: e.name, period, lines, gross, totalDeductions, net: gross - totalDeductions, warnings, departmentId: e.departmentId };
  }

  async createPreview(orgId: string, period: string, adjustments: Adjustment[], actor: Actor) {
    const approved = await this.prisma.payrollPreview.findFirst({ where: { organizationId: orgId, period, status: 'approved-preview' } });
    if (approved) throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'An approved preview already exists for this period');

    const [year, month] = period.split('-').map(Number) as [number, number];
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 0));
    const employees = await this.prisma.employee.findMany({
      where: {
        organizationId: orgId,
        status: { not: 'exited' },
        startDate: { lte: periodEnd },
        OR: [{ lastDay: null }, { lastDay: { gte: periodStart } }],
      },
      include: { compensation: true },
      orderBy: { name: 'asc' },
    });
    const ids = new Set(employees.map((e) => e.id));
    const unknown = adjustments.filter((a) => !ids.has(a.employeeId));
    if (unknown.length) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Adjustment for an employee not on this payroll', { adjustments: `Unknown employee ${unknown[0]!.employeeId}` });

    const [structures, components] = await Promise.all([
      this.prisma.compensationStructure.findMany({ where: { organizationId: orgId } }),
      this.prisma.payComponent.findMany({ where: { organizationId: orgId } }),
    ]);
    const structureMap = new Map(structures.map((s) => [s.id, s]));
    const componentMap = new Map(components.map((c) => [c.id, c]));
    const payslips = employees
      .filter((e) => e.compensation)
      .map((e) => this.payslip(e, e.compensation!, e.compensation!.structureId ? structureMap.get(e.compensation!.structureId) : undefined, componentMap, adjustments.filter((a) => a.employeeId === e.id), period));
    const totals = {
      gross: payslips.reduce((s, p) => s + p.gross, 0),
      deductions: payslips.reduce((s, p) => s + p.totalDeductions, 0),
      net: payslips.reduce((s, p) => s + p.net, 0),
      headcount: payslips.length,
    };
    const preview = await this.prisma.payrollPreview.create({
      data: { organizationId: orgId, period, payslips: payslips as unknown as Prisma.InputJsonValue, totals, createdById: actor.user.id },
    });
    await this.audit.record({ action: 'payroll.preview_created', targetType: 'payroll_preview', targetId: preview.id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { period, headcount: totals.headcount } });
    return this.toApiPreview(preview);
  }

  private async preview(orgId: string, id: string) {
    const p = await this.prisma.payrollPreview.findFirst({ where: { id, organizationId: orgId } });
    if (!p) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Payroll preview not found');
    return p;
  }

  async approve(orgId: string, id: string, actor: Actor) {
    const p = await this.preview(orgId, id);
    if (p.status !== 'draft') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Already approved');
    const other = await this.prisma.payrollPreview.findFirst({ where: { organizationId: orgId, period: p.period, status: 'approved-preview' } });
    if (other) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Another preview for this period is already approved');
    // Approval marks the preview only. It never creates a payment or a filing.
    const updated = await this.prisma.payrollPreview.update({ where: { id }, data: { status: 'approved-preview', approvedAt: new Date(), approvedById: actor.user.id } });
    await this.audit.record({ action: 'payroll.preview_approved', targetType: 'payroll_preview', targetId: id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip, details: { period: p.period } });
    return this.toApiPreview(updated);
  }

  async remove(orgId: string, id: string, actor: Actor) {
    const p = await this.preview(orgId, id);
    if (p.status !== 'draft') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Approved previews cannot be deleted');
    await this.prisma.payrollPreview.delete({ where: { id } });
    await this.audit.record({ action: 'payroll.preview_deleted', targetType: 'payroll_preview', targetId: id, actorId: actor.user.id, organizationId: orgId, ip: actor.ip });
  }

  async payslipFor(org: OrgContext, previewId: string, employeeId: string) {
    const p = await this.preview(org.organization.id, previewId);
    const canView = org.permissions.has('payroll.view');
    if (!canView) {
      if (org.membership.employeeId !== employeeId) throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You can only see your own payslip');
      if (p.status !== 'approved-preview') throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Payslip not found');
    }
    const slip = (p.payslips as Payslip[]).find((s) => s.employeeId === employeeId);
    if (!slip) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Payslip not found');
    const { departmentId: _d, ...rest } = slip;
    return rest;
  }

  async report(orgId: string, from?: string, to?: string) {
    const previews = await this.prisma.payrollPreview.findMany({
      where: { organizationId: orgId, status: 'approved-preview', ...(from || to ? { period: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      orderBy: { period: 'asc' },
    });
    const departments = new Map((await this.prisma.department.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
    const rows: { period: string; department: string; gross: number; deductions: number; net: number }[] = [];
    for (const p of previews) {
      const byDept = new Map<string, { gross: number; deductions: number; net: number }>();
      for (const s of p.payslips as Payslip[]) {
        const name = (s.departmentId && departments.get(s.departmentId)) || 'Unassigned';
        const acc = byDept.get(name) ?? { gross: 0, deductions: 0, net: 0 };
        acc.gross += s.gross;
        acc.deductions += s.totalDeductions;
        acc.net += s.net;
        byDept.set(name, acc);
      }
      for (const [department, t] of [...byDept].sort(([a], [b]) => a.localeCompare(b))) rows.push({ period: p.period, department, ...t });
    }
    return rows;
  }
}
