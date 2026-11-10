import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = new URL('../..', import.meta.url).pathname;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  // A phone on the same Wi-Fi only gets the camera over https
  // (scripts/lan-https.sh makes the certificate).
  const https =
    env.WEB_HTTPS_CERT && env.WEB_HTTPS_KEY
      ? {
          cert: readFileSync(resolve(repoRoot, env.WEB_HTTPS_CERT)),
          key: readFileSync(resolve(repoRoot, env.WEB_HTTPS_KEY)),
        }
      : undefined;
  return {
    plugins: [react()],
    envDir: repoRoot,
    server: {
      port: Number(env.WEB_PORT || 5173),
      strictPort: true,
      https,
      host: https ? true : undefined,
      proxy: {
        '/api': `http://localhost:${env.API_PORT || 3000}`,
        // OME: WHIP publish and LL-HLS playback under the web origin, the way
        // Caddy serves them in production.
        '/app': `http://localhost:${env.OME_HTTP_PORT || 3333}`,
        // Recording files from the static server in compose.yaml, whose root
        // is the recordings folder itself. The prefix is stripped the way
        // Caddy's handle_path does in production.
        '/recordings': {
          target: `http://localhost:${env.RECORDINGS_HTTP_PORT || 8090}`,
          rewrite: (path) => path.replace(/^\/recordings/, ''),
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
