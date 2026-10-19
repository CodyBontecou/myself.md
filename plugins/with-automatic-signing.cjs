const { withXcodeProject } = require('expo/config-plugins');

/** @param {import('expo/config').ExpoConfig} config */
module.exports = function withAutomaticSigning(config) {
  const team = config.ios?.appleTeamId;
  if (!team) throw new Error('Automatic signing requires ios.appleTeamId.');
  return withXcodeProject(config, (mod) => {
    const configurations = mod.modResults.pbxXCBuildConfigurationSection();
    for (const configuration of Object.values(configurations)) {
      if (typeof configuration !== 'object' || configuration.name !== 'Release') continue;
      const settings = configuration.buildSettings;
      if (!settings.PRODUCT_BUNDLE_IDENTIFIER) continue;
      settings.CODE_SIGN_STYLE = 'Automatic';
      settings.CODE_SIGN_IDENTITY = '"Apple Development"';
      settings.DEVELOPMENT_TEAM = team;
      for (const key of Object.keys(settings)) {
        if (/^"?(PROVISIONING_PROFILE(?:_SPECIFIER)?|CODE_SIGN_IDENTITY\[)/.test(key)) {
          delete settings[key];
        }
      }
    }
    return mod;
  });
};
