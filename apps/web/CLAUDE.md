# 웹 앱 (apps/web) UI 지침

UI를 만들거나 고치기 전에 이 파일을 읽는다. 여기 없는 결정이 필요하면 기존 화면과 같은 방식을 따르고, 새로 정한 것은 이 파일에 추가한다.

## 서비스 정체성

- 이름: **Lime**. 화면 문구, `<title>`, 로고에 이 이름만 쓴다.
- 로고: `AppLayout`의 `Logo`. "L", 점 없는 "ı", "me" 글자에 i의 점을 라임색 원으로 따로 그린다. 점은 진한 라임 테두리를 두른 라임 원이다. 첫 로드에 한 번, hover·focus 때 다시 통통 튄다(`dot-bounce`). 계속 반복하지 않는다. `prefers-reduced-motion: reduce`면 튀지 않는다. 이미지 파일 없이 CSS로 그린다.
- Twitch·치지직은 **레이아웃과 정보 배치만** 참고한다. 그 서비스의 로고, 색(Twitch 보라, 치지직 초록), 이름, 아이콘, 문구를 쓰지 않는다.

## 색·글꼴·간격

- 값은 `src/styles/tokens.css`의 CSS 변수로만 쓴다. 컴포넌트 CSS에 색 코드나 px 간격을 직접 적지 않는다. 새 값이 필요하면 토큰을 먼저 추가한다.
- 테마는 밝은 배경 하나다(Twitch 밝은 테마처럼 흰 톤, `--color-bg` #f7f7f8, 상단 바·카드 `--color-surface` #ffffff). 어두운 테마는 만들지 않는다. 영상이 나오는 자리만 `--color-video-bg`(검정)를 쓴다.
- 브랜드 색은 라임 `--color-brand`(#c4f04d). 치지직의 민트빛 초록과 다른 노란빛 연두다. 흰 배경에서 대비가 1.3:1이라 **면(버튼 배경, 로고 점)에만** 쓰고 글자는 `--color-on-brand`로 얹는다. 링크 글자·포커스 테두리·hover 외곽선처럼 흰 바탕 위 글자·선은 진한 라임 `--color-brand-strong`(#4a7a0c, 흰 배경 대비 5.1:1)을 쓴다. 주요 버튼(방송 시작, 로그인)과 링크 강조에만 쓴다.
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

본문 왼쪽에는 모든 화면에 팔로우 패널(`layout/FollowPanel`)을 둔다. 폭 1280px 이상은 펼친다(`--follow-panel-width` 240px). 1024~1279px는 이니셜 원과 LIVE 점만 보이게 접는다(`--follow-panel-collapsed-width` 56px). 접히면 제목·안내 문구는 숨기고 항목의 `title`로 닉네임·방송 제목을 보인다. 1024px 미만은 패널을 숨기고 상단 메뉴에 "팔로잉"(`/following`, 로그인했을 때만)을 둔다. 폭에 따라 자동으로만 바뀌고 접기·펼치기 버튼은 없다.

- 로그인: 제목 "팔로우한 스트리머". LIVE는 이니셜 원과 빨간 점(`--color-live`), 닉네임, 방송 제목(한 줄 말줄임), 시청 화면 링크. 오프라인은 회색 원과 "오프라인"이고 링크가 없다(스트리머 페이지가 없다). 팔로우가 없으면 "방송을 보다가 팔로우하면 여기에 보입니다."
- 비로그인: 제목 "LIVE 중인 방송", `GET /api/broadcasts?status=LIVE`의 앞 5개, "로그인하고 스트리머를 팔로우해 보세요" 링크(로그인 뒤 이 화면으로 돌아온다). 30초마다 다시 읽는다.
- 아이콘·이미지는 쓰지 않는다. 아바타는 닉네임 첫 글자다.

| 화면 | 경로 | 배치 (참고: Twitch·치지직) |
|---|---|---|
| 방송 목록 | `/` | 카드 그리드 `repeat(auto-fill, minmax(280px, 1fr))`. 카드 = 16:9 썸네일 영역(왼쪽 위에 상태 배지) + 제목 + 스트리머 이름. LIVE 먼저, 그다음 방송 종료. 위에 필터 탭 전체·LIVE·방송 종료·다시보기(`/?status=LIVE`·`ENDED`·`REPLAY`). 다시보기는 `GET /api/replays`(녹화가 있는 방송 종료, 늦게 끝난 순). 탭 위에 검색창(`type="search"`, 화면에 보이지 않는 label "방송 검색", 폭은 최대 `--list-search-max-width`, 좁은 화면은 한 줄 전체)을 둔다. 현재 탭에서 받아 온 목록을 브라우저에서 제목·스트리머 닉네임으로 거른다(부분 일치, 대소문자·앞뒤 공백 무시). API는 부르지 않는다. 검색어는 `?q=`에 `replace`로 남기고, 탭 링크도 `q`를 붙여 탭을 바꿔도 남는다. 맞는 방송이 없으면 "'<검색어>'와 맞는 방송이 없습니다."와 "검색어 지우기" 버튼(누르면 검색창에 포커스)을 띄우고, 목록 자체가 비면 탭의 빈 문구를 그대로 쓴다. 썸네일은 `components/BroadcastThumbnail`이 그린다. 이미지가 없으면 제목 첫 글자를 상태색 글자(`--font-size-display`)로 크게 그리고, 배경은 옅은 상태색 면(`--color-live-soft`·`--color-ready-soft`·`--color-ended-soft`)으로 칠한다. LIVE 카드는 오른쪽 아래에 경과 시간을 분 단위(`N분`·`H시간 M분`, 1분 미만은 "방금 시작")로 작게 보이고 1분마다 갱신한다 |
| 시청 | `/broadcasts/:id` | 넓은 화면: 왼쪽 16:9 플레이어, 아래에 제목·스트리머·상태 배지·설명. LIVE면 플레이어(`components/LivePlayer`: LL-HLS, MediaSource가 있으면 hls.js 저지연 모드, 없으면(iPhone) 네이티브 HLS, 준비 전에는 "방송을 불러오는 중입니다"를 띄우고 다시 시도). 브라우저 기본 컨트롤(`controls`)은 쓰지 않고 `components/player/PlayerControls`(재생 엔진을 모르는 표시 전용, 상태는 `useMediaState`가 video 이벤트로 읽는다)를 영상 위에 올린다. 아래 그라데이션 바에 재생/일시정지, 음소거(PC는 hover·focus 때 볼륨 슬라이더를 펼치고, 터치 기기는 숨긴다), LIVE 표시, 오른쪽 끝에 전체화면. LIVE 표시는 라이브 끝(hls.js `liveSyncPosition`, 네이티브는 `seekable` 끝)에서 3초 이내면 빨간 점 "LIVE", 더 뒤처지면 회색 점 "라이브로 이동" 버튼이고 누르면 라이브 끝으로 이동해 재생한다. 일시정지 중이면 가운데에 큰 재생 버튼. 영상 클릭은 재생/일시정지, 더블클릭은 전체화면(미지원이면 iPhone `webkitEnterFullscreen`), 터치에서 숨은 컨트롤을 첫 탭하면 컨트롤만 띄운다. 3초 입력이 없으면 컨트롤과 커서를 숨기고, 일시정지 중·컨트롤에 포커스가 있을 때·슬라이더를 끄는 중에는 숨기지 않는다. 키보드는 플레이어에 포커스가 있을 때만 받는다(Space·K 재생, M 음소거, F 전체화면, ↑↓ 볼륨 10%. 한글 자판에서도 되도록 `event.code`로 읽는다). 볼륨만 `localStorage`(`lime.player.volume`)에 기억하고 음소거 여부는 기억하지 않는다. 아이콘은 `player/PlayerIcons`의 직접 그린 인라인 SVG(`currentColor`)다. 소유자가 보면 플레이어를 음소거로 시작하고 아래에 하울링 안내를 띄운다(T7). 다른 시청자는 소리를 켠 채 시작하고, 브라우저가 자동 재생을 막으면 음소거로 재생한다. 음소거로 시작했으면 왼쪽 위에 "소리 켜기" 버튼을 띄우고, 누르거나 직접 음소거를 바꾸면 사라진다. 상태는 5초마다, 재생 오류 때는 바로 다시 조회해 `ENDED`면 플레이어를 내리고 "방송이 끝났습니다."를 띄운다(PRD §7.4 T9). `ENDED`이면서 `recordingFiles`가 있으면 그 자리에 다시보기 플레이어(`components/ReplayPlayer`: `/recordings/<파일>`을 재생)를 둔다. 라이브와 같은 `PlayerControls`를 `live` 없이 올린다. 길이를 아는 녹화라 LIVE 표시 대신 바 위 한 줄에 탐색 바("재생 위치", 라임 `accent-color`)를, 볼륨 옆에 `현재 / 전체` 시간(`formatClock`)을 두고, 키보드 ←→로 5초씩 이동한다. 전체화면 왼쪽에 재생 속도 버튼을 두고, 누를 때마다 `1x → 1.25x → 1.5x → 2x → 0.5x → 1x` 순서로 바꾼다. 버튼 글자는 현재 속도, 이름은 "재생 속도 1.5배"다. `playbackRate`와 `defaultPlaybackRate`를 함께 바꿔 다음 부로 넘어가도 속도가 남는다(`src`를 바꾸면 브라우저가 `playbackRate`를 기본값으로 되돌린다). 속도는 기억하지 않아 새로 열면 1배속이고, 라이브 플레이어에는 속도 버튼이 없다. 송출 연결이 끊겼다 이어지면 녹화가 여러 파일로 나뉘므로, 한 부가 끝나면 다음 부를 이어서 재생하고(부를 바꿔도 같은 video 요소에 `src`만 바꿔 볼륨·음소거·컨트롤이 그대로 남는다), 둘 이상이면 플레이어 아래에 "1부"·"2부" 버튼(`aria-pressed`)과 나뉜 이유 한 줄을 둔다. 스트리머 이름 옆에 팔로우 버튼(`follows/FollowButton`): "팔로우"(라임 면)/"팔로잉"(테두리), `aria-pressed`. 누르면 바로 바뀌고 목록을 다시 읽은 뒤 그 값을 따른다. 실패하면 원래 상태로 되돌리고 짧은 오류 문구를 띄운다. 소유자에게는 없고, 비로그인은 버튼 대신 "로그인하고 팔로우" 링크(로그인 뒤 이 화면으로 돌아온다). 설명 아래에 소유자에게만 송출 화면 링크(방송 종료 제외)와 방송 종료(LIVE일 때만)·수정·삭제 버튼(`OwnerActions`, 종료와 삭제는 한 번 더 확인, LIVE 삭제는 확인 문구에 방송도 종료된다고 적는다). 폭 1024px 이상은 오른쪽 열(`--comment-column-width`)에 댓글(`components/CommentPanel`)을 두고, 패널은 화면 높이에 맞춰 붙어 있으며 목록만 스크롤한다. 좁은 화면: 플레이어 → 정보 → 댓글 세로 배치(목록 최대 높이 `--comment-list-max-height`). 댓글은 오래된 순이고 처음과 내가 등록한 뒤에는 맨 아래(최신)로 스크롤한다. 위로 올려 읽는 중이면 새 댓글이 와도 위치를 지킨다. 목록은 방송이 LIVE면 1초, 아니면 5초마다(상태는 화면이 5초마다 읽은 값을 쓴다), 내가 등록·수정·삭제한 뒤에는 바로 다시 읽는다(실시간 푸시 없음, PRD §8.2). 비로그인은 입력창 대신 "로그인하고 댓글을 남겨 보세요" 링크(로그인 뒤 이 화면으로 돌아온다). LIVE면 채팅처럼 한 줄에 닉네임과 글을 붙여 쓰고, 뒤에 시각(시:분, 마우스를 올리면 날짜까지)을 작게 두며 줄 간격을 좁힌다. 방송 전·방송 종료는 닉네임·시각 줄 아래에 글을 둔다. 두 모양 모두 고친 댓글은 "(수정됨)". 수정·삭제는 내 댓글에만 보이고(스트리머도 남의 댓글은 못 고친다, PRD §7.5) 삭제는 한 번 더 확인한다. 왼쪽 열 정보 아래(좁은 화면도 정보 다음, 댓글 앞)에 후원(`components/DonationPanel`): "후원" 제목 옆에 누적 금액 `N원`과 건수, 아래에 최근 후원(닉네임·금액·시각·메시지, 최신 순, 최대 50건, 목록 최대 높이 `--donation-list-max-height`). 결제가 끝난(PAID) 후원만 보인다. 5초마다 다시 읽는다. LIVE일 때 로그인한 시청자(스트리머 본인 제외)에게만 "후원하기" 링크(`/broadcasts/:id/donate`), 비로그인은 "로그인하고 후원해 보세요" 링크(로그인 뒤 이 화면으로 돌아온다). 후원이 없으면 "아직 후원이 없습니다." 금액 표기는 `formatWon`(`toLocaleString('ko-KR')` + "원"). `READY`면 플레이어 자리를 `--color-video-bg`로 칠하고 "방송 전입니다. 스트리머가 방송을 시작하면 자동으로 재생합니다."를 띄운다. 5초 상태 조회가 `LIVE`를 읽으면 새로고침 없이 플레이어로 바뀐다. LIVE면 상태 배지 옆에 `startedAt`부터 흐른 시간(`components/ElapsedTime`, `H:MM:SS`, 1시간 미만은 `M:SS`)을 1초마다 갱신한다. 스크린리더가 매초 읽지 않게 `aria-live`는 쓰지 않고, `<time dateTime>`에 시작 시각을 넣는다. 링크 복사 버튼은 두지 않는다(주소창으로 충분하다) |
| 후원하기 | `/broadcasts/:id/donate` | 로그인 필요. 가운데 정렬 카드(폭 `--donate-card-width`, 결제 위젯 자리). 위에 스트리머와 방송 제목. 1단계: 금액 버튼 1,000·5,000·10,000원(`aria-pressed`)과 직접 입력(1,000~100,000원 정수), 메시지(선택, 100자, 글자 수 표시). "다음"이 주문을 만든다(`POST /api/broadcasts/:id/donations`). 403·409·503은 API 문구를 그대로 띄운다. 2단계: 토스페이먼츠 결제위젯(`donation/tossWidget`, SDK `@tosspayments/tosspayments-sdk`)을 주문 금액으로 `#donation-payment-methods`·`#donation-agreement`에 그리고 "결제하기"로 결제창을 연다. "금액 바꾸기"는 1단계로 돌아간다(새 주문을 만든다). 위젯 코드는 `donation/tossWidget` 한 곳에만 둔다 |
| 후원 완료 | `/donations/success` | 로그인 필요. 토스가 `paymentKey`·`orderId`·`amount`를 붙여 보내면 `POST /api/donations/confirm`을 화면을 열 때 한 번 부른다(StrictMode 이중 실행도 ref로 막는다. 새로고침은 다시 부르고 API가 같은 후원을 돌려준다). 성공하면 "후원했습니다."와 금액, 방송으로 돌아가는 링크. 실패하면 API 문구(400·409·502·503)나 안내 문구와 방송 목록 링크 |
| 후원 실패 | `/donations/fail` | 토스가 붙인 `message`를 띄운다. `code=PAY_PROCESS_CANCELED`(결제창을 닫음)면 "결제를 취소했습니다."만 띄운다. 주문을 만든 탭이면 `sessionStorage`에 남긴 방송으로 "다시 후원하기"·"방송으로 돌아가기" 링크, 아니면 방송 목록 링크 |
| 팔로잉 | `/following` | 로그인 필요. 좁은 화면용. 왼쪽 패널과 같은 팔로우 목록(`follows/FollowList`)을 본문 전체 폭으로, 제목 "팔로우한 스트리머" |
| 스트리머 대시보드 | `/studio` | 내 방송 목록(방송 전 포함)과 방송 만들기 버튼 |
| 방송 만들기 | `/studio/new` | 가운데 정렬 카드 하나(제목, 설명). 만들면 `/studio`로 간다 |
| 방송 수정 | `/studio/broadcasts/:id/edit` | 방송 만들기와 같은 카드(`BroadcastForm`). 소유자가 아니면 "권한이 없습니다". 저장하면 상세로, 삭제하면 `/studio`로 간다 |
| 송출 | `/studio/broadcasts/:id` | 소유자만. 위에 제목과 "시청 화면 열기" 링크. 폭 960px 이상은 두 열(왼쪽 `minmax(0, 2fr)` 16:9 미리보기(소리 끔), 오른쪽 `minmax(320px, 1fr)`에 상태 한 줄·소스별 패널·버튼), 좁으면 한 열. 캡처 소스는 `pages/captureSources`의 `CaptureSlot`과 소스별 레지스트리(`CAPTURE_SOURCES`: 버튼 문구, 시작 함수, 실패 문구)로 다룬다. 화면 공유를 지원하는 PC 브라우저는 "화면 공유"(주 버튼)와 "카메라 켜기", 그 밖은 "카메라 켜기"만. 화면 공유 패널: 송출 사전 점검(`components/PcPreflight`, 미터·경고, Chrome·Edge 외 브라우저 경고), 마이크 끄기·켜기(`aria-pressed`), 다시 선택(화면 소리가 없으면 강조). 카메라 패널: 전면·후면 카메라와 화면 꺼짐 방지 상태 한 줄. 전면 카메라 미리보기는 좌우 반전한다(시청자에게는 반전하지 않은 영상이 간다). 카메라가 둘 이상이면 "후면 카메라로 전환"/"전면 카메라로 전환"을 버튼 묶음 맨 위에 둔다. 송출 연결을 만드는 중에는 전환을, 전환 중에는 방송 시작을 막는다. 카메라 권한을 거부하면 `components/PermissionGuide`(iPhone·Android별 허용 방법)를 띄운다. 버튼 흐름: 소스 켜기 → 방송 시작(PC 화면이면 이 클릭 안에서 AudioContext resume, T7) → 방송 종료(한 번 더 확인). 송출 연결은 `publish/usePublishSession`(`MediaStream`을 받아 토큰·WHIP·종료 API를 맡고, `replaceTrack`으로 송출 중 화면·카메라를 바꾼다. 카메라 전환은 `releaseTrack('video')`로 송출 복제본을 먼저 놓은 뒤 새 카메라를 연다. 휴대폰은 카메라를 하나만 열 수 있다)이, 캡처는 화면이 맡는다. 공유 중지·장치 꺼짐은 송출 중이면 종료 API를 부르고 사유를 종료 화면에 적으며, 연결 전이면 송출만 멈춘다. 송출 중에 마이크가 빠지면 "처음부터 다시" 없이 화면 소리만 나간다고 알린다. 페이지를 떠난 뒤 늦게 얻은 캡처는 멈춘다. 종료하면 캡처를 멈추고 "방송을 종료했습니다."와 시청 화면·내 방송 링크를 띄운다. 이 화면이 송출하지 않는데 방송이 LIVE면(새로고침, 송출 끊김) 방송 종료 버튼을 남긴다. 이미 종료된 방송을 열면 새 방송을 만들라고 안내한다. 송출은 `publish/whipPublisher`(OvenLiveKit WHIP, H.264 고정)로 한다. 폭 960px 미만에서는 카메라 미리보기를 3:4(최대 높이 50vh)로 보이고, 주 버튼 묶음을 세로로 쌓아 화면 아래에 붙인다(엄지 위치) |
| 로그인·회원가입 | `/login`, `/signup` | 가운데 정렬 카드 하나. 테스트 계정 원클릭 로그인 버튼 |

경로는 해당 이슈에서 바꿔도 되지만, 바꾸면 이 표도 고친다. 모바일 송출 화면은 폭 360px에서 버튼이 엄지로 닿도록 아래쪽에 둔다.

## 스타일링: CSS Modules

- 컴포넌트마다 `Foo.module.css`를 옆에 둔다. 전역 CSS는 `src/styles/global.css`(리셋, body, 글꼴)와 `tokens.css`만 쓴다.
- Tailwind나 CSS-in-JS 라이브러리를 들이지 않는다.
- 이유: Vite가 추가 설정 없이 지원하고, 의존성이 늘지 않으며, 색·간격을 토큰 한 곳에서 바꿀 수 있다. Tailwind는 설정 파일과 빌드 플러그인이 늘고, 토큰을 Tailwind 설정과 CSS 변수 두 곳에서 관리하게 된다.

## 라우팅: React Router (선언형)

- `react-router`의 `<Routes>`/`<Route>`를 `src/AppRoutes.tsx` 한 곳에 모은다. `main.tsx`가 `BrowserRouter`로 감싸고, 테스트는 `MemoryRouter`로 감싼다.
- 새 화면은 `src/pages/<Name>Page.tsx`에 만들고 `AppRoutes`의 `AppLayout` 아래에 등록한다.
- `BrowserRouter`는 `useTransitions={false}`로 쓴다. 기본값(transition)이면 URL 값으로 그리는 입력창(목록 검색 `?q=`)이 키 입력을 따라가지 못해 글자와 한글 조합이 빠진다.

## API 호출

- `src/api.ts`의 `apiFetch<T>(path, init)`만 쓴다. `path`는 `/api` 뒤의 경로다(`apiFetch('/broadcasts')` → `GET /api/broadcasts`).
- 로그인은 쿠키 세션이라 `apiFetch`가 항상 `credentials: 'include'`를 붙인다. 토큰을 localStorage에 두지 않는다.
- 2xx가 아니면 `ApiError`(`status` 포함)를 던진다. 401이면 로그인 화면으로, 403이면 "권한이 없습니다" 안내로 처리한다.
- 화면을 열 때 데이터를 읽는 GET은 `src/use-api.ts`의 `useApi<T>(path)`를 쓴다. `loading`, `loaded`(`data`), `failed`(`error`) 중 하나를 돌려준다.
- 로그인이 필요한 화면은 `AppRoutes`에서 `<Route element={<RequireAuth />}>` 아래에 둔다. 비로그인 방문자는 로그인 화면으로 가고, 로그인하면 원래 경로로 돌아온다.
- 팔로우 목록 `GET /api/me/follows`는 `follows/FollowsProvider`(`AppLayout` 아래 한 곳)만 읽는다. 로그인했을 때 30초마다, 팔로우·언팔로우 직후 바로 다시 읽는다. 패널·팔로우 버튼·`/following`은 `useFollows()`로 같은 목록을 보고, 팔로우·언팔로우도 그 `setFollowing`으로 한다. 화면마다 따로 부르지 않는다.
- 로그인 상태는 `src/auth/auth-context.ts`의 `useAuth()`로 읽는다. `state.status`는 `loading`(첫 `GET /api/auth/me` 응답 전), `anonymous`, `authenticated`(`state.user`) 중 하나다. 화면마다 `me`를 다시 부르지 않는다.
- 개발 중에는 Vite dev proxy가 `/api`를 `http://localhost:${API_PORT}`(기본 3000)로 넘긴다. 그래서 웹과 API가 같은 출처로 보여 쿠키가 그대로 붙는다.
- OME(WHIP 송출, LL-HLS 재생)는 `/app` 아래 같은 출처 경로로 쓴다. 개발 중에는 Vite dev proxy가 `/app`을 `http://localhost:${OME_HTTP_PORT}`(기본 3333)로 넘기고, 운영에서는 Caddy가 같은 일을 한다.
- 녹화 파일은 `/recordings/<방송 id>/<파일>.mp4` 같은 출처 경로로 쓴다. 개발 중에는 Vite dev proxy가 `/recordings`를 `http://localhost:${RECORDINGS_HTTP_PORT}`(기본 8090, compose의 녹화 정적 서버)로 넘기고, 운영에서는 Caddy가 녹화 폴더를 내준다.
- `ApiError.serverMessage`는 API가 보낸 `message`다. 409처럼 API가 사용자용 문구를 주는 경우에만 화면에 그대로 쓴다.

## 문구

- 화면 문구는 한국어, 존댓말 평서문으로 쓴다("방송이 끝났습니다").
- GLOSSARY 용어를 쓴다: 방송, 스트리머, 시청자, 송출. "스트림", "채널", "방송자", "호스트"를 쓰지 않는다.

## 확인

UI를 바꾸면 `pnpm --filter @lsp/web dev`로 띄워 Playwright로 실제 화면을 확인하고 스크린샷을 남긴다.
