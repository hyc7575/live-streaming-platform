## Backlog: web 성능 개선

**Format**: User Stories
**출처**: 2026-11-17 `apps/web`을 Vercel `react-best-practices`(vercel-labs/agent-skills) 규칙으로 검토한 결과(main 158aaaf). Vite SPA라 `server-*`와 Next.js 전용 규칙은 뺐다. S1은 `pnpm build` 결과로, S2·S3·S5는 코드를 직접 열어 확인했다. S4·S6·S7은 검토 에이전트의 보고이며 구현 전에 다시 확인한다.
**Total stories**: 7
**Estimated total effort**: 약 14시간 (S≈1h, M≈3h, L≈6h)

실사용자 데이터 없음. 근거는 공모 원문 4절 평가 기준("코드 품질 및 안정성"), 빌드 결과, 현재 코드다. 모든 스토리는 화면 동작을 바꾸지 않는다. 바뀌는 것은 첫 로드 크기와 렌더·요청 횟수뿐이다.

### Stories

#### S1: 홈 화면이 플레이어·송출 라이브러리 없이 열린다
**시청자로서, 홈이나 검색 화면을 열 때 영상 재생·송출 라이브러리까지 내려받지 않기를 원한다. 그래야 모바일 데이터에서도 첫 화면이 빨리 뜬다.**

지금 `pnpm build`가 JS 한 파일(1,071KB, gzip 331KB)을 만든다. `AppRoutes.tsx`가 모든 화면을 정적으로 import해서 hls.js(시청·다시보기에서만 씀, 약 520KB)와 OvenLiveKit(송출에서만 씀), Toss SDK(결제에서만 씀)가 홈 첫 로드에 들어간다. 규칙: bundle-dynamic-imports, bundle-conditional.

Acceptance Criteria:
- [ ] 시청(`BroadcastPage`), 송출(`PublishPage`), 결제(`DonatePage`·`LimeChargePage` 등) 화면은 경로별로 따로 내려받는다. hls.js·OvenLiveKit·Toss SDK는 홈 첫 로드 청크에 없다
- [ ] 빌드 결과에서 첫 로드 JS(gzip) 크기를 PR 본문에 전후로 적는다
- [ ] 화면을 내려받는 동안 빈 화면 대신 레이아웃(헤더·사이드)이 남는다
- [ ] 송출 중 이탈 확인(`useBlocker`)이 그대로 동작한다. `renderInDataRouter` 테스트와 `capture-e2e`가 통과한다
- [ ] 청크를 받지 못하면(배포 직후 옛 파일 등) 오류 화면이나 새로고침 안내가 나온다

Priority: P0 | Effort: M | Dependencies: none

---

#### S2: 긴 방송에서도 실시간 채팅이 매초 전부 다시 그려지지 않는다
**시청자로서, 몇 시간째 이어지는 방송에서도 채팅 창이 버벅이지 않기를 원한다.**

`use-chat-feed.ts:50-55`의 `update()`가 새 메시지가 없어도 1초마다 새 객체로 setState한다. 그래서 `ChatPanel`과 모든 `ChatLine`이 매초 다시 렌더되고, 줄마다 날짜 포맷을 다시 한다. 목록에 상한이 없어 방송이 길수록 무거워진다. 규칙: rerender-memo, js-cache-function-results.

Acceptance Criteria:
- [ ] 폴링 응답에 새 메시지가 없고 상태도 같으면 setState하지 않는다
- [ ] 새 메시지가 오면 새 줄만 렌더된다(기존 `ChatLine`은 다시 렌더되지 않는다)
- [ ] 단위 테스트가 빈 응답에서 렌더가 늘지 않음을 확인한다
- [ ] 채팅 표시·스크롤 고정(`use-stick-to-bottom`)이 그대로다

Priority: P0 | Effort: S | Dependencies: none

---

#### S3: 다시보기 재생 중 시청 화면 전체가 초당 4번 다시 그려지지 않는다
**다시보기 시청자로서, 재생 중 채팅 기록과 후원 패널이 버벅이지 않기를 원한다.**

`BroadcastPage.tsx:248`의 `onPlayhead`가 `timeupdate`(약 4Hz)마다 새 객체로 `setHeard`를 불러 `BroadcastView` 전체(후원 패널, 사이드 패널)가 다시 렌더된다. `ChatHistory`는 그때마다 모든 메시지에 `Date.parse`·배치 계산을 다시 한다(`ChatPanel.tsx:100-103`). 규칙: rerender-use-ref-transient-values, rerender-derived-state.

Acceptance Criteria:
- [ ] 재생 위치가 화면에 보이는 결과(초 단위, 파트)가 바뀔 때만 상태가 바뀐다
- [ ] 메시지의 시각·배치 계산은 메시지 목록이나 파트 시작점이 바뀔 때만 한다
- [ ] 다시보기 채팅이 재생 위치를 따라가는 동작(`replay-chat` 테스트)이 그대로다
- [ ] 탐색(seek) 직후 채팅 기록이 바로 그 위치로 맞춰진다

Priority: P0 | Effort: S | Dependencies: S2와 `ChatLine`을 같이 고친다(같은 PR 가능)

---

#### S4: 라이브 플레이어 컨트롤이 쓰지 않는 재생 시간 때문에 다시 그려지지 않는다
**라이브 시청자로서, 컨트롤 바가 필요 없이 다시 그려지지 않기를 원한다.**

`player/useMediaState.ts`의 snapshot에 `currentTime`이 들어 있어 라이브에서도 `timeupdate`마다 `PlayerControls`가 다시 렌더된다. 라이브는 시간을 보여 주지 않는다. 규칙: rerender-defer-reads.

Acceptance Criteria:
- [ ] 라이브 재생 중에는 `timeupdate`로 `PlayerControls`가 다시 렌더되지 않는다
- [ ] 다시보기의 시간 표시·탐색 막대는 그대로 움직인다
- [ ] 라이브 엣지 표시와 "라이브로" 버튼이 그대로다

Priority: P1 | Effort: S | Dependencies: none

---

#### S5: 화면 너비 감지가 렌더마다 다시 구독하지 않는다
**코드를 읽는 심사위원으로서, 전역 리스너가 렌더마다 붙었다 떨어지지 않기를 원한다.**

`use-wide-screen.ts:12-21`의 `useSyncExternalStore`에 inline `subscribe`를 넘겨, 렌더마다 `matchMedia` 구독을 풀고 다시 건다. 규칙: client-event-listeners.

Acceptance Criteria:
- [ ] 같은 query의 구독 함수는 렌더 사이에 같다(모듈 수준 캐시나 `useCallback`)
- [ ] `matchMedia`가 없는 환경(jsdom)에서 `fallback`을 돌려준다
- [ ] 화면 너비가 바뀌면 값이 바뀐다

Priority: P1 | Effort: S | Dependencies: none

---

#### S6: 폴링 응답이 그대로면 화면을 다시 그리지 않는다
**시청자로서, 아무것도 바뀌지 않았는데 댓글·후원 목록이 5초마다 다시 그려지지 않기를 원한다.**

`use-api.ts:145-150`이 응답이 같아도 새 객체로 setState한다. 규칙: rerender-derived-state.

Acceptance Criteria:
- [ ] 새 응답이 이전과 같으면 이전 `data` 객체를 그대로 둔다
- [ ] 응답이 바뀌면 바로 반영된다. `reload()`, `isTerminal`, `stopWhen`, `key` 동작(#195·#205)은 그대로다
- [ ] 단위 테스트가 같은 응답에서 참조가 유지됨을 확인한다

Priority: P2 | Effort: S | Dependencies: none

---

#### S7: 화면을 열 때 같은 GET을 두 번 보내지 않는다
**코드를 읽는 심사위원으로서, 화면 하나를 열 때 같은 요청이 겹쳐 나가지 않기를 원한다.**

`PublishPage.tsx:141-143`과 `StreamerPage.tsx:34-36`의 `useEffect(() => void reload(), [...])`가 마운트 때도 돌아, 첫 요청과 겹쳐 하나 더 나간다. 규칙: rerender-move-effect-to-event.

Acceptance Criteria:
- [ ] 화면을 열 때 같은 경로 GET은 한 번만 나간다
- [ ] 송출 상태가 바뀐 직후(PublishPage)와 팔로우 상태가 바뀐 직후(StreamerPage)에는 그대로 다시 읽는다
- [ ] 단위 테스트가 마운트 요청 횟수를 확인한다

Priority: P2 | Effort: S | Dependencies: S6과 같은 파일(`use-api.ts`)은 건드리지 않는다

---

### Story Map

```
꼭 (P0)    S1 코드 분할 · S2 실시간 채팅 · S3 다시보기 재생 위치
있으면 (P1) S4 라이브 컨트롤 · S5 화면 너비 구독
여유 (P2)  S6 같은 폴링 응답 · S7 중복 GET
```

마감(11-19)이 가까우면 P2는 제출 뒤로 미룬다.

### Technical Notes

- API·DB는 바뀌지 않는다. web만 바뀌어 CI는 `check`·`capture-e2e`만 돈다.
- S1은 `RouterProvider useTransitions={false}`와 `useBlocker`(#76)에 닿는다. `apps/web/CLAUDE.md` "라우팅" 절을 지킨다.
- 앱에 `memo`가 없고 React Compiler도 꺼져 있다. 이번에는 문제 있는 곳에만 `memo`를 쓰고 Compiler는 들이지 않는다.

### Open Questions

- S1 청크 로드 실패 화면 문구: 기존 오류 문구 규칙(`apps/web/CLAUDE.md` "문구")을 따른다.
