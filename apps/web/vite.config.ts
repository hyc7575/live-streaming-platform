import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = new URL('../..', import.meta.url).pathname;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  return {
    plugins: [react()],
    envDir: repoRoot,
    server: {
      port: Number(env.WEB_PORT || 5173),
      strictPort: true,
      proxy: {
        '/api': `http://localhost:${env.API_PORT || 3000}`,
        // OME: WHIP publish and LL-HLS playback under the web origin, the way
        // Caddy serves them in production.
        '/app': `http://localhost:${env.OME_HTTP_PORT || 3333}`,
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
