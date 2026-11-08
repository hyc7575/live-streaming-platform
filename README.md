# 모닥: 실시간 방송 플랫폼

브라우저로 PC 화면이나 모바일 카메라를 송출하고, 시청자는 로그인 없이 보는 서비스다.

## 구성

| 경로 | 내용 |
|---|---|
| `apps/api` | NestJS API (TypeScript strict). 모든 경로는 `/api` 아래에 있다 |
| `apps/web` | React + Vite 웹 앱 (TypeScript strict). UI 지침은 `apps/web/CLAUDE.md` |
| `compose.yaml` | 로컬 개발용 PostgreSQL, OvenMediaEngine |
| `docs/` | PRD, pre-mortem, 작업 목록 |

## 실행 방법

필요한 것: Node.js 24 (`.nvmrc`), pnpm 11 (`corepack enable` 또는 `npm i -g pnpm`), Docker, gitleaks (`brew install gitleaks`).

```sh
pnpm install
git config core.hooksPath .githooks   # 커밋 전 비밀값 검사 훅
cp .env.example .env                  # DATABASE_URL, SESSION_SECRET을 채운다
docker compose up -d --wait           # PostgreSQL + OME
pnpm --filter @lsp/api db:migrate     # Prisma 마이그레이션 적용
pnpm dev                              # API :3000, 웹 :5173
```

`.env` 예시 (compose 기본값과 맞춘 값):

```sh
DATABASE_URL=postgresql://lsp:lsp@localhost:5432/lsp
SESSION_SECRET=<openssl rand -base64 32 결과>
```

`pnpm install`이 Prisma 클라이언트를 `apps/api/src/generated/`에 만든다(`postinstall`). 스키마를 바꾸면 `pnpm --filter @lsp/api db:migrate:dev --name <이름>`으로 마이그레이션 파일을 만들고 커밋한다.

브라우저에서 `http://localhost:5173`을 연다. 웹은 `/api` 요청을 Vite dev proxy로 API에 넘긴다. API 상태는 `curl http://localhost:3000/api/health`로 확인한다.

정리:

```sh
docker compose down      # 컨테이너만 내린다
docker compose down -v   # DB 볼륨까지 지운다
```

### 검사

CI(GitHub Actions)가 push와 pull request마다 같은 명령을 돌린다.

```sh
pnpm typecheck   # tsc --noEmit
pnpm lint        # ESLint + Prettier 검사
pnpm build
pnpm test        # API: Vitest + supertest, 웹: Vitest + Testing Library
pnpm format      # Prettier로 고친다
```

앱 하나만 돌리려면 `pnpm --filter @lsp/api test`처럼 쓴다.

**API 테스트는 실제 PostgreSQL이 필요하다.** `.env`의 `DATABASE_URL`로 접속하고, 테스트마다 모든 테이블을 비운다(`TRUNCATE`). 개발 데이터가 지워지니 필요하면 테스트용 DB를 따로 둔다. 순서:

```sh
docker compose up -d --wait postgres
pnpm --filter @lsp/api db:migrate
pnpm test
```

CI도 같은 순서로 GitHub Actions의 Postgres 서비스에 마이그레이션을 적용한 뒤 테스트를 돌린다. 테스트 파일은 DB를 같이 쓰므로 하나씩 차례로 돈다(`apps/api/vitest.config.ts`의 `fileParallelism: false`).

## 환경변수

`.env.example`에 이름과 설명이 있다. compose, API, 웹이 모두 저장소 루트의 `.env` 하나를 읽는다. 값을 비워 두면 아래 기본값을 쓴다.

| 이름 | 기본값 | 쓰는 곳 |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `lsp` | compose 프로젝트 이름 (컨테이너·볼륨 이름 앞부분) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `lsp` / `lsp` / `lsp` | 로컬 PostgreSQL |
| `POSTGRES_HOST_PORT` | `5432` | PostgreSQL 호스트 포트 (127.0.0.1에만 연다) |
| `DATABASE_URL` | 없음 (필수) | API·Prisma CLI·API 테스트의 DB 연결 |
| `SESSION_SECRET` | 없음 (필수) | 세션 쿠키 서명. 바꾸면 기존 로그인이 모두 풀린다 |
| `NODE_ENV` | 없음 | `production`이면 세션 쿠키에 `Secure`를 붙인다 |
| `API_PORT` / `WEB_PORT` | `3000` / `5173` | 개발 서버 포트 |
| `OME_HOST_IP` | `*` | OME가 ICE 후보로 알리는 주소 |
| `OME_HTTP_PORT` | `3333` | OME WebRTC 시그널링 + LL-HLS |
| `OME_ICE_UDP_PORTS` | `10000-10003` | OME WebRTC ICE (UDP 범위) |
| `OME_ICE_TCP_PORT` | `10000` | OME WebRTC ICE (TCP) |
| `OME_TURN_PORT` | `3478` | OME 내장 TURN (TCP) |

### 여러 worktree에서 동시에 띄우기

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

한계: `OME_HOST_IP`를 비우면 OME가 STUN으로 찾은 공인 IP와 컨테이너 내부 IP(172.x)를 ICE 후보로 알린다. 같은 Mac의 브라우저에서 WebRTC 송출을 하려면 `127.0.0.1`, 같은 Wi-Fi의 휴대폰에서 하려면 Mac의 LAN IP를 적어야 할 것으로 보인다. 이 부분은 아직 확인하지 않았고, OME 스파이크(#2)에서 확인한다.

## 커밋 전 비밀값 검사

`.githooks/pre-commit`이 스테이징된 변경을 gitleaks로 검사하고, 토큰·키·비밀번호가 있으면 커밋을 막는다. 저장소를 받은 뒤 한 번 설정한다.

```sh
git config core.hooksPath .githooks
```

비밀값은 `.env`에만 둔다. `.env`는 `.gitignore`에 있다.

## 기능 확인

기능 이슈가 끝날 때마다 확인 절차를 여기에 추가한다.

### 0. 회원가입·로그인·로그아웃과 세션 유지

자동 테스트는 `apps/api/test/auth.e2e.spec.ts`(실제 PostgreSQL)다. 다음을 확인한다.

- 가입 → 로그인 → `me` 200 → 로그아웃 → `me` 401
- 로그아웃 전 쿠키를 다시 보내도 401 (서버가 세션을 지운다)
- 앱 인스턴스를 닫고 새로 띄워도 같은 쿠키로 `me` 200 (재시작 후 유지)
- 쿠키 `HttpOnly`·`SameSite=Lax`, 운영 모드에서 https 프록시 뒤면 `Secure`
- 잘못된 비밀번호 401, 중복 이메일 409, 로그인 11번째 시도 429

화면에서 확인:

1. `http://localhost:5173`을 연다. 헤더 오른쪽에 "회원가입"과 "로그인"이 보인다.
2. "회원가입"에서 이메일, 닉네임, 비밀번호(8자 이상)를 넣고 "가입하기"를 누른다. 로그인 화면으로 넘어가고 이메일이 채워져 있다.
3. 비밀번호를 넣고 "로그인"을 누른다. 방송 목록으로 돌아가고 헤더에 닉네임과 "로그아웃"이 보인다.
4. 새로고침한다. 헤더에 닉네임이 그대로 있다.
5. API를 껐다 켠다(`pnpm dev` 재시작). 새로고침해도 닉네임이 그대로 있다. 세션이 PostgreSQL `session` 테이블에 있기 때문이다.
6. "로그아웃"을 누른다. 헤더가 "로그인"으로 바뀐다. 개발자 도구 콘솔에서 `fetch('/api/auth/me').then(r => r.status)`가 `401`이다.

API로 확인 (쿠키를 파일에 저장해 다시 쓴다):

```sh
API=http://localhost:3000/api
curl -s -X POST $API/auth/signup -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"password123","nickname":"스트리머A"}'
curl -s -c jar.txt -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"password123"}'
curl -s -b jar.txt $API/auth/me                    # 200, 사용자 정보
cp jar.txt old-jar.txt
curl -s -b jar.txt -X POST $API/auth/logout -o /dev/null -w '%{http_code}\n'   # 204
curl -s -b old-jar.txt $API/auth/me -o /dev/null -w '%{http_code}\n'           # 401
```

세션 쿠키 설정:

- `HttpOnly`, `SameSite=Lax`, 14일 유지. 이름은 `modak.sid`.
- `Secure`는 `NODE_ENV=production`일 때만 붙인다. 브라우저는 http로 받은 `Secure` 쿠키를 저장하지 않아서, 로컬 http 개발에서 켜면 로그인이 안 된다.
- API는 `trust proxy`를 1단(Caddy)으로 둔다. Caddy가 보낸 `X-Forwarded-Proto: https`로 https 요청임을 알고 `Secure` 쿠키를 발급하며, 요청 제한은 `X-Forwarded-For`의 클라이언트 IP로 센다. API 포트를 외부에 직접 열면 이 헤더를 위조할 수 있으니 Caddy 뒤에만 둔다.
- 요청 제한: 로그인은 IP당 1분에 10번, 회원가입은 IP당 1시간에 20번. 넘으면 429. 서버 메모리에 세므로 API를 재시작하면 초기화된다.

## 지원 환경

송출·시청 기능 이슈에서 실제로 확인한 환경만 적는다.

## 사용한 오픈소스

기능 이슈에서 들인 라이브러리를 이름·링크·라이선스와 함께 적는다.

| 이름 | 쓰는 곳 | 라이선스 |
|---|---|---|
| [Prisma](https://github.com/prisma/prisma) (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) | DB 스키마·마이그레이션·쿼리 | Apache-2.0 |
| [node-postgres](https://github.com/brianc/node-postgres) (`pg`) | PostgreSQL 연결 풀 | MIT |
| [express-session](https://github.com/expressjs/session) | 세션 쿠키 | MIT |
| [connect-pg-simple](https://github.com/voxpelli/node-connect-pg-simple) | 세션을 PostgreSQL에 저장 | MIT |
| [@nestjs/throttler](https://github.com/nestjs/throttler) | 로그인·회원가입 요청 제한 | MIT |
| [Zod](https://github.com/colinhacks/zod) | 요청 본문 검증 | MIT |
