import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { isValidOmeSignature } from './admission.js';
import { PUBLISH_CONFIG, type PublishConfig } from './publish-config.js';

// body pipe보다 먼저 돈다. 그래서 서명 없는 요청은 내용을 하나도
// 읽기 전에 거부된다. 앱을 `rawBody: true`로 만들어야 한다.
@Injectable()
export class OmeSignatureGuard implements CanActivate {
  constructor(@Inject(PUBLISH_CONFIG) private readonly config: PublishConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const valid = isValidOmeSignature(
      this.config.omeWebhookSecret,
      req.rawBody ?? Buffer.alloc(0),
      req.header('x-ome-signature'),
    );
    if (!valid) {
      throw new UnauthorizedException({
        allowed: false,
        reason: 'invalid signature',
      });
    }
    return true;
  }
}
