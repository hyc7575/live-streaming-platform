## Backlog: API 운영 품질 개선

**Format**: User Stories
**출처**: 2026-11-17 `apps/api`를 `nodejs-backend-patterns`(wshobson/agents) Best Practices 15개 항목으로 검토한 결과(main 51e61ff). 15개 중 10개는 이미 지킨다. 아래 3개는 검토에서 어긋난 항목이다. APM·Pino·Repository 계층·커스텀 에러 클래스는 지금 문제가 없어서 뺐다.
**Total stories**: 3
**Estimated total effort**: 약 3시간 (S≈1h)

실사용자 데이터 없음. 근거는 공모 원문 4절 평가 기준("코드 품질 및 안정성"), 현재 코드와 `deploy/` 설정이다.

### Stories

#### S1: DB가 끊기면 헬스체크가 실패한다
**운영자로서, API가 DB에 닿지 못할 때 `/api/health`가 실패를 알려 주기를 원한다. 그래야 `docker compose ps`와 배포 `--wait`가 API의 실제 상태를 보여 준다.**

`src/health.controller.ts`는 항상 `{status:'ok'}`를 돌려준다. `deploy/compose.yaml`의 API healthcheck와 배포 `docker compose up --wait`는 이 응답만 본다. 그래서 DB 연결이 끊겨도 API는 healthy로 남는다. 지금은 UptimeRobot의 `/api/broadcasts` 모니터만 DB 장애를 알아챈다(`docs/OPERATIONS.md` 다운 감시). 규칙: Implement health checks for monitoring.

Acceptance Criteria:
- [ ] `/api/health`가 `SELECT 1`로 DB를 확인한다. 성공하면 지금처럼 200 `{status:'ok'}`다
- [ ] DB 확인이 실패하거나 짧은 제한 시간(2초 안팎, compose healthcheck `timeout: 5s`보다 짧게)을 넘으면 503을 돌려준다. 본문에 문자열 `ok`가 없다(UptimeRobot Keyword 모니터가 `ok`로 판정한다)
- [ ] 쿼리는 채점기 규칙대로 `$queryRaw(Prisma.sql\`...\`)` 함수 호출 형태다(타입 인자를 붙인 tagged template 금지, #87)
- [ ] e2e가 DB 정상 200과 DB 실패 503을 모두 확인한다
- [ ] `docs/OPERATIONS.md` 다운 감시 절이 health가 DB까지 본다고 적는다

Priority: P1 | Effort: S | Dependencies: none

---

#### S2: 요청 제한 설정과 사용자 단위 가드가 한 곳에 있다
**개발자로서, 요청 제한 기본값과 사용자 단위 가드를 한 곳에서 고치기를 원한다. 그래야 한 모듈만 바꿨을 때 다른 라우트의 제한이 몰래 달라지지 않는다.**

`ThrottlerModule.forRoot([{ limit: 100, ttl: 60_000 }])`가 `auth.module.ts`, `chat.module.ts`, `comments.module.ts`에 세 번 있다. 이 모듈은 전역 모듈이라 지금은 옵션이 같아서 하나로 합쳐질 뿐이다. 사용자별로 세는 `UserThrottlerGuard`도 `auth/user-throttler.guard.ts`(사용자가 없으면 예외)와 `donations/confirm-gate.ts`(IP로 대신 셈) 두 벌이다. 두 가드 모두 `LoggedInGuard` 뒤에서만 쓰여 동작 차이는 드러나지 않는다. 규칙: Add rate limiting(설정 위치), DI로 유지보수.

Acceptance Criteria:
- [ ] `ThrottlerModule.forRoot`는 `AppModule`(또는 한 공용 모듈)에서 한 번만 등록한다
- [ ] `UserThrottlerGuard`는 `auth/user-throttler.guard.ts` 하나만 남고, 결제 확정 라우트도 그것을 쓴다
- [ ] 라우트별 한도(`LOGIN_RATE_LIMIT`, `SIGNUP_RATE_LIMIT`, `CHAT_RATE_LIMIT`, `COMMENT_RATE_LIMIT`, `CONFIRM_RATE_LIMIT`)와 429 동작이 그대로다. 기존 e2e가 통과한다
- [ ] 한 사용자의 결제 확정 한도가 다른 사용자에게 번지지 않음을 e2e가 확인한다(없으면 추가)

Priority: P2 | Effort: S | Dependencies: none

---

#### S3: API 응답이 압축되어 내려간다
**시청자로서, 채팅·후원 폴링 응답이 압축되어 모바일 데이터를 덜 쓰기를 원한다.**

`deploy/Caddyfile`의 `encode zstd gzip`은 정적 파일 블록(`handle`)에만 있다. `handle /api/*` 응답은 압축되지 않는다. Node에 `compression` 미들웨어를 넣는 대신 이미 앞에 있는 Caddy에서 압축한다. 규칙: Enable response compression.

Acceptance Criteria:
- [ ] `handle /api/*` 블록에 `encode zstd gzip`을 둔다
- [ ] `Accept-Encoding: gzip`을 보낸 `/api/broadcasts` 응답에 `Content-Encoding: gzip`이 붙는다(로컬 Caddy나 운영에서 `curl`로 확인, PR 본문에 결과)
- [ ] 이미지 업로드(`multipart`)와 `request_body max_size 4MiB` 제한이 그대로다
- [ ] 운영 반영이 필요하면 `docs/OPERATIONS.md` 배포 절차대로 한다고 PR에 적는다

Priority: P2 | Effort: S | Dependencies: none

### Story Map

- 먼저: S1(운영 상태를 바로 보이게 한다)
- 다음: S2(동작 변화 없는 정리), S3(설정 한 줄)

### Technical Notes

- API 계약 변경은 S1의 503 하나다. `/api/health`는 compose healthcheck, 배포 `--wait`, UptimeRobot만 부른다. web은 부르지 않는다.
- compose healthcheck는 컨테이너를 재시작하지 않고 상태만 표시한다. 그래서 일시적인 DB 끊김으로 API가 재시작되지 않는다.
- DB 마이그레이션 없음.

### Open Questions

- 없음.
