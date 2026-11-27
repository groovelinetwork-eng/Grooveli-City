import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiRequest, CurrentOrg, CurrentUser, OrgAccess, OrgContext } from '../auth/auth.decorators';
import { ApiError } from '../common/api-exception.filter';
import { PageQuery } from '../common/pagination';
import { ok } from '../common/responses';
import { ZodPipe, zId } from '../common/zod';
import { PayrollService } from './payroll.service';

const VIEW = { perm: 'payroll.view', module: 'payroll' } as const;
const PREPARE = { perm: 'payroll.prepare', module: 'payroll' } as const;
const idPipe = new ZodPipe(zId);
const slug = z.string().regex(/^[A-Za-z0-9_-]{2,64}$/, 'Use 2–64 letters, digits, - or _');
const slugPipe = new ZodPipe(slug);
const zPeriod = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const money = z.number().int().min(0).max(1_000_000_000);
const actor = (user: User, req: ApiRequest) => ({ user, ip: req.ip });

const CompQuery = PageQuery.extend({ departmentId: zId.optional() }).strict();
const CompBody = z.object({ baseMonthly: z.number().int().min(1).max(1_000_000_000), reason: z.string().trim().min(1).max(500), structureId: slug.nullable().optional() }).strict();
const ComponentBody = z
  .object({
    id: slug,
    name: z.string().trim().min(1).max(80),
    kind: z.enum(['allowance', 'deduction']),
    calc: z.discriminatedUnion('type', [
      z.object({ type: z.literal('percent'), value: z.number().min(0).max(100) }).strict(),
      z.object({ type: z.literal('fixed'), value: money }).strict(),
    ]),
    taxable: z.boolean(),
  })
  .strict();
const StructureBody = z
  .object({ grade: z.string().trim().min(1).max(40), minBase: money, maxBase: money, componentIds: z.array(slug).max(50) })
  .strict()
  .refine((s) => s.maxBase >= s.minBase, { message: 'Must be at least minBase', path: ['maxBase'] });
const StructureComponentsBody = z.object({ componentIds: z.array(slug).max(50) }).strict();
const PreviewsQuery = z.object({ period: zPeriod.optional() }).strict();
const PreviewBody = z
  .object({
    period: zPeriod,
    adjustments: z.array(z.object({ employeeId: zId, kind: z.enum(['bonus', 'deduction']), label: z.string().trim().min(1).max(80), amount: z.number().int().min(1).max(1_000_000_000) }).strict()).max(5000),
  })
  .strict();
const ReportQuery = z.object({ from: zPeriod.optional(), to: zPeriod.optional() }).strict();

/** Payroll PREVIEW: calculations only. No money moves and nothing is filed. */
@Controller('orgs/:orgId/payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @OrgAccess(VIEW)
  @Get('compensation')
  async compensation(@Param('orgId') orgId: string, @Query(new ZodPipe(CompQuery)) q: z.infer<typeof CompQuery>) {
    return ok(await this.payroll.compensation(orgId, q.departmentId, q));
  }

  @OrgAccess(PREPARE)
  @Put('compensation/:employeeId')
  async setCompensation(@Param('orgId') orgId: string, @Param('employeeId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(CompBody)) body: z.infer<typeof CompBody>, @Req() req: ApiRequest) {
    return ok(await this.payroll.setCompensation(orgId, id, body, actor(user, req)), 'Compensation updated');
  }

  @OrgAccess(VIEW)
  @Get('components')
  async components(@Param('orgId') orgId: string) {
    return ok(await this.payroll.components(orgId));
  }

  @OrgAccess(PREPARE)
  @Put('components/:componentId')
  async upsertComponent(@Param('orgId') orgId: string, @Param('componentId', slugPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(ComponentBody)) body: z.infer<typeof ComponentBody>, @Req() req: ApiRequest) {
    if (body.id !== id) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Body id must match the path', { id: 'Must match path' });
    return ok(await this.payroll.upsertComponent(orgId, id, body, actor(user, req)));
  }

  @OrgAccess(VIEW)
  @Get('structures')
  async structures(@Param('orgId') orgId: string) {
    return ok(await this.payroll.structures(orgId));
  }

  @OrgAccess(PREPARE)
  @Put('structures/:structureId')
  async upsertStructure(@Param('orgId') orgId: string, @Param('structureId', slugPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(StructureBody)) body: z.infer<typeof StructureBody>, @Req() req: ApiRequest) {
    return ok(await this.payroll.upsertStructure(orgId, id, body, actor(user, req)));
  }

  @OrgAccess(PREPARE)
  @Put('structures/:structureId/components')
  async setStructureComponents(@Param('orgId') orgId: string, @Param('structureId', slugPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(StructureComponentsBody)) body: z.infer<typeof StructureComponentsBody>, @Req() req: ApiRequest) {
    return ok(await this.payroll.setStructureComponents(orgId, id, body.componentIds, actor(user, req)));
  }

  @OrgAccess(VIEW)
  @Get('previews')
  async previews(@Param('orgId') orgId: string, @Query(new ZodPipe(PreviewsQuery)) q: z.infer<typeof PreviewsQuery>) {
    return ok(await this.payroll.previews(orgId, q.period));
  }

  @OrgAccess(PREPARE)
  @Post('previews')
  async createPreview(@Param('orgId') orgId: string, @CurrentUser() user: User, @Body(new ZodPipe(PreviewBody)) body: z.infer<typeof PreviewBody>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.payroll.createPreview(orgId, body.period, body.adjustments, actor(user, req)), 'Preview generated (simulation only)');
  }

  @OrgAccess(PREPARE)
  @HttpCode(200)
  @Post('previews/:previewId/approve')
  async approve(@Param('orgId') orgId: string, @Param('previewId', idPipe) id: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    return ok(await this.payroll.approve(orgId, id, actor(user, req)), 'Preview approved (no payment is made)');
  }

  @OrgAccess(PREPARE)
  @Delete('previews/:previewId')
  async remove(@Param('orgId') orgId: string, @Param('previewId', idPipe) id: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    await this.payroll.remove(orgId, id, actor(user, req));
    return ok(null, 'Preview deleted');
  }

  @OrgAccess({ ...VIEW, perm: ['payroll.view', 'self.service'] })
  @Get('previews/:previewId/payslips/:employeeId')
  async payslip(@CurrentOrg() org: OrgContext, @Param('previewId', idPipe) id: string, @Param('employeeId', idPipe) employeeId: string) {
    return ok(await this.payroll.payslipFor(org, id, employeeId));
  }

  @OrgAccess(VIEW)
  @Get('reports')
  async report(@Param('orgId') orgId: string, @Query(new ZodPipe(ReportQuery)) q: z.infer<typeof ReportQuery>) {
    return ok(await this.payroll.report(orgId, q.from, q.to));
  }
}
