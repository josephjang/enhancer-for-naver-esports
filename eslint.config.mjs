import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/', 'test-results/', 'playwright-report/'],
  },
  js.configs.recommended,
  {
    // Extension code: classic scripts sharing globals between files.
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  {
    files: ['src/background.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.webextensions },
    },
    rules: {
      // toggleFillInTab is a top-level function so tests can call it from
      // the service worker's global scope.
      'no-unused-vars': ['error', { varsIgnorePattern: '^toggleFillInTab$' }],
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // Test callbacks passed to page.evaluate() run in the page or the
    // extension service worker.
    files: ['tests/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        controller: 'readonly',
        toggleFillInTab: 'readonly',
        EnsFillMode: 'readonly',
        EnsPlayerButton: 'readonly',
        EnsI18n: 'readonly',
      },
    },
  },
];
