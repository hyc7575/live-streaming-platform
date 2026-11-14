import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// KR4. 배포된 API는 Wikidata를 부르지 않는다. 게임 목록 가져오기(games:refresh)만
// Wikidata를 안다.
const SRC = fileURLToPath(new URL('../src', import.meta.url));
const ALLOWED = ['games-import/', 'games-refresh.ts'];

it('mentions Wikidata only in the games import code', () => {
  const offenders = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts') && !path.startsWith('generated/'))
    .filter((path) => !ALLOWED.some((allowed) => path.startsWith(allowed)))
    .filter((path) => /wikidata/i.test(readFileSync(join(SRC, path), 'utf8')))
    .map((path) => relative(SRC, join(SRC, path)));
  expect(offenders).toEqual([]);
});
