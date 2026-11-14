import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { GameRecord } from '../games/seed-games.js';

export type RefreshGamesOptions = {
  fetch: typeof globalThis.fetch;
  endpoint: string;
  outFile: string;
  timeoutMs: number;
};

// docs/DISCOVERY-broadcast-category.md "E1 결과"의 쿼리. P31=Q7889(비디오 게임)이면서
// 한국어 라벨이 있는 항목만 받는다.
const GAMES_QUERY = `SELECT ?game ?ko ?en (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases) WHERE {
  ?game wdt:P31 wd:Q7889 ;
        rdfs:label ?ko FILTER(LANG(?ko) = "ko")
  OPTIONAL { ?game rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?game skos:altLabel ?alias FILTER(LANG(?alias) = "ko") }
} GROUP BY ?game ?ko ?en`;

// Wikimedia User-Agent 정책: 이름/버전, 괄호 안 연락처, 라이브러리/버전.
// 연락처는 공개 저장소 URL만 쓴다.
const USER_AGENT = `LimeGameImportBot/1.0 (https://github.com/hyc7575/live-streaming-platform; contest project game list import) node/${process.versions.node}`;

const literal = z.object({ value: z.string() });
const sparqlResponse = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        game: z.object({ value: z.string().regex(/\/entity\/Q\d+$/) }),
        ko: literal,
        en: literal.optional(),
        aliases: literal.optional(),
      }),
    ),
  }),
});
type SparqlBinding = z.infer<
  typeof sparqlResponse
>['results']['bindings'][number];

const qidOf = (b: SparqlBinding) =>
  b.game.value.slice(b.game.value.lastIndexOf('/') + 1);

// GROUP BY 결과라 보통 qid당 한 줄이지만, 같은 qid가 여러 줄로 와도 결과가
// 응답 순서에 따라 바뀌지 않게 합친다. 가장 앞선 한국어 이름을 nameKo로 두고
// 나머지는 검색에 쓰이도록 별칭으로 옮긴다.
function mergeRows(rows: SparqlBinding[]): GameRecord {
  const qid = qidOf(rows[0]!);
  const namesKo = [...new Set(rows.map((r) => r.ko.value))].sort();
  const nameKo = namesKo[0]!;
  const namesEn = rows.flatMap((r) => (r.en ? [r.en.value] : [])).sort();
  const aliases = new Set([
    ...namesKo,
    ...rows.flatMap((r) => (r.aliases?.value ?? '').split('|')),
  ]);
  aliases.delete(nameKo);
  aliases.delete('');
  return {
    qid,
    nameKo,
    nameEn: namesEn[0] ?? null,
    aliasesKo: [...aliases].sort(),
  };
}

// 쓰다가 죽어도 기존 파일이 반쯤 덮이지 않게 같은 디렉터리의 임시 파일에 쓰고
// rename으로 바꾼다. 같은 파일 시스템 안의 rename은 원자적이다.
async function writeAtomically(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(tmp, text);
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

const qidNumber = (qid: string) => Number(qid.slice(1));

export async function refreshGames(
  opts: RefreshGamesOptions,
): Promise<{ count: number }> {
  const url = new URL(opts.endpoint);
  url.searchParams.set('query', GAMES_QUERY);
  const res = await opts.fetch(url, {
    headers: {
      accept: 'application/sparql-results+json',
      'user-agent': USER_AGENT,
    },
    // 본문을 다 읽을 때까지 같은 signal이 걸려 있어서 느린 본문도 제한 시간에 걸린다.
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!res.ok) {
    const retryAfter = res.headers.get('retry-after');
    throw new Error(
      `Wikidata responded HTTP ${res.status}` +
        (retryAfter ? ` (retry-after: ${retryAfter})` : ''),
    );
  }
  const parsed = sparqlResponse.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`unexpected SPARQL response: ${parsed.error.message}`);
  }
  const byQid = new Map<string, SparqlBinding[]>();
  for (const b of parsed.data.results.bindings) {
    const rows = byQid.get(qidOf(b)) ?? [];
    rows.push(b);
    byQid.set(qidOf(b), rows);
  }
  const games = [...byQid.values()]
    .map(mergeRows)
    .sort((a, b) => qidNumber(a.qid) - qidNumber(b.qid));
  if (games.length === 0) {
    throw new Error('Wikidata returned 0 games; keeping the existing file');
  }
  await writeAtomically(
    opts.outFile,
    `[\n${games.map((g) => JSON.stringify(g)).join(',\n')}\n]\n`,
  );
  return { count: games.length };
}
