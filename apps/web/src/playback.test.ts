import { afterEach, expect, it, vi } from 'vitest';
import { playbackPath } from './playback';

// 진짜 hls.js의 Hls.isSupported()에 브라우저마다 있는 전역만 바꿔 넣는다.
// 데스크톱은 MediaSource, iOS 17.1+ Safari는 ManagedMediaSource만 있고,
// iOS 17.0 이하는 둘 다 없이 네이티브 HLS만 있다.
class FakeMediaSource {
  static isTypeSupported = () => true;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function browser({
  mediaSource,
  managedMediaSource,
  nativeHls,
}: {
  mediaSource: boolean;
  managedMediaSource: boolean;
  nativeHls: CanPlayTypeResult;
}) {
  vi.stubGlobal('MediaSource', mediaSource ? FakeMediaSource : undefined);
  vi.stubGlobal(
    'ManagedMediaSource',
    managedMediaSource ? FakeMediaSource : undefined,
  );
  vi.stubGlobal('WebKitMediaSource', undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
    nativeHls,
  );
  return document.createElement('video');
}

it('uses hls.js on desktop, where MediaSource exists even if HLS is native too', () => {
  const video = browser({
    mediaSource: true,
    managedMediaSource: false,
    nativeHls: 'maybe',
  });
  expect(playbackPath(video)).toBe('hls.js');
});

it('uses hls.js on iPhone Safari 17.1+, which has only ManagedMediaSource', () => {
  const video = browser({
    mediaSource: false,
    managedMediaSource: true,
    nativeHls: 'maybe',
  });
  expect(playbackPath(video)).toBe('hls.js');
});

it('falls back to native HLS on iOS 17.0 and older, which has neither', () => {
  const video = browser({
    mediaSource: false,
    managedMediaSource: false,
    nativeHls: 'maybe',
  });
  expect(playbackPath(video)).toBe('native');
});

it('is unsupported where there is neither MediaSource nor native HLS', () => {
  const video = browser({
    mediaSource: false,
    managedMediaSource: false,
    nativeHls: '',
  });
  expect(playbackPath(video)).toBe('unsupported');
});
