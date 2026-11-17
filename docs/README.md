# 문서 지도

## 폴더 규칙

- `docs/` 바로 아래에는 제품 전체에 걸친 문서만 둔다(`README.md`·`PRD.md`·`PRE-MORTEM.md`·`NEXT-STEPS.md`·`OPERATIONS.md`·`VERIFICATION.md`·`DEVELOPMENT.md`와 `adr/`·`agents/`·`features/`·`private/`·`screenshots/`). 한 기능의 탐색·스토리·PRD는 처음 만들 때부터 `docs/features/<기능>/`에 둔다.
- 기능마다 `docs/features/<기능>/` 폴더를 둔다. 기능 이름은 kebab-case 영어로 쓴다.
- 모든 기능 폴더에는 입구 문서 `README.md`를 둔다. 여기에는 요약, 요구사항 위치, 이슈와 PR, 코드 위치, 확인 방법을 적는다. 요구사항 본문은 복사하지 않고 `PRD.md`의 절(`§`)이나 같은 폴더의 PRD를 가리킨다.
- 기능 폴더에는 결정 하나의 흐름(탐색 → 전략 → PRD → 시나리오·테스트)을 모은다. 파일 이름은 종류로 정한다: `DISCOVERY.md`, `STRATEGY.md`, `RED-TEAM.md`, `PRD.md`, `PRE-MORTEM.md`, `STORIES.md`, `SCENARIOS.md`, `TEST.md`. 같은 종류가 둘이면 `STRATEGY-<주제>.md`처럼 주제를 붙인다.
- 새 기능을 만들면 폴더와 `README.md`를 만들고 아래 기능 표에 한 줄을 더한다.
- `screenshots/<이슈 번호>/`는 옮기지 않는다. PR 본문들이 이 경로의 이미지를 직접 쓴다.
- 이 규칙은 `scripts/check-docs-layout.mjs`가 검사하고 `pnpm lint`가 실행한다. 허용하는 루트 파일이나 파일 종류를 늘리면 이 문서와 스크립트를 함께 고친다.

## 제품 전체

| 문서 | 내용 |
|---|---|
| [PRD.md](./PRD.md) | 요구사항, 기술 결정, 인가 매트릭스, 방송 상태 전이, 인수 시나리오 (`§`) |
| [PRE-MORTEM.md](./PRE-MORTEM.md) | 위험과 대응 (`T`) |
| [NEXT-STEPS.md](./NEXT-STEPS.md) | 작업 순서, 서버 작업, 검증 결과 (`C`·`S`) |
| [OPERATIONS.md](./OPERATIONS.md) | 운영 배포, 복구, 백업 |
| [VERIFICATION.md](./VERIFICATION.md) | 기능별 동작 규칙, 자동 테스트, 로컬 확인 절차. 루트 README에서 옮겼다. 본문의 "N절"은 이 문서의 번호다 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | API 테스트 DB, 여러 worktree 동시 실행 |
| [adr/](./adr/) | 되돌리기 어려운 결정 |
| [agents/](./agents/) | 에이전트 스킬 설정 |
| `private/` | 공모 원문 등 gitignore 대상 |

## 기능

필수 기능(P0)과 일부 선택 기능은 `PRD.md` 안에서 정의했다. 이런 기능은 폴더에 `README.md`만 있다. 별도 탐색이나 PRD를 거친 기능은 그 문서가 같은 폴더에 있다.

| 기능 | 우선순위 | 폴더 안 문서 |
|---|---|---|
| [인증](./features/auth/) | P0 | README, SCENARIOS |
| [방송 관리](./features/broadcast-management/) | P0 | README, SCENARIOS |
| [송출](./features/publish/) (PC·모바일·OBS·사전 점검) | P0 | README, SCENARIOS |
| [시청](./features/watch/) | P0 | README, SCENARIOS, STORIES-ios-hls |
| [댓글](./features/comments/) | P1 | README |
| [녹화·다시보기](./features/recording-replay/) | P2 | README |
| [도네이션](./features/donation/) | P2 | README |
| [채널 설정](./features/channel-settings/) | P2 | README |
| [팔로우](./features/follow/) | P2 | README |
| [플레이어 컨트롤](./features/player-controls/) | P2 | README, PRD |
| [썸네일·대기 이미지](./features/thumbnail-standby/) | P2 | README, STRATEGY |
| [방송 준비 중 노출, 채팅·댓글 분리](./features/chat-and-ready/) | P2 | README, STRATEGY ×2, PRD |
| [후원 알림·순위](./features/donation-alert/) | P2 | README, DISCOVERY, STORIES |
| [라임](./features/lime/) | P2 | README, PRD, 후원 모달(DISCOVERY·RED-TEAM·PRD·PRE-MORTEM) |
| [채널 페이지·마이페이지](./features/mypage/) | P2 | README, DISCOVERY, PRD |
| [카테고리·게임 타이틀](./features/category/) | P2 | README, DISCOVERY, PRD |
| [검색](./features/search/) | P2 | README, DISCOVERY, PRD |
| [코드 구조 개선](./features/code-structure/) | – | README, STORIES, PRE-MORTEM-payment-confirm |
| [web 성능 개선](./features/web-performance/) | – | README, STORIES |
| [API 운영 품질 개선](./features/api-hardening/) | – | README, STORIES |

운영(자동 재기동, 감시, 백업)은 사용자 기능이 아니라서 [OPERATIONS.md](./OPERATIONS.md)에 둔다.
