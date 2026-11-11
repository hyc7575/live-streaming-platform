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
    // The contest grader's parser rejects type arguments on a tagged template
    // (fn<T>`...`) as a syntax error although tsc accepts it. Call the tag
    // as a function instead, e.g. $queryRaw<T>(Prisma.sql`...`).
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
