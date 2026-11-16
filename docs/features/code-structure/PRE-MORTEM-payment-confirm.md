## Pre-Mortem: Toss 주문 확정을 한 module로 (STORIES S5)

**Date**: 2026-11-16
**Status**: Draft
**대상**: `apps/api/src/donations/donations.service.ts:296-392`(카드 후원 확정), `apps/api/src/lime/lime.service.ts:151-239`(라임 충전 확정)
**전제**: 동작을 바꾸지 않는 리팩터링. 운영은 Toss 테스트 결제. 마감 2026-11-19, 1인 개발, 실사용자 데이터 없음.

가정: 11/19 제출 직후 심사위원이 후원·충전을 해 봤는데 실패했다. 왜 실패했는가?

### 다시 읽고 바뀐 사실

아키텍처 재검증은 "확정 순서가 두 벌"이라고 했다. 코드를 다시 읽으니 Toss 호출과 오류 매핑(4xx → 400, 그 밖 → 502, 응답 대조)은 이미 `donations/toss-approval.ts`의 `approveTossPayment` 한 곳에 있고 두 경로가 함께 쓴다. 두 벌로 남은 것은 아래뿐이다.

| 단계 | 카드 후원 | 라임 충전 |
|---|---|---|
| 사전 검사 | 주문 없음 404, 남의 주문 403, 금액 400 | 같음 |
| 잠금 전 | **방송 행 `FOR KEY SHARE`(삭제와 교착을 피하는 순서)** | 없음 |
| 주문 행 잠금 | `Donation ... FOR UPDATE` | `LimeCharge ... FOR UPDATE` |
| 이미 확정 | `PAID`, 키가 다르면 409 | `APPROVED`, 키가 다르면 409 |
| 확정 전 거부 | **방송이 지워졌으면 409 `BROADCAST_DELETED`** | 없음 |
| 승인 뒤 | 상태 갱신, 채팅 후원 줄 | 상태 갱신, 잔액 적립, 원장 |
| Toss 거절 | 그대로 둔다(`DonationStatus`에 FAILED 없음) | **트랜잭션 밖에서 FAILED로 표시** |
| P2002 | 409 | 409 |

공유할 수 있는 뼈대는 경로마다 약 30줄이다. 굵은 칸 넷은 경로마다 다르다.

### Risk Summary
- **Tigers**: 4 (launch-blocking 2, fast-follow 1, track 1)
- **Paper Tigers**: 3
- **Elephants**: 3

### Launch-Blocking Tigers
| # | Risk | Likelihood | Impact | Mitigation | Owner | Deadline |
|---|------|-----------|--------|-----------|-------|----------|
| T1 | 공용 module이 주문 행을 먼저 잠그고, 카드 경로의 "방송 행을 먼저 잠근다" 순서가 뒤집힌다. 확정과 방송 삭제가 겹치면 서로 기다려 교착(Postgres가 한쪽을 끊어 500)한다 | 중 | 상: 심사위원의 결제가 500으로 끝나고, Toss는 돈을 받았을 수 있다 | 리팩터링 전에 "확정 진행 중에 방송 삭제" 동시성 e2e를 먼저 더한다(지금 없다). 공용 module은 잠금 전 단계를 호출자에게서 받고, 순서를 주석과 테스트로 고정한다 | 개발자 | 리팩터링 시작 전 |
| T2 | 라임의 "Toss 거절이면 FAILED" 처리가 공용 module로 옮겨 가며 카드에도 걸리거나, 반대로 라임에서 빠진다 | 중 | 중: 카드는 enum에 없는 값으로 500, 라임은 거절된 충전이 PENDING에 남는다 | 거절 처리는 호출자가 고르게 둔다. `lime.e2e`의 "marks a Toss refusal FAILED", `donations.e2e`의 "passes on a Toss refusal" 두 테스트가 지킨다 | 개발자 | 리팩터링 PR |

### Fast-Follow Tigers
| # | Risk | Likelihood | Impact | Planned Response | Owner |
|---|------|-----------|--------|-----------------|-------|
| T3 | 테이블·상태 이름이 달라(`Donation`/`LimeCharge`, `PAID`/`APPROVED`) 공용 잠금 SQL이 식별자를 문자열로 조립하게 된다(`Prisma.raw`). 채점기 호환 규칙(#87, 타입 인자 tagged template 금지)과 SQL 조립 검토 부담이 생긴다 | 중 | 중 | 잠금 SQL은 호출자에 남기고 공용 module은 잠근 행을 받는다. 그러면 공유 몫이 더 줄어든다(아래 Elephant E1) | 개발자 |

### Track Tigers
- **T4 운영에서만 드러나는 회귀**: Toss 테스트 결제는 로컬 e2e에서 `FakeTossPayments`라 실제 Toss 응답 모양(`approvedAt` 없음 등)은 운영에서만 탄다. 트리거: 머지 뒤 운영에서 카드 후원 1건과 라임 충전 1건을 Toss 테스트 결제로 끝까지 해 보고, 실패하면 되돌린다.

### Paper Tigers
- **Toss API 자체의 변화**: `TossPayments` port 뒤에 있고 adapter가 둘(실제·가짜)이며, 승인과 오류 매핑은 이미 한 곳이다. 이 리팩터링은 Toss 호출을 건드리지 않는다. Toss 호출 코드를 고쳐야 하는 상황이 되면 진짜 Tiger가 된다.
- **같은 주문의 이중 적립**: 행 잠금과 원장 `(kind, refId)` UNIQUE, P2002 → 409가 지키고, 동시 확정 e2e가 두 경로 모두 있다(`lime.e2e` 5건 동시, `donations.e2e` 2건 동시).
- **트랜잭션 시간 제한**: 두 경로 모두 `2 × TOSS_REQUEST_TIMEOUT_MS`로 같다. 상수를 합쳐도 값은 바뀌지 않는다.

### Elephants in the Room
- **E1 얻는 것이 생각보다 작다.** Toss 호출이 이미 공유돼 있어서, 공용 module에 남는 것은 사전 검사·주문 행 잠금·이미 확정 처리·P2002 매핑 약 30줄이다. 경로마다 다른 칸 넷(잠금 전 단계, 확정 전 거부, 승인 뒤 할 일, 거절 처리)을 호출자에게서 받아야 한다. interface가 implementation만큼 넓은 얕은 module이 되기 쉽다. 지워 보면(deletion test) 복잡도가 두 호출자로 그대로 돌아갈 뿐이다. 대화 시작: "콜백 넷을 받는 30줄짜리 module이 두 벌보다 읽기 쉬운가?"
- **E2 심사 기준 "예외 처리"에 더 닿는 것은 따로 있다.** 코드 주석이 이미 적어 둔 빈틈 두 개가 남아 있다. (a) 502로 끝난 확정을 재시도하기 전에 방송이 지워지면 Toss가 받은 돈이 기록되지 않는다(`donations.service.ts` 주석 "알려진 빈틈"). (b) guard 통과 뒤 방송이 끝나면 ENDED 방송에 PAID 후원이 남는다. 이 리팩터링은 둘 다 고치지 않는다.
- **E3 마감 이틀 전 돈 경로.** 남은 시간은 실기기 회귀(#17), README 심사자 절과 경쟁한다. 실패하면 심사위원이 직접 보는 결제가 깨진다.

### Go/No-Go Checklist
- [ ] T1: 확정 중 방송 삭제 동시성 e2e를 먼저 더했다
- [ ] T2: 거절 처리 차이를 지키는 두 e2e가 통과한다
- [ ] T3: 잠금 SQL을 호출자에 남겼다(식별자 조립 없음)
- [ ] T4: 머지 뒤 운영에서 카드 후원·라임 충전 Toss 테스트 결제를 한 번씩 끝까지 했다
- [ ] 되돌리기: 리팩터링을 커밋 하나로 둬 `git revert` 한 번으로 되돌린다

### 판정

**제출 전에는 No-Go를 권한다.** 근거: Launch-blocking Tiger 둘의 대응(동시성 테스트 추가)만으로 반나절이 들고, E1대로 얻는 depth가 작다. 대신 아래 둘 중 하나를 고른다.

1. S5를 제출 뒤로 미루고, 지금은 STORIES의 Open Questions에 E2 빈틈 둘을 적어 두는 데서 멈춘다.
2. S5를 "상수·문구·`hasPrismaCode` 복사본만 한 곳으로"로 줄인다. 동작 경로를 건드리지 않아 Tiger가 없지만, 얻는 것도 표면 정리뿐이다.
