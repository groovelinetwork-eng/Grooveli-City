import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiRequest, CurrentUser, OrgAccess } from '../auth/auth.decorators';
import { ok } from '../common/responses';
import { ZodPipe, zId } from '../common/zod';
import {
  AnalyticsQuery,
  ApplicationStatusBody,
  ApplicationsQuery,
  AssessmentCreate,
  AssessmentResultBody,
  InterviewCreate,
  InterviewPatch,
  InterviewsQuery,
  InviteTalentBody,
  JobInput,
  ShortlistCreate,
  ShortlistQuery,
  TalentQuery,
  VacancyQuery,
  zJobStatus,
} from './recruitment.schemas';
import { RecruitmentService } from './recruitment.service';

const VIEW = { perm: 'recruitment.view', module: 'recruitment' } as const;
const MANAGE = { perm: 'recruitment.manage', module: 'recruitment' } as const;
const idPipe = new ZodPipe(zId);
const StatusBody = z.object({ status: zJobStatus }).strict();
const actor = (user: User, req: ApiRequest) => ({ user, ip: req.ip });

@Controller('orgs/:orgId/recruitment')
export class RecruitmentController {
  constructor(private readonly rec: RecruitmentService) {}

  // ── Vacancies ────────────────────────────────────────────────────────────
  @OrgAccess(VIEW)
  @Get('vacancies')
  async vacancies(@Param('orgId') orgId: string, @Query(new ZodPipe(VacancyQuery)) q: z.infer<typeof VacancyQuery>) {
    return ok(await this.rec.vacancies(orgId, q, q));
  }

  @OrgAccess(MANAGE)
  @Post('vacancies')
  async createVacancy(@Param('orgId') orgId: string, @CurrentUser() user: User, @Body(new ZodPipe(JobInput)) body: z.infer<typeof JobInput>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.rec.createVacancy(orgId, body, actor(user, req)), 'Vacancy created');
  }

  @OrgAccess(MANAGE)
  @Put('vacancies/:jobId')
  async replaceVacancy(@Param('orgId') orgId: string, @Param('jobId', idPipe) jobId: string, @CurrentUser() user: User, @Body(new ZodPipe(JobInput)) body: z.infer<typeof JobInput>, @Req() req: ApiRequest) {
    return ok(await this.rec.replaceVacancy(orgId, jobId, body, actor(user, req)), 'Vacancy updated');
  }

  @OrgAccess(MANAGE)
  @Put('vacancies/:jobId/status')
  async setVacancyStatus(@Param('orgId') orgId: string, @Param('jobId', idPipe) jobId: string, @CurrentUser() user: User, @Body(new ZodPipe(StatusBody)) body: z.infer<typeof StatusBody>, @Req() req: ApiRequest) {
    return ok(await this.rec.setVacancyStatus(orgId, jobId, body.status, actor(user, req)));
  }

  @OrgAccess(MANAGE)
  @Delete('vacancies/:jobId')
  async deleteVacancy(@Param('orgId') orgId: string, @Param('jobId', idPipe) jobId: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    await this.rec.deleteVacancy(orgId, jobId, actor(user, req));
    return ok(null, 'Vacancy deleted');
  }

  // ── Applications ─────────────────────────────────────────────────────────
  @OrgAccess(VIEW)
  @Get('applications')
  async applications(@Param('orgId') orgId: string, @Query(new ZodPipe(ApplicationsQuery)) q: z.infer<typeof ApplicationsQuery>) {
    return ok(await this.rec.applications(orgId, q, q));
  }

  @OrgAccess(VIEW)
  @Get('applications/:applicationId/cv')
  async applicantCv(@Param('orgId') orgId: string, @Param('applicationId', idPipe) id: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    return ok(await this.rec.applicantCv(orgId, id, actor(user, req)));
  }

  @OrgAccess(MANAGE)
  @Post('applications/:applicationId/status')
  async setApplicationStatus(@Param('orgId') orgId: string, @Param('applicationId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(ApplicationStatusBody)) body: z.infer<typeof ApplicationStatusBody>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(200);
    return ok(await this.rec.setApplicationStatus(orgId, id, body.status, body.note, actor(user, req)));
  }

  // ── Interviews ───────────────────────────────────────────────────────────
  @OrgAccess(VIEW)
  @Get('interviews')
  async interviews(@Param('orgId') orgId: string, @Query(new ZodPipe(InterviewsQuery)) q: z.infer<typeof InterviewsQuery>) {
    return ok(await this.rec.interviews(orgId, q));
  }

  @OrgAccess(MANAGE)
  @Post('interviews')
  async schedule(@Param('orgId') orgId: string, @CurrentUser() user: User, @Body(new ZodPipe(InterviewCreate)) body: z.infer<typeof InterviewCreate>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.rec.scheduleInterview(orgId, body, actor(user, req)), 'Interview scheduled');
  }

  @OrgAccess(MANAGE)
  @Patch('interviews/:interviewId')
  async updateInterview(@Param('orgId') orgId: string, @Param('interviewId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(InterviewPatch)) body: z.infer<typeof InterviewPatch>, @Req() req: ApiRequest) {
    return ok(await this.rec.updateInterview(orgId, id, body, actor(user, req)));
  }

  // ── Talent ───────────────────────────────────────────────────────────────
  @OrgAccess(VIEW)
  @Get('talent')
  async talent(@Query(new ZodPipe(TalentQuery)) q: z.infer<typeof TalentQuery>) {
    return ok(await this.rec.talent(q, q));
  }

  @Throttle({ default: { limit: 100, ttl: 24 * 60 * 60_000 } })
  @OrgAccess(MANAGE)
  @Post('talent/:talentId/invitations')
  async inviteTalent(@Param('orgId') orgId: string, @Param('talentId', idPipe) talentId: string, @CurrentUser() user: User, @Body(new ZodPipe(InviteTalentBody)) body: z.infer<typeof InviteTalentBody>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.rec.inviteTalent(orgId, talentId, body.jobId, actor(user, req)), 'Candidate invited');
  }

  // ── Shortlists ───────────────────────────────────────────────────────────
  @OrgAccess(VIEW)
  @Get('shortlists')
  async shortlists(@Param('orgId') orgId: string, @Query(new ZodPipe(ShortlistQuery)) q: z.infer<typeof ShortlistQuery>) {
    return ok(await this.rec.shortlists(orgId, q.jobId));
  }

  @OrgAccess(MANAGE)
  @Post('shortlists')
  async createShortlist(@Param('orgId') orgId: string, @Body(new ZodPipe(ShortlistCreate)) body: z.infer<typeof ShortlistCreate>, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.rec.createShortlist(orgId, body), 'Shortlist created');
  }

  @OrgAccess(MANAGE)
  @Put('shortlists/:shortlistId/applications/:applicationId')
  async addToShortlist(@Param('orgId') orgId: string, @Param('shortlistId', idPipe) sid: string, @Param('applicationId', idPipe) aid: string) {
    return ok(await this.rec.shortlistMembership(orgId, sid, aid, true));
  }

  @OrgAccess(MANAGE)
  @Delete('shortlists/:shortlistId/applications/:applicationId')
  async removeFromShortlist(@Param('orgId') orgId: string, @Param('shortlistId', idPipe) sid: string, @Param('applicationId', idPipe) aid: string) {
    return ok(await this.rec.shortlistMembership(orgId, sid, aid, false));
  }

  // ── Assessments ──────────────────────────────────────────────────────────
  @OrgAccess(VIEW)
  @Get('assessments')
  async assessments(@Param('orgId') orgId: string, @Query(new ZodPipe(ShortlistQuery)) q: z.infer<typeof ShortlistQuery>) {
    return ok(await this.rec.assessments(orgId, q.jobId));
  }

  @OrgAccess(MANAGE)
  @Post('assessments')
  async createAssessment(@Param('orgId') orgId: string, @Body(new ZodPipe(AssessmentCreate)) body: z.infer<typeof AssessmentCreate>, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.rec.createAssessment(orgId, body), 'Assessment created');
  }

  @OrgAccess(MANAGE)
  @Post('assessments/:assessmentId/results')
  async recordResult(@Param('orgId') orgId: string, @Param('assessmentId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(AssessmentResultBody)) body: z.infer<typeof AssessmentResultBody>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(200);
    return ok(await this.rec.recordResult(orgId, id, body.applicationId, body.score, actor(user, req)));
  }

  // ── Analytics ────────────────────────────────────────────────────────────
  @OrgAccess(VIEW)
  @Get('analytics')
  async analytics(@Param('orgId') orgId: string, @Query(new ZodPipe(AnalyticsQuery)) q: z.infer<typeof AnalyticsQuery>) {
    return ok(await this.rec.analytics(orgId, q));
  }
}
