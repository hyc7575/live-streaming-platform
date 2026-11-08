export type ScreenAudioSupport =
  /** Chrome or Edge on desktop: tab audio and the system audio switch work. */
  | 'supported'
  /** Another desktop Chromium (Whale, Opera, Brave). Same engine, not checked. */
  | 'unverified'
  /** Screen capture works, but the browser drops the audio (Firefox, Safari). */
  | 'no-screen-audio'
  /** No getDisplayMedia at all (mobile browsers). */
  | 'no-screen-capture';

export interface BrowserEnv {
  hasGetDisplayMedia: boolean;
  /** `navigator.userAgentData`, which only Chromium exposes. */
  userAgentData: { brands: { brand: string }[]; mobile: boolean } | null;
  userAgent: string;
}

const VERIFIED_BRANDS = ['Google Chrome', 'Microsoft Edge'];

export function screenAudioSupport(env: BrowserEnv): ScreenAudioSupport {
  if (!env.hasGetDisplayMedia || env.userAgentData?.mobile) {
    return 'no-screen-capture';
  }
  if (env.userAgentData) {
    const brands = env.userAgentData.brands.map((b) => b.brand);
    if (brands.some((brand) => VERIFIED_BRANDS.includes(brand))) {
      return 'supported';
    }
    return brands.includes('Chromium') ? 'unverified' : 'no-screen-audio';
  }
  // Firefox and Safari accept getDisplayMedia({ audio: true }) and silently
  // return no audio track, so only the user agent string tells them apart.
  // Chromium hides userAgentData outside secure contexts (http on a LAN IP).
  const ua = env.userAgent;
  if (/Firefox\//.test(ua) || !/Chrome\//.test(ua)) return 'no-screen-audio';
  if (/Edg\//.test(ua)) return 'supported';
  if (/OPR\/|Whale\//.test(ua)) return 'unverified';
  return 'supported';
}

export function currentScreenAudioSupport(): ScreenAudioSupport {
  const nav = navigator as Navigator & {
    userAgentData?: BrowserEnv['userAgentData'];
  };
  return screenAudioSupport({
    hasGetDisplayMedia: typeof nav.mediaDevices?.getDisplayMedia === 'function',
    userAgentData: nav.userAgentData ?? null,
    userAgent: nav.userAgent,
  });
}
