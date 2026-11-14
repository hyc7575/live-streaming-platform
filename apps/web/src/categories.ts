// apps/api의 BroadcastCategory enum과 같은 값이다. 표시 순서도 이 순서다.
export const CATEGORIES = [
  'GAME',
  'TALK',
  'MUSIC',
  'STUDY',
  'SPORTS',
  'ETC',
] as const;

export type BroadcastCategory = (typeof CATEGORIES)[number];

export const DEFAULT_CATEGORY: BroadcastCategory = 'ETC';

export const CATEGORY_LABEL: Record<BroadcastCategory, string> = {
  GAME: '게임',
  TALK: '소통',
  MUSIC: '음악',
  STUDY: '공부/작업',
  SPORTS: '스포츠',
  ETC: '기타',
};

// URL 값처럼 믿을 수 없는 문자열을 읽는다. 모르는 값은 null이다.
export function parseCategory(value: string | null): BroadcastCategory | null {
  return CATEGORIES.find((c) => c === value) ?? null;
}
