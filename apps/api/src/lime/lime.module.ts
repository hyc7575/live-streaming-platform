import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TossPaymentsModule } from '../donations/toss-payments.module.js';
import { LimeController } from './lime.controller.js';
import { LimeService } from './lime.service.js';

@Module({
  imports: [AuthModule, TossPaymentsModule],
  controllers: [LimeController],
  providers: [LimeService],
})
export class LimeModule {}
