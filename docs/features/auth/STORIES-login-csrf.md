# 백로그: 로그인 CSRF 막기

- **이슈**: #214 (보안 감사 run-1, "확인 필요")
- **형식**: User Stories
- **스토리 수**: 3. 범위가 라우트 두 곳이라 5개보다 적게 나눴다.
- **크기 판정**: "방향이 정해진 기능"(`docs/agents/pm-skills.md`). 이슈가 고칠 방향(JSON 전용 또는 Origin allowlist)을 정했고, DB 변경은 없다. API 변화는 거절 응답 하나(415)다.
- **근거**: 실사용자 데이터 없음. 근거는 이슈 #214 본문과 로컬 재현 결과([이슈 댓글](https://github.com/hyc7575/live-streaming-platform/issues/214#issuecomment-6933578388))다.
- **만든 방법**: `/pm-execution:write-stories`

## 문제

`POST /api/auth/login`과 `POST /api/auth/test-login`은 Nest 기본 파서로 `application/x-www-form-urlencoded`도 받는다. 그래서 다른 사이트가 자동 제출 HTML form으로 공격자 계정 로그인을 보낼 수 있다. 이 요청은 preflight를 거치지 않는다. 로그인이 성공하면 `startSession`이 세션을 재생성한다. 그러면 피해자 브라우저가 공격자 계정으로 로그인된다(login CSRF).

2026-11-17에 로컬에서 재현했다(Chromium 157, WebKit 27.2). 브라우저는 cross-site top-level POST 응답의 SameSite=Lax 쿠키를 저장한다.

피해 예: 심사자가 공격자 계정으로 로그인된 줄 모르고 채팅·후원·방송을 한다. 그 기록은 공격자 계정에 남는다.

## 결정

두 라우트는 `Content-Type: application/json`만 받는다. 다른 타입은 415로 거절한다.

| 대안 | 고르지 않은 이유 |
|---|---|
| Origin·Referer allowlist | 운영 도메인, Vite 로컬, LAN https(`scripts/lan-https.sh`)마다 허용 목록을 설정해야 한다. Origin이 없는 요청을 어떻게 다룰지도 정해야 한다. |
| `Sec-Fetch-Site` 확인 | 이 헤더를 보내지 않는 오래된 브라우저에서는 막지 못한다. JSON 전용 규칙은 브라우저 동작만으로 막는다. |
| CSRF 토큰 | 토큰 발급 라우트와 웹 상태 관리가 추가된다. 마감이 이틀 남아 비용이 크다. |

JSON 전용 규칙이 막는 이유는 두 가지다.

- HTML form은 `application/json`을 보낼 수 없다.
- 다른 origin의 fetch가 JSON을 보내면 브라우저가 preflight를 먼저 보낸다. API에는 CORS 허용이 없으므로 브라우저가 본 요청을 보내지 않는다.

## 스토리

### 스토리 1: 다른 사이트의 form 로그인 거절

**피해자(로그인한 심사자)로서, 다른 사이트를 열어도 내 세션이 다른 계정으로 바뀌지 않기를 원한다. 그래야 내 채팅·후원이 내 계정에 남는다.**

수락 기준:
- [ ] `POST /api/auth/login`에 `application/x-www-form-urlencoded` 본문을 보내면 415다. `Set-Cookie`가 없다.
- [ ] `POST /api/auth/login`에 `text/plain` 본문(JSON 문자열)을 보내면 415다.
- [ ] Content-Type이 없는 요청도 415다.
- [ ] 거절된 요청 뒤에도 기존 세션의 `GET /api/auth/me`는 원래 사용자를 돌려준다.
- [ ] 로그인 실패 횟수 제한(분당 10회)은 그대로다.

Priority: P0 | Effort: S | Dependencies: 없음

---

### 스토리 2: 테스트 계정 로그인에 같은 규칙

**심사자로서, 다른 사이트가 나를 테스트 계정으로 몰래 로그인시키지 못하기를 원한다. 그래야 어느 계정으로 무엇을 했는지 헷갈리지 않는다.**

수락 기준:
- [ ] `POST /api/auth/test-login`에 `account=B` form 본문을 보내면 415다. `Set-Cookie`가 없다.
- [ ] `TEST_ACCOUNTS_ENABLED`가 꺼져 있어도 비 JSON 요청은 415다(404보다 먼저 거절해도 된다).
- [ ] JSON `{"account":"A"}`는 지금처럼 200이고 세션 쿠키를 받는다.

Priority: P0 | Effort: S | Dependencies: 스토리 1의 규칙을 같이 쓴다

---

### 스토리 3: 정상 로그인은 그대로

**심사자로서, 로그인 화면과 "스트리머 A"·"사용자 B" 버튼이 지금처럼 동작하기를 원한다.**

수락 기준:
- [ ] `application/json`과 `application/json; charset=utf-8` 로그인은 200이고 세션 쿠키를 받는다.
- [ ] 웹 앱(`apiFetch`)의 로그인·테스트 계정 로그인이 Vite 프록시와 Caddy 뒤에서 동작한다. 규칙이 Origin을 보지 않으므로 프록시 설정과 무관하다.
- [ ] 회원가입·로그아웃·`/auth/me`의 동작은 바뀌지 않는다.

Priority: P0 | Effort: S | Dependencies: 스토리 1, 2

## 스토리 맵

```
꼭 필요: 1 form 로그인 거절 → 2 테스트 계정 로그인 → 3 정상 로그인 회귀 확인
```

## 기술 메모

- 규칙은 라우트 데코레이터(가드)로 두 라우트에만 붙인다. 회원가입은 세션을 바꾸지 않아 대상이 아니다.
- 415는 Nest `UnsupportedMediaTypeException`이다. 웹은 이 상태를 보지 않는다. 정상 경로는 늘 JSON이기 때문이다.
- 회귀 테스트: `apps/api/test/auth.e2e.spec.ts`, `test-accounts.e2e.spec.ts`에 form·text/plain·Content-Type 없음 요청을 넣는다.
- 운영 설정 변경은 없다.

## 열린 질문

- 운영의 `TEST_ACCOUNTS_ENABLED` 값과 Toss 키 종류는 확인하지 않았다(배포 서버 접근 없음). 수정 뒤에는 이 값과 상관없이 막힌다.
