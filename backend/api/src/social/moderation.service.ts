import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Report, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-exception.filter';
import { PageQuery, skipTake, toPage } from '../common/pagination';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';

type Actor = { user: User; ip?: string };
export type ModerationAction = 'dismiss' | 'remove-content' | 'warn-user' | 'suspend-user';

/** Platform Trust & Safety: the reports queue and account suspension. */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  private toApi = (r: Report) => ({
    id: r.id, targetType: r.targetType, targetId: r.targetId, reason: r.reason, details: r.details, reporterId: r.reporterId,
    createdAt: r.createdAt.toISOString(), status: r.status, resolution: (r.resolution as object | null) ?? null,
  });

  async list(q: { status?: string; targetType?: string }, page: PageQuery) {
    const where: Prisma.ReportWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.targetType ? { targetType: q.targetType } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({ where, orderBy: { createdAt: 'asc' }, ...skipTake(page) }),
      this.prisma.report.count({ where }),
    ]);
    return toPage(rows.map(this.toApi), total, page);
  }

  /** The account responsible for the reported item, if any. */
  private async targetUserId(r: Report): Promise<string | null> {
    switch (r.targetType) {
      case 'profile': return r.targetId;
      case 'community-post': return (await this.prisma.communityPost.findUnique({ where: { id: r.targetId } }))?.authorId ?? null;
      case 'message': return (await this.prisma.message.findUnique({ where: { id: r.targetId } }))?.senderId ?? null;
      default: return null;
    }
  }

  async resolve(reportId: string, action: ModerationAction, note: string | undefined, actor: Actor) {
    const r = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!r) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Report not found');
    if (r.status !== 'open') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Already resolved');
    const badAction = (msg: string): never => { throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', msg, { action: msg }); };

    if (action === 'remove-content') {
      const now = new Date();
      switch (r.targetType) {
        case 'community-post': await this.prisma.communityPost.updateMany({ where: { id: r.targetId }, data: { removedAt: now, removedBy: actor.user.id } }); break;
        case 'message': await this.prisma.message.updateMany({ where: { id: r.targetId }, data: { removedAt: now } }); break;
        case 'job': await this.prisma.job.updateMany({ where: { id: r.targetId }, data: { status: 'closed' } }); break;
        case 'event': await this.prisma.cityEvent.updateMany({ where: { id: r.targetId }, data: { cancelledAt: now } }); break;
        default: badAction('Nothing to remove for this kind of report; warn or suspend instead');
      }
    } else if (action === 'warn-user' || action === 'suspend-user') {
      const target = await this.targetUserId(r);
      if (!target) badAction('This report is not about a person');
      if (action === 'warn-user') {
        await this.notifications.notify(target!, { kind: 'system', title: 'Community rules reminder', body: note ? `A moderator reviewed your content: ${note}` : 'A moderator reviewed your content. Please follow the community rules.' });
      } else {
        await this.setSuspended(target!, true, note, actor);
      }
    }

    const updated = await this.prisma.report.update({
      where: { id: r.id },
      data: { status: action === 'dismiss' ? 'dismissed' : 'actioned', resolution: { action, note: note ?? '', by: actor.user.displayName, at: new Date().toISOString() } },
    });
    await this.audit.record({ action: `moderation.${action}`, targetType: r.targetType, targetId: r.targetId, actorId: actor.user.id, ip: actor.ip, details: { reportId } });
    // The reporter learns it was handled, never what happened to whom.
    await this.notifications.notify(r.reporterId, { kind: 'system', title: 'Report reviewed', body: 'Thanks — a moderator has reviewed your report.' });
    return this.toApi(updated);
  }

  async setSuspended(userId: string, suspended: boolean, note: string | undefined, actor: Actor) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'User not found');
    if (u.platformRole === 'admin') throw new ApiError(HttpStatus.CONFLICT, 'NOT_ALLOWED_IN_STATE', 'Platform admins cannot be suspended here');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { suspendedAt: suspended ? new Date() : null } }),
      ...(suspended ? [this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })] : []),
    ]);
    await this.audit.record({ action: suspended ? 'user.suspended' : 'user.unsuspended', targetType: 'user', targetId: userId, actorId: actor.user.id, ip: actor.ip, details: note ? { note } : {} });
    return { userId, suspended };
  }
}
