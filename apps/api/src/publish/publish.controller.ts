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

// 웹 앱은 body 없이 POST하고, Express 5는 이를 undefined로 둔다.
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

  // OME Admission Webhook. OME는 `allowed: true`인 200이 아니면 연결을
  // 거부한다. 그래서 여기의 모든 실패 경로는 fail-closed다.
  @Post('ome/admission')
  @HttpCode(200)
  @UseGuards(OmeSignatureGuard)
  async admission(
    @Body(new ZodBodyPipe(admissionRequestSchema)) body: AdmissionRequest,
  ): Promise<AdmissionDecision | Record<string, never>> {
    const { direction, status, url } = body.request;
    const target = publishTargetOf(url);
    // `closing`은 알림이며 OME는 응답을 무시한다. OME는 자기가
    // 허용한 연결에만 이것을 보낸다.
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
