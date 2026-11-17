# API 운영 품질 개선

사용자 기능이 아니라 `apps/api`와 그 앞의 Caddy 설정에서 운영 품질을 고치는 작업을 모은다. 공모 원문 4절 평가 기준 "코드 품질 및 안정성"을 겨냥한다.

출발점은 2026-11-17 `nodejs-backend-patterns`(wshobson/agents) Best Practices 검토(main 51e61ff)다. 15개 항목 중 어긋난 3개만 다룬다.

## 요구사항

- [STORIES](./STORIES.md): 스토리 S1~S3, 수락 기준

크기 판정(`docs/agents/pm-skills.md`): 모두 방향이 정해졌고 DB 마이그레이션이 없다. API 계약 변경은 내부 감시만 부르는 `/api/health`의 503 하나라서 스토리로 수락 기준을 만들었다.

## 이슈와 PR

| 스토리 | 내용 | 이슈 | PR |
|---|---|---|---|
| S1 | 헬스체크가 DB 확인 | #238 | #242 |
| S2 | 요청 제한 설정·가드 한 곳으로 | #239 | #243 |
| S3 | `/api` 응답 압축 | #240 | #244 |

## 결과

- `/api/health`가 DB에 `SELECT 1`을 보내고, 실패하거나 2초를 넘기면 `ok` 없는 503을 준다(#242).
- `ThrottlerModule.forRoot`가 auth·chat·comments·search 네 모듈에서 `AppModule` 한 곳으로 모였고, `UserThrottlerGuard`는 두 벌에서 한 벌이 됐다(#243). 이슈 작성 때 놓친 `search.module.ts`와 `lime.controller.ts`도 함께 정리했다.
- 로컬 Caddy(2.10)에서 `/api/broadcasts` 응답 2,016바이트가 gzip 850바이트로 줄었다(#244). 운영 반영은 caddy·api 이미지 재빌드가 필요하다.

## 코드 위치

- 헬스체크: `apps/api/src/health.controller.ts`, `deploy/compose.yaml`
- 요청 제한: `apps/api/src/auth/user-throttler.guard.ts`, `apps/api/src/donations/confirm-gate.ts`, 각 `*.module.ts`
- 압축: `deploy/Caddyfile`

## 확인 방법

- API 테스트(`docs/DEVELOPMENT.md`의 `lsp_test` DB), 루트 `pnpm typecheck`, `pnpm lint`
