const { withMainActivity, withGradleProperties } = require('expo/config-plugins');
/** @param {import('expo/config').ExpoConfig} config */
module.exports = function withPhoneData(config) {
  const sdkConfig = withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter(
      (p) => p.type !== 'property' || p.key !== 'android.minSdkVersion',
    );
    mod.modResults.push({ type: 'property', key: 'android.minSdkVersion', value: '26' });
    return mod;
  });
  return withMainActivity(sdkConfig, (mod) => {
    const source = mod.modResults.contents;
    const delegate =
      'dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate.setPermissionDelegate(this)';
    if (!source.includes(delegate)) {
      if (!source.includes('super.onCreate(null)'))
        throw new Error('Expected Kotlin Expo MainActivity onCreate hook.');
      mod.modResults.contents = source.replace(
        'super.onCreate(null)',
        `super.onCreate(null)\n    ${delegate}`,
      );
    }
    return mod;
  });
};
