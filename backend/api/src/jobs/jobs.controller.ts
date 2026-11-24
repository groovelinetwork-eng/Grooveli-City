import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, Public } from '../auth/auth.decorators';
import { PageQuery, zIsoDate } from '../common/pagination';
import { ok } from '../common/responses';
import { ZodPipe, zId } from '../common/zod';
import { JobsService } from './jobs.service';

const JobSearchQuery = PageQuery.extend({
  q: z.string().trim().min(1).max(100).optional(),
  district: z.enum(['plaza', 'corporate', 'recruitment', 'university', 'tech', 'creative', 'healthcare', 'hospitality', 'finance', 'apartment', 'ai-center']).optional(),
  organizationId: zId.optional(),
  workMode: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  employmentType: z.enum(['full-time', 'part-time', 'contract', 'internship', 'freelance']).optional(),
  level: z.enum(['entry', 'mid', 'senior', 'lead']).optional(),
  minSalary: z.coerce.number().int().min(0).optional(),
  sort: z.string().max(20).optional(),
}).strict();
const MatchQuery = PageQuery.extend({ minScore: z.coerce.number().int().min(0).max(100).optional() }).strict();
const AppsQuery = PageQuery.extend({
  status: z.enum(['submitted', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']).optional(),
}).strict();
const RangeQuery = z.object({ from: zIsoDate.optional(), to: zIsoDate.optional() }).strict();
const ApplyBody = z.object({ coverLetter: z.string().trim().max(5000) }).strict();
const idPipe = new ZodPipe(zId);

@Controller()
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Public()
  @Get('jobs')
  async list(@Query(new ZodPipe(JobSearchQuery)) q: z.infer<typeof JobSearchQuery>, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=30');
    const { page, pageSize, ...search } = q;
    return ok(await this.jobs.search(search, { page, pageSize }));
  }

  @Public()
  @Get('jobs/:jobId')
  async get(@Param('jobId', idPipe) jobId: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=30');
    return ok(await this.jobs.getPublic(jobId));
  }

  @Get('me/job-matches')
  async matches(@CurrentUser() user: User, @Query(new ZodPipe(MatchQuery)) q: z.infer<typeof MatchQuery>) {
    return ok(await this.jobs.matches(user.id, q, q.minScore));
  }

  @Get('me/job-matches/:jobId')
  async match(@CurrentUser() user: User, @Param('jobId', idPipe) jobId: string) {
    return ok(await this.jobs.matchOne(user.id, jobId));
  }

  @Get('me/saved-jobs')
  async saved(@CurrentUser() user: User) {
    return ok(await this.jobs.savedIds(user.id));
  }

  @Put('me/saved-jobs/:jobId')
  async save(@CurrentUser() user: User, @Param('jobId', idPipe) jobId: string) {
    return ok(await this.jobs.save(user.id, jobId), 'Saved');
  }

  @Delete('me/saved-jobs/:jobId')
  async unsave(@CurrentUser() user: User, @Param('jobId', idPipe) jobId: string) {
    return ok(await this.jobs.unsave(user.id, jobId), 'Removed');
  }

  @Throttle({ default: { limit: 30, ttl: 24 * 60 * 60_000 } })
  @Post('jobs/:jobId/applications')
  async apply(
    @CurrentUser() user: User,
    @Param('jobId', idPipe) jobId: string,
    @Body(new ZodPipe(ApplyBody)) body: z.infer<typeof ApplyBody>,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(201);
    return ok(await this.jobs.apply(user, jobId, body.coverLetter), 'Application submitted');
  }

  @Get('me/applications')
  async myApplications(@CurrentUser() user: User, @Query(new ZodPipe(AppsQuery)) q: z.infer<typeof AppsQuery>) {
    return ok(await this.jobs.myApplications(user.id, q, q.status));
  }

  @Post('me/applications/:applicationId/withdraw')
  async withdraw(@CurrentUser() user: User, @Param('applicationId', idPipe) applicationId: string) {
    return ok(await this.jobs.withdraw(user.id, applicationId), 'Application withdrawn');
  }

  @Get('me/interviews')
  async interviews(@CurrentUser() user: User, @Query(new ZodPipe(RangeQuery)) q: z.infer<typeof RangeQuery>) {
    return ok(await this.jobs.myInterviews(user.id, q.from, q.to));
  }
}
