import { defineConfig } from '@playwright/test';
import { loadEnv } from 'vite';

// vite.config.ts와 같은 방식으로 찾아, 개발 서버와 테스트가 저장소 루트 .env의
// WEB_PORT를 똑같이 쓴다. 셸에 WEB_PORT가 있으면 그 값이 우선한다.
const repoRoot = new URL('../..', import.meta.url).pathname;
const port = Number(loadEnv('development', repoRoot, '').WEB_PORT || 5173);

// 로컬 스택 전체에서 송출 → 시청을 확인한다: 웹 개발 서버, API,
// PostgreSQL, OME(README "송출에서 시청까지"). CI에는 OME가 없어 CI의 `e2e` job은
// 이것을 돌리지 않는다.
export default defineConfig({
  testDir: 'e2e-stack',
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${port}`,
    channel: 'chrome',
    viewport: { width: 1280, height: 900 },
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
    permissions: ['camera', 'microphone'],
  },
  webServer: {
    command: 'pnpm dev',
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
  },
});
