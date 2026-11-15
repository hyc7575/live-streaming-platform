# 송출

PC 화면 송출, 모바일 카메라 송출, OBS 송출, 송출 사전 점검. 송출 토큰, Admission Webhook, 종료와 비정상 종료를 함께 다룬다.

- 우선순위: P0 (OBS는 P3)
- 상태: 구현 완료

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.1 "PC 송출"·"송출 사전 점검"·"모바일 송출"·"OBS 송출" 행
- §7.2 WHIP ICE, 코덱, LL-HLS 세그먼트
- §7.4 송출 허가 규칙, 종료 시 송출 중단, 1인 1 LIVE, 비정상 종료, 좀비 방송 정리
- §7.5 송출 토큰, Webhook 신뢰, fail-closed
- §7.6 핵심 흐름, §7.7 오디오 처리, §7.8 지원 환경
- §8.2 RTMP·채널 스트림 키는 하지 않는다
- PRE-MORTEM T4, T5, T7, T8
- [ADR 0001](../../adr/0001-self-hosted-ovenmediaengine.md) 자체 호스팅 OvenMediaEngine

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #9 | #34 | S6 서버 스파이크 결과와 OME 유지 판정 |
| #21 | #26 | PC 화면·마이크·탭 소리 캡처와 믹싱 |
| #22 | #28 | 모바일 카메라 캡처, 전·후면 전환, 화면 꺼짐 방지 |
| #14 | #32 | 송출 사전 점검 화면 |
| #10 | #35 | 송출 토큰, Admission Webhook, LL-HLS 재생 |
| #11 | #36 | 방송 종료: 송출 중단과 시청자 종료 표시 |
| #12 | #37 | 재접속 유예와 좀비 방송 정리 |
| #13 | #38 | PC 캡처·믹싱 스트림을 송출에 연결 |
| #15 | #40 | 모바일 카메라 송출과 송출 중 전·후면 전환 |
| #76 | #84 | 송출 연결 실패를 알리고 송출 중 이탈 전에 확인 |
| #89 | #103 | OBS로 송출 (WHIP URL 발급, OBS 토큰 12시간) |
| #102 | #104 | LL-HLS 세그먼트를 4초로 줄여 첫 화면 대기를 줄인다 |

## 코드

- api: `apps/api/src/publish/`
- api: `apps/api/src/ome/`
- web: `apps/web/src/pages/PublishPage.tsx`, `ObsPanel.tsx`, `captureSources.ts`
- web: `apps/web/src/components/PcPreflight.tsx`, `PermissionGuide.tsx`
- web: `apps/web/src/capture/`, `publish/`

## 확인

- 시나리오: [SCENARIOS.md](./SCENARIOS.md) (기기별 체크리스트)
- 인수 시나리오: `PRD.md` §8.3 2, 3, 6, 8, 9, 10, 11, 12, 13
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 3·4·5절, "PC 화면 캡처·믹싱", "송출 사전 점검", "PC 화면 송출", "모바일 송출", "추가 송출 방법: OBS"
