import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  test: {
    // e2e 파일은 데이터베이스 하나를 같이 쓰고, 테스트 사이에 비운다.
    fileParallelism: false,
  },
});
