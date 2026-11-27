import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { truncateIp } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEvent {
  action: string;
  targetType: string;
  targetId: string;
  actorId?: string | null;
  organizationId?: string | null;
  ip?: string | null;
  details?: Prisma.InputJsonValue;
}

/** Append-only audit trail (who did what, when). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    try {
      await tx.auditLog.create({
        data: {
          action: event.action,
          targetType: event.targetType,
          targetId: event.targetId,
          actorId: event.actorId ?? null,
          organizationId: event.organizationId ?? null,
          ip: truncateIp(event.ip),
          details: event.details ?? {},
        },
      });
    } catch (err) {
      // Inside a transaction the caller's write fails too, which is what we want.
      if (tx !== this.prisma) throw err;
      this.logger.error(`Failed to record ${event.action}: ${(err as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
