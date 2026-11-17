## Test Scenarios: 채팅 도배 방지 (#213)

**Source**: #213 수락 기준 댓글, [`PRD-chat-flood.md`](./PRD-chat-flood.md)
**Total scenarios**: 8
**Coverage**: 정상 흐름, 경계, 오류, 보안(한도 우회), 큰 데이터

자동 테스트가 있는 시나리오는 "자동" 칸에 적었다. 실기기에서는 아래 "기기별 체크리스트"만 확인한다.

### Scenario 1: 한도 안의 채팅은 그대로 보낸다
**Tests**: 채팅 한도(10초 10개)
**Preconditions**: 로그인, READY 또는 LIVE 방송
**User role**: 시청자

| Step | Action | Expected Result |
|---|---|---|
| 1 | 채팅 3개를 몇 초 간격으로 보낸다 | 모두 바로 목록 맨 아래에 보인다 |

**Priority**: Critical
**자동**: `chat.e2e.spec.ts` "accepts a message while the broadcast is …"

---

### Scenario 2: 창 안 11번째 채팅은 429와 안내 문구
**Tests**: 수락 기준 1, 6
**Preconditions**: 로그인, READY 또는 LIVE 방송

| Step | Action | Expected Result |
|---|---|---|
| 1 | 10초 안에 채팅 10개를 보낸다 | 10개 모두 보인다 |
| 2 | 바로 11번째를 보낸다 | 입력창 아래 "채팅을 너무 빠르게 보내고 있습니다. 잠시 후 다시 보내 주세요." 입력한 글은 남는다 |
| 3 | 10초 기다렸다가 다시 보낸다 | 보내진다 |

**Priority**: Critical
**자동**: `chat.e2e.spec.ts` "answers 429 once one account exceeds the chat limit…", `broadcast-pages.test.tsx` "says the viewer is sending too fast on 429…". 로컬 실서버(2026-11-17): 10×201 뒤 429, 화면 문구 확인

---

### Scenario 3: 한 계정의 한도는 다른 계정에 번지지 않는다
**Tests**: 수락 기준 1 (보안: userId 기준)
**Preconditions**: 같은 Wi-Fi의 두 기기에 서로 다른 계정

| Step | Action | Expected Result |
|---|---|---|
| 1 | 기기 A가 한도에 걸린다(Scenario 2) | A는 429 문구 |
| 2 | 바로 기기 B가 보낸다 | B는 보내진다 |

**Priority**: High
**자동**: 같은 e2e의 "without slowing another account"

---

### Scenario 4: 비로그인 전송은 한도를 쓰지 않고 401
**Tests**: 가드 순서

| Step | Action | Expected Result |
|---|---|---|
| 1 | 세션 없이 `POST /api/broadcasts/:id/chat` | 401 |

**Priority**: Medium
**자동**: `chat.e2e.spec.ts` "answers 401 to an anonymous sender"

---

### Scenario 5: 댓글 한도(60초 5개)
**Tests**: 수락 기준 2, 6
**Preconditions**: 로그인, 방송 종료된 방송의 "댓글" 탭

| Step | Action | Expected Result |
|---|---|---|
| 1 | 1분 안에 댓글 5개를 등록한다 | 모두 보인다 |
| 2 | 6번째를 등록한다 | "댓글을 너무 빠르게 남기고 있습니다. 잠시 후 다시 남겨 주세요." 입력한 글은 남는다 |

**Priority**: High
**자동**: `comments.e2e.spec.ts` "answers 429 once one account exceeds the comment limit…", `broadcast-pages.test.tsx` "says the viewer is commenting too fast on 429…"

---

### Scenario 6: 새 시청자는 최근 채팅만 받는다
**Tests**: 수락 기준 3, 4 (큰 데이터)
**Preconditions**: 채팅 300개 이상 쌓인 READY·LIVE 방송

| Step | Action | Expected Result |
|---|---|---|
| 1 | 시청 화면을 새로 연다 | 네트워크의 첫 채팅 요청은 `?latest=true` 하나, 화면 목록은 최근 50줄 |
| 2 | 1초 뒤 | `?after=<마지막 id>` 폴링이 이어진다 |
| 3 | 새 채팅이 계속 와서 200줄을 넘는다 | 목록은 최근 200줄만 남고 가장 오래된 줄부터 빠진다 |

**Priority**: Critical
**자동**: `chat.e2e.spec.ts` "answers latest=true with only the most recent messages…", `use-chat-feed.test.tsx`, `chat.test.ts` "keeps only the newest messages…", `broadcast-pages.test.tsx` "reads the next page at once when a chat page after the cursor comes back full". 로컬 실서버(2026-11-17): 310개 방송에서 첫 화면 50줄

---

### Scenario 7: 잘못된 조회 파라미터는 400
**Tests**: 수락 기준 3 (오류)

| Step | Action | Expected Result |
|---|---|---|
| 1 | `?latest=true&after=<uuid>` | 400 |
| 2 | `?latest=yes` | 400 |

**Priority**: Low
**자동**: `chat.e2e.spec.ts` "rejects latest with after / latest other than true"

---

### Scenario 8: 다시보기 채팅은 재생 위치를 따라 이어 받는다
**Tests**: 수락 기준 5 (#92 동기화 회귀)
**Preconditions**: 채팅 200개 넘는, 녹화가 있는 방송 종료 방송

| Step | Action | Expected Result |
|---|---|---|
| 1 | "채팅 기록" 탭을 연다(재생 전) | 처음 200개까지 보이고 아래 "채팅 더 보기". 다음 페이지 요청은 없다 |
| 2 | 재생한다 | 재생 위치까지 오간 채팅만 보이고 "채팅 더 보기"는 사라진다 |
| 3 | 받은 마지막 채팅을 지나 탐색한다 | 다음 페이지를 한 번 받고, 그 장면까지의 채팅이 ±3초 안에 나타난다 |
| 4 | 앞으로 되돌려 탐색한다 | 다시 받지 않고 바로 다시 거른다 |

**Priority**: Critical
**자동**: `broadcast-pages.test.tsx` "reads the next chat log page only when the replay reaches the end…", 기존 "shows the chat log up to where the replay is…", `use-chat-feed.test.tsx` `useChatHistory`

---

### Coverage Matrix
| Requirement | Happy Path | Edge Cases | Error Handling | Notes |
|---|---|---|---|---|
| 채팅 한도 | S1 | S2, S3 | S2, S4 | 저장소는 프로세스 메모리 |
| 댓글 한도 | S5 | S5 | S5 | |
| 최근 페이지 첫 로드 | S6 | S6(빈 채팅) | S7 | |
| 실시간 보관 상한 | S6 | S6 | | |
| 다시보기 이어 받기 | S8 | S8(탐색) | | 시작 시각 없는 녹화는 "채팅 더 보기" |

### 기기별 체크리스트

| 시나리오 | Windows PC | Android | MacBook | iPhone |
|---|---|---|---|---|
| S2 채팅 429 문구와 초안 유지 | [ ] | [ ] | [ ] | [ ] |
| S3 두 계정 한도 분리 | [ ] (A) | [ ] (B) | | |
| S5 댓글 429 문구 | [ ] | | [ ] | |
| S6 첫 화면 최근 50줄 | [ ] | [ ] | [ ] | [ ] |
| S8 다시보기 채팅 동기화 | [ ] | [ ] | [ ] | [ ] |

### Test Data Requirements
- 채팅 300개 이상인 READY·LIVE 방송: `ChatMessage`에 직접 넣는다(로그인 API로는 한도 때문에 느리다).
- 채팅 200개 넘고 녹화 파트 시작 시각이 있는 방송 종료 방송.
- 서로 다른 테스트 계정 둘.
