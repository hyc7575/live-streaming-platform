## Backlog: iPhone Safari 라이브 시청을 hls.js로 재생한다

**Format**: User Stories
**출처**: 2026-11-17 심사위원 관점 점검 중 iOS Simulator(iOS 26.5, iPhone 17 Pro, Safari)에서 운영 서비스(https://lime-live.duckdns.org)의 비로그인 라이브 시청을 확인한 결과(main 3b7a1fb).
**이슈**: #246
**Total stories**: 1
**Estimated total effort**: 약 2시간 (S)

실사용자 데이터 없음. 근거는 공모 원문 2절 1항("PC에서 송출한 방송을 다른 기기에서 실시간으로 시청"), 8절 체크리스트 "PC와 모바일에서 송출한 방송을 각각 다른 기기에서 수신하고 재생", README 확인 순서 2번(휴대폰 비로그인 시청)이다. 코드 한 곳을 고치고 문서를 같은 PR에서 맞추는 수정이라 스토리를 하나로 둔다.

### 무엇이 일어나나

iPhone Safari로 LIVE 방송을 열면 플레이어가 "방송을 불러오는 중입니다"에서 멈춘다. 새로고침해도 같다. 같은 방송을 PC·Android·Mac Safari에서 열면 재생된다.

| 회차 | 연 시점(LIVE 뒤) | 연 방법 | 결과 |
|---|---|---|---|
| 1 | 약 30초 | 일반 Safari(`simctl openurl`) | 재생됨. 이 회차의 `PART-TARGET` 값은 기록하지 않았다 |
| 2 | 약 6초 | safaridriver | 90초 동안 `error 4`, 재생 0초 |
| 3 | 즉시 | safaridriver | 60초 동안 `error 4`. 새 탭, `src` 재설정, 새로고침 모두 같다 |
| 4 | 30초 | safaridriver | 60초 동안 `error 4` |
| 5 | 33초 | 일반 Safari(`simctl openurl`) | 75초 화면이 "방송을 불러오는 중입니다" |

송출은 Playwright Chrome의 가짜 카메라로 했다. 실제 iPhone 시청은 확인하지 못했다(실기기 없음).

### 원인

1. OME(v0.21.0)는 WebRTC 비디오를 트랜스코딩하지 않고 넘긴다(`ome/Server.xml` `bypass_video`). 이때 LL-HLS 비디오 chunklist에 부분 세그먼트를 프레임 하나(약 0.05초)마다 만들고, 헤더에 `#EXT-X-PART-INF:PART-TARGET=0.000000`을 쓴다. 세그먼트는 키프레임에서만 잘려 `#EXTINF`가 최대 6.1초로 `#EXT-X-TARGETDURATION:4`를 넘는다. 오디오 chunklist는 `PART-TARGET=0.491`로 정상이다.
2. iPhone은 `MediaSource`가 없어 `playbackPath`(`apps/web/src/playback.ts`)가 네이티브 HLS(`<video src>`)를 고른다(PRD §7.4 "재생 경로 분기").
3. iOS 네이티브 HLS는 이 비디오 chunklist를 거부한다. Simulator 로그(`com.apple.WebKit.GPU`):
   - `_StreamPlaylistLogError: #EXT-X-PART-INF must have PART-TARGET`
   - `CoreMediaErrorDomain Code=-12642 "playlist parse error."`
   - `Can not proceed after removing variants`
   `<video>`는 `error.code === 4`(MEDIA_ERR_SRC_NOT_SUPPORTED)를 낸다. `LivePlayer`가 2초마다 다시 시도해도 같은 플레이리스트라 계속 거부된다.
4. hls.js는 같은 플레이리스트를 받아 재생한다. 그래서 PC·Android·Mac Safari에서는 드러나지 않았다.

같은 시각, 같은 스트림, 같은 iOS 26.5에서 두 경로를 비교했다(로컬 시험 페이지, 저장소의 hls.js 1.7.4).

| 경로 | 결과 |
|---|---|
| 네이티브 HLS (`video.src`) | `error 4`, `readyState 0` |
| hls.js + `ManagedMediaSource` | 재생. 640×480, 4초마다 재생 위치 4초 증가. 치명적이지 않은 오류만 있음(`bufferStalledError`, `bufferSeekOverHole`) |

### 왜 iPhone을 네이티브로 보냈나

PRD §7.4(2026-11-09, #10): "hls.js는 iOS에서 17.1+에서만 동작하므로 iOS는 네이티브로 보낸다." 근거는 호환 범위였다(`docs/NEXT-STEPS.md`: 네이티브 LL-HLS는 iOS 14+, hls.js는 iOS 17.1+). 그때는 PC hls.js로만 재생을 확인했고, iPhone 네이티브 시청 시나리오(SCENARIOS WA2)는 확인하지 않았다. 이 스토리는 그 결정을 "hls.js를 쓸 수 있으면 hls.js, 없을 때만 네이티브"로 바꾼다. iOS 17.0 이하는 지금처럼 네이티브로 남으므로 지금보다 나빠지지 않는다.

### Stories

#### S1: iPhone Safari(iOS 17.1+)에서 LIVE 방송이 재생된다
**시청자(심사위원)로서, iPhone Safari에서 로그인하지 않고 LIVE 방송을 열면 영상과 소리가 나오기를 원한다. 그래야 "PC에서 송출한 방송을 다른 기기에서 시청"을 휴대폰으로 확인할 수 있다.**

Acceptance Criteria:
- [ ] `playbackPath`는 `Hls.isSupported()`가 참이면(`MediaSource` 또는 `ManagedMediaSource`) `'hls.js'`를 돌려준다. 둘 다 없고 `canPlayType('application/vnd.apple.mpegurl')`이 참일 때만 `'native'`, 그 밖은 `'unsupported'`다. 단위 테스트가 세 경우(데스크톱 `MediaSource`, iOS 17.1+ `ManagedMediaSource`만, iOS 17.0 이하 둘 다 없음)를 확인한다
- [ ] iOS Simulator(iOS 26.5) Safari에서 비로그인으로 LIVE 방송을 열면, LIVE 뒤 6초에 열 때와 30초 뒤에 열 때 모두 10초 안에 재생이 시작되고 60초 동안 재생 위치가 50초 넘게 늘어난다. 자동 재생이 막히면 음소거로 재생되고 "소리 켜기"를 누르면 소리가 난다
- [ ] 같은 화면에서 LIVE 표시(라이브 끝 3초 이내 빨간 점)와 더블탭 전체화면이 동작한다. 송출을 끝내면 10초 안에 "방송이 끝났습니다."가 뜬다(T9)
- [ ] PC Chrome·Mac Safari의 재생 경로는 그대로 hls.js다. 기존 웹 테스트(`pnpm --filter @lsp/web test`, `e2e`)가 통과한다
- [ ] 문서를 같은 PR에서 맞춘다: PRD §7.4 "재생 경로 분기"와 §7.1·§7.8의 "iOS는 네이티브 HLS" 문구, `apps/web/CLAUDE.md` 시청 행의 재생 경로 설명, README 지원 환경 표(확인한 iOS 버전과 "Simulator" 명시, iOS 17.0 이하는 네이티브라 재생되지 않을 수 있음), SCENARIOS WA2 제목과 기대 결과

Priority: P0 | Effort: S | Dependencies: none

---

### Story Map

- 필수: S1

### 하지 않을 것

- **OME가 `PART-TARGET`을 바르게 쓰게 고치기.** 비디오를 트랜스코딩하거나 LL-HLS 설정을 바꾸면 iOS 17.0 이하도 살릴 수 있을지 모른다. 그러나 효과를 확인하지 않았고, 트랜스코딩은 서버 CPU와 지연을 늘리며 운영 OME 재배포가 필요하다. 마감(2026-11-19)까지 되돌리기 어려운 변경이라 하지 않는다. 제출 뒤 과제로 README "향후 과제"에 적는다.
- **iOS에만 일반 HLS(LL 아님)를 내주기.** OME 출력과 앱 경로를 둘 다 바꿔야 하고 지연이 수 초 늘어난다.

### Technical Notes

- 재생 경로는 `playbackPath` 한 곳에서 정한다. `LivePlayer`의 hls.js 경로(치명적 오류 시 재시도, `liveSyncPosition`)는 이미 데스크톱에서 쓰는 코드라 새 분기가 없다.
- 다시보기(`ReplayPlayer`)는 mp4라 영향이 없다. iOS Simulator에서 재생을 확인했다.

### Open Questions

- `ManagedMediaSource`는 AirPlay를 위해 `disableRemotePlayback` 또는 다른 소스를 요구한다고 알려져 있다. 실험에서는 설정 없이 재생됐다. 구현 때 hls.js 1.7.4의 동작을 확인한다.
- 실제 iPhone(셀룰러)에서 같은 결과인지는 확인하지 못했다. 기기가 생기면 SCENARIOS WA2로 확인한다.
