//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // Playwright specs and their helpers: Node globals, and excluded from the root
    // tsconfig so the app build never sees them. They still get linted — point the
    // type-aware parser at their own project rather than ignoring the tree.
    files: ['e2e/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './e2e/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Deno source, excluded from tsconfig, so the type-aware parser cannot
    // resolve it. Linted by `deno lint` if at all, never by the web config.
    ignores: ['eslint.config.js', 'prettier.config.js', 'supabase/functions/**', 'src/lib/database.types.ts'],
  },
]
