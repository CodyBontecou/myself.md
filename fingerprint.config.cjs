// Native dependencies generate these files during local Android compilation.
let maskedViewManifest = '';

/** @type {import('expo/fingerprint').Config} */
const config = {
  ignorePaths: ['node_modules/react-native-health-connect/android-expo/build/**/*'],
  fileHookTransform(source, chunk, isEndOfFile) {
    if (
      source.type !== 'file' ||
      source.filePath !==
        'node_modules/@react-native-masked-view/masked-view/android/src/main/AndroidManifest.xml'
    ) {
      return chunk;
    }

    // This dependency's Gradle script removes the legacy package attribute.
    // Normalize that attribute while retaining all other manifest contents.
    if (chunk !== null && chunk !== undefined) {
      maskedViewManifest += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    }
    if (!isEndOfFile) return null;
    const result = maskedViewManifest
      .replace(/\s*package="org\.reactnative\.maskedview"\s*/, ' ')
      .replace(/<manifest\s+/, '<manifest ');
    maskedViewManifest = '';
    return result;
  },
};

module.exports = config;
