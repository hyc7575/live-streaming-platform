import { defineConfig } from '@playwright/test';
import { loadEnv } from 'vite';

// Same lookup as vite.config.ts, so the dev server and the tests agree on
// WEB_PORT from the repo-root .env. A WEB_PORT in the shell still wins.
const repoRoot = new URL('../..', import.meta.url).pathname;
const port = Number(loadEnv('development', repoRoot, '').WEB_PORT || 5173);

// Publish → watch against the whole local stack: web dev server, API,
// PostgreSQL and OME (README "송출에서 시청까지"). CI's `e2e` job does not run
// it because CI has no OME.
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
