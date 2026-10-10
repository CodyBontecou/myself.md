import ExpoModulesCore
import UIKit

public final class GripeModule: Module {
    private var initialized = false
    private var operationId = ""
    private var outcome = "idle"
    private var issueURL = ""
    private var observers: [NSObjectProtocol] = []
    private let operationStore = "myself.gripe.operations"

    public func definition() -> ModuleDefinition {
        Name("MyselfGripe")
        AsyncFunction("setReporter") { (key: String) in
            guard key.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
                throw NSError(domain: "MyselfGripe", code: 4, userInfo: [NSLocalizedDescriptionKey: "Invalid reporter key."])
            }
            #if DEBUG
            GripeAPIClient.shared.reporterKey = key
            #endif
        }.runOnQueue(.main)
        AsyncFunction("status") { () -> [String: Any] in
            self.initialize()
            return self.snapshot()
        }.runOnQueue(.main)
        AsyncFunction("open") { (id: String) -> [String: Any] in
            self.initialize()
            guard self.available() else { return self.snapshot() }
            guard UIApplication.shared.applicationState == .active else {
                throw NSError(domain: "MyselfGripe", code: 1, userInfo: [NSLocalizedDescriptionKey: "Open myself.md in the foreground first."])
            }
            guard !id.isEmpty, id.count <= 100 else {
                throw NSError(domain: "MyselfGripe", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid feedback operation."])
            }
            if let saved = UserDefaults.standard.dictionary(forKey: self.operationStore)?[id] as? [String: String] {
                var result = self.snapshot()
                result["operationId"] = id
                result["outcome"] = saved["outcome"] == "running" && self.operationId != id ? "failed" : saved["outcome"]
                result["issueUrl"] = saved["issueUrl"] ?? ""
                return result
            }
            if self.operationId == id || self.outcome == "running" { return self.snapshot() }
            #if DEBUG
            guard !Gripe.shared.inFlight else {
                throw NSError(domain: "MyselfGripe", code: 3, userInfo: [NSLocalizedDescriptionKey: "Finish the current feedback report first."])
            }
            #endif
            self.operationId = id
            self.outcome = "running"
            self.issueURL = ""
            self.saveOutcome()
            #if DEBUG
            Gripe.trigger(operationId: id)
            #endif
            return self.snapshot()
        }.runOnQueue(.main)
        AsyncFunction("configure") { (changes: [String: Bool]) -> [String: Any] in
            self.initialize()
            guard self.available(), UIApplication.shared.applicationState == .active else {
                throw NSError(domain: "MyselfGripe", code: 4, userInfo: [NSLocalizedDescriptionKey: "Open a configured Debug app first."])
            }
            #if DEBUG
            try GripePreferences.update(changes)
            #endif
            return self.snapshot()
        }.runOnQueue(.main)
        AsyncFunction("settings") { () in
            self.initialize()
            guard self.available(), UIApplication.shared.applicationState == .active else { return }
            #if DEBUG
            guard !Gripe.shared.inFlight else { return }
            let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
            var presenter = scene?.keyWindow?.rootViewController
            while let next = presenter?.presentedViewController { presenter = next }
            if let presenter { GripePreferences.present(from: presenter) }
            #endif
        }.runOnQueue(.main)
        OnDestroy {
            for observer in self.observers { NotificationCenter.default.removeObserver(observer) }
        }
    }

    private func available() -> Bool {
        #if DEBUG
        return Gripe.shared.configuration != nil
        #else
        return false
        #endif
    }

    private func snapshot() -> [String: Any] {
        #if DEBUG
        let status = available() ? "ready" : "missing_key"
        #else
        let status = "release_disabled"
        #endif
        var result: [String: Any] = ["status": status, "operationId": operationId, "outcome": outcome, "issueUrl": issueURL]
        #if DEBUG
        if available() { result["settings"] = GripePreferences.values }
        #endif
        return result
    }

    private func saveOutcome() {
        guard !operationId.isEmpty else { return }
        var saved = UserDefaults.standard.dictionary(forKey: operationStore) as? [String: [String: String]] ?? [:]
        let now = Date().timeIntervalSince1970
        saved = saved.filter { now - (Double($0.value["savedAt"] ?? "0") ?? 0) < 600 }
        saved[operationId] = ["outcome": outcome, "issueUrl": issueURL, "savedAt": String(now)]
        UserDefaults.standard.set(saved, forKey: operationStore)
    }

    private func initialize() {
        guard !initialized else { return }
        initialized = true
        #if DEBUG
        let key = Bundle.main.object(forInfoDictionaryKey: "GripeAPIKey") as? String ?? ""
        let dryRun = Bundle.main.object(forInfoDictionaryKey: "GripeDryRun") as? String == "1"
        guard dryRun || (!key.isEmpty && !key.hasPrefix("$(")) else { return }
        let repository = Bundle.main.object(forInfoDictionaryKey: "GripeRepository") as? String
        if Gripe.shared.configuration == nil {
            Gripe.start(apiKey: key, dryRun: dryRun, repository: repository, environment: .debug, installer: "codex-react-native", telemetry: false)
        }
        observers.append(NotificationCenter.default.addObserver(forName: Notification.Name("GripeCaptureStarted"), object: nil, queue: .main) { [weak self] note in
            guard let self, let id = note.userInfo?["operationId"] as? String else { return }
            self.operationId = id
            self.outcome = "running"
            self.issueURL = ""
            self.saveOutcome()
        })
        observers.append(NotificationCenter.default.addObserver(forName: Notification.Name("GripeIssueSubmitted"), object: nil, queue: .main) { [weak self] note in
            guard let self, let url = note.userInfo?["url"] as? URL else { return }
            self.outcome = dryRun ? "dry_run" : "completed"
            self.issueURL = dryRun ? "" : url.absoluteString
            self.saveOutcome()
        })
        observers.append(NotificationCenter.default.addObserver(forName: Notification.Name("GripeCaptureClosed"), object: nil, queue: .main) { [weak self] _ in
            guard let self, self.outcome == "running" else { return }
            self.outcome = "cancelled"
            self.saveOutcome()
        })
        observers.append(NotificationCenter.default.addObserver(forName: Notification.Name("GripeSubmissionFailed"), object: nil, queue: .main) { [weak self] _ in
            self?.outcome = "failed"
            self?.saveOutcome()
        })
        #endif
    }
}
