import type { BroadcastCategory } from '../generated/prisma/client.js';

// 목록에서 고른 게임이거나 직접 입력한 이름. 본문의 gameQid·gameName을
// 컨트롤러가 이 모양으로 접는다. null은 게임을 비우고, undefined는 그대로 둔다.
export type GameChoice = { qid: string } | { name: string };

// 방송 행의 게임 스냅샷 칸.
export interface GameColumns {
  gameQid: string | null;
  gameName: string | null;
}

export const NO_GAME: GameColumns = { gameQid: null, gameName: null };

// storedCategoryMustBeGame은 본문에 카테고리가 없어서 저장된 카테고리가 GAME이어야
// 게임을 붙일 수 있다는 뜻이다. 서비스가 같은 UPDATE의 조건으로 확인한다.
export type GameUpdate =
  | { kind: 'reject' }
  | { kind: 'keep' }
  | { kind: 'clear' }
  | { kind: 'typed'; name: string; storedCategoryMustBeGame: boolean }
  | { kind: 'listed'; qid: string; storedCategoryMustBeGame: boolean };

// 게임은 GAME 방송에만 붙는다. 카테고리를 GAME이 아닌 것으로 정하면 게임을 비우고,
// 그러면서 게임을 보내면 거부한다. 생성은 카테고리를 늘 정해서 부른다.
export function resolveGameUpdate(
  category: BroadcastCategory | undefined,
  game: GameChoice | null | undefined,
): GameUpdate {
  if (category !== undefined && category !== 'GAME') {
    return game ? { kind: 'reject' } : { kind: 'clear' };
  }
  if (game === undefined) return { kind: 'keep' };
  if (game === null) return { kind: 'clear' };
  const storedCategoryMustBeGame = category === undefined;
  return 'qid' in game
    ? { kind: 'listed', qid: game.qid, storedCategoryMustBeGame }
    : { kind: 'typed', name: game.name, storedCategoryMustBeGame };
}
