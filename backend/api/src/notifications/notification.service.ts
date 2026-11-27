import { Global, Injectable, Module } from '@nestjs/common';
import { NotificationKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** In-app notifications. (Email/push delivery can hook in here later.) */
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(
    userId: string,
    n: { kind: NotificationKind; title: string; body: string; href?: string },
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    // Only relative in-app paths: never let a notification link off-site.
    const href = n.href && n.href.startsWith('/') && !n.href.startsWith('//') ? n.href : null;
    await tx.notification.create({ data: { userId, kind: n.kind, title: n.title.slice(0, 200), body: n.body.slice(0, 1000), href } });
  }
}

@Global()
@Module({ providers: [NotificationService], exports: [NotificationService] })
export class NotificationModule {}
