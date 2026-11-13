import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BroadcastsModule } from '../broadcasts/broadcasts.module.js';
import { DonationTargetGuard } from '../donations/donation-target.guard.js';
import { TossPaymentsModule } from '../donations/toss-payments.module.js';
import { LimeDonationsController } from './lime-donations.controller.js';
import { LimeDonationsService } from './lime-donations.service.js';
import { LimeController } from './lime.controller.js';
import { LimeService } from './lime.service.js';

@Module({
  imports: [AuthModule, BroadcastsModule, TossPaymentsModule],
  controllers: [LimeController, LimeDonationsController],
  providers: [LimeService, LimeDonationsService, DonationTargetGuard],
})
export class LimeModule {}
