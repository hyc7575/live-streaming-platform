import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src/generated'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // 공모전 채점기의 파서는 tagged template에 붙은 타입 인자
    // (fn<T>`...`)를 구문 오류로 본다. tsc는 통과시킨다. 대신 태그를
    // 함수로 호출한다. 예: $queryRaw<T>(Prisma.sql`...`).
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TaggedTemplateExpression[typeArguments]',
          message:
            'Type arguments on a tagged template break the grader parser. Use fn<T>(Prisma.sql`...`) or a plain call.',
        },
      ],
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
