# 방송 id 정규화 시나리오 (#210)

`/pm-execution:test-scenarios`로 [STORIES-id-normalization.md](./STORIES-id-normalization.md)의 수락 기준을 시나리오로 옮겼다. 실사용자 데이터 없음, 근거는 이슈 #210 완료 조건이다.

- 시나리오 수: 7
- 범위: 정상 흐름, 경계(대소문자 변형·UUID 아닌 경로), 보안(rate 우회·고아 파일), 인가 회귀
- 자동화: 모두 API 테스트로 돌린다. 화면이 바뀌지 않으므로 기기별 체크리스트는 없다.
- 환경 주의: macOS 기본 파일 시스템은 대소문자를 가리지 않아 대문자 폴더가 소문자 폴더와 겹쳐 보인다. 그래서 테스트는 폴더가 있는지가 아니라 폴더 이름이 소문자인지 본다. CI(Linux)에서는 두 폴더가 따로 남으므로 그대로 잡힌다.

### 시나리오 1: 대문자 변형으로 rate 제한을 우회하지 못한다
**Tests**: Story 1 · **Priority**: Critical · **User role**: LIVE 방송 소유자

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | 소문자 id로 `PUT /api/broadcasts/:id/thumbnail` | 204 |
| 2 | 10초 안에 같은 id를 대문자로 바꿔 업로드 | 429 |

자동화: `apps/api/test/thumbnails.e2e.spec.ts` "an upper-case id › shares the 10 s bucket with the canonical id"

### 시나리오 2: 대문자 id 업로드는 소문자 폴더에만 쓴다
**Tests**: Story 1 · **Priority**: Critical · **User role**: LIVE 방송 소유자

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | 대문자 id로 썸네일 업로드 | 204 |
| 2 | 썸네일 디렉터리 확인 | 그 방송의 폴더는 소문자 id 하나뿐이고 `live.jpg`가 있다 |

자동화: "writes into the canonical folder only"

### 시나리오 3: 대문자로 올리고 소문자로 지워도 폴더가 남지 않는다
**Tests**: Story 2 · **Priority**: Critical

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | 대문자 id로 업로드 | 204 |
| 2 | 소문자 id로 `DELETE /api/broadcasts/:id` | 204 |
| 3 | 썸네일 디렉터리 확인 | 그 방송의 어떤 대소문자 변형 폴더도 없다 |

자동화: "leaves no thumbnail folder after upper-case upload, canonical delete"

### 시나리오 4: 소문자로 올리고 대문자로 지워도 폴더가 남지 않는다
**Tests**: Story 2 · **Priority**: High

시나리오 3에서 업로드와 삭제의 대소문자를 바꾼다. 결과는 같다.

자동화: "leaves no thumbnail folder after canonical upload, upper-case delete"

### 시나리오 5: 대문자 id 상세 조회는 소문자 id로 답한다
**Tests**: Story 3 · **Priority**: High · **User role**: 익명 시청자

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | 대문자 id로 `GET /api/broadcasts/:id` | 200, 응답 `id`는 소문자 |

자동화: "finds the broadcast and answers with the canonical id"

### 시나리오 6: 방송 id 경로만 바꾸고 나머지는 두지 않는다
**Tests**: Story 3 · **Priority**: High

| 입력 경로 | 기대 |
|---|---|
| `/api/broadcasts/<대문자 uuid>`, `/thumbnail`, `/comments?cursor=X`, `?a=B` | uuid만 소문자, 하위 경로·쿼리 원문 유지 |
| `/api/broadcasts`, `?status=LIVE`, `/api/broadcasts/NOT-A-UUID`, uuid 뒤에 글자가 붙은 경로, `/api/streamers/<대문자 uuid>` | 그대로 |

자동화: `apps/api/test/canonical-broadcast-id.spec.ts`

### 시나리오 7: 인가·없는 방송 응답은 그대로다
**Tests**: Story 3 · **Priority**: High

익명 401, 남의 방송 403, 모르는 방송·UUID가 아닌 id 404가 바뀌지 않는다.

자동화: 기존 `thumbnails.e2e.spec.ts` "rejects" 묶음과 `authorization-matrix.e2e.spec.ts`

## Coverage Matrix

| 수락 기준 | 정상 | 경계 | 오류·보안 | 시나리오 |
|---|---|---|---|---|
| 대문자 변형도 같은 10초 버킷 | | ✓ | ✓ | 1 |
| 대문자 업로드는 소문자 폴더 | ✓ | ✓ | | 2 |
| 삭제 뒤 폴더 0개 | ✓ | ✓ | ✓ | 3, 4 |
| 대문자 상세 조회 200·소문자 id | ✓ | | | 5 |
| 가드 전 한 곳에서 정규화 | | ✓ | | 6 |
| UUID 아닌 id 404·인가 결과 유지 | | | ✓ | 6, 7 |
| 운영 볼륨 기존 대문자 폴더 | | | | PR 본문 "운영 조치 필요" |

## Test Data

- LIVE·READY 방송을 Prisma로 직접 만든다(`seed`).
- 업로드 이미지는 64바이트 JPEG 헤더 버퍼.
- 테스트 시계(`FakeClock`)로 10초 경계를 맞춘다.
