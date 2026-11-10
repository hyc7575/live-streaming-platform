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
| 1. **LTE 휴대폰 → hls.js 영상·소리** | | ✓ (HTTPS, 공인 IP, UDP) 2026-11-09 S6 |

- 로컬 스파이크(C1)로 기준 2·3·4를 D2(11/10)에 먼저 판정한다. 하나라도 실패하면 그 시점에 LiveKit 복귀를 판정한다.
- 기준 1(Android LTE 송출)은 **D3(11/11) 18:00**에 서버에서 판정한다. 이를 위해 S1–S4와 S6만 먼저 하고, S5·S7·S8은 그 뒤에 한다.
- **판정 전에는 OME 전용 코드(Webhook, 강제 종료)를 짜지 않는다.** C2(인증)와 C3의 CRUD처럼 LiveKit으로 복귀해도 버려지지 않는 것만 짠다. D4로 미루면 OME 의존 코드를 짠 뒤에 판정하게 되어 컷 규칙이 무력해진다.
- **판정 (2026-11-09): OME 유지.** 기준 1–4와 Q6 모두 통과(#2, #9). D3 18:00보다 이틀 먼저 판정했으므로 OME 전용 코드(C3 후반, C4·C5 송출 연결)를 바로 시작한다.

---

## 2. 코드 레벨 작업 (지금, 로컬)

| # | 작업 | 완료 기준 | 컨텍스트 |
|---|---|---|---|
| C0 | **저장소 기반**: 폴더 구조(`apps/api` NestJS, `apps/web` React, `infra/`), TypeScript strict + ESLint, GitHub Actions(typecheck·lint·build·test), `.env.example`, 로컬용 `docker-compose`(PostgreSQL, OME), 첫 커밋 + 공개 GitHub 저장소 | CI 통과, 훅이 첫 커밋에서 동작 | §7.2, §7.9, T11 |
| C1 | **로컬 OME 스파이크**: Mac Chrome → OvenLiveKit-Web(WHIP) → OME → hls.js 재생, 실제 송출 코덱이 H.264인지 확인, Admission Webhook 거절(쿼리스트링 토큰), `DELETE` 강제 종료 후 재접속이 Webhook에서 거절되는지, `ovenmedialabs/ovenmediaengine:v0.21.0` arm64 | 위 1장 표의 로컬 기준 전부 통과 | §7.2, §7.4, §7.6, §8.1, Q1·Q2·Q6, T1·T3 |
| C2 | **ORM·인증**: Prisma, 회원가입·로그인·로그아웃, 세션 쿠키(PostgreSQL 세션 저장소), 로그인 요청 제한, 테스트 계정 원클릭 로그인 + 시드 | 로그인 왕복, 테스트 계정 2개(A/B) | §7.1, §7.9, A2·A3, T10 |
| C3 | **방송 도메인**: `User`–`Broadcast` 스키마(`Channel` 없음), CRUD, Guard(로그인→소유자) — 여기까지는 판정 전 가능. **D3 판정 후**: 상태 전이(READY→LIVE→ENDED), 송출 토큰 발급, 1인 1 LIVE, Admission Webhook(유예 30초 재접속), 비정상 종료 유예, 좀비 방송 정리 | §7.5 인가 매트릭스 자동 테스트 전부 통과 | §7.3, §7.4, §7.5, §7.6, T8 |
| C4 | **PC 송출**: `getDisplayMedia` + 마이크(macOS 시스템 소리 옵션이 뜨는지 직접 확인), Web Audio 믹싱(클릭 시 `resume()`), 송출 사전 점검 화면(레벨 미터 2개, 오디오 없음 경고, 브라우저 경고), 마이크 음소거, 종료 시 연결 닫기·트랙 `stop()`·"공유 중지" 처리 | Mac Chrome에서 화면+탭 소리+마이크가 시청 탭에서 들림 | §7.1, §7.4, §7.7, §7.8, T4·T7 |
| C5 | **모바일 송출**: 카메라+마이크, 전·후면 전환, Wake Lock, 권한 거부 안내 | 로컬 HTTPS(mkcert + 같은 Wi-Fi)로 실제 휴대폰 송출. LTE는 S6에서 | §7.1, T5 |
| C6 | **시청**: 목록(LIVE/ENDED)·상세, iOS 네이티브 HLS / 그 외 hls.js 저지연 재생, 상태 5초 폴링, 종료 시 hls 정리 + "방송 종료" | §8.3 시나리오 1~9 중 로컬로 가능한 것 통과 | §7.1, §7.4, T9 |
| C7 | **댓글 (P1)**: CRUD + 작성자 권한 | 작성자 권한 테스트 통과 | §7.1, §7.5 |
| C8 | **녹화 (P2)** → 여유 있으면 **도네이션 (P2)** | 해당 시나리오 통과 | §7.1, §8.4 |
| C9 | **README** (기능 하나 끝날 때마다): 실행 방법, 환경변수 예시, 테스트 계정, 기능 확인 절차, 지원 환경(미검증 표시), "소리가 안 나올 때", `git config core.hooksPath .githooks` 안내, **사용한 오픈소스(이름·링크·라이선스)** | 다른 사람이 README만 보고 재현 | §7.8, §8.3, T13 |

컷 규칙: D6(11/14) 끝까지 P0(C0~C6)가 실제 기기에서 통과하지 않으면 C7·C8을 보류한다.

---

## 3. 서버 셋팅 작업 (S1–S4·S6은 D3 = 11/11 18:00까지, 나머지는 그 뒤)

| # | 작업 | 완료 기준 | 컨텍스트 |
|---|---|---|---|
| S1 | Oracle Cloud 가입(**홈 리전 오사카** — 변경 불가) ✓ 2026-11-09. PAYG 전환은 보류(A6), S2에서 재고 부족이 30분~1시간 이어지면 전환하고 결제 알림(Budget)을 함께 건다 | 가입 완료 / 전환 시 알림 확인 | A4·A6 |
| S2 | 오사카 ARM A1 인스턴스 (2 OCPU / 12GB 이하, Ubuntu 24.04). **2시간 제한**, 실패 시 서울 유료 VPS 2GB. ✓ 2026-11-09: A1은 AD-1 재고 부족(Out of capacity)으로 생성 실패. 체험 크레딧($300, 30일 뒤 소멸)으로 **E5.Flex 2 OCPU / 16GB(x86)** `lsp-prod`를 대신 생성, 공인 IP `129.225.169.22`, SSH 접속 확인. 체험 종료(약 12/9) 전에 A1로 옮기거나 PAYG 전환 필요 (A4) | SSH 접속 | A5, T2 |
| S3 | 방화벽 **두 곳**: Oracle 보안 목록 + 인스턴스 iptables. 443/TCP, `10000-10003/udp`, `10000/tcp`, `3478/tcp` (+ ACME용 80/TCP). ✓ 2026-11-09: 두 곳 모두 추가, iptables는 `netfilter-persistent save`로 영구화. Mac에서 TCP 80·443·3478·10000, UDP 10002 도달 확인 | 외부에서 포트 도달 확인 | §7.2 |
| S4 | Docker 설치·부팅 시 자동 시작, DuckDNS 도메인, Caddy 자동 HTTPS. ✓ 2026-11-09: Docker 29.9 + Compose 설치·`enable`, 도메인 **`lsp-live.duckdns.org`** → `129.225.169.22`, Caddy가 Let's Encrypt 인증서 발급(HTTP-01). 서버 `~/lsp`에 임시 구성(`compose.yaml` + `compose.server.yaml` + `Caddyfile`): `/app/*`는 OME(3333)로 중계(응답 헤더 `server: OvenMediaEngine`, `via: Caddy` 확인), HTTP는 HTTPS로 308. OME ICE 후보에 공인 IP 확인. 운영 구성은 S5에서 정리 | `https://<도메인>` 응답 | §7.2, A4 |
| S5 | 운영용 Compose 배포, 전 서비스 `restart: unless-stopped`, UptimeRobot 감시. ✓ 2026-11-10: 임시 구성(`~/lsp`, Caddy만 실행 중)을 내리고 `~/live-streaming-platform`에서 `deploy/compose.yaml`로 배포(#16). Let's Encrypt 인증서, http→https 308, `/api/health` 200, 테스트 계정 A·B, Caddy 경유 로그인 쿠키 `HttpOnly; Secure; SameSite=Lax`, API 3000 외부 닫힘 확인. PC 송출·시청 확인, 서버 재부팅 뒤 자동 복구와 방송 목록 유지 확인. Docker·containerd 부팅 자동 시작 `enabled`. 공인 IP는 Ephemeral(인스턴스 Stop/Start로는 유지, Terminate하면 사라짐). UptimeRobot은 #45로 분리 | 재부팅 후 자동 복구, 다운 알림 수신(#45) | §7.9, T6 |
| S6 | **스파이크 기준 1**: Wi-Fi 끈 Android Chrome → 서버 → PC hls.js 영상·소리. 송출 1 + 시청 3에서 CPU 확인. ✓ 2026-11-09: LTE에서 `transport=all`은 UDP 직결, `relay` 강제 시 TURN(TCP 3478)으로 송출, 둘 다 PC에서 영상·소리 확인. 송출 1 + 시청 3에서 OME CPU 평균 5.1%·최대 6.5%(코어 1개 = 100%), 호스트 평균 0.9%. 근거는 #9 댓글, 페이지는 `spike/issue-2-ome`의 `spike/ome/s6/`. **판정: OME 유지** | 통과 못 하면 LiveKit 복귀 판정 | §8.1, A1, Q3, T1·T5 |
| S7 | 녹화 디스크 상한·오래된 파일 삭제, PostgreSQL 일일 덤프 + 복원 리허설 1회. 2026-11-10: `deploy/compose.yaml`에 `db-backup` 서비스(매일 04:00 KST `pg_dump -Fc`, 7일 지난 덤프 삭제, 호스트 `deploy/backups/`)를 넣었다(#48). 로컬에서 운영 compose로 덤프 → 볼륨 삭제 → 복원 리허설 1회 성공. 서버(#49 배포 뒤): 수동 덤프 `lsp-20261110-111945.dump`(12.0K)를 별도 DB `lsp_restore_check`에 복원해 사용자 2·방송 1이 운영 DB와 같음을 확인하고 그 DB를 지웠다. 04:00 자동 덤프는 아직 확인 전. 서버 밖 사본 없음. 녹화(#19, #52): 2026-11-10 서버 반영. 반영 전 루트 디스크 45G 중 여유 36G라 `RECORDINGS_MAX_GB`는 기본값 10(GiB)을 그대로 쓴다. API가 30초마다 `deploy/recordings/`를 재고 넘으면 오래 전에 끝난 방송의 녹화부터 지운다. 반영 뒤 짧은 방송을 송출·종료해 다시보기 목록에 오르고 재생되는 것을 확인했다. 용량 상한 삭제는 서버에서 아직 일어난 적 없음. 녹화는 백업하지 않는다 | 덤프 복원 성공 | §7.9, T6 |
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

## 5. 결정됨 (2026-11-09 grill)

| 항목 | 결정 | 반영 위치 |
|---|---|---|
| ORM | Prisma | PRD A2 |
| 인증 | 세션 쿠키 + PostgreSQL 세션 저장소 | PRD A3 |
| 송출 중 새로고침 | `LIVE`이면서 송출 연결 없음 + 유예 30초 안이면 재접속 허용. 송출 토큰은 방송 단위·단기 만료 | PRD 7.4, 7.5 |
| 동시 방송 | 1인 1 LIVE, 위반 시 409 | PRD 7.4 |
| 데이터 모델 | `Channel` 제거, `User 1:N Broadcast` | PRD 7.3 |
| 송출 클라이언트 | OvenLiveKit-Web (WHIP, 기본 H.264) | PRD 7.2 |
| 시청 재생 | iOS 네이티브 HLS, 그 외 hls.js | PRD 7.4 |
| 보유 기기 | Windows PC, Android, MacBook M3. iPhone은 D6에 빌려서 1회 확인 | PRD 7.8 |
| 인수 시나리오 | 회원가입·로그아웃(0), 소유자 수정·삭제 성공(2-1) 추가 | PRD 8.3 |
| 목록 노출 | 공개 목록은 LIVE·ENDED만, READY는 "내 방송"에 "방송 전" | PRD 7.4 |
| 오픈소스 출처 | README "사용한 오픈소스" 절 + 가져온 코드 파일 주석 | C9 |
| 컷 규칙 | 약속함. 2026-11-09 판정: OME 유지 | PRD 8.1 |
| 서버 기한 | S1–S4·S6을 D3까지 | 1장, 3장 |
| Oracle 홈 리전 | 오사카 (가입 목록에 서울 없음, 2026-11-09 변경) | PRD A4 |
| PAYG 전환 | 보류. A1 재고 부족이 이어질 때 전환 | PRD A6 |

## 6. 검증 결과 (2026-11-09, 공식 문서 확인)

| 항목 | 결과 |
|---|---|
| OME 저장소·이미지 | `OvenMediaLabs/OvenMediaEngine`으로 이전, 이미지 `ovenmedialabs/ovenmediaengine`, 최신 안정판 v0.21.0, arm64 지원. 문서 `ovenmedia.com/docs/ome` |
| H.264 강제 | 서버 설정 없음. 클라이언트 SDP로 결정. OvenLiveKit-Web WHIP 기본 H.264 |
| Admission Webhook | 쿼리스트링 포함 전체 URL 전달(헤더는 전달 안 됨), `allowed`·`lifetime`·`reason` 응답, `X-OME-Signature` HMAC-SHA1, 오류·타임아웃 시 거절(fail-closed), `closing`은 알림만 |
| 강제 종료 | `DELETE /v1/vhosts/{vh}/apps/{app}/streams/{s}`. 재접속은 막지 않음 → Webhook으로 거절 |
| Opus→AAC | 기본 `bypass_stream` 프로필. LL-HLS는 AAC만 지원 |
| TURN | 내장, TCP 3478만. 443 TLS TURN은 문서에 없음. Direct TCP ICE `10000/tcp` |
| 녹화 | `:startRecord` / `:stopRecord`, `<FILE>` 퍼블리셔, 확장자로 컨테이너 결정 |
| macOS 시스템 소리 | Chrome 141+ · macOS 14.2+ 지원 (2차 출처) → C4에서 직접 확인 |
| iOS Wake Lock | 16.4+ |
| iOS 재생 | 네이티브 HLS가 LL-HLS 지원(iOS 14+), hls.js는 iOS 17.1+ |
| Oracle | A1 무료 2 OCPU / 12GB(월 1,500 OCPU시간, 2026-06에 4 OCPU / 24GB에서 절반으로 줄어듦), 춘천 A1 불가, 도쿄·오사카 AD 1개, 유휴 기준 7일 95퍼센타일 20% 미만. PAYG 회수 면제는 공식 출처 없음. Always Free는 홈 리전에서만 무료 |
| LiveKit Build | 무료, 동시 100, 5,000 참여분, 녹화 60분 |

## 7. 아직 남은 검증 (실측)

- C4: Mac Chrome에서 시스템 소리 공유가 되는가
- 토스페이먼츠 테스트 모드 (PRD Q4, P2 착수 전)
