FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --filter @lsp/api

COPY apps/api apps/api
RUN pnpm --filter @lsp/api build

WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 3000
# 마이그레이션이 실패하면 멈춘다. 게임 목록 시드(커밋된 data/games.json)는 실패해도
# 기존 Game 행으로 API를 띄운다. 게임 검색만 낡을 뿐 방송은 막지 않는다.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && { node dist/games-seed.js || echo '게임 목록 시드 실패, 기존 Game으로 계속한다' >&2; } && exec node dist/main.js"]
