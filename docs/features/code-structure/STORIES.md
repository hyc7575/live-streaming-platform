## Backlog: 코드 구조 개선

**Format**: User Stories
**출처**: 2026-11-16 아키텍처 재검증(main 40f9ebc, 지난 리뷰 6e6da05 이후 72커밋). web·api를 나눠 읽고 핵심 주장(폴링 드롭, `endedAt` 시계, 확정 중복, 시딩 수)은 코드로 다시 확인했다.
**Total stories**: 7
**Estimated total effort**: 약 30시간 (S≈2h, M≈4h, L≈8h). 11/19 마감 전에 다 들어가지 않을 수 있다. 아래 Story Map의 자르는 선을 따른다.

실사용자 데이터 없음. 근거는 공모 원문 4절 평가 기준("코드 품질 및 안정성: 코드 구조, 예외 처리, 방송 상태 관리"), 현재 코드, 기존 테스트다. 모든 스토리는 동작을 바꾸지 않는 리팩터링이다. S1만 사용자에게 보이는 버그를 고친다.

용어: module(interface와 implementation을 가진 모든 것), interface(호출자가 알아야 하는 모든 것: 불변식, 순서, 오류 방식), seam(그 자리를 고치지 않고 동작을 바꿀 수 있는 곳), adapter(seam에서 interface를 채우는 구현). 깊은 module은 작은 interface 뒤에 많은 동작을 숨긴다.

### Stories

#### S1: 내 작업 직후 화면이 바로 바뀐다
**시청자로서, 댓글을 쓰거나 후원한 직후, 또 스트리머가 방송을 끝낸 직후에 화면이 바로 바뀌기를 원한다. 그래야 내 작업이 됐는지 몇 초~30초 동안 헷갈리지 않는다.**

지금은 주기 요청이 진행 중일 때 들어온 `reload()`·`recheck()`를 `if (inFlight) return`으로 버린다(`apps/web/src/use-api.ts:56`, `pages/BroadcastPage.tsx:92`). 진행 중이던 요청은 작업 전 상태를 돌려준다. 영향받는 곳: 댓글 등록 직후(`CommentPanel`), 후원 직후 라임 잔액(`LimeDonationForm`, 주기 30초), 방송 종료 직후(`OwnerActions` → `recheck`), 송출 상태가 바뀐 직후(`PublishPage`), 후원 패널.

Acceptance Criteria:
- [ ] 주기 요청이 진행 중일 때 `reload()`를 부르면 새 요청이 나가고, 그 응답이 화면에 남는다
- [ ] 작업 전에 시작한 주기 요청의 응답이 늦게 와도 화면을 되돌리지 않는다(가장 최근에 시작한 요청만 반영)
- [ ] 응답이 주기보다 느려도 주기 요청은 겹쳐 쌓이지 않고, 응답이 화면에 반영된다
- [ ] 단위 테스트(가짜 타이머)가 위 세 경우를 확인한다

Priority: P0 | Effort: S | Dependencies: none | 이슈 #195

---

#### S2: 폴링 읽기가 한 module에 있다
**코드를 읽는 심사위원·유지보수자로서, 주기적으로 다시 읽는 규칙(주기, 취소, 응답 묶기, 실패 시 마지막 값 유지, 멈춤)을 한 파일에서 읽고 싶다. 그래야 화면마다 규칙이 갈라지지 않고, 고칠 때 한 곳만 고친다.**

지금 같은 루프가 세 벌이다: `usePolledApi`(`use-api.ts`), `useWatchedBroadcast`(`BroadcastPage.tsx`), `FollowsProvider`. `FollowsProvider`만 S1의 문제를 피한다. 채팅 커서 폴링(`use-chat-feed.ts`, ADR-0002)은 응답을 이어 붙이는 다른 모양이고 겹치는 요청이 없으므로 범위 밖이다.

Acceptance Criteria:
- [ ] 폴링 루프는 `use-api.ts`의 `usePolledApi` 한 곳에만 있다. `useWatchedBroadcast`와 `FollowsProvider`는 그것을 쓴다
- [ ] 호출자가 종결 오류(방송 404는 마지막 응답을 덮어쓴다), 멈춤 조건(404 또는 더 기다릴 다시보기가 없는 ENDED), 응답을 묶는 키(다른 사람으로 로그인)를 줄 수 있다
- [ ] `reload()`는 그 요청의 응답이 반영된 뒤에 끝난다(팔로우 직후 목록을 기다리는 `setFollowing`이 쓴다)
- [ ] 기존 web 테스트가 모두 통과한다. 버리는 동작에 기대는 테스트 주석은 고친다

Priority: P1 | Effort: M | Dependencies: S1과 같은 PR | 이슈 #195

---

#### S3: 방송 상태 전이가 한 module에 있다
**코드를 읽는 심사위원으로서, 방송이 READY → LIVE → ENDED로 바뀌는 모든 규칙(언제, 무엇이 바뀌고, 미디어 서버에 무엇을 시키는지)을 한 파일에서 읽고 싶다. 평가 기준 "방송 상태 관리"를 그 파일 하나로 확인할 수 있다.**

지금 `status`·`startedAt`·`endedAt`·`disconnectedAt`를 쓰는 곳이 세 파일 일곱 군데다(`publish/publish.service.ts:113-158`, `broadcasts/broadcasts.service.ts:367-386`, `publish/publish-sweeper.ts:66-102`). "녹화 중지 실패는 로그만 남긴다"가 세 번 있다.

Acceptance Criteria:
- [ ] 네 컬럼을 쓰는 운영 코드가 한 module 안에만 있다. `PublishService`는 송출 토큰과 webhook 번역, `BroadcastsService`는 CRUD·조회, sweeper는 "때가 되면 부른다"만 남는다
- [ ] 각 전이의 OME 부수효과(녹화 시작·중지, 송출 강제 종료)와 그 실패 처리가 같은 module에 있고, "녹화 중지 실패는 로그만"은 한 곳이다
- [ ] `prisma/schema.prisma`의 상태 주석이 실제와 맞는다
- [ ] HTTP 응답, 인가 매트릭스, 송출 허가 거절 사유 문자열이 바뀌지 않는다. `publish`·`reconnect-grace`·`broadcasts`·`recordings`·`authorization-matrix` e2e가 그대로 통과한다
- [ ] 새 module 이름이 GLOSSARY에 없는 개념이면 GLOSSARY에 더한다

Priority: P0 | Effort: L | Dependencies: none | 이슈 #196

---

#### S4: 방송 종료 시각이 하나의 시계에서 온다
**유지보수자로서, 같은 `endedAt` 컬럼을 어느 경로로 끝나든 같은 시계로 쓰고 싶다. 그래야 테스트가 종료 시각을 정확히 확인하고, 녹화 정리 순서(`endedAt` 기준)가 두 시계에 흔들리지 않는다.**

지금 유예 초과 종료는 주입된 CLOCK, 스트리머 종료는 `new Date()`다(`broadcasts.service.ts:369`). 같은 파일의 `:232`, `:422`는 이미 주입된 CLOCK을 쓴다.

Acceptance Criteria:
- [ ] 모든 상태 전이 시각은 주입된 CLOCK에서 온다
- [ ] `test/broadcasts.e2e.spec.ts`의 종료 시각 단언이 `toBeInstanceOf(Date)`가 아니라 가짜 시계의 정확한 값을 본다
- [ ] 테스트의 가짜 시계와 운영 코드가 같은 CLOCK을 쓴다(여러 module이 따로 제공하지 않는다)

Priority: P0 | Effort: S | Dependencies: S3과 같은 PR | 이슈 #196

---

#### S5: Toss 주문 확정이 한 module에 있다
**유지보수자로서, 카드 후원과 라임 충전의 결제 확정 규칙(잠금, 같은 요청 재처리, 결제 키 재사용 거절, Toss 오류 매핑)을 한 곳에서 고치고 싶다. 그래야 돈이 지나는 경로의 경합 규칙이 두 벌로 갈라지지 않는다.**

지금 사전 검사·주문 행 잠금·이미 확정 처리·P2002 매핑이 두 벌이다(`donations/donations.service.ts:296-392`, `lime/lime.service.ts:151-239`). 상수·문구·`hasPrismaCode`가 복사본이고, Toss가 거절했을 때 라임만 주문을 FAILED로 표시한다(`lime.service.ts:226-233`). Toss 호출과 오류 매핑은 이미 `donations/toss-approval.ts` 한 곳이다.

**사전 부검 판정(11/16): 제출 전 No-Go 권고.** 카드 경로의 잠금 순서(방송 행 먼저)를 지키는 테스트가 없고, 공유 몫이 약 30줄에 호출자 콜백 넷이라 얕은 module이 되기 쉽다. 자세한 근거와 대안은 [PRE-MORTEM-payment-confirm](./PRE-MORTEM-payment-confirm.md).

Acceptance Criteria:
- [ ] 잠금, 같은 요청 재처리, 결제 키 재사용 거절, Toss 호출과 오류 매핑이 한 module에 있다
- [ ] 카드 후원과 라임 충전은 승인 뒤 할 일만 넘긴다(카드: 방송 행 잠금·삭제 확인·채팅 후원 줄. 라임: 적립과 원장)
- [ ] Toss 거절 시 처리의 차이(라임 FAILED, 카드 그대로)는 유지한다
- [ ] HTTP 상태 코드와 문구가 바뀌지 않는다. `donations`·`lime`·`authorization-matrix` e2e가 그대로 통과한다
- [ ] 재요청·결제 키 재사용 시나리오를 공유 module 수준에서 한 번 확인한다

Priority: P1 | Effort: M | Dependencies: S3 뒤(둘 다 `apps/api`, e2e를 전부 돌린다) | 사전 부검: [PRE-MORTEM-payment-confirm](./PRE-MORTEM-payment-confirm.md)

---

#### S6: 송출 화면의 "누가 송출 중인가" 판정이 한 곳에 있다
**유지보수자로서, 이 탭·OBS·다른 탭 중 누가 송출 중인지와 그에 따른 화면 결정(종료 화면 종류, 종료 버튼, 시작 막기, OBS 안내)을 렌더 없이 확인하고 싶다. 그래야 상태 조합 하나를 보려고 1487줄 화면 테스트를 띄우지 않는다.**

지금 판정이 렌더 중 래치 두 개(`onAir`, `obsMayPublish`)와 조건 여러 개에 흩어져 있다(`apps/web/src/pages/PublishPage.tsx:126-179`, `:295-309`).

Acceptance Criteria:
- [ ] 입력(브라우저 송출 세션 상태, 폴링한 방송의 `status`·`disconnectedAt`, OBS 주소 발급 여부)에서 화면 결정을 내는 판정이 한 module에 있다
- [ ] 판정을 표 형태의 단위 테스트로 확인한다(렌더 없음)
- [ ] 렌더 중 `setState` 래치가 없어지거나, 남으면 그 이유를 주석으로 적는다
- [ ] 캡처 쪽 규칙(카메라 전환 순서, `resumeAudio`)은 건드리지 않는다
- [ ] `PublishPage.test.tsx`와 송출 e2e가 그대로 통과한다

Priority: P2 | Effort: M | Dependencies: S1(송출 화면이 `usePolledApi`를 쓴다)

---

#### S7: 결제 완료 알림이 한 module에 있다
**유지보수자로서, 결제 성공 화면이 시청 탭에 "반영됨"을 알리는 경로(새 탭은 BroadcastChannel, 모달 iframe은 postMessage)를 한 곳에서 다루고 싶다. 그래야 같은 완료가 두 번 가지 않고, 성공 화면 두 벌이 갈라지지 않는다.**

지금 `DonationSuccessPage.tsx:66-130`과 `LimeChargeSuccessPage.tsx:53-112`가 줄 단위로 같고, 둘 다 두 경로로 모두 알린다. 모달 안에서 결제하면 받는 쪽이 같은 완료를 두 번 받는다. S1 전에는 두 번째 reload가 버려져 드러나지 않았고, S1 뒤에는 두 번 읽는다(해롭지는 않다).

Acceptance Criteria:
- [ ] 확정 요청을 한 번만 보내고(StrictMode 포함), 새 탭·모달 iframe 중 지금 경로 하나로만 알린다
- [ ] 받는 쪽(후원 패널, 라임 후원 칸, 라임 내역)은 경로와 관계없이 "후원 반영됨"·"충전 반영됨"을 한 번만 받는다
- [ ] 화면 문구와 버튼은 `apps/web/CLAUDE.md`의 후원 완료·라임 충전 완료 행과 같다
- [ ] 알림 경로를 module 단위 테스트로 확인한다. `donations.test`·`lime-charge.test`가 그대로 통과한다
- [ ] 모달 안 결제(PC Chrome)와 새 탭 결제(좁은 화면)를 Toss 테스트 결제로 한 번씩 확인한다

Priority: P2 | Effort: M | Dependencies: S1

**결정(11/16, #204)**: 모달 안에서 충전하면 다른 탭의 라임 내역(`/me`)에는 탭 간 알림이 가지 않고 30초 폴링으로 반영된다. 모달 안에서 후원해도 같은 방송을 연 다른 시청 탭에는 탭 간 알림이 가지 않고 5초 폴링으로 반영된다. 경로마다 한 번만 알리는 규칙을 지키고, 여러 탭을 함께 열어 둔 드문 경우의 지연은 받아들인다.

---

### Story Map

```
반드시 (11/17)     S1 화면 바로 반영 ─ S2 폴링 한 곳      (#195, 같은 PR)
                   S3 상태 전이 한 곳 ─ S4 시계 하나     (#196, 같은 PR)
─────────────── 자르는 선: 11/18 오전에 S1~S4가 머지되지 않았으면 아래는 제출 뒤 ───────────────
하면 좋음 (11/18)  S6 송출 주체 판정
                   S7 결제 완료 알림
제출 뒤            S5 Toss 확정 한 곳(사전 부검 No-Go: 잠금 순서 테스트 먼저)
하지 않음          테스트 준비 코드 공용화(web 가짜 API 14벌, api 방송 시딩 27곳). 심사위원 눈에 덜 보이고 제품 코드가 안 바뀐다
                   OME webhook wire 형식 이동(ADR-0001로 이득이 작다)
```

### Technical Notes

- **가짜 시계 빈틈(S1 작업 중 발견)**: `apps/web/src/testing/fakeClock.ts`가 `setInterval`·`setTimeout`만 가짜로 바꾸고 `clear*`는 진짜를 써서, 정리한 폴링이 테스트에서 계속 돌았다. `clear*`도 가짜로 바꾸면 기존 web 테스트 482개가 그대로 통과한다.
- **`reload()`가 promise를 돌려준다(S2)**: 결과를 버리는 호출 지점은 `void reload()`로 쓴다(`no-floating-promises`). prop으로 넘길 때는 `() => void reload()`.
- **API 테스트 DB**: vitest가 `DATABASE_URL`의 DB를 비운다. 세션마다 자기 DB(`lsp_<이름>`)를 쓴다(`docs/DEVELOPMENT.md`).
- **ADR 충돌 없음**: ADR-0002(채팅 커서 폴링)는 S1·S2 범위 밖, ADR-0001(OME)·ADR-0003(후원이 방송보다 오래 삶)은 S3·S5가 지킨다.

### Open Questions

- 라임 후원과 카드 확정은 guard를 통과한 뒤 트랜잭션 안에서 방송이 아직 LIVE인지 다시 보지 않는다. 그 사이 방송이 끝나면 ENDED 방송에 PAID 후원이 남는다. 의도인가? (S5 범위 밖. 답에 따라 별도 이슈)
- 502로 끝난 카드 확정을 재시도하기 전에 방송이 지워지면 Toss가 받은 돈이 기록되지 않는다(`donations.service.ts` 주석 "알려진 빈틈"). S5로 고쳐지지 않는다. 별도 이슈로 둘지 정한다.
- S5를 제출 뒤로 미룰지, "상수·문구·`hasPrismaCode`만 한 곳으로"로 줄여 지금 할지 정한다.
- S6·S7을 마감 전에 할지는 11/18 오전 진행을 보고 정한다.

### 결과 (11/16 리뷰 뒤)

PR마다 Standards(저장소 규칙)·Spec(수락 기준) 두 축으로 다시 검증했다. 규칙 위반(hard)과 스펙 결함은 없었다. 리뷰가 찾은 문서 누락과 테스트 빈칸은 각 PR에 채웠다. 구조를 다시 바꾸는 판단 항목은 아래처럼 제출 뒤로 미룬다.

| 스토리 | PR | 남긴 것(제출 뒤 판단) | 머지 전 사람이 할 확인 |
|---|---|---|---|
| S1, S2 | #201 | `reload()`가 promise라 결과를 버리는 곳마다 `void`가 붙는다(await는 `FollowsProvider` 하나). 팔로우 목록도 진행 중 요청이 있으면 주기 요청을 건너뛴다 | 없음 |
| S3, S4 | #202 | `end(id, read)`가 호출자에게 순서를 알게 하는 콜백을 받는다(리팩터링 전 응답 순서를 지키려고). 녹화 정리가 lifecycle과 OME를 둘 다 쓴다. lifecycle 결과 문자열이 송출 허가 거절 사유와 같다 | 없음 |
| S6 | #203 | 판정 module 밖에 `session.state.kind` 분기(송출 중, 이탈 확인, 시작 막기)가 남았다. "다른 쪽 송출을 본 적"은 렌더 중 갱신 하나로 남았다(이벤트가 없어서, 주석에 이유) | OBS로 송출한 뒤 송출 화면의 종료 화면과 OBS 멈춤 안내 |
| S7 | #204 | `'charge' \| 'donation'` 분기와 결제 메시지 모양 세 벌, 성공 화면의 화면 틀 두 벌 | 모달 안 결제(PC Chrome)와 새 탭 결제(360px)를 Toss 테스트 결제로 한 번씩 |

### 이슈

| 스토리 | 이슈 |
|---|---|
| S1, S2 | #195 |
| S3, S4 | #196 |
| S5 | #197 (제출 뒤) |
| S6 | #198 |
| S7 | #199 |
