# 미디어 서버는 자체 호스팅 OvenMediaEngine을 쓴다

브라우저 WHIP 송출을 받아 시청자에게 LL-HLS로 나눠 주는 미디어 서버로 OvenMediaEngine(OME)을 VPS 한 대에 직접 띄운다. 치지직과 같은 LL-HLS를 기본 지원하고, WebRTC 송출과 시청 분배, 녹화를 한 서버에서 해결한다. 송출 허가(Admission Webhook)와 관리 API의 강제 종료로 "종료하면 송출이 멈춘다"를 서버가 강제할 수 있다. 무료 서버 한 대 기준으로 LiveKit Cloud로 바꿔도 비용이 줄지 않고 LL-HLS와 녹화를 잃는다.

2026-11-09 스파이크에서 판정 기준 네 가지(H.264 송출, 토큰 없는 송출 거절, 관리 API 강제 종료, Wi-Fi를 끈 Android LTE 송출)를 모두 통과해 유지로 판정했다(#2, #9). 송출 1 + 시청 3에서 OME CPU는 평균 5.1%였다.

## Considered Options

- **LiveKit Cloud (WebRTC SFU)**: 지연이 1초 미만이고 SDK가 있다. 녹화가 별도 비용(Egress)이고 외부 서비스에 의존한다. 스파이크가 실패하면 돌아갈 복귀안으로 남겼다(#4).
- **WebRTC P2P**: 송출자의 업로드가 시청자 수만큼 늘어 몇 명에서 한계다.
- **MediaRecorder → WebSocket → FFmpeg → HLS**: 지연이 5~15초이고 트랜스코딩 서버를 직접 만들어야 한다.

## Consequences

- 지연은 LL-HLS 수준(수 초)이다. 세그먼트 길이는 실측으로 4초로 정했다(#102, PRD §7.2).
- UDP 포트, TURN(TCP 3478), TLS 중계를 직접 관리한다. 모바일 LTE 송출은 WHIP URL에 `transport=all`이 있어야 TURN을 쓴다(PRD §7.2 "WHIP ICE").
- OME 전용 코드(Admission Webhook, 강제 종료, OvenLiveKit 송출)가 main에 있다. 다른 미디어 서버로 바꾸면 송출·종료·녹화 경로를 다시 짜야 한다.
