const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

// iOS 27 asserts at launch unless the app adopts the UIScene life cycle. Expo SDK 57 provides
// ExpoAppSceneDelegate, which creates the window and starts React Native per scene and forwards
// scene events to the ExpoAppDelegate, so the AppDelegate must stop creating its own window.
const sceneDelegate = `
class SceneDelegate: ExpoAppSceneDelegate {
  override func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    super.scene(scene, willConnectTo: session, options: connectionOptions)
    #if DEBUG
    // Keep Scrawl's touch-compatible window for paired debug recordings.
    guard let windowScene = scene as? UIWindowScene,
      let current = window,
      let app = UIApplication.shared.delegate as? AppDelegate
    else { return }
    let touch = ScrawlTouchWindow(windowScene: windowScene)
    touch.rootViewController = current.rootViewController
    current.rootViewController = nil
    current.isHidden = true
    touch.makeKeyAndVisible()
    window = touch
    app.window = touch
    app.installScrawl(in: touch)
    #endif
  }
}
`;

/** @param {import('expo/config').ExpoConfig} config */
module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    let source = mod.modResults.contents;
    if (source.includes('class SceneDelegate: ExpoAppSceneDelegate')) return mod;
    const declaration = 'class AppDelegate: ExpoAppDelegate {';
    const start =
      /\n#if os\(iOS\) \|\| os\(tvOS\)\n[\s\S]*?factory\.startReactNative\([\s\S]*?\)\n#endif\n/;
    if (!source.includes(declaration) || !start.test(source))
      throw new Error('Scene lifecycle requires the Expo SDK 57 Swift AppDelegate window hook.');
    if (!source.includes('private func installScrawl'))
      throw new Error('Scene lifecycle must run after the Scrawl AppDelegate changes.');
    source = source
      .replace(declaration, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')
      .replace(start, '\n')
      .replace('    #if DEBUG\n    installScrawl(in: window)\n    #endif\n\n', '')
      .replace('private func installScrawl', 'fileprivate func installScrawl');
    mod.modResults.contents = `import UIKit\n${source}\n${sceneDelegate}`;
    return mod;
  });
};
