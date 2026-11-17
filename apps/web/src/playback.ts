import Hls from 'hls.js';

export type PlaybackPath = 'native' | 'hls.js' | 'unsupported';

// PRD §7.4: hls.js를 쓸 수 있으면 hls.js, 없을 때만 네이티브 HLS로 보낸다.
// Hls.isSupported()는 MediaSource와 ManagedMediaSource(iOS 17.1+)를 함께 본다.
// iPhone도 hls.js로 보내는 이유는 OME가 bypass 비디오의 LL-HLS chunklist에
// PART-TARGET=0을 쓰고, iOS 네이티브 HLS가 그 플레이리스트를 거부해서다
// (CoreMediaErrorDomain -12642, #246). 둘 다 없는 iOS 17.0 이하만 네이티브다.
export function playbackPath(video: HTMLVideoElement): PlaybackPath {
  if (Hls.isSupported()) return 'hls.js';
  if (video.canPlayType('application/vnd.apple.mpegurl')) return 'native';
  return 'unsupported';
}

export function llhlsPath(broadcastId: string): string {
  return `/app/${encodeURIComponent(broadcastId)}/llhls.m3u8`;
}

// OME는 송출이 연결된 뒤 약 5-6 s 동안 playlist에 404를 준다(#102).
// 그래서 불러오기에 실패하면 오류로 보이지 않고 다시 시도한다. 지연을 줄여도
// 재생이 빨라지지 않는다. 그때 OME는 첫 세그먼트가 닫힐 때까지 media playlist
// 요청을 붙잡는다(실측, #102).
export const RETRY_DELAY_MS = 2000;
