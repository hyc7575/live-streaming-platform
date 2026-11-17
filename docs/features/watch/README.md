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
| #246 | #248 | iPhone Safari(iOS 17.1+) 라이브를 hls.js로 재생한다. 원인과 수락 기준: [STORIES-ios-hls.md](./STORIES-ios-hls.md) |
| #249 | #250 | LIVE가 된 직후 10초는 공개 화면에 "방송 준비 중"으로 보인다: [STORIES-live-display-delay.md](./STORIES-live-display-delay.md) |

## 코드

- api: `apps/api/src/broadcasts/` (상세·상태 조회)
- web: `apps/web/src/pages/BroadcastPage.tsx`
- web: `apps/web/src/components/LivePlayer.tsx`, `BroadcastSidePanel.tsx`
- web: `apps/web/src/playback.ts` (재생 경로 분기)
- web: `apps/web/src/live-display.ts` (공개 화면의 LIVE 표시 지연)

## 결과 (2026-11-17)

- iPhone Safari도 hls.js(`ManagedMediaSource`)로 LIVE를 재생한다(#248). iOS 26.5 Simulator에서 수정 전에는 5번 중 4번 `error 4`로 멈췄고, 수정 뒤에는 LIVE 뒤 30초에 연 화면이 2.2초, 6초에 연 화면이 8.4·12.4·13.6초 만에 재생을 시작했다. 실기기 iPhone은 확인하지 않았다. iOS 17.0 이하는 여전히 네이티브 HLS라 재생되지 않을 수 있다.
- 공개 화면은 LIVE가 된 뒤 10초 동안 "방송 준비 중"으로 보인다(#250). 운영 API로 두 번 재서 미리 열어 둔 시청 화면이 10.1초에 플레이어로 바뀌고 13.4·13.6초에 재생을 시작했다. 바뀐 뒤 로딩이 약 3초 남는다.
- 남은 과제는 README "향후 과제"에 적었다: OME의 `PART-TARGET=0` 근본 수정, 일찍 연 시청자가 라이브 끝보다 약 16초 뒤처지는 문제.

## 확인

- 시나리오: [SCENARIOS.md](./SCENARIOS.md) (기기별 체크리스트)
- 인수 시나리오: `PRD.md` §8.3 3, 5
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 3절, 4절

## 관련 기능

플레이어 컨트롤은 [player-controls](../player-controls/)에 있다.
