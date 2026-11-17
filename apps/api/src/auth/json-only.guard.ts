import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';

// 세션을 시작하는 라우트는 JSON 본문만 받는다(login CSRF, #214).
// 다른 사이트의 HTML form은 application/json을 보낼 수 없다. 다른 origin의
// fetch가 JSON을 보내면 브라우저가 preflight를 먼저 보내고, API에는 CORS
// 허용이 없으므로 본 요청이 나가지 않는다. Origin을 보지 않으므로 Vite·Caddy
// 프록시나 LAN https 설정과 무관하다.
@Injectable()
export class JsonOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.is('application/json') !== 'application/json') {
      throw new UnsupportedMediaTypeException(
        'Content-Type must be application/json',
      );
    }
    return true;
  }
}
