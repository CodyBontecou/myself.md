const { withAppDelegate, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const repositoryURL = 'https://github.com/kitlangton/scrawl';
const revision = '6d4fa333475ef5170c4df683e306480f8618b95a';

/** @param {import('expo/config').ExpoConfig} config */
module.exports = function withScrawl(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSMicrophoneUsageDescription ??=
      'Record narration when you start a Scrawl development capture.';
    mod.modResults.NSLocalNetworkUsageDescription ??=
      'Send Scrawl development recordings to your paired Mac.';
    const transport = mod.modResults.NSAppTransportSecurity;
    mod.modResults.NSAppTransportSecurity = {
      ...(transport && typeof transport === 'object' && !Array.isArray(transport) ? transport : {}),
      NSAllowsLocalNetworking: true,
    };
    return mod;
  });

  config = withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('Scrawl requires the Expo SDK 57 Swift AppDelegate.');
    }
    let source = mod.modResults.contents;
    if (source.includes('private func installScrawl')) return mod;
    const launch =
      '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)';
    const linking = '    return super.application(app, open: url, options: options)';
    if (!source.includes(launch) || !source.includes(linking)) {
      throw new Error('Scrawl could not find the Expo SDK 57 launch and linking hooks.');
    }
    source = `#if DEBUG\nimport SwiftUI\nimport ScrawlKit\n#endif\n${source}`;
    source = source.replace(
      launch,
      `    #if DEBUG\n    installScrawl(in: window)\n    #endif\n\n${launch}`,
    );
    source = source.replace(
      linking,
      `    #if DEBUG\n    if Scrawl.handleSetupURL(url) { return true }\n    #endif\n${linking}`,
    );
    // A zero-size SwiftUI child attaches ScrawlKit's window observer to React Native's window.
    // UIKit's linking hook above handles pairing, since this is not a SwiftUI App scene.
    source += `
#if DEBUG
extension AppDelegate {
  @MainActor
  private func installScrawl(in window: UIWindow?) {
    guard let parent = window?.rootViewController else { return }
    let host = UIHostingController(rootView: Color.clear.scrawl())
    parent.addChild(host)
    host.view.frame = .zero
    host.view.isUserInteractionEnabled = false
    parent.view.addSubview(host.view)
    host.didMove(toParent: parent)
  }
}
#endif
`;
    mod.modResults.contents = source;
    return mod;
  });

  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const objects = project.hash.project.objects;
    const target = project.getFirstTarget();
    const root = project.getFirstProject().firstProject;
    const packages = (objects.XCRemoteSwiftPackageReference ??= {});
    const existing = Object.entries(packages).find(
      ([, value]) =>
        typeof value === 'object' && value.repositoryURL?.replaceAll('"', '') === repositoryURL,
    );
    if (!existing) {
      const packageID = project.generateUuid();
      const productID = project.generateUuid();
      const buildID = project.generateUuid();
      packages[packageID] = {
        isa: 'XCRemoteSwiftPackageReference',
        repositoryURL: `"${repositoryURL}"`,
        requirement: { kind: 'revision', revision },
      };
      packages[`${packageID}_comment`] = 'XCRemoteSwiftPackageReference "scrawl"';
      const products = (objects.XCSwiftPackageProductDependency ??= {});
      products[productID] = {
        isa: 'XCSwiftPackageProductDependency',
        package: packageID,
        package_comment: 'XCRemoteSwiftPackageReference "scrawl"',
        productName: 'ScrawlKit',
      };
      products[`${productID}_comment`] = 'ScrawlKit';
      objects.PBXBuildFile[buildID] = {
        isa: 'PBXBuildFile',
        productRef: productID,
        productRef_comment: 'ScrawlKit',
      };
      objects.PBXBuildFile[`${buildID}_comment`] = 'ScrawlKit in Frameworks';
      (root.packageReferences ??= []).push({
        value: packageID,
        comment: 'XCRemoteSwiftPackageReference "scrawl"',
      });
      (target.firstTarget.packageProductDependencies ??= []).push({
        value: productID,
        comment: 'ScrawlKit',
      });
      project
        .pbxFrameworksBuildPhaseObj(target.uuid)
        .files.push({ value: buildID, comment: 'ScrawlKit in Frameworks' });
    }
    const configs =
      objects.XCConfigurationList[target.firstTarget.buildConfigurationList].buildConfigurations;
    for (const { value } of configs) {
      const buildConfig = objects.XCBuildConfiguration[value];
      if (buildConfig.name.replaceAll('"', '') === 'Debug') {
        buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '18.0';
      }
    }
    return mod;
  });
};
