import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { LoggedInGuard } from '../auth/logged-in.guard.js';
import { GamesService, type GameView } from './games.service.js';
import { foldGameText } from './search-text.js';

export const GAME_QUERY_MAX_LENGTH = 50;

const querySchema = z
  .string()
  .transform(foldGameText)
  .pipe(z.string().min(1).max(GAME_QUERY_MAX_LENGTH));

@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  // 방송 폼에서만 쓴다. 로그인을 요구해 공개 검색 엔드포인트의 남용을 막는다.
  @Get()
  @UseGuards(LoggedInGuard)
  search(@Query('q') q: unknown): Promise<GameView[]> {
    const parsed = querySchema.safeParse(q);
    if (!parsed.success) throw new BadRequestException('Invalid q');
    return this.games.search(parsed.data);
  }
}
