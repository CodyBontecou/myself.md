#if DEBUG && canImport(UIKit)
import UIKit

struct GripeMetadata: Codable {
    let appVersion: String
    let build: String
    let bundleIdentifier: String
    let osName: String
    let osVersion: String
    let deviceModel: String
    let screenWidth: CGFloat
    let screenHeight: CGFloat
    let capturedAt: Date
    let viewControllerName: String?
    let locale: String
    let environment: String
    let sdkVersion: String
    let protocolVersion: String
    let installer: String?
}

enum MetadataCollector {
    static func collect() -> GripeMetadata {
        let info = Bundle.main.infoDictionary ?? [:]
        let screen = currentScreenSize()
        let config = Gripe.shared.configuration
        let environment = config?.environment.rawValue ?? Gripe.Environment.debug.rawValue
        let installer = (config?.telemetry ?? true) ? config?.installer : nil

        return GripeMetadata(
            appVersion: info["CFBundleShortVersionString"] as? String ?? "?",
            build: info["CFBundleVersion"] as? String ?? "?",
            bundleIdentifier: Bundle.main.bundleIdentifier ?? "?",
            osName: UIDevice.current.systemName,
            osVersion: UIDevice.current.systemVersion,
            deviceModel: deviceIdentifier(),
            screenWidth: screen.width,
            screenHeight: screen.height,
            capturedAt: Date(),
            viewControllerName: topViewControllerName(),
            locale: Locale.current.identifier,
            environment: environment,
            sdkVersion: Gripe.sdkVersion,
            protocolVersion: GripeAPIClient.protocolVersion,
            installer: installer
        )
    }

    private static func currentScreenSize() -> CGSize {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first {
            return scene.screen.bounds.size
        }
        return .zero
    }

    private static func deviceIdentifier() -> String {
        var sys = utsname()
        uname(&sys)
        let mirror = Mirror(reflecting: sys.machine)
        return mirror.children.compactMap { element -> String? in
            guard let value = element.value as? Int8, value != 0 else { return nil }
            return String(UnicodeScalar(UInt8(value)))
        }.joined()
    }

    private static func topViewControllerName() -> String? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first,
              let window = scene.keyWindow ?? scene.windows.first,
              var top = window.rootViewController else { return nil }
        while let presented = top.presentedViewController { top = presented }
        // Skip Gripe's own UI so we report the host app's view, not our composer.
        var candidate: UIViewController? = top
        while let vc = candidate, isGripeInternal(vc) {
            candidate = vc.presentingViewController
        }
        return String(describing: type(of: candidate ?? top))
    }

    private static func isGripeInternal(_ vc: UIViewController) -> Bool {
        String(reflecting: type(of: vc)).hasPrefix("GripeSDK.")
    }
}
#endif
