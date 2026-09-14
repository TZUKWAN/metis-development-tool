// @ts-check
/**
 * ESLint flat config for the MDT generated app. Kept dependency-free so it
 * works with any ESLint 9+ install (`npx eslint .`); add typescript-eslint
 * if you want TS-aware rules on your own edits.
 */
export default [
  {
    ignores: ['node_modules/', 'dist/', 'playwright-report/', 'test-results/'],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {},
    },
    rules: {},
  },
]
