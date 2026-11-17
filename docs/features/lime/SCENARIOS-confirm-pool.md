## Test Scenarios: 결제 확정이 공유 DB 연결을 붙잡지 않게 한다 (#215)

**출처**: [STORIES-confirm-pool.md](./STORIES-confirm-pool.md) 수락 기준
**시나리오 수**: 9 (자동 7, 사람 확인 2)
**덮는 범위**: 정상 경로, 동시성, 오류, 요청 제한, 성능
**환경**: 자동 테스트는 `FakeTossPayments`(`TOSS_PAYMENTS` provider override)로 Toss를 대신한다. 실제 Toss는 부르지 않는다. 사람 확인은 운영의 Toss 테스트 결제다. Playwright로 결제창 PIN을 입력하지 않는다.

### 자동 테스트

#### S1: 같은 주문 확정을 몰아 보내도 다른 사용자가 느려지지 않는다
**Tests**: Story 1 · **위치**: `apps/api/test/payment-confirm-pool.e2e.spec.ts` "keeps another user’s requests fast…" · **Priority**: Critical

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | 공격자가 라임 충전을 주문한다. Toss stub은 300 ms 뒤 404를 준다 | 주문 201 |
| 2 | 공격자가 그 주문의 확정 20개를 가짜 키로 동시에 보낸다 | 확정은 하나씩 들어간다 |
| 3 | 그동안 시청자가 `GET /api/auth/me`를 세 번 부른다 | 매번 200, 1초 안(수정 전 4.8초) |
| 4 | 공격 요청이 끝난다 | 모두 400(Toss 거절), 500 없음, Toss 동시 호출 최대 1 |

#### S2: 한 사용자의 라임 충전과 카드 후원 확정은 함께 한 줄로 선다
**Tests**: Story 1 · **위치**: 같은 파일 "lets one user’s charge and card donation…" · **Priority**: High

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | 구매자가 충전 주문 2개, 카드 후원 주문 1개를 만든다 | 201 |
| 2 | 세 확정을 동시에 보낸다(Toss 100 ms) | 모두 200, Toss 동시 호출 최대 1 |

#### S3: 같은 주문 동시 확정은 Toss를 한 번만 부르고 한 번만 적립한다
**Tests**: Story 1 (회귀) · **위치**: `lime.e2e.spec.ts` "credits five concurrent confirms of one order once", `donations.e2e.spec.ts`의 동시 확정 · **Priority**: Critical

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | 같은 주문 확정 5개를 동시에 보낸다(Toss 300 ms) | 모두 200, 같은 본문 |
| 2 | 잔액·원장을 본다 | 한 번만 적립, Toss 호출 1회 |

#### S4: 여러 사용자의 확정은 동시에 3개까지만 Toss를 기다리고, 모두 끝난다
**Tests**: Story 2 · **위치**: 같은 파일 "caps how many users wait for Toss…" · **Priority**: Critical

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | 사용자 6명이 각자 충전 주문을 만든다 | 201 |
| 2 | 여섯 확정을 동시에 보낸다(Toss 200 ms) | 모두 200(거절 없음), Toss 동시 호출 최대 정확히 3 |

#### S5: 실패한 확정 뒤에도 gate 자리가 돌아온다
**Tests**: Story 1·2 · **위치**: `apps/api/test/confirm-gate.spec.ts` · **Priority**: Critical

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | 상한 1인 gate에서 사용자 u1의 작업이 reject된다 | 호출자에게 같은 오류 |
| 2 | 뒤에 줄 선 u1, u2 작업 | 이어서 돈다 |
| 3 | 동기 throw로 끝난 작업 뒤 새 작업 | 바로 돈다 |
| 4 | 같은 사용자 작업 3개 | 도착 순서대로 하나씩 |

#### S6: 확정 요청은 사용자당 1분 20회, 넘으면 429이고 Toss를 부르지 않는다
**Tests**: Story 3 · **위치**: 같은 e2e 파일 "%s confirm rate limit"(라임 충전, 카드 후원) · **Priority**: High

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | 사용자 A가 같은 IP에서 없는 주문 확정을 20번 보낸다 | 매번 404 |
| 2 | A가 실제 주문을 확정한다 | 429, Toss 호출 0 |
| 3 | 같은 IP의 사용자 B가 자기 주문을 확정한다 | 200(제한은 사용자 기준) |

#### S7: pool은 크기와 연결 대기 시간 제한을 갖는다
**Tests**: Story 4 · **위치**: 같은 파일 "bounds the pool…" · **Priority**: Medium

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | 앱의 `PG_POOL` 옵션을 읽는다 | `max` 10, `connectionTimeoutMillis` 5000 |

로그아웃한 호출자가 확정 라우트에서 401을 먼저 받는 것은 `authorization-matrix.e2e.spec.ts`가 지킨다.

### 사람 확인 (머지 뒤 운영)

#### H1: 라임 충전을 Toss 테스트 결제로 끝까지 한다
**Tests**: Story 1·2 회귀 · **Priority**: Critical

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | 로그인 → 라임 충전 1,000 → Toss 결제창에서 테스트 결제를 끝낸다(PIN은 사람이 입력) | 성공 화면, 잔액 +1,000 |
| 2 | 성공 화면을 새로고침한다 | 같은 결과, 잔액 그대로 |

#### H2: 카드 후원을 Toss 테스트 결제로 끝까지 한다
**Tests**: Story 1·2 회귀 · **Priority**: Critical

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | LIVE 방송에서 "카드로 후원" → 테스트 결제를 끝낸다 | 성공 화면, 채팅에 후원 줄 |
| 2 | 성공 화면을 새로고침한다 | 같은 결과, 후원 하나 |

### Coverage Matrix
| 요구 | 정상 | 동시성·경계 | 오류 | 비고 |
|------|------|------------|------|------|
| Story 1 사용자별 직렬화 | S2, H1, H2 | S1, S3 | S5 | |
| Story 2 전체 동시 상한 | S4 | S4 | S5 | 상한은 프로세스 하나 기준 |
| Story 3 요청 제한 | S6 | S6(같은 IP) | S6 | 401 우선은 인가 매트릭스 |
| Story 4 pool 제한 | S7 | | | 실제 연결 timeout 발생은 재현하지 않음 |

### Test Data Requirements
- 자기 DB `lsp_i<번호>`(마이그레이션 적용). 공유 `lsp`·`lsp_test`는 쓰지 않는다.
- 사람 확인: 운영 테스트 계정, Toss 테스트 결제 수단, LIVE 방송 하나.
