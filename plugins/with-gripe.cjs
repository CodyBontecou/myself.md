const { withInfoPlist, withXcodeProject } = require('expo/config-plugins');

/** @param {import('expo/config').ExpoConfig} config */
module.exports = function withGripe(config) {
  const apiKey = process.env.GRIPE_API_KEY ?? '';
  const repository = process.env.GRIPE_REPOSITORY ?? 'CodyBontecou/agent-bridge';
  const dryRun = process.env.GRIPE_DRY_RUN === '1';
  if (apiKey && !/^[a-zA-Z0-9_-]{1,512}$/.test(apiKey))
    throw new Error('GRIPE_API_KEY must contain only letters, digits, underscores and hyphens.');
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository))
    throw new Error('GRIPE_REPOSITORY must be owner/repo.');
  config = withInfoPlist(config, (mod) => {
    mod.modResults.GripeAPIKey = '$(GRIPE_API_KEY)';
    mod.modResults.GripeRepository = '$(GRIPE_REPOSITORY)';
    mod.modResults.GripeDryRun = '$(GRIPE_DRY_RUN)';
    return mod;
  });
  return withXcodeProject(config, (mod) => {
    const configurations = mod.modResults.pbxXCBuildConfigurationSection();
    for (const entry of Object.values(configurations)) {
      if (typeof entry !== 'object' || !entry.buildSettings) continue;
      const debug = entry.name === 'Debug';
      entry.buildSettings.GRIPE_API_KEY = `"${debug ? apiKey : ''}"`;
      entry.buildSettings.GRIPE_REPOSITORY = `"${debug ? repository : ''}"`;
      entry.buildSettings.GRIPE_DRY_RUN = `"${debug && dryRun ? '1' : '0'}"`;
    }
    return mod;
  });
};
