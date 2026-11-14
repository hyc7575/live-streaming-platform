import { fileURLToPath } from 'node:url';
import { refreshGames } from './games-import/refresh-games.js';

const endpoint =
  process.env.WIKIDATA_SPARQL_URL ?? 'https://query.wikidata.org/sparql';
const outFile = fileURLToPath(new URL('../data/games.json', import.meta.url));
const startedAt = performance.now();

try {
  // WDQS의 쿼리 제한이 60초라서, 서버가 끊는 응답을 받을 만큼 조금 더 기다린다.
  const { count } = await refreshGames({
    fetch,
    endpoint,
    outFile,
    timeoutMs: 70_000,
  });
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.log(`Wrote ${count} games to ${outFile} in ${seconds}s`);
} catch (err) {
  // fetch는 연결 거부 같은 원인을 cause에 담고 메시지는 "fetch failed"뿐이다.
  const reason = err instanceof Error ? err.message : String(err);
  const cause =
    err instanceof Error && err.cause instanceof Error
      ? ` (${err.cause.message})`
      : '';
  console.error(
    `games:refresh failed, ${outFile} left unchanged: ${reason}${cause}`,
  );
  process.exitCode = 1;
}
