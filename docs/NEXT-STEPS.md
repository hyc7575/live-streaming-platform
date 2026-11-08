# 다음 작업과 컨텍스트 위치

> 2026-11-09 기준. 작업은 **코드 레벨(지금, 로컬)**과 **서버 셋팅(나중)** 두 갈래로 나눈다.
> 근거 문서: [PRD.md](./PRD.md) · [PRE-MORTEM.md](./PRE-MORTEM.md). 표의 `§`는 PRD 절, `T`는 PRE-MORTEM 위험 번호다.

## 0. 완료된 것
- [x] PRD 작성 (기술 결정, 인가 매트릭스, 상태 전이, 일정, 컷 규칙)
- [x] Pre-mortem (Tiger 13 / Paper Tiger 5 / Elephant 5) → PRD 반영
- [x] git 저장소 초기화 (`main`), `.gitignore`, gitleaks pre-commit 훅 (`.githooks/`, `core.hooksPath`) — **아직 커밋 안 함**

## 1. 서버 셋팅을 미룬 영향

PRD 8.1은 D2에 서버에서 OME 스파이크를 끝내는 일정이다. 서버를 미루면 스파이크를 **로컬에서 할 수 있는 부분**과 **서버가 있어야 하는 부분**으로 나눈다.

| 스파이크 기준 (PRD 8.1) | 로컬(Mac, Docker) | 서버 필요 |
|---|---|---|
| 2. H.264 송출, 영상 트랜스코딩 없음 | ✓ | |
| 3. 토큰 없는 송출 거절 (Webhook) | ✓ | |
| 4. 관리 API로 송출 강제 종료 | ✓ | |
| Q6. OME 이미지 arm64 지원 | ✓ (Apple Silicon도 arm64) | |
| 1. **LTE 휴대폰 → hls.js 영상·소리** | | ✓ (HTTPS, 공인 IP, UDP) |

- 로컬 스파이크(C1)로 기준 2·3·4를 먼저 판정한다. 하나라도 실패하면 그 시점에 LiveKit 복귀를 판정한다.
- 기준 1은 서버 셋팅(S6) 때 판정한다. **서버 셋팅은 늦어도 D4(11/12)까지** 끝내야 LTE 실패 시 LiveKit으로 돌아갈 시간이 남는다. 이 기한을 넘기면 컷 규칙이 사실상 무력해진다.

---

## 2. 코드 레벨 작업 (지금, 로컬)

| # | 작업 | 완료 기준 | 컨텍스트 |
|---|---|---|---|
| C0 | **저장소 기반**: 폴더 구조(`apps/api` NestJS, `apps/web` React, `infra/`), TypeScript strict + ESLint, GitHub Actions(typecheck·lint·build·test), `.env.example`, 로컬용 `docker-compose`(PostgreSQL, OME), 첫 커밋 + 공개 GitHub 저장소 | CI 통과, 훅이 첫 커밋에서 동작 | §7.2, §7.9, T11 |
| C1 | **로컬 OME 스파이크**: Mac Chrome → OME(WebRTC) → hls.js 재생, H.264 고정, Admission Webhook 거절, 관리 API 강제 종료, arm64 이미지 | 위 1장 표의 로컬 기준 전부 통과 | §7.2, §7.4, §7.6, §8.1, Q1·Q2·Q6, T1·T3 |
| C2 | **ORM·인증**: ORM 확정(Prisma/TypeORM), 회원가입·로그인·로그아웃, 세션 쿠키, 로그인 요청 제한, 테스트 계정 원클릭 로그인 + 시드 | 로그인 왕복, 테스트 계정 2개(A/B) | §7.1, §7.9, A2·A3, T10 |
| C3 | **채널·방송 도메인**: `User`–`Channel`–`Broadcast` 스키마, CRUD, 상태 전이(READY→LIVE→ENDED), Guard(로그인→소유자), 송출 토큰 발급, Admission Webhook, 비정상 종료 유예, 좀비 방송 정리 | §7.5 인가 매트릭스 자동 테스트 전부 통과 | §7.3, §7.4, §7.5, §7.6, T8 |
| C4 | **PC 송출**: `getDisplayMedia` + 마이크, Web Audio 믹싱(클릭 시 `resume()`), 송출 사전 점검 화면(레벨 미터 2개, 오디오 없음 경고, 브라우저 경고), 마이크 음소거, 종료 시 연결 닫기·트랙 `stop()`·"공유 중지" 처리 | Mac Chrome에서 화면+탭 소리+마이크가 시청 탭에서 들림 | §7.1, §7.4, §7.7, §7.8, T4·T7 |
| C5 | **모바일 송출**: 카메라+마이크, 전·후면 전환, Wake Lock, 권한 거부 안내 | 로컬 HTTPS(mkcert + 같은 Wi-Fi)로 실제 휴대폰 송출. LTE는 S6에서 | §7.1, T5 |
| C6 | **시청**: 목록(LIVE/ENDED)·상세, hls.js 저지연 재생, 상태 5초 폴링, 종료 시 hls 정리 + "방송 종료" | §8.3 시나리오 1~9 중 로컬로 가능한 것 통과 | §7.1, §7.4, T9 |
| C7 | **댓글 (P1)**: CRUD + 작성자 권한 | 작성자 권한 테스트 통과 | §7.1, §7.5 |
| C8 | **녹화 (P2)** → 여유 있으면 **도네이션 (P2)** | 해당 시나리오 통과 | §7.1, §8.4 |
| C9 | **README** (기능 하나 끝날 때마다): 실행 방법, 환경변수 예시, 테스트 계정, 기능 확인 절차, 지원 환경(미검증 표시), "소리가 안 나올 때", `git config core.hooksPath .githooks` 안내 | 다른 사람이 README만 보고 재현 | §7.8, §8.3, T13 |

컷 규칙: D6(11/14) 끝까지 P0(C0~C6)가 실제 기기에서 통과하지 않으면 C7·C8을 보류한다.

---

## 3. 서버 셋팅 작업 (나중, 늦어도 D4 = 11/12까지)

| # | 작업 | 완료 기준 | 컨텍스트 |
|---|---|---|---|
| S1 | Oracle Cloud 가입 → 종량제(PAYG) 전환 → 0원 초과 결제 알림 | 콘솔에서 알림 확인 | A4·A6 |
| S2 | 서울/춘천 ARM A1 인스턴스 (2 OCPU / 12GB, Ubuntu). **2시간 제한**, 실패 시 서울 유료 VPS 2GB | SSH 접속 | A5, T2 |
| S3 | 방화벽 **두 곳**: Oracle 보안 목록 + 인스턴스 iptables. 443/TCP, OME UDP(ICE), TURN TCP | 외부에서 포트 도달 확인 | §7.2 |
| S4 | Docker 설치·부팅 시 자동 시작, DuckDNS 도메인, Caddy 자동 HTTPS | `https://<도메인>` 응답 | §7.2, A4 |
| S5 | 운영용 Compose 배포, 전 서비스 `restart: unless-stopped`, UptimeRobot 감시 | 재부팅 후 자동 복구, 다운 알림 수신 | §7.9, T6 |
| S6 | **스파이크 기준 1**: Wi-Fi 끈 iPhone/Android → 서버 → PC hls.js 영상·소리. 송출 1 + 시청 3에서 CPU 확인 | 통과 못 하면 LiveKit 복귀 판정 | §8.1, A1, Q3, T1·T5 |
| S7 | 녹화 디스크 상한·오래된 파일 삭제, PostgreSQL 일일 덤프 + 복원 리허설 1회 | 덤프 복원 성공 | §7.9, T6 |
| S8 | README에 서비스 URL·테스트 계정 반영, 복구 절차 운영 메모 | README만으로 접속·로그인 | C9 |

---

## 4. 컨텍스트 위치

| 무엇 | 어디 |
|---|---|
| 요구사항 해석, 기술 결정, 인가·상태·흐름, 일정·컷 규칙 | `docs/PRD.md` |
| 위험과 대응, Go/No-Go 체크리스트 | `docs/PRE-MORTEM.md` |
| 이 작업 목록 | `docs/NEXT-STEPS.md` |
| 결정 이유 (OME 선택, Oracle 선택) | `~/career-log/2026-11.md` |
| 비밀값 차단 설정 | `.gitignore`, `.githooks/pre-commit` |
| 공모 원문·평가 체크리스트 | `docs/private/CONTEST-BRIEF.md` (gitignore 대상, 로컬에만 있음). PRD는 원문의 해석본이다 |

## 5. 아직 정하지 않은 것 (grill 대상)

| 항목 | 현재 상태 | 위치 |
|---|---|---|
| ORM: Prisma vs TypeORM | Prisma 추천, 미확정 | A2 |
| 인증: 세션 쿠키 | 가정, 미확정 | A3 |
| 송출 중 새로고침 시 재접속 허용 | "유예 안 재접속 허용" 방향 | Q5 |
| 보유 기기 (iPhone, Android, Windows PC) | 미확인. 없으면 README에 "미검증" | Elephant 2 |
| D2 컷 규칙을 지킬 의지 (OME 학습 욕심 vs 마감) | 미확인 | Elephant 1 |
| 서버 셋팅 기한 D4가 현실적인가 | 이번에 새로 생긴 제약 | 1장 |

## 6. 검증하지 않은 사실 (구현 전에 문서로 확인)

이 세션에서 지식 기반으로 말했고, 공식 문서로 확인하지 않았다.

- OME: WHIP/WebRTC 송출 시 H.264 협상 강제 방법, Admission Webhook 형식, 송출 강제 종료 REST API, Opus→AAC 변환 설정, 내장 TURN, arm64 Docker 이미지, 녹화 API
- 브라우저: macOS Chrome의 시스템 소리 지원 여부, iOS Safari의 Screen Wake Lock 지원 버전
- Oracle: Always Free 유휴 회수 조건, 종량제 전환 시 무료 범위
- LiveKit Cloud 무료 티어 한도 (복귀안 판단용)
