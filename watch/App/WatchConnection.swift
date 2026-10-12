import Foundation
import WatchConnectivity

final class WatchConnection: NSObject, WCSessionDelegate, @unchecked Sendable {
  static let shared = WatchConnection()
  static var deviceId: String {
    if let value = UserDefaults.standard.string(forKey: "watchDeviceId") { return value }
    let value = UUID().uuidString.lowercased(); UserDefaults.standard.set(value, forKey: "watchDeviceId"); return value
  }
  func activate() {
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self; WCSession.default.activate()
  }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    guard let kind = message["kind"] as? String else { replyHandler(["error": "invalid"]); return }
    Task { @MainActor in
      if kind == "watch-status" {
        replyHandler(["deviceId": Self.deviceId, "configured": WatchRuntime.shared.snapshot.configuration != nil])
      } else if kind == "watch-provision", let payload = message["payload"] as? String, payload.utf8.count < 16384 {
        do {
          let provision = try JSONDecoder().decode(WatchProvision.self, from: Data(payload.utf8))
          guard provision.deviceId == Self.deviceId else { throw WatchFailure.invalidProfile }
          try await WatchRuntime.shared.configure(provision)
          replyHandler(["deviceId": provision.deviceId, "revision": provision.revision])
        } catch { replyHandler(["error": "Setup could not finish. Wait for the watch to be idle and try again."]) }
      } else { replyHandler(["error": "invalid"]) }
    }
  }
}
