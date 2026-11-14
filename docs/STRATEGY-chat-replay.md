## Product Strategy: 상태별 썸네일과 채팅·댓글 분리 (Lime 부가기능)

**Date**: 2026-11-11
**Stage**: MVP (마감 2026-11-19 23:59 KST, 남은 8일)
**Author**: kh.jeon

> 결과: 결정은 `PRD-chat-and-ready.md`가 확정했다(#90·#91·#92). 방송 전 채팅과 READY 목록 노출 논의는 `STRATEGY-standby-scene.md`를 거쳐 그 PRD로 갔다.

> 범위: 공모전 제출물 안의 기능 묶음 전략이다. `STRATEGY-broadcast-extras.md`의 후속이다. Growth Engine·Defensibility는 공모전 맥락이라 짧게 둔다.

### 0. 현재 코드 상태 (2026-11-11 확인)

| 항목 | 지금 | 위치 |
|---|---|---|
| 목록 카드 이미지 순서 | READY: 대기 이미지 / LIVE·ENDED: 캡처 → **대기 이미지** → 첫 글자 | `apps/web/src/components/BroadcastThumbnail.tsx` `IMAGE_ORDER` |
| 시청 화면 대기 이미지 | READY일 때만 (이미 맞다) | `apps/web/src/pages/BroadcastPage.tsx:150` |
| 캡처 썸네일 | LIVE 동안 30초마다 `thumbnails/<id>/live.jpg`를 덮어쓴다. 종료 후 남는 것은 마지막 캡처 | `apps/web/src/publish/thumbnailCapture.ts` |
| 댓글 표시 | LIVE만 채팅형(`chat`), READY·ENDED는 게시판형(`board`) | `CommentPanel.tsx` `variant` |
| 댓글 저장 | `Comment` 한 테이블. 방송 상태 구분 없음 | `schema.prisma` |
| 다시보기 | `recordingFiles`(재연결마다 파일 하나)를 차례로 재생. 파일별 시작 시각은 저장하지 않는다 | `ReplayPlayer.tsx`, OME `FilePath` `${TransactionId}_${Sequence}.mp4` |

대기 이미지가 LIVE·ENDED 카드에 나오는 경우: 캡처가 아직 없거나(송출 직후, 캡처 실패) 송출 브라우저가 캡처를 한 번도 올리지 못한 방송이다.

### 1. Vision

카드와 화면이 방송의 "지금 상태"를 그대로 보여 준다. 준비 중에는 대기 화면과 채팅, 방송 중에는 실제 장면과 채팅, 끝난 뒤에는 실제 장면, 시간에 맞춰 다시 흐르는 채팅, 그리고 댓글.

### 2. Target Segments

| Segment | Pain Level | Current Alternative | Priority |
|---|---|---|---|
| 공모전 심사자 | 중간. 끝난 방송 카드에 대기 이미지가 보이면 상태 표시가 틀린 것처럼 보인다. 댓글 CRUD는 평가 항목이다 | 없음 | 1 |
| 시청자 | 중간. 방송 전 대화가 게시판처럼 보여 "곧 시작" 분위기가 없다. 다시보기에서 채팅 흐름을 못 본다 | 댓글 목록을 시간순으로 직접 읽기 | 2 |
| 스트리머 | 낮음. 대기 이미지가 다른 곳에 쓰이는 것을 원하지 않는다 | 없음 | 3 |

**Primary segment**: 심사자. 댓글은 공모 원문의 선택 기능(작성·조회·수정·삭제, 작성자 권한 검증)이다. 구조를 바꿔도 이 네 동작이 ENDED 방송에서 그대로 보여야 한다.
**Explicitly not serving**: 실시간 푸시(WebSocket) 채팅. PRD §8.2 Non-goal이며, 1초 폴링으로 충분하다.

### 3. Pain Points & Value Created

- **대기 이미지가 끝난 방송의 얼굴이 된다**: 대기 이미지는 "곧 시작" 신호다. 끝난 방송에 나오면 상태와 그림이 어긋난다.
- **방송 전 대화가 게시판형이다**: READY에서 모이는 시청자는 실시간 대화를 한다. 게시판형은 이 맥락에 맞지 않는다.
- **채팅과 댓글이 섞인다**: 방송 중 "ㅋㅋㅋ" 수백 줄과 방송 후 감상평이 한 목록에 있다. 종료 후 들어온 사람이 댓글을 찾기 어렵다.
- **다시보기에 현장감이 없다**: Twitch·치지직 다시보기는 재생 시점에 맞춰 채팅을 흘린다. 지금은 채팅이 전부 한 번에 보인다.

### 4. Value Propositions

- **심사자**: When 끝난 방송을 열 때, they want 실제 방송 장면과 댓글 CRUD를 바로 확인하고 싶어 한다, so they can 상태 표시와 선택 기능 완성도를 판단한다.
- **시청자 (다시보기)**: When 끝난 방송을 볼 때, they want 그 장면에서 사람들이 한 말을 같이 보고 싶어 한다, so they can 생방송을 본 것처럼 즐긴다.
- **시청자 (준비 중)**: When 시작 전에 들어왔을 때, they want 다른 시청자와 바로 대화하고 싶어 한다, so they can 기다리는 시간을 버틴다.

### 5. Strategic Trade-offs

| We Choose | Over | Because |
|---|---|---|
| ENDED 카드: 캡처 썸네일만, 없으면 첫 글자 | 대기 이미지 대체 | 대기 이미지는 READY 전용 신호다 |
| ENDED 썸네일: 송출 1분 뒤 첫 캡처를 `poster.jpg`로 고정 (짧은 방송은 마지막 캡처) | 마지막 캡처(지금) / 첫 프레임 / 서버 ffmpeg 추출 / 후보 선택 UI | 첫 프레임은 검은 화면·세팅 화면일 때가 많다. 마지막 프레임은 "방송 끝" 화면이나 바탕화면일 때가 많다. 서버 ffmpeg는 새 의존성과 서버 CPU를 쓴다(이전 전략의 "캡처는 브라우저" 결정과 어긋남). 후보 선택 UI(Twitch·YouTube 방식)는 마감 안에 비용이 크다 |
| `Comment` 테이블에 `kind`(CHAT·COMMENT) 열 추가, 서버가 작성 시점 방송 상태로 정한다 | 새 `ChatMessage` 테이블 | 작성·조회·수정·삭제·작성자 권한 코드와 테스트를 그대로 쓴다. 클라이언트가 kind를 고르지 못하게 해 위조를 막는다 |
| 다시보기 채팅: 클라이언트가 전체 CHAT을 한 번 받고 재생 시점으로 거른다 | 재생 시점마다 서버 질의 | 공모전 규모(방송당 수백~수천 건)라 한 번 받는 쪽이 단순하다. 탐색(seek)도 바로 된다 |
| 재생 시점 ↔ 실제 시각 매핑: 녹화 파일마다 시작 시각을 저장 | `startedAt` 하나만 기준 | 재연결하면 파일이 나뉘고 사이에 공백이 생긴다. 파일 0번만 쓰면 2번째 파일부터 채팅이 어긋난다 |
| READY 채팅은 다시보기 0초에 몰아서 보여 준다 | 숨기기 | 방송 전 대화도 방송의 일부다. 숨기면 "내 채팅이 사라졌다"로 보인다 (결정 필요, 아래) |

### 6. Key Metrics

공모전이라 사용량 지표가 없다. 인수 기준으로 대신한다.

- **North Star**: 끝난 방송 다시보기에서 재생 시점 ±3초 안의 채팅이 차례로 나타난다.
- **Input**: LIVE·ENDED 카드에 대기 이미지 0건 / READY·LIVE는 채팅형, ENDED는 채팅(다시보기)·댓글 탭 분리 / ENDED에서 댓글 CRUD·작성자 403 테스트 통과
- **Health (guardrail)**: 기존 댓글 e2e·인가 매트릭스 테스트 통과, 마이그레이션 후 기존 행은 CHAT로 채움(LIVE 중 작성분을 잃지 않기), 다시보기 탐색 때 채팅 목록이 탐색 지점으로 바로 맞춰짐

### 7. Growth Engine

해당 없음. README "기능 확인"에 "끝난 방송에서 다시보기 채팅이 시간에 맞춰 나오는지, 댓글 탭에서 수정·삭제"를 한 줄 추가한다.

### 8. Core Capabilities

| Capability | Build / Buy | Investment | Timeline |
|---|---|---|---|
| A. `IMAGE_ORDER`에서 LIVE·ENDED의 `standby` 제거 + 테스트 | Build | XS | 0.5시간 |
| B. READY도 `chat` 변형 (`variant = status === 'ENDED' ? 'board' : 'chat'`), READY 폴링 1초 | Build | XS | 0.5시간 |
| C. `poster.jpg` 고정 (송출 60초 뒤 첫 캡처 1회, API는 기존 업로드 재사용 + `kind` 파라미터) | Build | S | 0.5일 |
| D. `Comment.kind` 열 + 마이그레이션 + 서버가 상태로 kind 결정 + 조회 `?kind=` | Build | S | 0.5일 |
| E. 녹화 파일별 시작 시각 저장 (`recordingParts` JSON 또는 별도 테이블) | Build | M | 0.5~1일 |
| F. 다시보기 채팅 패널: `timeupdate`로 `createdAt ≤ 파일시작 + 재생시각` 인 CHAT만 표시, 탐색 대응 | Build | M | 1일 |

E의 시작 시각 출처 후보 (구현 전 확인 필요):
1. OME 녹화 info XML(`InfoPath`)에 파일별 시작·종료 시각이 있는지 확인. 있으면 reconciler가 함께 읽는다.
2. 없으면 Admission Webhook(송출 연결 허용) 시각을 연결마다 기록하고, 파일 순서와 짝짓는다. 녹화 실패로 파일이 빠지면 짝이 어긋나는 위험이 있다.

### 9. Defensibility

해당 없음. 면접·심사에서 설명할 설계 이유가 남는다: "채팅과 댓글을 한 테이블에 두고 작성 시점 상태로 나눈 이유", "재연결로 나뉜 녹화 파일에서 재생 시점을 실제 시각으로 바꾸는 방법".

### Strategic Risks

1. **마감**: E·F는 합쳐 1.5~2일이다. 필수 기능 회귀·README·운영(#17, #8, #45)보다 뒤다. → A·B는 오늘, C·D는 다음, E·F는 남는 시간에. F를 못 하면 ENDED는 "채팅 기록(시간순 목록) / 댓글" 두 탭으로 끝낸다.
2. **시각 오차**: 시청자는 LL-HLS로 2~5초 늦게 본다. 채팅 `createdAt`은 그 지연만큼 영상보다 늦다. → 표시 시점에서 고정 3초를 빼는 보정값을 둔다(Twitch도 같은 오차가 있다).
3. **평가 항목 가시성**: 채팅형에서 수정 버튼이 눈에 덜 띄면 심사자가 댓글 CRUD를 못 찾는다. → ENDED 댓글 탭은 게시판형 그대로 두고 README에 위치를 적는다.

### Next Steps

| 단계 | 내용 | 비용 |
|---|---|---|
| 1 | A (대기 이미지 = READY 전용), B (READY 채팅형) | XS |
| 2 | D (`kind` 분리, ENDED는 채팅 기록·댓글 탭), C (`poster.jpg`) | S+S |
| 3 | E·F (다시보기 채팅 동기화) | M+M |

결정이 필요한 것:
- READY 채팅을 다시보기에서 0초에 몰아 보일지, 숨길지.
- ENDED 썸네일: 지금처럼 마지막 캡처로 둘지(A만), 1분 뒤 프레임 고정(C)까지 할지.
- 다시보기 채팅 동기화(E·F)를 마감 안에 넣을지.
