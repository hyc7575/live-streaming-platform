import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, LoggedInGuard } from '../auth/logged-in.guard.js';
import { ZodBodyPipe } from '../zod-body.pipe.js';
import {
  LIME_CHARGE_MAX_AMOUNT,
  LIME_CHARGE_MIN_AMOUNT,
  LimeService,
  type ConfirmedCharge,
  type LimeBalance,
  type LimeChargeOrder,
  type LimeLedgerEntry,
} from './lime.service.js';

const amount = z.number().int();

const chargeSchema = z.object({
  amount: amount.min(LIME_CHARGE_MIN_AMOUNT).max(LIME_CHARGE_MAX_AMOUNT),
});

const confirmSchema = z.object({
  paymentKey: z.string().min(1).max(200),
  orderId: z.string().min(1).max(64),
  amount,
});

type ChargeInput = z.infer<typeof chargeSchema>;
type ConfirmInput = z.infer<typeof confirmSchema>;

// guard가 body pipe보다 먼저 돌므로, 로그아웃한 호출자는 400보다
// 먼저 401을 받는다.
@Controller()
@UseGuards(LoggedInGuard)
export class LimeController {
  constructor(private readonly lime: LimeService) {}

  @Post('lime/charges')
  createCharge(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBodyPipe(chargeSchema)) input: ChargeInput,
  ): Promise<LimeChargeOrder> {
    return this.lime.createCharge(user.id, input.amount);
  }

  @Post('lime/charges/confirm')
  @HttpCode(200)
  confirm(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBodyPipe(confirmSchema)) input: ConfirmInput,
  ): Promise<ConfirmedCharge> {
    return this.lime.confirm(user.id, input);
  }

  @Get('me/lime')
  balance(@CurrentUser() user: AuthUser): Promise<LimeBalance> {
    return this.lime.balance(user.id);
  }

  @Get('me/lime/ledger')
  ledger(@CurrentUser() user: AuthUser): Promise<LimeLedgerEntry[]> {
    return this.lime.ledger(user.id);
  }
}
