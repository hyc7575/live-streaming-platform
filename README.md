<div align="center">

<img src="apps/web/public/favicon.svg" alt="Lime" width="96"/>

# Lime

**브라우저만으로 PC 화면과 휴대폰 카메라를 송출하고, 누구나 로그인 없이 보는 실시간 방송 플랫폼**

설치 없이 브라우저에서 방송을 시작하고(WebRTC), 시청자는 저지연 HLS(LL-HLS)로 봅니다.<br>
1인 개발 · 공모전 제출작 (2026-11-19 제출)

[![CI](https://github.com/hyc7575/live-streaming-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/hyc7575/live-streaming-platform/actions/workflows/ci.yml) [![API test](https://github.com/hyc7575/live-streaming-platform/actions/workflows/api-test.yml/badge.svg)](https://github.com/hyc7575/live-streaming-platform/actions/workflows/api-test.yml) ![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black) ![NestJS 12](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white) ![TypeScript 6](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white) ![PostgreSQL 18](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white) ![OvenMediaEngine](https://img.shields.io/badge/OvenMediaEngine-0.21-FF6F00) ![Node 24](https://img.shields.io/badge/Node-24-5FA04E?logo=nodedotjs&logoColor=white)

[서비스 바로가기](https://lime-live.duckdns.org) · [시연 영상](https://youtu.be/wHI1zNyYYQU) · [빠른 시작](#-빠른-시작) · [아키텍처](#-아키텍처) · [푼 문제](#-푼-문제)

</div>

> [!NOTE]
> **공모전 심사자께:** 테스트 계정 로그인과 필수 기능 확인 순서(약 10분)는 [docs/VERIFICATION.md의 심사자용 확인](docs/VERIFICATION.md#심사자용-확인)에 있습니다. 공모 요구사항별 구현과 자동 테스트는 같은 문서의 [공모 요구사항별 구현](docs/VERIFICATION.md#공모-요구사항별-구현)에 있습니다.

## 🎬 바로 보기

- **서비스:** https://lime-live.duckdns.org
- **테스트 계정:** 홈이나 로그인 화면의 "테스트 계정으로 로그인"에서 "스트리머 A" 또는 "사용자 B"를 누릅니다. 비밀번호는 입력하지 않습니다.
- **권장 환경:** PC Chrome이나 Edge + 휴대폰 1대. 확인한 브라우저와 기기는 [지원 환경](#-지원-환경)에 있습니다.
- **시연 영상:** https://youtu.be/wHI1zNyYYQU (5분 28초). PC 화면 송출과 휴대폰(Galaxy S22 Chrome) 시청, 휴대폰 카메라 송출과 PC 시청, 종료, 다시보기까지 운영 서비스에서 녹화했습니다. 나레이션은 CapCut 음성 합성이고, 입력·대기 구간은 1.5~3배속으로 넘겼습니다.

  <details>
  <summary>장면별 시각</summary>

  | 시각 | 장면 |
  |---|---|
  | 0:04 | 회원가입 · 로그인 · 로그아웃 |
  | 0:22 | 방송 등록 |
  | 0:32 | PC 화면 송출 (탭 오디오) |
  | 0:50 | 비로그인 휴대폰 시청 |
  | 1:11 | 채팅 |
  | 1:19 | 인가 (권한 없음 화면, API 직접 호출 403) |
  | 1:44 | 방송 정보 수정 |
  | 1:55 | 후원 (라임) |
  | 2:17 | 방송 종료 |
  | 2:27 | 다시보기 · 댓글 |
  | 2:47 | 방송 삭제 |
  | 2:58 | 휴대폰 카메라 송출 |
  | 3:34 | 송출 중 예외 처리와 안정성 |
  | 4:34 | 추가 기능 |

  </details>

## 📚 목차

- [주요 기능](#-주요-기능)
- [아키텍처](#-아키텍처)
- [기술 스택](#-기술-스택)
- [빠른 시작](#-빠른-시작)
- [디렉터리 구조](#-디렉터리-구조)
- [푼 문제](#-푼-문제)
- [작업 방식](#-작업-방식)
- [CI와 배포](#-ci와-배포)
- [지원 환경](#-지원-환경)
- [알고 있는 한계](#-알고-있는-한계)
- [문서](#-문서)
- [사용한 오픈소스](#-사용한-오픈소스)

## ✨ 주요 기능

| 스트리머 | 시청자 | 서버가 지키는 것 |
|---|---|---|
| PC 화면 송출. 탭·시스템 소리와 마이크를 오디오 트랙 하나로 섞습니다 | 로그인 없이 LL-HLS로 시청 (iOS 17.1+ Safari 포함) | 방송 상태(`READY` → `LIVE` → `ENDED`)는 서버만 바꿉니다 |
| 휴대폰 카메라 송출, 송출 중 전·후면 전환, 화면 꺼짐 방지 | 직접 만든 플레이어 컨트롤: "라이브로 이동", 음량 기억, 전체화면 | 송출 허가는 OME가 API에 묻고 API가 정합니다(Admission Webhook, HMAC, 응답 없으면 거절) |
| 송출 사전 점검: 마이크·화면 소리 미터, 화면 소리가 없으면 경고 | 방송 중에는 채팅, 끝난 뒤에는 댓글 | 수정·삭제·종료·송출은 소유자만. 모든 칸을 방송 상태별로 테스트합니다 |
| OBS 송출: 방송마다 WHIP URL 발급 | 다시보기: 녹화 재생, 배속, 채팅 기록 | 송출이 끊기면 30초 동안 같은 방송으로 재접속을 받고, 넘으면 종료합니다 |
| 방송 등록·수정·삭제, 카테고리와 게임 타이틀(Wikidata) | 후원: 토스페이먼츠 테스트 결제, 미리 충전한 라임. 결제하는 동안 영상이 멈추지 않습니다 | 같은 결제 승인이 여러 번 와도 한 번만 적립합니다 |
| 후원 알림 토스트, 받은 후원 합계, 팔로워 목록 | 팔로우와 LIVE 표시, 서버 검색(스트리머·방송·지난 방송), 카테고리 필터 | 세션 쿠키를 PostgreSQL에 두어 API를 재시작해도 로그인이 유지됩니다 |
| 채널 페이지, 프로필·방송 대기 이미지, 30초마다 갱신되는 목록 썸네일 | 마이페이지: 충전·후원 내역 | 녹화 용량 상한을 넘으면 오래된 녹화부터 지웁니다 |

기능별 동작 규칙과 확인 절차는 [docs/VERIFICATION.md](docs/VERIFICATION.md)에 있습니다.

## 🧱 아키텍처

```mermaid
flowchart LR
    U((브라우저))
    subgraph VM["Oracle Cloud VM 한 대 · Docker Compose"]
        C[Caddy<br/>HTTPS · 압축 · 정적 파일]
        A[API<br/>NestJS]
        O[OvenMediaEngine<br/>WHIP 수신 · LL-HLS · 녹화]
        P[(PostgreSQL)]
        F[(녹화 · 썸네일<br/>호스트 폴더)]
        K[db-backup]
    end
    T[토스페이먼츠]
    U -->|HTTPS 443| C
    U -->|WebRTC 미디어<br/>UDP 10000-10003 · TURN 3478| O
    C -->|/api| A
    C -->|/app 시그널링 · LL-HLS| O
    C -->|/recordings · /thumbnails| F
    A --> P
    O -.->|송출 허가 Webhook| A
    A -.->|송출 끊기 REST| O
    O -->|MP4| F
    A -->|결제 승인| T
    K --> P
```

- 서버는 VM 한 대이고 `deploy/compose.yaml` 하나로 띄웁니다. 웹은 빌드 결과를 Caddy가 정적 파일로 내줍니다.
- 브라우저는 WHIP으로 OME에 송출합니다. 시청은 443 포트의 LL-HLS만 쓰므로 막힌 망에서도 볼 수 있습니다.
- 실시간 갱신은 WebSocket 없이 폴링입니다. 채팅은 1초마다 마지막 id 뒤의 새 메시지만, 방송 상태는 5초마다 읽습니다([ADR 0002](docs/adr/0002-chat-cursor-polling.md)).
- 운영 구성도는 노드마다 근거 코드 줄이 붙은 [docs/architecture/system-overview.html](docs/architecture/system-overview.html)에 있습니다.

### 방송 상태와 예외 처리

```mermaid
stateDiagram-v2
    [*] --> READY: 방송 생성
    READY --> LIVE: OME 송출 허가 (Webhook)
    LIVE --> LIVE: 끊긴 뒤 30초 안에 재접속
    LIVE --> ENDED: 소유자 종료 / 끊긴 뒤 30초 초과
    READY --> [*]: 삭제
    ENDED --> [*]: 삭제
```

- **상태는 서버만 바꿉니다.** 클라이언트는 요청만 보냅니다. `ENDED`는 `LIVE`로 돌아가지 않습니다.
- **송출 허가는 서버가 정합니다.** OME가 송출을 받기 전에 API에 묻고(Admission Webhook, HMAC 서명 검증), API는 소유자 송출 토큰과 방송 상태를 보고 `READY`이거나 끊긴 지 30초 안인 `LIVE`만 허가합니다. API가 응답하지 못하면 OME는 거절합니다(fail-closed).
- **종료하면 송출이 멈춥니다.** DB를 먼저 `ENDED`로 저장하고 그다음 OME 관리 API로 송출을 끊습니다. 종료 API는 여러 번 불러도 결과가 같습니다.
- **1인 1 LIVE:** DB 부분 유니크 인덱스로 막습니다. 두 방송의 허가 요청이 동시에 와도 하나만 `LIVE`가 됩니다.
- **비정상 종료:** 탭을 닫거나 네트워크가 끊기면 OME가 끊김을 알리고, 30초 안에 다시 연결하지 않으면 `ENDED`가 됩니다. 새로고침은 같은 방송으로 이어집니다.
- **좀비 방송 정리:** 끊김 알림이 빠져도 송출 없는 `LIVE`가 남지 않도록 30초마다 OME 스트림 목록과 DB를 대조합니다. OME 목록을 읽지 못한 회차는 DB를 하나도 바꾸지 않습니다.
- **시청자 종료 감지:** 시청 화면은 상태를 5초마다 읽고, 재생 오류가 나면 바로 읽습니다. `ENDED`면 "방송이 끝났습니다."를 띄우고, 녹화가 준비되면 새로고침 없이 다시보기로 바뀝니다.

근거는 [PRD §7.4](docs/PRD.md), 자동 테스트는 `apps/api/test/publish.e2e.spec.ts`, `reconnect-grace.e2e.spec.ts`, `apps/web/e2e-stack/abnormalEnd.spec.ts`입니다.

### 인가

로그인 확인 → 소유자 확인 순서로 거릅니다(`LoggedInGuard` → `BroadcastOwnerGuard`). `apps/api/test/authorization-matrix.e2e.spec.ts`가 아래 표의 모든 칸을 방송 상태(`READY`·`LIVE`·`ENDED`)별로 돌리고, 거절된 칸은 DB가 그대로인지 확인합니다.

| 행위 | 비로그인 | 다른 사용자 | 소유자 |
|---|---|---|---|
| 방송 목록·상세 조회, 시청 | 200 | 200 | 200 |
| 방송 생성 `POST /api/broadcasts` | 401 | 201 | — |
| 방송 수정 `PATCH /api/broadcasts/:id` | 401 | 403 | 200 |
| 방송 삭제 `DELETE /api/broadcasts/:id` | 401 | 403 | 204 (LIVE면 종료한 뒤 삭제) |
| 방송 종료 `POST /api/broadcasts/:id/end` | 401 | 403 | 200 (READY는 409) |
| 송출 토큰 발급 `POST /api/broadcasts/:id/publish-token` | 401 | 403 | 201 (ENDED는 409) |

채팅·댓글·후원·팔로우·라임·이미지 행은 [PRD §7.5](docs/PRD.md)와 [docs/VERIFICATION.md](docs/VERIFICATION.md)의 각 절에 있습니다.

## 🧰 기술 스택

| 영역 | 선택 | 고른 이유 |
|---|---|---|
| 미디어 서버 | OvenMediaEngine 0.21 (자체 호스팅) | WebRTC(WHIP) 송출, LL-HLS 시청, MP4 녹화를 서버 하나로 처리합니다. 송출 허가 Webhook과 관리 API로 "종료하면 송출이 멈춘다"를 서버가 강제할 수 있습니다. LiveKit Cloud는 무료 서버 기준 비용이 줄지 않고 LL-HLS와 녹화를 잃어 버렸습니다([ADR 0001](docs/adr/0001-self-hosted-ovenmediaengine.md)) |
| 송출 | `getDisplayMedia` · `getUserMedia`, Web Audio, OvenLiveKit-Web | 화면 소리와 마이크를 한 오디오 트랙으로 섞어 WHIP으로 보냅니다. 송출 중 화면·카메라 교체는 `RTCRtpSender.replaceTrack`으로 합니다 |
| 시청 | hls.js 1.7 | 같은 코드로 Chrome·Edge·iOS 17.1+ Safari의 LL-HLS를 재생합니다 |
| 웹 | React 19, React Router 8, Vite 8, CSS Modules | 플레이어 컨트롤은 라이브러리 없이 `useSyncExternalStore`로 직접 만들었습니다 |
| API | NestJS 12, Zod 4, express-session, @nestjs/throttler | 가드로 로그인·소유자 확인을 라우트마다 선언합니다 |
| DB | PostgreSQL 18, Prisma 7 | 방송·채팅·결제·세션을 한 DB에 둡니다. 결제 확정은 행 잠금과 UNIQUE 제약으로 지킵니다 |
| 실시간 갱신 | 폴링 (채팅 1초 커서, 상태 5초) | 공모전 규모(동접 수 명)에서는 WebSocket 없이 충분하다고 판단했습니다([ADR 0002](docs/adr/0002-chat-cursor-polling.md)) |
| 결제 | 토스페이먼츠 결제위젯 (테스트 모드) | 서버가 승인 결과·금액·주문을 확인한 뒤에만 후원을 확정합니다 |
| 인프라 | Oracle Cloud VM 한 대, Docker Compose, Caddy, DuckDNS | 동접 5명 미만의 개인 프로젝트라 최저 비용으로 혼자 운영할 수 있는 구성을 골랐습니다 |
| 테스트 | Vitest 5, supertest, Testing Library, Playwright 1.64 | API 테스트는 실제 PostgreSQL에, 송출·시청 e2e는 실제 OME에 붙여 돌립니다 |
| 품질 | TypeScript strict, ESLint 10, Prettier, gitleaks, GitHub Actions | 커밋 전 gitleaks가 비밀값을 막습니다 |

## 🚀 빠른 시작

명령은 모두 저장소 루트에서 실행합니다.

### 사전 준비

- Node.js 24 (`.nvmrc`)
- pnpm 11 (`corepack enable` 또는 `npm i -g pnpm`)
- Docker (PostgreSQL과 OvenMediaEngine을 띄웁니다)
- gitleaks (`brew install gitleaks`, 커밋 전 비밀값 검사)

### 실행

```sh
pnpm install
git config core.hooksPath .githooks   # 커밋 전 비밀값 검사 훅
cp .env.example .env                  # 아래 필수 값을 채운다
docker compose up -d --wait           # PostgreSQL + OME
pnpm --filter @lsp/api db:migrate     # Prisma 마이그레이션 적용
pnpm --filter @lsp/api games:seed     # 게임 목록(apps/api/data/games.json)을 Game 테이블에 넣는다
pnpm dev                              # API :3000, 웹 :5173
```

`.env`의 필수 값입니다(compose 기본값과 맞춘 예시).

```sh
DATABASE_URL=postgresql://lsp:lsp@localhost:5432/lsp
SESSION_SECRET=<openssl rand -base64 32 결과>
OME_WEBHOOK_SECRET=<openssl rand -base64 32 결과>
OME_API_ACCESS_TOKEN=<openssl rand -hex 24 결과>
OME_HOST_IP=127.0.0.1
```

- 브라우저에서 `http://localhost:5173`을 엽니다. 웹은 `/api` 요청을 Vite dev proxy로 API에 넘깁니다.
- API 상태는 `curl http://localhost:3000/api/health`로 확인합니다.
- 모든 환경변수와 기본값은 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#환경변수)에 있습니다. 후원·충전을 쓰려면 토스 테스트 키(`TOSS_CLIENT_KEY`·`TOSS_SECRET_KEY`)를 넣습니다.
- `pnpm install`이 Prisma 클라이언트를 `apps/api/src/generated/`에 만듭니다(`postinstall`). 스키마를 바꾸면 `pnpm --filter @lsp/api db:migrate:dev --name <이름>`으로 마이그레이션 파일을 만들고 커밋합니다.

테스트 계정 버튼("스트리머 A"·"사용자 B")을 쓰려면 `.env`에 아래를 더하고 시드를 돌린 뒤 API를 다시 띄웁니다. 시드는 끝난 방송 예시도 하나 만듭니다.

```sh
TEST_ACCOUNTS_ENABLED=true
TEST_ACCOUNT_A_PASSWORD=<8자 이상>
TEST_ACCOUNT_B_PASSWORD=<8자 이상>
```

```sh
pnpm --filter @lsp/api db:seed
```

정리:

```sh
docker compose down      # 컨테이너만 내린다
docker compose down -v   # DB 볼륨까지 지운다
```

> [!IMPORTANT]
> 비밀값은 `.env`에만 둡니다. `.env`는 `.gitignore`에 있고, `.githooks/pre-commit`이 스테이징된 변경을 gitleaks로 검사해 토큰·키·비밀번호가 있으면 커밋을 막습니다.

### 검사

CI(GitHub Actions)가 pull request와 `main` push마다 같은 명령을 돌립니다.

| 명령 | 하는 일 |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint + Prettier 검사, 문서 배치 규칙 검사 |
| `pnpm build` | API·웹 빌드 |
| `pnpm test` | API: Vitest + supertest(실제 PostgreSQL), 웹: Vitest + Testing Library |
| `pnpm format` | Prettier로 고칩니다 |
| `pnpm --filter @lsp/web e2e` | Playwright 브라우저 e2e (CI와 같음) |
| `pnpm --filter @lsp/web e2e:stack` | 실제 OME에 송출하고 시청하는 e2e (로컬 OME 필요) |

> [!WARNING]
> API 테스트는 테스트마다 모든 테이블을 비웁니다(`TRUNCATE`). 개발 DB를 쓰지 말고 테스트용 DB를 따로 둡니다. 방법은 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#api-테스트-db)에 있습니다.

## 📁 디렉터리 구조

```
apps/
  api/            NestJS API. 모든 경로는 /api 아래
    src/          auth broadcasts publish ome recording chat comments donations lime
                  follows channel streamers search games images ...
    prisma/       스키마와 마이그레이션
    test/         실제 PostgreSQL에 붙는 e2e (인가 매트릭스 포함)
  web/            React + Vite 웹 앱. UI 지침은 apps/web/CLAUDE.md
    src/          pages publish(송출) capture(화면·카메라 캡처) donation follows ...
    e2e/          Playwright e2e (CI에서 실행)
    e2e-stack/    실제 OME에 붙는 송출·시청 e2e (로컬)
ome/              OvenMediaEngine 설정(Server.xml)
deploy/           운영 compose(Caddy, API, OME, PostgreSQL, 백업), Caddyfile, Dockerfile
scripts/          문서 배치 검사, 같은 Wi-Fi 휴대폰 확인용 HTTPS 인증서
docs/             PRD, 사전 부검, 결정 기록(adr/), 기능별 문서(features/<기능>/)
compose.yaml      로컬 개발용 PostgreSQL, OME, 녹화·썸네일 정적 서버
GLOSSARY.md       용어
```

pnpm workspace 모노레포입니다. 두 앱 모두 TypeScript strict이고, 문서 지도는 [docs/README.md](docs/README.md)에 있습니다.

## 🧩 푼 문제

> 수치는 PR 본문과 이슈 댓글에 남긴 로컬 측정 값입니다. 따로 적지 않으면 운영 환경에서 다시 잰 값이 아닙니다.

<details>
<summary><strong>1. 방송을 종료한 직후, 끊긴 송출이 다시 허가될 수 있음</strong></summary>

**문제**

- 종료는 두 곳을 바꿉니다. DB의 방송 상태와 OME의 송출 연결입니다.
- OME 연결을 먼저 끊으면, DB가 아직 `LIVE`인 사이에 송출기가 재접속하고 Webhook이 이를 허가할 수 있습니다.

**해결**

- DB를 먼저 `ENDED`로 저장하고 그다음 OME 관리 API로 송출을 끊습니다. 다시 접속해도 Webhook이 `ENDED`를 보고 거절합니다.
- 종료 API는 여러 번 불러도 결과가 같습니다. OME가 404를 주면(이미 끊김) 성공으로 봅니다.

**결과**

- 실제 OME를 띄운 e2e에서 시청 화면이 종료 뒤 10초 안에 "방송이 끝났습니다."로 바뀌고, 종료된 방송의 재송출은 Webhook이 거절했습니다.
- 이 시나리오를 돌리다 송출 중 삭제 때의 404 처리 결함을 찾아 고쳤습니다.

</details>

<details>
<summary><strong>2. API를 재시작하면 재접속 유예 타이머가 사라짐</strong></summary>

**문제**

- 송출이 끊기면 30초 동안 같은 방송으로 재접속을 받아야 합니다. 방송마다 메모리 타이머(`setTimeout`)를 걸면 API를 재시작할 때 타이머가 사라져 `LIVE`가 영영 남습니다.

**해결**

- 끊긴 시각을 `Broadcast.disconnectedAt` 열에 두고, 만료는 30초 주기 정리 작업 한 곳에서만 처리합니다.
- 허가와 만료는 조건부 `updateMany`라서 동시에 일어나도 한쪽만 이깁니다.
- OME 스트림 목록을 읽지 못한 회차는 DB를 하나도 바꾸지 않습니다. OME가 죽었다는 이유로 모든 방송을 끝내지 않기 위해서입니다.
- 웹은 탭을 떠날 때(`pagehide`) keepalive 요청으로 송출 종료를 알립니다. 이게 없으면 OME가 약 30초 뒤에야 끊김을 알려, 새로고침 직후의 재시작이 거절됐습니다(실측).

자세히: [docs/VERIFICATION.md 5절](docs/VERIFICATION.md#5-비정상-종료와-재접속-유예-12)

</details>

<details>
<summary><strong>3. 같은 결제 승인이 두 번 오면 후원이 두 번 적립될 수 있음</strong></summary>

**문제**

- 결제 완료 화면을 새로고침하거나 두 탭에서 열면 같은 승인 요청이 다시 옵니다. 동시에 오면 둘 다 "아직 확정 안 됨"을 읽을 수 있습니다.

**해결**

- 주문 행을 잠그고(`SELECT … FOR UPDATE`) 토스에 `Idempotency-Key`로 `orderId`를 보냅니다. `orderId`·`paymentKey`는 UNIQUE입니다.
- 이미 확정된 주문에 같은 승인이 다시 오면 토스를 부르지 않고 기존 후원을 돌려줍니다.
- 응답의 `status`가 `DONE`이고 금액·`orderId`·`paymentKey`가 주문과 같을 때만 확정합니다.
- 확정은 방송 행을 후원 행보다 먼저 잠급니다. 순서가 뒤집히면 방송 삭제와 서로 기다려 교착(40P01)이 납니다. 테스트가 후원 행을 쥔 채 확정을 보내고 방송 행을 `FOR UPDATE SKIP LOCKED`로 시도해, 타이밍에 기대지 않고 잠금 순서를 확인합니다.

**결과**

- `apps/api/test/donations.e2e.spec.ts`가 재시도와 동시 승인 두 개를 확인합니다. 잠금을 옮기거나 뺀 두 회귀를 모두 잡습니다.
- 방송을 지워도 후원 기록과 받은 사람은 남깁니다([ADR 0003](docs/adr/0003-donation-outlives-broadcast.md)).

</details>

<details>
<summary><strong>4. 결제 확정이 DB 연결을 붙잡아 다른 사용자까지 막음</strong></summary>

**문제**

- 확정은 토스 응답을 기다리는 동안 트랜잭션, 곧 공유 DB 연결을 쥡니다. 한 사용자가 확정을 몰아 보내면 연결 풀이 바닥나 다른 사용자의 요청까지 늦어지거나 500이 됐습니다.

**해결**

- 같은 사용자의 확정은 도착 순서대로 하나씩, 전체는 3개까지만 트랜잭션에 들입니다. 넘는 요청은 거절하지 않고 연결 없이 기다립니다.
- 확정 라우트에 사용자별 요청 제한(1분 20회)을 두고, 연결 대기 시간을 5초로 정했습니다.
- 결제 정합성 경로(행 잠금, 이미 확정 처리, UNIQUE)는 바꾸지 않았습니다.

**결과** (로컬, 토스 stub 300ms 응답)

| 경우 | 다른 사용자 `/auth/me` 최대 (수정 전) | 수정 뒤 |
|---|---|---|
| 같은 주문 20개 동시 확정 | 4,831ms, 500 ×4 | 4ms, 500 없음 |
| 같은 주문 40개 동시 확정 | 4,824ms, 500 ×24 | 52ms (20개는 429) |

자세히: [PR #223](https://github.com/hyc7575/live-streaming-platform/pull/223)

</details>

<details>
<summary><strong>5. iPhone Safari에서만 시청 화면이 2~3초 만에 죽음</strong></summary>

**문제**

- iPhone Safari로 라이브를 보면 재생 2~3초 뒤 React #185(Maximum update depth exceeded)로 화면이 멈췄습니다. PC Chrome에서는 재현되지 않았습니다.

**원인**

- 플레이어 상태 훅이 `useSyncExternalStore`의 `getSnapshot`에서 매번 `<video>`를 읽었습니다.
- Safari는 재생 중 `currentTime`을 읽을 때마다 새 값을 줍니다. React는 렌더 뒤 스냅숏을 다시 확인하는데, 매번 "바뀜"으로 판정해 동기 재렌더를 반복했습니다.
- React 소스(`updateStoreInstance` → `forceStoreRerender`)로 경로를 확인하고, `currentTime`이 읽을 때마다 바뀌는 jsdom 테스트로 같은 오류를 재현했습니다.

**해결**

- 스냅숏은 video 이벤트가 올 때만 갱신하고, `getSnapshot`은 캐시만 돌려줍니다.
- Mac Safari에서 수정 전 오류를 재현하고, 수정 뒤 라이브 재생이 이어지는 것을 확인했습니다.

</details>

<details>
<summary><strong>6. 방송 직후 들어온 시청자가 검은 화면을 14초 봄</strong></summary>

**문제**

- 원인을 "LL-HLS 첫 세그먼트(6초) 대기"로 추정만 하고 있었습니다.

**해결**

- 송출 연결부터 첫 `playing`까지를 재는 Playwright 측정 스펙을 만들고, 설정을 번갈아 바꾸며 쟀습니다.
- OME 로그와 요청 기록으로 원인을 나눴습니다. 앞의 약 5초는 첫 영상 키프레임 대기라 세그먼트와 무관했고, OME는 미디어 플레이리스트 요청을 첫 세그먼트가 닫힐 때까지 붙잡았습니다.
- 세그먼트를 3초로 줄이면 hls.js가 약 1/3 확률로 멈춰 4초로 물러섰습니다. 재시도 간격 조정은 효과가 없어 넣지 않았습니다.

**결과**

- 첫 화면까지 평균 14.2초 → 11.6초(n=7/6), 라이브 지연 1.8초 유지, 10분 시청 중 멈춤 0회.
- 목표 8초에는 못 미쳤고, 남은 원인을 기록했습니다([알고 있는 한계](#-알고-있는-한계)).

자세히: [PR #104](https://github.com/hyc7575/live-streaming-platform/pull/104)

</details>

<details>
<summary><strong>7. 1초 폴링이 매번 채팅 전체를 받음</strong></summary>

**문제**

- 방송 중 대화와 방송 후 댓글이 한 테이블에 섞여 있었고, 1초 폴링이 매번 전체 목록을 받았습니다. 채팅이 쌓일수록 시청자마다 1초에 받는 양이 커졌습니다.

**해결**

- 채팅을 `ChatMessage` 테이블로 나누고, 쓸 수 있는 종류를 서버가 방송 상태로 정합니다(채팅은 `READY`·`LIVE`, 댓글은 `ENDED`, 어긋나면 409).
- 채팅 조회는 `(createdAt, id)` 커서로 새 메시지만 받습니다. 기존 행은 마이그레이션 SQL이 종료 시각 기준으로 나눕니다.
- WebSocket과 NoSQL은 공모전 규모에 필요 없다고 보고 쓰지 않았습니다([ADR 0002](docs/adr/0002-chat-cursor-polling.md)).

**결과**

- 1,000건 방송에서 폴링 응답이 36,491B(200건) → 916B(새 5건).

</details>

<details>
<summary><strong>8. 후원 결제가 방송 화면을 떠나게 함</strong></summary>

**문제**

- "후원하기"가 같은 탭에서 결제 페이지로 이동해 플레이어가 사라지고 LIVE 영상이 멈췄습니다. 새 탭으로 옮긴 뒤에도 PC에서는 방송을 떠난 것처럼 보였습니다.

**해결**

- PC(넓은 화면 + 마우스)는 후원 모달 안 iframe에서 결제를 끝내고, 휴대폰·터치 기기는 새 탭을 씁니다.
- 운영 환경 스파이크에서 토스 위젯 기본 결제창은 중첩 iframe에서 승인 뒤 교차 출처 이동이 막혀 실패했습니다. `windowTarget: 'self'`는 성공해서 iframe 안일 때만 적용합니다.
- 완료·닫기는 origin과 source를 검사한 `postMessage`로 부모 창에 알립니다.

**결과**

- 1366×768에서 결제가 끝날 때까지 방송 탭 주소가 유지되고, 결제 뒤 폼에 새 잔액이 반영됩니다.
- Safari는 교차 출처 iframe 저장소를 나눠 막힐 위험이 있었는데, 실제 Safari로 충전·카드 후원을 끝까지 진행해 통과를 확인했습니다.

</details>

## 🛠 작업 방식

혼자 개발했지만, 결정과 근거가 문서와 이슈에 남도록 일했습니다.

- **문서 → 이슈 → 코드:** 요구사항과 기술 결정은 [PRD](docs/PRD.md), 위험과 대응은 [사전 부검](docs/PRE-MORTEM.md)에 먼저 씁니다. 기능마다 `docs/features/<기능>/`에 탐색·PRD·시나리오를 두고, 계획한 항목마다 이슈를 만든 뒤 구현합니다. 되돌리기 어려운 결정은 [ADR](docs/adr/)로 남깁니다.
- **이슈마다 브랜치와 PR:** PR 본문에 변경, 측정 값, 하지 않은 것, 사람이 확인할 항목을 적습니다. PRD와 다르게 구현하면 PR에 이유를 씁니다.
- **실제 의존성으로 테스트:** API 테스트는 DB를 모킹하지 않고 실제 PostgreSQL에 붙습니다. 송출·시청 e2e는 실제 OME에 송출하고 hls.js 재생까지 확인합니다. 버그를 고치면 수정 전에 실패하는 테스트를 먼저 씁니다.
- **AI 에이전트와 일하기:** Claude Code로 작업했습니다. 작업 규칙은 [CLAUDE.md](CLAUDE.md)와 `apps/web/CLAUDE.md`에 두어 에이전트도 같은 규칙을 따릅니다. 큰 작업은 이슈 단위로 에이전트에게 나눠 맡기고, 코드를 쓰지 않은 다른 에이전트가 리뷰·검증했습니다.

| 숫자로 보기 | |
|---|---|
| 개발 시간 | 약 60시간 |
| 이슈 / 머지된 PR | 123개 / 143개 |
| 테스트 파일 | API 42개 · 웹 단위 47개 · 브라우저 e2e 8개 · 실제 OME e2e 17개 |
| 결정 기록 | ADR 3개, 기능 문서 폴더 20개 |

## 🔄 CI와 배포

| 워크플로 | 하는 일 |
|---|---|
| `ci` | PR과 `main` push마다 `typecheck` · `lint` · `build` · 웹 단위 테스트, 그리고 Chrome으로 Playwright e2e를 돌립니다 |
| `api-test` | `apps/api`나 의존성 파일이 바뀌면 PostgreSQL 서비스를 띄워 마이그레이션을 적용하고 API 테스트를 돌립니다 |

- 운영 배포는 서버에서 `deploy/compose.yaml`로 합니다. 첫 배포, 재배포, 로그, 다운 감시, 백업은 [docs/OPERATIONS.md](docs/OPERATIONS.md)에 있습니다. 운영 API는 시작할 때 마이그레이션을 적용합니다.
- 다운 알림을 받으면 서버의 저장소 폴더에서 아래 세 줄로 복구합니다.

```sh
sudo systemctl start docker
docker compose -f deploy/compose.yaml up -d --wait
curl -fsS https://lime-live.duckdns.org/api/health
```

## 🧭 지원 환경

| 기능 | 확인한 환경 |
|---|---|
| PC 화면 송출 (탭 소리·시스템 소리 + 마이크) | Windows 11 Chrome 157, Edge 157 |
| 모바일 카메라 송출 | iPhone 12 Safari, Galaxy S22 Chrome 앱 |
| 비로그인 시청 | Windows 11 Chrome 157, Edge 157 · iOS Safari 17.1+ (iOS Simulator) |
| 주의 | iOS 17.0 이하 Safari 시청은 확인하지 않았습니다. 송출 UDP 포트가 막힌 회사·학교 망에서는 송출이 안 될 수 있습니다 |

- 송출은 WebRTC라 UDP 10000-10003, TCP 10000, TCP 3478이 열려 있어야 합니다. 막힌 망에서는 "송출 서버에 연결하지 못했습니다."가 뜰 수 있으니 휴대폰 데이터나 집 Wi-Fi로 바꿉니다. 시청은 443 포트만 씁니다.
- 기기·브라우저별 확인 결과와 측정 값은 [docs/VERIFICATION.md의 지원 환경](docs/VERIFICATION.md#지원-환경)에 있습니다.

## 🔭 알고 있는 한계

| 한계 | 지금 상태 |
|---|---|
| iOS 17.0 이하 iPhone 재생 | OME(v0.21.0)가 LL-HLS 비디오 플레이리스트에 `PART-TARGET=0`을 써서 iOS 네이티브 HLS가 거부합니다. iOS 17.1+는 hls.js로 보내 피했습니다(#246). 트랜스코딩 등 OME 설정으로 고칠 수 있을지는 확인하지 않았습니다 |
| 방송 직후 연 시청자의 지연 | 첫 플레이리스트가 짧을 때 hls.js가 맨 앞부터 재생해 라이브보다 약 16초 뒤처지고 따라잡지 못합니다(#248 측정). `liveSyncDuration`·`maxLiveSyncPlaybackRate` 설정으로 다룰 수 있습니다 |
| 첫 화면까지 11.6초 | 목표 8초에 못 미칩니다. 대부분 첫 키프레임과 첫 세그먼트 대기입니다([푼 문제 6](#-푼-문제)) |
| 서버 한 대 가정 | 결제 확정 동시 상한과 요청 제한을 프로세스 메모리에서 셉니다. API를 여러 개로 늘리면 다시 봐야 합니다 |
| 폴링 기반 실시간 | 채팅 패널을 연 시청자마다 초당 한 번 요청합니다. 시청자가 크게 늘면 푸시 방식을 다시 판단해야 합니다 |
| 결제 확정 중 토스 호출 | 토스 호출이 아직 잠금·트랜잭션 안에 있습니다. 동시 상한으로 피해를 막았고, 흐름 재설계는 #197에 남겼습니다 |
| 고정 스트림 키 없음 | OBS 송출은 방송마다 WHIP URL을 발급합니다(#89). OME 스트림 이름이 곧 방송 ID라 녹화·재생·정리가 이 전제에 기대고 있습니다 |

## 📄 문서

| 문서 | 내용 |
|---|---|
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | 심사자용 확인 순서, 공모 요구사항별 구현, 지원 환경, 기능별 동작 규칙과 확인 절차 |
| [docs/PRD.md](docs/PRD.md) | 요구사항, 기술 결정, 인가 매트릭스, 방송 상태 전이, 인수 시나리오 |
| [docs/PRE-MORTEM.md](docs/PRE-MORTEM.md) | 위험과 대응 |
| [docs/adr/](docs/adr/) | 되돌리기 어려운 결정 (미디어 서버, 채팅 폴링, 후원과 방송의 수명) |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 환경변수, API 테스트 DB, 여러 worktree 동시 실행 |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | 운영 배포, 복구, 백업 |
| [docs/architecture/system-overview.html](docs/architecture/system-overview.html) | 운영 구성도 (브라우저로 엽니다) |
| [docs/README.md](docs/README.md) | 문서 지도와 기능별 문서 목록 |
| [GLOSSARY.md](GLOSSARY.md) | 용어 |

## 📦 사용한 오픈소스

| 이름 | 쓰는 곳 | 라이선스 |
|---|---|---|
| [Prisma](https://github.com/prisma/prisma) (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) | DB 스키마·마이그레이션·쿼리 | Apache-2.0 |
| [node-postgres](https://github.com/brianc/node-postgres) (`pg`) | PostgreSQL 연결 풀 | MIT |
| [express-session](https://github.com/expressjs/session) | 세션 쿠키 | MIT |
| [connect-pg-simple](https://github.com/voxpelli/node-connect-pg-simple) | 세션을 PostgreSQL에 저장 | MIT |
| [@nestjs/throttler](https://github.com/nestjs/throttler) | 로그인·회원가입 요청 제한 | MIT |
| [Zod](https://github.com/colinhacks/zod) | 요청 본문 검증 | MIT |
| [OvenMediaEngine](https://github.com/AirenSoft/OvenMediaEngine) (Docker 이미지 `ovenmedialabs/ovenmediaengine:v0.21.0`, 수정하지 않고 그대로 사용) | 송출 수신(WebRTC/WHIP), LL-HLS 변환, MP4 녹화 | AGPL-3.0-only |
| [OvenLiveKit-Web](https://github.com/AirenSoft/OvenLiveKit-Web) (`ovenlivekit`) | 브라우저 WHIP 송출 | MIT |
| [hls.js](https://github.com/video-dev/hls.js) | LL-HLS 재생 | Apache-2.0 |
| [Playwright](https://playwright.dev) | 웹 e2e 테스트 (개발용, `apps/web/e2e`) | Apache-2.0 |
| [TossPayments SDK](https://github.com/tosspayments/browser-sdk) (`@tosspayments/tosspayments-sdk`) | 후원·라임 충전 결제위젯 | MIT |
| [Pretendard](https://github.com/orioncactus/pretendard) (`pretendard`) | 웹 글꼴 | OFL-1.1 |
| [Wikidata](https://www.wikidata.org) (데이터) | 게임 목록 스냅샷 `apps/api/data/games.json` | CC0 |

`ome/Server.xml`은 OvenMediaEngine의 [설정 파일 구조](https://airensoft.gitbook.io/ovenmediaengine/configuration)를 따릅니다. OME 기본 설정 예시의 호스트 이름(`*.airensoft.com`)이 일부 남아 있고, 이 프로젝트의 송출·녹화·Webhook에 맞게 고쳐 썼습니다.

<p align="center"><sub>Lime · 1인 개발</sub></p>
