import { HttpStatus, Injectable } from '@nestjs/common';
import { CandidateProfile, CityEvent, Prisma, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_AVATAR } from '../candidate/profile';
import { ApiError } from '../common/api-exception.filter';
import { PageQuery, skipTake, toPage } from '../common/pagination';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertAcceptableText } from './content-filter';

type Actor = { user: User; ip?: string };
const POSTS_IN_COMMUNITY = 20;

export interface EventInput {
  title: string; kind: string; district: string; venue: string; start: string; end: string;
  host?: string; description: string; capacity: number; tags: string[]; communityId?: string | null;
}

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  // ── Relationship helpers (shared with messages) ──────────────────────────
  async isBlocked(a: string, b: string) {
    return !!(await this.prisma.block.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] } }));
  }

  async areConnected(a: string, b: string) {
    return !!(await this.prisma.connection.findFirst({ where: { status: 'connected', OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] } }));
  }

  /** IDs hidden from `userId` because of a block in either direction. */
  async blockedIds(userId: string) {
    const rows = await this.prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
    return rows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId));
  }

  /** Does `to`'s setting let `from` reach them? Blocks always say no. */
  async allows(setting: 'everyone' | 'connections' | 'nobody', from: string, to: string) {
    if (from === to || (await this.isBlocked(from, to))) return false;
    if (setting === 'everyone') return true;
    if (setting === 'connections') return this.areConnected(from, to);
    return false;
  }

  async activeUser(userId: string) {
    const u = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null, suspendedAt: null }, include: { candidateProfile: true } });
    if (!u) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Person not found');
    return u;
  }

  socialProfile(u: Pick<User, 'id' | 'displayName'> & { candidateProfile: CandidateProfile | null }) {
    const p = u.candidateProfile;
    return {
      id: u.id,
      name: u.displayName,
      headline: p?.headline ?? '',
      district: p?.homeDistrict ?? 'plaza',
      avatar: (p?.avatar as object) ?? DEFAULT_AVATAR,
      interests: p?.interests ?? [],
    };
  }

  // ── Events ───────────────────────────────────────────────────────────────
  private async toApiEvent(e: CityEvent) {
    const attendeeCount = await this.prisma.eventAttendee.count({ where: { eventId: e.id } });
    return {
      id: e.id, title: e.title, kind: e.kind, district: e.district, venue: e.venue, start: e.start.toISOString(), end: e.end.toISOString(),
      host: e.host, ...(e.hostOrganizationId ? { hostOrganizationId: e.hostOrganizationId } : {}), description: e.description,
      capacity: e.capacity, attendeeCount, tags: e.tags, ...(e.communityId ? { communityId: e.communityId } : {}),
    };
  }

  async events(q: { district?: string; kind?: string; from?: string; to?: string }, page: PageQuery) {
    const from = q.from ? new Date(`${q.from}T00:00:00Z`) : new Date();
    const where: Prisma.CityEventWhereInput = {
      cancelledAt: null,
      end: { gte: from },
      ...(q.to ? { start: { lte: new Date(`${q.to}T23:59:59.999Z`) } } : {}),
      ...(q.district ? { district: q.district } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.cityEvent.findMany({ where, orderBy: [{ start: 'asc' }, { id: 'asc' }], ...skipTake(page) }),
      this.prisma.cityEvent.count({ where }),
    ]);
    return toPage(await Promise.all(rows.map((e) => this.toApiEvent(e))), total, page);
  }

  private async event(eventId: string) {
    const e = await this.prisma.cityEvent.findFirst({ where: { id: eventId, cancelledAt: null } });
    if (!e) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Event not found');
    return e;
  }

  async eventDetail(eventId: string, viewerId?: string) {
    const e = await this.event(eventId);
    const hidden = new Set(viewerId ? await this.blockedIds(viewerId) : []);
    const rows = await this.prisma.eventAttendee.findMany({ where: { eventId }, orderBy: { at: 'asc' }, take: 500 });
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) }, deletedAt: null, suspendedAt: null },
      include: { candidateProfile: { select: { showInEventAttendees: true } } },
    });
    const visible = users.filter((u) => (u.candidateProfile?.showInEventAttendees ?? true) && !hidden.has(u.id));
    return {
      ...(await this.toApiEvent(e)),
      attendees: visible.map((u) => ({ id: u.id, name: u.displayName })),
      ...(viewerId ? { attendingByMe: rows.some((r) => r.userId === viewerId) } : {}),
    };
  }

  async rsvp(userId: string, eventId: string, attending: boolean) {
    const e = await this.event(eventId);
    if (!attending) {
      await this.prisma.eventAttendee.deleteMany({ where: { eventId, userId } });
      return { attending: false };
    }
    if (e.end <= new Date()) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This event has ended');
    await this.prisma.$transaction(async (tx) => {
      // Lock the event row so two last-seat RSVPs can't both get in.
      await tx.$queryRaw`SELECT id FROM "CityEvent" WHERE id = ${eventId} FOR UPDATE`;
      if (await tx.eventAttendee.findUnique({ where: { eventId_userId: { eventId, userId } } })) return;
      const count = await tx.eventAttendee.count({ where: { eventId } });
      if (count >= e.capacity) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This event is full');
      await tx.eventAttendee.create({ data: { eventId, userId } });
    });
    return { attending: true };
  }

  async createEvent(input: EventInput, host: { name: string; organizationId?: string }, actor: Actor) {
    this.assertEventTimes(input.start, input.end);
    if (input.communityId && !(await this.prisma.community.findFirst({ where: { id: input.communityId, archivedAt: null } }))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Unknown community', { communityId: 'Not found' });
    }
    const e = await this.prisma.cityEvent.create({
      data: {
        title: input.title, kind: input.kind, district: input.district, venue: input.venue, start: new Date(input.start), end: new Date(input.end),
        host: input.host ?? host.name, hostOrganizationId: host.organizationId ?? null, description: input.description, capacity: input.capacity,
        tags: input.tags, communityId: input.communityId ?? null, createdById: actor.user.id,
      },
    });
    await this.audit.record({ action: 'event.created', targetType: 'event', targetId: e.id, actorId: actor.user.id, organizationId: host.organizationId ?? null, ip: actor.ip });
    return this.toApiEvent(e);
  }

  private assertEventTimes(start: string, end: string) {
    if (new Date(end) <= new Date(start)) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'End must be after start', { end: 'Before start' });
    if (new Date(start) <= new Date()) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Start must be in the future', { start: 'In the past' });
  }

  async updateEvent(eventId: string, patch: Partial<EventInput>, organizationId: string | null, actor: Actor) {
    const e = await this.event(eventId);
    if (organizationId !== null && e.hostOrganizationId !== organizationId) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Event not found');
    if (patch.start || patch.end) this.assertEventTimes(patch.start ?? e.start.toISOString(), patch.end ?? e.end.toISOString());
    if (patch.capacity !== undefined && patch.capacity < (await this.prisma.eventAttendee.count({ where: { eventId } }))) {
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Capacity is below the number of people attending');
    }
    const updated = await this.prisma.cityEvent.update({
      where: { id: eventId },
      data: { ...patch, ...(patch.start ? { start: new Date(patch.start) } : {}), ...(patch.end ? { end: new Date(patch.end) } : {}) } as Prisma.CityEventUpdateInput,
    });
    await this.audit.record({ action: 'event.updated', targetType: 'event', targetId: eventId, actorId: actor.user.id, organizationId, ip: actor.ip });
    return this.toApiEvent(updated);
  }

  async cancelEvent(eventId: string, organizationId: string | null, actor: Actor) {
    const e = await this.event(eventId);
    if (organizationId !== null && e.hostOrganizationId !== organizationId) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Event not found');
    await this.prisma.cityEvent.update({ where: { id: eventId }, data: { cancelledAt: new Date() } });
    const attendees = await this.prisma.eventAttendee.findMany({ where: { eventId } });
    for (const a of attendees) await this.notifications.notify(a.userId, { kind: 'social', title: 'Event cancelled', body: `${e.title} has been cancelled.` });
    await this.prisma.eventInvitation.updateMany({ where: { eventId, status: 'pending' }, data: { status: 'cancelled' } });
    await this.audit.record({ action: 'event.cancelled', targetType: 'event', targetId: eventId, actorId: actor.user.id, organizationId, ip: actor.ip });
  }

  // ── Communities ──────────────────────────────────────────────────────────
  private async community(communityId: string) {
    const c = await this.prisma.community.findFirst({ where: { id: communityId, archivedAt: null } });
    if (!c) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Community not found');
    return c;
  }

  private async postsFor(communityId: string, viewerId: string | undefined, take: number, skip = 0) {
    const hidden = viewerId ? await this.blockedIds(viewerId) : [];
    const where: Prisma.CommunityPostWhereInput = { communityId, removedAt: null, ...(hidden.length ? { authorId: { notIn: hidden } } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.communityPost.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      this.prisma.communityPost.count({ where }),
    ]);
    return { posts: rows.map((p) => ({ id: p.id, author: p.authorName, text: p.text, at: p.createdAt.toISOString() })), total };
  }

  private async toApiCommunity(c: { id: string; name: string; description: string; topic: string; district: string }, viewerId?: string) {
    const [members, joined, { posts }] = await Promise.all([
      this.prisma.communityMember.count({ where: { communityId: c.id } }),
      viewerId ? this.prisma.communityMember.findUnique({ where: { communityId_userId: { communityId: c.id, userId: viewerId } } }) : null,
      this.postsFor(c.id, viewerId, POSTS_IN_COMMUNITY),
    ]);
    return { id: c.id, name: c.name, description: c.description, topic: c.topic, members, district: c.district, posts, ...(viewerId ? { joinedByMe: !!joined } : {}) };
  }

  async communities(q: { district?: string; q?: string }, page: PageQuery, viewerId?: string) {
    const where: Prisma.CommunityWhereInput = {
      archivedAt: null,
      ...(q.district ? { district: q.district } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { topic: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.community.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...skipTake(page) }),
      this.prisma.community.count({ where }),
    ]);
    return toPage(await Promise.all(rows.map((c) => this.toApiCommunity(c, viewerId))), total, page);
  }

  async communityDetail(communityId: string, viewerId?: string) {
    return this.toApiCommunity(await this.community(communityId), viewerId);
  }

  async setMembership(userId: string, communityId: string, joined: boolean) {
    await this.community(communityId);
    if (joined) {
      await this.prisma.communityMember.upsert({ where: { communityId_userId: { communityId, userId } }, create: { communityId, userId }, update: {} });
    } else {
      await this.prisma.communityMember.deleteMany({ where: { communityId, userId } });
    }
    return { joined };
  }

  async posts(communityId: string, page: PageQuery, viewerId?: string) {
    await this.community(communityId);
    const { posts, total } = await this.postsFor(communityId, viewerId, page.pageSize, (page.page - 1) * page.pageSize);
    return toPage(posts, total, page);
  }

  async createPost(user: User, communityId: string, text: string) {
    await this.community(communityId);
    if (!(await this.prisma.communityMember.findUnique({ where: { communityId_userId: { communityId, userId: user.id } } }))) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Join the community to post');
    }
    assertAcceptableText(text);
    const p = await this.prisma.communityPost.create({ data: { communityId, authorId: user.id, authorName: user.displayName, text } });
    return { id: p.id, author: p.authorName, text: p.text, at: p.createdAt.toISOString() };
  }

  async deletePost(user: User, communityId: string, postId: string) {
    const p = await this.prisma.communityPost.findFirst({ where: { id: postId, communityId, removedAt: null } });
    if (!p) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Post not found');
    if (p.authorId !== user.id && user.platformRole !== 'admin') throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Only the author or a moderator can delete this post');
    await this.prisma.communityPost.update({ where: { id: postId }, data: { removedAt: new Date(), removedBy: user.id } });
  }

  async createCommunity(input: { name: string; description: string; topic: string; district: string }, actor: Actor) {
    const c = await this.prisma.community.create({ data: input });
    await this.audit.record({ action: 'community.created', targetType: 'community', targetId: c.id, actorId: actor.user.id, ip: actor.ip });
    return this.toApiCommunity(c);
  }

  async updateCommunity(id: string, patch: { name?: string; description?: string; topic?: string; district?: string; archived?: boolean }, actor: Actor) {
    const existing = await this.prisma.community.findUnique({ where: { id } });
    if (!existing) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Community not found');
    const { archived, ...rest } = patch;
    const c = await this.prisma.community.update({ where: { id }, data: { ...rest, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) } });
    await this.audit.record({ action: 'community.updated', targetType: 'community', targetId: id, actorId: actor.user.id, ip: actor.ip });
    return this.toApiCommunity(c);
  }

  // ── People & connections ─────────────────────────────────────────────────
  async people(viewerId: string, q: { district?: string; q?: string }, page: PageQuery) {
    const hidden = await this.blockedIds(viewerId);
    const where: Prisma.UserWhereInput = {
      id: { notIn: [viewerId, ...hidden] },
      deletedAt: null,
      suspendedAt: null,
      candidateProfile: { profileDiscoverable: true, ...(q.district ? { homeDistrict: q.district } : {}) },
      ...(q.q ? { OR: [{ displayName: { contains: q.q, mode: 'insensitive' } }, { candidateProfile: { headline: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, include: { candidateProfile: true }, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], ...skipTake(page) }),
      this.prisma.user.count({ where }),
    ]);
    return toPage(rows.map((u) => this.socialProfile(u)), total, page);
  }

  async connections(userId: string) {
    const rows = await this.prisma.connection.findMany({ where: { OR: [{ requesterId: userId }, { addresseeId: userId }] }, orderBy: { createdAt: 'desc' }, take: 5000 });
    return rows.map((c) => ({
      profileId: c.requesterId === userId ? c.addresseeId : c.requesterId,
      status: c.status as 'pending' | 'connected',
      direction: c.requesterId === userId ? ('sent' as const) : ('received' as const),
    }));
  }

  async connect(user: User, profileId: string) {
    if (profileId === user.id) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'You cannot connect with yourself', { profileId: 'Yourself' });
    // Blocked either way looks the same as "not found".
    if (await this.isBlocked(user.id, profileId)) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Person not found');
    await this.activeUser(profileId);

    const incoming = await this.prisma.connection.findUnique({ where: { requesterId_addresseeId: { requesterId: profileId, addresseeId: user.id } } });
    if (incoming?.status === 'pending') {
      await this.prisma.connection.update({ where: { requesterId_addresseeId: { requesterId: profileId, addresseeId: user.id } }, data: { status: 'connected', respondedAt: new Date() } });
      await this.notifications.notify(profileId, { kind: 'social', title: 'Connection accepted', body: `${user.displayName} accepted your connection request.`, href: '/social/people' });
      return { profileId, status: 'connected' as const };
    }
    if (incoming?.status === 'connected') throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'You are already connected');
    try {
      await this.prisma.connection.create({ data: { requesterId: user.id, addresseeId: profileId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'Request already sent');
      throw err;
    }
    await this.notifications.notify(profileId, { kind: 'social', title: 'New connection request', body: `${user.displayName} wants to connect.`, href: '/social/people' });
    return { profileId, status: 'pending' as const };
  }

  async disconnect(userId: string, profileId: string) {
    await this.prisma.connection.deleteMany({
      where: { OR: [{ requesterId: userId, addresseeId: profileId }, { requesterId: profileId, addresseeId: userId }] },
    });
  }

  // ── Event invitations ────────────────────────────────────────────────────
  async invitations(userId: string) {
    const rows = await this.prisma.eventInvitation.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }], status: { not: 'cancelled' } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: rows.flatMap((r) => [r.fromUserId, r.toUserId]) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    return rows.map((r) => ({
      id: r.id, eventId: r.eventId, fromName: names.get(r.fromUserId) ?? '', toName: names.get(r.toUserId) ?? '',
      status: r.status as 'pending' | 'accepted' | 'declined', direction: r.fromUserId === userId ? ('sent' as const) : ('received' as const),
    }));
  }

  async invite(user: User, eventId: string, profileId: string) {
    const e = await this.event(eventId);
    if (e.end <= new Date()) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This event has ended');
    const to = await this.activeUser(profileId);
    const setting = to.candidateProfile?.allowInvitations ?? 'everyone';
    // One answer for "blocked", "nobody" and "connections only": we never say which.
    if (!(await this.allows(setting, user.id, profileId))) throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'This person is not accepting invitations from you');
    const existing = await this.prisma.eventInvitation.findFirst({ where: { eventId, fromUserId: user.id, toUserId: profileId, status: 'pending' } });
    if (existing) throw new ApiError(HttpStatus.CONFLICT, 'CONFLICT', 'Invitation already sent');
    const inv = await this.prisma.eventInvitation.create({ data: { eventId, fromUserId: user.id, toUserId: profileId } });
    await this.notifications.notify(profileId, { kind: 'social', title: 'Event invitation', body: `${user.displayName} invited you to ${e.title}.`, href: '/social/invitations' });
    return { invitationId: inv.id };
  }

  async respond(userId: string, invitationId: string, accept: boolean) {
    const inv = await this.prisma.eventInvitation.findFirst({ where: { id: invitationId, toUserId: userId } });
    if (!inv) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Invitation not found');
    if (inv.status !== 'pending') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', `Already ${inv.status}`);
    if (accept) await this.rsvp(userId, inv.eventId, true);
    await this.prisma.eventInvitation.update({ where: { id: inv.id }, data: { status: accept ? 'accepted' : 'declined', respondedAt: new Date() } });
  }

  // ── Blocks ───────────────────────────────────────────────────────────────
  async block(userId: string, profileId: string) {
    if (profileId === userId) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'You cannot block yourself', { profileId: 'Yourself' });
    if (!(await this.prisma.user.findUnique({ where: { id: profileId } }))) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Person not found');
    await this.prisma.$transaction([
      this.prisma.block.upsert({ where: { blockerId_blockedId: { blockerId: userId, blockedId: profileId } }, create: { blockerId: userId, blockedId: profileId }, update: {} }),
      this.prisma.connection.deleteMany({ where: { OR: [{ requesterId: userId, addresseeId: profileId }, { requesterId: profileId, addresseeId: userId }] } }),
      this.prisma.eventInvitation.updateMany({
        where: { status: 'pending', OR: [{ fromUserId: userId, toUserId: profileId }, { fromUserId: profileId, toUserId: userId }] },
        data: { status: 'cancelled' },
      }),
    ]);
  }

  async unblock(userId: string, profileId: string) {
    await this.prisma.block.deleteMany({ where: { blockerId: userId, blockedId: profileId } });
  }

  // ── Reports ──────────────────────────────────────────────────────────────
  async report(user: User, input: { targetType?: string; targetId: string; reason: string; details?: string }) {
    const targetType = input.targetType ?? 'profile';
    const exists = await this.targetExists(targetType, input.targetId, user.id);
    if (!exists) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'The reported item was not found');
    const duplicate = await this.prisma.report.findFirst({ where: { reporterId: user.id, targetType, targetId: input.targetId, status: 'open' } });
    if (duplicate) return { reportId: duplicate.id };
    const r = await this.prisma.report.create({ data: { reporterId: user.id, targetType, targetId: input.targetId, reason: input.reason, details: input.details ?? '' } });
    return { reportId: r.id };
  }

  private async targetExists(type: string, id: string, reporterId: string) {
    switch (type) {
      case 'profile': return !!(await this.prisma.user.findUnique({ where: { id } }));
      case 'community-post': return !!(await this.prisma.communityPost.findUnique({ where: { id } }));
      case 'organization': return !!(await this.prisma.organization.findUnique({ where: { id } }));
      case 'job': return !!(await this.prisma.job.findUnique({ where: { id } }));
      case 'event': return !!(await this.prisma.cityEvent.findUnique({ where: { id } }));
      // Only participants can report a message (others must not learn it exists).
      case 'message': return !!(await this.prisma.message.findFirst({ where: { id, conversation: { OR: [{ userAId: reporterId }, { userBId: reporterId }] } } }));
      default: return false;
    }
  }
}
