# 코드 구조 개선

사용자 기능이 아니라 코드 구조를 다듬는 작업을 모은다. 공모 원문 4절 평가 기준 "코드 품질 및 안정성: 코드 구조, 예외 처리, 방송 상태 관리"를 겨냥한다. 모두 동작을 바꾸지 않는 리팩터링이고, S1만 사용자에게 보이는 버그(작업 직후 다시 읽기가 버려짐)를 고친다.

출발점은 2026-11-16 아키텍처 재검증(main 40f9ebc)이다. 지난 리뷰(11-10, 6e6da05) 이후 72커밋을 다시 읽고 후보마다 유효·변형·해소를 판정했다.

## 요구사항

- [STORIES](./STORIES.md): 스토리 S1~S9, 수락 기준, 자르는 선
- [PRE-MORTEM-payment-confirm](./PRE-MORTEM-payment-confirm.md): S5(Toss 확정 통합)의 사전 부검. 제출 전 No-Go 권고

크기 판정(`docs/agents/pm-skills.md`): S1~S4·S6·S7은 API·DB를 바꾸지 않는 "방향이 정해진" 작업이라 스토리로 수락 기준을 만들었다. S5는 결제 경로라 사전 부검을 더했다. 방향은 리뷰에서 정해져 탐색·PRD는 거치지 않았다.

## 이슈와 PR

| 스토리 | 내용 | 이슈 | PR |
|---|---|---|---|
| S1, S2 | 폴링 읽기 한 module, 작업 직후 다시 읽기 | #195 | #201 |
| S3, S4 | 방송 상태 전이 한 module, 시계 하나 | #196 | #202 |
| S5 | Toss 주문 확정 한 module | #197 (제출 뒤) | |
| S6 | 송출 화면의 송출 주체 판정 | #198 | #203 |
| S7 | 결제 완료 알림 한 module | #199 | #204 |
| S8 | 폴링 요청 제한 시간 | #205 | #206 |
| S9 | 카드 확정·방송 삭제 동시성 e2e(S5 선행) | #207 | |

## 코드 위치

- 폴링 읽기: `apps/web/src/use-api.ts`(`usePolledApi`)
- 방송 상태 전이: `apps/api/src/publish/`, `apps/api/src/broadcasts/broadcasts.service.ts`(S3 뒤 바뀐다)
- Toss 확정: `apps/api/src/donations/donations.service.ts`, `apps/api/src/lime/lime.service.ts`, `apps/api/src/donations/toss-approval.ts`
- 송출 주체 판정: `apps/web/src/pages/PublishPage.tsx`
- 결제 완료 알림: `apps/web/src/pages/DonationSuccessPage.tsx`, `LimeChargeSuccessPage.tsx`, `apps/web/src/donation/paymentNotice.ts`, `paymentFrame.ts`

## 확인 방법

동작을 바꾸지 않으므로 기존 테스트가 기준이다.

- web: `pnpm --filter @lsp/web test`
- api: 자기 테스트 DB로 `pnpm --filter @lsp/api test`(`docs/DEVELOPMENT.md` "API 테스트 DB")
- 루트: `pnpm typecheck`, `pnpm lint`
- S1은 시청 화면에서 댓글을 쓴 직후 목록이 바로 바뀌는지 확인한다.
