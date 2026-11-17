# 방송 id 정규화 스토리 (#210)

`/pm-execution:write-stories`(User Stories 형식)로 만들었다. 실사용자 데이터 없음, 근거는 보안 감사 run-1의 재현 결과와 이슈 #210 완료 조건이다.

- 크기: 방향이 정해진 기능. 이슈가 고칠 방향과 완료 조건을 정했고 DB 스키마·API 응답 형태는 바뀌지 않는다.
- 스토리 수: 3. 보안 수정 하나라 5개 이상으로 쪼개면 서로 따로 쓸모가 없다.

## 배경

`/api/broadcasts/:id/...`의 `:id`는 UUID다. Postgres uuid 컬럼은 대소문자를 가리지 않고 찾지만, 썸네일 rate 가드의 키와 썸네일 디렉터리 이름은 `:id` 원문을 쓴다. 그래서 같은 방송의 대소문자 변형마다 10초 버킷과 디렉터리가 따로 생기고, 방송을 지워도 보낸 문자열의 디렉터리만 지워진다.

## Stories

### Story 1: 썸네일 rate 제한은 방송 하나에 하나다

**As a** 플랫폼 운영자(1인 개발자), **I want** 같은 방송의 id를 대소문자만 바꿔 보내도 같은 10초 버킷에 세어지기를, **so that** 썸네일 업로드 제한을 우회해 디스크를 채우는 일이 없다.

Acceptance Criteria:
- [ ] 소문자 id로 업로드한 직후 같은 id를 대문자로 바꿔 업로드하면 429를 받는다.
- [ ] 대문자 id로 업로드하면 소문자 id 디렉터리(`thumbnails/<소문자 id>/live.jpg`)에 쓰인다.
- [ ] 썸네일 디렉터리 아래에 대문자를 포함한 이름의 디렉터리가 생기지 않는다.

Priority: P1 | Effort: S | Dependencies: none

---

### Story 2: 방송을 지우면 썸네일이 하나도 남지 않는다

**As a** 스트리머, **I want** 방송을 지우면 그 방송의 썸네일 파일이 모두 사라지기를, **so that** 지운 방송의 화면이 정적 서버에서 계속 보이지 않는다.

Acceptance Criteria:
- [ ] 대문자 id로 썸네일을 올린 뒤 소문자 id로 방송을 지우면 썸네일 디렉터리가 하나도 남지 않는다.
- [ ] 소문자 id로 올린 뒤 대문자 id로 지워도 같다.
- [ ] 이미 운영 볼륨에 생긴 대문자 디렉터리는 코드로 지우지 않고 PR 본문 "운영 조치 필요"로 남긴다.

Priority: P1 | Effort: S | Dependencies: Story 1(같은 정규화)

---

### Story 3: 모든 방송 라우트가 같은 id로 판단한다

**As a** 개발자, **I want** `:id`가 들어오는 모든 `broadcasts` 라우트가 가드보다 먼저 정규화된 id를 받기를, **so that** 새 라우트나 가드가 원문 id를 키로 써도 같은 우회가 다시 생기지 않는다.

Acceptance Criteria:
- [ ] 대문자 id로 `GET /api/broadcasts/:id`를 부르면 200이고 응답 `id`는 소문자다.
- [ ] 정규화는 가드보다 먼저 한 곳에서 일어난다(컨트롤러·가드마다 따로 하지 않는다).
- [ ] UUID 모양이 아닌 `:id`는 지금처럼 404다.
- [ ] 소유자·익명·타인 인가 결과(401/403/404)는 바뀌지 않는다.

Priority: P1 | Effort: S | Dependencies: none

## Story Map

- 필수: Story 1, Story 2 (이슈 완료 조건)
- 필수: Story 3 (1·2를 한 곳에서 해결하는 방법이자 재발 방지)

## Technical Notes

- 정규화 위치: Express 라우터가 경로를 맞추기 전, `configureApp`의 미들웨어에서 `/api/broadcasts/<uuid>` 경로의 UUID만 소문자로 바꾼다. Nest 가드·파라미터는 그 뒤에 `req.params`를 읽으므로 모두 같은 id를 본다.
- "대문자면 404로 거부"도 가능하지만, 응답 id는 소문자이므로 정상 클라이언트에는 차이가 없고, 소문자로 바꾸는 쪽이 기존 링크를 깨지 않는다.
- DB 스키마·마이그레이션 없음. API 응답 형태 변화 없음.

## Open Questions

- 없음. 운영 볼륨 정리는 PR 본문 "운영 조치 필요"로 넘긴다.
