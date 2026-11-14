import { randomBytes, scryptSync } from 'node:crypto';
import { vi } from 'vitest';

// 운영 비용(N=2^15, r=8, p=3)의 scrypt는 CI에서 한 번에 0.2초쯤 걸린다.
// e2e는 테스트마다 사용자를 가입·로그인시키므로 이 시간이 API 테스트 시간의
// 대부분이 된다(#125). 테스트에서는 해시만 싼 비용으로 만든다.
// verifyPassword는 저장된 문자열의 비용을 읽으므로 원래 함수를 그대로 쓴다.
// 운영 비용은 password.spec.ts가 원래 모듈로 지킨다.
vi.mock('../../src/auth/password.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/auth/password.js')>();
  const N = 2 ** 10;
  const r = 8;
  const p = 1;
  return {
    ...actual,
    hashPassword: (password: string): Promise<string> => {
      const salt = randomBytes(16);
      const key = scryptSync(password, salt, 32, { N, r, p });
      return Promise.resolve(
        [
          'scrypt',
          N,
          r,
          p,
          salt.toString('base64'),
          key.toString('base64'),
        ].join('$'),
      );
    },
  };
});
