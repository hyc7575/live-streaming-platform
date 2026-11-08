import { defineConfig } from '@playwright/test';

const port = Number(process.env.WEB_PORT || 5173);

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
        // Without --use-fake-ui-for-media-stream, so getDisplayMedia captures
        // the real tab picked by title instead of Chrome's fake screen.
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
