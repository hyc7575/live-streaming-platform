# 테스트 시나리오: 로그인 CSRF 막기

- **근거**: [`STORIES-login-csrf.md`](./STORIES-login-csrf.md) 수락 기준, 이슈 #214
- **시나리오 수**: 5 (정상 1, 보안 3, 경계 1)
- **쓰는 곳**: 실기기 회귀(#17). 공격 페이지는 앱과 다른 origin의 로컬 정적 서버에 둔다. 더미 계정만 쓴다.
- **만든 방법**: `/pm-execution:test-scenarios`로 위 수락 기준에서 만들었다. 번호는 [`SCENARIOS.md`](./SCENARIOS.md)의 AU9 다음부터 이어진다.

## 기기별 체크리스트

`□`는 그 기기에서 확인할 항목이다. `—`는 그 기기에서 하지 않는다. AU11~AU13은 다른 origin 페이지가 필요하다. 그래서 PC 브라우저에서만 한다.

| 시나리오 | Windows PC | Android | MacBook | iPhone |
|---|---|---|---|---|
| AU10 정상 로그인·테스트 계정 로그인 그대로 | □ | □ | □ | □ |
| AU11 다른 사이트 form 로그인 → 세션 유지 | □ | — | □ (Safari) | — |
| AU12 다른 사이트 form 테스트 계정 로그인 → 세션 유지 | □ | — | □ (Safari) | — |
| AU13 다른 사이트 JSON fetch → preflight에서 막힘 | — | — | □ | — |
| AU14 Content-Type 경계 | □ | — | — | — |

## AU10. 정상 로그인과 테스트 계정 로그인은 그대로다

- **근거**: 스토리 3
- **사전 조건**: 비로그인. 더미 계정 하나가 있다.
- **역할**: 심사자
- **우선순위**: Critical

| 단계 | 행동 | 기대 결과 |
|---|---|---|
| 1 | 로그인 화면에서 이메일·비밀번호로 로그인 | 헤더에 닉네임이 보인다 |
| 2 | 로그아웃 → 홈에서 "사용자 B" | 헤더가 "사용자 B"로 바뀐다 |
| 3 | 개발자 도구 네트워크 탭에서 두 요청을 본다 | `Content-Type: application/json`, 응답 200 |

## AU11. 다른 사이트의 form 로그인이 세션을 바꾸지 못한다

- **근거**: 스토리 1
- **사전 조건**: 앱에 더미 피해자로 로그인했다. 다른 origin(예: `http://127.0.0.1:8081`)에 자동 제출 form이 있다. form은 `POST <앱>/api/auth/login`이고 본문은 `email`·`password`(더미 공격자 계정)다.
- **역할**: 피해자(로그인한 심사자)
- **우선순위**: Critical

| 단계 | 행동 | 기대 결과 |
|---|---|---|
| 1 | 공격 페이지를 연다 | form이 제출되고 앱 주소에 415 JSON(`Content-Type must be application/json`)이 보인다 |
| 2 | 앱 홈으로 간다 | 헤더 닉네임이 피해자 그대로다 |
| 3 | `/api/auth/me`를 연다 | 피해자 이메일이다 |

**수정 전 결과**: 2026-11-17 Chromium 157에서 3단계가 공격자 계정이었다.

## AU12. 다른 사이트의 form 테스트 계정 로그인이 세션을 바꾸지 못한다

- **근거**: 스토리 2
- **사전 조건**: AU11과 같다. form은 `POST <앱>/api/auth/test-login`이고 본문은 `account=B`다.
- **역할**: 피해자
- **우선순위**: Critical

| 단계 | 행동 | 기대 결과 |
|---|---|---|
| 1 | 공격 페이지를 연다 | 415 JSON이 보인다 |
| 2 | 앱 홈으로 간다 | 헤더가 "사용자 B"로 바뀌지 않는다 |

**수정 전 결과**: 2026-11-17 Chromium 157과 WebKit 27.2에서 "사용자 B"로 바뀌었다.

## AU13. 다른 사이트의 JSON fetch는 preflight에서 막힌다

- **근거**: 결정의 전제(API에 CORS 허용이 없다)
- **사전 조건**: 앱에 로그인했다. 다른 origin 페이지의 콘솔을 연다.
- **역할**: 피해자
- **우선순위**: High

| 단계 | 행동 | 기대 결과 |
|---|---|---|
| 1 | 콘솔에서 `fetch('<앱>/api/auth/test-login', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:'{"account":"A"}'})` | `Failed to fetch`(CORS 오류) |
| 2 | 앱 홈으로 간다 | 로그인 계정이 그대로다 |

## AU14. Content-Type 경계

- **근거**: 스토리 1, 3
- **사전 조건**: 더미 계정 하나가 있다. 터미널에서 `curl`로 보낸다.
- **역할**: 개발자
- **우선순위**: Medium

| 단계 | 행동 | 기대 결과 |
|---|---|---|
| 1 | `Content-Type: application/json; charset=utf-8`로 로그인 | 200, `Set-Cookie: modak.sid` |
| 2 | `Content-Type: text/plain`, 본문은 JSON 문자열 | 415, `Set-Cookie` 없음 |
| 3 | Content-Type 없이 빈 본문 | 415 |
| 4 | 테스트 계정이 꺼진 서버에 form `account=A` | 415(404보다 먼저 거절) |

## 커버리지

| 수락 기준 | 정상 | 경계 | 오류·보안 | 자동 테스트 |
|---|---|---|---|---|
| 스토리 1 form·text/plain·Content-Type 없음 → 415, 세션 유지 | — | AU14 | AU11 | `apps/api/test/auth.e2e.spec.ts` |
| 스토리 1 로그인 횟수 제한 유지 | — | — | — | `auth.e2e.spec.ts` "answers 429" |
| 스토리 2 form test-login → 415(켜짐·꺼짐) | — | AU14 4 | AU12 | `apps/api/test/test-accounts.e2e.spec.ts` |
| 스토리 3 JSON·charset 로그인 200 | AU10 | AU14 1 | — | `auth.e2e.spec.ts` "accepts a JSON login that names its charset" |
| 전제: cross-origin JSON은 preflight에서 막힌다 | — | — | AU13 | 없음(브라우저 동작) |

## 테스트 데이터

- 더미 피해자 계정, 더미 공격자 계정(로컬 가입). 실제 계정은 쓰지 않는다.
- 테스트 계정 A·B(`pnpm --filter @lsp/api db:seed`).
- 공격 페이지: 자동 제출 form 두 개. 앱과 다른 host(`127.0.0.1` 대 `localhost`)에서 `python3 -m http.server`로 연다.

```html
<form id="f" method="POST" action="http://localhost:5173/api/auth/test-login">
  <input name="account" value="B" />
</form>
<script>document.getElementById('f').submit()</script>
```
