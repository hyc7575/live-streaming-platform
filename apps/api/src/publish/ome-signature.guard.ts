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

// Runs before the body pipe, so an unsigned request is refused before any of
// its content is read. Needs the app created with `rawBody: true`.
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
