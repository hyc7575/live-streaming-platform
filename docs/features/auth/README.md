# 인증

회원가입·로그인·로그아웃, 세션 유지, 테스트 계정 원클릭 로그인.

- 우선순위: P0
- 상태: 구현 완료

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.1 "인증" 행
- §7.9 세션 쿠키, §7.10 A3(세션 저장소)
- §8.2 소셜 로그인·비밀번호 찾기·이메일 인증은 하지 않는다
- PRE-MORTEM T10

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #3 | #24 | 회원가입·로그인·로그아웃과 세션 유지 |
| #5 | #29 | 테스트 계정 원클릭 로그인 |
| #25 | #39 | https가 아닌 요청의 세션 시작을 403으로 거절 |
| #78 | #81 | 401 응답 때 로그인 상태를 비로그인으로 바꾼다 |
| #214 | #222 | 로그인·테스트 계정 로그인은 JSON만 받는다(login CSRF, 아니면 415) |

## 코드

- api: `apps/api/src/auth/`
  - `json-only.guard.ts`: 세션을 시작하는 라우트의 JSON 전용 규칙(#214)
- web: `apps/web/src/auth/`
- web: `apps/web/src/pages/LoginPage.tsx`, `SignupPage.tsx`, `TestAccountLogin.tsx`

## 확인

- 시나리오: [SCENARIOS.md](./SCENARIOS.md) (기기별 체크리스트)
- login CSRF(#214): [STORIES-login-csrf.md](./STORIES-login-csrf.md), [SCENARIOS-login-csrf.md](./SCENARIOS-login-csrf.md)
- 인수 시나리오: `PRD.md` §8.3 0, 1
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 0절, "테스트 계정 원클릭 로그인"
