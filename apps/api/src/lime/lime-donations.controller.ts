import { Body, Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, LoggedInGuard } from '../auth/logged-in.guard.js';
import { donationInputSchema } from '../donations/donation-input.js';
import { DonationTargetGuard } from '../donations/donation-target.guard.js';
import type { ConfirmedDonation } from '../donations/donations.service.js';
import { ZodBodyPipe } from '../zod-body.pipe.js';
import { LimeDonationsService } from './lime-donations.service.js';

const limeDonationSchema = donationInputSchema.extend({
  orderId: z.uuid(),
});

type LimeDonationBody = z.infer<typeof limeDonationSchema>;

@Controller()
export class LimeDonationsController {
  constructor(
    private readonly target: DonationTargetGuard,
    private readonly limeDonations: LimeDonationsService,
  ) {}

  // 401 (guard) → 400 (body pipe) → 404 → 403 → 409 not LIVE (target) →
  // 409 short of lime (service), PRD-lime 7.3. 201 for a new donation, 200
  // when the key had already made it.
  @Post('broadcasts/:id/lime-donations')
  @UseGuards(LoggedInGuard)
  async donate(
    @Param('id') broadcastId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodBodyPipe(limeDonationSchema)) input: LimeDonationBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConfirmedDonation> {
    await this.target.check(broadcastId, user.id);
    const { donation, created } = await this.limeDonations.donate(
      broadcastId,
      user.id,
      input,
    );
    res.status(created ? 201 : 200);
    return donation;
  }
}
