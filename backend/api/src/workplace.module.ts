import { Controller, Get, Param, Query } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { z } from 'zod';
import { AnalyticsService } from './analytics/analytics.service';
import { OrgAccess } from './auth/auth.decorators';
import { zIsoDate } from './common/pagination';
import { ok } from './common/responses';
import { ZodPipe } from './common/zod';
import { EngagementController } from './engagement/engagement.controller';
import { EngagementService } from './engagement/engagement.service';
import { HrController } from './hr/hr.controller';
import { HrService } from './hr/hr.service';
import { OrgsModule } from './orgs/orgs.module';
import { PayrollController } from './payroll/payroll.controller';
import { PayrollService } from './payroll/payroll.service';

const RangeQuery = z.object({ from: zIsoDate.optional(), to: zIsoDate.optional() }).strict();

@Controller('orgs/:orgId/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @OrgAccess({ perm: 'analytics.view', module: 'analytics' })
  @Get('workforce')
  async workforce(@Param('orgId') orgId: string, @Query(new ZodPipe(RangeQuery)) q: z.infer<typeof RangeQuery>) {
    return ok(await this.analytics.workforce(orgId, q));
  }
}

/** Workplace ecosystem, part 2: HR, engagement, payroll preview, workforce analytics. */
@Module({
  imports: [OrgsModule],
  controllers: [HrController, EngagementController, PayrollController, AnalyticsController],
  providers: [HrService, EngagementService, PayrollService, AnalyticsService],
})
export class WorkplaceModule {}
