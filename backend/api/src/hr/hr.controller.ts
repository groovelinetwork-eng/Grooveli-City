import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiRequest, CurrentOrg, CurrentUser, OrgAccess, OrgContext } from '../auth/auth.decorators';
import { ok } from '../common/responses';
import { ZodPipe, zId } from '../common/zod';
import { PolicyInput } from '../orgs/org.schemas';
import { OrgsService } from '../orgs/orgs.service';
import {
  AttendanceQuery,
  ClockInBody,
  ClockOutBody,
  DocumentFields,
  EmployeeCreate,
  EmployeePatch,
  EmployeesQuery,
  LeaveCreate,
  LeaveDecision,
  LeaveQuery,
  OffboardingBody,
  ReviewPatch,
  ReviewsCreate,
  ReviewsQuery,
  TaskBody,
} from './hr.schemas';
import { HrService } from './hr.service';

const idPipe = new ZodPipe(zId);
const HR = 'hr' as const;
const RECORDS = { perm: 'hr.records.manage', module: HR } as const;
const SELF_OR_RECORDS = { perm: 'hr.records.manage', orSelf: true, module: HR } as const;
const actor = (user: User, req: ApiRequest) => ({ user, ip: req.ip });

@Controller()
export class HrController {
  constructor(private readonly hr: HrService, private readonly orgs: OrgsService) {}

  // ── Structure & dashboard (not module-gated) ─────────────────────────────
  @OrgAccess({ perm: 'hr.directory.view' })
  @Get('orgs/:orgId/structure')
  async structure(@Param('orgId') orgId: string) {
    return ok(await this.hr.structure(orgId));
  }

  @OrgAccess()
  @Get('orgs/:orgId/dashboard')
  async dashboard(@CurrentOrg() org: OrgContext) {
    return ok(await this.hr.dashboard(org));
  }

  // ── Employees ────────────────────────────────────────────────────────────
  @OrgAccess({ perm: 'hr.directory.view', module: HR })
  @Get('orgs/:orgId/hr/employees')
  async list(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(EmployeesQuery)) q: z.infer<typeof EmployeesQuery>) {
    return ok(await this.hr.list(org, q, q));
  }

  @OrgAccess(SELF_OR_RECORDS)
  @Get('orgs/:orgId/hr/employees/:employeeId')
  async get(@CurrentOrg() org: OrgContext, @Param('employeeId', idPipe) id: string) {
    return ok(await this.hr.get(org, id));
  }

  @OrgAccess(RECORDS)
  @Post('orgs/:orgId/hr/employees')
  async create(@CurrentOrg() org: OrgContext, @CurrentUser() user: User, @Body(new ZodPipe(EmployeeCreate)) body: z.infer<typeof EmployeeCreate>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.hr.create(org, body, actor(user, req)), 'Employee added');
  }

  @OrgAccess(RECORDS)
  @Patch('orgs/:orgId/hr/employees/:employeeId')
  async update(@CurrentOrg() org: OrgContext, @Param('employeeId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(EmployeePatch)) body: z.infer<typeof EmployeePatch>, @Req() req: ApiRequest) {
    return ok(await this.hr.update(org, id, body, actor(user, req)), 'Employee updated');
  }

  @OrgAccess(RECORDS)
  @HttpCode(200)
  @Post('orgs/:orgId/hr/employees/:employeeId/offboarding')
  async startOffboarding(@CurrentOrg() org: OrgContext, @Param('employeeId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(OffboardingBody)) body: z.infer<typeof OffboardingBody>, @Req() req: ApiRequest) {
    return ok(await this.hr.startOffboarding(org, id, body.lastDay, actor(user, req)), 'Offboarding started');
  }

  @OrgAccess(RECORDS)
  @HttpCode(200)
  @Post('orgs/:orgId/hr/employees/:employeeId/offboarding/complete')
  async completeOffboarding(@CurrentOrg() org: OrgContext, @Param('employeeId', idPipe) id: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    return ok(await this.hr.completeOffboarding(org, id, actor(user, req)), 'Offboarding complete');
  }

  @OrgAccess(RECORDS)
  @Put('orgs/:orgId/hr/employees/:employeeId/tasks/:taskId')
  async setTask(@CurrentOrg() org: OrgContext, @Param('employeeId', idPipe) id: string, @Param('taskId', idPipe) taskId: string, @Body(new ZodPipe(TaskBody)) body: z.infer<typeof TaskBody>) {
    return ok(await this.hr.setTask(org, id, taskId, body.done));
  }

  // ── Documents ────────────────────────────────────────────────────────────
  @OrgAccess(SELF_OR_RECORDS)
  @Get('orgs/:orgId/hr/employees/:employeeId/documents')
  async documents(@CurrentOrg() org: OrgContext, @Param('employeeId', idPipe) id: string) {
    return ok(await this.hr.documents(org, id));
  }

  @Throttle({ default: { limit: 60, ttl: 60 * 60_000 } })
  @OrgAccess(RECORDS)
  @Post('orgs/:orgId/hr/employees/:employeeId/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 } }))
  async upload(
    @CurrentOrg() org: OrgContext,
    @Param('employeeId', idPipe) id: string,
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodPipe(DocumentFields)) body: z.infer<typeof DocumentFields>,
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(201);
    return ok(await this.hr.uploadDocument(org, id, file, body, actor(user, req)), 'Document uploaded');
  }

  @OrgAccess(SELF_OR_RECORDS)
  @Get('orgs/:orgId/hr/employees/:employeeId/documents/:documentId')
  async documentLink(@CurrentOrg() org: OrgContext, @Param('employeeId', idPipe) id: string, @Param('documentId', idPipe) docId: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    return ok(await this.hr.documentLink(org, id, docId, actor(user, req)));
  }

  @OrgAccess(RECORDS)
  @Delete('orgs/:orgId/hr/employees/:employeeId/documents/:documentId')
  async deleteDocument(@CurrentOrg() org: OrgContext, @Param('employeeId', idPipe) id: string, @Param('documentId', idPipe) docId: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    await this.hr.deleteDocument(org, id, docId, actor(user, req));
    return ok(null, 'Document deleted');
  }

  // ── Leave ────────────────────────────────────────────────────────────────
  @OrgAccess({ perm: ['hr.leave.approve', 'self.service'], module: HR })
  @Get('orgs/:orgId/hr/leave')
  async leave(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(LeaveQuery)) q: z.infer<typeof LeaveQuery>) {
    return ok(await this.hr.listLeave(org, q, q));
  }

  @OrgAccess({ perm: 'self.service', module: HR })
  @Post('orgs/:orgId/hr/leave')
  async requestLeave(@CurrentOrg() org: OrgContext, @CurrentUser() user: User, @Body(new ZodPipe(LeaveCreate)) body: z.infer<typeof LeaveCreate>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.hr.requestLeave(org, body, actor(user, req)), 'Leave requested');
  }

  @OrgAccess({ perm: ['hr.leave.approve', 'self.service'], module: HR })
  @HttpCode(200)
  @Post('orgs/:orgId/hr/leave/:leaveId/decision')
  async decideLeave(@CurrentOrg() org: OrgContext, @Param('leaveId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(LeaveDecision)) body: z.infer<typeof LeaveDecision>, @Req() req: ApiRequest) {
    return ok(await this.hr.decideLeave(org, id, body.decision, actor(user, req)));
  }

  // ── Attendance ───────────────────────────────────────────────────────────
  @OrgAccess({ perm: 'hr.directory.view', module: HR })
  @Get('orgs/:orgId/hr/attendance')
  async attendance(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(AttendanceQuery)) q: z.infer<typeof AttendanceQuery>) {
    return ok(await this.hr.attendance(org, q, q));
  }

  @OrgAccess({ perm: 'self.service', module: HR })
  @HttpCode(200)
  @Post('orgs/:orgId/hr/attendance/clock-in')
  async clockIn(@CurrentOrg() org: OrgContext, @Body(new ZodPipe(ClockInBody)) body: z.infer<typeof ClockInBody>) {
    return ok(await this.hr.clockIn(org, body.employeeId, body.status), 'Clocked in');
  }

  @OrgAccess({ perm: 'self.service', module: HR })
  @HttpCode(200)
  @Post('orgs/:orgId/hr/attendance/clock-out')
  async clockOut(@CurrentOrg() org: OrgContext, @Body(new ZodPipe(ClockOutBody)) body: z.infer<typeof ClockOutBody>) {
    return ok(await this.hr.clockOut(org, body.employeeId), 'Clocked out');
  }

  // ── Reviews ──────────────────────────────────────────────────────────────
  @OrgAccess({ perm: ['hr.performance.manage', 'self.service'], module: HR })
  @Get('orgs/:orgId/hr/reviews')
  async reviews(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(ReviewsQuery)) q: z.infer<typeof ReviewsQuery>) {
    return ok(await this.hr.reviews(org, q));
  }

  @OrgAccess({ perm: 'hr.performance.manage', module: HR })
  @Post('orgs/:orgId/hr/reviews')
  async createReviews(@CurrentOrg() org: OrgContext, @CurrentUser() user: User, @Body(new ZodPipe(ReviewsCreate)) body: z.infer<typeof ReviewsCreate>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.hr.createReviews(org, body.cycle, body.employeeIds, actor(user, req)), 'Review cycle started');
  }

  @OrgAccess({ perm: 'hr.performance.manage', module: HR })
  @Patch('orgs/:orgId/hr/reviews/:reviewId')
  async updateReview(@CurrentOrg() org: OrgContext, @Param('reviewId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(ReviewPatch)) body: z.infer<typeof ReviewPatch>, @Req() req: ApiRequest) {
    return ok(await this.hr.updateReview(org, id, body, actor(user, req)));
  }

  // ── Policies ─────────────────────────────────────────────────────────────
  @OrgAccess({ module: HR })
  @Get('orgs/:orgId/hr/policies')
  async policies(@Param('orgId') orgId: string) {
    return ok(await this.orgs.policies(orgId));
  }

  @OrgAccess({ perm: 'hr.policies.manage', module: HR })
  @Post('orgs/:orgId/hr/policies')
  async createPolicy(@Param('orgId') orgId: string, @CurrentUser() user: User, @Body(new ZodPipe(PolicyInput)) body: z.infer<typeof PolicyInput>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.hr.createPolicy(orgId, body, actor(user, req)), 'Policy created');
  }

  @OrgAccess({ perm: 'hr.policies.manage', module: HR })
  @Put('orgs/:orgId/hr/policies/:policyId')
  async replacePolicy(@Param('orgId') orgId: string, @Param('policyId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(PolicyInput)) body: z.infer<typeof PolicyInput>, @Req() req: ApiRequest) {
    return ok(await this.hr.replacePolicy(orgId, id, body, actor(user, req)), 'Policy updated');
  }

  @OrgAccess({ perm: 'hr.policies.manage', module: HR })
  @Delete('orgs/:orgId/hr/policies/:policyId')
  async archivePolicy(@Param('orgId') orgId: string, @Param('policyId', idPipe) id: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    await this.hr.archivePolicy(orgId, id, actor(user, req));
    return ok(null, 'Policy archived');
  }

  @OrgAccess({ perm: 'self.service', module: HR })
  @HttpCode(200)
  @Post('orgs/:orgId/hr/policies/:policyId/acknowledge')
  async acknowledge(@Param('orgId') orgId: string, @Param('policyId', idPipe) id: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    await this.hr.acknowledgePolicy(orgId, id, actor(user, req));
    return ok(null, 'Acknowledged');
  }

  // ── Self-service ─────────────────────────────────────────────────────────
  @OrgAccess({ perm: 'self.service', module: HR, fromQuery: true })
  @Get('me/employee')
  async me(@CurrentOrg() org: OrgContext) {
    return ok(await this.hr.selfService(org));
  }
}
