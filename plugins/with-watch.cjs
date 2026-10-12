const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const { cpSync, mkdirSync, readdirSync, writeFileSync } = require('node:fs');
const { join, dirname, basename } = require('node:path');

const watchName = 'MyselfWatch';
const widgetName = 'MyselfWatchWidgets';
/** @param {unknown} value @returns {string} */
function xml(value) {
  if (Array.isArray(value)) return `<array>${value.map(xml).join('')}</array>`;
  if (typeof value === 'object' && value)
    return `<dict>${Object.entries(value)
      .map(([key, entry]) => `<key>${key}</key>${xml(entry)}`)
      .join('')}</dict>`;
  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';
  return `<string>${String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</string>`;
}
/** @param {string} path @param {Record<string,unknown>} value */
function plist(path, value) {
  writeFileSync(
    path,
    `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0">${xml(value)}</plist>`,
  );
}
/** @param {string} root @param {string} ios @param {string} phoneId */
function writeFiles(root, ios, phoneId) {
  const destination = join(ios, 'WatchNative');
  mkdirSync(destination, { recursive: true });
  for (const directory of ['Shared', 'App', 'Widgets'])
    cpSync(join(root, 'watch', directory), join(destination, directory), { recursive: true });
  const group = `group.${phoneId}.watch`;
  const base = {
    CFBundleDisplayName: 'myself.md',
    CFBundleExecutable: '$(EXECUTABLE_NAME)',
    CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
    CFBundleInfoDictionaryVersion: '6.0',
    CFBundleName: '$(PRODUCT_NAME)',
    CFBundleShortVersionString: '$(MARKETING_VERSION)',
    CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
    WatchAppGroup: group,
  };
  plist(join(destination, 'Watch-Info.plist'), {
    ...base,
    CFBundlePackageType: 'APPL',
    WKApplication: true,
    WKCompanionAppBundleIdentifier: phoneId,
    WKRunsIndependentlyOfCompanionApp: false,
    NSHealthShareUsageDescription:
      'Read today’s step samples on your watch for your chosen HTTPS exports and widget.',
    CFBundleURLTypes: [{ CFBundleURLSchemes: ['myselfmd-watch'] }],
  });
  plist(join(destination, 'Widget-Info.plist'), {
    ...base,
    CFBundlePackageType: 'XPC!',
    NSExtension: { NSExtensionPointIdentifier: 'com.apple.widgetkit-extension' },
  });
  plist(join(destination, 'Watch.entitlements'), {
    'com.apple.developer.healthkit': true,
    'com.apple.security.application-groups': [group],
  });
  plist(join(destination, 'Widget.entitlements'), {
    'com.apple.security.application-groups': [group],
  });
  const icons = join(destination, 'App', 'Assets.xcassets', 'AppIcon.appiconset');
  mkdirSync(icons, { recursive: true });
  cpSync(join(root, 'assets', 'myself-icon.png'), join(icons, 'icon.png'));
  writeFileSync(
    join(icons, 'Contents.json'),
    JSON.stringify({
      images: [
        { filename: 'icon.png', idiom: 'universal', platform: 'watchos', size: '1024x1024' },
      ],
      info: { author: 'xcode', version: 1 },
    }),
  );
  writeFileSync(
    join(destination, 'App', 'Assets.xcassets', 'Contents.json'),
    JSON.stringify({ info: { author: 'xcode', version: 1 } }),
  );
}
/** @param {import('expo/config-plugins').XcodeProject} project @param {import('expo/config').ExpoConfig} config @param {string} root */
function configureProject(project, config, root) {
  const phoneId = config.ios?.bundleIdentifier ?? 'com.myself.md';
  project.hash.project.objects.PBXTargetDependency ??= {};
  project.hash.project.objects.PBXContainerItemProxy ??= {};
  /** @param {string} name @param {string} kind @param {string} id */
  function target(name, kind, id) {
    const section = project.pbxNativeTargetSection();
    const existing = Object.entries(section).find(
      ([key, value]) =>
        !key.endsWith('_comment') &&
        typeof value === 'object' &&
        value.name?.replaceAll('"', '') === name,
    );
    return existing
      ? { uuid: existing[0], pbxNativeTarget: existing[1] }
      : project.addTarget(name, kind, 'WatchNative', id);
  }
  const watch = target(watchName, 'application', `${phoneId}.watch`);
  // Avoid xcode's app_extension helper, which incorrectly embeds this watch extension in the phone.
  const widget = target(widgetName, 'watch2_extension', `${phoneId}.watch.widgets`);
  watch.pbxNativeTarget.productType = '"com.apple.product-type.application"';
  widget.pbxNativeTarget.productType = '"com.apple.product-type.app-extension"';
  /** @param {{uuid:string,pbxNativeTarget:import('expo/config-plugins').XcodeProject['hash']['project']['objects']['PBXNativeTarget'][string]}} entry @param {string[]} files @param {string} type @param {string} label */
  function phase(entry, files, type, label) {
    const sections = project.hash.project.objects;
    const previous =
      entry.pbxNativeTarget.buildPhases?.filter(
        (/** @type {{value:string}} */ item) => sections[type]?.[item.value],
      ) ?? [];
    entry.pbxNativeTarget.buildPhases = (entry.pbxNativeTarget.buildPhases ?? []).filter(
      (/** @type {{value:string}} */ item) => !previous.includes(item),
    );
    for (const item of previous) {
      delete sections[type][item.value];
      delete sections[type][`${item.value}_comment`];
    }
    project.addBuildPhase(files, type, label, entry.uuid);
  }
  const shared = readdirSync(join(root, 'watch', 'Shared'))
    .filter((file) => file.endsWith('.swift'))
    .map((file) => `WatchNative/Shared/${file}`);
  const app = readdirSync(join(root, 'watch', 'App'))
    .filter((file) => file.endsWith('.swift'))
    .map((file) => `WatchNative/App/${file}`);
  phase(watch, [...shared, ...app], 'PBXSourcesBuildPhase', 'Sources');
  phase(
    widget,
    shared
      .filter((file) => !file.endsWith('WatchRecord.swift'))
      .concat('WatchNative/Widgets/WatchStepsWidget.swift'),
    'PBXSourcesBuildPhase',
    'Sources',
  );
  phase(watch, ['WatchNative/App/Assets.xcassets'], 'PBXResourcesBuildPhase', 'Resources');
  phase(widget, [], 'PBXResourcesBuildPhase', 'Resources');
  const configs = project.pbxXCBuildConfigurationSection(),
    lists = project.pbxXCConfigurationList();
  for (const [entry, isWidget] of [
    [watch, false],
    [widget, true],
  ]) {
    const list = lists[entry.pbxNativeTarget.buildConfigurationList];
    for (const reference of list.buildConfigurations) {
      const build = configs[reference.value].buildSettings;
      Object.assign(build, {
        SDKROOT: 'watchos',
        SUPPORTED_PLATFORMS: '"watchos watchsimulator"',
        WATCHOS_DEPLOYMENT_TARGET: '11.0',
        TARGETED_DEVICE_FAMILY: '4',
        SWIFT_VERSION: '5.0',
        CODE_SIGN_STYLE: 'Automatic',
        DEVELOPMENT_TEAM: config.ios?.appleTeamId ?? '',
        PRODUCT_BUNDLE_IDENTIFIER: `"${phoneId}.watch${isWidget ? '.widgets' : ''}"`,
        INFOPLIST_FILE: `"WatchNative/${isWidget ? 'Widget' : 'Watch'}-Info.plist"`,
        CODE_SIGN_ENTITLEMENTS: `"WatchNative/${isWidget ? 'Widget' : 'Watch'}.entitlements"`,
        GENERATE_INFOPLIST_FILE: 'NO',
        MARKETING_VERSION: config.version ?? '1.0.0',
        CURRENT_PROJECT_VERSION: config.ios?.buildNumber ?? '1',
        SKIP_INSTALL: 'YES',
        APPLICATION_EXTENSION_API_ONLY: isWidget ? 'YES' : 'NO',
        SWIFT_OPTIMIZATION_LEVEL: configs[reference.value].name === 'Debug' ? '"-Onone"' : '"-O"',
      });
      if (!isWidget) build.ASSETCATALOG_COMPILER_APPICON_NAME = 'AppIcon';
    }
  }
  const phone = project.getFirstTarget();
  /** @param {string} parent @param {string} product @param {string} label @param {string} folder @param {string} path */
  function embed(parent, product, label, folder, path) {
    const phases = project.hash.project.objects.PBXCopyFilesBuildPhase ?? {};
    if (
      !Object.values(phases).some(
        (value) => typeof value === 'object' && value.name === `"${label}"`,
      )
    ) {
      const added = project.addBuildPhase(
        [product],
        'PBXCopyFilesBuildPhase',
        label,
        parent,
        folder,
        path,
      );
      for (const file of added.buildPhase.files)
        project.pbxBuildFileSection()[file.value].settings = {
          ATTRIBUTES: ['RemoveHeadersOnCopy', 'CodeSignOnCopy'],
        };
    }
  }
  embed(
    phone.uuid,
    `${watchName}.app`,
    'Embed Watch Content',
    'watch2_app',
    '"$(CONTENTS_FOLDER_PATH)/Watch"',
  );
  embed(watch.uuid, `${widgetName}.appex`, 'Embed Watch Widgets', 'app_extension', '');
  if (
    !watch.pbxNativeTarget.dependencies?.some(
      (/** @type {{value:string}} */ item) =>
        project.hash.project.objects.PBXTargetDependency?.[item.value]?.target === widget.uuid,
    )
  )
    project.addTargetDependency(watch.uuid, [widget.uuid]);
  if (
    !phone.firstTarget.dependencies?.some(
      (/** @type {{value:string}} */ item) =>
        project.hash.project.objects.PBXTargetDependency[item.value]?.target === watch.uuid,
    )
  )
    project.addTargetDependency(phone.uuid, [watch.uuid]);
  const schemes = join(dirname(project.filepath), 'xcshareddata', 'xcschemes');
  mkdirSync(schemes, { recursive: true });
  const buildable = `<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${watch.uuid}" BuildableName="${watchName}.app" BlueprintName="${watchName}" ReferencedContainer="container:${basename(dirname(project.filepath))}"/>`;
  writeFileSync(
    join(schemes, `${watchName}.xcscheme`),
    `<?xml version="1.0" encoding="UTF-8"?><Scheme LastUpgradeVersion="1600" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">${buildable}</BuildActionEntry></BuildActionEntries></BuildAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">${buildable}</BuildableProductRunnable></LaunchAction><ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">${buildable}</BuildableProductRunnable></ProfileAction><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>`,
  );
}

/** @param {import('expo/config').ExpoConfig} config */
module.exports = function withWatch(config) {
  const phoneId = config.ios?.bundleIdentifier ?? 'com.myself.md';
  if (!/^[A-Za-z0-9.-]+$/.test(phoneId))
    throw new Error('Watch targets require a valid iOS bundle identifier.');
  const extra = config.extra ?? {},
    eas = extra.eas ?? {},
    build = eas.build ?? {},
    experimental = build.experimental ?? {};
  const group = `group.${phoneId}.watch`;
  config.extra = {
    ...extra,
    eas: {
      ...eas,
      build: {
        ...build,
        experimental: {
          ...experimental,
          ios: {
            ...experimental.ios,
            appExtensions: [
              ...(experimental.ios?.appExtensions ?? []).filter(
                (/** @type {{targetName:string}} */ entry) =>
                  ![watchName, widgetName].includes(entry.targetName),
              ),
              {
                targetName: watchName,
                bundleIdentifier: `${phoneId}.watch`,
                entitlements: {
                  'com.apple.developer.healthkit': true,
                  'com.apple.security.application-groups': [group],
                },
              },
              {
                targetName: widgetName,
                bundleIdentifier: `${phoneId}.watch.widgets`,
                entitlements: { 'com.apple.security.application-groups': [group] },
              },
            ],
          },
        },
      },
    },
  };
  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      writeFiles(mod.modRequest.projectRoot, mod.modRequest.platformProjectRoot, phoneId);
      return mod;
    },
  ]);
  return withXcodeProject(config, (mod) => {
    configureProject(mod.modResults, mod, mod.modRequest.projectRoot);
    return mod;
  });
};
module.exports.configureProject = configureProject;
module.exports.writeFiles = writeFiles;
