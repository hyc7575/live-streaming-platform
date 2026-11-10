import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { PrismaService } from '../database/database.module.js';
import { ZodBodyPipe } from '../zod-body.pipe.js';
import { authUserSelect, toAuthUser, type AuthUser } from './auth-user.js';
import { LOGIN_RATE_LIMIT } from './auth.controller.js';
import { startSession } from './session.js';
import {
  TEST_ACCOUNT_KEYS,
  TEST_ACCOUNTS_CONFIG,
  type TestAccountKey,
  type TestAccountsConfig,
} from './test-accounts.js';

export interface TestAccountsResponse {
  accounts: TestAccountKey[];
}

// Logs in as a seeded test account without the browser ever holding its
// password, which lives only in the server's environment.
@Controller('auth')
export class TestAccountsController {
  constructor(
    @Inject(TEST_ACCOUNTS_CONFIG) private readonly config: TestAccountsConfig,
    private readonly prisma: PrismaService,
  ) {}

  // Lists only seeded accounts, so the login page never offers a button
  // that would fail.
  @Get('test-accounts')
  async list(): Promise<TestAccountsResponse> {
    if (!this.config.enabled) return { accounts: [] };
    const { emails } = this.config;
    const users = await this.prisma.user.findMany({
      where: { email: { in: Object.values(emails) } },
      select: { email: true },
    });
    const seeded = new Set(users.map((u) => u.email));
    return { accounts: TEST_ACCOUNT_KEYS.filter((k) => seeded.has(emails[k])) };
  }

  @Post('test-login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: LOGIN_RATE_LIMIT })
  async logIn(
    @Body(new ZodBodyPipe(z.object({ account: z.enum(TEST_ACCOUNT_KEYS) })))
    body: { account: TestAccountKey },
    @Req() req: Request,
  ): Promise<AuthUser> {
    if (!this.config.enabled) throw new NotFoundException();
    const user = await this.prisma.user.findUnique({
      where: { email: this.config.emails[body.account] },
      select: authUserSelect,
    });
    if (!user) {
      throw new NotFoundException(`Test account ${body.account} is not seeded`);
    }
    await startSession(req, user.id);
    return toAuthUser(user);
  }
}
