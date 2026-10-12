import ExpoModulesCore
import WatchConnectivity

public final class WatchBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchBridge")
    OnCreate { WatchPhoneConnection.shared.activate() }
    AsyncFunction("status") { () async throws -> String in
      let connection = WatchPhoneConnection.shared
      connection.activate()
      guard WCSession.isSupported() else { return "{\"supported\":false}" }
      let session = WCSession.default
      var result: [String: Any] = ["supported": true, "paired": session.isPaired,
                                 "installed": session.isWatchAppInstalled, "reachable": session.isReachable]
      if session.activationState == .activated && session.isReachable {
        let reply = try await connection.message(["kind": "watch-status"])
        result["deviceId"] = reply["deviceId"]
        result["configured"] = reply["configured"]
      }
      return String(decoding: try JSONSerialization.data(withJSONObject: result), as: UTF8.self)
    }
    AsyncFunction("provision") { (payload: String) async throws -> String in
      guard payload.utf8.count < 16384,
            let bytes = payload.data(using: .utf8),
            let input = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
            let deviceId = input["deviceId"] as? String,
            let revision = input["revision"] as? String else { throw WatchBridgeError.invalid }
      let reply = try await WatchPhoneConnection.shared.message(["kind": "watch-provision", "payload": payload])
      guard reply["deviceId"] as? String == deviceId,
            reply["revision"] as? String == revision else { throw WatchBridgeError.invalid }
      return "{\"status\":\"completed\"}"
    }
  }
}

private enum WatchBridgeError: LocalizedError {
  case unavailable, invalid
  var errorDescription: String? {
    switch self {
    case .unavailable: return "Open myself.md on your paired Apple Watch, then try again."
    case .invalid: return "The watch did not confirm this profile. Try setup again."
    }
  }
}

private final class WatchPhoneConnection: NSObject, WCSessionDelegate, @unchecked Sendable {
  static let shared = WatchPhoneConnection()
  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    if session.delegate == nil { session.delegate = self; session.activate() }
  }
  func message(_ message: [String: Any]) async throws -> [String: Any] {
    activate()
    guard WCSession.default.activationState == .activated, WCSession.default.isReachable else {
      throw WatchBridgeError.unavailable
    }
    // sendMessage has a bounded system timeout. Secrets never enter applicationContext or transferUserInfo.
    return try await withCheckedThrowingContinuation { continuation in
      WCSession.default.sendMessage(message, replyHandler: { continuation.resume(returning: $0) },
                                   errorHandler: { _ in continuation.resume(throwing: WatchBridgeError.unavailable) })
    }
  }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }
}
