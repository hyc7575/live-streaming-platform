import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, LoggedInGuard } from '../auth/logged-in.guard.js';
import { ZodBodyPipe } from '../zod-body.pipe.js';
import { DonationTargetGuard } from './donation-target.guard.js';
import {
  DONATION_MAX_AMOUNT,
  DONATION_MESSAGE_MAX_LENGTH,
  DONATION_MIN_AMOUNT,
  DonationsService,
  type ConfirmedDonation,
  type CreateDonationInput,
  type DonationList,
  type DonationOrder,
} from './donations.service.js';

const amount = z.number().int();

// Unknown keys such as `donorId` are stripped.
const createSchema = z.object({
  amount: amount.min(DONATION_MIN_AMOUNT).max(DONATION_MAX_AMOUNT),
  message: z.string().trim().max(DONATION_MESSAGE_MAX_LENGTH).default(''),
});

const confirmSchema = z.object({
  paymentKey: z.string().min(1).max(200),
  orderId: z.string().min(1).max(64),
  amount,
});

type ConfirmInput = z.infer<typeof confirmSchema>;

@Controller()
export class DonationsController {
  constructor(private readonly donations: DonationsService) {}

  @Get('broadcasts/:id/donations')
  list(@Param('id') broadcastId: string): Promise<DonationList> {
    return this.donations.list(broadcastId);
  }

  @Post('broadcasts/:id/donations')
  @UseGuards(LoggedInGuard, DonationTargetGuard)
  createOrder(
    @Param('id') broadcastId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodBodyPipe(createSchema)) input: CreateDonationInput,
  ): Promise<DonationOrder> {
    return this.donations.createOrder(broadcastId, user.id, input);
  }

  @Post('donations/confirm')
  @HttpCode(200)
  @UseGuards(LoggedInGuard)
  confirm(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBodyPipe(confirmSchema)) input: ConfirmInput,
  ): Promise<ConfirmedDonation> {
    return this.donations.confirm(user.id, input);
  }
}
