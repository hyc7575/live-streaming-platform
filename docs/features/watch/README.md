# 시청

로그인 없이 LL-HLS로 시청한다. 방송 상태를 폴링해 종료를 감지한다.

- 우선순위: P0
- 상태: 구현 완료

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.1 "시청" 행
- §7.4 시청자 종료 감지, 재생 경로 분기
- §7.8 지원 환경
- PRE-MORTEM T9

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #10 | #35 | LL-HLS 재생 (송출과 같은 PR) |
| #11 | #36 | 시청자 종료 표시 |
| #96 | #97 | 방송 페이지 우측 패널을 화면 높이로 채운다 |
| #98 | #99 | 모바일 방송 페이지를 영상과 채팅으로 채운다 |
| #149 | #155 | 첫 방송 조회가 일시 실패해도 다시 조회한다 |

## 코드

- api: `apps/api/src/broadcasts/` (상세·상태 조회)
- web: `apps/web/src/pages/BroadcastPage.tsx`
- web: `apps/web/src/components/LivePlayer.tsx`, `BroadcastSidePanel.tsx`
- web: `apps/web/src/playback.ts`

## 확인

- 시나리오: [SCENARIOS.md](./SCENARIOS.md) (기기별 체크리스트)
- 인수 시나리오: `PRD.md` §8.3 3, 5
- 수동 확인 절차: 루트 `README.md` "기능 확인"의 3절, 4절

## 관련 기능

플레이어 컨트롤은 [player-controls](../player-controls/)에 있다.
