import type { DonationSpeech } from '../donation/useDonationSpeech';
import { SpeechIcon } from './player/PlayerIcons';
import controls from './player/PlayerControls.module.css';

// 시청 화면 컨트롤 바의 "후원 읽기" 켜고 끄기(S14). 바 안에 있어 컨테이너
// 전체 화면에서도 쓸 수 있다.
export function DonationSpeechButton({ on, toggle }: DonationSpeech) {
  return (
    <button
      type="button"
      className={controls.button}
      aria-label="후원 읽기"
      aria-pressed={on}
      onClick={toggle}
    >
      <SpeechIcon off={!on} />
    </button>
  );
}
