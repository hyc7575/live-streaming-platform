import { vi } from 'vitest';

// jsdom에는 Web Speech API가 없다. 후원 읽어 주기(S14) 테스트용 대역이다.
// 브라우저가 받은 speak·cancel 호출을 순서대로 남긴다. 테스트 끝의
// `vi.unstubAllGlobals()`가 지운다.

export interface SpokenUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null;
  lang: string;
  volume: number;
}

export type SpeechCall =
  { type: 'speak'; utterance: SpokenUtterance } | { type: 'cancel' };

export function voice(
  lang: string,
  name: string,
  isDefault = false,
): SpeechSynthesisVoice {
  return { lang, name, voiceURI: name, default: isDefault, localService: true };
}

export const KOREAN_VOICE = voice('ko-KR', 'Yuna');

export function stubSpeech({
  voices,
}: {
  voices: readonly SpeechSynthesisVoice[];
}) {
  const calls: SpeechCall[] = [];
  let available = voices;
  const synth = Object.assign(new EventTarget(), {
    // Chrome처럼 부를 때마다 새 배열을 준다.
    getVoices: () => [...available],
    speak: (utterance: SpokenUtterance) =>
      calls.push({ type: 'speak', utterance: { ...utterance } }),
    cancel: () => calls.push({ type: 'cancel' }),
  });
  class Utterance implements SpokenUtterance {
    voice: SpeechSynthesisVoice | null = null;
    lang = '';
    volume = 1;
    constructor(public text: string) {}
  }
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  return {
    calls,
    // 실제로 들리는 문장만. iOS를 여는 빈 발화는 뺀다.
    heard: () =>
      calls.flatMap((call) =>
        call.type === 'speak' && call.utterance.text.trim()
          ? [call.utterance]
          : [],
      ),
    setVoices(next: readonly SpeechSynthesisVoice[]) {
      available = next;
      synth.dispatchEvent(new Event('voiceschanged'));
    },
  };
}
