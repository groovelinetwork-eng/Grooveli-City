import { Module } from '@nestjs/common';
import { CareerModule } from '../career/career.module';
import { RecruitmentController } from '../recruitment/recruitment.controller';
import { RecruitmentService } from '../recruitment/recruitment.service';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';

/** Workplace ecosystem, part 1: organisations, members, platform admin, recruitment. */
@Module({
  imports: [CareerModule],
  controllers: [OrgsController, RecruitmentController],
  providers: [OrgsService, RecruitmentService],
  exports: [OrgsService],
})
export class OrgsModule {}
