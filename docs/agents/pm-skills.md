# PM 스킬 사용 기준

1인 개발이라 PM 역할(고르기, 정의하기, 확인하기, 알리기, 돌아보기)을 `pm-*` 스킬로 채운다. 이 문서는 작업 크기에 맞는 스킬과 스킬에 줄 맥락을 정한다.

## 스킬에 줄 맥락

스킬이 제품, 사용자, 목표, 제약을 물으면 아래 사실로 답한다.

- 고객: 공모전 심사위원.
- 목표: `docs/private/CONTEST-BRIEF.md` 4절 평가 기준. 필수 기능 완성도가 먼저다.
- 제약: 1인 개발, 마감 2026-11-19 23:59 KST.
- 사용자 데이터: 없다. 설문·인터뷰·지표가 필요한 단계는 치지직·Twitch의 공개 동작과 평가 기준을 근거로 삼고, 결과에 "실사용자 데이터 없음, 근거는 X"라고 적는다.

## 크기별 경로

아이디어를 받으면 먼저 크기를 정하고 그 행의 스킬만 쓴다. 크기를 정한 근거를 한 줄로 보고한다.

| 크기 | 예 | 경로 |
|---|---|---|
| 문구·UI 한 곳 | 버튼 하나 빼기, 문구 바꾸기 | 스킬 없이 이슈를 만든다 |
| 방향이 정해진 기능 | 재생 속도 버튼, 필터 칩 가로 스크롤 | `/pm-execution:write-stories`로 수락 기준을 만든 뒤 이슈 |
| 방향이 열려 있거나 DB·API가 바뀜 | 라임, 카테고리, 채팅·댓글 분리 | `/pm-product-discovery:discover` → `/pm-execution:red-team-prd` → `/pm-execution:write-prd` → 이슈 |
| 외부 의존이 있거나 되돌리기 어려움 | 결제, OBS 송출, 외부 게임 목록 API | 위 경로에 `/pm-execution:pre-mortem`을 더한다 |

이슈 본문에 수락 기준이 있으면 이 단계가 끝난 것이다.

## 단계별 스킬

- 고르기: `/pm-product-discovery:triage-requests`. 새 기능을 이슈로 만들기 전에 열린 이슈 전체와 함께 넣고, 평가 기준과 남은 기간으로 순위를 매긴다. 결과는 "할 것", "하지 않을 것", 기능 동결일이다.
- 확인하기: `/pm-execution:test-scenarios`. PRD §8.3 인수 시나리오나 이슈 수락 기준을 넣고, 결과를 기기별(Windows PC, Android, MacBook, iPhone) 체크리스트로 묶는다. 실기기 회귀(#17)에 쓴다.
- 알리기: `/pm-execution:sprint release-notes`로 머지된 PR을 기능 목록으로 묶은 뒤 `/pm-toolkit:proofread`로 다듬는다. README 심사자 절과 제출 설명에 쓴다.
- 돌아보기: 제출 뒤 `/pm-execution:sprint retro`.
- 경쟁 비교: `/pm-market-research:competitive-analysis`를 한 번 돌려 `docs/COMPETITIVE.md`로 남긴다. 치지직·Twitch 비교 질문은 그 문서를 먼저 읽는다.

## 맞지 않는 스킬

이 프로젝트에는 매출, 실사용자, 팀이 없다. 이것을 전제로 하는 스킬(`pricing`, `business-model`, `go-to-market`, `plan-okrs`, `stakeholder-map`, `interview`, `analyze-cohorts`, `north-star`)이 요청에 붙어 오면, 질문의 실제 크기를 위 표로 다시 정하고 그 경로를 따른다. 그렇게 했다고 보고한다.
