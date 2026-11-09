import Hls from 'hls.js';

export type PlaybackPath = 'native' | 'hls.js' | 'unsupported';

// PRD §7.4 sends iPhone Safari to native HLS (hls.js needs iOS 17.1+) and
// everything else to hls.js. canPlayType alone no longer tells them apart:
// desktop Chrome answers 'maybe' too (Chrome 156, measured). What iPhone
// lacks is the classic MediaSource, so that decides first.
export function playbackPath(video: HTMLVideoElement): PlaybackPath {
  if ('MediaSource' in window && Hls.isSupported()) return 'hls.js';
  if (video.canPlayType('application/vnd.apple.mpegurl')) return 'native';
  return Hls.isSupported() ? 'hls.js' : 'unsupported';
}

export function llhlsPath(broadcastId: string): string {
  return `/app/${encodeURIComponent(broadcastId)}/llhls.m3u8`;
}

// OME serves the playlist only about 9.5 s after the publish connects (#2
// spike) and 404s until then, so a failed load is retried, not shown as an
// error.
export const RETRY_DELAY_MS = 2000;
