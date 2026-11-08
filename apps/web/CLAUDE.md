# 웹 앱 (apps/web) UI 지침

UI를 만들거나 고치기 전에 이 파일을 읽는다. 여기 없는 결정이 필요하면 기존 화면과 같은 방식을 따르고, 새로 정한 것은 이 파일에 추가한다.

## 서비스 정체성

- 이름: **모닥**. 모닥불 둘레에 사람이 모이듯 방송 하나에 시청자가 모인다는 뜻이다. 화면 문구, `<title>`, 로고에 이 이름만 쓴다.
- 로고: `AppLayout`의 주황 불씨 도형 + "모닥" 글자. 이미지 파일 없이 CSS로 그린다.
- Twitch·치지직은 **레이아웃과 정보 배치만** 참고한다. 그 서비스의 로고, 색(Twitch 보라, 치지직 초록), 이름, 아이콘, 문구를 쓰지 않는다.

## 색·글꼴·간격

- 값은 `src/styles/tokens.css`의 CSS 변수로만 쓴다. 컴포넌트 CSS에 색 코드나 px 간격을 직접 적지 않는다. 새 값이 필요하면 토큰을 먼저 추가한다.
- 기본 테마는 어두운 배경 하나다(`--color-bg` #0f0f12). 밝은 테마는 만들지 않는다.
- 브랜드 색은 불씨 주황 `--color-brand`(#ff7a45). 주요 버튼(방송 시작, 로그인)과 링크 강조에만 쓴다.
- 상태 색: LIVE `--color-live`(빨강), 방송 전 `--color-ready`(파랑), 방송 종료 `--color-ended`(회색).
- 글꼴: Pretendard Variable(`pretendard` 패키지, OFL-1.1). `--font-sans`로 쓴다.
- 간격은 4px 단위 `--space-1`(4px)~`--space-8`(32px), 모서리는 `--radius-sm/md/lg`.

## 상태 배지

방송 상태는 `src/components/StatusBadge.tsx`로만 표시한다. 문구는 GLOSSARY를 따른다.

| 상태 | 문구 |
|---|---|
| `READY` | 방송 전 |
| `LIVE` | LIVE |
| `ENDED` | 방송 종료 |

"방송 중", "ON AIR", "종료됨", "대기" 같은 다른 문구를 쓰지 않는다.

## 레이아웃 골격

모든 화면은 `src/layout/AppLayout.tsx` 안에 그린다. 상단 바(높이 `--header-height` 56px: 로고, 메뉴, 오른쪽 끝에 로그인/사용자 메뉴) 아래에 본문이 오고, 본문 최대 폭은 `--content-max-width`(1440px)다.

| 화면 | 경로 | 배치 (참고: Twitch·치지직) |
|---|---|---|
| 방송 목록 | `/` | 카드 그리드 `repeat(auto-fill, minmax(280px, 1fr))`. 카드 = 16:9 썸네일 영역(왼쪽 위에 상태 배지) + 제목 + 스트리머 이름. LIVE 먼저, 그다음 방송 종료 |
| 시청 | `/broadcasts/:id` | 넓은 화면: 왼쪽 16:9 플레이어, 아래에 제목·스트리머·상태 배지·설명. 설명 아래에 소유자에게만 수정·삭제 버튼(`OwnerActions`, 삭제는 한 번 더 확인, LIVE면 삭제 대신 안내). 오른쪽 열은 댓글(P1) 자리. 좁은 화면: 플레이어 → 정보 → 댓글 세로 배치 |
| 스트리머 대시보드 | `/studio` | 내 방송 목록(방송 전 포함)과 방송 만들기 버튼 |
| 방송 만들기 | `/studio/new` | 가운데 정렬 카드 하나(제목, 설명). 만들면 `/studio`로 간다 |
| 방송 수정 | `/studio/broadcasts/:id/edit` | 방송 만들기와 같은 카드(`BroadcastForm`). 소유자가 아니면 "권한이 없습니다". 저장하면 상세로, 삭제하면 `/studio`로 간다 |
| 송출 | `/studio/broadcasts/:id` | 미리보기 + 송출 사전 점검(레벨 미터 2개) + 시작·종료·마이크 음소거 |
| 로그인·회원가입 | `/login`, `/signup` | 가운데 정렬 카드 하나. 테스트 계정 원클릭 로그인 버튼 |

경로는 해당 이슈에서 바꿔도 되지만, 바꾸면 이 표도 고친다. 모바일 송출 화면은 폭 360px에서 버튼이 엄지로 닿도록 아래쪽에 둔다.

## 스타일링: CSS Modules

- 컴포넌트마다 `Foo.module.css`를 옆에 둔다. 전역 CSS는 `src/styles/global.css`(리셋, body, 글꼴)와 `tokens.css`만 쓴다.
- Tailwind나 CSS-in-JS 라이브러리를 들이지 않는다.
- 이유: Vite가 추가 설정 없이 지원하고, 의존성이 늘지 않으며, 색·간격을 토큰 한 곳에서 바꿀 수 있다. Tailwind는 설정 파일과 빌드 플러그인이 늘고, 토큰을 Tailwind 설정과 CSS 변수 두 곳에서 관리하게 된다.

## 라우팅: React Router (선언형)

- `react-router`의 `<Routes>`/`<Route>`를 `src/AppRoutes.tsx` 한 곳에 모은다. `main.tsx`가 `BrowserRouter`로 감싸고, 테스트는 `MemoryRouter`로 감싼다.
- 새 화면은 `src/pages/<Name>Page.tsx`에 만들고 `AppRoutes`의 `AppLayout` 아래에 등록한다.

## API 호출

- `src/api.ts`의 `apiFetch<T>(path, init)`만 쓴다. `path`는 `/api` 뒤의 경로다(`apiFetch('/broadcasts')` → `GET /api/broadcasts`).
- 로그인은 쿠키 세션이라 `apiFetch`가 항상 `credentials: 'include'`를 붙인다. 토큰을 localStorage에 두지 않는다.
- 2xx가 아니면 `ApiError`(`status` 포함)를 던진다. 401이면 로그인 화면으로, 403이면 "권한이 없습니다" 안내로 처리한다.
- 화면을 열 때 데이터를 읽는 GET은 `src/use-api.ts`의 `useApi<T>(path)`를 쓴다. `loading`, `loaded`(`data`), `failed`(`error`) 중 하나를 돌려준다.
- 로그인이 필요한 화면은 `AppRoutes`에서 `<Route element={<RequireAuth />}>` 아래에 둔다. 비로그인 방문자는 로그인 화면으로 가고, 로그인하면 원래 경로로 돌아온다.
- 로그인 상태는 `src/auth/auth-context.ts`의 `useAuth()`로 읽는다. `state.status`는 `loading`(첫 `GET /api/auth/me` 응답 전), `anonymous`, `authenticated`(`state.user`) 중 하나다. 화면마다 `me`를 다시 부르지 않는다.
- 개발 중에는 Vite dev proxy가 `/api`를 `http://localhost:${API_PORT}`(기본 3000)로 넘긴다. 그래서 웹과 API가 같은 출처로 보여 쿠키가 그대로 붙는다.

## 문구

- 화면 문구는 한국어, 존댓말 평서문으로 쓴다("방송이 끝났습니다").
- GLOSSARY 용어를 쓴다: 방송, 스트리머, 시청자, 송출. "스트림", "채널", "방송자", "호스트"를 쓰지 않는다.

## 확인

UI를 바꾸면 `pnpm --filter @lsp/web dev`로 띄워 Playwright로 실제 화면을 확인하고 스크린샷을 남긴다.
