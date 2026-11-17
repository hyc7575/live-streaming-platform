import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // 공모전 채점기의 파서는 tagged template에 붙은 타입 인자
    // (fn<T>`...`)를 구문 오류로 본다. tsc는 통과시킨다. 대신 태그를
    // 함수로 부른다. 예: $queryRaw<T>(Prisma.sql`...`).
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TaggedTemplateExpression[typeArguments]',
          message:
            'Type arguments on a tagged template break the grader parser. Use fn<T>(Prisma.sql`...`) or a plain call.',
        },
        {
          // 같은 채점기가 타입 위치의 import(...)(예: typeof import('./x'))도
          // 구문 오류로 본다(cheap-password-hash.ts:11). 대신
          // import type * as X from './x'로 받고 typeof X를 쓴다.
          selector: 'TSImportType',
          message:
            "import(...) in a type position breaks the grader parser. Use `import type * as X from '...'` and `typeof X`.",
        },
      ],
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
