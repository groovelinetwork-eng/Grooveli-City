import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import { PageQuery } from '../common/pagination';
import { ok } from '../common/responses';
import { ZodPipe, zId } from '../common/zod';
import { CareerService } from './career.service';

const HOUR = 60 * 60_000;
const idPipe = new ZodPipe(zId);
const ChallengeQuery = z.object({
  district: z.enum(['plaza', 'corporate', 'recruitment', 'university', 'tech', 'creative', 'healthcare', 'hospitality', 'finance', 'apartment', 'ai-center']).optional(),
}).strict();
const AttemptBody = z.object({ answers: z.array(z.number().int().min(0).max(20)).max(50) }).strict();
const AssessmentBody = z.object({ answers: z.record(z.string().max(64), z.string().max(200)) }).strict();
const SimulationBody = z.object({ role: z.string().trim().min(1).max(80), score: z.number().int().min(0).max(100) }).strict();
const NotificationsQuery = PageQuery.extend({ unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional() }).strict();
const ReadBody = z.object({ ids: z.union([z.array(zId).max(200), z.literal('all')]) }).strict();

@Controller()
export class CareerController {
  constructor(private readonly career: CareerService) {}

  @Get('me/progress')
  async progress(@CurrentUser() user: User) {
    return ok(await this.career.progress(user.id));
  }

  @Get('career/challenges')
  async challenges(@Query(new ZodPipe(ChallengeQuery)) q: z.infer<typeof ChallengeQuery>) {
    return ok(await this.career.challenges(q.district));
  }

  @Throttle({ default: { limit: 20, ttl: HOUR } })
  @HttpCode(200)
  @Post('career/challenges/:challengeId/attempts')
  async attempt(@CurrentUser() user: User, @Param('challengeId', idPipe) id: string, @Body(new ZodPipe(AttemptBody)) body: z.infer<typeof AttemptBody>) {
    return ok(await this.career.attemptChallenge(user.id, id, body.answers));
  }

  @Get('career/assessment')
  async assessment() {
    return ok(await this.career.assessmentQuestions());
  }

  @HttpCode(200)
  @Post('career/assessment')
  async submitAssessment(@CurrentUser() user: User, @Body(new ZodPipe(AssessmentBody)) body: z.infer<typeof AssessmentBody>) {
    return ok(await this.career.submitAssessment(user.id, body.answers), 'Assessment saved');
  }

  @Throttle({ default: { limit: 10, ttl: 24 * HOUR } })
  @HttpCode(200)
  @Post('career/interview-simulations')
  async simulation(@CurrentUser() user: User, @Body(new ZodPipe(SimulationBody)) body: z.infer<typeof SimulationBody>) {
    return ok(await this.career.recordInterviewSimulation(user.id, body.role, body.score));
  }

  @Get('career/courses')
  async courses(@CurrentUser() user: User) {
    return ok(await this.career.courses(user.id));
  }

  @Put('me/courses/:courseId/modules/:moduleIndex')
  async completeModule(@CurrentUser() user: User, @Param('courseId', idPipe) courseId: string, @Param('moduleIndex', ParseIntPipe) moduleIndex: number) {
    return ok(await this.career.completeModule(user.id, courseId, moduleIndex));
  }

  @Delete('me/courses/:courseId/modules/:moduleIndex')
  async uncompleteModule(@CurrentUser() user: User, @Param('courseId', idPipe) courseId: string, @Param('moduleIndex', ParseIntPipe) moduleIndex: number) {
    return ok(await this.career.uncompleteModule(user.id, courseId, moduleIndex));
  }

  @Get('career/missions')
  async missions(@CurrentUser() user: User) {
    return ok(await this.career.missions(user.id));
  }

  @HttpCode(200)
  @Post('me/missions/:missionId/claim')
  async claim(@CurrentUser() user: User, @Param('missionId', idPipe) missionId: string) {
    return ok(await this.career.claimMission(user.id, missionId), 'Mission claimed');
  }

  @Get('me/achievements')
  async achievements(@CurrentUser() user: User) {
    return ok(await this.career.achievements(user.id));
  }

  @Get('me/notifications')
  async notifications(@CurrentUser() user: User, @Query(new ZodPipe(NotificationsQuery)) q: z.infer<typeof NotificationsQuery>) {
    return ok(await this.career.notificationsPage(user.id, q, q.unread));
  }

  @HttpCode(200)
  @Post('me/notifications/read')
  async markRead(@CurrentUser() user: User, @Body(new ZodPipe(ReadBody)) body: z.infer<typeof ReadBody>) {
    await this.career.markRead(user.id, body.ids);
    return ok(null);
  }
}
