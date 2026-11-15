// docs/ 폴더 규칙(docs/README.md "폴더 규칙")을 검사한다. 기능 문서가
// docs/ 바로 아래에 생기면 실패한다(2026-11-15 donation-alert 문서가 그랬다).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DOCS = new URL('../docs/', import.meta.url).pathname;
const ROOT_FILES = new Set([
  'README.md',
  'PRD.md',
  'PRE-MORTEM.md',
  'NEXT-STEPS.md',
  'OPERATIONS.md',
]);
const ROOT_DIRS = new Set([
  'adr',
  'agents',
  'features',
  'private',
  'screenshots',
]);
const KINDS = [
  'DISCOVERY',
  'STRATEGY',
  'RED-TEAM',
  'PRD',
  'PRE-MORTEM',
  'STORIES',
  'SCENARIOS',
  'TEST',
];
const FEATURE_FILE = new RegExp(
  `^(README|(${KINDS.join('|')})(-[a-z0-9-]+)?)\\.md$`,
);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const errors = [];
const isDir = (p) => statSync(p).isDirectory();

for (const name of readdirSync(DOCS)) {
  if (name.startsWith('.')) continue;
  const path = join(DOCS, name);
  if (isDir(path) ? !ROOT_DIRS.has(name) : !ROOT_FILES.has(name)) {
    errors.push(
      `docs/${name}: docs/ 바로 아래에는 제품 전체 문서만 둔다. 기능 문서는 docs/features/<기능>/로 옮긴다.`,
    );
  }
}

const featuresDir = join(DOCS, 'features');
const index = readFileSync(join(DOCS, 'README.md'), 'utf8');
for (const feature of readdirSync(featuresDir)) {
  const dir = join(featuresDir, feature);
  if (!isDir(dir)) {
    errors.push(`docs/features/${feature}: 기능 폴더 안에만 문서를 둔다.`);
    continue;
  }
  if (!KEBAB.test(feature)) {
    errors.push(
      `docs/features/${feature}: 기능 이름은 kebab-case 영어로 쓴다.`,
    );
  }
  if (!existsSync(join(dir, 'README.md'))) {
    errors.push(`docs/features/${feature}/README.md: 입구 문서가 없다.`);
  }
  if (!index.includes(`./features/${feature}/`)) {
    errors.push(
      `docs/README.md: 기능 표에 docs/features/${feature}/ 줄이 없다.`,
    );
  }
  for (const file of readdirSync(dir)) {
    if (!FEATURE_FILE.test(file)) {
      errors.push(
        `docs/features/${feature}/${file}: 파일 이름은 README.md 또는 ${KINDS.join('·')}(-<주제>).md로 쓴다.`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('docs layout ok');
