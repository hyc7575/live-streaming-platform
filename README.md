# Lime: 실시간 방송 플랫폼

브라우저로 PC 화면이나 모바일 카메라를 송출하고, 시청자는 로그인 없이 보는 서비스다.

## 심사자용 확인

- 서비스: https://lime-live.duckdns.org
- 테스트 계정: 홈이나 로그인 화면의 "테스트 계정으로 로그인"에서 "스트리머 A" 또는 "사용자 B"를 누른다. 비밀번호를 입력하지 않는다.
- 권장 환경: PC Chrome이나 Edge + 휴대폰 1대. 확인한 브라우저와 기기는 [지원 환경](#지원-환경) 맨 위 표에 있다.

확인 순서 (필수 1~8 약 10분, 선택 9 약 5분). 각 줄 끝의 링크가 자세한 절차다.

1. **PC 송출**: [PC 화면 송출](docs/VERIFICATION.md#pc-화면-송출-13)
   - PC에서 "스트리머 A" → "방송 만들기" → 제목 입력 → "만들기"를 누르면 송출 화면이 열린다.
   - 다른 탭에서 소리 나는 영상을 재생해 둔다.
   - "화면 공유" → 공유 창의 "Chrome 탭"에서 그 탭을 고르고 "탭 오디오와 함께 공유"를 켠다. 송출 화면의 화면 소리 미터가 움직이는지 본다.
   - "방송 시작"을 누르면 "송출 중입니다. 시청자가 방송을 볼 수 있습니다."가 보인다.
   - "방송 만들기"가 "이미 준비 중인 방송이 있습니다"로 막히면, 앞사람이 송출하지 않고 남긴 방송이다. "내 방송"에서 그 방송을 열어 송출하거나 삭제한 뒤 만든다.
2. **휴대폰 시청**: **송출을 시작하고 약 15초 뒤에** 로그인하지 않고 서비스 주소 → "LIVE" 탭 → 방송 카드를 누른다. 그 전에는 "방송 준비 중"이 보이는 것이 정상이고, 시청 화면은 새로고침 없이 플레이어로 바뀐다. 화면, 탭 소리, 마이크 소리가 함께 나온다. 소리가 꺼져 있으면 "소리 켜기"를 누른다. PC 옆에서 들으면 소리가 메아리처럼 겹친다. [아래](#소리가-안-나오거나-겹칠-때)를 본다. [송출에서 시청까지](docs/VERIFICATION.md#3-송출에서-시청까지-10)
3. **권한 거절**: PC 시크릿 창에서 "사용자 B" → A의 방송을 연다. 수정·삭제·종료 버튼이 없고 "팔로우"만 있다. 주소의 `/broadcasts/`를 `/studio/broadcasts/`로 바꿔 열면 "권한이 없습니다"가 보인다. 서버가 거절하는지는 [인증 및 인가](#4-인증-및-인가)의 콘솔 확인으로 본다. [방송 수정·삭제와 인가 매트릭스](docs/VERIFICATION.md#2-방송-수정삭제와-인가-매트릭스)
4. **종료**: A의 송출 화면에서 "방송 종료" → "종료하기"를 누르면 "방송을 종료했습니다."가 보인다. 휴대폰 시청 화면은 10초 안에 "방송이 끝났습니다."로 바뀐다. [방송 종료](docs/VERIFICATION.md#4-방송-종료-11)
5. **다시보기**: 같은 시청 화면에 "다시보기를 준비하는 중입니다."가 보이고, 새로고침하지 않아도 다시보기 플레이어로 바뀐다. 방송 목록의 "다시보기" 탭에도 이 방송이 있다. [녹화·다시보기](docs/VERIFICATION.md#7-녹화다시보기-19)
6. **댓글 작성·수정·삭제**: "사용자 B"로 4번에서 끝낸 방송을 연다(방송 목록 "방송 종료" 탭). "댓글" 탭에서 댓글을 쓰고, 내 댓글의 "수정"·"삭제"를 누른다. 방송 중에는 같은 자리가 채팅이다. [채팅과 댓글](docs/VERIFICATION.md#6-채팅과-댓글-18-91)
7. **모바일 송출**: 휴대폰에서 "스트리머 A" → "방송 만들기" → "만들기" → "카메라 켜기" → 카메라·마이크 허용 → "방송 시작". PC에서 그 방송을 열어 본다. 휴대폰에서 "후면 카메라로 전환"을 누르면 PC 화면도 바뀐다. "방송 종료" → "종료하기"로 끝낸다. [모바일 송출](docs/VERIFICATION.md#모바일-송출-15)
8. **내 내역**: "사용자 B" → 헤더 오른쪽 닉네임 → "마이페이지"에서 라임 충전·후원 내역과 "보낸 후원"을 본다. "스트리머 A"는 "내 방송" → 왼쪽 메뉴 "팔로워"에서 자기 팔로워를 본다. 로그인하지 않고 `/api/me/donations`를 열면 401이다. [마이페이지와 팔로워](docs/VERIFICATION.md#11-마이페이지와-팔로워-117)
9. **선택 기능**: PC에서 "스트리머 A" → "방송 만들기" → 카테고리 "게임" → 게임 칸에 "롤"을 넣고 "리그 오브 레전드"를 고른다 → "만들기" → 1번처럼 "방송 시작".
   - 검색·채널: 헤더 검색창에 "리그"를 넣고 Enter를 누른다. 제목에 "리그"가 없어도 결과 화면의 "방송"에 방금 방송이 있다. 카드 아래 "스트리머 A"를 누르면 채널 페이지가 열린다. [게임 타이틀](docs/VERIFICATION.md#16-게임-타이틀-133), [서버 검색과 결과 화면](docs/VERIFICATION.md#17-서버-검색과-결과-화면-138)
   - 카테고리: 홈의 카테고리 칩 "게임"을 누르면 게임 방송만 남고, 카드에 "게임 · 리그 오브 레전드" 배지가 있다. [방송 카테고리](docs/VERIFICATION.md#15-방송-카테고리-132)
   - 후원: [새 탭 후원과 라임 후원](docs/VERIFICATION.md#10-새-탭-후원과-라임-후원-108-109-110-181), [새 후원 알림](docs/VERIFICATION.md#8-도네이션-20)
     1. 시크릿 창의 "사용자 B"로 그 방송을 열고, A의 송출 창과 나란히 둔다.
     2. "후원하기" → 모달의 "충전하기"로 라임을 충전한다. PC에서 마우스를 쓰면 충전 화면과 토스 결제가 같은 모달 안에 열리고, 휴대폰·터치 태블릿에서는 새 탭에 열린다.
     3. 토스 결제 화면에서 "신용·체크카드"와 카드사를 고르고 본인 카드로 인증한다. 테스트 모드라 돈은 나가지 않는다. 카드사 인증 화면은 실제 결제와 같다.
     4. 충전이 끝나면 모달 폼(새 탭이면 시청 탭)에서 "라임으로 후원"을 누른다. 그동안 영상이 멈추지 않는다.
     5. 5초 안에 시청 탭 플레이어 위에 "사용자 B님이 N라임 후원" 배너가, A의 송출 탭 오른쪽 위에 같은 토스트가 6초 뜬다. 두 탭의 채팅에 같은 후원 줄이 남고, 후원 패널에 합계와 순위가 보인다. 8번의 "마이페이지"에도 충전과 후원이 남는다.
   - OBS: OBS가 있으면 송출 화면의 "OBS로 송출" 탭에서 송출 URL을 받아 OBS로도 송출할 수 있다. [추가 송출 방법: OBS](docs/VERIFICATION.md#추가-송출-방법-obs-89)

송출 중에 다른 화면으로 가려 하면 "송출 중입니다. 이 화면을 떠나면 방송이 끊깁니다."가 뜬다. "머무르기"를 누른다. "송출 서버에 연결하지 못했습니다."가 뜨면 네트워크를 바꾸고 "다시 시도"를 누른다. 회사·학교 망은 송출 포트가 막혀 있을 수 있다. 필요한 포트는 [지원 환경](#지원-환경)에 있다.

### 소리가 안 나오거나 겹칠 때

- 공유 창에서 "Chrome 탭"을 고르고 "탭 오디오와 함께 공유"를 켠다.
- Chrome이나 Edge로 송출한다.
- 송출 화면의 사전 점검을 본다. "화면 소리가 잡히지 않습니다"가 보이면 "다시 선택"을 누른다. [송출 사전 점검](docs/VERIFICATION.md#송출-사전-점검-14)
- 송출 기기 옆에서 시청하면 소리가 몇 초 간격으로 메아리처럼 겹친다. 시청 기기의 스피커 소리를 송출 마이크가 다시 받아 송출하기 때문이다(지연 약 5초마다 한 번씩 되돌아온다). 시청 기기는 이어폰을 쓰거나, 소리를 확인한 뒤 음소거한다. 스트리머 본인이 로그인한 브라우저에서 자기 방송을 열면 플레이어가 음소거로 시작한다.
- 시청 탭을 "탭 오디오와 함께 공유"로 고르지 않는다. 시청 소리가 그대로 다시 송출되어 계속 쌓인다.

## 필수 기능

공모 원문의 체크리스트 순서다. "확인" 칸의 번호는 위 [확인 순서](#심사자용-확인)다. 자동 테스트는 `apps/api/test/`(실제 PostgreSQL), `apps/web/e2e/`(Chrome, CI에서 실행), `apps/web/e2e-stack/`(Chrome + 로컬 OME)에 있다.

### 1. PC 라이브 방송

| 항목 | 확인 | 구현과 자동 테스트 |
|---|---|---|
| PC 화면을 캡처해 실시간으로 송출 | 1, 2 | `getDisplayMedia`로 캡처하고 WHIP(OvenLiveKit-Web)으로 OvenMediaEngine에 보낸다. `apps/web/e2e-stack/pcPublish.spec.ts`가 비로그인 시청자의 재생까지 확인한다 |
| 탭 소리 또는 시스템 소리 + 마이크 음성 | 1, 2 | 화면 소리와 마이크를 Web Audio로 오디오 트랙 하나에 섞는다. 무음 송출을 막으려고 "방송 시작" 클릭 안에서 AudioContext를 재개한다. `apps/web/e2e/pcCapture.spec.ts`, `apps/web/e2e/preflight.spec.ts` |
| 송출 사전 점검 | 1 | 마이크·화면 소리 레벨 미터, 화면 소리가 없으면 경고와 "다시 선택". [송출 사전 점검](docs/VERIFICATION.md#송출-사전-점검-14) |
| 시작·종료 시 송출 연결 생성·종료 | 1, 4 | 종료하면 PeerConnection을 닫고 모든 트랙을 멈춘 뒤 종료 API를 부른다. 브라우저의 "공유 중지"도 종료로 처리한다. `apps/web/e2e-stack/publishToWatch.spec.ts`가 트랙이 모두 `ended`인지 본다 |

### 2. 모바일 라이브 방송

| 항목 | 확인 | 구현과 자동 테스트 |
|---|---|---|
| 휴대폰 카메라 영상 + 마이크 음성 송출 | 7 | PC와 같은 송출 화면이다. 화면 공유가 없는 브라우저에는 "카메라 켜기"만 보인다. 송출 중 전·후면 전환, 화면 꺼짐 방지(Wake Lock), 권한 거부 안내가 있다 |
| 모바일에서 시작·종료 | 7 | `apps/web/e2e/cameraCapture.spec.ts`, `apps/web/e2e-stack/mobilePublish.spec.ts`(Pixel 7 에뮬레이션: 송출, 전환, 1분 방치, 종료 뒤 트랙 정리) |

### 3. 방송 관리 및 시청

| 항목 | 확인 | 구현과 자동 테스트 |
|---|---|---|
| 방송 정보 등록·조회·수정·삭제 | 1, 3 | 제목·설명·카테고리를 등록하고, 소유자는 상세 화면의 "수정"·"삭제"를 쓴다. `apps/api/test/broadcasts.e2e.spec.ts` |
| 목록·상세, PC와 모바일 방송을 다른 기기에서 시청 | 2, 7 | 목록 탭은 전체·LIVE·방송 준비 중·방송 종료·다시보기다. 시청은 LL-HLS를 hls.js로 재생한다(iOS 17.1+ Safari 포함, hls.js를 못 쓰는 iOS 17.0 이하만 네이티브 HLS) |
| 방송 중·종료 상태 관리, 종료 시 송출 중단 | 4 | [방송 상태 관리와 예외 처리](#방송-상태-관리와-예외-처리) |
| 영구 저장, 서버 재시작 뒤 조회 | 6 | PostgreSQL에 저장한다. 6번의 "끝난 방송 예시"는 배포 때 시드로 넣은 방송이다. 운영 서버를 재부팅한 뒤에도 목록이 남는 것을 확인했다([OPERATIONS.md](docs/OPERATIONS.md)). 로컬에서는 아래 절차로 확인한다 |

로컬에서 재시작 뒤 조회 확인([실행 방법](#실행-방법)으로 띄운 상태):

```sh
curl -s http://localhost:3000/api/broadcasts | head -c 300   # 방송 목록
docker compose restart postgres                               # DB 재시작. API도 Ctrl+C 뒤 pnpm dev로 다시 띄운다
curl -s http://localhost:3000/api/broadcasts | head -c 300   # 같은 목록
```

### 4. 인증 및 인가

| 항목 | 확인 | 구현과 자동 테스트 |
|---|---|---|
| 회원가입·로그인·로그아웃, 인증 상태 관리 | 헤더의 "회원가입"·"로그인" | 세션 쿠키(`HttpOnly`, `SameSite=Lax`, 운영은 `Secure`)를 PostgreSQL에 저장해 API를 재시작해도 로그인이 유지된다. 로그아웃하면 서버가 세션을 지운다. 로그인은 IP당 1분 10번으로 제한한다. `apps/api/test/auth.e2e.spec.ts` |
| 비로그인은 조회·시청만, 등록·송출은 로그인 사용자만 | 2, 3 | 비로그인이 "방송 만들기"를 누르면 로그인 화면으로 간다. API는 401이다 |
| 수정·삭제·송출 제어 시 서버에서 소유자 검증 | 3 | 로그인 확인 → 소유자 확인 순서로 거른다(`LoggedInGuard` → `BroadcastOwnerGuard`). 송출 연결도 OME가 서버에 허가를 묻고(Admission Webhook), 서버가 소유자 송출 토큰과 방송 상태를 확인한다. `apps/api/test/authorization-matrix.e2e.spec.ts`가 아래 표의 모든 칸을 방송 상태(`READY`·`LIVE`·`ENDED`)별로 돌리고, 거절된 칸은 DB가 그대로인지 본다 |

| 행위 | 비로그인 | 다른 사용자 | 소유자 |
|---|---|---|---|
| 방송 목록·상세 조회, 시청 | 200 | 200 | 200 |
| 방송 생성 `POST /api/broadcasts` | 401 | 201 | — |
| 방송 수정 `PATCH /api/broadcasts/:id` | 401 | 403 | 200 |
| 방송 삭제 `DELETE /api/broadcasts/:id` | 401 | 403 | 204 (LIVE면 종료한 뒤 삭제) |
| 방송 종료 `POST /api/broadcasts/:id/end` | 401 | 403 | 200 (READY는 409) |
| 송출 토큰 발급 `POST /api/broadcasts/:id/publish-token` | 401 | 403 | 201 (ENDED는 409) |

채팅·댓글·후원·팔로우·라임·이미지 행은 PRD §7.5와 [VERIFICATION.md](docs/VERIFICATION.md)의 각 절에 있다.

**운영 서비스에서 서버 거절 확인**: 화면에서 버튼을 숨기는 것과 별개로 API가 거절하는지 본다. "사용자 B" 창이나 로그인하지 않은 창에서 A의 방송 시청 화면(`/broadcasts/<id>`)을 열고, 개발자 도구 콘솔에 아래를 붙여 넣는다. B는 네 줄 모두 403, 비로그인은 모두 401이다. 소유자 창에서 실행하면 방송이 실제로 지워지므로, 스니펫이 소유자인지 먼저 확인하고 멈춘다.

```js
const id = location.pathname.split('/').at(-1);
const me = await fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null));
const broadcast = await fetch(`/api/broadcasts/${id}`).then((r) => r.json());
if (me?.id === broadcast.streamer.id) throw new Error('소유자 창이다. 사용자 B 창이나 로그인하지 않은 창에서 실행한다.');
const call = (method, path = '', body) =>
  fetch(`/api/broadcasts/${id}${path}`, { method, body, headers: { 'Content-Type': 'application/json' } })
    .then((r) => `${method} ${path || '(방송)'} → ${r.status}`);
console.table(await Promise.all([
  call('PATCH', '', '{"title":"뺏은 제목"}'),
  call('DELETE'),
  call('POST', '/end'),
  call('POST', '/publish-token'),
]));
```

## 선택 기능

| 기능 | 확인 | 구현과 자동 테스트 |
|---|---|---|
| 댓글 작성·조회·수정·삭제, 서버의 작성자 검증 | 6 | 방송 중(`READY`·`LIVE`)에는 채팅, 끝난 뒤(`ENDED`)에는 댓글을 쓴다. 서버가 방송 상태로 정한다. 댓글 수정·삭제는 작성자만 되고, 방송 스트리머도 남의 댓글은 403이다. `apps/api/test/comments.e2e.spec.ts`, `chat.e2e.spec.ts`. [채팅과 댓글](docs/VERIFICATION.md#6-채팅과-댓글-18-91) |
| 도네이션: 후원 대상·금액 선택, 테스트 결제 | 9 | 토스페이먼츠 결제위젯 테스트 모드다. PC 넓은 화면(마우스)은 후원 모달 안에서, 그 밖은 새 탭에서 결제해 시청 영상이 멈추지 않는다. 미리 충전한 라임으로도 후원한다 |
| 도네이션: 서버에서 승인 결과·금액·대상 검증 | 9 | 서버가 주문의 후원자와 금액을 확인한 뒤 토스 승인 API를 부른다. 응답의 `status`가 `DONE`이고 금액·`orderId`·`paymentKey`가 주문과 같을 때만 후원을 확정한다. 다르면 400 또는 502이고 주문은 확정되지 않는다 |
| 도네이션: 중복 승인 통지에도 한 번만 적립, 방송별 내역·합계 | 9 | 주문 행을 잠그고(`SELECT … FOR UPDATE`) 토스에 `Idempotency-Key`로 `orderId`를 보낸다. `orderId`·`paymentKey`는 UNIQUE다. 이미 확정된 주문에 같은 승인이 다시 오면 토스를 부르지 않고 기존 후원을 돌려준다. 결제 완료 화면을 새로고침해도 합계는 한 번만 는다. `apps/api/test/donations.e2e.spec.ts`가 재시도·동시 승인 두 개를 확인한다. [도네이션](docs/VERIFICATION.md#8-도네이션-20) |
| 녹화 저장, 목록·상세·재생, 영상 정보와 위치 영구 저장 | 5 | 방송이 `LIVE`가 되면 OME가 MP4로 녹화하고, 끝나면 파일 목록을 `Broadcast.recordingFiles`(PostgreSQL)에 적는다. "다시보기" 탭과 다시보기 플레이어로 본다. 용량 상한(기본 10GiB)을 넘으면 오래된 녹화부터 지운다. `apps/api/test/recordings.e2e.spec.ts`, `apps/web/e2e-stack/replay.spec.ts`. [녹화·다시보기](docs/VERIFICATION.md#7-녹화다시보기-19) |

## 추가 기능

공모 요구사항 밖에서 더한 기능이다. 자세한 절차는 링크에 있다.

| 기능 | 내용 |
|---|---|
| [팔로우](docs/VERIFICATION.md#9-팔로우-60) | 왼쪽 패널에서 팔로우한 스트리머의 LIVE 여부를 보고 바로 들어간다 |
| [라임 충전·후원](docs/VERIFICATION.md#10-새-탭-후원과-라임-후원-108-109-110-181) | 라임(1라임 = 1원)을 미리 충전해 시청 화면을 떠나지 않고 후원한다 |
| [새 후원 알림·순위](docs/VERIFICATION.md#8-도네이션-20) | 송출 화면 토스트, 시청 화면 배너와 읽어 주기(브라우저 음성), 후원자 순위, 채팅의 후원 줄 |
| [마이페이지](docs/VERIFICATION.md#11-마이페이지와-팔로워-117), [받은 후원 합계](docs/VERIFICATION.md#12-받은-후원-합계-118) | 충전·후원 내역, 팔로워, 스트리머가 받은 후원 합계 |
| [채널 페이지](docs/VERIFICATION.md#13-스트리머-채널-페이지-119), [프로필 편집](docs/VERIFICATION.md#14-프로필-편집-120) | 스트리머별 방송 모음, 소개·프로필 이미지·닉네임 |
| [카테고리](docs/VERIFICATION.md#15-방송-카테고리-132), [게임 타이틀](docs/VERIFICATION.md#16-게임-타이틀-133) | 카테고리 필터, Wikidata 게임 목록에서 고르는 게임 |
| [서버 검색](docs/VERIFICATION.md#17-서버-검색과-결과-화면-138), [헤더 검색](docs/VERIFICATION.md#18-헤더-검색-139) | 스트리머·방송·지난 방송을 한 번에 찾는다 |
| [썸네일](docs/VERIFICATION.md#송출-화면-캡처-썸네일-62), [대기 이미지](docs/VERIFICATION.md#기본-대기-이미지-63) | 송출 화면을 30초마다 캡처한 목록 썸네일, 방송 준비 중 화면 |
| [방송 준비 중 노출](docs/VERIFICATION.md#방송-준비-중-노출-90) | 시작 전 방송을 목록에 올려 시청자가 미리 들어와 기다린다 |
| [OBS 송출](docs/VERIFICATION.md#추가-송출-방법-obs-89) | 방송마다 WHIP URL을 발급해 OBS Studio로 송출한다 |

## 방송 상태 관리와 예외 처리

```mermaid
stateDiagram-v2
    [*] --> READY: 방송 생성
    READY --> LIVE: OME 송출 허가 (Webhook)
    LIVE --> LIVE: 끊긴 뒤 30초 안에 재접속
    LIVE --> ENDED: 소유자 종료 / 끊긴 뒤 30초 초과
    READY --> [*]: 삭제
    ENDED --> [*]: 삭제
```

- **상태는 서버만 바꾼다.** 클라이언트는 요청만 보낸다. `ENDED`는 `LIVE`로 돌아가지 않는다.
- **송출 허가는 서버가 정한다.** OME가 송출을 받기 전에 API에 묻는다(Admission Webhook, HMAC 서명 검증). 서버는 소유자 송출 토큰과 방송 상태를 보고 `READY`이거나 끊긴 지 30초 안인 `LIVE`만 허가한다. 서버가 응답하지 못하면 OME는 거절한다(fail-closed).
- **종료 시 송출 중단**: DB를 먼저 `ENDED`로 저장하고 그다음 OME 관리 API로 송출 연결을 끊는다. 순서가 반대면 그 사이 재접속이 허가될 수 있다. 끊긴 송출자가 다시 접속하면 Webhook이 `ENDED`를 보고 거절한다. 종료 API는 여러 번 불러도 같은 결과다. OME 호출이 실패해 502를 받았으면 다시 부르면 끊긴다.
- **1인 1 LIVE**: DB 부분 유니크 인덱스로 막는다. 두 방송의 허가 요청이 동시에 와도 하나만 `LIVE`가 된다.
- **비정상 종료**: 탭을 닫거나 네트워크가 끊기면 OME가 끊김을 알리고, 30초 안에 다시 연결하지 않으면 `ENDED`가 된다. 새로고침은 같은 방송으로 이어진다.
- **좀비 방송 정리**: 끊김 알림이 빠지거나 순서가 바뀌어도 송출 없는 `LIVE`가 남지 않게, 30초마다 OME 스트림 목록과 DB를 대조한다. OME 목록을 읽지 못한 회차는 DB를 하나도 바꾸지 않는다.
- **시청자 종료 감지**: 시청 화면은 상태를 5초마다 읽고, 재생 오류 때도 바로 읽는다. `ENDED`면 플레이어를 내리고 "방송이 끝났습니다."를 띄운다.

근거는 [PRD §7.4](docs/PRD.md), 자동 테스트는 `apps/api/test/publish.e2e.spec.ts`, `reconnect-grace.e2e.spec.ts`, `apps/web/e2e-stack/abnormalEnd.spec.ts`다. 절차는 [방송 종료](docs/VERIFICATION.md#4-방송-종료-11), [비정상 종료와 재접속 유예](docs/VERIFICATION.md#5-비정상-종료와-재접속-유예-12)에 있다.

## 지원 환경

| 기능 | 확인한 환경 |
|---|---|
| PC 화면 송출 (탭 소리·시스템 소리 + 마이크) | Windows 11 Chrome 157, Edge 157 |
| 모바일 카메라 송출 | iPhone 12 Safari, Galaxy S22 Chrome 앱 |
| 비로그인 시청 | Windows 11 Chrome 157, Edge 157 · iOS Safari 17.1+ (iOS Simulator) |
| 주의 | iOS 17.0 이하 Safari 시청은 확인하지 않았다. 송출 UDP 포트가 막힌 회사·학교 망에서는 송출이 안 될 수 있다(아래 송출 포트) |

아래는 송출·시청 기능 이슈에서 실제로 확인한 환경과 결과의 상세다.

| 확인한 것 | 환경 | 결과 |
|---|---|---|
| 화면 공유 창의 "시스템 오디오와 함께 공유" 스위치 | macOS 26.5, Chrome 156 | "전체 화면" 탭에 스위치가 있고 기본값은 꺼짐이다. "Chrome 탭"에는 "탭 오디오와 함께 공유"(기본값 켜짐)가 있다 |
| 시스템 소리가 실제로 섞이는지 | macOS 26.5, Chrome 156 | 미검증. 전체 화면을 공유하려면 macOS 화면 녹화 권한이 필요하고, 자동 테스트로는 확인하지 않았다 |
| Screen Wake Lock | macOS, Chrome 156 headless (Playwright, Pixel 7 에뮬레이션) | 권한(`screen-wake-lock`)을 주면 잠금을 얻는다. 주지 않으면 `NotAllowedError`로 거절되고 "화면 꺼짐 방지를 켜지 못했습니다."가 뜬다 |
| 모바일 송출, 송출 중 전·후면 전환, 1분 화면 유지 | Chrome 156 headless (Playwright, Pixel 7 에뮬레이션, 가짜 카메라) + 로컬 OME | 송출·전환·해상도 변경 후 hls.js 재생 유지·Wake Lock 유지 확인 (`e2e-stack/mobilePublish.spec.ts`) |
| 같은 기능을 실제 휴대폰에서 (같은 Wi-Fi, 로컬 HTTPS) | Galaxy S22, Slack 앱 안 웹뷰(Android System WebView). Android 버전은 기록하지 않았다 | 2026-11-10 확인. 카메라 송출, PC 시청, 송출 중 전·후면 전환(시청 화면이 약 2~3초 뒤 바뀌고 재생이 이어짐), 1분 방치 뒤에도 송출 유지, 종료(시청 화면이 약 1초 만에 "방송이 끝났습니다."). 방송은 LIVE 93초 뒤 ENDED. mkcert 인증서를 설치하지 않고 경고 화면에서 넘어간 상태로 카메라가 열렸다 |
| 비로그인 LIVE 시청 (hls.js + `ManagedMediaSource`) | **iOS Simulator** iOS 26.5, iPhone 17 Pro, Safari. 실기기 아님 | 2026-11-17 확인(#246). LIVE 뒤 30초에 열면 2.2초 만에 재생, LIVE 뒤 6초에 열면 8.4~13.6초(3회). 60초 동안 재생 위치 60초 증가. 음소거로 자동 재생되고 "소리 켜기"로 음소거가 풀림. 송출 종료 뒤 약 3초에 "방송이 끝났습니다." 더블탭 전체화면은 자동화로 누를 수 없어 미확인 |
| iOS 17.0 이하 Safari 시청 | — | 주의: hls.js를 못 써 네이티브 HLS로 보낸다. iOS 네이티브 HLS는 OME 플레이리스트(`PART-TARGET=0`)를 거부해 재생되지 않을 수 있다(#246). 확인하지 않았다 |
| 모바일 송출 (실기기) | iPhone 12, Safari. iOS 버전과 확인한 날짜는 기록하지 않았다 | 송출한 방송이 다른 기기에서 영상으로 재생되고, 마이크 소리가 들리고, 종료까지 동작했다. 지연은 재지 않았다 |
| 모바일 송출 (실기기, Chrome 앱) | Galaxy S22, Android Chrome 앱. Android·Chrome 버전과 확인한 날짜는 기록하지 않았다 | 송출 흐름이 정상 동작했다. 항목별(소리, 전·후면 전환, 종료) 결과는 따로 기록하지 않았다 |
| PC 화면 + 탭 소리 송출, 비로그인 교차 시청 | Windows 11, Chrome 157.0.8103.79 · Edge 157.0.4341.60 (Playwright headed, 가짜 마이크·카메라, 공유 창은 탭 제목으로 자동 선택) + 운영 서비스 | Chrome 송출 → Edge 시청, Edge 송출 → Chrome 시청을 2번씩 돌려 모두 통과. 방송 시작 약 0.85초, 시청 재생까지 11~12초(LIVE 표시 10초 지연 포함). 공유한 탭의 440Hz 소리가 시청 쪽에서 -33dB(배경 약 -120dB)로 들렸고, 10초 동안 재생 위치가 10초 늘었다. 종료 뒤 0.6~1.6초에 "방송이 끝났습니다.", 6~26초 뒤 다시보기가 재생됐다. 같은 PC에서 `apps/web/e2e` 45개도 Chrome·Edge 모두 통과. 실제 마이크 소리는 사람이 Chrome·Edge 각각으로 송출해 다른 PC의 시청 화면에서 들리는 것을 확인했다. "전체 화면"을 "시스템 오디오 공유"와 함께 공유했을 때 PC 시스템 소리도 다른 PC에서 잘 들렸다 |
| 송출 이상 상황, 플레이어 컨트롤, 후원 모달 결제 | Windows 11, Chrome 157 · Edge 157 (Playwright headed, 가짜 장치) + 운영 서비스 | 송출과 시청을 두 브라우저로 엇갈려 돌려 모두 통과. 송출 중 이동·탭 닫기에 확인창이 뜨고, "머무르기"·취소하면 송출이 이어진다. 새로고침 뒤 다시 시작하면 2~3초 만에 같은 방송이 이어지고, 시청 화면은 새로고침 없이 약 40초 뒤 다시 재생된다. 공유를 중지하면 사유와 함께 종료되고, 탭을 강제로 닫으면 30~60초 뒤 방송 종료가 된다. 일시정지 뒤 "라이브로 이동"을 누르면 지연이 약 28초에서 1.8초로 돌아오고, 음소거·전체화면·볼륨 기억이 동작한다. 마우스 PC에서 "카드로 후원"을 누르면 토스 결제창이 모달 안에 열리고 그동안 영상이 멈추지 않는다. 토스 테스트 결제 승인은 사람이 직접 확인했다 |

송출 포트: 송출은 WebRTC라 UDP 10000-10003, TCP 10000, TCP 3478이 열려 있어야 한다(`deploy/compose.yaml`). 회사나 학교 망처럼 막힌 곳에서는 "송출 서버에 연결하지 못했습니다."가 뜰 수 있으니 휴대폰 데이터나 집 Wi-Fi로 바꾼다. 시청은 443 포트만 쓰므로 영향이 없다.

macOS 시스템 소리를 직접 확인하는 절차: 시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹음에서 Chrome을 허용한다. 송출 화면에서 "화면 공유" → "전체 화면" → "시스템 오디오와 함께 공유"를 켜고 공유한다. 다른 앱(예: 음악 앱)에서 소리를 내고 화면 소리 미터가 움직이는지 본다.

## 구성

| 경로 | 내용 |
|---|---|
| `apps/api` | NestJS API (TypeScript strict). 모든 경로는 `/api` 아래에 있다 |
| `apps/web` | React + Vite 웹 앱 (TypeScript strict). UI 지침은 `apps/web/CLAUDE.md` |
| `compose.yaml` | 로컬 개발용 PostgreSQL, OvenMediaEngine, 녹화·썸네일 정적 서버 |
| `deploy/` | 운영 서버 compose(Caddy, API, OME, PostgreSQL, 백업). 절차는 [docs/OPERATIONS.md](docs/OPERATIONS.md), 구성도는 [docs/architecture/system-overview.html](docs/architecture/system-overview.html) |
| `docs/` | 기능별 확인 절차([VERIFICATION.md](docs/VERIFICATION.md)), 개발 세부([DEVELOPMENT.md](docs/DEVELOPMENT.md)), PRD, pre-mortem, 결정 기록(`docs/adr/`), 기능별 문서(`docs/features/<기능>/`). 문서 지도는 [docs/README.md](docs/README.md), 용어는 루트의 `GLOSSARY.md` |

## 실행 방법

저장소를 받아 로컬에서 띄우고 검사하는 방법이다.

필요한 것: Node.js 24 (`.nvmrc`), pnpm 11 (`corepack enable` 또는 `npm i -g pnpm`), Docker, gitleaks (`brew install gitleaks`).

```sh
pnpm install
git config core.hooksPath .githooks   # 커밋 전 비밀값 검사 훅
cp .env.example .env                  # DATABASE_URL, SESSION_SECRET, OME_WEBHOOK_SECRET, OME_API_ACCESS_TOKEN, OME_HOST_IP를 채운다
docker compose up -d --wait           # PostgreSQL + OME
pnpm --filter @lsp/api db:migrate     # Prisma 마이그레이션 적용
pnpm --filter @lsp/api games:seed     # 게임 목록(apps/api/data/games.json)을 Game 테이블에 넣는다
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

테스트 계정 버튼("스트리머 A"·"사용자 B")을 쓰려면 `.env`에 아래를 더하고 시드를 돌린 뒤 API를 다시 띄운다. 시드는 끝난 방송 예시도 하나 만든다. 자세한 동작은 [테스트 계정 원클릭 로그인](docs/VERIFICATION.md#테스트-계정-원클릭-로그인)에 있다.

```sh
TEST_ACCOUNTS_ENABLED=true
TEST_ACCOUNT_A_PASSWORD=<8자 이상>
TEST_ACCOUNT_B_PASSWORD=<8자 이상>
```

```sh
pnpm --filter @lsp/api db:seed
```

정리:

```sh
docker compose down      # 컨테이너만 내린다
docker compose down -v   # DB 볼륨까지 지운다
```

### 검사

CI(GitHub Actions)가 push와 pull request마다 같은 명령을 돌린다.

```sh
pnpm typecheck   # tsc --noEmit
pnpm lint        # ESLint + Prettier 검사
pnpm build
pnpm test        # API: Vitest + supertest, 웹: Vitest + Testing Library
pnpm format      # Prettier로 고친다
```

앱 하나만 돌리려면 `pnpm --filter @lsp/api test`처럼 쓴다.

API 테스트는 실제 PostgreSQL을 쓰고 테스트마다 테이블을 비운다. 테스트용 DB를 따로 두는 방법은 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)에 있다. 브라우저 e2e는 `pnpm --filter @lsp/web e2e`(CI와 같음)와 `pnpm --filter @lsp/web e2e:stack`(로컬 OME 필요)이다.

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
| `RECORDINGS_DIR` | 저장소 루트의 `recordings/` | 녹화 파일 폴더. OME가 쓰고 API가 용량을 재고 지운다. 바꾸려면 절대 경로를 넣는다 |
| `RECORDINGS_MAX_GB` | `10` | 녹화 저장 용량 상한(GiB). 넘으면 오래 전에 끝난 방송의 녹화부터 지운다. 송출 중인 녹화만으로 넘으면 끝난 방송의 녹화는 두고 송출 중인 녹화를 멈춘다 |
| `RECORDINGS_MAX_GB_PER_BROADCAST` | `3` | 방송 하나의 녹화 크기 상한(GiB). 넘으면 그 방송의 녹화만 멈추고 송출은 유지한다. 전체 상한보다 크면 전체 상한을 쓴다 |
| `RECORDINGS_MAX_HOURS_PER_BROADCAST` | `3` | 방송 하나의 녹화 시간 상한(시간). LIVE가 된 때부터 잰다 |
| `RECORDINGS_HTTP_PORT` | `8090` | 개발용 녹화 정적 서버의 호스트 포트(127.0.0.1에만 열린다). Vite가 `/recordings`를 여기로 넘긴다 |
| `THUMBNAILS_DIR` | 저장소 루트의 `thumbnails/` | 캡처 썸네일과 기본 대기 이미지 폴더. 바꾸려면 절대 경로를 넣는다 |
| `THUMBNAILS_HTTP_PORT` | `8091` | 개발용 썸네일 정적 서버의 호스트 포트(127.0.0.1에만 열린다). Vite가 `/thumbnails`를 여기로 넘긴다 |
| `TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` | 없음 (비우면 후원·충전만 503) | 토스 결제위젯 테스트 키(`test_gck_…`/`test_gsk_…`). 시크릿 키는 API만 읽는다. [도네이션](docs/VERIFICATION.md#8-도네이션-20) |
| `WEB_HTTPS_CERT` / `WEB_HTTPS_KEY` | 없음 | 같은 Wi-Fi 휴대폰 확인용 웹 https 인증서(`scripts/lan-https.sh`가 만든다). e2e를 돌릴 때는 비운다 |

### 커밋 전 비밀값 검사

`.githooks/pre-commit`이 스테이징된 변경을 gitleaks로 검사하고, 토큰·키·비밀번호가 있으면 커밋을 막는다. 저장소를 받은 뒤 한 번 설정한다.

```sh
git config core.hooksPath .githooks
```

비밀값은 `.env`에만 둔다. `.env`는 `.gitignore`에 있다.

## 향후 과제

- iOS 17.0 이하 iPhone 재생. OME(v0.21.0)는 비디오를 트랜스코딩 없이 넘길 때 LL-HLS 비디오 플레이리스트에 `PART-TARGET=0`을 써서, iOS 네이티브 HLS가 플레이리스트를 거부한다. 지금은 iOS 17.1+를 hls.js로 보내 피했다(#246). OME 쪽 설정(트랜스코딩 등)으로 고치면 오래된 iPhone도 재생할 수 있을지 모르지만, 확인하지 않았고 운영 재배포가 필요하다.
- 송출 직후 연 시청자의 지연. 첫 플레이리스트가 짧을 때 hls.js가 맨 앞부터 재생해 라이브 끝보다 약 16초 뒤처지고 1배속이라 따라잡지 못한다(#248 측정). hls.js의 라이브 동기화 설정(`liveSyncDuration`, `maxLiveSyncPlaybackRate`)으로 다룰 수 있다.
- 채널 스트림 키(치지직·트위치 방식)로 OBS 송출. 지금은 방송마다 WHIP URL을 발급한다(#89). OME 스트림 이름이 곧 방송 ID라서 녹화·재생·정리가 모두 이 전제에 기대고 있다. 고정 키를 쓰려면 Admission Webhook의 `new_url`로 스트림 이름을 바꿔야 하는데 WHIP에서 동작하는지 확인되지 않았고, READY 방송이 여럿일 때 키를 어느 방송으로 보낼지도 정해야 한다(PRD §8.2).

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
| [OvenMediaEngine](https://github.com/AirenSoft/OvenMediaEngine) (Docker 이미지 `ovenmedialabs/ovenmediaengine:v0.21.0`, 수정하지 않고 그대로 사용) | 송출 수신(WebRTC/WHIP), LL-HLS 변환, MP4 녹화 | AGPL-3.0-only |
| [OvenLiveKit-Web](https://github.com/AirenSoft/OvenLiveKit-Web) (`ovenlivekit`) | 브라우저 WHIP 송출 | MIT |
| [hls.js](https://github.com/video-dev/hls.js) | LL-HLS 재생 | Apache-2.0 |
| [Playwright](https://playwright.dev) | 웹 e2e 테스트 (개발용, `apps/web/e2e`) | Apache-2.0 |
| [TossPayments SDK](https://github.com/tosspayments/browser-sdk) (`@tosspayments/tosspayments-sdk`) | 후원·라임 충전 결제위젯 | MIT |
| [Pretendard](https://github.com/orioncactus/pretendard) (`pretendard`) | 웹 글꼴 | OFL-1.1 |
| [Wikidata](https://www.wikidata.org) (데이터) | 게임 목록 스냅샷 `apps/api/data/games.json` | CC0 |

`ome/Server.xml`은 OvenMediaEngine의 [설정 파일 구조](https://airensoft.gitbook.io/ovenmediaengine/configuration)를 따른다. OME 기본 설정 예시의 호스트 이름(`*.airensoft.com`)이 일부 남아 있고, 이 프로젝트의 송출·녹화·Webhook에 맞게 고쳐 썼다.

