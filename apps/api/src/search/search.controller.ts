import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { z } from 'zod';
import { foldGameText } from '../games/search-text.js';
import { SearchService, type SearchResult } from './search.service.js';

export const SEARCH_QUERY_MAX_LENGTH = 50;
// 로그인 없이 부르고 인덱스 없이 훑으므로 IP마다 요청 수를 묶는다. 자동 완성이
// 없어 Enter를 누를 때만 부르니 사람이 닿기 어려운 수다.
export const SEARCH_RATE_LIMIT = { limit: 60, ttl: 60_000 };

const querySchema = z
  .string()
  .trim()
  .min(1)
  .max(SEARCH_QUERY_MAX_LENGTH)
  .transform(foldGameText);

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: SEARCH_RATE_LIMIT })
  find(@Query('q') q: unknown): Promise<SearchResult> {
    const parsed = querySchema.safeParse(q);
    if (!parsed.success) throw new BadRequestException('Invalid q');
    return this.search.search(parsed.data);
  }
}
