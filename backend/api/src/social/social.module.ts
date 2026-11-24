import { Controller, Get, Module, Param, Res } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser, OptionalAuth, Public } from '../auth/auth.decorators';
import { AuthModule } from '../auth/auth.module';
import { CareerModule } from '../career/career.module';
import { AssistantController } from '../assistant/assistant.controller';
import { AssistantService } from '../assistant/assistant.service';
import { ASSISTANT_LLM, createLlm } from '../assistant/llm';
import { CityService } from '../city/city.service';
import { MarketsService } from '../city/markets.service';
import { PresenceService } from '../city/presence.service';
import { GamesAdminController, GamesController } from '../games/games.controller';
import { GamesService } from '../games/games.service';
import { ok } from '../common/responses';
import { ZodPipe, zId } from '../common/zod';
import { MessagesService } from './messages.service';
import { ModerationService } from './moderation.service';
import { MessagesController, ModerationController, SocialController } from './social.controller';
import { SocialService } from './social.service';

@Controller('city')
export class CityController {
  constructor(private readonly city: CityService, private readonly markets: MarketsService) {}

  @Public()
  @Get('markets')
  async marketsSnapshot(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    return ok(await this.markets.snapshot());
  }

  @Public()
  @Get('world')
  async world(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return ok(await this.city.world());
  }

  @Public()
  @Get('hq/:orgId')
  async hq(@Param('orgId', new ZodPipe(zId)) orgId: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return ok(await this.city.hq(orgId));
  }

  @OptionalAuth()
  @Get('me')
  async me(@CurrentUser() user: User | undefined, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    return ok(await this.city.me(user?.id));
  }
}

/** Social & virtual ecosystem: events, communities, connections, messages, moderation, city, presence, games, AI assistant. */
@Module({
  imports: [CareerModule, AuthModule],
  controllers: [SocialController, MessagesController, ModerationController, CityController, GamesController, GamesAdminController, AssistantController],
  providers: [
    SocialService, MessagesService, ModerationService, CityService, MarketsService, PresenceService, GamesService, AssistantService,
    { provide: ASSISTANT_LLM, useFactory: createLlm },
  ],
})
export class SocialModule {}
