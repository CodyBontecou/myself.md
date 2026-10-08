const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactNative = require('eslint-plugin-react-native');
const oxlint = require('eslint-plugin-oxlint');

module.exports = defineConfig([
  { ignores: ['ios/**', 'android/**', 'dist/**', '.expo/**', 'node_modules/**'] },
  expoConfig,
  {
    files: ['**/*.{js,jsx}'],
    plugins: { 'react-native': reactNative },
    rules: {
      'react-native/no-raw-text': ['error', { skip: ['Copy'] }],
      'react-native/no-unused-styles': 'error',
      'react-native/no-inline-styles': 'error',
    },
  },
  // Keep ESLint focused on checks that Oxlint does not already run.
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
]);
