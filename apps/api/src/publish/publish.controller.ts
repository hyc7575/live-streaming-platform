import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
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

// The web app posts with no body, which Express 5 leaves undefined.
const issueSchema = z
  .object({ client: z.enum(['browser', 'obs']).default('browser') })
  .prefault({});

@Controller()
export class PublishController {
  private readonly logger = new Logger(PublishController.name);

  constructor(private readonly publish: PublishService) {}

  @Post('broadcasts/:id/publish-token')
  @UseGuards(LoggedInGuard, BroadcastOwnerGuard)
  issueToken(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodBodyPipe(issueSchema)) body: z.infer<typeof issueSchema>,
  ): Promise<PublishTicket> {
    return this.publish.issue(id, user.id, body.client);
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
    const target = publishTargetOf(url);
    // `closing` is a notification and OME ignores the reply. OME sends it
    // only for connections it admitted.
    if (status === 'closing') {
      if (direction === 'incoming' && target) {
        const started = await this.publish.disconnect(target.broadcastId);
        this.logger.log(
          `closing ${masked(url)} → ${started ? 'grace started' : 'no change'}`,
        );
      }
      return {};
    }
    if (direction !== 'incoming') return { allowed: true };
    const decision: AdmissionDecision = target
      ? await this.publish.admit(target)
      : { allowed: false, reason: 'unknown broadcast' };
    this.logger.log(`${masked(url)} → ${JSON.stringify(decision)}`);
    return decision;
  }
}

function masked(url: string): string {
  return url.replace(/token=[^&]*/, 'token=***');
}
