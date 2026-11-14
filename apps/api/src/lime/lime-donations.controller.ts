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

  // 401(guard) → 400(body pipe) → 이미 후원한 키: 그 후원과 함께 200,
  // 호출자의 후원인데 방송이 삭제됐으면 404,
  // 남의 키면 409 → 404 → 403 → LIVE 아님 409(대상) →
  // 라임 부족 409(서비스). 새 키는 PRD-lime 7.3의 순서를 따른다. 새 후원은
  // 201이다.
  @Post('broadcasts/:id/lime-donations')
  @UseGuards(LoggedInGuard)
  async donate(
    @Param('id') broadcastId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodBodyPipe(limeDonationSchema)) input: LimeDonationBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConfirmedDonation> {
    const earlier = await this.limeDonations.earlier(
      broadcastId,
      user.id,
      input,
    );
    if (earlier) {
      res.status(200);
      return earlier;
    }
    const recipientId = await this.target.check(broadcastId, user.id);
    const { donation, created } = await this.limeDonations.donate(
      { broadcastId, recipientId },
      user.id,
      input,
    );
    res.status(created ? 201 : 200);
    return donation;
  }
}
