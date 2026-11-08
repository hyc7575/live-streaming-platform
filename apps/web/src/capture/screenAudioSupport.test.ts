import { expect, it } from 'vitest';
import {
  screenAudioSupport,
  type BrowserEnv,
  type ScreenAudioSupport,
} from './screenAudioSupport';

const UA = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
  edgeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0',
  whaleWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Whale/4.36.0.0 Safari/537.36',
  operaWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 OPR/120.0.0.0',
  firefoxMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:140.0) Gecko/20100101 Firefox/140.0',
  firefoxWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/156.0.0.0 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
};

function brands(...names: string[]) {
  return ['Not:A-Brand', 'Chromium', ...names].map((brand) => ({ brand }));
}

const cases: [string, BrowserEnv, ScreenAudioSupport][] = [
  [
    'Chrome (macOS)',
    {
      hasGetDisplayMedia: true,
      userAgentData: { brands: brands('Google Chrome'), mobile: false },
      userAgent: UA.chromeMac,
    },
    'supported',
  ],
  [
    'Edge (Windows)',
    {
      hasGetDisplayMedia: true,
      userAgentData: { brands: brands('Microsoft Edge'), mobile: false },
      userAgent: UA.edgeWin,
    },
    'supported',
  ],
  [
    'Whale (Windows)',
    {
      hasGetDisplayMedia: true,
      userAgentData: { brands: brands('Whale'), mobile: false },
      userAgent: UA.whaleWin,
    },
    'unverified',
  ],
  [
    'Chrome over http on a LAN IP (no userAgentData)',
    { hasGetDisplayMedia: true, userAgentData: null, userAgent: UA.chromeMac },
    'supported',
  ],
  [
    'Edge over http on a LAN IP',
    { hasGetDisplayMedia: true, userAgentData: null, userAgent: UA.edgeWin },
    'supported',
  ],
  [
    'Opera over http on a LAN IP',
    { hasGetDisplayMedia: true, userAgentData: null, userAgent: UA.operaWin },
    'unverified',
  ],
  [
    'Firefox (macOS)',
    { hasGetDisplayMedia: true, userAgentData: null, userAgent: UA.firefoxMac },
    'no-screen-audio',
  ],
  [
    'Firefox (Windows)',
    { hasGetDisplayMedia: true, userAgentData: null, userAgent: UA.firefoxWin },
    'no-screen-audio',
  ],
  [
    'Safari (macOS)',
    { hasGetDisplayMedia: true, userAgentData: null, userAgent: UA.safariMac },
    'no-screen-audio',
  ],
  [
    'Safari (iOS)',
    { hasGetDisplayMedia: false, userAgentData: null, userAgent: UA.safariIos },
    'no-screen-capture',
  ],
  [
    'Chrome (iOS)',
    { hasGetDisplayMedia: false, userAgentData: null, userAgent: UA.chromeIos },
    'no-screen-capture',
  ],
  [
    'Chrome (Android)',
    {
      hasGetDisplayMedia: false,
      userAgentData: { brands: brands('Google Chrome'), mobile: true },
      userAgent: UA.chromeAndroid,
    },
    'no-screen-capture',
  ],
];

it.each(cases.map(([name, env, expected]) => [name, expected, env] as const))(
  '%s → %s',
  (_name, expected, env) => {
    expect(screenAudioSupport(env)).toBe(expected);
  },
);
