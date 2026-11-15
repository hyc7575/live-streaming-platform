# 개발 세부

루트 [README](../README.md)의 [실행 방법](../README.md#실행-방법)으로 로컬 스택을 띄운 뒤 필요한 세부다. 기능별 확인 절차는 [VERIFICATION.md](./VERIFICATION.md)에 있다.

## API 테스트 DB

**API 테스트는 실제 PostgreSQL이 필요하다.** `.env`의 `DATABASE_URL`로 접속하고, 테스트마다 모든 테이블을 비운다(`TRUNCATE`). 개발 데이터가 지워지니 테스트용 DB를 따로 둔다. API·Prisma CLI는 `.env`를 읽을 때 이미 있는 환경변수를 덮지 않으므로, 명령 앞에 `DATABASE_URL`을 붙이면 그 DB를 쓴다.

```sh
docker compose up -d --wait postgres
docker compose exec postgres createdb -U lsp lsp_test   # 처음 한 번
export DATABASE_URL=postgresql://lsp:lsp@localhost:5432/lsp_test
pnpm --filter @lsp/api db:migrate
pnpm test
```

여러 worktree에서 API 테스트를 동시에 돌리면 같은 DB를 서로 비운다. worktree마다 DB 이름을 다르게 둔다.

다른 브랜치를 받아 `apps/api/prisma/schema.prisma`가 바뀌었으면, 마이그레이션을 적용하고 Prisma 클라이언트를 다시 만든 뒤 API를 다시 띄운다. 클라이언트가 옛 스키마로 남으면 새 컬럼을 읽는 요청이 500으로 실패한다.

```sh
pnpm --filter @lsp/api db:migrate
pnpm --filter @lsp/api exec prisma generate
```

CI도 같은 순서로 GitHub Actions의 Postgres 서비스에 마이그레이션을 적용한 뒤 테스트를 돌린다. 테스트 파일은 DB를 같이 쓰므로 하나씩 차례로 돈다(`apps/api/vitest.config.ts`의 `fileParallelism: false`).

## 여러 worktree에서 동시에 띄우기

worktree마다 `.env`에 다른 프로젝트 이름과 포트를 적으면 서로 충돌하지 않는다.

```sh
COMPOSE_PROJECT_NAME=lsp-feature-x
POSTGRES_HOST_PORT=25433
OME_HTTP_PORT=23333
OME_ICE_UDP_PORTS=20000-20003
OME_ICE_TCP_PORT=20000
OME_TURN_PORT=23478
API_PORT=23000
WEB_PORT=25173
```

OME 포트는 호스트와 컨테이너가 **같은 번호**를 쓴다. OME가 ICE 후보에 자기가 듣는 포트 번호를 그대로 적어 브라우저에 알리기 때문에, `20000:10000`처럼 번호를 바꿔 연결하면 브라우저가 엉뚱한 포트로 접속한다. 그래서 compose는 위 변수로 OME 설정과 포트 연결을 함께 바꾼다.

한계: `OME_HOST_IP`를 비우면 OME가 STUN으로 찾은 공인 IP와 컨테이너 내부 IP(172.x)를 ICE 후보로 알린다. 같은 Mac의 브라우저에서 WebRTC 송출을 하려면 `OME_HOST_IP=127.0.0.1`을 적는다. 비우면 ICE가 `checking`에서 멈춰 송출이 실패한다(#2 실측, #10에서 이 값으로 송출 확인). 같은 Wi-Fi의 휴대폰에서 하려면 Mac의 LAN IP를 적어야 할 것으로 보인다(미확인).
