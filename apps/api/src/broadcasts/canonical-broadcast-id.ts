import type { NextFunction, Request, Response } from 'express';

// Postgres uuid 컬럼은 대소문자를 가리지 않고 찾는다. 그런데 썸네일 rate
// 버킷과 썸네일 폴더는 `:id` 원문을 키로 쓴다. 그래서 같은 방송의 대소문자
// 변형마다 버킷과 폴더가 따로 생겼다(#210). 라우터가 경로를 맞추기 전에
// `/api/broadcasts/<uuid>`의 uuid를 소문자로 바꿔 두면, 그 뒤의 가드·파이프·
// 서비스는 모두 DB가 돌려주는 것과 같은 소문자 id만 본다.
const BROADCAST_ID =
  /^(\/api\/broadcasts\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/?]|$)/i;

export function canonicalBroadcastId(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  req.url = req.url.replace(
    BROADCAST_ID,
    (_, prefix: string, id: string) => prefix + id.toLowerCase(),
  );
  next();
}
