import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import { ok } from '../common/responses';
import { ZodPipe } from '../common/zod';
import type { User } from '@prisma/client';
import { CandidateService } from './candidate.service';
import { PrivacyPatch, ProfileInput, ProfilePatch } from './profile';

@Controller('me')
export class CandidateController {
  constructor(private readonly candidates: CandidateService) {}

  @Get('profile')
  async getProfile(@CurrentUser() user: User) {
    return ok(await this.candidates.getProfile(user.id));
  }

  @HttpCode(200)
  @Post('onboarding')
  async onboarding(@CurrentUser() user: User, @Body(new ZodPipe(ProfileInput)) body: z.infer<typeof ProfileInput>) {
    return ok(await this.candidates.completeOnboarding(user.id, body), 'Profile saved');
  }

  @Patch('profile')
  async updateProfile(@CurrentUser() user: User, @Body(new ZodPipe(ProfilePatch)) body: z.infer<typeof ProfilePatch>) {
    return ok(await this.candidates.updateProfile(user.id, body), 'Profile updated');
  }

  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @HttpCode(200)
  @Post('cv')
  // Files are buffered in memory (multer default), capped at 5 MB; anything larger is rejected with 413 before reaching the handler.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }))
  async uploadCv(@CurrentUser() user: User, @UploadedFile() file: Express.Multer.File | undefined) {
    return ok(await this.candidates.uploadCv(user.id, file), 'CV uploaded');
  }

  @Get('cv')
  async getCv(@CurrentUser() user: User) {
    return ok(await this.candidates.getCv(user.id));
  }

  @Delete('cv')
  async deleteCv(@CurrentUser() user: User) {
    await this.candidates.deleteCv(user.id);
    return ok(null, 'CV deleted');
  }

  @Get('privacy')
  async getPrivacy(@CurrentUser() user: User) {
    return ok(await this.candidates.getPrivacy(user.id));
  }

  @Patch('privacy')
  async updatePrivacy(@CurrentUser() user: User, @Body(new ZodPipe(PrivacyPatch)) body: z.infer<typeof PrivacyPatch>) {
    return ok(await this.candidates.updatePrivacy(user.id, body), 'Privacy updated');
  }
}
