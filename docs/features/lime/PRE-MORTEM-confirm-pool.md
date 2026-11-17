## Pre-Mortem: 결제 확정 gate·요청 제한·pool 대기 제한 (#215)

**Date**: 2026-11-17
**Status**: Draft
**대상**: [STORIES-confirm-pool.md](./STORIES-confirm-pool.md)
**전제**: 운영은 Toss 테스트 결제다. 마감은 2026-11-19, 1인 개발이다. 실사용자 데이터는 없다.

가정: 11/19 제출 직후 심사위원이 라임 충전이나 카드 후원을 해 봤는데 실패했다. 왜 실패했는가?

### Risk Summary
- **Tigers**: 4 (launch-blocking 2, fast-follow 1, track 1)
- **Paper Tigers**: 3
- **Elephants**: 2

### Launch-Blocking Tigers
| # | Risk | Likelihood | Impact | Mitigation | Owner | Deadline |
|---|------|-----------|--------|-----------|-------|----------|
| T1 | 확정이 예외로 끝났는데 gate가 자리를 돌려주지 않는다. 그 사용자의 다음 확정이 영영 기다리거나, 전체 상한 3자리가 새어 모든 결제가 멈춘다 | 중 | 상: 결제가 끝나지 않는다. Toss는 돈을 받았는데 적립이 안 될 수 있다 | 해제를 `finally`에 둔다. 단위 테스트로 지킨다: 실패한 작업 뒤 같은 사용자의 다음 작업이 돈다, 상한 자리가 돌아온다 | 개발자 | 이 PR |
| T2 | 직렬화가 같은 주문 동시 확정(새로고침, 두 탭, 모달 iframe과 새 탭)의 응답을 바꾼다. 예를 들어 Toss를 두 번 부르거나 409를 낸다 | 하 | 상: 중복 승인 시도, 사용자 오류 화면 | gate는 기존 transaction을 통째로 감싸기만 한다. 잠금·상태 확인·원장 UNIQUE는 그대로다. `lime.e2e`(5건 동시)와 `donations.e2e`(2건 동시)의 "Toss 한 번" 테스트가 통과해야 머지한다 | 개발자 | 이 PR |

### Fast-Follow Tigers
| # | Risk | Likelihood | Impact | Planned Response | Owner |
|---|------|-----------|--------|-----------------|-------|
| T3 | `connectionTimeoutMillis` 5초 때문에, 전에는 느리게라도 끝나던 요청이 순간 부하에서 500이 된다(세션 로드 포함) | 하 | 중 | gate가 확정 몫을 3연결로 묶어 pool이 차는 경로가 줄었다. 운영 로그에서 `timeout exceeded when trying to connect`가 보이면 `max`를 올린다. Postgres `max_connections`는 100이다(로컬 값) | 개발자 |

### Track Tigers
- **T4 정상 결제가 공격자 줄 뒤에서 기다린다**: 여러 계정이 확정을 몰아 보내면 전체 상한 3자리를 두고 심사위원의 확정도 기다린다. 웹의 확정 요청에는 클라이언트 timeout이 없다(`useConfirmPayment.ts`). 그래서 실패하지 않고 늦어질 뿐이다. 사용자별 1분 20회 제한과 가입 제한(IP당 1시간 20회)이 계정 수와 양을 묶는다. 트리거: 운영에서 확정 응답이 10초를 넘는 로그.

### Paper Tigers
- **중복 충전**: gate는 transaction 앞에서 기다리게만 한다. 주문 행 `FOR UPDATE`, 이미 확정 처리, 원장 `(kind, refId)` UNIQUE는 그대로다. 정합성 경로를 건드리지 않는다. Toss 호출을 잠금 밖으로 빼면 Tiger가 된다. 그래서 이번에는 빼지 않는다.
- **API가 여러 프로세스**: 운영 compose의 API는 컨테이너 하나다. gate가 메모리에 있어도 상한이 맞다. 수평 확장하면 프로세스 수만큼 상한이 커지므로 Tiger가 된다.
- **요청 제한이 정상 사용을 막음**: 성공 페이지는 마운트당 한 번 확정한다. 1분 20회는 새로고침 몇 번과 두 탭에 충분하다. e2e는 테스트마다 새 사용자를 쓴다.

### Elephants in the Room
- **E1 근본 원인은 남는다.** Toss 응답을 기다리는 동안 행 잠금과 연결을 쥐는 구조는 그대로다. 이번 수정은 그 비용의 상한(연결 3개)만 정한다. 근본 수정은 #197(제출 뒤)과 함께 Toss 호출을 transaction 밖으로 빼는 것이다. 같은 Idempotency-Key 동시 요청에 Toss가 어떻게 답하는지는 아직 모른다. 대화 시작: "Toss 승인과 적립을 두 단계로 나누면 FAILED 표시와 승인 사이 경합을 무엇이 막는가?"
- **E2 운영 Toss 지연을 모른다.** 로컬 stub은 300 ms였다. 운영의 가짜 `paymentKey` 응답 시간, 프록시·WAF 제한은 확인하지 않았다(Toss 호출 금지).

### Go/No-Go Checklist
- [ ] T1: gate 해제 단위 테스트 통과
- [ ] T2: `lime.e2e`·`donations.e2e`·`authorization-matrix.e2e` 통과
- [ ] 회귀 e2e: 같은 주문 동시 확정 중 다른 사용자 `/api/auth/me`가 1초 안에 200
- [ ] 되돌리기: 커밋 하나로 둬 `git revert` 한 번으로 되돌린다
- [ ] 머지 뒤 사람 확인: 운영에서 라임 충전과 카드 후원 Toss 테스트 결제를 한 번씩 끝까지 한다(Playwright로 PIN 입력은 자동화하지 않는다)

### 판정

**Go.** Launch-blocking Tiger 둘 다 이 PR의 테스트로 막을 수 있다. 결제 정합성 경로(잠금, 상태 확인, UNIQUE)는 건드리지 않는다.
