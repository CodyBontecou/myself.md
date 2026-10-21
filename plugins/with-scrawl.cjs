const { withAppDelegate, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const repositoryURL = 'https://github.com/kitlangton/scrawl';
const revision = '6d4fa333475ef5170c4df683e306480f8618b95a';

// React Native waits for ancestor recognizers to fail. Scrawl's passive observer
// never recognizes, so that dependency blocks RN presses indefinitely.
const touchCompatibility = `
#if DEBUG
private final class ScrawlTouchDelegate: NSObject, UIGestureRecognizerDelegate {
  private weak var original: (any UIGestureRecognizerDelegate)?

  init(original: any UIGestureRecognizerDelegate) {
    self.original = original
    super.init()
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
    shouldRequireFailureOf otherGestureRecognizer: UIGestureRecognizer) -> Bool {
    if NSStringFromClass(type(of: otherGestureRecognizer)) == "ScrawlKit.TouchObserver" {
      return false
    }
    return original?.gestureRecognizer?(gestureRecognizer,
      shouldRequireFailureOf: otherGestureRecognizer) ?? false
  }

  override func responds(to selector: Selector!) -> Bool {
    super.responds(to: selector) || (original?.responds(to: selector) ?? false)
  }

  override func forwardingTarget(for selector: Selector!) -> Any? {
    original
  }
}

private final class ScrawlTouchWindow: UIWindow {
  private let touchDelegates = NSMapTable<UIGestureRecognizer, ScrawlTouchDelegate>.weakToStrongObjects()

  override func addGestureRecognizer(_ gestureRecognizer: UIGestureRecognizer) {
    if NSStringFromClass(type(of: gestureRecognizer)) == "ScrawlKit.TouchObserver" {
      // UIKit can cache failure relationships when pairing adds the observer,
      // before this window receives its first touch.
      var pending: [UIView] = [self]
      while let view = pending.popLast() {
        installTouchDelegates(in: view)
        pending.append(contentsOf: view.subviews)
      }
    }
    super.addGestureRecognizer(gestureRecognizer)
  }

  private func installTouchDelegates(in view: UIView) {
    for recognizer in view.gestureRecognizers ?? [] {
      let name = NSStringFromClass(type(of: recognizer))
      guard name == "RCTSurfaceTouchHandler" || name == "RCTTouchHandler",
        let original = recognizer.delegate,
        !(original is ScrawlTouchDelegate) else { continue }
      let proxy = ScrawlTouchDelegate(original: original)
      touchDelegates.setObject(proxy, forKey: recognizer)
      recognizer.delegate = proxy
    }
  }

  override func sendEvent(_ event: UIEvent) {
    if event.type == .touches {
      for touch in event.allTouches ?? [] {
        var ancestor = touch.view
        while let view = ancestor {
          installTouchDelegates(in: view)
          ancestor = view.superview
        }
      }
    }
    super.sendEvent(event)
  }
}
#endif
`;

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
    // Replace our generated helper on incremental prebuilds as well as clean ones.
    source = source.replace(
      /\n#if DEBUG\nprivate final class ScrawlTouchDelegate[\s\S]*?\n#endif\n?/,
      '',
    );
    if (!source.includes('window = ScrawlTouchWindow(')) {
      const window = '    window = UIWindow(frame: UIScreen.main.bounds)';
      if (!source.includes(window)) throw new Error('Scrawl could not find the Expo window hook.');
      source = source.replace(
        window,
        '    #if DEBUG\n    window = ScrawlTouchWindow(frame: UIScreen.main.bounds)\n    #else\n' +
          window +
          '\n    #endif',
      );
    }
    const startup = '    let delegate = ReactNativeDelegate()';
    const coldStart = '    if let url = launchOptions?[.url] as? URL {';
    if (!source.includes(coldStart)) {
      if (!source.includes(startup)) {
        throw new Error('Scrawl could not find the Expo SDK 57 startup hook.');
      }
      // A link that launches a stopped app arrives in launch options rather than openURL.
      source = source.replace(
        startup,
        `    #if DEBUG\n${coldStart}\n      _ = Scrawl.handleSetupURL(url)\n    }\n    #endif\n\n${startup}`,
      );
    }
    if (source.includes('private func installScrawl')) {
      if (!source.includes('private final class ScrawlTouchWindow')) source += touchCompatibility;
      mod.modResults.contents = source;
      return mod;
    }
    const launch =
      '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)';
    const linking = '    return super.application(app, open: url, options: options)';
    if (!source.includes(launch) || !source.includes(linking) || !source.includes(startup)) {
      throw new Error('Scrawl could not find the Expo SDK 57 launch and linking hooks.');
    }
    source = `#if DEBUG\nimport UIKit\nimport SwiftUI\nimport ScrawlKit\n#endif\n${source}`;
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
    mod.modResults.contents = source + touchCompatibility;
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
