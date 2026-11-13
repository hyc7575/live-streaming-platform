export type ScreenAudioSupport =
  /** 데스크톱 Chrome·Edge다. 탭 오디오와 시스템 오디오 스위치가 동작한다. */
  | 'supported'
  /** 다른 데스크톱 Chromium(Whale, Opera, Brave)이다. 엔진은 같지만 확인하지 않았다. */
  | 'unverified'
  /** 화면 캡처는 되지만 브라우저가 오디오를 버린다(Firefox, Safari). */
  | 'no-screen-audio'
  /** getDisplayMedia가 아예 없다(모바일 브라우저). */
  | 'no-screen-capture';

export interface BrowserEnv {
  hasGetDisplayMedia: boolean;
  /** `navigator.userAgentData`다. Chromium만 제공한다. */
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
  // Firefox와 Safari는 getDisplayMedia({ audio: true })를 받아들이고도 말없이
  // 오디오 트랙을 주지 않는다. 그래서 user agent 문자열로만 구분한다.
  // Chromium은 보안 컨텍스트 밖(LAN IP의 http)에서 userAgentData를 숨긴다.
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
