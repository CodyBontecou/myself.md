const { dirname } = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(dirname(require.resolve('./package.json')));
config.resolver.assetExts.push('wasm');
module.exports = config;
