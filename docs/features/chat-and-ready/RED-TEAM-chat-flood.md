# Red-Team: 채팅 도배 방지 (#213)

대상: [`DISCOVERY-chat-flood.md`](./DISCOVERY-chat-flood.md)의 선택안. 채팅 10개/10초·댓글 5개/60초(세션 userId 기준 throttle), `GET ?latest=true` 최근 50개, 실시간 보관 상한 200, 다시보기는 재생 위치를 따라 이어 받고 그리는 줄 200개 상한, 429 문구.

실사용자 데이터 없음. 근거는 감사 재현, 코드, 배포 구성(`deploy/compose.yaml`, `deploy/api.Dockerfile`)이다.

## Top Kill-Assumptions (ranked)

- **Claim:** 다시보기를 재생 위치 따라 이어 받아도 동기화가 깨지지 않는다.
  - **Fails if:** 받은 메시지가 재생 위치보다 앞에서 끝났는데 다음 페이지를 받지 않는다(탐색으로 앞으로 크게 건너뛴 경우). 또는 요청이 겹쳐 같은 페이지를 두 번 받는다.
  - **Evidence to get this week:** 훅 테스트로 "마지막 받은 메시지가 재생 위치에 닿으면 다음 페이지 요청, 닿지 않으면 요청 없음, 요청 중에는 겹치지 않음"을 확인한다.
  - **Kill criterion:** 테스트로 고정할 수 없으면 다시보기는 기존처럼 전체를 받고 그리는 줄 상한만 둔다.
  - **Cheapest test:** `use-chat-feed.test.tsx`에 fetch 모의로 3개 사례.

- **Claim:** 정상 시청자는 10초에 10개 넘게 보내지 않는다.
  - **Fails if:** 심사위원들이 공용 테스트 계정 하나로 동시에 채팅한다. userId가 같아 한도를 나눠 쓴다.
  - **Evidence to get this week:** 테스트 계정은 여러 개이고 심사 절차에서 한 계정으로 몇 개를 보내는지 README 절차로 센다.
  - **Kill criterion:** README 절차가 10초 안에 10개를 넘게 보내면 상한을 올린다.
  - **Cheapest test:** README 심사 절차 읽기. 상한은 상수 한 곳(`CHAT_RATE_LIMIT`)이라 바꾸기 싸다.

- **Claim:** 첫 로드를 최근 50개로 바꿔도 실시간 화면의 순서·중복 규칙이 그대로다.
  - **Fails if:** 최근 페이지가 비어 cursor가 없을 때 다음 폴링이 처음부터 읽거나, 최근 50개 뒤에 "꽉 찬 페이지"로 보고 바로 다시 읽어 루프가 돈다.
  - **Evidence to get this week:** cursor가 없으면 항상 `latest`로 묻고, 즉시 이어 읽기는 `after` 페이지가 꽉 찼을 때만 한다는 훅 테스트.
  - **Kill criterion:** 테스트 실패.
  - **Cheapest test:** 훅 테스트 2개.

- **Claim:** 메모리 저장소 throttler로 충분하다.
  - **Fails if:** API가 여러 프로세스로 돌거나 재시작이 잦다.
  - **Evidence:** `deploy/compose.yaml`은 API 컨테이너 1개, `node dist/main.js` 한 프로세스다. 재시작하면 창이 비지만 창이 10초라 영향이 없다.
  - **Kill criterion:** 다중 인스턴스로 바뀌면 공유 저장소가 필요하다. 지금은 해당 없음.

## What's Well-Reasoned

- userId 기준 추적: 채팅·댓글은 로그인이 필요하므로 IP보다 정확하다. 한 와이파이를 쓰는 심사위원을 같이 막지 않는다. `LoggedInGuard`가 먼저 돌아 비로그인 요청은 401로 끝나고 한도를 쓰지 않는다.
- 기존 패턴과 같다: 로그인·회원가입·검색이 이미 `ThrottlerGuard` + `@Throttle` 상수를 쓰고, e2e가 상수 값으로 N+1번째 429를 확인한다.
- DB 변경이 없다. 되돌리기 쉽다.
- 다른 계정을 여러 개 만드는 우회는 회원가입 한도(IP당 20개/시간)가 이미 묶는다.

## What I Couldn't Assess

- 실제 심사 환경의 채팅 속도. 상한은 Twitch 일반 채팅(30초 20개)보다 느슨한 값으로 잡았다.
- 아주 긴 다시보기에서 끝으로 바로 건너뛸 때 이어 받는 시간. 페이지 200개씩이라 2000개면 10번 요청이다(이전과 같은 양이지만 그때만 받는다).
