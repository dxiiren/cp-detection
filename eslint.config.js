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
    // Build output joined this list the day `just e2e-prod` arrived: the
    // recipe leaves .output/ behind, and without the ignore the very next
    // `just lint` chokes on minified bundles it was never meant to read.
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      '.output/',
      '.nitro/',
      'dist/',
    ],
  },
]
