const { withAppDelegate, withXcodeProject } = require('expo/config-plugins');

/** @param {import('expo/config').ExpoConfig} config */
module.exports = function withEmbeddedDebug(config) {
  if (process.env.EXPO_EMBEDDED_DEBUG !== '1') return config;
  config = withAppDelegate(config, (mod) => {
    const metro =
      'RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")';
    if (!mod.modResults.contents.includes(metro))
      throw new Error('Embedded Debug requires the SDK 57 Swift bundle URL template.');
    mod.modResults.contents = mod.modResults.contents.replace(
      metro,
      'Bundle.main.url(forResource: "main", withExtension: "jsbundle")',
    );
    return mod;
  });
  return withXcodeProject(config, (mod) => {
    const phases = mod.modResults.hash.project.objects.PBXShellScriptBuildPhase;
    let found = false;
    for (const phase of Object.values(phases)) {
      if (typeof phase !== 'object' || !phase.shellScript) continue;
      const script = JSON.parse(phase.shellScript);
      const invocation = script.lastIndexOf('`"$NODE_BINARY" --print');
      if (invocation < 0 || !script.includes('/scripts/react-native-xcode.sh')) continue;
      phase.shellScript = JSON.stringify(
        `${script.slice(0, invocation)}unset SKIP_BUNDLING\nexport FORCE_BUNDLING=1\nexport SKIP_BUNDLING_METRO_IP=1\n${script.slice(invocation)}`,
      );
      found = true;
    }
    if (!found)
      throw new Error('Embedded Debug could not find the React Native bundle build phase.');
    return mod;
  });
};
