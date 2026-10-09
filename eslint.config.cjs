const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactNative = require('eslint-plugin-react-native');
const oxlint = require('eslint-plugin-oxlint');

module.exports = defineConfig([
  {
    ignores: [
      'ios/**',
      'android/**',
      'dist/**',
      'dashboard/dist/**',
      '.local/**',
      '.expo/**',
      'node_modules/**',
      'worker/worker-configuration.d.ts',
      '.wrangler/**',
    ],
  },
  expoConfig,
  {
    files: ['worker/**/*.js'],
    settings: { 'import/core-modules': ['cloudflare:workers', 'cloudflare:node'] },
  },
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['dashboard/**'],
    plugins: { 'react-native': reactNative },
    rules: {
      'react-native/no-raw-text': ['error', { skip: ['Copy', 'NativeTabs.Trigger.Label'] }],
      'react-native/no-unused-styles': 'error',
      'react-native/no-inline-styles': 'error',
    },
  },
  // Keep ESLint focused on checks that Oxlint does not already run.
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
]);
