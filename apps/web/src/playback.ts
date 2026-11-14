import Hls from 'hls.js';

export type PlaybackPath = 'native' | 'hls.js' | 'unsupported';

// PRD §7.4는 iPhone Safari를 네이티브 HLS로(hls.js는 iOS 17.1+ 필요),
// 나머지를 hls.js로 보낸다. 이제 canPlayType만으로는 둘을 가를 수 없다.
// 데스크톱 Chrome도 'maybe'라고 답한다(Chrome 156, 실측). iPhone에
// 없는 것은 고전 MediaSource라서, 그것을 먼저 본다.
export function playbackPath(video: HTMLVideoElement): PlaybackPath {
  if ('MediaSource' in window && Hls.isSupported()) return 'hls.js';
  if (video.canPlayType('application/vnd.apple.mpegurl')) return 'native';
  return Hls.isSupported() ? 'hls.js' : 'unsupported';
}

export function llhlsPath(broadcastId: string): string {
  return `/app/${encodeURIComponent(broadcastId)}/llhls.m3u8`;
}

// OME는 송출이 연결된 뒤 약 5-6 s 동안 playlist에 404를 준다(#102).
// 그래서 불러오기에 실패하면 오류로 보이지 않고 다시 시도한다. 지연을 줄여도
// 재생이 빨라지지 않는다. 그때 OME는 첫 세그먼트가 닫힐 때까지 media playlist
// 요청을 붙잡는다(실측, #102).
export const RETRY_DELAY_MS = 2000;
