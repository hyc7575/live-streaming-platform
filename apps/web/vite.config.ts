import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = new URL('../..', import.meta.url).pathname;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  // 같은 Wi-Fi의 휴대폰은 https에서만 카메라를 쓸 수 있다
  // (인증서는 scripts/lan-https.sh가 만든다).
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
        // OME: WHIP 송출과 LL-HLS 재생을 웹 origin 아래에 둔다. 운영에서
        // Caddy가 내주는 방식과 같다.
        '/app': `http://localhost:${env.OME_HTTP_PORT || 3333}`,
        // 녹화 파일은 compose.yaml의 정적 서버에서 받는다. 이 서버의 root는
        // 녹화 폴더 자체다. 운영에서 Caddy의 handle_path가 하듯이
        // 경로 앞부분을 떼어 낸다.
        '/recordings': {
          target: `http://localhost:${env.RECORDINGS_HTTP_PORT || 8090}`,
          rewrite: (path) => path.replace(/^\/recordings/, ''),
        },
        // API가 쓰는 썸네일. compose.yaml에서 같은 방식으로 내준다.
        '/thumbnails': {
          target: `http://localhost:${env.THUMBNAILS_HTTP_PORT || 8091}`,
          rewrite: (path) => path.replace(/^\/thumbnails/, ''),
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
