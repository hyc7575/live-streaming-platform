import { defineConfig } from '@playwright/test';
import { loadEnv } from 'vite';

// vite.config.ts와 같은 방식으로 찾아, 개발 서버와 테스트가 저장소 루트 .env의
// WEB_PORT를 똑같이 쓴다. 셸에 WEB_PORT가 있으면 그 값이 우선한다.
const repoRoot = new URL('../..', import.meta.url).pathname;
const port = Number(loadEnv('development', repoRoot, '').WEB_PORT || 5173);

export const TONE_TAB_TITLE = 'lsp-e2e-tone';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${port}`,
    channel: 'chrome',
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        // --use-fake-ui-for-media-stream을 빼서, getDisplayMedia가 Chrome의 가짜 화면 대신
        // 제목으로 고른 실제 탭을 캡처한다.
        `--auto-select-tab-capture-source-by-title=${TONE_TAB_TITLE}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
    permissions: ['microphone'],
  },
  webServer: {
    command: 'pnpm dev',
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
