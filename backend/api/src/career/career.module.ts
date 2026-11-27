import { Module } from '@nestjs/common';
import { CandidateController } from '../candidate/candidate.controller';
import { CandidateService } from '../candidate/candidate.service';
import { JobsController } from '../jobs/jobs.controller';
import { JobsService } from '../jobs/jobs.service';
import { CareerController } from './career.controller';
import { CareerService } from './career.service';
import { XpService } from './xp.service';

/** Career ecosystem: candidate profile, jobs & applications, XP and progress. */
@Module({
  controllers: [CandidateController, JobsController, CareerController],
  providers: [CandidateService, JobsService, CareerService, XpService],
  exports: [CandidateService, JobsService, XpService],
})
export class CareerModule {}
