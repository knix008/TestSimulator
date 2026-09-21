// Used when the document's folder has no ESLint config (or the file is
// ignored by the project's flat config). JS / JSX only — TypeScript needs
// typescript-eslint in the project.
module.exports = [
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'constructor-super': 'error',
      'for-direction': 'error',
      'getter-return': 'error',
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': 'warn',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
];
