# web 성능 개선

사용자 기능이 아니라 `apps/web`의 첫 로드 크기와 렌더·요청 횟수를 줄이는 작업을 모은다. 화면 동작은 바꾸지 않는다. 공모 원문 4절 평가 기준 "코드 품질 및 안정성"을 겨냥한다.

출발점은 2026-11-17 Vercel `react-best-practices`(vercel-labs/agent-skills) 규칙 검토(main 158aaaf)다.

## 요구사항

- [STORIES](./STORIES.md): 스토리 S1~S7, 수락 기준, 자르는 선

크기 판정(`docs/agents/pm-skills.md`): 모두 API·DB를 바꾸지 않고 방향이 정해진 작업이라 스토리로 수락 기준을 만들었다.

## 이슈와 PR

| 스토리 | 내용 | 이슈 | PR |
|---|---|---|---|
| S1 | 경로별 코드 분할 | #226 | |
| S2, S3 | 실시간 채팅·다시보기 재생 위치 재렌더 | #227 | |
| S4, S5 | 라이브 컨트롤 재렌더, 화면 너비 구독 | #228 | |
| S6 | 같은 폴링 응답 유지 | #229 | |
| S7 | 화면을 열 때 중복 GET | #230 | |

## 코드 위치

- 경로: `apps/web/src/AppRoutes.tsx`, `apps/web/src/main.tsx`
- 채팅: `apps/web/src/use-chat-feed.ts`, `apps/web/src/components/ChatPanel.tsx`
- 다시보기: `apps/web/src/components/ReplayPlayer.tsx`, `apps/web/src/pages/BroadcastPage.tsx`
- 플레이어 컨트롤: `apps/web/src/components/player/`
- 폴링: `apps/web/src/use-api.ts`

## 확인 방법

- `pnpm --filter @lsp/web test`, `pnpm --filter @lsp/web build`
- 루트: `pnpm typecheck`, `pnpm lint`
