import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodBodyPipe } from '../zod-body.pipe.js';
import type { AuthUser } from './auth-user.js';
import {
  AuthService,
  type Credentials,
  type SignupInput,
} from './auth.service.js';
import { emailSchema, newPasswordSchema, nicknameSchema } from './fields.js';
import { CurrentUser, LoggedInGuard } from './logged-in.guard.js';
import {
  destroySession,
  SESSION_COOKIE_NAME,
  startSession,
} from './session.js';

const signupSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  nickname: nicknameSchema,
}) satisfies z.ZodType<SignupInput>;

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
}) satisfies z.ZodType<Credentials>;

export const LOGIN_RATE_LIMIT = { limit: 10, ttl: 60_000 };
export const SIGNUP_RATE_LIMIT = { limit: 20, ttl: 60 * 60_000 };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: SIGNUP_RATE_LIMIT })
  signup(
    @Body(new ZodBodyPipe(signupSchema)) body: SignupInput,
  ): Promise<AuthUser> {
    return this.auth.signup(body);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: LOGIN_RATE_LIMIT })
  async login(
    @Body(new ZodBodyPipe(loginSchema)) body: Credentials,
    @Req() req: Request,
  ): Promise<AuthUser> {
    const user = await this.auth.verifyCredentials(body);
    if (!user) throw new UnauthorizedException('Wrong email or password');
    await startSession(req, user.id);
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await destroySession(req);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  }

  @Get('me')
  @UseGuards(LoggedInGuard)
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
