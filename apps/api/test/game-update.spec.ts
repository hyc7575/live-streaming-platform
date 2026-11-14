import { describe, expect, it } from 'vitest';
import {
  resolveGameUpdate,
  type GameChoice,
  type GameUpdate,
} from '../src/broadcasts/game-update.js';
import type { BroadcastCategory } from '../src/generated/prisma/client.js';

const LISTED: GameChoice = { qid: 'Q223341' };
const TYPED: GameChoice = { name: '카트라이더 슈퍼러쉬' };

describe('resolveGameUpdate', () => {
  it.each<
    [BroadcastCategory | undefined, GameChoice | null | undefined, GameUpdate]
  >([
    [
      'GAME',
      LISTED,
      { kind: 'listed', qid: 'Q223341', storedCategoryMustBeGame: false },
    ],
    [
      'GAME',
      TYPED,
      {
        kind: 'typed',
        name: '카트라이더 슈퍼러쉬',
        storedCategoryMustBeGame: false,
      },
    ],
    ['GAME', null, { kind: 'clear' }],
    ['GAME', undefined, { kind: 'keep' }],
    [
      undefined,
      LISTED,
      { kind: 'listed', qid: 'Q223341', storedCategoryMustBeGame: true },
    ],
    [
      undefined,
      TYPED,
      {
        kind: 'typed',
        name: '카트라이더 슈퍼러쉬',
        storedCategoryMustBeGame: true,
      },
    ],
    [undefined, null, { kind: 'clear' }],
    [undefined, undefined, { kind: 'keep' }],
    ['MUSIC', undefined, { kind: 'clear' }],
    ['ETC', null, { kind: 'clear' }],
    ['TALK', LISTED, { kind: 'reject' }],
    ['MUSIC', TYPED, { kind: 'reject' }],
  ])('category %s with game %j → %j', (category, game, expected) => {
    expect(resolveGameUpdate(category, game)).toEqual(expected);
  });
});
