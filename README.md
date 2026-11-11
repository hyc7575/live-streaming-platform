# Lime: 실시간 방송 플랫폼

브라우저로 PC 화면이나 모바일 카메라를 송출하고, 시청자는 로그인 없이 보는 서비스다.

## 심사자용 확인

- 서비스: https://lsp-live.duckdns.org
- 테스트 계정: 홈이나 로그인 화면의 "테스트 계정으로 로그인"에서 "스트리머 A" 또는 "사용자 B"를 누른다. 비밀번호를 입력하지 않는다.
- 권장 환경: PC Chrome + 휴대폰 1대. Edge, Windows, 휴대폰 브라우저 앱(Android Chrome, iOS Safari)은 미검증이다. 확인한 환경은 [지원 환경](#지원-환경)에 있다.

확인 순서 (약 10분). 각 줄 끝의 링크가 자세한 절차다.

1. **PC 송출**: PC에서 "스트리머 A" → "방송 만들기" → 제목 입력 → "만들기"를 누르면 송출 화면이 열린다. 다른 탭에서 소리 나는 영상을 재생해 둔다. "화면 공유" → 공유 창의 "Chrome 탭"에서 그 탭을 고르고 "탭 오디오와 함께 공유"를 켠다 → "방송 시작" → "송출 중입니다. 시청자가 방송을 볼 수 있습니다."가 보인다. [PC 화면 송출](#pc-화면-송출-13)
2. **휴대폰 시청**: 휴대폰에서 로그인하지 않고 서비스 주소 → "LIVE" 탭 → 방송 카드를 누른다. "방송을 불러오는 중입니다"가 잠시 보인 뒤 화면, 탭 소리, 마이크 소리가 함께 나온다. 소리가 꺼져 있으면 "소리 켜기"를 누른다. [송출에서 시청까지](#3-송출에서-시청까지-10)
3. **권한 거절**: PC 시크릿 창에서 "사용자 B" → A의 방송을 연다. 수정·삭제·종료 버튼이 없고 "팔로우"만 있다. 주소의 `/broadcasts/`를 `/studio/broadcasts/`로 바꿔 열면 "권한이 없습니다"가 보인다. [방송 수정·삭제와 인가 매트릭스](#2-방송-수정삭제와-인가-매트릭스)
4. **종료**: A의 송출 화면에서 "방송 종료" → "종료하기"를 누르면 "방송을 종료했습니다."가 보인다. 휴대폰 시청 화면은 10초 안에 "방송이 끝났습니다."로 바뀐다. [방송 종료](#4-방송-종료-11)
5. **다시보기**: 같은 시청 화면에 "다시보기를 준비하는 중입니다."가 보이고, 새로고침하지 않아도 다시보기 플레이어로 바뀐다. 방송 목록의 "다시보기" 탭에도 이 방송이 있다. [녹화·다시보기](#7-녹화다시보기-19)
6. **댓글 작성·수정·삭제**: "사용자 B"로 방송 목록의 "방송 종료" 탭 → "끝난 방송 예시: 댓글을 남겨 보세요"를 연다. "댓글" 탭에서 댓글을 쓰고, 내 댓글의 "수정"·"삭제"를 누른다. 방송 중에는 같은 자리가 채팅이다. [채팅과 댓글](#6-채팅과-댓글-18-91)
7. **모바일 송출**: 휴대폰에서 "스트리머 A" → "방송 만들기" → "만들기" → "카메라 켜기" → 카메라·마이크 허용 → "방송 시작". PC에서 그 방송을 열어 본다. 휴대폰에서 "후면 카메라로 전환"을 누르면 PC 화면도 바뀐다. "방송 종료" → "종료하기"로 끝낸다. [모바일 송출](#모바일-송출-15)

송출 중에 다른 화면으로 가려 하면 "송출 중입니다. 이 화면을 떠나면 방송이 끊깁니다."가 뜬다. "머무르기"를 누른다. "송출 서버에 연결하지 못했습니다."가 뜨면 네트워크를 바꾸고 "다시 시도"를 누른다.

### 소리가 안 나올 때

- 공유 창에서 "Chrome 탭"을 고르고 "탭 오디오와 함께 공유"를 켠다. 창 공유와 macOS 전체 화면 공유에는 소리가 없다.
- Chrome으로 송출한다. Firefox와 Safari는 화면 소리를 공유하지 못한다.
- 송출 화면의 사전 점검을 본다. "화면 소리가 잡히지 않습니다"가 보이면 "다시 선택"을 누른다. [송출 사전 점검](#송출-사전-점검-14)

## 구성

| 경로 | 내용 |
|---|---|
| `apps/api` | NestJS API (TypeScript strict). 모든 경로는 `/api` 아래에 있다 |
| `apps/web` | React + Vite 웹 앱 (TypeScript strict). UI 지침은 `apps/web/CLAUDE.md` |
| `compose.yaml` | 로컬 개발용 PostgreSQL, OvenMediaEngine |
| `docs/` | PRD, pre-mortem, 작업 목록 |

## 기능 확인

기능 이슈가 끝날 때마다 확인 절차를 여기에 추가한다.

### 0. 회원가입·로그인·로그아웃과 세션 유지

자동 테스트는 `apps/api/test/auth.e2e.spec.ts`(실제 PostgreSQL)다. 다음을 확인한다.

- 가입 → 로그인 → `me` 200 → 로그아웃 → `me` 401
- 로그아웃 전 쿠키를 다시 보내도 401 (서버가 세션을 지운다)
- 앱 인스턴스를 닫고 새로 띄워도 같은 쿠키로 `me` 200 (재시작 후 유지)
- 쿠키 `HttpOnly`·`SameSite=Lax`, 운영 모드에서 https 프록시 뒤면 `Secure`
- 잘못된 비밀번호 401, 중복 이메일 409, 로그인 11번째 시도 429

화면에서 확인:

1. `http://localhost:5173`을 연다. 헤더 오른쪽에 "회원가입"과 "로그인"이 보인다.
2. "회원가입"에서 이메일, 닉네임, 비밀번호(8자 이상)를 넣고 "가입하기"를 누른다. 로그인 화면으로 넘어가고 이메일이 채워져 있다.
3. 비밀번호를 넣고 "로그인"을 누른다. 방송 목록으로 돌아가고 헤더에 닉네임과 "로그아웃"이 보인다.
4. 새로고침한다. 헤더에 닉네임이 그대로 있다.
5. API를 껐다 켠다(`pnpm dev` 재시작). 새로고침해도 닉네임이 그대로 있다. 세션이 PostgreSQL `session` 테이블에 있기 때문이다.
6. "로그아웃"을 누른다. 헤더가 "로그인"으로 바뀐다. 개발자 도구 콘솔에서 `fetch('/api/auth/me').then(r => r.status)`가 `401`이다.

API로 확인 (쿠키를 파일에 저장해 다시 쓴다):

```sh
API=http://localhost:3000/api
curl -s -X POST $API/auth/signup -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"password123","nickname":"스트리머A"}'
curl -s -c jar.txt -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"password123"}'
curl -s -b jar.txt $API/auth/me                    # 200, 사용자 정보
cp jar.txt old-jar.txt
curl -s -b jar.txt -X POST $API/auth/logout -o /dev/null -w '%{http_code}\n'   # 204
curl -s -b old-jar.txt $API/auth/me -o /dev/null -w '%{http_code}\n'           # 401
```

세션 쿠키 설정:

- `HttpOnly`, `SameSite=Lax`, 14일 유지. 이름은 `modak.sid`.
- `Secure`는 `NODE_ENV=production`일 때만 붙인다. 브라우저는 http로 받은 `Secure` 쿠키를 저장하지 않아서, 로컬 http 개발에서 켜면 로그인이 안 된다.
- API는 `trust proxy`를 1단(Caddy)으로 둔다. Caddy가 보낸 `X-Forwarded-Proto: https`로 https 요청임을 알고 `Secure` 쿠키를 발급하며, 요청 제한은 `X-Forwarded-For`의 클라이언트 IP로 센다. API 포트를 외부에 직접 열면 이 헤더를 위조할 수 있으니 Caddy 뒤에만 둔다.
- Caddy는 API 앞 1단에 바로 붙어야 하고, `reverse_proxy`가 `X-Forwarded-Proto`를 기본으로 넘긴다. 운영 모드에서 Caddy를 거치지 않고 API 포트로 로그인하면 쿠키 없는 200 대신 403과 "HTTPS 프록시(Caddy)를 거쳐 호출하세요" 메시지를 받는다. API 포트는 외부에 열지 않는다.
- 요청 제한: 로그인은 IP당 1분에 10번, 회원가입은 IP당 1시간에 20번. 넘으면 429. 서버 메모리에 세므로 API를 재시작하면 초기화된다.
### PC 화면 캡처·믹싱 (#21)

PC 스트리머의 화면, 화면 소리(탭 소리), 마이크를 브라우저에서 오디오 트랙 하나로 섞는다. 송출 화면(`/studio/broadcasts/:id`)의 "화면 공유"가 이 캡처를 쓰고, 송출은 아래 "PC 화면 송출 (#13)"에 있다.

자동 확인 (Google Chrome 필요, 가짜 마이크 사용):

```sh
pnpm --filter @lsp/web e2e            # headless. CI도 같은 명령을 돌린다
pnpm --filter @lsp/web e2e --headed   # 탭 소리 레벨까지 확인한다
```

테스트는 440Hz를 재생하는 탭을 열고, 송출 화면에서 "화면 공유"로 그 탭을 고른 뒤 다음을 확인한다. API 서버 없이 돌도록 로그인 정보와 방송 조회는 Playwright가 대신 답하고, 송출 토큰 요청에는 답하지 않는다. 그래서 "방송 시작"을 눌러도 "송출을 연결하는 중입니다."에 머물고 실제로 송출하지는 않는다.

- 미리보기 `<video>`의 스트림에 영상 트랙 1개, 오디오 트랙 1개가 있다.
- "방송 시작"을 누른 뒤 가짜 마이크의 비프음이 마이크 레벨에 잡히고, 섞인 출력 트랙에도 소리가 있다. 미터는 믹서의 AudioContext를 거치므로, 이것이 "방송 시작" 클릭에서 AudioContext가 재개됐다는 확인이기도 하다.
- "마이크 끄기"를 누르면 마이크 레벨이 0 근처(0.001 미만)로 떨어진다.
- "다시 선택"을 누르면 영상 트랙만 바뀌고 오디오 트랙은 1개로 유지된다.
- 캡처하던 탭을 닫으면(브라우저가 공유를 끝낸 경우) "화면 공유가 중지되었습니다."가 뜨고, 마이크·화면·출력 트랙이 모두 `ended`다.
- `--headed`에서만: 탭에서 나는 소리가 화면 소리 레벨에 잡힌다. headless Chrome은 소리 출력이 없어 캡처한 탭 소리가 무음이다.

사람이 확인하는 절차:

1. 3절 명령으로 API를 띄우고 `pnpm --filter @lsp/web dev`로 웹을 띄운다. Chrome에서 로그인해 방송을 만들고 송출 화면을 연다.
2. 다른 탭에서 소리가 나는 영상을 재생한다.
3. "화면 공유" → 공유 창의 "Chrome 탭"에서 그 탭을 고르고 "탭 오디오와 함께 공유"가 켜져 있는지 본 뒤 공유한다.
4. Chrome이 고른 탭으로 넘어가면 송출 화면 탭으로 돌아온다. "화면 소리가 잡히지 않습니다" 경고가 없고 두 레벨 미터가 움직이는지 본다.
5. "마이크 끄기"를 누르면 마이크 미터가 멈추는지 본다.
6. Chrome 상단의 "공유 중지"를 누르면 "화면 공유가 중지되었습니다."가 뜨고, 주소창의 마이크 표시가 꺼지는지 본다.

### 송출 사전 점검 (#14)

인수 시나리오 10: PC 송출에서 "오디오 공유"를 체크하지 않고 화면 선택 → 사전 점검 화면에 경고 + "다시 선택" 표시.

송출 화면에서 "화면 공유"로 화면을 고르면 미리보기 옆에 마이크·화면 소리 레벨 미터 2개와 점검 결과가 뜬다.

| 상황 | 화면에 보이는 것 |
|---|---|
| 화면 소리 트랙이 없다(탭 오디오 공유를 끔, 창 공유, macOS 전체 화면) | 빨간 경고 "화면 소리가 잡히지 않습니다…"와 테두리가 강조된 "다시 선택" |
| 화면 소리 트랙은 있지만 3초 넘게 조용하다 | 흐린 안내 "화면 소리가 아직 들리지 않습니다…" (소리가 나면 사라진다) |
| 마이크가 빠졌다(방송 시작 전) | 빨간 경고 "마이크 연결이 끊겼습니다…"와 "처음부터 다시" |
| 마이크가 빠졌다(송출 중) | 빨간 경고 "마이크 연결이 끊겼습니다. 지금은 화면 소리만 송출합니다." 송출을 끊지 않도록 "처음부터 다시"는 없다 |
| Firefox, Safari | 화면을 고르기 전부터 "이 브라우저는 화면 소리를 공유하지 못합니다…" |
| 모바일 브라우저(화면 공유 없음) | "화면 공유" 버튼 없이 "카메라 켜기"만 보인다 |
| Chrome·Edge가 아닌 Chromium(웨일, 오페라) | 흐린 안내 "화면 소리는 Chrome과 Edge에서만 확인했습니다…" |

"방송 시작"은 경고가 있어도 누를 수 있다. 화면 소리 없이 슬라이드만 송출하는 경우도 있어서다.

자동 확인 (`pnpm --filter @lsp/web e2e`, `apps/web/e2e/preflight.spec.ts`, 위 #21 테스트처럼 API 없이 송출 화면에서 돈다):

- 오디오 트랙이 없는 화면을 고르면 경고와 "다시 선택"이 뜬다. "다시 선택"으로 소리 있는 화면을 고르면 경고가 사라지고, 마이크(가짜 마이크 비프)와 화면 소리 미터가 둘 다 0.01을 넘는다.
- 무음 화면 소리는 안내만 뜨고 경고(`role="alert"`)는 없다.
- 마이크 트랙의 `ended`를 일으키면 경고가 뜨고, "처음부터 다시"로 마이크를 다시 받는다.
- 사용자 에이전트를 Firefox·Safari로 바꾸면 화면 소리 미지원 경고가 뜬다. 브라우저 판정 표는 `src/capture/screenAudioSupport.test.ts`다.
- headless Chrome은 캡처한 탭 소리가 무음이라, 이 테스트는 `getDisplayMedia`가 돌려준 오디오 트랙을 지우거나(트랙 없음) 페이지가 만든 440Hz 트랙으로 바꾼다(소리 있음). 진짜 탭 소리는 `pcCapture.spec.ts`의 `--headed` 실행이 확인한다.

사람이 확인하는 절차 (Chrome):

1. 위 #21의 1번처럼 송출 화면을 연다. 다른 탭에서 소리 나는 영상을 재생한다.
2. "화면 공유" → 공유 창의 "Chrome 탭"에서 그 탭을 고르고 **"탭 오디오와 함께 공유"를 끈 채** 공유한다.
3. 송출 화면 탭으로 돌아온다. "화면 소리가 잡히지 않습니다"와 강조된 "다시 선택"이 보인다.
4. "다시 선택" → 같은 탭을 고르고 이번에는 "탭 오디오와 함께 공유"를 켠다. 경고가 사라지고 화면 소리 미터가 움직인다. 마이크에 말하면 마이크 미터도 움직인다.
5. Firefox나 Safari로 송출 화면을 연다. "이 브라우저는 화면 소리를 공유하지 못합니다"가 보인다.

### 1. 방송 생성·공개 목록·내 방송·상세

인수 시나리오 1: 비로그인으로 목록 진입 → 방송 생성 버튼 클릭 → 로그인 페이지로 이동 (API는 401).

자동 테스트는 `apps/api/test/broadcasts.e2e.spec.ts`(실제 PostgreSQL)와 `apps/web/src/broadcast-pages.test.tsx`다. 다음을 확인한다.

- 비로그인 생성 401(저장되지 않음), 로그인 생성 201 + `READY`, 제목 누락·공백·100자 초과와 설명 2000자 초과는 400
- 공개 목록은 `LIVE` → `READY` → `ENDED` 순서다. `READY`는 만든 지 24시간 안인 것만 나온다(#90)
- `?status=LIVE`, `?status=READY`, `?status=ENDED` 필터. 그 밖의 값은 400
- 내 방송은 내 방송만 상태와 관계없이 보여 주고, 비로그인은 401
- 상세는 누구나 `READY`·`LIVE`·`ENDED`를 200으로 받는다. 없는 id와 형식이 잘못된 id는 모두 404
- 화면: 비로그인으로 "방송 만들기"를 누르면 로그인 화면, 로그인하면 만들기 화면으로 돌아옴, 내 방송의 `READY`는 "방송 준비 중", `READY` 상세는 "방송 준비 중입니다."

화면에서 확인:

1. 로그아웃 상태로 `http://localhost:5173`을 연다. "방송 목록"과 전체/LIVE/방송 준비 중/방송 종료/다시보기 필터가 보인다.
2. "방송 만들기"를 누른다. 로그인 화면으로 간다.
3. 로그인한다(계정이 없으면 "회원가입"으로 가입한 뒤 로그인). "방송 만들기" 화면으로 돌아온다.
4. 제목과 설명을 넣고 "만들기"를 누른다. 새 방송의 송출 화면(`/studio/broadcasts/<id>`)으로 간다. 브라우저 뒤로 가기를 누르면 만들기 폼이 아니라 그 전 화면으로 간다. "내 방송"의 새 방송 카드에 "방송 준비 중" 배지가 있고, 카드를 누르면 송출 화면이 열린다.
5. 송출 화면의 "시청 화면 열기"를 누른다. 새 탭에 시청 화면이 열리고, 검은 플레이어 자리에 "방송 준비 중입니다."가 보인다. 주소를 복사해 시크릿 창에서 열어도 같다.
6. "방송 목록"으로 간다. 방금 만든 방송이 LIVE 카드 뒤, 방송 종료 카드 앞에 "방송 준비 중" 배지로 보인다.

LIVE·ENDED 방송은 송출 기능이 생기기 전까지 DB에서 직접 만든다.

```sh
docker compose exec postgres psql -U lsp -d lsp -c \
  "UPDATE \"Broadcast\" SET status='LIVE', \"startedAt\"=now() WHERE title='<제목>'"
```

API로 확인 (0절 마지막 명령이 `jar.txt`의 세션을 로그아웃으로 지웠으므로, 같은 계정으로 다시 로그인해 쿠키를 새로 받는다):

```sh
API=http://localhost:3000/api
curl -s -c jar.txt -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"password123"}'   # 200, 0절에서 만든 계정
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/broadcasts \
  -H 'Content-Type: application/json' -d '{"title":"첫 방송"}'          # 401
curl -s -b jar.txt -X POST $API/broadcasts -H 'Content-Type: application/json' \
  -d '{"title":"첫 방송","description":"설명"}'                          # 201, status READY
curl -s $API/broadcasts                    # LIVE → 24시간 안의 READY → ENDED
curl -s "$API/broadcasts?status=READY"     # 24시간 안의 READY만
curl -s "$API/broadcasts?status=LIVE"      # LIVE만
curl -s -b jar.txt $API/me/broadcasts      # 내 방송 (READY 포함)
curl -s $API/broadcasts/<id>               # 상세, 없으면 404
```

### 방송 목록 검색 (#64)

방송 목록 위 검색창에 제목이나 스트리머 닉네임 일부를 넣으면 맞는 카드만 남는다. 이미 받아 온 목록을 브라우저에서 거르므로 API·DB는 그대로다(PRD §7.1).

규칙:

- 거르기는 현재 탭(전체·LIVE·방송 종료·다시보기)의 목록 안에서 한다. 부분 일치이고 대소문자와 앞뒤 공백은 무시한다.
- 검색어는 주소의 `?q=`에 남는다. 탭을 바꾸거나 새로고침해도, 주소를 공유해도 같은 검색어로 열린다. 입력은 history를 쌓지 않는다(`replace`).
- 맞는 방송이 없으면 "'<검색어>'와 맞는 방송이 없습니다."와 "검색어 지우기" 버튼이 보인다. 목록 자체가 비어 있으면 탭의 빈 문구가 그대로 보인다.

한계: 공개 목록 API는 최대 100개(`PUBLIC_LIST_LIMIT`)만 주므로, 그보다 오래된 방송은 검색되지 않는다. 공모전 규모(수십 개)에서는 문제가 없다. 넘어서면 서버 검색(`GET /broadcasts?q=`)으로 옮긴다.

자동 테스트:

- `apps/web/src/broadcast-pages.test.tsx`: 제목·닉네임 거르기(대소문자·공백 무시), `?q=` 복원과 탭 이동 뒤 유지, 맞는 방송 없음 문구와 "검색어 지우기", 빈 목록이면 기존 빈 문구.
- `apps/web/e2e/listSearch.spec.ts` (API는 Playwright가 대신 응답): 빠른 입력과 한글 조합 입력이 빠지지 않음, 입력해도 history가 늘지 않음, 1280px·360px에서 거르기와 "검색어 지우기", 360px에서 검색창이 한 줄을 다 씀. `SCREENSHOT_DIR=<폴더>`를 앞에 붙이면 `1280-list.png`, `1280-filtered.png`, `1280-no-match.png`와 같은 이름의 `360-*.png`를 남긴다.

```sh
pnpm --filter @lsp/web e2e listSearch.spec.ts
```

화면에서 확인 (1절처럼 LIVE·방송 종료 방송을 몇 개 만들어 둔다):

1. "방송 목록"을 연다. 필터 탭 위에 검색창이 있다.
2. 어떤 방송 제목의 일부를 대문자로 바꿔 넣는다. 그 방송만 남고 주소에 `?q=`가 붙는다.
3. "방송 종료" 탭을 누른다. 검색어가 그대로 있고 방송 종료 중 맞는 방송만 보인다.
4. 새로고침한다. 같은 검색어와 결과가 보인다. 뒤로 가기를 누르면 "전체" 탭으로 돌아간다(입력한 글자마다 돌아가지 않는다).
5. 스트리머 닉네임 일부를 넣는다. 그 스트리머의 방송만 남는다.
6. 없는 단어를 넣는다. "'<검색어>'와 맞는 방송이 없습니다."와 "검색어 지우기"가 보인다. 누르면 검색창이 비고 목록이 돌아온다.
7. 폭을 360px로 줄인다. 검색창이 한 줄을 다 쓴다.

### 방송 준비 중 노출 (#90)

만든 지 24시간 안의 `READY` 방송을 공개 목록에 "방송 준비 중"으로 올린다. 시청자가 시작 전부터 목록에서 들어와 기다릴 수 있다. 24시간이 지난 `READY`는 공개 목록에서만 빠지고 "내 방송"에는 남는다. 자동 종료·삭제는 하지 않는다. 팔로우 목록은 지금처럼 `LIVE`만 보인다.

자동 테스트는 `apps/api/test/broadcasts.e2e.spec.ts`(순서, 24시간 경계를 가짜 시계로 넘기기, 100개 상한, `?status=READY`), `apps/api/test/follows.e2e.spec.ts`(팔로우 목록에 `READY` 없음), `apps/web/src/broadcast-pages.test.tsx`(탭·검색·빈 문구·배지·안내)다.

화면에서 확인:

1. 로그인해 방송을 하나 만든다. 송출 화면은 닫아도 된다.
2. 시크릿 창에서 `/`를 연다. 새 방송 카드가 LIVE 카드 뒤, 방송 종료 카드 앞에 "방송 준비 중" 배지로 보인다. 대기 이미지가 없으면 첫 글자 그림, 있으면 대기 이미지다.
3. "방송 준비 중" 탭을 누른다. 주소가 `/?status=READY`가 되고 준비 중인 방송만 보인다. 없으면 "준비 중인 방송이 없습니다."
4. 카드를 누른다. 시청 화면 플레이어 자리에 "방송 준비 중입니다."가 보인다. 대기 이미지가 없으면 검은 화면, 있으면 대기 이미지 위에 안내가 보인다.
5. 스트리머 창에서 송출을 시작한다. 시크릿 창은 새로고침 없이 10초 안에 플레이어로 바뀐다.

### 목록 카드 기본 그림·방송 준비 중 안내·경과 시간·링크 복사 (#61)

업로드 없이 제목·상태·`startedAt`만으로 목록 카드와 시청 화면의 빈 곳을 채운다. 웹만 바꾸고 API는 그대로다.

자동 테스트는 `apps/web/src/broadcast-pages.test.tsx`, `apps/web/src/elapsed.test.ts`(가짜 타이머), `apps/web/e2e-stack/readyToLive.spec.ts`(실제 OME)다. 다음을 확인한다.

- 카드는 제목 첫 글자를 상태색 면 위에 그리고, LIVE 카드는 경과 시간을 분 단위로 보이며 1분마다 늘린다
- `READY` 시청 화면은 안내 문구를 띄우고, 5초 상태 조회가 `LIVE`를 읽으면 새로고침 없이 플레이어로 바뀐다
- LIVE 시청 화면은 상태 배지 옆 경과 시간(`H:MM:SS`, 1시간 미만은 `M:SS`)을 1초마다 늘린다. `<time dateTime>`에 시작 시각이 있고 `aria-live`는 없다
- "링크 복사"는 성공하면 2초 동안 "복사했습니다"로 바뀌고, 권한 거부나 비보안 출처로 실패하면 주소를 담은 읽기 전용 입력창을 띄운다

```sh
pnpm --filter @lsp/web e2e:stack readyToLive   # 로컬 스택(API·OME)이 떠 있어야 한다
```

화면에서 확인:

1. 1절 4번처럼 방송을 만들고, 시크릿 창에서 시청 화면을 연다. 검은 플레이어 자리에 안내 문구가 보인다.
2. 스트리머 창에서 송출 화면을 열고 "카메라 켜기" → "방송 시작"을 누른다. 시크릿 창은 새로고침하지 않아도 10초 안에 플레이어로 바뀐다.
3. 시크릿 창에서 상태 배지 옆 경과 시간이 1초마다 늘어난다. "방송 목록"의 이 방송 카드에는 오른쪽 아래에 "방금 시작" 또는 "N분"이 보인다.
4. 시청 화면에서 "링크 복사"를 누른다. 버튼이 2초 동안 "복사했습니다"로 바뀌고, 붙여 넣으면 이 화면 주소다. 휴대폰에서 LAN 주소(`http://192.168…`, 비보안 출처)로 열고 누르면 주소가 선택된 입력창이 뜬다.

### 송출 화면 캡처 썸네일 (#62)

송출 화면이 미리보기를 30초마다 한 장 캡처해 API에 올리고, 목록 카드가 그 이미지를 썸네일로 보인다. 방송이 끝나면 마지막 장면이 방송 종료 카드에 남는다. 서버는 영상을 디코딩하지 않는다(PRD §8.2).

이 기능은 `Broadcast.thumbnailUpdatedAt` 열을 새로 쓴다. 이 변경을 받은 뒤에는 다음을 한 번 한다.

```sh
pnpm --filter @lsp/api db:migrate   # 마이그레이션 적용
docker compose up -d thumbnails      # 썸네일 정적 서버 (127.0.0.1:8091)
```

흐름:

1. 송출 화면(`publish/thumbnailCapture`)이 송출이 연결되면 바로 한 장, 이후 30초마다 미리보기 `<video>`를 가로 480px canvas에 그려 JPEG(품질 0.7)으로 만든다. 전면 카메라 미리보기의 좌우 반전은 CSS로만 하므로 캡처는 시청자가 보는 방향이다. 캡처·업로드가 실패해도 화면에는 아무것도 띄우지 않고 다음 주기에 다시 한다.
2. `PUT /api/broadcasts/:id/thumbnail`(multipart, 필드 `image`)이 받는다. 검사 순서는 401(비로그인) → 404·403(없는 방송·남의 방송) → 429(방송당 10초에 한 번) → 400(512KB 초과, 매직 바이트가 JPEG이 아님, 파일 없음) → 409(`LIVE`가 아님)다.
3. API는 `THUMBNAILS_DIR/<방송 id>/live.jpg`(기본 저장소 루트의 `thumbnails/`)에 임시 파일을 쓴 뒤 rename으로 바꾼다. 응답의 `thumbnailUrl`은 `/thumbnails/<id>/live.jpg?v=<업로드 시각>`이고, 올린 적이 없으면 `null`이다.
4. 개발에서는 compose의 `thumbnails` 정적 서버가, 운영에서는 Caddy가 내주고 Vite가 `/thumbnails`를 그리로 넘긴다. 둘 다 `X-Content-Type-Options: nosniff`를 붙이고 쓰는 중인 `*.tmp`를 숨긴다.
5. 목록은 30초마다 다시 읽는다. 카드는 `thumbnailUrl`이 있으면 이미지를, 없거나 이미지가 깨지면 제목 첫 글자를 그린다.
6. 방송을 지우면 썸네일 폴더도 지운다. 썸네일은 DB 덤프 대상이 아니다.

자동 테스트:

- `apps/api/test/thumbnails.e2e.spec.ts` (실제 PostgreSQL, 임시 폴더, 가짜 시계): 올린 파일이 `thumbnailUrl` 경로와 같고 목록·상세·내 방송에 같은 URL이 나온다. 10초 뒤 다시 올리면 URL이 바뀌고 임시 파일이 남지 않는다. 종료 뒤에도 URL이 남는다. 401·403·404, `READY`·`ENDED`의 409, PNG·필드 없음·multipart 아님·512KB+1바이트의 400(정확히 512KB는 통과), 10초 안 두 번째 시도의 429와 10초 뒤 허용, 방송 삭제 때 폴더 삭제.
- `apps/api/test/authorization-matrix.e2e.spec.ts`: "썸네일 업로드" 행과 검사 순서. 형식이 틀린 시도도 10초 횟수에 들어가 바로 다음 시도는 429이고, 10초 뒤 `READY` 방송은 409다.
- `apps/web/src/publish/thumbnailCapture.test.ts`: 480px·비율 유지·JPEG 0.7, 반전된 미리보기도 변환 없이 그린다. 가짜 타이머로 켜면 바로, 30초마다 올리고 끄거나 화면을 떠나면 멈춘다. 업로드 실패는 던지지 않고 다음 주기에 다시 올린다.
- `apps/web/src/components/BroadcastThumbnail.test.tsx`, `broadcast-pages.test.tsx`, `api.test.ts`: 이미지(`alt=""`, `loading="lazy"`), 첫 글자 대체, 30초마다 목록 다시 읽기, FormData 본문에 `Content-Type`을 붙이지 않기.
- `apps/web/e2e-stack/thumbnail.spec.ts` (실제 OME, `e2e:stack`): 화면 공유와 카메라 송출 각각 LIVE 카드 이미지가 480px로 뜨고, 다음 캡처 뒤 바뀌고, 송출을 지켜보는 동안 시청 화면 재생이 끊기지 않으며, 종료 뒤 방송 종료 카드에 남는다. 지켜보는 시간은 `THUMBNAIL_SOAK_MS`(기본 65초)다.

```sh
THUMBNAIL_SOAK_MS=300000 pnpm --filter @lsp/web e2e:stack thumbnail --workers=1   # 이슈의 5분 확인
```

화면에서 확인:

1. 3절 1~3번대로 송출을 시작한다. 몇 초 안에 `thumbnails/<방송 id>/live.jpg`가 생긴다.
2. 시크릿 창에서 방송 목록을 연다. LIVE 카드에 송출 화면이 보이고, 30초 안팎으로 다음 장면으로 바뀐다. 전면 카메라로 송출하면 미리보기는 반전돼 있지만 카드는 시청 화면과 같은 방향이다.
3. 송출 화면에서 방송을 종료한다. 방송 종료 카드에 마지막 장면이 남는다. 썸네일을 올린 적 없는 방송은 첫 글자 그림이다.
4. 상세에서 방송을 삭제하면 `thumbnails/<방송 id>/`가 사라진다.

API로 확인:

```sh
curl -s http://localhost:3000/api/broadcasts | grep -o '"thumbnailUrl":"[^"]*"'   # /thumbnails/<id>/live.jpg?v=...
U=<위 thumbnailUrl>
curl -s -o /dev/null -D - "http://localhost:5173$U" | grep -i -E '^HTTP|content-type|nosniff'   # 200 image/jpeg, nosniff
```

### 기본 대기 이미지 (#63)

스트리머가 "내 채널" 화면(`/studio/channel`)에서 기본 대기 이미지 한 장을 올린다. 그 스트리머의 모든 방송 준비 중(`READY`) 카드와 시청 화면에 이 이미지가 보이고, 송출을 시작하면 캡처 썸네일(#62)로 바뀐다. 방송은 송출할 때마다 새로 만들므로 이미지는 방송이 아니라 사용자에 둔다.

이 기능은 `User.standbyImageExt`·`User.standbyImageUpdatedAt` 열을 새로 쓴다. 이 변경을 받은 뒤에는 `pnpm --filter @lsp/api db:migrate`를 한 번 한다. 저장과 서빙은 썸네일과 같은 폴더·정적 서버를 쓰므로 따로 띄울 것은 없다.

흐름:

1. `PUT /api/me/standby-image`(multipart, 필드 `image`)가 받고 `DELETE /api/me/standby-image`가 지운다. 로그인한 본인 것만 바꾸므로 비로그인 401 말고는 403 경우가 없다. 지우기는 이미지가 없어도 204다.
2. 2MB 이하 JPEG·PNG·WebP만 받는다. 형식은 파일 이름이나 `Content-Type`이 아니라 매직 바이트로 판정하고, 위반은 400이다. 썸네일(JPEG·512KB)과 대기 이미지의 형식·크기 상한은 `apps/api/src/images/image-rules.ts` 표 한 곳에 있다.
3. API는 `THUMBNAILS_DIR/users/<사용자 id>/standby.<jpg|png|webp>`에 임시 파일을 쓴 뒤 rename으로 바꾸고, 형식이 바뀌면 이전 파일을 지운다. 한 사용자의 올리기·지우기는 한 번에 하나씩 처리한다.
4. 방송 응답(목록·다시보기·상세·내 방송)과 `GET /api/auth/me`에 `standbyImageUrl`(`/thumbnails/users/<id>/standby.<확장자>?v=<올린 시각>`, 없으면 `null`)이 있다. 이미지를 바꾸면 `?v=`가 바뀌어 이전 그림이 캐시로 남지 않는다.
5. 카드 표시 순서: `READY`는 대기 이미지 → 제목 첫 글자. `LIVE`·`ENDED`는 캡처 썸네일 → 대기 이미지 → 제목 첫 글자. 대기 이미지는 잘리지 않게 검은 바탕에 `contain`으로 그린다.
6. 방송을 지워도 대기 이미지는 남는다.

자동 테스트:

- `apps/api/test/standby-image.e2e.spec.ts`: JPEG·PNG·WebP 업로드와 내주는 파일 비교, 정확히 2MB 통과, 확장자만 바꾼 GIF·텍스트·WEBP가 아닌 RIFF·2MB+1바이트·필드 없음·multipart 아님의 400, 401, 형식을 바꾸면 이전 파일 삭제와 `?v=` 변경, 동시 업로드 수렴, 업로드 뒤 만든 방송에도 같은 URL, 지우기 204(두 번째도 204), 방송을 지워도 이미지가 남는다.
- `apps/api/test/authorization-matrix.e2e.spec.ts`: "대기 이미지 등록·삭제" 행과 검사 순서(401 → 400 형식·400 크기).
- `apps/web/src/components/BroadcastThumbnail.test.tsx`, `channel-page.test.tsx`, `broadcast-pages.test.tsx`: 상태별 표시 순서와 로드 실패 때 다음 그림, 내 채널 화면의 업로드·브라우저 검사·400 문구·삭제, 시청 화면 방송 준비 중 대기 이미지.
- `apps/web/e2e-stack/standbyImage.spec.ts` (실제 OME, `e2e:stack`): 내 채널에서 PNG를 올린 뒤 WebP로 바꾸면 `?v=`가 바뀌고 이전 PNG는 404, 그 뒤 만든 방송의 카드와 시청 화면에 바로 보이고, 송출을 시작하면 카드가 캡처 썸네일로 바뀌며, 방송을 지워도 이미지가 남고, 지우면 `null`이 된다.

```sh
pnpm --filter @lsp/web e2e:stack standbyImage --workers=1
```

화면에서 확인:

1. 로그인하고 상단 "내 방송" → "내 채널" 탭을 연다. 미리보기 자리에 닉네임 첫 글자가 보인다.
2. "이미지 선택"으로 PNG·WebP·JPEG 중 하나를 고른다. 미리보기가 바뀌고 "삭제" 버튼이 생긴다. 2MB가 넘거나 다른 형식이면 올리지 않고 안내 문구를 띄운다.
3. "내 방송" 탭에서 방송을 만든다. 방송 준비 중 카드에 대기 이미지가 보인다. 시크릿 창에서 그 방송의 시청 화면을 열면 플레이어 자리에 대기 이미지가 깔리고 그 위에 안내 문구가 반투명 띠와 함께 보인다.
4. 송출을 시작한다. 시청 화면은 플레이어로 바뀌고, 방송 목록 카드는 캡처 썸네일로 바뀐다.
5. 내 채널에서 다른 이미지를 올리면 카드도 새 그림으로 바뀐다. "삭제" → "삭제하기"를 누르면 첫 글자 그림으로 돌아간다.

API로 확인:

```sh
curl -s -o /dev/null -w '%{http_code}\n' -X PUT http://localhost:3000/api/me/standby-image   # 401
curl -s -b <쿠키> -F image=@banner.png http://localhost:3000/api/me/standby-image -X PUT   # 200, standbyImageUrl
curl -s -b <쿠키> -F image=@note.txt\;filename=fake.png http://localhost:3000/api/me/standby-image -X PUT   # 400
```

### 테스트 계정 원클릭 로그인

심사자가 계정을 만들지 않고 버튼 하나로 **스트리머 A** 또는 **사용자 B**가 된다. A는 방송을 만드는 스트리머, B는 A의 방송에 대한 수정·종료가 거절(403)되는지 확인하는 다른 사용자다.

**공개 테스트 계정이다.** 서비스에 들어오는 누구나 버튼으로 A나 B가 될 수 있다. 심사용이라 운영 배포에서도 켠다. 개인 정보나 중요한 데이터를 두지 않는다.

준비 (한 번):

```sh
# .env에 추가한다. 비밀번호는 저장소에 올리지 않는다
TEST_ACCOUNTS_ENABLED=true
TEST_ACCOUNT_A_PASSWORD=<8자 이상>
TEST_ACCOUNT_B_PASSWORD=<8자 이상>

pnpm --filter @lsp/api db:seed   # API를 빌드하고 두 계정과 끝난 방송 예시를 만든다
```

- 시드는 스트리머 A의 끝난 방송 "끝난 방송 예시: 댓글을 남겨 보세요"도 만든다. 방송 중 채팅 3개와 종료 뒤 댓글 2개(사용자 B·스트리머 A)가 있다. 같은 제목의 A 방송이 이미 있으면 그대로 둔다.
- 시드는 몇 번을 돌려도 계정 2개로 끝난다. 이메일이 같으면 닉네임과 비밀번호를 환경변수 값으로 덮어쓴다. 비밀번호를 바꾸려면 값을 바꾸고 다시 돌린다.
- 비밀번호가 없거나 8자보다 짧으면 `Seed failed: TEST_ACCOUNT_A_PASSWORD is not set`처럼 알리고 아무것도 쓰지 않고 실패한다(종료 코드 1).
- 이메일·닉네임을 비우면 `streamer-a@modak.test`·`스트리머 A`, `user-b@modak.test`·`사용자 B`를 쓴다.
- `TEST_ACCOUNTS_ENABLED`를 바꾸면 API를 재시작한다.

화면에서 확인:

1. `http://localhost:5173/login`을 연다. 로그인 카드 아래에 "테스트 계정으로 로그인"과 "스트리머 A"·"사용자 B" 버튼이 있다.
2. "스트리머 A"를 누른다. 방송 목록으로 돌아가고 헤더에 "스트리머 A"와 "로그아웃"이 보인다.
3. "로그아웃" → 헤더의 "로그인" → "사용자 B"를 누른다. 헤더에 "사용자 B"가 보인다.
4. `TEST_ACCOUNTS_ENABLED`를 지우고 API를 재시작하면 로그인 화면에서 버튼 영역이 사라진다.

테스트 계정도 일반 계정이라 로그인 폼에 이메일과 `.env`의 비밀번호를 넣어도 로그인된다. 이 README에는 비밀번호를 적지 않는다(PRD §7.9). 버튼은 비밀번호 없이 동작하므로 심사자는 버튼만 쓰면 된다.

API로 확인:

```sh
API=http://localhost:3000/api
curl -s $API/auth/test-accounts                     # {"accounts":["A","B"]}, 꺼져 있으면 {"accounts":[]}
curl -s -c jar.txt -X POST $API/auth/test-login -H 'Content-Type: application/json' \
  -d '{"account":"A"}'                              # 200, A의 사용자 정보. 꺼져 있으면 404
curl -s -b jar.txt $API/auth/me                     # A
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/auth/test-login \
  -H 'Content-Type: application/json' -d '{"account":"C"}'   # 400
```

동작 방식:

- 버튼은 `POST /api/auth/test-login {"account":"A"|"B"}`를 부른다. 서버가 환경변수의 이메일로 계정을 찾아 세션을 만든다. 비밀번호가 브라우저나 웹 번들로 가지 않는다.
- `GET /api/auth/test-accounts`는 기능이 켜져 있고 시드된 계정만 돌려준다. 로그인 화면은 이 목록이 비면 버튼 영역을 숨긴다.
- 요청 제한은 일반 로그인과 같다(IP당 1분에 10번).
- 자동 테스트는 `apps/api/test/test-accounts.e2e.spec.ts`(실제 PostgreSQL)와 `apps/web/src/pages/LoginPage.test.tsx`다. 시드 두 번 실행 후 사용자 2명, A·B 로그인 후 `me`, 꺼짐 404, 잘못된 `account` 400, 응답과 로그에 비밀번호가 없는지, 버튼 표시·숨김을 확인한다. 비밀번호는 테스트가 실행마다 무작위로 만든다.

### 2. 방송 수정·삭제와 인가 매트릭스

인수 시나리오 2-1: A가 자기 방송(READY 또는 ENDED)의 제목을 수정 → 목록·상세에 반영 → 삭제 → 목록에서 사라짐.
인수 시나리오 4: 사용자 B가 A의 방송 수정·삭제 시도 → 403. UI에서는 버튼이 보이지 않고, API를 직접 불러도 거절된다. 종료 시도는 종료 기능(#11)이 생길 때 추가한다.

수정·삭제는 `로그인 확인 → 소유자 확인` 순서로 거른다(`LoggedInGuard` → `BroadcastOwnerGuard`). 비로그인은 방송을 찾기 전에 401, 로그인한 사용자가 없는 방송을 부르면 404, 남의 방송은 403이다. 소유자 확인이 본문 검증보다 먼저라서, 타인은 본문이 틀려도 400이 아니라 403을 받는다.

인가 매트릭스 (PRD §7.5 중 지금 있는 행). 자동 테스트는 `apps/api/test/authorization-matrix.e2e.spec.ts`(실제 PostgreSQL)이고, 이 표를 같은 모양의 테이블(`MATRIX`)로 들고 있다.

| 행위 | API | 비로그인 | 로그인(타인) | 소유자 |
|---|---|---|---|---|
| 방송 목록 조회 | `GET /api/broadcasts` | 200 | 200 | 200 |
| 방송 상세 조회 | `GET /api/broadcasts/:id` | 200 | 200 | 200 |
| 방송 생성 | `POST /api/broadcasts` | 401 | 201 | — |
| 방송 수정 | `PATCH /api/broadcasts/:id` | 401 | 403 | 200 |
| 방송 삭제 | `DELETE /api/broadcasts/:id` | 401 | 403 | 204 (LIVE면 409) |
| 내 방송 조회 | `GET /api/me/broadcasts` | 401 | 200 (자기 것만) | 200 |
| 송출 토큰 발급 | `POST /api/broadcasts/:id/publish-token` | 401 | 403 | 201 (ENDED면 409) |

- 표의 칸마다 대상 방송이 `READY`·`LIVE`·`ENDED`일 때를 모두 돌린다(20칸 × 3 = 60건).
- 거절된 칸(401·403·409)은 요청 뒤 `Broadcast` 테이블 전체가 요청 전과 같은지 확인한다.
- 허용된 칸은 효과를 API로 다시 읽어 확인한다. 수정 뒤 상세·내 방송·공개 목록에 새 제목이 보이고(`READY`는 원래 공개 목록에 없다), 본문에 함께 보낸 `status`는 무시된다. 삭제 뒤 상세는 404이고 내 방송과 공개 목록에서 사라진다.
- 순서 확인: 없는 방송과 형식이 틀린 id에 비로그인 401, 로그인 404. 틀린 본문에 비로그인 401, 타인 403, 소유자 400. 로그아웃한 소유자는 401.
- 아직 없는 행(종료, Webhook의 유예 중 재접속, 스트림 키, 댓글, 후원)은 `it.todo`로 남겨 테스트 출력에 todo로 보인다.

수정 규칙(`apps/api/test/broadcasts.e2e.spec.ts`): 보낸 필드만 바꾸고 생성과 같은 검증(제목 1~100자, 설명 2000자 이하, 앞뒤 공백 제거)을 한다. 빈 본문과 모르는 필드만 있는 본문은 400이다. `LIVE` 방송도 제목·설명은 고칠 수 있다.

LIVE 방송 삭제: PRD §7.4는 "서버가 먼저 종료 처리한 뒤 삭제"다. 종료 처리(미디어 서버의 송출 연결 끊기)는 #11에서 생기므로, 그 전까지 `LIVE` 삭제는 409 `방송을 종료한 뒤 삭제하세요.`로 거절한다.

화면에서 확인 (위 절의 테스트 계정 "스트리머 A"·"사용자 B"를 쓴다. B는 다른 브라우저나 시크릿 창에서 로그인한다. 직접 가입한 두 계정으로 해도 같다):

1. "스트리머 A"로 로그인해 방송을 만든다. 송출 화면의 "시청 화면 열기"로 상세를 연다(새 탭). 설명 아래에 "수정"과 "삭제"가 보인다.
2. "수정"을 누른다. 제목과 설명이 채워진 "방송 수정" 화면이 열린다. 제목을 바꾸고 "저장"을 누른다. 상세로 돌아오고 새 제목이 보인다. "내 방송" 카드도 새 제목이다.
3. 위 절의 `psql` 명령으로 이 방송을 `ENDED`로 바꾼다(`status='ENDED', "startedAt"=now(), "endedAt"=now()`). "방송 목록"에 새 제목으로 보인다.
4. "사용자 B" 창에서 같은 상세 주소를 연다. "수정"과 "삭제"가 보이지 않는다. 로그아웃 상태에서도 보이지 않는다. B가 `/studio/broadcasts/<id>/edit`을 직접 열면 "권한이 없습니다"가 보인다.
5. A 창에서 "삭제" → "삭제하기"를 누른다. "내 방송"으로 가고 카드가 없다. "방송 목록"에서도 사라졌다.
6. `LIVE`로 바꾼 방송의 상세에서는 "삭제" 대신 "송출 중인 방송은 종료한 뒤 삭제할 수 있습니다."가 보인다.

API로 확인 (테스트 계정 A·B로 쿠키를 새로 받는다. 앞 절에서 로그아웃한 `jar.txt`는 세션이 지워져 쓸 수 없다):

```sh
API=http://localhost:3000/api
curl -s -c a-jar.txt -X POST $API/auth/test-login -H 'Content-Type: application/json' \
  -d '{"account":"A"}' -o /dev/null
curl -s -c b-jar.txt -X POST $API/auth/test-login -H 'Content-Type: application/json' \
  -d '{"account":"B"}' -o /dev/null
ID=$(curl -s -b a-jar.txt -X POST $API/broadcasts -H 'Content-Type: application/json' \
  -d '{"title":"A의 방송"}' | sed -E 's/^\{"id":"([^"]+)".*/\1/')

# 비로그인 401, B 403. 그 뒤에도 제목은 그대로다
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH $API/broadcasts/$ID \
  -H 'Content-Type: application/json' -d '{"title":"뺏은 제목"}'                      # 401
curl -s -o /dev/null -w '%{http_code}\n' -b b-jar.txt -X PATCH $API/broadcasts/$ID \
  -H 'Content-Type: application/json' -d '{"title":"뺏은 제목"}'                      # 403
curl -s -o /dev/null -w '%{http_code}\n' -b b-jar.txt -X DELETE $API/broadcasts/$ID  # 403
curl -s $API/broadcasts/$ID                                                         # 제목 "A의 방송"

# A는 수정·삭제할 수 있다
curl -s -b a-jar.txt -X PATCH $API/broadcasts/$ID -H 'Content-Type: application/json' \
  -d '{"title":"고친 제목"}'                                                          # 200, 새 제목
curl -s -o /dev/null -w '%{http_code}\n' -b a-jar.txt -X DELETE $API/broadcasts/$ID    # 204
curl -s -o /dev/null -w '%{http_code}\n' $API/broadcasts/$ID                        # 404
```

### 3. 송출에서 시청까지 (#10)

인수 시나리오 1의 앞부분: 스트리머가 카메라·마이크를 송출하면 방송이 `LIVE`가 되고, 로그인하지 않은 시청자가 LL-HLS로 본다. PC 화면 송출은 아래 "PC 화면 송출 (#13)"에 있다. 종료는 아래 4절, 끊긴 송출의 유예와 정리는 5절에 있다.

흐름 (PRD §7.6):

1. 송출 화면(`/studio/broadcasts/:id`)이 `POST /api/broadcasts/:id/publish-token`을 부른다. 소유자만 받는다(비로그인 401, 타인 403). 같은 스트리머의 다른 방송이 `LIVE`면 409 `기존 방송을 종료하세요.`, 이 방송이 `ENDED`면 409다. 응답은 5분짜리 토큰이 붙은 같은 출처 경로 `/app/<방송 id>?direction=whip&transport=all&token=...`이다.
2. 브라우저가 OvenLiveKit으로 이 경로에 WHIP 송출을 연다(H.264 고정). 개발 중에는 Vite가 `/app`을 OME(`OME_HTTP_PORT`)로 넘긴다.
3. OME가 Admission Webhook으로 `POST /api/ome/admission`에 전체 URL을 보낸다. API는 `X-OME-Signature`(HMAC-SHA1, `OME_WEBHOOK_SECRET`)를 원본 바이트로 검증하고(틀리면 401), 토큰과 방송 상태를 보고 `READY`일 때만 `{"allowed":true}`를 돌려주며 조건부 update 한 번으로 `READY → LIVE`(`startedAt` 기록)로 바꾼다. 거절하면 OME가 WHIP에 401을 준다.
4. 시청 화면(`/broadcasts/:id`)은 `LIVE`면 `/app/<방송 id>/llhls.m3u8`을 재생한다. 송출 직후 약 10초 동안은 OME가 플레이리스트를 404로 주므로 "방송을 불러오는 중입니다"를 띄우고 2초마다 다시 시도한다.

한 스트리머의 `LIVE` 방송은 DB가 하나만 허용한다(`Broadcast_one_live_per_streamer` 부분 유니크 인덱스). 두 방송의 허가 요청이 동시에 와도 하나만 `LIVE`가 된다.

자동 테스트:

- `apps/api/test/publish.e2e.spec.ts` (실제 PostgreSQL, `pnpm test`): 토큰 발급 201·401·403·404·409(다른 방송 LIVE)·409(ENDED). Webhook은 서명 없음·위조·다른 키·본문을 바꾼 경우 401, 토큰 없음·변조·만료·다른 방송의 토큰 거절, `ENDED`·`LIVE` 거절, `READY` 허가 후 `LIVE`와 `startedAt`, 같은 스트리머의 두 번째 방송 거절, `closing`은 `{}`를 돌려주고 재접속 유예를 시작한다(5절).
- `apps/api/test/publish-token.spec.ts`, `admission.spec.ts`: 토큰·서명·판정 순수 함수.
- `apps/web/e2e-stack/publishToWatch.spec.ts`: 실제 OME까지 이어서 확인한다(아래).

실제 OME로 확인 (Google Chrome 필요, 가짜 카메라·마이크 사용). `.env`에 `OME_HOST_IP=127.0.0.1`과 `OME_WEBHOOK_SECRET`을 채운다.

```sh
docker compose up -d --wait            # PostgreSQL + OME (ome/Server.xml)
pnpm --filter @lsp/api db:migrate
pnpm --filter @lsp/api dev             # API :3000. OME가 host.docker.internal:3000으로 허가를 묻는다
pnpm --filter @lsp/web e2e:stack       # 웹 dev 서버가 없으면 띄운다. WEB_PORT를 바꿨으면 같은 값을 앞에 붙인다
```

`e2e:stack`은 CI의 `e2e` 작업에 들어가지 않는다(CI에는 OME가 없다). 아래 두 테스트와 4절의 종료 테스트, 5절의 비정상 종료 테스트를 돌린다.

- 새 계정으로 방송을 만들고 송출 화면에서 "카메라 켜기" → "방송 시작"을 누른다. "송출 중입니다."가 뜨고 `GET /api/broadcasts/:id`가 `LIVE`가 된다. 로그인하지 않은 새 브라우저 컨텍스트가 시청 화면을 열면 hls.js(`blob:` 주소)로 재생되고, `currentTime`이 늘고 `videoWidth`가 0보다 크다. 같은 스트리머가 두 번째 방송의 송출 화면에서 "방송 시작"을 누르면 "기존 방송을 종료하세요."가 뜬다.
- 토큰 없이, 엉터리 토큰으로, 다른 방송의 토큰으로 `/app/<id>?direction=whip...`에 WHIP을 보내면 모두 401이고 방송은 `READY` 그대로다.

`SCREENSHOT_DIR=<폴더>`를 앞에 붙이면 송출 화면과 시청 화면을 `publish-live.png`, `viewer-playing.png`로 남긴다.

화면에서 확인:

1. 위 명령으로 PostgreSQL, OME, API를 띄우고 `pnpm --filter @lsp/web dev`로 웹을 띄운다.
2. "스트리머 A"로 로그인해 방송을 만들고 상세로 간다. 설명 아래 "송출 화면"을 누른다.
3. "카메라 켜기"를 누르고 카메라·마이크를 허용한다. 미리보기가 보인다. "방송 시작"을 누른다. 몇 초 안에 "송출 중입니다. 시청자가 방송을 볼 수 있습니다."가 뜬다.
4. 시크릿 창(로그인 안 함)에서 "시청 화면 열기" 주소를 연다. "방송을 불러오는 중입니다"가 약 10초 보인 뒤 카메라 영상이 재생된다. 상태 배지는 LIVE다.
5. API 로그에 `PublishController`의 `... token=*** → {"allowed":true}` 한 줄이 남는다(토큰은 가린다).
6. A가 다른 방송을 하나 더 만들고 그 송출 화면에서 "방송 시작"을 누르면 "기존 방송을 종료하세요."가 뜬다.
7. 송출 화면에서 "방송 종료" → "종료하기"를 누른다. 이어지는 확인은 4절에 있다.

API로 거절 확인 (토큰이 없거나 틀리면 OME가 401을 준다):

```sh
ID=<READY 방송 id>
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/sdp' --data-binary $'v=0\r\n' \
  "http://localhost:3333/app/$ID?direction=whip&transport=all&token=bad"   # 401
curl -s http://localhost:3000/api/broadcasts/$ID                           # status "READY" 그대로
```

### 4. 방송 종료 (#11)

인수 시나리오 5, 9: 스트리머가 종료하면 송출이 끊기고, 시청 화면은 10초 안에 "방송이 끝났습니다."로 바뀌며, 같은 방송으로 다시 송출할 수 없다. 탭을 닫거나 네트워크가 끊긴 비정상 종료와 재접속 유예는 5절에 있다.

흐름 (PRD §7.4, §7.6):

1. 송출 화면에서 "방송 종료" → "종료하기"를 누른다. 브라우저가 먼저 PeerConnection을 닫고 송출에 쓴 트랙 복제본과 카메라·마이크 원본 트랙을 모두 멈춘 뒤 `POST /api/broadcasts/:id/end`를 부른다. 송출 중에 카메라나 마이크가 꺼지거나 브라우저의 "공유 중지"로 화면 공유가 끝나도 같은 API를 부른다.
2. API는 소유자만 받는다(비로그인 401, 타인 403, 없는 방송 404). `LIVE`를 `ENDED`로 바꾸고 `endedAt`을 기록한 **다음** OME 관리 API `DELETE /v1/vhosts/default/apps/app/streams/<방송 id>`로 송출 연결을 끊는다. 순서가 반대면 그 사이 재접속이 허가될 수 있다. OME의 404(송출 없음)는 성공으로 본다.
3. 이미 `ENDED`인 방송에 다시 부르면 200이고 `endedAt`은 그대로다. OME DELETE는 다시 보낸다. 그래서 OME 호출이 실패해 502를 받았더라도 다시 부르면 끊긴다. `READY` 방송은 409 `아직 시작하지 않은 방송은 종료할 수 없습니다.`다.
4. 끊긴 송출자가 다시 접속하면 Admission Webhook이 `ENDED`를 보고 `{"allowed":false,"reason":"broadcast ended"}`로 거절한다. 송출 토큰 발급도 409다.
5. 시청 화면은 방송 상태를 5초마다 조회하고, hls.js 치명적 오류(네이티브 HLS는 `<video>`의 `error`·`stalled`) 때도 바로 조회한다. `ENDED`면 플레이어를 내리고 "방송이 끝났습니다."를 띄운다.
6. `LIVE` 방송 삭제는 이제 409가 아니다. 같은 방식으로 종료한 뒤 삭제한다(204).
7. 지금 송출하지 않는 곳에서도 종료할 수 있다. 상세 화면의 소유자 버튼에 `LIVE`일 때만 "방송 종료"가 있다. 새로고침했거나 송출이 끊긴 송출 화면에도 "방송 종료"가 남는다. 어느 쪽이든 같은 API를 부르고, 송출 중이던 탭은 연결이 끊기면 상태를 다시 읽어 "방송이 종료되었습니다."를 띄운다.

자동 테스트:

- `apps/api/test/authorization-matrix.e2e.spec.ts`: "방송 종료" 행. 비로그인 401, 타인 403, 소유자는 `READY` 409, `LIVE`·`ENDED` 200. 거절된 칸은 DB와 OME 호출이 모두 그대로다. 허용된 칸에서는 OME 호출 시점에 DB가 이미 `ENDED`다. "방송 삭제"의 소유자 칸은 모든 상태에서 204다.
- `apps/api/test/broadcasts.e2e.spec.ts`: OME 호출이 실패하면 502이고 DB는 `ENDED`다. 다시 부르면 200이고 `endedAt`이 같다. `LIVE` 삭제도 같은 방식으로 다시 시도하면 204다.
- `apps/api/test/publish.e2e.spec.ts`: Webhook으로 `LIVE`가 된 뒤 종료하면, 새로 받은 유효한 토큰으로 재접속해도 `broadcast ended`로 거절된다.
- `apps/api/test/ome-api.spec.ts`: OME 관리 API 클라이언트의 경로와 `Basic` 인증 헤더. 200·404는 성공이고 401·500·연결 실패는 오류다.
- `apps/web/e2e-stack/publishToWatch.spec.ts` (실제 OME): 송출하고 시청자가 재생하는 것을 확인한 뒤 종료한다. 시청 화면은 "방송이 끝났습니다."로 10초 안에 바뀌고 플레이어가 사라진다. 송출 화면의 원본 트랙과 복제본은 모두 `ended`다. 종료 전에 받아 둔 토큰으로 WHIP을 다시 보내면 401이고 토큰 재발급은 409다. 다른 테스트는 송출 중에 상세 화면에서 종료하고, 송출 탭이 "방송이 종료되었습니다."로 바뀌는 것을 확인한다.
- `apps/web/e2e-stack/playerControls.spec.ts` (실제 OME, #56): 송출 카메라를 `Date.now()`를 흑백 블록으로 그린 캔버스로 바꾸고, 시청자가 영상에서 그 값을 읽어 송출 시각과 비교해 지연을 잰다. 시청 플레이어에 `controls`가 없고, 일시정지 30초 뒤 "라이브로 이동"이 보이며, 누르면 지연이 5초 이하로 돌아오는지 확인한다. 3초 입력이 없으면 컨트롤이 숨고, 볼륨은 새로고침 뒤 남고 음소거는 남지 않으며, 360px 터치 화면의 첫 탭은 일시정지하지 않고, 소유자는 음소거로 시작해 "소리 켜기"가 보이고, 댓글 입력 중 Space·M이 플레이어에 먹지 않는다. 다른 스펙과 같이 `--workers=1`로 돌린다.

실제 OME로 확인: 3절의 명령에 더해 `.env`에 `OME_API_ACCESS_TOKEN`을 채운다. 이 값을 바꿨으면 `docker compose up -d ome`으로 OME를 다시 만든다. OME 관리 API는 `127.0.0.1:8081`에만 열린다.

화면에서 확인:

1. 3절 1~4번대로 송출을 시작하고 시크릿 창에서 시청 화면을 연다.
2. 송출 화면에서 "방송 종료"를 누른다. "방송을 종료할까요? 종료하면 이 방송은 다시 시작할 수 없습니다."가 뜬다. "종료하기"를 누른다.
3. 송출 화면에 "방송을 종료했습니다."가 뜨고 미리보기가 사라진다. 카메라 표시등이 꺼진다.
4. 시크릿 창은 10초 안에 "방송이 끝났습니다."로 바뀌고 상태 배지가 "방송 종료"가 된다.
5. 송출 화면 주소를 다시 열면 "종료된 방송입니다. 새 방송을 만드세요."가 뜬다.
6. 새 방송으로 송출을 시작한 뒤 다른 탭에서 상세 화면을 연다. "방송 종료" → "종료하기"를 누르면 상세는 "방송이 끝났습니다."로, 송출 탭은 "방송이 종료되었습니다."로 바뀐다.
7. 다른 방송으로 송출을 시작한 뒤 상세의 "삭제"를 누르면 "송출 중인 방송입니다. 삭제하면 방송을 종료하고 되돌릴 수 없습니다."가 뜬다. "삭제하기"를 누르면 송출 화면이 "방송이 종료되었습니다."로 바뀐다.

API로 확인 (`jar.txt`는 0절처럼 소유자로 로그인해 저장한 쿠키):

```sh
API=http://localhost:3000/api
ID=<LIVE 방송 id>
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/broadcasts/$ID/end              # 401 (비로그인)
curl -s -b jar.txt -X POST $API/broadcasts/$ID/end                                    # 200, "status":"ENDED"
curl -s -b jar.txt -o /dev/null -w '%{http_code}\n' -X POST $API/broadcasts/$ID/end   # 200 (다시 불러도 같다)
curl -s -b jar.txt -o /dev/null -w '%{http_code}\n' -X POST $API/broadcasts/$ID/publish-token   # 409
```

### 5. 비정상 종료와 재접속 유예 (#12)

인수 시나리오 8, 12: 송출 중에 탭을 닫으면 30초 유예 뒤 방송이 `ENDED`가 된다. 30초 안에 새로고침해 다시 시작하면 같은 방송이 `LIVE`로 이어진다. Webhook이 빠지거나 순서가 바뀌어도 송출 없는 `LIVE` 방송(좀비 방송, T8)이 남지 않는다.

이 기능은 `Broadcast.disconnectedAt` 열을 새로 쓴다. 이 변경을 받은 뒤에는 `pnpm --filter @lsp/api db:migrate`로 마이그레이션을 적용한다(실행 방법과 같은 명령).

흐름 (PRD §7.4):

1. 송출 연결이 끊기면 OME가 Admission Webhook에 `closing`을 보낸다. API는 `LIVE`이고 연결 중(`disconnectedAt`이 비어 있음)인 방송에만 끊긴 시각을 적고 `{}`를 돌려준다. 같은 `closing`이 두 번 와도 처음 시각이 남는다. 송출 중에 5분 토큰이 만료될 수 있으므로 `closing`에서는 토큰을 보지 않는다(본문은 OME가 서명한다).
2. 끊긴 지 30초 안에 같은 방송으로 송출을 다시 열면 Webhook이 허가한다. 방송 id와 `startedAt`은 그대로다. 30초가 지났으면 `broadcast ended`, 아직 연결 중이면 `broadcast already live`로 거절한다. 경계는 정확히 30초다(끊긴 시각이 지금 − 30초보다 뒤면 유예 중).
3. API가 30초마다 OME 관리 API `GET /v1/vhosts/default/apps/app/streams`로 받고 있는 스트림 목록을 읽어 DB의 `LIVE` 방송과 대조한다.
   - 목록에 있는데 끊긴 시각이 남아 있으면(재접속 뒤 늦게 온 `closing`) 지운다.
   - 목록에 없는데 연결 중으로 되어 있으면(`closing`이 빠짐) 지금부터 유예를 시작한다.
   - 목록에 없고 유예 30초를 넘겼으면 `ENDED`와 `endedAt`을 적는다.
4. OME 목록을 읽지 못하면(OME 중단, 401, 응답 모양이 다름) 그 회차는 DB를 하나도 바꾸지 않는다. 그대로 대조하면 모든 `LIVE` 방송이 끊긴 것으로 보이기 때문이다.
5. 유예를 넘겨 끝낼 때는 4절과 달리 OME `DELETE`를 보내지 않는다. 같은 회차에 읽은 목록에 없는 방송만 끝내므로 끊을 스트림이 없고, 그 뒤의 재접속은 DB가 먼저 `ENDED`라 Webhook이 거절한다.
6. 송출 화면은 탭을 닫거나 새로고침할 때(`pagehide`) WHIP 자원에 `keepalive` `DELETE`를 보낸다. OvenLiveKit의 기본 `DELETE`는 일반 fetch라 페이지가 내려갈 때 브라우저가 취소한다. 그러면 OME는 ICE 타임아웃이 지나서야 `closing`을 보낸다. 로컬 OME 실측으로 이 요청이 없으면 약 30.8초, 있으면 탭 닫기 0.6초, 새로고침 0.9초 뒤에 `closing`이 왔다. 이 요청이 없으면 새로고침 직후 "방송 시작"이 `broadcast already live`로 거절된다.

최악의 경우 걸리는 시간 (정리 주기와 유예가 모두 30초):

- 탭 닫기·새로고침 뒤 다시 시작하지 않음: `closing` 약 1초 + 유예 30초 + 다음 정리까지 최대 30초로, 약 61초 안에 `ENDED`가 된다. 시청 화면은 상태를 5초마다 조회하므로 최대 5초가 더 걸린다.
- 브라우저 강제 종료, 네트워크 끊김처럼 `pagehide` `DELETE`가 나가지 못한 경우: OME가 ICE 타임아웃(약 30초) 뒤에 `closing`을 보내므로 약 30초가 더 걸린다.
- `closing`이 빠진 경우: 스트림이 OME 목록에서 사라진 뒤 다음 정리(최대 30초)에서 유예를 시작하고, 그다음 정리에서 유예 30초가 차서 `ENDED`가 된다.

자동 테스트:

- `apps/api/test/reconnect-grace.e2e.spec.ts` (실제 PostgreSQL, 가짜 시계와 가짜 OME 목록): `closing` 뒤 29초 재접속 허가(같은 방송, `startedAt` 그대로), 30초 뒤 정리에서 `ENDED`(29초 정리에서는 그대로)와 그 뒤 재접속 거절, 같은 `closing` 두 번에 같은 행, `READY`·`ENDED`에 온 `closing`은 변화 없음, 재접속 뒤 늦게 온 `closing`을 정리가 지우고 그 뒤로 끝내지 않음, 정리 시작 뒤에 온 끊김은 다음 회차로 미룸, `closing` 없이 목록에서 빠진 방송은 첫 정리에서 유예 시작 후 30초 뒤 `ENDED`, OME 목록 실패 때 행 하나도 안 바뀜, 연결 중 두 번째 연결 거절, 유예가 지났지만 정리 전인 재접속 거절, 재접속 둘이 겹치면 하나만 허가, 재접속과 정리가 겹쳐도 결과가 하나(정확히 30초는 `ENDED`, 29.999초는 `LIVE`), 타이머가 스스로 정리를 돈다.
- `apps/api/test/authorization-matrix.e2e.spec.ts`: "OME 송출 연결 (Webhook 판정)" 행. 비로그인(토큰 없음)·타인(타인 id로 서명한 토큰)은 모든 상태에서 거절. 소유자는 `READY` 허용, `LIVE` 연결 중 거절, `LIVE` 유예 중 허용, `LIVE` 유예 초과 거절, `ENDED` 거절. 거절된 칸은 DB가 그대로다.
- `apps/api/test/publish.e2e.spec.ts`: `closing`이 유예를 시작한다(토큰이 만료돼도). 재생 연결이나 모르는 스트림의 `closing`은 아무것도 바꾸지 않는다.
- `apps/api/test/admission.spec.ts`: 판정 표. 29.999초는 재접속, 정확히 30초는 거절.
- `apps/api/test/ome-api.spec.ts`: 스트림 목록 요청의 경로와 `Basic` 인증, 200 응답 읽기, 401·404·500·응답 모양 오류·연결 실패는 오류.
- `apps/web/src/publish/whipPublisher.test.ts`: `pagehide`에서 `keepalive` `DELETE`를 보내고 트랙을 멈추며, 이미 멈춘 송출은 아무것도 보내지 않는다.
- `apps/web/e2e-stack/abnormalEnd.spec.ts` (실제 OME, `e2e:stack`): 송출 탭을 닫으면 시청 화면이 75초 안에(30초보다 늦게) "방송이 끝났습니다."로 바뀌고 `ENDED`가 된다. 걸린 시간을 로그로 남긴다. 다른 테스트는 송출 탭을 새로고침하고 30초 안에 다시 시작해, 같은 방송이 `LIVE`와 같은 `startedAt`을 유지하고 시청 화면이 실제 속도로 다시 재생되는 것을 확인한다. 로컬 실측: 탭 닫기에서 종료 표시까지 33.1초·41.3초, 새로고침에서 재송출까지 0.4초, 시청 재생 재개까지 29.6초.

화면에서 확인:

1. 3절 1~4번대로 송출을 시작하고 시크릿 창에서 시청 화면을 연다.
2. 송출 탭을 닫는다. API 로그에 `closing ... token=*** → grace started`가 1초 안에 남는다. 유예 동안 시청 화면의 상태 배지는 LIVE로 남는다.
3. 유예 30초가 지난 뒤 첫 정리에서 API 로그에 `Swept: 0 reconnected, 0 lost without closing, 1 ended`가 남는다. 탭을 닫고 30~66초 사이에 시크릿 창이 "방송이 끝났습니다."로 바뀐다.
4. 새 방송으로 송출을 시작하고 시크릿 창에서 시청한다. 송출 탭을 새로고침하면 "이 방송은 아직 LIVE입니다. 화면 공유나 카메라로 송출을 이어 가거나 방송을 종료하세요."가 뜬다(화면 공유가 없는 휴대폰은 "카메라를 켜서 송출을 이어 가거나 방송을 종료하세요.").
5. 30초 안에 "카메라 켜기" → "방송 시작"을 누른다. "송출 중입니다."가 뜨고 API 로그에 `{"allowed":true}`가 남는다. 시청 화면은 같은 주소에서 다시 재생된다. 새 스트림의 첫 재생 목록이 나오기까지 약 9.5초가 걸리고(3절), 그동안 hls.js가 멈췄다가 새 타임라인으로 건너뛰므로 재생이 이어지기까지 약 30초가 걸린다(실측 29.6초, 새로고침부터).
6. 다시 새로고침한 뒤 1분 넘게 기다렸다가 "카메라 켜기" → "방송 시작"을 누르면 "종료된 방송은 다시 송출할 수 없습니다. 새 방송을 만드세요."가 뜬다.

API로 확인 (`LIVE` 방송의 송출 탭을 닫은 뒤):

```sh
ID=<방금 송출을 끊은 방송 id>
curl -s http://localhost:3000/api/broadcasts/$ID   # 30초 안에는 "status":"LIVE"
sleep 65
curl -s http://localhost:3000/api/broadcasts/$ID   # "status":"ENDED", endedAt이 찍힌다
```

### PC 화면 송출 (#13)

인수 시나리오 2, 3: PC 스트리머가 화면 + 탭 소리 + 마이크로 방송을 시작하면 `LIVE`가 되고, 시청자에게 영상·탭 소리·마이크가 모두 들린다.

흐름 (PRD §7.1, §7.4, §7.7):

1. 송출 화면은 화면 공유를 지원하는 PC 브라우저에서 "화면 공유"(주 버튼)와 "카메라 켜기"를 띄운다. 휴대폰처럼 화면 공유가 없으면 "카메라 켜기"만 띄운다.
2. "화면 공유"로 고른 화면과 마이크를 #21의 믹서가 영상 1개 + 오디오 1개로 묶는다. 미리보기 옆(폭 960px 이상, 좁으면 아래)에 송출 사전 점검(#14), "마이크 끄기", "다시 선택"이 있다.
3. "방송 시작"을 누르면 그 클릭 안에서 믹서의 AudioContext를 재개하고(T7, 안 하면 무음으로 나간다) 3절과 같이 WHIP으로 송출한다.
4. 송출 중 "다시 선택"으로 다른 화면을 고르면 송출 연결을 다시 만들지 않고 영상 트랙만 바꾼다(`RTCRtpSender.replaceTrack`). 이전 화면의 캡처와 송출용 복제본은 바로 멈추므로 브라우저의 공유 표시도 새 화면 하나만 남는다.
5. 브라우저의 "공유 중지"를 누르면(화면 트랙 `ended`) 송출 중이면 4절의 종료 API를 부르고 "화면 공유를 중지해 방송을 종료했습니다."를 띄운다. 연결 전이면 송출만 멈추고 "화면 공유가 중지되었습니다."를 띄운다.
6. 스트리머가 로그인한 채 자기 방송의 시청 화면을 열면 플레이어가 음소거로 시작하고, 아래에 하울링 안내를 띄운다. 다른 시청자는 소리를 켠 채 시작한다. 브라우저 자동 재생 정책이 소리 있는 재생을 막으면 음소거로 재생하고, 시청자가 플레이어에서 소리를 켠다.

자동 테스트:

- `apps/web/src/publish/whipPublisher.test.ts`: 트랙을 바꾸면 영상 sender가 새 트랙의 복제본을 보내고 이전 복제본은 멈춘다. 호출한 쪽의 트랙은 그대로다. 송출을 멈추면 바꿔 넣은 복제본까지 모두 멈춘다. 연결을 만들기 전에 바꾼 트랙도 연결에 들어간다.
- `apps/web/src/pages/PublishPage.test.tsx`: 화면 공유 스트림을 송출하고, "방송 시작" 클릭 안에서 AudioContext를 재개한다. 송출 중 공유 중지는 종료 API와 종료 화면, 연결 중 공유 중지는 종료 API 없이 송출만 멈춘다. 마이크 끄기·켜기, 송출 중 "다시 선택"이 새 영상 트랙을 송출에 넘기는 것, 송출 중 마이크가 빠지면 "처음부터 다시"가 없는 것, 공유 창을 연 채 페이지를 떠나면 뒤늦게 얻은 캡처를 멈추는 것(#33), 화면 공유가 없는 브라우저는 "카메라 켜기"만 보이는 것.
- `apps/web/src/broadcast-pages.test.tsx`, `components/LivePlayer.test.tsx`: 소유자는 음소거와 하울링 안내, 비로그인·다른 사용자는 둘 다 없다. 자동 재생 거절(`NotAllowedError`) 때 음소거로 다시 재생한다.
- `apps/web/e2e-stack/pcPublish.spec.ts` (실제 OME, `e2e:stack`): 440Hz 탭을 "화면 공유"로 고르고 송출한다. 비로그인 시청자가 재생하며, 음소거가 아니고 오디오를 계속 디코드하고 가짜 마이크 비프음이 들린다. 송출 중 "다시 선택"하면 영상 sender 트랙이 바뀌고 이전 복제본과 처음 고른 화면 트랙이 `ended`이며, 시청 재생은 이어진다. 공유한 탭을 닫으면 송출 화면이 종료 안내를 띄우고 방송이 `ENDED`가 되며, 시청 화면은 10초 안에 "방송이 끝났습니다."로 바뀐다. headless Chrome은 캡처한 탭 소리가 무음이라 탭 소리는 아래 사람 확인으로 본다.

`SCREENSHOT_DIR=<폴더>`를 앞에 붙이면 `publish-screen-live.png`, `viewer-screen-playing.png`, `publish-screen-share-stopped.png`를 남긴다.

화면에서 확인 (Mac, Chrome):

1. 3절 명령으로 PostgreSQL, OME, API를 띄우고 `pnpm --filter @lsp/web dev`로 웹을 띄운다. 로그인해 방송을 만들고 송출 화면을 연다.
2. 다른 탭에서 소리가 나는 영상을 재생한다.
3. "화면 공유" → 공유 창의 "Chrome 탭"에서 그 탭을 고르고 "탭 오디오와 함께 공유"를 켠 채 공유한다. 송출 화면 탭으로 돌아와 두 레벨 미터가 움직이는지 본다.
4. "방송 시작"을 누른다. "송출 중입니다."가 뜬다.
5. 시크릿 창(로그인 안 함)에서 "시청 화면 열기" 주소를 연다. 영상이 재생되면 플레이어에서 소리를 켠다. 마이크에 말하면서 탭의 영상 소리와 내 목소리가 **둘 다** 들리는지 본다(인수 기준 1). 하울링을 피하려면 이어폰을 쓴다.
6. 같은 창(스트리머로 로그인한 창)의 새 탭에서 시청 화면을 열면 플레이어가 음소거로 시작하고 하울링 안내가 보인다.
7. 송출 화면에서 "마이크 끄기"를 누르면 시크릿 창에서 목소리만 사라지고 탭 소리는 남는다.
8. "다시 선택"으로 다른 탭을 고른다. 시크릿 창의 영상이 새 탭으로 바뀌고 재생이 이어진다. 주소창의 공유 표시는 새 탭 하나만 남는다.
9. Chrome 상단의 "공유 중지"를 누른다. 송출 화면에 "화면 공유를 중지해 방송을 종료했습니다."가 뜨고, 시크릿 창은 10초 안에 "방송이 끝났습니다."로 바뀐다.
10. 새 방송으로 "화면 공유"를 다시 누르고, 공유 창의 "전체 화면" 탭에 "시스템 오디오와 함께 공유" 스위치가 있는지 본다(PRD §7.1, §7.8). 결과는 아래 "지원 환경" 표에 적는다.

### 모바일 송출 (#15)

휴대폰 카메라와 마이크로 송출하고, 송출 중에 전·후면을 바꿔도 송출이 이어진다. 화면을 건드리지 않아도 꺼지지 않는다(PRD §7.1, T5, 인수 시나리오 6·11). 모바일 송출은 PC와 같은 송출 화면(`/studio/broadcasts/:id`)을 쓴다. 화면 공유를 못 하는 브라우저(휴대폰)에는 "카메라 켜기"만 보인다.

전·후면 전환은 이렇게 한다. 송출 연결은 카메라 트랙의 복제본을 보내는데, 복제본도 원본과 같은 카메라 장치를 붙잡는다. 대부분의 휴대폰은 카메라를 한 번에 하나만 열 수 있으므로, 전환할 때 먼저 송출 중인 복제본을 멈추고(`RTCRtpSender.replaceTrack(null)`), 새 카메라를 연 뒤 그 복제본을 같은 sender에 끼운다. 전환하는 동안(1초 안쪽) 영상 프레임이 잠깐 멈추고 소리는 이어진다.

자동 확인 (Google Chrome 필요, 가짜 카메라·마이크 사용):

```sh
pnpm --filter @lsp/web e2e   # headless. CI도 같은 명령을 돌린다
```

`apps/web/e2e/cameraCapture.spec.ts`와 `cameraCaptureSingle.spec.ts`가 Pixel 7 에뮬레이션의 송출 화면(API는 가짜 응답)에서 다음을 확인한다.

- 미리보기 `<video>`의 스트림에 영상 트랙 1개, 오디오 트랙 1개가 있다. 전면 카메라 미리보기는 좌우 반전된다.
- "후면 카메라로 전환"을 누르면 같은 스트림 객체에서 영상 트랙만 바뀐다. 오디오 트랙 id는 그대로이고, 이전 영상 트랙은 `ended`다. 다시 누르면 전면으로 돌아온다.
- "화면 꺼짐 방지가 켜져 있습니다."가 뜬다. "카메라 끄기"를 누르면 모든 트랙이 `ended`이고 Wake Lock이 풀린다.
- Wake Lock 권한이 없거나 API가 없으면 각각 안내 문구가 뜬다.
- 카메라가 하나뿐이면 전환 버튼이 없다.
- 카메라 권한을 거부하면 iPhone(Safari)·Android(Chrome)별로 다시 허용하는 방법이 뜬다. 카메라가 없을 때(`NotFoundError`)는 다른 문구가 뜬다.

실제 OME까지 이어서 확인하려면 "송출에서 시청까지"의 명령으로 PostgreSQL, OME, API를 띄우고 `pnpm --filter @lsp/web e2e:stack`을 돌린다. `apps/web/e2e-stack/mobilePublish.spec.ts`가 Pixel 7 에뮬레이션으로 다음을 확인한다(약 1분 30초).

- 전면 카메라(640×480)로 송출하고, 비로그인 시청 창에서 재생된다.
- 송출 중에 후면 카메라로 바꾸면 sender가 후면 트랙을 보내고, 후면 카메라를 여는 순간에는 전면 카메라 트랙(송출 복제본 포함)이 하나도 살아 있지 않다.
- 후면 카메라는 1280×720으로 연다. 시청 창의 hls.js가 새 해상도로 바뀌고 재생 시간이 계속 늘어난다. 다시 전면으로 바꾸면 640×480으로 돌아온다.
- 1분 동안 아무것도 누르지 않아도 "송출 중입니다."와 `LIVE`가 유지되고, Wake Lock이 풀리지 않으며, 시청 재생이 50초 넘게 늘어난다.
- 종료하면 원본과 복제본을 합친 모든 카메라·마이크 트랙이 `ended`이고 시청 창이 "방송이 끝났습니다."로 바뀐다.

Chrome의 가짜 카메라는 전·후면(`facingMode`) 정보가 없다. 그래서 테스트는 `facingMode` 요청을 가짜 카메라 두 대(`fake_device_0`이 전면, `fake_device_1`이 후면)로 바꿔 주는 스크립트를 페이지에 넣는다. 페이지가 다시 보일 때 Wake Lock을 다시 요청하는지는 headless Chrome에서 페이지를 숨길 수 없어 단위 테스트(`src/capture/screenWakeLock.test.ts`)로 확인한다.

같은 Wi-Fi의 휴대폰으로 확인하는 절차 (Mac, mkcert 필요):

휴대폰 브라우저는 `http://<LAN IP>`에서 카메라를 막으므로 웹을 https로 연다. 송출 영상은 OME가 알려 주는 ICE 후보로 가므로 `OME_HOST_IP`도 Mac의 LAN IP여야 한다.

1. Mac과 휴대폰을 같은 Wi-Fi에 연결하고 인증서를 만든다. 스크립트는 `.env`를 고치지 않고, 넣을 줄과 다음 단계를 출력한다.

   ```sh
   brew install mkcert            # 없을 때만
   scripts/lan-https.sh           # LAN IP를 바꾸려면 인자로 준다: scripts/lan-https.sh 192.168.0.10
   ```

2. 출력대로 `.env`에 `WEB_HTTPS_CERT=.certs/lan.pem`, `WEB_HTTPS_KEY=.certs/lan-key.pem`, `OME_HOST_IP=<Mac LAN IP>`를 넣는다.
3. OME를 새 주소로 다시 만들고 API와 웹을 띄운다.

   ```sh
   docker compose up -d --wait ome
   pnpm --filter @lsp/api dev
   pnpm --filter @lsp/web dev     # Network: https://<LAN IP>:<WEB_PORT> 가 찍힌다
   ```

4. 휴대폰이 Mac의 인증서를 믿도록 스크립트가 알려 준 `rootCA.pem`을 휴대폰에 설치한다. 설치하지 않으면 "안전하지 않은 연결" 경고가 뜬다. Galaxy S22의 Slack 앱 웹뷰에서는 경고를 넘겨 들어가도 카메라가 열렸지만, 다른 브라우저에서도 그런지는 확인하지 않았다. Android는 설정 → 보안 → 암호화 및 사용자 인증 정보 → 인증서 설치 → CA 인증서, iPhone은 AirDrop으로 받은 프로필을 설치하고 설정 → 일반 → 정보 → 인증서 신뢰 설정에서 켠다.
5. 휴대폰에서 `https://<LAN IP>:<WEB_PORT>`를 열고 스트리머 A로 로그인한다. 내 방송에서 방송을 만들고 송출 화면을 연다. "카메라 켜기"만 보이고 "화면 공유"는 없다.
6. "카메라 켜기" → 카메라·마이크 허용 → "방송 시작"을 누른다. "송출 중입니다."가 뜬다.
7. Mac Chrome 시크릿 창에서 `https://<LAN IP>:<WEB_PORT>/broadcasts/<방송 id>`를 연다. 휴대폰 영상과 소리가 나온다(인수 시나리오 6).
8. 휴대폰에서 "후면 카메라로 전환"을 누른다. 시청 창이 몇 초 뒤 후면 영상으로 바뀌고 재생이 멈추지 않는다. "전면 카메라로 전환"으로 돌아와도 같다.
9. 휴대폰을 1분 동안 건드리지 않는다. 화면이 꺼지지 않고 시청 창 재생이 이어진다(인수 시나리오 11).
10. "방송 종료" → "종료하기"를 누른다. 휴대폰의 카메라 사용 표시가 꺼지고 시청 창이 "방송이 끝났습니다."로 바뀐다.
11. 확인이 끝나면 `.env`의 `WEB_HTTPS_CERT`·`WEB_HTTPS_KEY`를 비우고 `OME_HOST_IP=127.0.0.1`로 되돌린 뒤 `docker compose up -d --wait ome`를 다시 실행한다. e2e는 http 웹과 `127.0.0.1` OME를 전제로 한다.

결과는 아래 "지원 환경" 표에 기기·OS·브라우저 버전과 함께 적는다. LTE(Wi-Fi 끔) 송출은 배포 주소에서 확인한다.

### 6. 채팅과 댓글 (#18, #91)

방송 전·중(`READY`·`LIVE`)에는 채팅, 끝난 뒤(`ENDED`)에는 댓글을 쓴다(PRD §7.1, §7.5). 어느 쪽인지는 서버가 방송 상태로 정하고, 클라이언트는 고르지 않는다. 둘 다 로그인 없이 누구나 읽는다. 댓글 작성·수정·삭제는 공모 평가 항목이라 시드에 끝난 방송 예시를 하나 둔다.

이 기능은 `ChatMessage` 테이블을 새로 쓴다. 이 변경을 받은 뒤에는 `pnpm --filter @lsp/api db:migrate`로 마이그레이션을 적용한다. 마이그레이션은 기존 `Comment` 중 방송 종료(`endedAt`) 전에 쓴 행과 아직 끝나지 않은 방송의 행을 같은 id로 `ChatMessage`에 옮긴다. 나머지는 댓글로 남는다.

규칙:

- 채팅은 `READY`·`LIVE` 방송에만 쓴다. `ENDED`면 409와 "끝난 방송에는 채팅을 보낼 수 없습니다. 댓글을 남겨 주세요."다. 본문은 앞뒤 공백을 자르고 1~200자다. 고칠 수 없고, 작성자만 지운다(상태와 관계없다).
- 댓글은 `ENDED` 방송에만 쓴다. `READY`·`LIVE`면 409와 "댓글은 방송이 끝난 뒤에 남길 수 있습니다. 방송 중에는 채팅을 이용해 주세요."다. 본문은 1~500자다. 목록·수정·삭제는 #18 그대로다. 목록은 최신 100개를 오래된 순으로 준다.
- 작성의 검사 순서는 `로그인 → 본문 → 방송 → 상태`(401 → 400 → 404 → 409)다. 수정·삭제는 `로그인 → 글 확인 → 작성자 확인 → 본문 검증`(`LoggedInGuard` → `CommentAuthorGuard`·`ChatAuthorGuard`)이다. 방송의 스트리머도 남의 채팅·댓글은 고치거나 지울 수 없다(403).
- 채팅 조회는 `?after=<메시지 id>` 커서를 받는다. 커서 뒤의 메시지만 `(createdAt, id)` 순으로 최대 200개 준다. `createdAt`이 같은 메시지 사이에서도 빠지거나 겹치지 않는다. `after`가 없으면 처음부터, 형식이 틀리면 400, 이 방송의 메시지가 아니면(지워졌으면) 처음부터 준다.
- 실시간 푸시는 없다(PRD §8.2). 채팅 패널은 1초마다 커서 뒤만 읽고, 200개가 꽉 차면 다음 페이지를 바로 읽는다. 댓글은 5초마다 전체를 다시 읽는다. 내가 쓰거나 지운 채팅, 쓰거나 고치거나 지운 댓글은 바로 화면에 반영된다.
- 방송을 삭제하면 채팅과 댓글도 DB에서 함께 지워진다. 삭제는 행을 바로 지운다.

| 행위 | API | 비로그인 | 로그인(타인) | 작성자 |
|---|---|---|---|---|
| 채팅 조회 | `GET /api/broadcasts/:id/chat?after=<id>` | 200 | 200 | 200 |
| 채팅 작성 | `POST /api/broadcasts/:id/chat` | 401 | READY·LIVE 201, ENDED 409 | READY·LIVE 201, ENDED 409 (스트리머 포함) |
| 채팅 삭제 | `DELETE /api/chat/:messageId` | 401 | 403 | 204 |
| 댓글 목록 조회 | `GET /api/broadcasts/:id/comments` | 200 | 200 | 200 |
| 댓글 작성 | `POST /api/broadcasts/:id/comments` | 401 | ENDED 201, READY·LIVE 409 | ENDED 201, READY·LIVE 409 (스트리머 포함) |
| 댓글 수정 | `PATCH /api/comments/:commentId` | 401 | 403 | 200 |
| 댓글 삭제 | `DELETE /api/comments/:commentId` | 401 | 403 | 204 |

자동 테스트:

- `apps/api/test/authorization-matrix.e2e.spec.ts`: 위 일곱 행을 2절의 `MATRIX`에 넣었다. 대상 방송이 `READY`·`LIVE`·`ENDED`일 때 모두 돌린다. 수정·삭제 행의 "소유자" 칸은 소유자가 쓴 글이라 작성자 칸이다. 거절된 칸은 `Broadcast`·`Comment`·`ChatMessage` 테이블이 요청 전과 같은지 확인한다. 순서 확인: 없는 글과 형식이 틀린 id에 비로그인 401, 로그인 404. 채팅·댓글 작성은 401 → 400 → 404 → 409. 스트리머가 자기 방송에 달린 시청자 댓글을 고치거나 지우면 403이다.
- `apps/api/test/chat.e2e.spec.ts`: 상태별 작성, 본문 검증, 없는 방송 404, 작성자 삭제와 403·401·404, 목록 순서와 이메일 미노출, `after` 커서, 같은 `createdAt` 경계, 200개씩 끝까지 읽기, 1,000개 방송에서 `after=<995번째>`가 새 5개만 준다.
- `apps/api/test/chat-migration.spec.ts`: 임시 스키마에 실제 마이그레이션 SQL을 차례로 적용하고, 옮겨진 행(같은 id)과 남은 행을 확인한다.
- `apps/api/test/comments.e2e.spec.ts`: `READY`·`LIVE` 409, 목록 순서와 100개 상한, 본문 검증, 없는 방송 404, 수정 뒤 `updatedAt`만 바뀜, 방송 삭제 시 댓글 삭제, 지운 댓글에 다시 부르면 404.
- `apps/api/test/seed-demo.e2e.spec.ts`: 시드를 두 번 돌려도 끝난 방송 예시가 하나다.
- `apps/web/src/chat.test.ts`: 채팅 목록 리듀서의 정렬·중복 제거·커서.
- `apps/web/src/broadcast-pages.test.tsx`: `READY`·`LIVE`는 채팅 패널이고 탭이 없다. 채팅은 처음 읽은 뒤 `after=<마지막 id>`로만 읽고, 꽉 찬 페이지는 바로 이어 읽는다. 내 채팅은 보내자마자 보이고 지우자마자 사라진다. 409는 API 문구를 보인다. `ENDED`는 "댓글" 탭이 열려 있고 "채팅 기록" 탭은 읽기 전용이다. 탭은 ←/→·Home·End로 옮긴다. LIVE에서 상태 조회가 방송 종료를 받으면 새로고침 없이 탭으로 바뀐다. 댓글 등록·수정·삭제, 삭제 재확인, 내 댓글에만 있는 버튼, 5초 조회.

화면에서 확인 (2절처럼 "스트리머 A"와 "사용자 B"를 쓴다):

**끝난 방송 → 댓글 탭에서 작성·수정·삭제**

1. 로그아웃 상태로 방송 목록 "방송 종료" 탭 → "끝난 방송 예시: 댓글을 남겨 보세요"를 연다. 넓은 화면에서는 플레이어 오른쪽에, 좁은 화면에서는 방송 정보 아래에 "댓글"·"채팅 기록" 탭이 있고 "댓글"이 열려 있다. 시드 댓글 2개가 보이고, 입력창 대신 "로그인하고 댓글을 남겨 보세요"가 보인다.
2. 그 링크를 눌러 B로 로그인한다. 같은 상세로 돌아오고 "댓글 쓰기" 입력창이 보인다. 댓글을 쓰고 "등록"을 누른다. 목록 맨 아래에 바로 나타나고 입력창이 비워진다.
3. 내 댓글 아래 "수정"을 눌러 고치고 "저장"을 누른다. 시각 옆에 "(수정됨)"이 붙는다. A의 댓글에는 "수정"·"삭제"가 없다.
4. "삭제"를 누르면 "이 댓글을 삭제할까요?"가 뜬다. "삭제하기"를 누르면 목록에서 사라진다.
5. "채팅 기록" 탭을 누른다. 방송 중에 오간 채팅 3개가 오래된 순으로 보이고 입력창과 삭제 버튼이 없다. 탭에 포커스를 두고 ←/→를 누르면 탭이 바뀐다.

**방송 중 채팅**

1. A로 방송을 만들어 3절처럼 송출한다(만들기만 하고 `READY`여도 채팅이 된다). A 창과 B 창(PC와 휴대폰이면 더 좋다)에서 같은 상세를 연다. 오른쪽에 "채팅"이 있고 탭은 없다.
2. B가 채팅을 쓰고 "보내기"를 누른다. B 창에 바로 보이고, A 창에 1초 안팎에 나타난다. 한 줄에 "닉네임 글 시각" 모양이고, 시각에 마우스를 올리면 날짜까지 보인다. 입력창 아래에 `n/200`이 보인다.
3. B 창에서 내 채팅의 "삭제" → "삭제하기"를 누르면 바로 사라진다. 채팅에는 "수정"이 없다.
4. 목록을 위로 올려 둔 채 다른 창에서 채팅을 쓴다. 읽던 위치가 그대로다. 맨 아래로 내리면 다시 새 채팅을 따라간다.
5. 송출 화면에서 방송을 종료한다. 5초 안에 상태 배지가 "방송 종료"로 바뀌고, 새로고침하지 않아도 "댓글"·"채팅 기록" 탭으로 바뀐다. "채팅 기록"에 방금 쓴 채팅이 있다.

API로 확인 (2절의 `a-jar.txt`·`b-jar.txt`):

```sh
API=http://localhost:3000/api
ID=$(curl -s -b a-jar.txt -X POST $API/broadcasts -H 'Content-Type: application/json' \
  -d '{"title":"채팅 확인"}' | sed -E 's/^\{"id":"([^"]+)".*/\1/')

# READY 방송: 채팅은 되고 댓글은 409
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/broadcasts/$ID/chat \
  -H 'Content-Type: application/json' -d '{"body":"안녕하세요"}'                       # 401
MID=$(curl -s -b b-jar.txt -X POST $API/broadcasts/$ID/chat \
  -H 'Content-Type: application/json' -d '{"body":"안녕하세요"}' | sed -E 's/^\{"id":"([^"]+)".*/\1/')
curl -s -b b-jar.txt -X POST $API/broadcasts/$ID/comments \
  -H 'Content-Type: application/json' -d '{"body":"벌써?"}'                            # 409와 안내 문구
curl -s "$API/broadcasts/$ID/chat"                                                  # B의 채팅 1개
curl -s "$API/broadcasts/$ID/chat?after=$MID"                                       # []
curl -s -o /dev/null -w '%{http_code}\n' -b a-jar.txt -X DELETE $API/chat/$MID      # 403
curl -s -o /dev/null -w '%{http_code}\n' -b b-jar.txt -X DELETE $API/chat/$MID      # 204

# 시드의 끝난 방송: 댓글은 되고 채팅은 409
EID=$(curl -s "$API/broadcasts?status=ENDED" | sed -E 's/.*"id":"([^"]+)","title":"끝난 방송 예시.*/\1/')
CID=$(curl -s -b b-jar.txt -X POST $API/broadcasts/$EID/comments \
  -H 'Content-Type: application/json' -d '{"body":"잘 봤습니다"}' | sed -E 's/^\{"id":"([^"]+)".*/\1/')
curl -s -b b-jar.txt -X POST $API/broadcasts/$EID/chat \
  -H 'Content-Type: application/json' -d '{"body":"늦었나요"}'                         # 409와 안내 문구

# 스트리머 A도 B의 댓글은 고치거나 지울 수 없다
curl -s -o /dev/null -w '%{http_code}\n' -b a-jar.txt -X PATCH $API/comments/$CID \
  -H 'Content-Type: application/json' -d '{"body":"바꿈"}'                             # 403
curl -s -o /dev/null -w '%{http_code}\n' -b a-jar.txt -X DELETE $API/comments/$CID   # 403

# 작성자 B는 고치고 지울 수 있다
curl -s -b b-jar.txt -X PATCH $API/comments/$CID -H 'Content-Type: application/json' \
  -d '{"body":"반갑습니다"}'                                                            # 200, 새 본문
curl -s -o /dev/null -w '%{http_code}\n' -b b-jar.txt -X DELETE $API/comments/$CID   # 204
```

### 7. 녹화·다시보기 (#19)

`LIVE`가 된 방송은 OME가 자동으로 녹화하고, 끝난 방송은 방송 목록의 "다시보기" 탭에서 다시 본다(PRD §7.1, §8.4). 녹화 파일이 디스크를 채우지 않도록 용량 상한을 넘으면 오래된 녹화부터 지운다(T6).

이 기능은 `Broadcast.recordingFiles` 열을 새로 쓴다. 이 변경을 받은 뒤에는 `pnpm --filter @lsp/api db:migrate`로 마이그레이션을 적용하고, OME 설정과 compose가 바뀌었으므로 `docker compose up -d --wait`로 OME를 다시 만들고 녹화 정적 서버(`recordings`)를 띄운다.

흐름:

1. 송출 허가(3절 3번)로 방송이 `LIVE`가 되면 API가 OME 관리 API `POST /v1/vhosts/default/apps/app:startRecord`를 부른다. 녹화 id와 스트림 이름은 방송 id다. Webhook 응답은 이 호출을 기다리지 않는다(OME가 Webhook을 3초까지만 기다리고, 넘으면 송출을 거절한다).
2. OME는 `recordings/<방송 id>/<녹화 id>_<순번>.mp4`로 쓴다. 쓰는 동안은 `tmp_…` 이름이고, 송출이 끊기면 `.mp4`로 바뀐다. 영상은 H.264, 소리는 AAC 한 트랙만 남긴다.
3. 유예 시간 안에 재접속하면(5절) 같은 녹화가 이어지지만 파일은 순번이 하나 늘어난 새 파일이다. 다시보기는 파일마다 "1부", "2부"로 보이고 한 부가 끝나면 다음 부를 이어서 재생한다.
4. 종료 경로는 모두 `:stopRecord`를 부른다. 소유자 종료와 `LIVE` 삭제는 4절의 송출 끊기 다음에, 정리 작업(5절)은 유예를 넘겨 `ENDED`로 바꾼 방송마다 부른다. 녹화 중지가 실패해도 종료는 성공으로 돌려준다. 아래 녹화 정리가 맞춘다.
5. 녹화 정리(`RecordingReconciler`)가 30초마다 돈다.
   - OME의 녹화 작업 목록과 DB의 `LIVE` 방송을 대조해, `LIVE`가 아닌 방송의 작업은 멈추고 작업이 없는 `LIVE` 방송은 시작한다.
   - 녹화 폴더를 읽어 `ENDED` 방송의 다 쓴 `.mp4` 목록을 `recordingFiles`에 적는다(오래된 파일 먼저). 아직 `tmp_` 파일이 있으면 다음 회차로 미룬다. 폴더가 사라진 방송은 목록을 비운다. 방송이 지워진 폴더는 지운다.
   - 폴더 전체 크기가 `RECORDINGS_MAX_GB`(기본 10, GiB)를 넘으면 오래 전에 끝난 방송의 녹화부터 지운다. DB 목록을 먼저 비우고 폴더를 지우므로 다시보기 목록에 없는 파일이 남지 않는다. `LIVE` 방송의 녹화는 지우지 않는다.
6. `GET /api/replays`는 `ENDED`이면서 `recordingFiles`가 있는 방송만 늦게 끝난 순으로 준다(최대 100개). 녹화 파일은 같은 출처 `/recordings/<방송 id>/<파일>.mp4`로 재생한다. 운영에서는 Caddy가, 개발에서는 compose의 `recordings` 정적 서버가 내주고 Vite가 `/recordings`를 그리로 넘긴다. Caddy는 `tmp_…`와 `.xml`을 숨기고 Range 요청에 206으로 답한다.
7. 시청 화면은 `ENDED`이면서 녹화가 있으면 다시보기 플레이어를 띄우고, 그 아래에 "방송이 끝났습니다. 녹화된 방송을 다시 볼 수 있습니다."를 둔다. 시청 중에 방송이 끝난 시청자도 종료를 알 수 있다(T9).

로컬 OME(v0.21.0)로 잰 것:

| 질문 | 결과 |
|---|---|
| Webhook 시점에는 스트림이 없는데 `:startRecord`가 되나 | 된다. 스트림이 없으면 작업이 `ready`로 예약되고 스트림이 생기면 녹화를 시작한다. 그래서 허가 직후에 부른다 |
| 녹화는 언제부터 담기나 | OME 출력 스트림이 생기고(LL-HLS 재생 목록이 나오는 시점) 첫 키프레임이 지난 뒤다. 한 번 잰 값: 허가 → 녹화 시작 6.4초, 출력 스트림 → 녹화 시작 2.7초. 방송 첫 몇 초는 녹화에 없다 |
| 파일 형식 | MP4. Chrome에서 바로 재생됐고 Range 요청으로 탐색된다. OME 설정에 `variantNames`를 주지 않으면 H.264 + AAC + Opus(소리 두 트랙)라 `bypass_video`·`aac_audio`만 고른다. TS는 Chrome이 직접 재생하지 않고, WebM은 H.264를 담지 못한다 |
| 유예 안 재접속 | 같은 녹화 작업이 `ready`로 돌아갔다가 이어서 쓰지만 파일은 나뉜다(`_0.mp4`, `_1.mp4`) |
| 같은 id로 `:startRecord` 두 번 | 400 `Duplicate ID already exists`(문서의 409가 아니다). 이미 녹화 중으로 본다 |
| 없는 id로 `:stopRecord` | 404. 이미 멈춘 것으로 본다. 스트림이 없는 `ready` 작업도 200으로 멈춘다 |

자동 테스트:

- `apps/api/test/ome-api.spec.ts`: 녹화 시작·중지·목록 요청의 경로, 본문, `Content-Type`. 시작의 400 `Duplicate ID`와 중지의 404는 성공, 다른 400·401·500은 오류.
- `apps/api/test/recording-plan.spec.ts`: 정리 계획 순수 함수. 폴더와 DB를 맞추는 표, `tmp_` 대기, 상한에서 오래된 `ENDED`부터 지우기, `LIVE`는 지우지 않고 넘친 만큼 알리기, 정확히 상한이면 그대로.
- `apps/api/test/recordings.e2e.spec.ts` (실제 PostgreSQL, 임시 폴더, 가짜 OME): 작업 시작·중지 맞추기, OME가 죽어도 파일 정리는 계속, 여러 부분의 순서와 `/api/replays`, `tmp_` 이름이 바뀐 뒤 반영, 지워진 방송의 폴더 삭제, 상한에서 DB를 먼저 비우고 폴더 삭제, 타이머.
- `apps/api/test/publish.e2e.spec.ts`·`broadcasts.e2e.spec.ts`·`reconnect-grace.e2e.spec.ts`: 허가가 녹화를 시작하고 녹화 호출이 끝나지 않아도 Webhook이 바로 답한다. 종료는 송출을 끊은 뒤 녹화를 멈추고, 두 번 불러도 200이며 녹화 중지 실패도 200이다. `LIVE` 삭제와 유예 초과 정리도 녹화를 멈춘다. `/api/replays`의 거르기와 순서.
- `apps/web/src/components/ReplayPlayer.test.tsx`, `broadcast-pages.test.tsx`: 다시보기 탭과 빈 목록 문구, 녹화가 있는 `ENDED` 방송의 플레이어와 종료 안내, 부분 버튼과 다음 부로 넘어가기.
- `apps/web/e2e-stack/replay.spec.ts` (실제 OME, `e2e:stack`): 송출 → 새로고침 → 유예 안 재송출 → 종료하면 다시보기 목록에 두 부분으로 오른다. 파일은 `video/mp4`, Range 요청은 206이다. 시청자가 "다시보기" 탭에서 들어가 1부를 재생하고 끝 근처로 넘기면 2부로 넘어가 재생된다. 다른 테스트는 미디어를 한 번도 보내지 않은 방송(허가는 됐지만 SDP가 틀림)이 끝난 뒤 정리 한 회차가 지나도 목록에 없음을 확인한다. 로컬 실측: 종료 → 목록 등장 4.1~24.4초.

실제 OME로 확인: 3절의 명령을 그대로 쓴다. `docker compose up -d --wait`가 녹화 폴더(`RECORDINGS_DIR`, 기본 저장소 루트의 `recordings/`)를 OME와 정적 서버에 연결한다. API도 같은 폴더를 기본값으로 읽는다. `RECORDINGS_DIR`을 바꾸면 절대 경로를 넣는다.

> `pnpm --filter @lsp/web e2e:stack`을 기본 병렬로 돌리면 `mobilePublish.spec.ts`가 카메라 폭 640 대신 480을 받아 실패할 수 있다. 여러 브라우저가 동시에 송출하면 Chrome이 해상도를 낮추기 때문이고, 이 변경 전 main에서도 같게 실패한다. `--workers=1`이면 열 개 모두 통과한다.

화면에서 확인:

1. 3절 1~3번대로 송출을 시작한다. 몇 초 뒤 `recordings/<방송 id>/`에 `tmp_…` 파일이 생긴다.
2. 송출 화면을 새로고침하고 30초 안에 다시 "방송 시작"을 누른다. 10초쯤 뒤 "방송 종료" → "종료하기"를 누른다.
3. 30초 안에 방송 목록의 "다시보기" 탭에 이 방송이 나타난다. 들어가면 플레이어 아래에 "1부"·"2부"와 나뉜 이유, "방송이 끝났습니다. 녹화된 방송을 다시 볼 수 있습니다."가 보인다. 재생하면 1부가 끝난 뒤 2부가 이어진다.
4. 송출을 시작하자마자 종료한 방송은 녹화가 없어 "다시보기"에 나타나지 않고, 상세는 "방송이 끝났습니다."만 띄운다.

API로 확인:

```sh
curl -s http://localhost:3000/api/replays                      # 녹화가 있는 ENDED 방송만, "recordingFiles":["<id>/<녹화 id>_0.mp4",...]
F=<위 응답의 recordingFiles 하나>
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:5173/recordings/$F   # 200 video/mp4 (Vite → 정적 서버)
curl -s -o /dev/null -w '%{http_code}\n' -H 'Range: bytes=0-99' http://localhost:5173/recordings/$F   # 206
du -sh recordings                                               # 녹화가 쓰는 용량
```

용량 상한을 바로 확인하려면 `.env`에 `RECORDINGS_MAX_GB=0.001`(약 1MB)을 넣고 API를 다시 띄운다. 녹화가 있는 방송을 둘 이상 끝내면 30초 안에 먼저 끝난 방송의 녹화 폴더가 지워지고, API 로그에 `Evicted the recording of <id> to stay under the cap`이 남으며 다시보기 목록에서 빠진다.

### 8. 도네이션 (#20)

로그인한 시청자가 `LIVE` 방송에 토스페이먼츠 테스트 모드로 후원하고, 시청 화면에서 그 방송의 후원 합계와 최근 후원을 본다(PRD §8.4). 실제 돈은 나가지 않는다. 웹훅, 취소·환불, 가상계좌, 정산은 하지 않는다.

이 기능은 `Donation` 표를 새로 쓴다. 이 변경을 받은 뒤에는 `pnpm --filter @lsp/api db:migrate`로 마이그레이션을 적용한다. API는 `TOSS_CLIENT_KEY`·`TOSS_SECRET_KEY`를 읽는다. 둘 중 하나라도 비어 있으면 API는 뜨지만 주문과 승인은 503 `후원 기능이 설정되지 않았습니다.`로 답한다. 키는 API에만 넣는다. 웹은 `VITE_` 변수를 쓰지 않고 주문 응답에 담긴 클라이언트 키로 결제위젯을 띄운다.

로컬에서는 토스 개발자센터 문서의 공개 테스트 키를 쓴다. 이 키는 [tosspayments-sample](https://github.com/tosspayments/tosspayments-sample)의 `express-react/server.js`(시크릿 키)와 `express-react/src/pages/widget/WidgetCheckoutWindow.jsx`(클라이언트 키)에 있다. 공개 키지만 커밋 전 비밀값 검사(gitleaks)가 잡으므로 `.env.example`에는 넣지 않았다. `.env`에 직접 넣거나 실행할 때 명령 앞에 붙인다.

흐름:

1. 시청자가 "후원하기"에서 금액과 메시지를 넣고 "다음"을 누르면 `POST /api/broadcasts/:id/donations`가 주문(`PENDING`)을 저장하고 `orderId`, `orderName`, 금액, 클라이언트 키, `customerKey`(후원자 id)를 돌려준다.
2. 웹이 결제위젯(SDK v2 `widgets()`)을 그 금액으로 띄운다. "결제하기"를 누르면 토스 결제 화면으로 넘어간다.
3. 결제가 끝나면 토스가 `/donations/success?paymentKey=…&orderId=…&amount=…`로 돌려보낸다. 이 화면이 `POST /api/donations/confirm`을 한 번 부른다.
4. 서버는 주문을 찾아 후원자 본인인지와 금액이 주문과 같은지 확인한다. 그다음 한 트랜잭션 안에서 주문 행을 `SELECT … FOR UPDATE`로 잠그고 토스 승인 API를 부른다. 이때 `Idempotency-Key`는 `orderId`다. 응답의 `status`가 `DONE`이고 `totalAmount`, `orderId`, `paymentKey`가 요청과 같을 때만 `PAID`로 바꾼다.
5. 이미 `PAID`인 주문에 같은 `paymentKey`로 승인이 다시 오면 토스를 부르지 않고 기존 후원을 그대로 준다. 새로고침, 두 번 누르기, 동시 요청 모두 한 번만 반영된다. 동시 요청은 행 잠금으로 줄을 세운다. `orderId`와 `paymentKey`에는 UNIQUE가 걸려 있다.
6. 토스가 4xx로 거절하면 그 `message`와 `code`를 400으로 전한다. 토스 5xx, 시간 초과(10초), 응답 불일치는 502다. 이 경우 주문은 `PENDING`으로 남아 같은 요청을 다시 보내면 맞춰진다.
7. 시청 화면은 `GET /api/broadcasts/:id/donations`를 5초마다 불러 합계, 건수, 최근 50건을 보여 준다. `PAID`만 센다. 후원자는 닉네임만 보인다.

규칙:

- 금액은 1,000원 이상 100,000원 이하의 정수다. 메시지는 선택이고 앞뒤 공백을 뺀 뒤 100자까지다.
- 주문은 방송이 `LIVE`일 때만 받는다. 승인은 방송 상태를 보지 않는다. 결제가 이미 끝난 뒤라 방송이 그새 끝났어도 반영한다.
- 아무도 결제를 마치지 않은 `PENDING` 주문은 지우지 않는다. 합계에 들어가지 않는다.

| 행동 | 비로그인 | 다른 시청자 | 스트리머 본인 |
|---|---|---|---|
| 후원 주문 `POST /broadcasts/:id/donations` | 401 | `LIVE` 201, 그 밖 409 | 403 `내 방송에는 후원할 수 없습니다.` |
| 후원 승인 `POST /donations/confirm` | 401 | 주문한 본인 200 | 남의 주문 403 `내 후원 주문만 승인할 수 있습니다.` |
| 후원 내역 `GET /broadcasts/:id/donations` | 200 | 200 | 200 |

그 밖의 응답: 없는 방송 404, 없는 주문 404, 금액 범위 밖 400, 승인 금액이 주문과 다름 400, 이미 다른 주문에 쓰인 `paymentKey` 409. 인가 매트릭스 테스트에 세 행을 더했다.

토스 테스트 모드로 잰 것(2026-11-10, 문서 공개 테스트 키):

| 질문 | 결과 |
|---|---|
| 결제창(`payment()`)과 결제위젯(`widgets()`) 중 무엇을 쓰나 | 문서 공개 키는 결제위젯 키라 결제창은 `NOT_SUPPORTED_WIDGET_KEY`로 거절한다. 결제위젯을 쓴다 |
| 테스트 모드에서 카드 결제를 끝까지 하려면 | 테스트 모드여도 카드사 인증 화면은 실제와 같다. 본인 카드로 인증하고, 돈은 나가지 않는다 |
| 같은 `Idempotency-Key`로 승인을 두 번 | 두 번 다 200, 같은 본문(`status: "DONE"`) |
| `Idempotency-Key` 없이 승인을 다시 | 400 `ALREADY_PROCESSED_PAYMENT` |

자동 테스트(토스 네트워크는 부르지 않는다. 승인 API는 가짜로 바꾼다):

- `apps/api/test/donations.e2e.spec.ts` (실제 PostgreSQL): 주문 응답, 금액 경계와 메시지 길이, `READY`·`ENDED` 방송 409, 본인 방송 403, 승인 후 합계 반영, 새로고침·재시도 한 번 반영과 토스 호출 한 번, 동시 승인 두 개의 한 번 반영, 금액 불일치 400, 남의 주문 403, 없는 주문 404, 비로그인 401, 토스 거절 400과 재시도 성공, 토스 오류·응답 불일치 502, `paymentKey` 재사용 409, 방송 종료 뒤 승인, 목록 50건 제한과 전체 합계, 이메일 비노출, 방송 삭제 시 후원 삭제, 키가 없을 때 503.
- `apps/api/test/toss-payments.spec.ts`: 승인 요청의 Basic 인증과 `Idempotency-Key`, 토스 오류 본문 전달, 네트워크 오류, 환경변수 읽기.
- `apps/api/test/authorization-matrix.e2e.spec.ts`: "후원", "후원 승인", "후원 내역 조회" 행.
- `apps/web/src/donations.test.tsx`: 시청 화면 합계와 목록, 스트리머·종료 방송에서 "후원하기" 숨김, 비로그인 로그인 안내, 금액 범위, 주문 → 위젯 → 결제 요청, StrictMode에서도 승인 한 번, 실패·취소 화면.

화면에서 확인(토스 키를 넣고 API와 웹을 띄운 상태):

1. 사용자 A로 방송을 만들고 3절대로 송출해 `LIVE`로 만든다. 시청 화면의 방송 정보 아래에 "후원 0원 0건"과 "아직 후원이 없습니다."가 보인다. A에게는 "후원하기"가 없다.
2. 로그아웃하고 같은 방송을 열면 "로그인하고 후원해 보세요"가 보인다. 누르면 로그인 화면으로 가고 로그인 뒤 이 방송으로 돌아온다.
3. 사용자 B로 로그인해 "후원하기"를 누른다. 금액(예: 1,000원)과 메시지를 넣고 "다음"을 누르면 결제위젯이 뜬다.
4. "신용·체크카드"와 카드사를 고르고 "결제하기"를 누른다. 카드 인증을 마치면 "후원했습니다."와 금액이 보인다.
5. 이 화면을 새로고침해도 같은 화면이 다시 뜬다. 시청 화면으로 돌아가면 합계와 건수가 한 번만 늘어 있고, B의 닉네임, 금액, 메시지가 목록 맨 위에 있다.
6. A로 `/broadcasts/<id>/donate`를 직접 열고 "다음"을 누르면 "내 방송에는 후원할 수 없습니다."가 보인다.

API로 확인(위 4번에서 돌아온 주소의 `paymentKey`·`orderId`·`amount`를 쓴다):

```sh
API=http://localhost:3000/api
BODY='{"paymentKey":"<paymentKey>","orderId":"<orderId>","amount":1000}'
curl -s -b b-jar.txt -X POST $API/donations/confirm -H 'Content-Type: application/json' -d "$BODY" -o /dev/null -w '%{http_code}\n'   # 200, 여러 번 보내도 200
curl -s -X POST $API/donations/confirm -H 'Content-Type: application/json' -d "$BODY" -o /dev/null -w '%{http_code}\n'                # 401
curl -s -b a-jar.txt -X POST $API/donations/confirm -H 'Content-Type: application/json' -d "$BODY" -o /dev/null -w '%{http_code}\n'   # 403 (남의 주문)
curl -s -b a-jar.txt -X POST $API/broadcasts/<id>/donations -H 'Content-Type: application/json' -d '{"amount":1000}' -o /dev/null -w '%{http_code}\n'   # 403 (내 방송)
curl -s $API/broadcasts/<id>/donations                       # "total":1000,"count":1 (한 번만 반영)
```

### 9. 팔로우 (#60)

로그인한 시청자가 스트리머를 팔로우하고, 모든 화면 왼쪽 패널에서 팔로우한 스트리머가 지금 LIVE인지 보고 바로 들어간다(PRD §7.1, 인수 시나리오 14). 비로그인 방문자에게는 같은 자리에 LIVE 중인 방송을 보인다. 알림(푸시·이메일·브라우저 알림)은 하지 않는다(PRD §8.2).

이 기능은 `Follow` 테이블을 새로 쓴다. 이 변경을 받은 뒤에는 `pnpm --filter @lsp/api db:migrate`로 마이그레이션을 적용한다.

규칙:

- 스트리머는 `User`다. "지금 LIVE"는 따로 저장하지 않고 그 스트리머의 `LIVE` 방송(하나뿐이다, 3절)으로 읽는다.
- 팔로우·언팔로우는 멱등이다. 두 번 불러도 204이고 행은 하나다.
- 검사 순서는 `로그인 확인 → id 형식(UUID) → 자기 자신 → 스트리머 있음`이다. 언팔로우도 같은 검사를 한다.
- 내 팔로우 목록은 LIVE 먼저(`startedAt` 늦은 순), 그다음 닉네임 순이다. LIVE면 그 방송의 id·제목·시작 시각을 담고, 방송이 끝나면 `live: null`이다.
- 팔로워나 스트리머 어느 쪽 사용자를 지워도 그 팔로우가 함께 지워진다.
- 웹은 `FollowsProvider` 한 곳이 목록을 30초마다, 팔로우·언팔로우 직후 바로 읽는다. 패널, 시청 화면의 팔로우 버튼, `/following`이 같은 목록을 본다. 그래서 방송이 끝난 뒤 패널이 "오프라인"으로 바뀌기까지 30초까지 걸린다.

| 행위 | API | 비로그인 | 로그인(타인) | 자기 자신 |
|---|---|---|---|---|
| 팔로우 | `PUT /api/streamers/:id/follow` | 401 | 204 | 400 `자기 자신은 팔로우할 수 없습니다.` |
| 언팔로우 | `DELETE /api/streamers/:id/follow` | 401 | 204 | 400 `자기 자신은 팔로우할 수 없습니다.` |
| 내 팔로우 목록 | `GET /api/me/follows` | 401 | 200 (내 것만) | — |

그 밖의 응답: UUID 형식이 아닌 id 400, 없는 스트리머 404.

자동 테스트:

- `apps/api/test/authorization-matrix.e2e.spec.ts`: 위 세 행을 2절의 `MATRIX`에 넣었다. "소유자" 칸은 소유자가 자기 자신을 팔로우하는 경우다. 허용 칸은 목록을 다시 읽어 효과를 확인한다.
- `apps/api/test/follows.e2e.spec.ts` (실제 PostgreSQL): 멱등(행 하나), 정렬, 방송 종료 뒤 `live: null`, `READY`·`ENDED` 방송은 LIVE로 보이지 않음, 사용자 삭제 시 양쪽 팔로우 삭제.
- `apps/web/src/follows.test.tsx`: 패널 목록과 링크, 빈 목록 안내, 비로그인 LIVE 5개와 돌아오는 로그인 링크, 팔로우 뒤 패널 즉시 반영, 실패 시 되돌림, 소유자에게 버튼 없음, `/following`과 "팔로잉" 메뉴.
- `apps/web/e2e-stack/follow.spec.ts` (3절의 로컬 스택, 목 없음): 송출 중인 방송에서 팔로우 → 패널에 LIVE → 방송 종료 → 30초 폴링 안에 "오프라인" → 언팔로우 → 사라짐. 소유자에게 버튼 없음, 비로그인이 패널 링크로 로그인하면 같은 시청 화면으로 돌아옴. `SCREENSHOT_DIR=<폴더>`를 앞에 붙이면 `1440-expanded.png`, `1100-collapsed.png`, `360-hidden-menu.png`, `360-following.png`, `1440-anonymous.png`를 남긴다.

```sh
pnpm --filter @lsp/web e2e:stack --workers=1 follow.spec.ts   # WEB_PORT를 바꿨으면 같은 값을 앞에 붙인다
```

화면에서 확인 (2절처럼 "스트리머 A"와 "사용자 B"를 쓴다):

1. A로 방송을 만들고 3절처럼 송출한다.
2. 로그아웃 상태로 폭 1280px 이상에서 "방송 목록"을 연다. 왼쪽 패널 제목이 "LIVE 중인 방송"이고 A의 방송이 빨간 점과 함께 보인다. 아래에 "로그인하고 스트리머를 팔로우해 보세요"가 있다.
3. A의 시청 화면을 연다. 스트리머 이름 옆에 "로그인하고 팔로우"가 보인다. 패널의 로그인 링크를 눌러 B로 로그인한다. 같은 시청 화면으로 돌아오고 패널 제목이 "팔로우한 스트리머", 안내가 "방송을 보다가 팔로우하면 여기에 보입니다."다.
4. "팔로우"를 누른다. 버튼이 "팔로잉"(테두리)으로 바뀌고 패널에 A가 빨간 점, 닉네임, 방송 제목과 함께 바로 나타난다. 누르면 시청 화면으로 간다.
5. 창 폭을 1024~1279px로 줄인다. 패널이 이니셜 원만 남기고 접힌다. 원에 마우스를 올리면 "닉네임 · 방송 제목"이 보인다.
6. 폭을 1024px 미만으로 줄인다. 패널이 사라지고 상단 메뉴에 "팔로잉"이 생긴다. 누르면 `/following`에 같은 목록이 전체 폭으로 보인다.
7. A 창에서 같은 시청 화면을 연다. A에게는 팔로우 버튼이 없다.
8. A가 방송을 종료한다. 30초 안에 B의 패널에서 A가 회색 원과 "오프라인"으로 바뀌고 링크가 없어진다.
9. B가 "팔로잉"을 누른다. "팔로우"로 돌아오고 패널에서 A가 사라진다.

API로 확인 (2절의 `a-jar.txt`·`b-jar.txt`):

```sh
API=http://localhost:3000/api
A=$(curl -s -b a-jar.txt $API/auth/me | sed -E 's/^\{"id":"([^"]+)".*/\1/')

curl -s -o /dev/null -w '%{http_code}\n' -X PUT $API/streamers/$A/follow               # 401
curl -s -o /dev/null -w '%{http_code}\n' -b b-jar.txt -X PUT $API/streamers/$A/follow   # 204
curl -s -o /dev/null -w '%{http_code}\n' -b b-jar.txt -X PUT $API/streamers/$A/follow   # 204 (두 번째도)
curl -s -b b-jar.txt $API/me/follows                     # [{"id":"…","nickname":"스트리머 A","live":null}] (LIVE면 방송 정보)
curl -s -b a-jar.txt -X PUT $API/streamers/$A/follow     # 400 자기 자신은 팔로우할 수 없습니다.
curl -s -o /dev/null -w '%{http_code}\n' -b b-jar.txt -X PUT $API/streamers/not-a-uuid/follow                            # 400
curl -s -o /dev/null -w '%{http_code}\n' -b b-jar.txt -X PUT $API/streamers/00000000-0000-4000-8000-000000000000/follow  # 404
curl -s -o /dev/null -w '%{http_code}\n' -b b-jar.txt -X DELETE $API/streamers/$A/follow   # 204, 다시 불러도 204
curl -s -b b-jar.txt $API/me/follows                     # []
```

## 지원 환경

송출·시청 기능 이슈에서 실제로 확인한 환경만 적는다.

| 확인한 것 | 환경 | 결과 |
|---|---|---|
| 화면 공유 창의 "시스템 오디오와 함께 공유" 스위치 | macOS 26.5, Chrome 156 | "전체 화면" 탭에 스위치가 있고 기본값은 꺼짐이다. "Chrome 탭"에는 "탭 오디오와 함께 공유"(기본값 켜짐)가 있다 |
| 시스템 소리가 실제로 섞이는지 | macOS 26.5, Chrome 156 | 미검증. 전체 화면을 공유하려면 macOS 화면 녹화 권한이 필요하고, 자동 테스트로는 확인하지 않았다 |
| Screen Wake Lock | macOS, Chrome 156 headless (Playwright, Pixel 7 에뮬레이션) | 권한(`screen-wake-lock`)을 주면 잠금을 얻는다. 주지 않으면 `NotAllowedError`로 거절되고 "화면 꺼짐 방지를 켜지 못했습니다."가 뜬다 |
| 모바일 송출, 송출 중 전·후면 전환, 1분 화면 유지 | Chrome 156 headless (Playwright, Pixel 7 에뮬레이션, 가짜 카메라) + 로컬 OME | 송출·전환·해상도 변경 후 hls.js 재생 유지·Wake Lock 유지 확인 (`e2e-stack/mobilePublish.spec.ts`) |
| 같은 기능을 실제 휴대폰에서 (같은 Wi-Fi, 로컬 HTTPS) | Galaxy S22, Slack 앱 안 웹뷰(Android System WebView). Android 버전은 기록하지 않았다 | 2026-11-10 확인. 카메라 송출, PC 시청, 송출 중 전·후면 전환(시청 화면이 약 2~3초 뒤 바뀌고 재생이 이어짐), 1분 방치 뒤에도 송출 유지, 종료(시청 화면이 약 1초 만에 "방송이 끝났습니다."). 방송은 LIVE 93초 뒤 ENDED. mkcert 인증서를 설치하지 않고 경고 화면에서 넘어간 상태로 카메라가 열렸다 |
| 같은 기능을 휴대폰 브라우저 앱에서 | Android Chrome 앱, iOS Safari | 미검증. 위 절차로 확인한 뒤 적는다 |
| PC 화면 + 탭 소리 송출 | Windows, Edge | 미검증 |

macOS 시스템 소리를 직접 확인하는 절차: 시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹음에서 Chrome을 허용한다. 송출 화면에서 "화면 공유" → "전체 화면" → "시스템 오디오와 함께 공유"를 켜고 공유한다. 다른 앱(예: 음악 앱)에서 소리를 내고 화면 소리 미터가 움직이는지 본다.

## 운영 배포

운영 서버는 `deploy/compose.yaml` 하나로 Caddy, API, OvenMediaEngine, PostgreSQL을 띄운다. 첫 배포, 재배포, 로그, 다운 감시는 [docs/OPERATIONS.md](docs/OPERATIONS.md)에 있다. 다운 알림을 받으면 서버 저장소 폴더에서 아래 세 줄로 복구한다.

```sh
sudo systemctl start docker
docker compose -f deploy/compose.yaml up -d --wait
curl -fsS https://lime-live.duckdns.org/api/health
```

## 사용한 오픈소스

기능 이슈에서 들인 라이브러리를 이름·링크·라이선스와 함께 적는다.

| 이름 | 쓰는 곳 | 라이선스 |
|---|---|---|
| [Prisma](https://github.com/prisma/prisma) (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) | DB 스키마·마이그레이션·쿼리 | Apache-2.0 |
| [node-postgres](https://github.com/brianc/node-postgres) (`pg`) | PostgreSQL 연결 풀 | MIT |
| [express-session](https://github.com/expressjs/session) | 세션 쿠키 | MIT |
| [connect-pg-simple](https://github.com/voxpelli/node-connect-pg-simple) | 세션을 PostgreSQL에 저장 | MIT |
| [@nestjs/throttler](https://github.com/nestjs/throttler) | 로그인·회원가입 요청 제한 | MIT |
| [Zod](https://github.com/colinhacks/zod) | 요청 본문 검증 | MIT |
| [OvenLiveKit-Web](https://github.com/AirenSoft/OvenLiveKit-Web) (`ovenlivekit`) | 브라우저 WHIP 송출 | MIT |
| [hls.js](https://github.com/video-dev/hls.js) | LL-HLS 재생 | Apache-2.0 |
| [Playwright](https://playwright.dev) | 웹 e2e 테스트 (개발용, `apps/web/e2e`) | Apache-2.0 |

## 개발

저장소를 받아 로컬에서 띄우고 검사하는 방법이다.

### 실행 방법

필요한 것: Node.js 24 (`.nvmrc`), pnpm 11 (`corepack enable` 또는 `npm i -g pnpm`), Docker, gitleaks (`brew install gitleaks`).

```sh
pnpm install
git config core.hooksPath .githooks   # 커밋 전 비밀값 검사 훅
cp .env.example .env                  # DATABASE_URL, SESSION_SECRET, OME_WEBHOOK_SECRET, OME_API_ACCESS_TOKEN, OME_HOST_IP를 채운다
docker compose up -d --wait           # PostgreSQL + OME
pnpm --filter @lsp/api db:migrate     # Prisma 마이그레이션 적용
pnpm dev                              # API :3000, 웹 :5173
```

`.env` 예시 (compose 기본값과 맞춘 값):

```sh
DATABASE_URL=postgresql://lsp:lsp@localhost:5432/lsp
SESSION_SECRET=<openssl rand -base64 32 결과>
OME_WEBHOOK_SECRET=<openssl rand -base64 32 결과>
OME_API_ACCESS_TOKEN=<openssl rand -hex 24 결과>
OME_HOST_IP=127.0.0.1
```

`pnpm install`이 Prisma 클라이언트를 `apps/api/src/generated/`에 만든다(`postinstall`). 스키마를 바꾸면 `pnpm --filter @lsp/api db:migrate:dev --name <이름>`으로 마이그레이션 파일을 만들고 커밋한다.

브라우저에서 `http://localhost:5173`을 연다. 웹은 `/api` 요청을 Vite dev proxy로 API에 넘긴다. API 상태는 `curl http://localhost:3000/api/health`로 확인한다.

정리:

```sh
docker compose down      # 컨테이너만 내린다
docker compose down -v   # DB 볼륨까지 지운다
```

#### 검사

CI(GitHub Actions)가 push와 pull request마다 같은 명령을 돌린다.

```sh
pnpm typecheck   # tsc --noEmit
pnpm lint        # ESLint + Prettier 검사
pnpm build
pnpm test        # API: Vitest + supertest, 웹: Vitest + Testing Library
pnpm format      # Prettier로 고친다
```

앱 하나만 돌리려면 `pnpm --filter @lsp/api test`처럼 쓴다.

**API 테스트는 실제 PostgreSQL이 필요하다.** `.env`의 `DATABASE_URL`로 접속하고, 테스트마다 모든 테이블을 비운다(`TRUNCATE`). 개발 데이터가 지워지니 필요하면 테스트용 DB를 따로 둔다. 순서:

```sh
docker compose up -d --wait postgres
pnpm --filter @lsp/api db:migrate
pnpm test
```

CI도 같은 순서로 GitHub Actions의 Postgres 서비스에 마이그레이션을 적용한 뒤 테스트를 돌린다. 테스트 파일은 DB를 같이 쓰므로 하나씩 차례로 돈다(`apps/api/vitest.config.ts`의 `fileParallelism: false`).

### 환경변수

`.env.example`에 이름과 설명이 있다. compose, API, 웹이 모두 저장소 루트의 `.env` 하나를 읽는다. 값을 비워 두면 아래 기본값을 쓴다.

| 이름 | 기본값 | 쓰는 곳 |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `lsp` | compose 프로젝트 이름 (컨테이너·볼륨 이름 앞부분) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `lsp` / `lsp` / `lsp` | 로컬 PostgreSQL |
| `POSTGRES_HOST_PORT` | `5432` | PostgreSQL 호스트 포트 (127.0.0.1에만 연다) |
| `DATABASE_URL` | 없음 (필수) | API·Prisma CLI·API 테스트의 DB 연결 |
| `SESSION_SECRET` | 없음 (필수) | 세션 쿠키 서명. 송출 토큰 서명 키도 여기서 만든다. 바꾸면 기존 로그인과 발급된 송출 토큰이 모두 풀린다 |
| `OME_WEBHOOK_SECRET` | 없음 (필수) | OME Admission Webhook 서명 키. API와 OME가 같은 값을 읽는다 |
| `NODE_ENV` | 없음 | `production`이면 세션 쿠키에 `Secure`를 붙인다 |
| `TEST_ACCOUNTS_ENABLED` | 없음 (꺼짐) | `true`면 테스트 계정 원클릭 로그인을 켠다 |
| `TEST_ACCOUNT_A_EMAIL` / `TEST_ACCOUNT_B_EMAIL` | `streamer-a@modak.test` / `user-b@modak.test` | 테스트 계정 이메일 (시드와 API가 같이 읽는다) |
| `TEST_ACCOUNT_A_NICKNAME` / `TEST_ACCOUNT_B_NICKNAME` | `스트리머 A` / `사용자 B` | 테스트 계정 닉네임 (시드만 읽는다) |
| `TEST_ACCOUNT_A_PASSWORD` / `TEST_ACCOUNT_B_PASSWORD` | 없음 (시드에 필수) | 테스트 계정 비밀번호 (시드만 읽는다, 8자 이상) |
| `API_PORT` / `WEB_PORT` | `3000` / `5173` | 개발 서버 포트 |
| `OME_HOST_IP` | `*` | OME가 ICE 후보로 알리는 주소. 로컬 송출은 `127.0.0.1` |
| `OME_HTTP_PORT` | `3333` | OME WebRTC 시그널링 + LL-HLS |
| `OME_ICE_UDP_PORTS` | `10000-10003` | OME WebRTC ICE (UDP 범위) |
| `OME_ICE_TCP_PORT` | `10000` | OME WebRTC ICE (TCP) |
| `OME_TURN_PORT` | `3478` | OME 내장 TURN (TCP) |
| `OME_WEBHOOK_URL` | `http://host.docker.internal:${API_PORT}/api/ome/admission` | OME가 송출 허가를 묻는 API 주소 |
| `OME_API_ACCESS_TOKEN` | 없음 (필수) | OME 관리 API 토큰. API가 방송을 종료할 때 이 토큰으로 송출 연결을 끊는다. compose의 OME도 같은 값을 읽고, 비어 있으면 `docker compose`가 시작하지 않는다 |
| `OME_API_PORT` | `8081` | OME 관리 API의 호스트 포트. `127.0.0.1`에만 열린다 |
| `OME_API_URL` | `http://127.0.0.1:${OME_API_PORT}` | API가 부르는 OME 관리 API 주소 |

#### 여러 worktree에서 동시에 띄우기

worktree마다 `.env`에 다른 프로젝트 이름과 포트를 적으면 서로 충돌하지 않는다.

```sh
COMPOSE_PROJECT_NAME=lsp-feature-x
POSTGRES_HOST_PORT=25433
OME_HTTP_PORT=23333
OME_ICE_UDP_PORTS=20000-20003
OME_ICE_TCP_PORT=20000
OME_TURN_PORT=23478
API_PORT=23000
WEB_PORT=25173
```

OME 포트는 호스트와 컨테이너가 **같은 번호**를 쓴다. OME가 ICE 후보에 자기가 듣는 포트 번호를 그대로 적어 브라우저에 알리기 때문에, `20000:10000`처럼 번호를 바꿔 연결하면 브라우저가 엉뚱한 포트로 접속한다. 그래서 compose는 위 변수로 OME 설정과 포트 연결을 함께 바꾼다.

한계: `OME_HOST_IP`를 비우면 OME가 STUN으로 찾은 공인 IP와 컨테이너 내부 IP(172.x)를 ICE 후보로 알린다. 같은 Mac의 브라우저에서 WebRTC 송출을 하려면 `OME_HOST_IP=127.0.0.1`을 적는다. 비우면 ICE가 `checking`에서 멈춰 송출이 실패한다(#2 실측, #10에서 이 값으로 송출 확인). 같은 Wi-Fi의 휴대폰에서 하려면 Mac의 LAN IP를 적어야 할 것으로 보인다(미확인).

### 커밋 전 비밀값 검사

`.githooks/pre-commit`이 스테이징된 변경을 gitleaks로 검사하고, 토큰·키·비밀번호가 있으면 커밋을 막는다. 저장소를 받은 뒤 한 번 설정한다.

```sh
git config core.hooksPath .githooks
```

비밀값은 `.env`에만 둔다. `.env`는 `.gitignore`에 있다.
