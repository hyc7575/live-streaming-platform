import { expect, it } from 'vitest';
import type { Donation } from '../donations';
import type { DonationAlert } from './donationAlerts';
import { pickKoreanVoice, spokenLine } from './donationSpeech';

// S14(#186): 시청 화면이 배너 한 장을 소리로 읽을 문장과 음성.

function donationAlert(overrides: Partial<Donation> = {}): DonationAlert {
  const donation: Donation = {
    id: 'd1',
    method: 'TOSS',
    amount: 5000,
    message: '',
    approvedAt: '2026-11-16T00:00:00.000Z',
    donor: { id: 'u3', nickname: '시청자' },
    ...overrides,
  };
  return { kind: 'donation', key: donation.id, donation };
}

it('reads a card donation in won without a thousands separator', () => {
  expect(spokenLine(donationAlert())).toBe('시청자님이 5000원 후원했습니다');
});

it('reads a lime donation in 라임', () => {
  expect(
    spokenLine(
      donationAlert({
        method: 'LIME',
        amount: 12000,
        donor: { id: 'u4', nickname: '라임팬' },
      }),
    ),
  ).toBe('라임팬님이 12000라임 후원했습니다');
});

it('never reads the donation message', () => {
  const line = spokenLine(donationAlert({ message: '욕설이 섞인 메시지' }));
  expect(line).toBe('시청자님이 5000원 후원했습니다');
});

it('reads a bundle card as 외 N건 후원', () => {
  expect(spokenLine({ kind: 'more', key: 'more-1', count: 3 })).toBe(
    '외 3건 후원',
  );
});

function voice(
  lang: string,
  name: string,
  isDefault = false,
): SpeechSynthesisVoice {
  return {
    lang,
    name,
    voiceURI: name,
    default: isDefault,
    localService: true,
  };
}

it('picks a Korean voice whether lang is written ko-KR, ko_KR or ko', () => {
  const english = voice('en-US', 'Samantha');
  for (const lang of ['ko-KR', 'ko_KR', 'KO-kr', 'ko']) {
    const korean = voice(lang, 'Yuna');
    expect(pickKoreanVoice([english, korean])).toBe(korean);
  }
});

it('prefers the default Korean voice, else the first one', () => {
  const first = voice('ko-KR', 'Yuna');
  const preferred = voice('ko-KR', 'Sora', true);
  expect(pickKoreanVoice([first, preferred])).toBe(preferred);
  expect(pickKoreanVoice([first, voice('ko-KR', 'Sora')])).toBe(first);
});

it('finds no voice when none is Korean', () => {
  expect(pickKoreanVoice([voice('en-US', 'Samantha', true)])).toBeNull();
  expect(pickKoreanVoice([])).toBeNull();
});
