import { defineConfig } from '@playwright/test';

const port = Number(process.env.WEB_PORT || 5173);

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
