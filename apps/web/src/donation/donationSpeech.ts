import { DONATION_UNIT } from '../donations';
import type { DonationAlert } from './donationAlerts';

// 배너 한 장을 소리로 읽을 문장(S14). 금액에 쉼표를 넣지 않는다. 쉼표가
// 있으면 음성마다 끊어 읽는 방식이 다르다. 후원 메시지는 읽지 않는다
// (STORIES 결정 6).
export function spokenLine(alert: DonationAlert): string {
  switch (alert.kind) {
    case 'donation': {
      const { donor, amount, method } = alert.donation;
      return `${donor.nickname}님이 ${amount}${DONATION_UNIT[method]} 후원했습니다`;
    }
    case 'more':
      return `외 ${alert.count}건 후원`;
  }
}

// 브라우저마다 lang을 'ko-KR', 'ko_KR', 'ko'처럼 다르게 적는다.
function isKorean(voice: SpeechSynthesisVoice): boolean {
  return voice.lang.replace('_', '-').toLowerCase().split('-')[0] === 'ko';
}

export function pickKoreanVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const korean = voices.filter(isKorean);
  return korean.find((voice) => voice.default) ?? korean[0] ?? null;
}
