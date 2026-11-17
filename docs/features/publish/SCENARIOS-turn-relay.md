# 테스트 시나리오: 내장 TURN 중계 범위와 ome 네트워크 분리 (#216)

- 출처: [STORIES.md](./STORIES.md) 스토리 1~3
- 시나리오 수: 7 (정상 4, 보안 2, 운영 확인 1)
- 실사용자 데이터 없음. 근거는 격리 실측(2026-11-17)과 OME v0.21.0 소스다.

## 판정 요약

OME v0.21.0 내장 TURN은 **일반 relay가 아니다**. 감사 항목의 의심은 반박됐다.

| 요청 | OME 응답 (실측) | 더미 peer 수신 |
|---|---|---|
| Allocate UDP, 인증 없음 | 401, realm `airensoft` | - |
| Allocate UDP, `ome`/`airen` | 성공, relayed `1.1.1.1:14090`(가짜 주소) | - |
| CreatePermission(peer = 내부 리스너) | 성공 | - |
| Send indication(peer = 내부 리스너) | 응답 없음(indication) | 0바이트 |
| ChannelBind 0x4000 | 성공 | - |
| ChannelData | 응답 없음 | 0바이트 |
| Allocate TCP(RFC 6062) | 442 Unsupported Transport Protocol | - |
| Connect(RFC 6062) | 응답 없음, 로그 `Unknown method: 10` | 0바이트 |

소스 근거(`src/modules/ice/ice_port.cpp`, 태그 v0.21.0):

- `CreateTurnServer` 주석: 피어가 같은 OME 프로세스라 UDP로 보내지 않고 함수 호출로 넘긴다.
- Allocate 응답의 relayed 주소는 `FAKE_RELAY_IP4`(가짜)다. 실제 relay 소켓을 열지 않는다.
- `OnReceivedTurnSendIndication`·`OnChannelDataPacketReceived`는 페이로드를 꺼내 `OnPacketReceived`(자기 ICE·DTLS·RTP 처리)로 다시 넣는다. `XOR-PEER-ADDRESS`는 응답을 같은 TCP 연결에 Data indication으로 감쌀 때만 쓴다.
- `CreatePermission`은 검증 없이 성공만 돌려준다. 바깥으로 나가는 경로가 없어 위험이 아니다.
- Connect(0x000a) 분기가 없어 `Unknown method`로 버린다.

## 시나리오 1: 격리 스택에서 TURN이 내부 peer로 중계하지 않는다

- 검증: 스토리 1 / 우선순위: Critical
- 사전 조건: 로컬 Docker, 이미지 `ovenmedialabs/ovenmediaengine:v0.21.0`. 공유 `lsp-ome-1`은 건드리지 않는다.

| 단계 | 행동 | 기대 결과 |
|---|---|---|
| 1 | `scripts/turn-relay-check/`에서 `docker compose -p lsp216 up -d ome listener` | internal 네트워크에 OME(TURN 4478)와 더미 리스너(5432 TCP·UDP)가 뜬다 |
| 2 | `docker compose -p lsp216 run --rm client` | 위 판정 표와 같은 응답이 찍힌다 |
| 3 | `docker compose -p lsp216 logs listener` | `[tcp]`·`[udp]` 수신 줄이 없다 |
| 4 | `docker compose -p lsp216 --profile run down -v` | 컨테이너·네트워크가 남지 않는다 |

## 시나리오 2: 회귀 검사가 ome-postgres 같은 네트워크를 잡는다

- 검증: 스토리 3 / 우선순위: High

| 단계 | 행동 | 기대 결과 |
|---|---|---|
| 1 | `node scripts/check-compose-networks.mjs` | 출력 없이 종료 코드 0 |
| 2 | `deploy/compose.yaml`의 ome `networks`를 `[data, media]`로 바꾸고 다시 실행 | `ome와 postgres가 같은 네트워크에 있다.`로 종료 코드 1 |
| 3 | api의 `networks`에서 `media`를 빼고 실행 | `ome와 api가 같은 네트워크에 없다.`로 실패 |

`pnpm lint`가 이 검사를 돌린다. Docker가 없는 환경은 건너뛴다고 출력한다.

## 시나리오 3: 분리 뒤에도 필요한 경로는 이어진다

- 검증: 스토리 3 / 우선순위: Critical
- 사전 조건: 운영 compose에 override를 얹어 api·caddy를 node 컨테이너로 바꾸고, 두 네트워크를 internal로 바꾼 격리 프로젝트(`lsp216n`). 2026-11-17 실측.

| 경로 | 용도 | 결과 |
|---|---|---|
| ome → api:3000 | Admission Webhook | 연결됨 |
| api → ome:8081 | 송출 강제 종료(관리 API) | 연결됨 |
| caddy → ome:3333 | WHIP 시그널링·LL-HLS 중계 | 연결됨 |
| caddy → api:3000 | API 중계 | 연결됨 |
| api → postgres:5432 | DB | 연결됨 |
| db-backup → postgres:5432 | 백업 | `accepting connections` |

녹화는 호스트 폴더 공유라 네트워크와 무관하다.

## 시나리오 4: ome에서 postgres에 닿지 않는다

- 검증: 스토리 3 / 우선순위: High (보안)

| 단계 | 행동 | 기대 결과 |
|---|---|---|
| 1 | ome 컨테이너에서 `getent hosts postgres` | 이름이 해석되지 않는다 |
| 2 | ome에서 `postgres:5432`, `db-backup:5432` TCP 연결 | 실패 |
| 3 | ome에서 postgres 컨테이너 IP:5432로 직접 연결 | 실패(다른 bridge) |

## 시나리오 5: 인증 없는 TURN 할당은 거부된다

- 검증: 스토리 1 / 우선순위: Medium (보안)
- 시나리오 1의 클라이언트 출력에서 인증 없는 Allocate가 401이어야 한다. 기본 계정(`ome`/`airen`)은 WHIP `Link` 헤더로 공개되므로 경계로 보지 않는다(PRD §7.2).

## 시나리오 6: 운영 배포 뒤 확인 체크리스트

- 검증: 스토리 3 / 우선순위: Critical / 운영 조치 필요

- [ ] `docker compose up -d` 뒤 기존 `lsp-prod_default` 네트워크가 남아 있으면 `docker network rm`으로 지운다(compose가 고아 네트워크를 경고만 한다).
- [ ] `docker compose ps`에서 모든 서비스가 healthy·running이다.
- [ ] PC에서 송출을 시작해 시청 화면에 LL-HLS가 나온다(admission과 Caddy 중계 확인).
- [ ] 방송 종료를 눌러 송출이 끊긴다(api → ome:8081 확인).
- [ ] 끝난 방송의 녹화가 다시보기에 나온다.
- [ ] `docker compose exec ome getent hosts postgres`가 아무것도 출력하지 않는다.

## 시나리오 7: 클라우드 메타데이터 도달 여부 (범위 밖)

- 우선순위: Low. 로컬에서 판정할 수 없는 배포 사실이다. TURN이 바깥 소켓을 열지 않으므로 TURN 경유 도달은 없다. ome 컨테이너 자체의 egress는 이 이슈 범위가 아니다.

## 커버리지

| 요구 | 정상 | 경계·오류 | 보안 | 비고 |
|---|---|---|---|---|
| 스토리 1 판정 | 1 | 5 | 1 | 소스 근거 병기 |
| 스토리 2 근거 | 이 문서, 이슈 #216 댓글 | - | - | |
| 스토리 3 분리 | 2, 3 | 2(실패 경로) | 4 | 운영 확인 6 |
