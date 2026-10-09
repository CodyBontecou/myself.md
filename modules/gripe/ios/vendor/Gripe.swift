#if DEBUG && canImport(UIKit)
import UIKit

public final class Gripe {
    public enum Environment: String, Codable {
        case debug
        case staging
        case production
    }

    public struct Configuration {
        public var apiKey: String
        public var endpoint: URL
        public var dryRun: Bool
        public var repository: String?
        public var environment: Environment
        public var installer: String?
        public var telemetry: Bool

        public init(
            apiKey: String,
            endpoint: URL,
            dryRun: Bool,
            repository: String? = nil,
            environment: Environment = .debug,
            installer: String? = nil,
            telemetry: Bool = true
        ) {
            self.apiKey = apiKey
            self.endpoint = endpoint
            self.dryRun = dryRun
            self.repository = repository
            self.environment = environment
            self.installer = installer
            self.telemetry = telemetry
        }
    }

    public static let shared = Gripe()
    public static let sdkVersion = "0.2.1"

    var configuration: Configuration?
    private let installer = GestureInstaller()
    var inFlight = false

    private init() {}

    public static func start(
        apiKey: String,
        endpoint: URL = URL(string: "https://gripe.isolated.tech/v1/reports")!,
        dryRun: Bool = false,
        repository: String? = nil,
        environment: Environment = .debug,
        installer: String? = nil,
        telemetry: Bool = true
    ) {
        shared.configuration = Configuration(
            apiKey: apiKey,
            endpoint: endpoint,
            dryRun: dryRun,
            repository: repository,
            environment: environment,
            installer: installer,
            telemetry: telemetry
        )
        shared.installer.install { [weak shared = shared] in
            shared?.handleTrigger()
        }
        RetryQueue.shared.flushInBackground()
    }

    public static func stop() {
        shared.installer.uninstall()
        shared.configuration = nil
    }

    public static func trigger(operationId: String? = nil) {
        shared.handleTrigger(operationId: operationId)
    }

    private func handleTrigger(operationId: String? = nil) {
        guard !inFlight else { return }
        inFlight = true
        NotificationCenter.default.post(name: Notification.Name("GripeCaptureStarted"), object: nil, userInfo: ["operationId": operationId ?? "gesture-\(UUID().uuidString)"])
        CaptureFlow.start { [weak self] in
            self?.inFlight = false
            NotificationCenter.default.post(name: Notification.Name("GripeCaptureClosed"), object: nil)
        }
    }
}
#endif
