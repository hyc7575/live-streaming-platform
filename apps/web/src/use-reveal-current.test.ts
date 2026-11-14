import { describe, expect, it } from 'vitest';
import { revealOffset } from './use-reveal-current';

// 줄은 화면 x 0~336, 안쪽 여백 4px라 항목이 보이는 구간은 4~332다.
const row = { left: 0, right: 336 };
const pad = 4;

describe('revealOffset', () => {
  it('다 보이는 항목이면 스크롤하지 않는다', () => {
    expect(revealOffset(row, pad, { left: 4, right: 60 })).toBe(0);
    expect(revealOffset(row, pad, { left: 280, right: 332 })).toBe(0);
  });

  it('오른쪽으로 잘린 항목은 오른쪽 끝이 보이도록 스크롤한다', () => {
    expect(revealOffset(row, pad, { left: 336, right: 380 })).toBe(48);
  });

  it('왼쪽으로 잘린 항목은 왼쪽 끝이 보이도록 되돌린다', () => {
    expect(revealOffset(row, pad, { left: -30, right: 20 })).toBe(-34);
  });

  it('줄보다 넓은 항목은 왼쪽 끝을 맞춘다', () => {
    expect(revealOffset(row, pad, { left: 100, right: 600 })).toBe(96);
  });
});
