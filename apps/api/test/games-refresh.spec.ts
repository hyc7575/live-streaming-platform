import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { refreshGames } from '../src/games-import/refresh-games.js';

type Binding = Record<string, { type: string; value: string }>;

function row(qid: string, ko: string, en?: string, aliases?: string): Binding {
  const b: Binding = {
    game: { type: 'uri', value: `http://www.wikidata.org/entity/${qid}` },
    ko: { type: 'literal', value: ko },
  };
  if (en !== undefined) b.en = { type: 'literal', value: en };
  if (aliases !== undefined) b.aliases = { type: 'literal', value: aliases };
  return b;
}

function sparqlBody(...bindings: Binding[]): string {
  return JSON.stringify({
    head: { vars: ['game', 'ko', 'en', 'aliases'] },
    results: { bindings },
  });
}

function respond(status: number, body: string, headers?: HeadersInit) {
  return () => Promise.resolve(new Response(body, { status, headers }));
}

let dir: string;
let outFile: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'games-refresh-'));
  outFile = join(dir, 'data', 'games.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function run(fetch: typeof globalThis.fetch, timeoutMs = 1_000) {
  return refreshGames({
    fetch,
    endpoint: 'https://example.invalid/sparql',
    outFile,
    timeoutMs,
  });
}

async function readGames(): Promise<unknown> {
  return JSON.parse(await readFile(outFile, 'utf8'));
}

describe('refreshGames 성공', () => {
  it('게임을 qid 숫자 순으로 쓰고 별칭을 나눈다', async () => {
    const result = await run(
      respond(
        200,
        sparqlBody(
          row('Q223341', '리그 오브 레전드', 'League of Legends', '롤|LOL'),
          row('Q17', '테트리스'),
          row('Q4000', '스타크래프트', 'StarCraft', ''),
        ),
      ),
    );

    expect(result).toEqual({ count: 3 });
    expect(await readGames()).toEqual([
      { qid: 'Q17', nameKo: '테트리스', nameEn: null, aliasesKo: [] },
      {
        qid: 'Q4000',
        nameKo: '스타크래프트',
        nameEn: 'StarCraft',
        aliasesKo: [],
      },
      {
        qid: 'Q223341',
        nameKo: '리그 오브 레전드',
        nameEn: 'League of Legends',
        aliasesKo: ['LOL', '롤'],
      },
    ]);
  });

  it('같은 qid가 여러 줄로 오면 하나로 합친다', async () => {
    await run(
      respond(
        200,
        sparqlBody(
          row('Q5', '배틀그라운드', undefined, '배그|펍지'),
          row('Q5', '배그', 'PUBG', '펍지|PUBG'),
          row('Q5', '배틀그라운드', 'Battlegrounds', ''),
        ),
      ),
    );

    expect(await readGames()).toEqual([
      {
        qid: 'Q5',
        nameKo: '배그',
        nameEn: 'Battlegrounds',
        aliasesKo: ['PUBG', '배틀그라운드', '펍지'],
      },
    ]);
  });

  it('한 줄에 게임 하나를 쓰고 임시 파일을 남기지 않는다', async () => {
    await run(
      respond(200, sparqlBody(row('Q2', '둘'), row('Q1', '하나', 'One'))),
    );

    expect(await readFile(outFile, 'utf8')).toBe(
      '[\n' +
        '{"qid":"Q1","nameKo":"하나","nameEn":"One","aliasesKo":[]},\n' +
        '{"qid":"Q2","nameKo":"둘","nameEn":null,"aliasesKo":[]}\n' +
        ']\n',
    );
    expect(await readdir(join(dir, 'data'))).toEqual(['games.json']);
  });

  it('정책에 맞는 User-Agent와 함께 게임 SPARQL을 한 번 보낸다', async () => {
    const calls: Request[] = [];
    await run((input, init) => {
      calls.push(new Request(input, init));
      return Promise.resolve(
        new Response(sparqlBody(row('Q1', '하나')), { status: 200 }),
      );
    });

    expect(calls).toHaveLength(1);
    const req = calls[0]!;
    const url = new URL(req.url);
    expect(url.origin + url.pathname).toBe('https://example.invalid/sparql');
    const query = url.searchParams.get('query') ?? '';
    expect(query).toContain('?game wdt:P31 wd:Q7889');
    expect(query).toContain('FILTER(LANG(?ko) = "ko")');
    expect(query).toContain('GROUP_CONCAT(DISTINCT ?alias; separator="|")');
    expect(req.headers.get('accept')).toBe('application/sparql-results+json');
    const ua = req.headers.get('user-agent') ?? '';
    expect(ua).toMatch(
      /^\S*Bot\/\d+\.\d+ \(https:\/\/github\.com\/hyc7575\/live-streaming-platform; [^)]+\)/,
    );
    expect(ua).not.toContain('@');
  });
});

describe('refreshGames 실패', () => {
  const previous =
    '[{"qid":"Q1","nameKo":"이전","nameEn":null,"aliasesKo":[]}]\n';

  beforeEach(async () => {
    await run(respond(200, sparqlBody(row('Q1', '이전'))));
    await writeFile(outFile, previous);
  });

  async function expectUntouched() {
    expect(await readFile(outFile, 'utf8')).toBe(previous);
    expect(await readdir(join(dir, 'data'))).toEqual(['games.json']);
  }

  it('HTTP 500이면 실패하고 기존 파일을 그대로 둔다', async () => {
    await expect(run(respond(500, 'oops'))).rejects.toThrow(/500/);
    await expectUntouched();
  });

  it('429면 실패하고 retry-after를 알려 준다', async () => {
    await expect(
      run(respond(429, 'slow down', { 'retry-after': '30' })),
    ).rejects.toThrow(/429.*retry-after: 30/);
    await expectUntouched();
  });

  it('응답이 제한 시간을 넘기면 실패한다', async () => {
    const hang: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason as Error),
        );
      });
    await expect(run(hang, 20)).rejects.toThrow(/timed out|timeout/i);
    await expectUntouched();
  });

  it('0건이면 실패하고 기존 파일을 그대로 둔다', async () => {
    await expect(run(respond(200, sparqlBody()))).rejects.toThrow(/0 games/);
    await expectUntouched();
  });

  it('본문이 깨진 JSON이면 실패한다', async () => {
    const truncated = sparqlBody(row('Q2', '새 게임')).slice(0, 40);
    await expect(run(respond(200, truncated))).rejects.toThrow();
    await expectUntouched();
  });

  it('SPARQL 결과 모양이 아니면 실패한다', async () => {
    const noKoLabel = JSON.stringify({
      results: {
        bindings: [
          { game: { type: 'uri', value: 'http://www.wikidata.org/entity/Q2' } },
        ],
      },
    });
    await expect(run(respond(200, noKoLabel))).rejects.toThrow(
      /unexpected SPARQL response/,
    );
    await expectUntouched();
  });
});
