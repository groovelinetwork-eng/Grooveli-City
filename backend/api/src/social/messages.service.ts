import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { ApiError } from '../common/api-exception.filter';
import { PageQuery, toPage } from '../common/pagination';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertAcceptableText } from './content-filter';
import { SocialService } from './social.service';

const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly social: SocialService,
    private readonly notifications: NotificationService,
  ) {}

  private async conversation(userId: string, conversationId: string) {
    const c = await this.prisma.conversation.findFirst({ where: { id: conversationId, OR: [{ userAId: userId }, { userBId: userId }] } });
    if (!c) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Conversation not found');
    return { ...c, otherId: c.userAId === userId ? c.userBId : c.userAId };
  }

  private async toApiConversation(userId: string, c: { id: string; userAId: string; userBId: string; lastMessageAt: Date | null }) {
    const otherId = c.userAId === userId ? c.userBId : c.userAId;
    const [other, last, unread] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: otherId }, include: { candidateProfile: true } }),
      this.prisma.message.findFirst({ where: { conversationId: c.id, removedAt: null }, orderBy: { createdAt: 'desc' } }),
      this.prisma.message.count({ where: { conversationId: c.id, senderId: otherId, readAt: null, removedAt: null } }),
    ]);
    return {
      id: c.id,
      with: other ? this.social.socialProfile(other) : { id: otherId, name: 'Deleted user', headline: '', district: 'plaza', avatar: {}, interests: [] },
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: last ? last.text.slice(0, 140) : null,
      unread,
    };
  }

  async list(userId: string, page: PageQuery) {
    const hidden = await this.social.blockedIds(userId);
    const where: Prisma.ConversationWhereInput = {
      OR: [
        { userAId: userId, userBId: { notIn: hidden } },
        { userBId: userId, userAId: { notIn: hidden } },
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({ where, orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }], skip: (page.page - 1) * page.pageSize, take: page.pageSize }),
      this.prisma.conversation.count({ where }),
    ]);
    return toPage(await Promise.all(rows.map((c) => this.toApiConversation(userId, c))), total, page);
  }

  async start(user: User, profileId: string) {
    if (profileId === user.id) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'You cannot message yourself', { profileId: 'Yourself' });
    const to = await this.social.activeUser(profileId);
    const existing = await this.prisma.conversation.findUnique({ where: { userAId_userBId: pair(user.id, profileId) } });
    if (existing && !(await this.social.isBlocked(user.id, profileId))) return this.toApiConversation(user.id, existing);
    if (!(await this.social.allows(to.candidateProfile?.allowMessages ?? 'connections', user.id, profileId))) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'This person is not accepting messages from you');
    }
    const c = await this.prisma.conversation.upsert({ where: { userAId_userBId: pair(user.id, profileId) }, create: pair(user.id, profileId), update: {} });
    return this.toApiConversation(user.id, c);
  }

  async messages(userId: string, conversationId: string, page: PageQuery, before?: string) {
    await this.conversation(userId, conversationId);
    const where: Prisma.MessageWhereInput = { conversationId, removedAt: null, ...(before ? { createdAt: { lt: new Date(before) } } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.message.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page.page - 1) * page.pageSize, take: page.pageSize }),
      this.prisma.message.count({ where }),
    ]);
    return toPage(
      rows.map((m) => ({ id: m.id, conversationId, fromMe: m.senderId === userId, text: m.text, at: m.createdAt.toISOString(), readAt: m.readAt?.toISOString() ?? null })),
      total,
      page,
    );
  }

  async send(user: User, conversationId: string, text: string, idempotencyKey?: string) {
    const c = await this.conversation(user.id, conversationId);
    if (await this.social.isBlocked(user.id, c.otherId)) throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'You cannot message this person');
    if (!(await this.prisma.user.findFirst({ where: { id: c.otherId, deletedAt: null, suspendedAt: null } }))) {
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'This person is no longer on Grooveli City');
    }
    assertAcceptableText(text);
    if (idempotencyKey) {
      const dup = await this.prisma.message.findUnique({ where: { senderId_idempotencyKey: { senderId: user.id, idempotencyKey } } });
      if (dup) return { id: dup.id, conversationId, fromMe: true, text: dup.text, at: dup.createdAt.toISOString(), readAt: dup.readAt?.toISOString() ?? null };
    }
    const m = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({ data: { conversationId, senderId: user.id, text, idempotencyKey: idempotencyKey ?? null } });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: msg.createdAt } });
      return msg;
    });
    const unreadBefore = await this.prisma.message.count({ where: { conversationId, senderId: user.id, readAt: null } });
    // One notification per unread burst, not per message.
    if (unreadBefore === 1) await this.notifications.notify(c.otherId, { kind: 'social', title: 'New message', body: `${user.displayName} sent you a message.`, href: '/social/messages' });
    return { id: m.id, conversationId, fromMe: true, text: m.text, at: m.createdAt.toISOString(), readAt: null };
  }

  async markRead(userId: string, conversationId: string) {
    const c = await this.conversation(userId, conversationId);
    await this.prisma.message.updateMany({ where: { conversationId, senderId: c.otherId, readAt: null }, data: { readAt: new Date() } });
  }
}
