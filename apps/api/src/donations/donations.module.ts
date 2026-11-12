import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BroadcastsModule } from '../broadcasts/broadcasts.module.js';
import { DonationsController } from './donations.controller.js';
import { DonationsService } from './donations.service.js';
import { TossPaymentsModule } from './toss-payments.module.js';

@Module({
  imports: [AuthModule, BroadcastsModule, TossPaymentsModule],
  controllers: [DonationsController],
  providers: [DonationsService],
})
export class DonationsModule {}
