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
cp .env.example .env                  # DATABASE_URL, SESSION_SECRET, OME_WEBHOOK_SECRET, OME_API_ACCESS_TOKEN, OME_HOST_IP를 채운다
docker compose up -d --wait           # PostgreSQL + OME
pnpm --filter @lsp/api db:migrate     # Prisma 마이그레이션 적용
pnpm dev                              # API :3000, 웹 :5173
```

`.env` 예시 (compose 기본값과 맞춘 값):

```sh
DATABASE_URL=postgresql://lsp:lsp@localhost:5432/lsp
SESSION_SECRET=<openssl rand -base64 32 결과>
OME_WEBHOOK_SECRET=<openssl rand -base64 32 결과>
OME_API_ACCESS_TOKEN=<openssl rand -hex 24 결과>
OME_HOST_IP=127.0.0.1
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

한계: `OME_HOST_IP`를 비우면 OME가 STUN으로 찾은 공인 IP와 컨테이너 내부 IP(172.x)를 ICE 후보로 알린다. 같은 Mac의 브라우저에서 WebRTC 송출을 하려면 `OME_HOST_IP=127.0.0.1`을 적는다. 비우면 ICE가 `checking`에서 멈춰 송출이 실패한다(#2 실측, #10에서 이 값으로 송출 확인). 같은 Wi-Fi의 휴대폰에서 하려면 Mac의 LAN IP를 적어야 할 것으로 보인다(미확인).

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
4. Chrome이 고른 탭으로 넘어가면 `/studio/pc` 탭으로 돌아온다. "화면 소리가 잡히지 않습니다" 경고가 없고 두 레벨 미터가 움직이는지 본다.
5. "마이크 끄기"를 누르면 마이크 미터가 멈추는지 본다.
6. Chrome 상단의 "공유 중지"를 누르면 "화면 공유가 끝났습니다."가 뜨고, 주소창의 마이크 표시가 꺼지는지 본다.

### 송출 사전 점검 (#14)

인수 시나리오 10: PC 송출에서 "오디오 공유"를 체크하지 않고 화면 선택 → 사전 점검 화면에 경고 + "다시 선택" 표시.

`/studio/pc`에서 화면을 고르면 미리보기 옆에 마이크·화면 소리 레벨 미터 2개와 점검 결과가 뜬다.

| 상황 | 화면에 보이는 것 |
|---|---|
| 화면 소리 트랙이 없다(탭 오디오 공유를 끔, 창 공유, macOS 전체 화면) | 빨간 경고 "화면 소리가 잡히지 않습니다…"와 테두리가 강조된 "다시 선택" |
| 화면 소리 트랙은 있지만 3초 넘게 조용하다 | 흐린 안내 "화면 소리가 아직 들리지 않습니다…" (소리가 나면 사라진다) |
| 마이크가 빠졌다 | 빨간 경고 "마이크 연결이 끊겼습니다…"와 "처음부터 다시" |
| Firefox, Safari | 화면을 고르기 전부터 "이 브라우저는 화면 소리를 공유하지 못합니다…" |
| 모바일 브라우저(화면 공유 없음) | "이 브라우저는 화면 공유를 지원하지 않습니다…" |
| Chrome·Edge가 아닌 Chromium(웨일, 오페라) | 흐린 안내 "화면 소리는 Chrome과 Edge에서만 확인했습니다…" |

"방송 시작"은 경고가 있어도 누를 수 있다. 화면 소리 없이 슬라이드만 송출하는 경우도 있어서다.

자동 확인 (`pnpm --filter @lsp/web e2e`, `apps/web/e2e/preflight.spec.ts`):

- 오디오 트랙이 없는 화면을 고르면 경고와 "다시 선택"이 뜬다. "다시 선택"으로 소리 있는 화면을 고르면 경고가 사라지고, 마이크(가짜 마이크 비프)와 화면 소리 미터가 둘 다 0.01을 넘는다.
- 무음 화면 소리는 안내만 뜨고 경고(`role="alert"`)는 없다.
- 마이크 트랙의 `ended`를 일으키면 경고가 뜨고, "처음부터 다시"로 마이크를 다시 받는다.
- 사용자 에이전트를 Firefox·Safari로 바꾸면 화면 소리 미지원 경고가 뜬다. 브라우저 판정 표는 `src/capture/screenAudioSupport.test.ts`다.
- headless Chrome은 캡처한 탭 소리가 무음이라, 이 테스트는 `getDisplayMedia`가 돌려준 오디오 트랙을 지우거나(트랙 없음) 페이지가 만든 440Hz 트랙으로 바꾼다(소리 있음). 진짜 탭 소리는 `pcCapture.spec.ts`의 `--headed` 실행이 확인한다.

사람이 확인하는 절차 (Chrome):

1. `pnpm --filter @lsp/web dev`로 웹을 띄우고 `/studio/pc`를 연다. 다른 탭에서 소리 나는 영상을 재생한다.
2. "화면 선택" → 공유 창의 "Chrome 탭"에서 그 탭을 고르고 **"탭 오디오와 함께 공유"를 끈 채** 공유한다.
3. `/studio/pc` 탭으로 돌아온다. "화면 소리가 잡히지 않습니다"와 강조된 "다시 선택"이 보인다.
4. "다시 선택" → 같은 탭을 고르고 이번에는 "탭 오디오와 함께 공유"를 켠다. 경고가 사라지고 화면 소리 미터가 움직인다. 마이크에 말하면 마이크 미터도 움직인다.
5. Firefox나 Safari로 `/studio/pc`를 연다. "이 브라우저는 화면 소리를 공유하지 못합니다"가 보인다.

### 1. 방송 생성·공개 목록·내 방송·상세

인수 시나리오 1: 비로그인으로 목록 진입 → 방송 생성 버튼 클릭 → 로그인 페이지로 이동 (API는 401).

자동 테스트는 `apps/api/test/broadcasts.e2e.spec.ts`(실제 PostgreSQL)와 `apps/web/src/broadcast-pages.test.tsx`다. 다음을 확인한다.

- 비로그인 생성 401(저장되지 않음), 로그인 생성 201 + `READY`, 제목 누락·공백·100자 초과와 설명 2000자 초과는 400
- 공개 목록은 `LIVE` → `ENDED` 순서이고 `READY`는 없다. 다른 사용자의 `READY`도, 내 `READY`도 없다
- `?status=LIVE`, `?status=ENDED` 필터. 그 밖의 값(`READY` 포함)은 400
- 내 방송은 내 방송만 상태와 관계없이 보여 주고, 비로그인은 401
- 상세는 누구나 `READY`·`LIVE`·`ENDED`를 200으로 받는다. 없는 id와 형식이 잘못된 id는 모두 404
- 화면: 비로그인으로 "방송 만들기"를 누르면 로그인 화면, 로그인하면 만들기 화면으로 돌아옴, 내 방송의 `READY`는 "방송 전", `READY` 상세는 "아직 시작하지 않은 방송입니다."

화면에서 확인:

1. 로그아웃 상태로 `http://localhost:5173`을 연다. "방송 목록"과 전체/LIVE/방송 종료 필터가 보인다.
2. "방송 만들기"를 누른다. 로그인 화면으로 간다.
3. 로그인한다(계정이 없으면 "회원가입"으로 가입한 뒤 로그인). "방송 만들기" 화면으로 돌아온다.
4. 제목과 설명을 넣고 "만들기"를 누른다. "내 방송"으로 가고 새 방송 카드에 "방송 전" 배지가 있다.
5. 카드를 누른다. 플레이어 자리에 "아직 시작하지 않은 방송입니다."가 보인다. 주소를 복사해 시크릿 창에서 열어도 같다.
6. "방송 목록"으로 간다. 방금 만든 방송이 보이지 않는다.

LIVE·ENDED 방송은 송출 기능이 생기기 전까지 DB에서 직접 만든다.

```sh
docker compose exec postgres psql -U lsp -d lsp -c \
  "UPDATE \"Broadcast\" SET status='LIVE', \"startedAt\"=now() WHERE title='<제목>'"
```

API로 확인:

```sh
API=http://localhost:3000/api
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/broadcasts \
  -H 'Content-Type: application/json' -d '{"title":"첫 방송"}'          # 401
curl -s -b jar.txt -X POST $API/broadcasts -H 'Content-Type: application/json' \
  -d '{"title":"첫 방송","description":"설명"}'                          # 201, status READY
curl -s $API/broadcasts                    # LIVE·ENDED만
curl -s "$API/broadcasts?status=LIVE"      # LIVE만
curl -s -b jar.txt $API/me/broadcasts      # 내 방송 (READY 포함)
curl -s $API/broadcasts/<id>               # 상세, 없으면 404
```

### 테스트 계정 원클릭 로그인

심사자가 계정을 만들지 않고 버튼 하나로 **스트리머 A** 또는 **사용자 B**가 된다. A는 방송을 만드는 스트리머, B는 A의 방송에 대한 수정·종료가 거절(403)되는지 확인하는 다른 사용자다.

**공개 테스트 계정이다.** 서비스에 들어오는 누구나 버튼으로 A나 B가 될 수 있다. 심사용이라 운영 배포에서도 켠다. 개인 정보나 중요한 데이터를 두지 않는다.

준비 (한 번):

```sh
# .env에 추가한다. 비밀번호는 저장소에 올리지 않는다
TEST_ACCOUNTS_ENABLED=true
TEST_ACCOUNT_A_PASSWORD=<8자 이상>
TEST_ACCOUNT_B_PASSWORD=<8자 이상>

pnpm --filter @lsp/api db:seed   # API를 빌드하고 두 계정을 만든다
```

- 시드는 몇 번을 돌려도 계정 2개로 끝난다. 이메일이 같으면 닉네임과 비밀번호를 환경변수 값으로 덮어쓴다. 비밀번호를 바꾸려면 값을 바꾸고 다시 돌린다.
- 비밀번호가 없거나 8자보다 짧으면 `Seed failed: TEST_ACCOUNT_A_PASSWORD is not set`처럼 알리고 아무것도 쓰지 않고 실패한다(종료 코드 1).
- 이메일·닉네임을 비우면 `streamer-a@modak.test`·`스트리머 A`, `user-b@modak.test`·`사용자 B`를 쓴다.
- `TEST_ACCOUNTS_ENABLED`를 바꾸면 API를 재시작한다.

화면에서 확인:

1. `http://localhost:5173/login`을 연다. 로그인 카드 아래에 "테스트 계정으로 로그인"과 "스트리머 A"·"사용자 B" 버튼이 있다.
2. "스트리머 A"를 누른다. 방송 목록으로 돌아가고 헤더에 "스트리머 A"와 "로그아웃"이 보인다.
3. "로그아웃" → 헤더의 "로그인" → "사용자 B"를 누른다. 헤더에 "사용자 B"가 보인다.
4. `TEST_ACCOUNTS_ENABLED`를 지우고 API를 재시작하면 로그인 화면에서 버튼 영역이 사라진다.

테스트 계정도 일반 계정이라 로그인 폼에 이메일과 `.env`의 비밀번호를 넣어도 로그인된다. 이 README에는 비밀번호를 적지 않는다(PRD §7.9). 버튼은 비밀번호 없이 동작하므로 심사자는 버튼만 쓰면 된다.

API로 확인:

```sh
API=http://localhost:3000/api
curl -s $API/auth/test-accounts                     # {"accounts":["A","B"]}, 꺼져 있으면 {"accounts":[]}
curl -s -c jar.txt -X POST $API/auth/test-login -H 'Content-Type: application/json' \
  -d '{"account":"A"}'                              # 200, A의 사용자 정보. 꺼져 있으면 404
curl -s -b jar.txt $API/auth/me                     # A
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/auth/test-login \
  -H 'Content-Type: application/json' -d '{"account":"C"}'   # 400
```

동작 방식:

- 버튼은 `POST /api/auth/test-login {"account":"A"|"B"}`를 부른다. 서버가 환경변수의 이메일로 계정을 찾아 세션을 만든다. 비밀번호가 브라우저나 웹 번들로 가지 않는다.
- `GET /api/auth/test-accounts`는 기능이 켜져 있고 시드된 계정만 돌려준다. 로그인 화면은 이 목록이 비면 버튼 영역을 숨긴다.
- 요청 제한은 일반 로그인과 같다(IP당 1분에 10번).
- 자동 테스트는 `apps/api/test/test-accounts.e2e.spec.ts`(실제 PostgreSQL)와 `apps/web/src/pages/LoginPage.test.tsx`다. 시드 두 번 실행 후 사용자 2명, A·B 로그인 후 `me`, 꺼짐 404, 잘못된 `account` 400, 응답과 로그에 비밀번호가 없는지, 버튼 표시·숨김을 확인한다. 비밀번호는 테스트가 실행마다 무작위로 만든다.

### 2. 방송 수정·삭제와 인가 매트릭스

인수 시나리오 2-1: A가 자기 방송(READY 또는 ENDED)의 제목을 수정 → 목록·상세에 반영 → 삭제 → 목록에서 사라짐.
인수 시나리오 4: 사용자 B가 A의 방송 수정·삭제 시도 → 403. UI에서는 버튼이 보이지 않고, API를 직접 불러도 거절된다. 종료 시도는 종료 기능(#11)이 생길 때 추가한다.

수정·삭제는 `로그인 확인 → 소유자 확인` 순서로 거른다(`LoggedInGuard` → `BroadcastOwnerGuard`). 비로그인은 방송을 찾기 전에 401, 로그인한 사용자가 없는 방송을 부르면 404, 남의 방송은 403이다. 소유자 확인이 본문 검증보다 먼저라서, 타인은 본문이 틀려도 400이 아니라 403을 받는다.

인가 매트릭스 (PRD §7.5 중 지금 있는 행). 자동 테스트는 `apps/api/test/authorization-matrix.e2e.spec.ts`(실제 PostgreSQL)이고, 이 표를 같은 모양의 테이블(`MATRIX`)로 들고 있다.

| 행위 | API | 비로그인 | 로그인(타인) | 소유자 |
|---|---|---|---|---|
| 방송 목록 조회 | `GET /api/broadcasts` | 200 | 200 | 200 |
| 방송 상세 조회 | `GET /api/broadcasts/:id` | 200 | 200 | 200 |
| 방송 생성 | `POST /api/broadcasts` | 401 | 201 | — |
| 방송 수정 | `PATCH /api/broadcasts/:id` | 401 | 403 | 200 |
| 방송 삭제 | `DELETE /api/broadcasts/:id` | 401 | 403 | 204 (LIVE면 409) |
| 내 방송 조회 | `GET /api/me/broadcasts` | 401 | 200 (자기 것만) | 200 |
| 송출 토큰 발급 | `POST /api/broadcasts/:id/publish-token` | 401 | 403 | 201 (ENDED면 409) |

- 표의 칸마다 대상 방송이 `READY`·`LIVE`·`ENDED`일 때를 모두 돌린다(20칸 × 3 = 60건).
- 거절된 칸(401·403·409)은 요청 뒤 `Broadcast` 테이블 전체가 요청 전과 같은지 확인한다.
- 허용된 칸은 효과를 API로 다시 읽어 확인한다. 수정 뒤 상세·내 방송·공개 목록에 새 제목이 보이고(`READY`는 원래 공개 목록에 없다), 본문에 함께 보낸 `status`는 무시된다. 삭제 뒤 상세는 404이고 내 방송과 공개 목록에서 사라진다.
- 순서 확인: 없는 방송과 형식이 틀린 id에 비로그인 401, 로그인 404. 틀린 본문에 비로그인 401, 타인 403, 소유자 400. 로그아웃한 소유자는 401.
- 아직 없는 행(종료, Webhook의 유예 중 재접속, 스트림 키, 댓글, 후원)은 `it.todo`로 남겨 테스트 출력에 todo로 보인다.

수정 규칙(`apps/api/test/broadcasts.e2e.spec.ts`): 보낸 필드만 바꾸고 생성과 같은 검증(제목 1~100자, 설명 2000자 이하, 앞뒤 공백 제거)을 한다. 빈 본문과 모르는 필드만 있는 본문은 400이다. `LIVE` 방송도 제목·설명은 고칠 수 있다.

LIVE 방송 삭제: PRD §7.4는 "서버가 먼저 종료 처리한 뒤 삭제"다. 종료 처리(미디어 서버의 송출 연결 끊기)는 #11에서 생기므로, 그 전까지 `LIVE` 삭제는 409 `방송을 종료한 뒤 삭제하세요.`로 거절한다.

화면에서 확인 (위 절의 테스트 계정 "스트리머 A"·"사용자 B"를 쓴다. B는 다른 브라우저나 시크릿 창에서 로그인한다. 직접 가입한 두 계정으로 해도 같다):

1. "스트리머 A"로 로그인해 방송을 만든다. "내 방송"에서 카드를 눌러 상세로 간다. 설명 아래에 "수정"과 "삭제"가 보인다.
2. "수정"을 누른다. 제목과 설명이 채워진 "방송 수정" 화면이 열린다. 제목을 바꾸고 "저장"을 누른다. 상세로 돌아오고 새 제목이 보인다. "내 방송" 카드도 새 제목이다.
3. 위 절의 `psql` 명령으로 이 방송을 `ENDED`로 바꾼다(`status='ENDED', "startedAt"=now(), "endedAt"=now()`). "방송 목록"에 새 제목으로 보인다.
4. "사용자 B" 창에서 같은 상세 주소를 연다. "수정"과 "삭제"가 보이지 않는다. 로그아웃 상태에서도 보이지 않는다. B가 `/studio/broadcasts/<id>/edit`을 직접 열면 "권한이 없습니다"가 보인다.
5. A 창에서 "삭제" → "삭제하기"를 누른다. "내 방송"으로 가고 카드가 없다. "방송 목록"에서도 사라졌다.
6. `LIVE`로 바꾼 방송의 상세에서는 "삭제" 대신 "송출 중인 방송은 종료한 뒤 삭제할 수 있습니다."가 보인다.

API로 확인 (테스트 계정 A·B로 쿠키를 새로 받는다. 앞 절에서 로그아웃한 `jar.txt`는 세션이 지워져 쓸 수 없다):

```sh
API=http://localhost:3000/api
curl -s -c a-jar.txt -X POST $API/auth/test-login -H 'Content-Type: application/json' \
  -d '{"account":"A"}' -o /dev/null
curl -s -c b-jar.txt -X POST $API/auth/test-login -H 'Content-Type: application/json' \
  -d '{"account":"B"}' -o /dev/null
ID=$(curl -s -b a-jar.txt -X POST $API/broadcasts -H 'Content-Type: application/json' \
  -d '{"title":"A의 방송"}' | sed -E 's/^\{"id":"([^"]+)".*/\1/')

# 비로그인 401, B 403. 그 뒤에도 제목은 그대로다
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH $API/broadcasts/$ID \
  -H 'Content-Type: application/json' -d '{"title":"뺏은 제목"}'                      # 401
curl -s -o /dev/null -w '%{http_code}\n' -b b-jar.txt -X PATCH $API/broadcasts/$ID \
  -H 'Content-Type: application/json' -d '{"title":"뺏은 제목"}'                      # 403
curl -s -o /dev/null -w '%{http_code}\n' -b b-jar.txt -X DELETE $API/broadcasts/$ID  # 403
curl -s $API/broadcasts/$ID                                                         # 제목 "A의 방송"

# A는 수정·삭제할 수 있다
curl -s -b a-jar.txt -X PATCH $API/broadcasts/$ID -H 'Content-Type: application/json' \
  -d '{"title":"고친 제목"}'                                                          # 200, 새 제목
curl -s -o /dev/null -w '%{http_code}\n' -b a-jar.txt -X DELETE $API/broadcasts/$ID    # 204
curl -s -o /dev/null -w '%{http_code}\n' $API/broadcasts/$ID                        # 404
```

### 3. 송출에서 시청까지 (#10)

인수 시나리오 1의 앞부분: 스트리머가 카메라·마이크를 송출하면 방송이 `LIVE`가 되고, 로그인하지 않은 시청자가 LL-HLS로 본다. 끊긴 송출의 유예·정리(#12), PC 화면 송출(#13)은 아직 없다. 종료는 아래 4절에 있다.

흐름 (PRD §7.6):

1. 송출 화면(`/studio/broadcasts/:id`)이 `POST /api/broadcasts/:id/publish-token`을 부른다. 소유자만 받는다(비로그인 401, 타인 403). 같은 스트리머의 다른 방송이 `LIVE`면 409 `기존 방송을 종료하세요.`, 이 방송이 `ENDED`면 409다. 응답은 5분짜리 토큰이 붙은 같은 출처 경로 `/app/<방송 id>?direction=whip&transport=all&token=...`이다.
2. 브라우저가 OvenLiveKit으로 이 경로에 WHIP 송출을 연다(H.264 고정). 개발 중에는 Vite가 `/app`을 OME(`OME_HTTP_PORT`)로 넘긴다.
3. OME가 Admission Webhook으로 `POST /api/ome/admission`에 전체 URL을 보낸다. API는 `X-OME-Signature`(HMAC-SHA1, `OME_WEBHOOK_SECRET`)를 원본 바이트로 검증하고(틀리면 401), 토큰과 방송 상태를 보고 `READY`일 때만 `{"allowed":true}`를 돌려주며 조건부 update 한 번으로 `READY → LIVE`(`startedAt` 기록)로 바꾼다. 거절하면 OME가 WHIP에 401을 준다.
4. 시청 화면(`/broadcasts/:id`)은 `LIVE`면 `/app/<방송 id>/llhls.m3u8`을 재생한다. 송출 직후 약 10초 동안은 OME가 플레이리스트를 404로 주므로 "방송을 불러오는 중입니다"를 띄우고 2초마다 다시 시도한다.

한 스트리머의 `LIVE` 방송은 DB가 하나만 허용한다(`Broadcast_one_live_per_streamer` 부분 유니크 인덱스). 두 방송의 허가 요청이 동시에 와도 하나만 `LIVE`가 된다.

자동 테스트:

- `apps/api/test/publish.e2e.spec.ts` (실제 PostgreSQL, `pnpm test`): 토큰 발급 201·401·403·404·409(다른 방송 LIVE)·409(ENDED). Webhook은 서명 없음·위조·다른 키·본문을 바꾼 경우 401, 토큰 없음·변조·만료·다른 방송의 토큰 거절, `ENDED`·`LIVE` 거절, `READY` 허가 후 `LIVE`와 `startedAt`, 같은 스트리머의 두 번째 방송 거절, `closing`은 `{}`만 돌려주고 상태 그대로.
- `apps/api/test/publish-token.spec.ts`, `admission.spec.ts`: 토큰·서명·판정 순수 함수.
- `apps/web/e2e-stack/publishToWatch.spec.ts`: 실제 OME까지 이어서 확인한다(아래).

실제 OME로 확인 (Google Chrome 필요, 가짜 카메라·마이크 사용). `.env`에 `OME_HOST_IP=127.0.0.1`과 `OME_WEBHOOK_SECRET`을 채운다.

```sh
docker compose up -d --wait            # PostgreSQL + OME (ome/Server.xml)
pnpm --filter @lsp/api db:migrate
pnpm --filter @lsp/api dev             # API :3000. OME가 host.docker.internal:3000으로 허가를 묻는다
pnpm --filter @lsp/web e2e:stack       # 웹 dev 서버가 없으면 띄운다. WEB_PORT를 바꿨으면 같은 값을 앞에 붙인다
```

`e2e:stack`은 CI의 `e2e` 작업에 들어가지 않는다(CI에는 OME가 없다). 아래 두 테스트와 4절의 종료 테스트를 돌린다.

- 새 계정으로 방송을 만들고 송출 화면에서 "카메라 켜기" → "방송 시작"을 누른다. "송출 중입니다."가 뜨고 `GET /api/broadcasts/:id`가 `LIVE`가 된다. 로그인하지 않은 새 브라우저 컨텍스트가 시청 화면을 열면 hls.js(`blob:` 주소)로 재생되고, `currentTime`이 늘고 `videoWidth`가 0보다 크다. 같은 스트리머가 두 번째 방송의 송출 화면에서 "방송 시작"을 누르면 "기존 방송을 종료하세요."가 뜬다.
- 토큰 없이, 엉터리 토큰으로, 다른 방송의 토큰으로 `/app/<id>?direction=whip...`에 WHIP을 보내면 모두 401이고 방송은 `READY` 그대로다.

`SCREENSHOT_DIR=<폴더>`를 앞에 붙이면 송출 화면과 시청 화면을 `publish-live.png`, `viewer-playing.png`로 남긴다.

화면에서 확인:

1. 위 명령으로 PostgreSQL, OME, API를 띄우고 `pnpm --filter @lsp/web dev`로 웹을 띄운다.
2. "스트리머 A"로 로그인해 방송을 만들고 상세로 간다. 설명 아래 "송출 화면"을 누른다.
3. "카메라 켜기"를 누르고 카메라·마이크를 허용한다. 미리보기가 보인다. "방송 시작"을 누른다. 몇 초 안에 "송출 중입니다. 시청자가 방송을 볼 수 있습니다."가 뜬다.
4. 시크릿 창(로그인 안 함)에서 "시청 화면 열기" 주소를 연다. "방송을 불러오는 중입니다"가 약 10초 보인 뒤 카메라 영상이 재생된다. 상태 배지는 LIVE다.
5. API 로그에 `PublishController`의 `... token=*** → {"allowed":true}` 한 줄이 남는다(토큰은 가린다).
6. A가 다른 방송을 하나 더 만들고 그 송출 화면에서 "방송 시작"을 누르면 "기존 방송을 종료하세요."가 뜬다.
7. 송출 화면에서 "방송 종료" → "종료하기"를 누른다. 이어지는 확인은 4절에 있다.

API로 거절 확인 (토큰이 없거나 틀리면 OME가 401을 준다):

```sh
ID=<READY 방송 id>
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/sdp' --data-binary $'v=0\r\n' \
  "http://localhost:3333/app/$ID?direction=whip&transport=all&token=bad"   # 401
curl -s http://localhost:3000/api/broadcasts/$ID                           # status "READY" 그대로
```

### 4. 방송 종료 (#11)

인수 시나리오 5, 9: 스트리머가 종료하면 송출이 끊기고, 시청 화면은 10초 안에 "방송이 끝났습니다."로 바뀌며, 같은 방송으로 다시 송출할 수 없다. 탭을 닫거나 네트워크가 끊긴 비정상 종료와 재접속 유예는 #12에서 다룬다.

흐름 (PRD §7.4, §7.6):

1. 송출 화면에서 "방송 종료" → "종료하기"를 누른다. 브라우저가 먼저 PeerConnection을 닫고 송출에 쓴 트랙 복제본과 카메라·마이크 원본 트랙을 모두 멈춘 뒤 `POST /api/broadcasts/:id/end`를 부른다. 송출 중에 카메라나 마이크가 꺼져도 같은 API를 부른다.
2. API는 소유자만 받는다(비로그인 401, 타인 403, 없는 방송 404). `LIVE`를 `ENDED`로 바꾸고 `endedAt`을 기록한 **다음** OME 관리 API `DELETE /v1/vhosts/default/apps/app/streams/<방송 id>`로 송출 연결을 끊는다. 순서가 반대면 그 사이 재접속이 허가될 수 있다. OME의 404(송출 없음)는 성공으로 본다.
3. 이미 `ENDED`인 방송에 다시 부르면 200이고 `endedAt`은 그대로다. OME DELETE는 다시 보낸다. 그래서 OME 호출이 실패해 502를 받았더라도 다시 부르면 끊긴다. `READY` 방송은 409 `아직 시작하지 않은 방송은 종료할 수 없습니다.`다.
4. 끊긴 송출자가 다시 접속하면 Admission Webhook이 `ENDED`를 보고 `{"allowed":false,"reason":"broadcast ended"}`로 거절한다. 송출 토큰 발급도 409다.
5. 시청 화면은 방송 상태를 5초마다 조회하고, hls.js 치명적 오류(네이티브 HLS는 `<video>`의 `error`·`stalled`) 때도 바로 조회한다. `ENDED`면 플레이어를 내리고 "방송이 끝났습니다."를 띄운다.
6. `LIVE` 방송 삭제는 이제 409가 아니다. 같은 방식으로 종료한 뒤 삭제한다(204).
7. 지금 송출하지 않는 곳에서도 종료할 수 있다. 상세 화면의 소유자 버튼에 `LIVE`일 때만 "방송 종료"가 있다. 새로고침했거나 송출이 끊긴 송출 화면에도 "방송 종료"가 남는다. 어느 쪽이든 같은 API를 부르고, 송출 중이던 탭은 연결이 끊기면 상태를 다시 읽어 "방송이 종료되었습니다."를 띄운다.

자동 테스트:

- `apps/api/test/authorization-matrix.e2e.spec.ts`: "방송 종료" 행. 비로그인 401, 타인 403, 소유자는 `READY` 409, `LIVE`·`ENDED` 200. 거절된 칸은 DB와 OME 호출이 모두 그대로다. 허용된 칸에서는 OME 호출 시점에 DB가 이미 `ENDED`다. "방송 삭제"의 소유자 칸은 모든 상태에서 204다.
- `apps/api/test/broadcasts.e2e.spec.ts`: OME 호출이 실패하면 502이고 DB는 `ENDED`다. 다시 부르면 200이고 `endedAt`이 같다. `LIVE` 삭제도 같은 방식으로 다시 시도하면 204다.
- `apps/api/test/publish.e2e.spec.ts`: Webhook으로 `LIVE`가 된 뒤 종료하면, 새로 받은 유효한 토큰으로 재접속해도 `broadcast ended`로 거절된다.
- `apps/api/test/ome-api.spec.ts`: OME 관리 API 클라이언트의 경로와 `Basic` 인증 헤더. 200·404는 성공이고 401·500·연결 실패는 오류다.
- `apps/web/e2e-stack/publishToWatch.spec.ts` (실제 OME): 송출하고 시청자가 재생하는 것을 확인한 뒤 종료한다. 시청 화면은 "방송이 끝났습니다."로 10초 안에 바뀌고 플레이어가 사라진다. 송출 화면의 원본 트랙과 복제본은 모두 `ended`다. 종료 전에 받아 둔 토큰으로 WHIP을 다시 보내면 401이고 토큰 재발급은 409다. 다른 테스트는 송출 중에 상세 화면에서 종료하고, 송출 탭이 "방송이 종료되었습니다."로 바뀌는 것을 확인한다.

실제 OME로 확인: 3절의 명령에 더해 `.env`에 `OME_API_ACCESS_TOKEN`을 채운다. 이 값을 바꿨으면 `docker compose up -d ome`으로 OME를 다시 만든다. OME 관리 API는 `127.0.0.1:8081`에만 열린다.

화면에서 확인:

1. 3절 1~4번대로 송출을 시작하고 시크릿 창에서 시청 화면을 연다.
2. 송출 화면에서 "방송 종료"를 누른다. "방송을 종료할까요? 종료하면 이 방송은 다시 시작할 수 없습니다."가 뜬다. "종료하기"를 누른다.
3. 송출 화면에 "방송을 종료했습니다."가 뜨고 미리보기가 사라진다. 카메라 표시등이 꺼진다.
4. 시크릿 창은 10초 안에 "방송이 끝났습니다."로 바뀌고 상태 배지가 "방송 종료"가 된다.
5. 송출 화면 주소를 다시 열면 "종료된 방송입니다. 새 방송을 만드세요."가 뜬다.
6. 새 방송으로 송출을 시작한 뒤 다른 탭에서 상세 화면을 연다. "방송 종료" → "종료하기"를 누르면 상세는 "방송이 끝났습니다."로, 송출 탭은 "방송이 종료되었습니다."로 바뀐다.
7. 다른 방송으로 송출을 시작한 뒤 상세의 "삭제"를 누르면 "송출 중인 방송입니다. 삭제하면 방송을 종료하고 되돌릴 수 없습니다."가 뜬다. "삭제하기"를 누르면 송출 화면이 "방송이 종료되었습니다."로 바뀐다.

API로 확인 (`jar.txt`는 0절처럼 소유자로 로그인해 저장한 쿠키):

```sh
API=http://localhost:3000/api
ID=<LIVE 방송 id>
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/broadcasts/$ID/end              # 401 (비로그인)
curl -s -b jar.txt -X POST $API/broadcasts/$ID/end                                    # 200, "status":"ENDED"
curl -s -b jar.txt -o /dev/null -w '%{http_code}\n' -X POST $API/broadcasts/$ID/end   # 200 (다시 불러도 같다)
curl -s -b jar.txt -o /dev/null -w '%{http_code}\n' -X POST $API/broadcasts/$ID/publish-token   # 409
```

### 모바일 카메라 캡처 (#22)

모바일 스트리머의 카메라와 마이크를 MediaStream 하나로 잡고, 전·후면을 바꾸고, 화면이 꺼지지 않게 한다. 아직 송출하지 않는다. 미리보기 화면은 `/studio/mobile`이고 로그인하지 않아도 열린다.

자동 확인 (Google Chrome 필요, 가짜 카메라·마이크 사용):

```sh
pnpm --filter @lsp/web e2e   # headless. CI도 같은 명령을 돌린다
```

`apps/web/e2e/cameraCapture.spec.ts`와 `cameraCaptureSingle.spec.ts`가 Pixel 7 에뮬레이션에서 다음을 확인한다.

- 미리보기 `<video>`의 스트림에 영상 트랙 1개, 오디오 트랙 1개가 있다.
- "후면 카메라로 전환"을 누르면 같은 스트림 객체에서 영상 트랙만 바뀐다. 오디오 트랙 id는 그대로이고, 이전 영상 트랙은 `ended`다. 다시 누르면 전면으로 돌아온다.
- "화면 꺼짐 방지가 켜져 있습니다."가 뜬다. "미리보기 끝내기"를 누르면 모든 트랙이 `ended`이고 Wake Lock이 풀린다.
- Wake Lock 권한이 없거나 API가 없으면 각각 안내 문구가 뜬다.
- 카메라가 하나뿐이면 전환 버튼이 없다.
- 카메라 권한을 거부하면 iPhone(Safari)·Android(Chrome)별로 다시 허용하는 방법이 뜬다. 카메라가 없을 때(`NotFoundError`)는 다른 문구가 뜬다.

Chrome의 가짜 카메라는 전·후면(`facingMode`) 정보가 없다. 그래서 테스트는 `facingMode` 요청을 가짜 카메라 두 대(`fake_device_0`이 전면, `fake_device_1`이 후면)로 바꿔 주는 스크립트를 페이지에 넣는다. 페이지가 다시 보일 때 Wake Lock을 다시 요청하는지는 headless Chrome에서 페이지를 숨길 수 없어 단위 테스트(`src/capture/screenWakeLock.test.ts`)로 확인한다.

사람이 확인하는 절차 (PC Chrome):

1. `pnpm --filter @lsp/web dev`로 웹을 띄우고 Chrome에서 `/studio/mobile`을 연다.
2. "카메라 켜기"를 누르고 카메라·마이크를 허용한다. 미리보기가 보이고 "화면 꺼짐 방지가 켜져 있습니다."가 뜬다.
3. 주소창의 카메라 아이콘에서 권한을 "차단"으로 바꾸고 새로고침한 뒤 "카메라 켜기"를 누른다. 권한을 다시 허용하는 안내가 뜬다.

휴대폰에서 열려면 https 주소가 필요하다. 브라우저는 `http://<PC의 LAN IP>`에서 카메라 API를 막고, 이 화면은 "https:// 로 시작하는 주소로 여세요"라고 안내한다. 실제 휴대폰(iOS Safari, Android Chrome) 확인은 배포 주소에서 송출과 함께 한다(#15).

## 지원 환경

송출·시청 기능 이슈에서 실제로 확인한 환경만 적는다.

| 확인한 것 | 환경 | 결과 |
|---|---|---|
| 화면 공유 창의 "시스템 오디오와 함께 공유" 스위치 | macOS 26.5, Chrome 156 | "전체 화면" 탭에 스위치가 있고 기본값은 꺼짐이다. "Chrome 탭"에는 "탭 오디오와 함께 공유"(기본값 켜짐)가 있다 |
| 시스템 소리가 실제로 섞이는지 | macOS 26.5, Chrome 156 | 미확인. 전체 화면을 공유하려면 macOS 화면 녹화 권한이 필요하고, 자동 테스트로는 확인하지 않았다 |
| Screen Wake Lock | macOS, Chrome 156 headless (Playwright, Pixel 7 에뮬레이션) | 권한(`screen-wake-lock`)을 주면 잠금을 얻는다. 주지 않으면 `NotAllowedError`로 거절되고 "화면 꺼짐 방지를 켜지 못했습니다."가 뜬다 |
| 모바일 카메라 전·후면 전환, 화면 꺼짐 방지 | iOS Safari, Android Chrome | 미확인. 실제 휴대폰 확인은 #15에서 한다 |

macOS 시스템 소리를 직접 확인하는 절차: 시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹음에서 Chrome을 허용한다. `/studio/pc`에서 "화면 선택" → "전체 화면" → "시스템 오디오와 함께 공유"를 켜고 공유한다. 다른 앱(예: 음악 앱)에서 소리를 내고 화면 소리 미터가 움직이는지 본다.

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
| [OvenLiveKit-Web](https://github.com/AirenSoft/OvenLiveKit-Web) (`ovenlivekit`) | 브라우저 WHIP 송출 | MIT |
| [hls.js](https://github.com/video-dev/hls.js) | LL-HLS 재생 | Apache-2.0 |
| [Playwright](https://playwright.dev) | 웹 e2e 테스트 (개발용, `apps/web/e2e`) | Apache-2.0 |
