import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiRequest, CurrentUser, PlatformAdmin, Public } from '../auth/auth.decorators';
import { ok } from '../common/responses';
import { ZodPipe, zId } from '../common/zod';
import { GAME_IDS, GamesService } from './games.service';

const gamePipe = new ZodPipe(z.enum(GAME_IDS));
const idPipe = new ZodPipe(zId);
const SessionBody = z.object({ mode: z.enum(['invite-friend', 'matchmaking', 'solo-challenge', 'practice']) }).strict();
const InviteBody = z.object({ connectionId: zId }).strict();
const AvailabilityBody = z.object({ availability: z.enum(['coming-soon', 'available', 'maintenance']), message: z.string().trim().max(200).optional() }).strict();

/** Game responses are NOT wrapped in the envelope (the city reads them directly); errors still are. */
@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Public()
  @Get()
  async list(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return this.games.list();
  }

  @Post(':gameId/sessions')
  async create(@CurrentUser() user: User, @Param('gameId', gamePipe) gameId: (typeof GAME_IDS)[number], @Body(new ZodPipe(SessionBody)) body: z.infer<typeof SessionBody>, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return this.games.create(user, gameId, body.mode);
  }

  @HttpCode(200)
  @Post(':gameId/matchmaking')
  async matchmake(@CurrentUser() user: User, @Param('gameId', gamePipe) gameId: (typeof GAME_IDS)[number]) {
    return this.games.matchmake(user, gameId);
  }

  @Post('sessions/:sessionId/invitations')
  async invite(@CurrentUser() user: User, @Param('sessionId', idPipe) id: string, @Body(new ZodPipe(InviteBody)) body: z.infer<typeof InviteBody>, @Res({ passthrough: true }) res: Response) {
    res.status(201);
    return this.games.invite(user, id, body.connectionId);
  }

  @HttpCode(200)
  @Post('sessions/:sessionId/join')
  async join(@CurrentUser() user: User, @Param('sessionId', idPipe) id: string) {
    return this.games.join(user, id);
  }

  @Get('sessions/:sessionId')
  async get(@CurrentUser() user: User, @Param('sessionId', idPipe) id: string) {
    return this.games.get(user, id);
  }

  @Get('sessions/:sessionId/result')
  async result(@CurrentUser() user: User, @Param('sessionId', idPipe) id: string) {
    return this.games.result(user, id);
  }
}

@Controller('platform/games')
export class GamesAdminController {
  constructor(private readonly games: GamesService) {}

  @PlatformAdmin()
  @Put(':gameId')
  async setAvailability(@Param('gameId', gamePipe) gameId: (typeof GAME_IDS)[number], @CurrentUser() user: User, @Body(new ZodPipe(AvailabilityBody)) body: z.infer<typeof AvailabilityBody>, @Req() req: ApiRequest) {
    return ok(await this.games.setAvailability(gameId, body.availability, body.message, { user, ip: req.ip }));
  }
}
