import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiRequest, CurrentOrg, CurrentUser, OptionalAuth, OrgAccess, OrgContext, PlatformAdmin, Public } from '../auth/auth.decorators';
import { PageQuery, zIsoDate } from '../common/pagination';
import { ok } from '../common/responses';
import { ZodPipe, zId } from '../common/zod';
import { zDistrict } from '../orgs/org.schemas';
import { MessagesService } from './messages.service';
import { ModerationService } from './moderation.service';
import { SocialService } from './social.service';

const DAY = 24 * 60 * 60_000;
const HOUR = 60 * 60_000;
const idPipe = new ZodPipe(zId);
const text = (max: number) => z.string().trim().max(max);
const actor = (user: User, req: ApiRequest) => ({ user, ip: req.ip });
const zKind = z.enum(['career-fair', 'meetup', 'workshop', 'social', 'conference']);
const iso = z.string().datetime({ offset: true });

const EventsQuery = PageQuery.extend({ district: zDistrict.optional(), kind: zKind.optional(), from: zIsoDate.optional(), to: zIsoDate.optional() }).strict();
const SearchQuery = PageQuery.extend({ district: zDistrict.optional(), q: z.string().trim().min(1).max(100).optional() }).strict();
const PostBody = z.object({ text: z.string().trim().min(1).max(2000) }).strict();
const ProfileBody = z.object({ profileId: zId }).strict();
const AcceptBody = z.object({ accept: z.boolean() }).strict();
const ReportBody = z
  .object({
    targetType: z.enum(['profile', 'community-post', 'organization', 'job', 'event', 'message']).optional(),
    targetId: zId,
    reason: z.enum(['spam', 'harassment', 'hate', 'scam', 'impersonation', 'inappropriate', 'other']),
    details: text(2000).optional(),
  })
  .strict();
const EventFields = {
  title: z.string().trim().min(1).max(120), kind: zKind, district: zDistrict, venue: z.string().trim().min(1).max(120),
  start: iso, end: iso, description: text(5000), capacity: z.number().int().min(1).max(100_000),
  tags: z.array(z.string().trim().min(1).max(30)).max(10), communityId: zId.nullable().optional(),
};
const PlatformEventBody = z.object({ ...EventFields, host: z.string().trim().min(1).max(120) }).strict();
const OrgEventBody = z.object(EventFields).strict();
const EventPatch = z.object(EventFields).partial().strict().refine((v) => Object.keys(v).length > 0, 'Send at least one field');
const CommunityBody = z.object({ name: z.string().trim().min(1).max(80), description: text(1000), topic: text(80), district: zDistrict }).strict();
const CommunityPatch = CommunityBody.partial().extend({ archived: z.boolean().optional() }).strict().refine((v) => Object.keys(v).length > 0, 'Send at least one field');
const MessagesQuery = PageQuery.extend({ before: iso.optional() }).strict();
const MessageBody = z.object({ text: z.string().trim().min(1).max(4000) }).strict();
const ReportsQuery = PageQuery.extend({ status: z.enum(['open', 'actioned', 'dismissed']).optional(), targetType: z.string().max(30).optional() }).strict();
const ResolutionBody = z.object({ action: z.enum(['dismiss', 'remove-content', 'warn-user', 'suspend-user']), note: text(1000).optional() }).strict();
const SuspensionBody = z.object({ suspended: z.boolean(), note: text(1000).optional() }).strict();
const zIdempotencyKey = z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional();

@Controller()
export class SocialController {
  constructor(private readonly social: SocialService) {}

  // ── Events ───────────────────────────────────────────────────────────────
  @Public()
  @Get('social/events')
  async events(@Query(new ZodPipe(EventsQuery)) q: z.infer<typeof EventsQuery>, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return ok(await this.social.events(q, q));
  }

  @OptionalAuth()
  @Get('social/events/:eventId')
  async event(@Param('eventId', idPipe) id: string, @CurrentUser() user?: User) {
    return ok(await this.social.eventDetail(id, user?.id));
  }

  @Put('me/events/:eventId/rsvp')
  async rsvp(@CurrentUser() user: User, @Param('eventId', idPipe) id: string) {
    return ok(await this.social.rsvp(user.id, id, true));
  }

  @Delete('me/events/:eventId/rsvp')
  async cancelRsvp(@CurrentUser() user: User, @Param('eventId', idPipe) id: string) {
    return ok(await this.social.rsvp(user.id, id, false));
  }

  // ── Communities ──────────────────────────────────────────────────────────
  @OptionalAuth()
  @Get('social/communities')
  async communities(@Query(new ZodPipe(SearchQuery)) q: z.infer<typeof SearchQuery>, @CurrentUser() user?: User) {
    return ok(await this.social.communities(q, q, user?.id));
  }

  @OptionalAuth()
  @Get('social/communities/:communityId')
  async community(@Param('communityId', idPipe) id: string, @CurrentUser() user?: User) {
    return ok(await this.social.communityDetail(id, user?.id));
  }

  @Put('me/communities/:communityId')
  async join(@CurrentUser() user: User, @Param('communityId', idPipe) id: string) {
    return ok(await this.social.setMembership(user.id, id, true));
  }

  @Delete('me/communities/:communityId')
  async leave(@CurrentUser() user: User, @Param('communityId', idPipe) id: string) {
    return ok(await this.social.setMembership(user.id, id, false));
  }

  @OptionalAuth()
  @Get('social/communities/:communityId/posts')
  async posts(@Param('communityId', idPipe) id: string, @Query(new ZodPipe(PageQuery.strict())) q: PageQuery, @CurrentUser() user?: User) {
    return ok(await this.social.posts(id, q, user?.id));
  }

  @Throttle({ default: { limit: 30, ttl: HOUR } })
  @Post('social/communities/:communityId/posts')
  async createPost(@CurrentUser() user: User, @Param('communityId', idPipe) id: string, @Body(new ZodPipe(PostBody)) body: z.infer<typeof PostBody>, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.social.createPost(user, id, body.text), 'Posted');
  }

  @Delete('social/communities/:communityId/posts/:postId')
  async deletePost(@CurrentUser() user: User, @Param('communityId', idPipe) id: string, @Param('postId', idPipe) postId: string) {
    await this.social.deletePost(user, id, postId);
    return ok(null, 'Post deleted');
  }

  // ── People & connections ─────────────────────────────────────────────────
  @Get('social/people')
  async people(@CurrentUser() user: User, @Query(new ZodPipe(SearchQuery)) q: z.infer<typeof SearchQuery>) {
    return ok(await this.social.people(user.id, q, q));
  }

  @Get('me/connections')
  async connections(@CurrentUser() user: User) {
    return ok(await this.social.connections(user.id));
  }

  @Throttle({ default: { limit: 50, ttl: DAY } })
  @Post('me/connections')
  async connect(@CurrentUser() user: User, @Body(new ZodPipe(ProfileBody)) body: z.infer<typeof ProfileBody>, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.social.connect(user, body.profileId));
  }

  @Delete('me/connections/:profileId')
  async disconnect(@CurrentUser() user: User, @Param('profileId', idPipe) id: string) {
    await this.social.disconnect(user.id, id);
    return ok(null);
  }

  // ── Invitations, blocks, reports ─────────────────────────────────────────
  @Get('me/invitations')
  async invitations(@CurrentUser() user: User) {
    return ok(await this.social.invitations(user.id));
  }

  @Throttle({ default: { limit: 50, ttl: DAY } })
  @Post('social/events/:eventId/invitations')
  async invite(@CurrentUser() user: User, @Param('eventId', idPipe) id: string, @Body(new ZodPipe(ProfileBody)) body: z.infer<typeof ProfileBody>, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.social.invite(user, id, body.profileId), 'Invitation sent');
  }

  @HttpCode(200)
  @Post('me/invitations/:invitationId/response')
  async respond(@CurrentUser() user: User, @Param('invitationId', idPipe) id: string, @Body(new ZodPipe(AcceptBody)) body: z.infer<typeof AcceptBody>) {
    await this.social.respond(user.id, id, body.accept);
    return ok(null);
  }

  @Put('me/blocks/:profileId')
  async block(@CurrentUser() user: User, @Param('profileId', idPipe) id: string) {
    await this.social.block(user.id, id);
    return ok(null, 'Blocked');
  }

  @Delete('me/blocks/:profileId')
  async unblock(@CurrentUser() user: User, @Param('profileId', idPipe) id: string) {
    await this.social.unblock(user.id, id);
    return ok(null, 'Unblocked');
  }

  @Throttle({ default: { limit: 20, ttl: DAY } })
  @Post('reports')
  async report(@CurrentUser() user: User, @Body(new ZodPipe(ReportBody)) body: z.infer<typeof ReportBody>, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.social.report(user, body), 'Report received');
  }

  // ── Organisation-hosted events [added] ───────────────────────────────────
  @OrgAccess({ perm: 'org.settings.manage' })
  @Post('orgs/:orgId/events')
  async createOrgEvent(@CurrentOrg() org: OrgContext, @CurrentUser() user: User, @Body(new ZodPipe(OrgEventBody)) body: z.infer<typeof OrgEventBody>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.social.createEvent(body, { name: org.organization.name, organizationId: org.organization.id }, actor(user, req)), 'Event created');
  }

  @OrgAccess({ perm: 'org.settings.manage' })
  @Patch('orgs/:orgId/events/:eventId')
  async updateOrgEvent(@CurrentOrg() org: OrgContext, @Param('eventId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(EventPatch)) body: z.infer<typeof EventPatch>, @Req() req: ApiRequest) {
    return ok(await this.social.updateEvent(id, body, org.organization.id, actor(user, req)));
  }

  @OrgAccess({ perm: 'org.settings.manage' })
  @Delete('orgs/:orgId/events/:eventId')
  async cancelOrgEvent(@CurrentOrg() org: OrgContext, @Param('eventId', idPipe) id: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    await this.social.cancelEvent(id, org.organization.id, actor(user, req));
    return ok(null, 'Event cancelled');
  }

  // ── Platform: events & communities [added] ───────────────────────────────
  @PlatformAdmin()
  @Post('platform/events')
  async createPlatformEvent(@CurrentUser() user: User, @Body(new ZodPipe(PlatformEventBody)) body: z.infer<typeof PlatformEventBody>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.social.createEvent(body, { name: body.host }, actor(user, req)), 'Event created');
  }

  @PlatformAdmin()
  @Patch('platform/events/:eventId')
  async updatePlatformEvent(@Param('eventId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(EventPatch)) body: z.infer<typeof EventPatch>, @Req() req: ApiRequest) {
    return ok(await this.social.updateEvent(id, body, null, actor(user, req)));
  }

  @PlatformAdmin()
  @Delete('platform/events/:eventId')
  async cancelPlatformEvent(@Param('eventId', idPipe) id: string, @CurrentUser() user: User, @Req() req: ApiRequest) {
    await this.social.cancelEvent(id, null, actor(user, req));
    return ok(null, 'Event cancelled');
  }

  @PlatformAdmin()
  @Post('platform/communities')
  async createCommunity(@CurrentUser() user: User, @Body(new ZodPipe(CommunityBody)) body: z.infer<typeof CommunityBody>, @Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.social.createCommunity(body, actor(user, req)), 'Community created');
  }

  @PlatformAdmin()
  @Patch('platform/communities/:communityId')
  async updateCommunity(@Param('communityId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(CommunityPatch)) body: z.infer<typeof CommunityPatch>, @Req() req: ApiRequest) {
    return ok(await this.social.updateCommunity(id, body, actor(user, req)));
  }
}

@Controller('me/conversations')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  async list(@CurrentUser() user: User, @Query(new ZodPipe(PageQuery.strict())) q: PageQuery) {
    return ok(await this.messages.list(user.id, q));
  }

  @Throttle({ default: { limit: 30, ttl: DAY } })
  @Post()
  async start(@CurrentUser() user: User, @Body(new ZodPipe(ProfileBody)) body: z.infer<typeof ProfileBody>, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return ok(await this.messages.start(user, body.profileId));
  }

  @Get(':conversationId/messages')
  async messagesPage(@CurrentUser() user: User, @Param('conversationId', idPipe) id: string, @Query(new ZodPipe(MessagesQuery)) q: z.infer<typeof MessagesQuery>) {
    return ok(await this.messages.messages(user.id, id, q, q.before));
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post(':conversationId/messages')
  async send(
    @CurrentUser() user: User,
    @Param('conversationId', idPipe) id: string,
    @Body(new ZodPipe(MessageBody)) body: z.infer<typeof MessageBody>,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = rawKey === undefined ? undefined : new ZodPipe(zIdempotencyKey).transform(rawKey);
    res.status(201);
    return ok(await this.messages.send(user, id, body.text, key));
  }

  @HttpCode(200)
  @Post(':conversationId/read')
  async read(@CurrentUser() user: User, @Param('conversationId', idPipe) id: string) {
    await this.messages.markRead(user.id, id);
    return ok(null);
  }
}

@PlatformAdmin()
@Controller('platform')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('reports')
  async reports(@Query(new ZodPipe(ReportsQuery)) q: z.infer<typeof ReportsQuery>) {
    return ok(await this.moderation.list(q, q));
  }

  @HttpCode(200)
  @Post('reports/:reportId/resolution')
  async resolve(@Param('reportId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(ResolutionBody)) body: z.infer<typeof ResolutionBody>, @Req() req: ApiRequest) {
    return ok(await this.moderation.resolve(id, body.action, body.note, actor(user, req)));
  }

  @Put('users/:userId/suspension')
  async suspend(@Param('userId', idPipe) id: string, @CurrentUser() user: User, @Body(new ZodPipe(SuspensionBody)) body: z.infer<typeof SuspensionBody>, @Req() req: ApiRequest) {
    return ok(await this.moderation.setSuspended(id, body.suspended, body.note, actor(user, req)));
  }
}
