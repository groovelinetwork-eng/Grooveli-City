import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiRequest, CurrentOrg, CurrentUser, OrgAccess, OrgContext } from '../auth/auth.decorators';
import { PageQuery, zIsoDate } from '../common/pagination';
import { ok } from '../common/responses';
import { ZodPipe, zId } from '../common/zod';
import { EngagementService } from './engagement.service';

const PARTICIPATE = { perm: 'engagement.participate', module: 'engagement' } as const;
const MANAGE = { perm: 'engagement.manage', module: 'engagement' } as const;
const idPipe = new ZodPipe(zId);
/** Client-chosen IDs for PUT-upserts. */
const slugPipe = new ZodPipe(z.string().regex(/^[A-Za-z0-9_-]{3,64}$/, 'Use 3–64 letters, digits, - or _'));
const text = (max: number) => z.string().trim().max(max);
const actor = (user: User, req: ApiRequest) => ({ user, ip: req.ip });

const AnnouncementInput = z
  .object({
    title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(10000),
    audience: z.enum(['all', 'department', 'public-hq']), departmentId: zId.optional(), pinned: z.boolean(),
  })
  .strict();
const RecognitionInput = z.object({ toEmployeeId: zId, value: z.string().trim().min(1).max(60), message: z.string().trim().min(1).max(1000) }).strict();
const SurveyInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    status: z.enum(['draft', 'open', 'closed']),
    anonymous: z.boolean(),
    questions: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), text: z.string().trim().min(1).max(300), kind: z.enum(['scale', 'text']) }).strict()).min(1).max(50),
    closesOn: zIsoDate,
  })
  .strict();
const SurveyResponseInput = z.object({ answers: z.record(z.string().max(64), z.union([z.number(), text(2000)])) }).strict();
const FeedbackQuery = PageQuery.extend({ status: z.enum(['new', 'acknowledged', 'actioned']).optional(), category: z.enum(['idea', 'concern', 'praise', 'question']).optional() }).strict();
const FeedbackInput = z.object({ category: z.enum(['idea', 'concern', 'praise', 'question']), body: z.string().trim().min(5).max(5000), anonymous: z.boolean() }).strict();
const FeedbackStatus = z.object({ status: z.enum(['new', 'acknowledged', 'actioned']) }).strict();
const RangeQuery = z.object({ from: zIsoDate.optional(), to: zIsoDate.optional() }).strict();
const ActivityInput = z.object({ title: z.string().trim().min(1).max(120), date: zIsoDate, location: text(120), kind: z.enum(['social', 'learning', 'wellbeing', 'volunteering']) }).strict();
const InitiativeInput = z.object({ title: z.string().trim().min(1).max(120), owner: text(80), progress: z.number().int().min(0).max(100), status: z.enum(['planned', 'active', 'done']) }).strict();

@Controller('orgs/:orgId/engagement')
export class EngagementController {
  constructor(private readonly eng: EngagementService) {}

  // ── Announcements ────────────────────────────────────────────────────────
  @OrgAccess(PARTICIPATE)
  @Get('announcements')
  async announcements(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(PageQuery.strict())) q: PageQuery) {
    return ok(await this.eng.announcements(org, q));
  }

  @OrgAccess(MANAGE)
  @Post('announcements')
  async createAnnouncement(@Param('orgId') orgId: string, @CurrentUser() user: User, @Body(new ZodPipe(AnnouncementInput)) body: z.infer<typeof AnnouncementInput>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.eng.createAnnouncement(orgId, body, actor(user, req)), 'Announcement published');
  }

  @OrgAccess(MANAGE)
  @Put('announcements/:announcementId')
  async updateAnnouncement(@Param('orgId') orgId: string, @Param('announcementId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(AnnouncementInput)) body: z.infer<typeof AnnouncementInput>, @Req() req: ApiRequest) {
    return ok(await this.eng.updateAnnouncement(orgId, id, body, actor(user, req)));
  }

  @OrgAccess(MANAGE)
  @Delete('announcements/:announcementId')
  async deleteAnnouncement(@Param('orgId') orgId: string, @Param('announcementId', idPipe) id: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    await this.eng.deleteAnnouncement(orgId, id, actor(user, req));
    return ok(null, 'Announcement deleted');
  }

  // ── Recognition ──────────────────────────────────────────────────────────
  @OrgAccess(PARTICIPATE)
  @Get('recognition')
  async recognition(@Param('orgId') orgId: string, @Query(new ZodPipe(PageQuery.strict())) q: PageQuery) {
    return ok(await this.eng.recognition(orgId, q));
  }

  @Throttle({ default: { limit: 20, ttl: 24 * 60 * 60_000 } })
  @OrgAccess(PARTICIPATE)
  @Post('recognition')
  async giveRecognition(@CurrentOrg() org: OrgContext, @CurrentUser() user: User, @Body(new ZodPipe(RecognitionInput)) body: z.infer<typeof RecognitionInput>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.eng.giveRecognition(org, body, actor(user, req)), 'Recognition sent');
  }

  @OrgAccess(PARTICIPATE)
  @HttpCode(200)
  @Post('recognition/:recognitionId/reactions')
  async react(@Param('orgId') orgId: string, @Param('recognitionId', idPipe) id: string, @CurrentUser() user: User) {
    return ok(await this.eng.react(orgId, id, user.id));
  }

  // ── Surveys ──────────────────────────────────────────────────────────────
  @OrgAccess(PARTICIPATE)
  @Get('surveys')
  async surveys(@CurrentOrg() org: OrgContext) {
    return ok(await this.eng.surveys(org));
  }

  @OrgAccess(MANAGE)
  @Put('surveys/:surveyId')
  async upsertSurvey(@CurrentOrg() org: OrgContext, @Param('surveyId', slugPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(SurveyInput)) body: z.infer<typeof SurveyInput>, @Req() req: ApiRequest) {
    return ok(await this.eng.upsertSurvey(org, id, body, actor(user, req)));
  }

  @OrgAccess(PARTICIPATE)
  @Post('surveys/:surveyId/responses')
  async respond(@CurrentOrg() org: OrgContext, @Param('surveyId', slugPipe) id: string, @Body(new ZodPipe(SurveyResponseInput)) body: z.infer<typeof SurveyResponseInput>, @Res({ passthrough: true }) res: Response) {
    await this.eng.respond(org, id, body.answers);
    res.status(201);
    return ok(null, 'Thanks for answering');
  }

  // ── Feedback ─────────────────────────────────────────────────────────────
  @OrgAccess({ ...PARTICIPATE, perm: ['engagement.manage', 'engagement.participate'] })
  @Get('feedback')
  async feedback(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(FeedbackQuery)) q: z.infer<typeof FeedbackQuery>) {
    return ok(await this.eng.feedback(org, q, q));
  }

  @Throttle({ default: { limit: 10, ttl: 24 * 60 * 60_000 } })
  @OrgAccess(PARTICIPATE)
  @Post('feedback')
  async submitFeedback(@CurrentOrg() org: OrgContext, @CurrentUser() user: User, @Body(new ZodPipe(FeedbackInput)) body: z.infer<typeof FeedbackInput>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.eng.submitFeedback(org, body, actor(user, req)), 'Feedback sent');
  }

  @OrgAccess(MANAGE)
  @Put('feedback/:feedbackId/status')
  async setFeedbackStatus(@CurrentOrg() org: OrgContext, @Param('feedbackId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(FeedbackStatus)) body: z.infer<typeof FeedbackStatus>, @Req() req: ApiRequest) {
    return ok(await this.eng.setFeedbackStatus(org, id, body.status, actor(user, req)));
  }

  // ── Activities ───────────────────────────────────────────────────────────
  @OrgAccess(PARTICIPATE)
  @Get('activities')
  async activities(@Param('orgId') orgId: string, @Query(new ZodPipe(RangeQuery)) q: z.infer<typeof RangeQuery>) {
    return ok(await this.eng.activities(orgId, q));
  }

  @OrgAccess(MANAGE)
  @Put('activities/:activityId')
  async upsertActivity(@Param('orgId') orgId: string, @Param('activityId', slugPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(ActivityInput)) body: z.infer<typeof ActivityInput>, @Req() req: ApiRequest) {
    return ok(await this.eng.upsertActivity(orgId, id, body, actor(user, req)));
  }

  @OrgAccess(PARTICIPATE)
  @Put('activities/:activityId/rsvps/me')
  async rsvp(@CurrentOrg() org: OrgContext, @Param('activityId', slugPipe) id: string) {
    return ok(await this.eng.rsvp(org, id, true));
  }

  @OrgAccess(PARTICIPATE)
  @Delete('activities/:activityId/rsvps/me')
  async cancelRsvp(@CurrentOrg() org: OrgContext, @Param('activityId', slugPipe) id: string) {
    return ok(await this.eng.rsvp(org, id, false));
  }

  // ── Culture initiatives ──────────────────────────────────────────────────
  @OrgAccess(PARTICIPATE)
  @Get('initiatives')
  async initiatives(@Param('orgId') orgId: string) {
    return ok(await this.eng.initiatives(orgId));
  }

  @OrgAccess(MANAGE)
  @Put('initiatives/:initiativeId')
  async upsertInitiative(@Param('orgId') orgId: string, @Param('initiativeId', slugPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(InitiativeInput)) body: z.infer<typeof InitiativeInput>, @Req() req: ApiRequest) {
    return ok(await this.eng.upsertInitiative(orgId, id, body, actor(user, req)));
  }
}
