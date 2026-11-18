// 운영 compose의 네트워크 경계를 검사한다(#216).
// ome는 인터넷에 ICE·TURN 포트를 연 미디어 서버라, 뚫려도 postgres에 바로 닿지 않게
// 같은 네트워크에 두지 않는다. 대신 admission(ome → api), 관리 API(api → ome),
// 시그널링·LL-HLS 중계(caddy → ome), DB 접근(api·db-backup → postgres)은 이어져야 한다.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const compose = fileURLToPath(
  new URL('../deploy/compose.yaml', import.meta.url),
);

let config;
try {
  const out = execFileSync(
    'docker',
    [
      'compose',
      '-f',
      compose,
      'config',
      '--format',
      'json',
      '--no-interpolate',
    ],
    // 보간하지 않으므로 deploy/.env와 필수 변수 없이도 해석된다.
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  config = JSON.parse(out.toString());
} catch (e) {
  if (e.code === 'ENOENT') {
    console.log('check-compose-networks: docker가 없어 건너뛴다.');
    process.exit(0);
  }
  throw e;
}

// networks를 적지 않은 서비스는 compose 기본 네트워크(default)에 붙는다.
const networksOf = (name) => {
  const service = config.services[name];
  if (!service) throw new Error(`deploy/compose.yaml에 ${name} 서비스가 없다.`);
  const n = service.networks;
  if (!n) return new Set(['default']);
  return new Set(Array.isArray(n) ? n : Object.keys(n));
};
const shares = (a, b) => [...networksOf(a)].some((n) => networksOf(b).has(n));

const errors = [];
const mustNot = [
  ['ome', 'postgres'],
  ['ome', 'db-backup'],
];
const must = [
  ['ome', 'api'],
  ['ome', 'caddy'],
  ['api', 'caddy'],
  ['api', 'postgres'],
  ['db-backup', 'postgres'],
];
for (const [a, b] of mustNot) {
  if (shares(a, b)) errors.push(`${a}와 ${b}가 같은 네트워크에 있다.`);
}
for (const [a, b] of must) {
  if (!shares(a, b)) errors.push(`${a}와 ${b}가 같은 네트워크에 없다.`);
}

if (errors.length > 0) {
  for (const e of errors) console.error(`deploy/compose.yaml: ${e}`);
  process.exit(1);
}
