# 문서 지도

## 폴더 규칙

- `docs/` 바로 아래에는 제품 전체에 걸친 문서만 둔다.
- 기능 하나에 대한 문서는 `docs/features/<기능>/`에 둔다. 폴더 하나에는 결정 하나의 흐름(탐색 → 전략 → PRD → 시나리오·테스트)을 모은다.
- 기능 폴더 안의 파일 이름은 종류로 정한다: `DISCOVERY.md`, `STRATEGY.md`, `PRD.md`, `SCENARIOS.md`, `TEST.md`. 같은 종류가 둘이면 `STRATEGY-<주제>.md`처럼 주제를 붙인다.
- 기능 이름은 kebab-case 영어로 쓴다.
- `screenshots/<이슈 번호>/`는 옮기지 않는다. PR 본문들이 이 경로의 이미지를 직접 쓴다.

## 제품 전체

| 문서 | 내용 |
|---|---|
| [PRD.md](./PRD.md) | 요구사항, 기술 결정, 인가 매트릭스, 방송 상태 전이, 인수 시나리오 (`§`) |
| [PRE-MORTEM.md](./PRE-MORTEM.md) | 위험과 대응 (`T`) |
| [NEXT-STEPS.md](./NEXT-STEPS.md) | 작업 순서, 서버 작업, 검증 결과 (`C`·`S`) |
| [OPERATIONS.md](./OPERATIONS.md) | 운영 배포, 복구, 백업 |
| [adr/](./adr/) | 되돌리기 어려운 결정 |
| [agents/](./agents/) | 에이전트 스킬 설정 |
| `private/` | 공모 원문 등 gitignore 대상 |

## 기능

| 기능 | 문서 | 이슈 |
|---|---|---|
| 플레이어 컨트롤 | [PRD](./features/player-controls/PRD.md) | #56, #69 |
| 썸네일·대기 이미지 | [STRATEGY](./features/thumbnail-standby/STRATEGY.md) | #61, #62, #63 |
| 방송 준비 중 노출, 채팅·댓글 분리 | [STRATEGY-chat-replay](./features/chat-and-ready/STRATEGY-chat-replay.md) → [STRATEGY-standby-scene](./features/chat-and-ready/STRATEGY-standby-scene.md) → [PRD](./features/chat-and-ready/PRD.md) | #90, #91, #92 |
| 라임 | [PRD](./features/lime/PRD.md) | #108, #109, #110 |
| 채널 페이지·마이페이지 | [DISCOVERY](./features/mypage/DISCOVERY.md) → [PRD](./features/mypage/PRD.md) | #116 |
| 카테고리·게임 타이틀 | [DISCOVERY](./features/category/DISCOVERY.md) → [PRD](./features/category/PRD.md) | #132, #133 |
| 검색 | [DISCOVERY](./features/search/DISCOVERY.md) → [PRD](./features/search/PRD.md) | #138, #139 |

썸네일·대기 이미지 전략의 후속 논의는 채팅·댓글 분리 폴더의 `STRATEGY-chat-replay.md`로 이어진다.
