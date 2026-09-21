export default [{
  files: ['**/*.js', '**/*.mjs', '**/*.cjs', '**/*.jsx'],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  rules: { 'no-undef': 'error', 'no-unused-vars': 'warn', 'no-unreachable': 'error' },
}];
