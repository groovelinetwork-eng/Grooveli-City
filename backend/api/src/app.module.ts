import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { CareerModule } from './career/career.module';
import { OrgsModule } from './orgs/orgs.module';
import { WorkplaceModule } from './workplace.module';
import { SocialModule } from './social/social.module';
import { NotificationModule } from './notifications/notification.service';
import { StorageModule } from './storage/storage.service';
import { OrgAccessGuard, SessionGuard } from './auth/guards';
import { MailModule } from './mail/mail.service';
import { PrismaModule } from './prisma/prisma.service';

@Module({
  imports: [
    // Default limit; stricter limits are set per route with @Throttle.
    // Single-instance store. Before running more than one API instance, switch to a Redis store.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
      // Automated tests only; never skipped in development or production.
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    MailModule,
    AuditModule,
    StorageModule,
    NotificationModule,
    AuthModule,
    CareerModule,
    OrgsModule,
    WorkplaceModule,
    SocialModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: rate limit → session → organisation access.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: SessionGuard },
    { provide: APP_GUARD, useExisting: OrgAccessGuard },
  ],
})
export class AppModule {}
