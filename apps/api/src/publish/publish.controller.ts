import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, LoggedInGuard } from '../auth/logged-in.guard.js';
import { BroadcastOwnerGuard } from '../broadcasts/broadcast-owner.guard.js';
import { ZodBodyPipe } from '../zod-body.pipe.js';
import {
  admissionRequestSchema,
  publishTargetOf,
  type AdmissionDecision,
  type AdmissionRequest,
} from './admission.js';
import { OmeSignatureGuard } from './ome-signature.guard.js';
import { PublishService, type PublishTicket } from './publish.service.js';

@Controller()
export class PublishController {
  private readonly logger = new Logger(PublishController.name);

  constructor(private readonly publish: PublishService) {}

  @Post('broadcasts/:id/publish-token')
  @UseGuards(LoggedInGuard, BroadcastOwnerGuard)
  issueToken(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PublishTicket> {
    return this.publish.issue(id, user.id);
  }

  // OME Admission Webhook. OME refuses the connection on anything but a 200
  // with `allowed: true`, so every failure path here is fail-closed.
  @Post('ome/admission')
  @HttpCode(200)
  @UseGuards(OmeSignatureGuard)
  async admission(
    @Body(new ZodBodyPipe(admissionRequestSchema)) body: AdmissionRequest,
  ): Promise<AdmissionDecision | Record<string, never>> {
    const { direction, status, url } = body.request;
    // `closing` is a notification and OME ignores the reply. Ending a
    // broadcast after a dropped connection lands with #12.
    if (status === 'closing') return {};
    if (direction !== 'incoming') return { allowed: true };
    const target = publishTargetOf(url);
    const decision: AdmissionDecision = target
      ? await this.publish.admit(target)
      : { allowed: false, reason: 'unknown broadcast' };
    this.logger.log(
      `${url.replace(/token=[^&]*/, 'token=***')} → ${JSON.stringify(decision)}`,
    );
    return decision;
  }
}
