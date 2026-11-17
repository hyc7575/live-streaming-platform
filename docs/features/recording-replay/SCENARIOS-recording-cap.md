# 테스트 시나리오: LIVE 녹화 용량 상한 (#209)

- 출처: [STORIES-recording-cap.md](STORIES-recording-cap.md) 스토리 1~4
- 시나리오 수: 8
- 범위: 정상 경로, 경계, 오류. 서버(녹화 정리 작업) 동작이라 실기기 체크리스트 대신 자동 테스트를 짝지었다.
- 자동 테스트 위치: `apps/api/test/recording-plan.spec.ts`(계획), `apps/api/test/recordings.e2e.spec.ts`(정리 작업 + DB + 가짜 OME), `apps/api/test/recordings-config.spec.ts`(환경 변수)

### 시나리오 1: LIVE 녹화 하나가 전체 상한을 넘는다 (회귀)
**대상**: 스토리 1, 2 · **우선순위**: Critical

전제: ENDED 방송 둘(각 40B, 다시보기 목록에 있음), LIVE 방송 하나(녹화 중, 40B), 전체 상한 30B.

| 단계 | 동작 | 기대 결과 |
|---|---|---|
| 1 | 정리 작업 한 번 | LIVE 방송에 `stopRecording`이 한 번 불린다 |
| 2 | DB·디스크 확인 | ENDED 둘의 폴더와 `recordingFiles`가 남고 다시보기 목록도 그대로다 |
| 3 | 방송 상태 확인 | LIVE 그대로다(송출·시청 유지) |
| 4 | 정리 작업 한 번 더 | `startRecording`이 불리지 않는다 |

자동: e2e `stops a LIVE recording that alone exceeds the cap and keeps the ENDED replays`, plan `stops LIVE recordings that alone exceed the cap and keeps every ENDED one`. 옛 코드에서 e2e가 실패함을 확인했다.

### 시나리오 2: LIVE 녹화 여럿이 합쳐 상한을 넘는다
**대상**: 스토리 1 · **우선순위**: High

LIVE 둘(각 30B), 상한 50B → 둘 다 멈춘다. 자동: plan `stops every LIVE recording when together they exceed the cap`.

### 시나리오 3: LIVE 녹화가 상한 안이면 기존 동작대로 ENDED를 지운다
**대상**: 스토리 1(오탐 방지) · **우선순위**: High

LIVE 40B, ENDED 40B 둘, 상한 90B → 가장 먼저 끝난 ENDED만 지우고 녹화 작업은 건드리지 않는다. 자동: e2e `deletes the oldest ENDED recordings first while the LIVE one fits`, plan `evicts ENDED recordings, and stops nothing, when LIVE ones fit the cap`.

### 시나리오 4: 방송 하나가 방송당 크기 상한에 닿는다
**대상**: 스토리 3, 2 · **우선순위**: High

방송당 상한 20B, LIVE 둘(20B, 10B) → 20B 방송만 멈추고, 다음 주기에도 그 방송은 다시 켜지 않는다. 경계: 상한과 같으면 멈춘다(19B는 계속). 자동: e2e `stops a LIVE recording that reaches the per-broadcast size and keeps it stopped`, plan `stops a LIVE recording that reaches the per-broadcast size`.

### 시나리오 5: 방송 하나가 방송당 시간 상한에 닿는다
**대상**: 스토리 3 · **우선순위**: High

방송당 시간 3시간. LIVE가 된 지 3시간 − 1ms면 계속 녹화, 3시간이면 멈추고 이후 다시 켜지 않는다. 자동: e2e `stops a LIVE recording that has run for the per-broadcast time`, plan `stops a LIVE recording that has run for the per-broadcast time`.

### 시나리오 6: ENDED 방송에는 방송당 상한을 쓰지 않는다
**대상**: 스토리 3(경계) · **우선순위**: Medium

ENDED 녹화가 방송당 크기·시간을 넘어도 계획은 아무것도 바꾸지 않는다(정리는 전체 상한만 본다). 자동: plan `leaves the recordings of ENDED broadcasts to eviction alone`.

### 시나리오 7: 환경 변수
**대상**: 스토리 3 · **우선순위**: Medium

| 입력 | 기대 결과 |
|---|---|
| 비움 | 방송당 3GB, 3시간 |
| `RECORDINGS_MAX_GB_PER_BROADCAST=1.5`, `RECORDINGS_MAX_HOURS_PER_BROADCAST=0.5` | 1.5GiB, 30분 |
| 방송당 5, 전체 2 | 방송당 2GiB(전체 상한) |
| 어느 쪽이든 `0` | API가 시작할 때 변수 이름을 담은 오류로 거부 |

자동: `recordings-config.spec.ts`.

### 시나리오 8: 실서버 수동 확인 (운영)
**대상**: 스토리 1, 4 · **우선순위**: Low · **환경**: 로컬 compose 또는 운영 서버

1. `.env`에 `RECORDINGS_MAX_GB_PER_BROADCAST=0.001`(약 1MB)을 넣고 API를 다시 띄운다.
2. 방송을 송출한다. 30초 안에 API 로그에 `Stopped the recording of LIVE <id>: it reached a recording cap`이 남는다.
3. 시청 화면은 계속 재생된다. 방송을 끝내면 멈춘 지점까지의 다시보기가 목록에 오른다.

수동 확인은 이번 PR에서 하지 않았다.

## 대응 표

| 요구사항 | 정상 | 경계 | 오류 | 비고 |
|---|---|---|---|---|
| 스토리 1 LIVE만으로 전체 상한 초과 | 1, 2 | 3 | - | |
| 스토리 2 다시 켜지 않음 | 1, 4, 5 | - | - | |
| 스토리 3 방송당 크기·시간 | 4, 5 | 4, 5, 6 | 7 | |
| 스토리 4 운영 문서 | 8 | - | - | 문서 갱신은 PR diff로 확인 |

## 시험 데이터

- 녹화 폴더: 테스트마다 임시 디렉터리, 방송 id 폴더에 `tmp_1`(쓰는 중)이나 `1_0.mp4`를 지정한 바이트로 쓴다.
- 시각: 가짜 시계(`FakeClock`)로 LIVE 시작 시각과 현재 시각을 정한다.
- OME: 가짜 OME(`FakeOmeApi`)의 `records`, `recordCalls`로 녹화 작업 시작·중지를 본다.
