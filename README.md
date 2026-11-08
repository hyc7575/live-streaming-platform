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
cp .env.example .env                  # 비워 둔 값은 기본값을 쓴다
docker compose up -d --wait           # PostgreSQL + OME
pnpm dev                              # API :3000, 웹 :5173
```

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

## 환경변수

`.env.example`에 이름과 설명이 있다. compose, API, 웹이 모두 저장소 루트의 `.env` 하나를 읽는다. 값을 비워 두면 아래 기본값을 쓴다.

| 이름 | 기본값 | 쓰는 곳 |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `lsp` | compose 프로젝트 이름 (컨테이너·볼륨 이름 앞부분) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `lsp` / `lsp` / `lsp` | 로컬 PostgreSQL |
| `POSTGRES_HOST_PORT` | `5432` | PostgreSQL 호스트 포트 (127.0.0.1에만 연다) |
| `DATABASE_URL` | 없음 | API의 DB 연결 (Prisma 도입 이슈부터 사용) |
| `SESSION_SECRET` | 없음 | 세션 쿠키 서명 (인증 이슈부터 사용) |
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

### PC 화면 캡처·믹싱 (#21)

PC 스트리머의 화면, 화면 소리(탭 소리), 마이크를 브라우저에서 오디오 트랙 하나로 섞는다. 아직 송출하지 않는다.

자동 확인 (Google Chrome 필요, 가짜 마이크 사용):

```sh
pnpm --filter @lsp/web e2e            # headless. CI도 같은 명령을 돌린다
pnpm --filter @lsp/web e2e --headed   # 탭 소리 레벨까지 확인한다
```

테스트는 440Hz를 재생하는 탭을 열고, `/studio/pc`에서 그 탭을 화면으로 고른 뒤 다음을 확인한다.

- 미리보기 `<video>`의 스트림에 영상 트랙 1개, 오디오 트랙 1개가 있다.
- "방송 시작"을 누르면 오디오가 동작 중이다.
- 가짜 마이크의 비프음이 마이크 레벨에 잡히고, 섞인 출력 트랙에도 소리가 있다.
- "마이크 끄기"를 누르면 마이크 레벨이 0 근처(0.001 미만)로 떨어진다.
- "다시 선택"을 누르면 영상 트랙만 바뀌고 오디오 트랙은 1개로 유지된다.
- 캡처하던 탭을 닫으면(브라우저가 공유를 끝낸 경우) "화면 공유가 끝났습니다."가 뜨고, 마이크·화면·출력 트랙이 모두 `ended`다.
- `--headed`에서만: 탭에서 나는 소리가 화면 소리 레벨에 잡힌다. headless Chrome은 소리 출력이 없어 캡처한 탭 소리가 무음이다.

사람이 확인하는 절차:

1. `pnpm --filter @lsp/web dev`로 웹을 띄우고 Chrome에서 `/studio/pc`를 연다.
2. 다른 탭에서 소리가 나는 영상을 재생한다.
3. "화면 선택" → 공유 창의 "Chrome 탭"에서 그 탭을 고르고 "탭 오디오와 함께 공유"가 켜져 있는지 본 뒤 공유한다.
4. Chrome이 고른 탭으로 넘어가면 `/studio/pc` 탭으로 돌아온다. "화면 소리 있음"과 두 레벨 미터가 움직이는지 본다.
5. "마이크 끄기"를 누르면 마이크 미터가 멈추는지 본다.
6. Chrome 상단의 "공유 중지"를 누르면 "화면 공유가 끝났습니다."가 뜨고, 주소창의 마이크 표시가 꺼지는지 본다.

## 지원 환경

송출·시청 기능 이슈에서 실제로 확인한 환경만 적는다.

| 확인한 것 | 환경 | 결과 |
|---|---|---|
| 화면 공유 창의 "시스템 오디오와 함께 공유" 스위치 | macOS 26.5, Chrome 156 | "전체 화면" 탭에 스위치가 있고 기본값은 꺼짐이다. "Chrome 탭"에는 "탭 오디오와 함께 공유"(기본값 켜짐)가 있다 |
| 시스템 소리가 실제로 섞이는지 | macOS 26.5, Chrome 156 | 미확인. 전체 화면을 공유하려면 macOS 화면 녹화 권한이 필요하고, 자동 테스트로는 확인하지 않았다 |

macOS 시스템 소리를 직접 확인하는 절차: 시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹음에서 Chrome을 허용한다. `/studio/pc`에서 "화면 선택" → "전체 화면" → "시스템 오디오와 함께 공유"를 켜고 공유한다. 다른 앱(예: 음악 앱)에서 소리를 내고 화면 소리 미터가 움직이는지 본다.

## 사용한 오픈소스

기능 이슈에서 들인 라이브러리를 이름·링크·라이선스와 함께 적는다.

| 이름 | 쓰는 곳 | 라이선스 |
|---|---|---|
| [Playwright](https://playwright.dev) | 웹 e2e 테스트 (개발용, `apps/web/e2e`) | Apache-2.0 |
