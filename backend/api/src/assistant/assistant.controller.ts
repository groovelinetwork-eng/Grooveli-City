import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators';
import { ok } from '../common/responses';
import { ZodPipe, zId } from '../common/zod';
import { AssistantService } from './assistant.service';

const MessageBody = z.object({ text: z.string().trim().min(1).max(2000) }).strict();
const ConfirmBody = z.object({ jobIds: z.array(zId).min(1).max(10) }).strict();

@Controller('me/assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('thread')
  async thread(@CurrentUser() user: User) {
    return ok(await this.assistant.thread(user.id));
  }

  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  @HttpCode(200)
  @Post('messages')
  async send(@CurrentUser() user: User, @Body(new ZodPipe(MessageBody)) body: z.infer<typeof MessageBody>) {
    return ok(await this.assistant.send(user, body.text));
  }

  @HttpCode(200)
  @Post('confirm-applications')
  async confirm(@CurrentUser() user: User, @Body(new ZodPipe(ConfirmBody)) body: z.infer<typeof ConfirmBody>) {
    return ok(await this.assistant.confirm(user, body.jobIds));
  }

  @Delete('thread')
  async clear(@CurrentUser() user: User) {
    await this.assistant.clear(user.id);
    return ok(null, 'Conversation cleared');
  }
}
