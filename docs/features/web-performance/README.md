# web 성능 개선

사용자 기능이 아니라 `apps/web`의 첫 로드 크기와 렌더·요청 횟수를 줄이는 작업을 모은다. 화면 동작은 바꾸지 않는다. 공모 원문 4절 평가 기준 "코드 품질 및 안정성"을 겨냥한다.

출발점은 2026-11-17 Vercel `react-best-practices`(vercel-labs/agent-skills) 규칙 검토(main 158aaaf)다.

## 요구사항

- [STORIES](./STORIES.md): 스토리 S1~S7, 수락 기준, 자르는 선

크기 판정(`docs/agents/pm-skills.md`): 모두 API·DB를 바꾸지 않고 방향이 정해진 작업이라 스토리로 수락 기준을 만들었다.

## 이슈와 PR

| 스토리 | 내용 | 이슈 | PR |
|---|---|---|---|
| S1 | 경로별 코드 분할 | #226 | #236 |
| S2, S3 | 실시간 채팅·다시보기 재생 위치 재렌더 | #227 | #235 |
| S4, S5 | 라이브 컨트롤 재렌더, 화면 너비 구독 | #228 | #233 |
| S6 | 같은 폴링 응답 유지 | #229 | #232 |
| S7 | 화면을 열 때 중복 GET | #230 | #234 |

## 코드 위치

- 경로: `apps/web/src/AppRoutes.tsx`, `apps/web/src/main.tsx`
- 채팅: `apps/web/src/use-chat-feed.ts`, `apps/web/src/components/ChatPanel.tsx`
- 다시보기: `apps/web/src/components/ReplayPlayer.tsx`, `apps/web/src/pages/BroadcastPage.tsx`
- 플레이어 컨트롤: `apps/web/src/components/player/`
- 폴링: `apps/web/src/use-api.ts`

## 결과

- 첫 로드 JS: 1,072.84KB(gzip 331.74KB) → 홈 진입 청크 301.81KB(gzip 92.40KB). hls.js는 시청 화면 청크(617KB), OvenLiveKit은 송출 화면 청크로 갔다(2026-11-17 main 빌드).
- 송출 화면을 열 때 같은 방송 GET이 3번에서 2번으로 줄었다. 남은 1번은 바깥 `useApi`와 `usePolledApi` 첫 읽기가 겹친 것이다. 고치려면 `use-api.ts` 구조를 바꿔야 해서 남겨 두었다.

## 확인 방법

- `pnpm --filter @lsp/web test`, `pnpm --filter @lsp/web build`
- 루트: `pnpm typecheck`, `pnpm lint`
