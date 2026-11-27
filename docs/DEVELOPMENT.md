# 개발 세부

루트 [README](../README.md)의 [빠른 시작](../README.md#-빠른-시작)으로 로컬 스택을 띄운 뒤 필요한 세부다. 기능별 확인 절차는 [VERIFICATION.md](./VERIFICATION.md)에 있다.

## 환경변수

`.env.example`에 이름과 설명이 있다. compose, API, 웹이 모두 저장소 루트의 `.env` 하나를 읽는다. 값을 비워 두면 아래 기본값을 쓴다.

| 이름 | 기본값 | 쓰는 곳 |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `lsp` | compose 프로젝트 이름 (컨테이너·볼륨 이름 앞부분) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `lsp` / `lsp` / `lsp` | 로컬 PostgreSQL |
| `POSTGRES_HOST_PORT` | `5432` | PostgreSQL 호스트 포트 (127.0.0.1에만 연다) |
| `DATABASE_URL` | 없음 (필수) | API·Prisma CLI·API 테스트의 DB 연결 |
| `SESSION_SECRET` | 없음 (필수) | 세션 쿠키 서명. 송출 토큰 서명 키도 여기서 만든다. 바꾸면 기존 로그인과 발급된 송출 토큰이 모두 풀린다 |
| `OME_WEBHOOK_SECRET` | 없음 (필수) | OME Admission Webhook 서명 키. API와 OME가 같은 값을 읽는다 |
| `NODE_ENV` | 없음 | `production`이면 세션 쿠키에 `Secure`를 붙인다 |
| `TEST_ACCOUNTS_ENABLED` | 없음 (꺼짐) | `true`면 테스트 계정 원클릭 로그인을 켠다 |
| `TEST_ACCOUNT_A_EMAIL` / `TEST_ACCOUNT_B_EMAIL` | `streamer-a@modak.test` / `user-b@modak.test` | 테스트 계정 이메일 (시드와 API가 같이 읽는다) |
| `TEST_ACCOUNT_A_NICKNAME` / `TEST_ACCOUNT_B_NICKNAME` | `스트리머 A` / `사용자 B` | 테스트 계정 닉네임 (시드만 읽는다) |
| `TEST_ACCOUNT_A_PASSWORD` / `TEST_ACCOUNT_B_PASSWORD` | 없음 (시드에 필수) | 테스트 계정 비밀번호 (시드만 읽는다, 8자 이상) |
| `API_PORT` / `WEB_PORT` | `3000` / `5173` | 개발 서버 포트 |
| `OME_HOST_IP` | `*` | OME가 ICE 후보로 알리는 주소. 로컬 송출은 `127.0.0.1` |
| `OME_HTTP_PORT` | `3333` | OME WebRTC 시그널링 + LL-HLS |
| `OME_ICE_UDP_PORTS` | `10000-10003` | OME WebRTC ICE (UDP 범위) |
| `OME_ICE_TCP_PORT` | `10000` | OME WebRTC ICE (TCP) |
| `OME_TURN_PORT` | `3478` | OME 내장 TURN (TCP) |
| `OME_WEBHOOK_URL` | `http://host.docker.internal:${API_PORT}/api/ome/admission` | OME가 송출 허가를 묻는 API 주소 |
| `OME_API_ACCESS_TOKEN` | 없음 (필수) | OME 관리 API 토큰. API가 방송을 종료할 때 이 토큰으로 송출 연결을 끊는다. compose의 OME도 같은 값을 읽고, 비어 있으면 `docker compose`가 시작하지 않는다 |
| `OME_API_PORT` | `8081` | OME 관리 API의 호스트 포트. `127.0.0.1`에만 열린다 |
| `OME_API_URL` | `http://127.0.0.1:${OME_API_PORT}` | API가 부르는 OME 관리 API 주소 |
| `RECORDINGS_DIR` | 저장소 루트의 `recordings/` | 녹화 파일 폴더. OME가 쓰고 API가 용량을 재고 지운다. 바꾸려면 절대 경로를 넣는다 |
| `RECORDINGS_MAX_GB` | `10` | 녹화 저장 용량 상한(GiB). 넘으면 오래 전에 끝난 방송의 녹화부터 지운다. 송출 중인 녹화만으로 넘으면 끝난 방송의 녹화는 두고 송출 중인 녹화를 멈춘다 |
| `RECORDINGS_MAX_GB_PER_BROADCAST` | `3` | 방송 하나의 녹화 크기 상한(GiB). 넘으면 그 방송의 녹화만 멈추고 송출은 유지한다. 전체 상한보다 크면 전체 상한을 쓴다 |
| `RECORDINGS_MAX_HOURS_PER_BROADCAST` | `3` | 방송 하나의 녹화 시간 상한(시간). LIVE가 된 때부터 잰다 |
| `RECORDINGS_HTTP_PORT` | `8090` | 개발용 녹화 정적 서버의 호스트 포트(127.0.0.1에만 열린다). Vite가 `/recordings`를 여기로 넘긴다 |
| `THUMBNAILS_DIR` | 저장소 루트의 `thumbnails/` | 캡처 썸네일과 기본 대기 이미지 폴더. 바꾸려면 절대 경로를 넣는다 |
| `THUMBNAILS_HTTP_PORT` | `8091` | 개발용 썸네일 정적 서버의 호스트 포트(127.0.0.1에만 열린다). Vite가 `/thumbnails`를 여기로 넘긴다 |
| `TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` | 없음 (비우면 후원·충전만 503) | 토스 결제위젯 테스트 키(`test_gck_…`/`test_gsk_…`). 시크릿 키는 API만 읽는다. [도네이션](./VERIFICATION.md#8-도네이션-20) |
| `WEB_HTTPS_CERT` / `WEB_HTTPS_KEY` | 없음 | 같은 Wi-Fi 휴대폰 확인용 웹 https 인증서(`scripts/lan-https.sh`가 만든다). e2e를 돌릴 때는 비운다 |

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

한계: `OME_HOST_IP`를 비우면 OME가 STUN으로 찾은 공인 IP와 컨테이너 내부 IP(172.x)를 ICE 후보로 알린다. 같은 Mac의 브라우저에서 WebRTC 송출을 하려면 `OME_HOST_IP=127.0.0.1`을 적는다. 비우면 ICE가 `checking`에서 멈춰 송출이 실패한다(#2 실측, #10에서 이 값으로 송출 확인). 같은 Wi-Fi의 휴대폰에서 송출하려면 `scripts/lan-https.sh`를 돌린다. Mac의 LAN IP용 인증서를 만들고, `OME_HOST_IP`에 그 LAN IP를 적으라고 안내한다. 같은 Wi-Fi 송출은 2026-11-10 Galaxy S22에서 확인했다([VERIFICATION.md 지원 환경](./VERIFICATION.md#지원-환경)).
