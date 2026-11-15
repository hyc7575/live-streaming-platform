import {
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { isSilent } from '../components/player/useMediaState';
import type { DonationAlert } from './donationAlerts';
import { pickKoreanVoice, spokenLine } from './donationSpeech';

export const SPEAK_DONATIONS_KEY = 'lime.player.speakDonations';

// 컨트롤 바의 "후원 읽기" 버튼이 쓰는 전부.
export type DonationSpeech = { on: boolean; toggle: () => void };

function supported(): boolean {
  return (
    typeof speechSynthesis !== 'undefined' &&
    typeof SpeechSynthesisUtterance === 'function'
  );
}

// getVoices()는 처음에 빈 목록일 수 있어 voiceschanged를 기다린다.
function subscribeVoices(onChange: () => void): () => void {
  if (!supported()) return () => {};
  speechSynthesis.addEventListener('voiceschanged', onChange);
  return () => speechSynthesis.removeEventListener('voiceschanged', onChange);
}

// 스냅숏은 voiceURI 문자열이다. getVoices()가 부를 때마다 새 객체를 줄 수
// 있어 객체를 스냅숏으로 쓰면 렌더가 끝나지 않는다.
function koreanVoiceUri(): string | null {
  if (!supported()) return null;
  return pickKoreanVoice(speechSynthesis.getVoices())?.voiceURI ?? null;
}

function readPref(): boolean {
  try {
    return localStorage.getItem(SPEAK_DONATIONS_KEY) !== 'off';
  } catch {
    return true;
  }
}

function storePref(on: boolean) {
  try {
    localStorage.setItem(SPEAK_DONATIONS_KEY, on ? 'on' : 'off');
  } catch {
    // 저장소가 막혔다. 그러면 선택을 기억하지 않을 뿐이다.
  }
}

/**
 * 시청 화면 배너 한 장이 뜰 때 그 장을 한 번 읽는다(S14). 말하기는 이 훅만
 * 한다. 읽는 소리는 배너보다 오래 남지 않는다: 다음 장, 배너가 내려감,
 * 언마운트가 모두 cancel한다. 영상이 멈췄거나 무음이면 읽지 않고, 소리
 * 크기는 영상 볼륨을 따른다. 한국어 음성이 없으면 null을 돌려 버튼을 숨긴다.
 */
export function useDonationSpeech(
  videoRef: RefObject<HTMLVideoElement | null>,
  alert: DonationAlert | null,
): DonationSpeech | null {
  const voiceUri = useSyncExternalStore(subscribeVoices, koreanVoiceUri);
  const [on, setOn] = useState(readPref);

  const say = useEffectEvent(() => {
    const video = videoRef.current;
    const voice = speechSynthesis
      .getVoices()
      .find((candidate) => candidate.voiceURI === voiceUri);
    if (!alert || !on || !voice || !video) return;
    if (video.paused || isSilent(video)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenLine(alert));
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.volume = video.volume;
    speechSynthesis.speak(utterance);
  });

  const key = alert?.key;
  useEffect(() => {
    if (key === undefined || !supported()) return;
    say();
    return () => speechSynthesis.cancel();
  }, [key]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !supported()) return;
    const stopWhenSilent = () => {
      if (isSilent(video)) speechSynthesis.cancel();
    };
    video.addEventListener('volumechange', stopWhenSilent);
    return () => video.removeEventListener('volumechange', stopWhenSilent);
  }, [videoRef]);

  // iOS Safari는 첫 speak()가 사용자 입력 안에서 불려야 그 뒤 읽는다.
  // "소리 켜기"·음소거 해제를 포함한 첫 입력에서 들리지 않는 발화를 한 번
  // 보낸다. 캡처 단계라 PlayerControls는 이 일을 모른다.
  useEffect(() => {
    if (!voiceUri) return;
    const events = ['touchend', 'click', 'keydown'] as const;
    const stop = () => {
      for (const name of events) {
        document.removeEventListener(name, unlock, true);
      }
    };
    const unlock = () => {
      stop();
      const utterance = new SpeechSynthesisUtterance(' ');
      utterance.volume = 0;
      speechSynthesis.speak(utterance);
    };
    for (const name of events) document.addEventListener(name, unlock, true);
    return stop;
  }, [voiceUri]);

  if (!voiceUri) return null;
  return {
    on,
    toggle: () => {
      setOn(!on);
      storePref(!on);
      if (on) speechSynthesis.cancel();
    },
  };
}
