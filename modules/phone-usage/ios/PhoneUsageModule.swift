import ExpoModulesCore
import FamilyControls
import DeviceActivity

public final class PhoneUsageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PhoneUsage")
    AsyncFunction("status") { () -> String in self.authorization() }
    AsyncFunction("authorize") { () async throws -> String in
      try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
      return self.authorization()
    }
    AsyncFunction("read") { (start: Double, end: Double, kind: String, offset: Int, limit: Int) async throws -> [String: Any] in
      guard #available(iOS 26.4, *), self.authorization() == "authorized" else {
        throw UsageAccessError.unavailable
      }
      return try await self.readUsage(start: start, end: end, kind: kind, offset: offset, limit: limit)
    }
  }
  private func authorization() -> String {
    if #available(iOS 26.4, *) {
      switch AuthorizationCenter.shared.authorizationStatus {
      case .approvedWithDataAccess: return "authorized"
      case .approved: return "limited"
      case .denied: return "denied"
      case .notDetermined: return "not-requested"
      @unknown default: return "unavailable"
      }
    }
    return "unavailable"
  }
  @available(iOS 26.4, *)
  private func readUsage(start: Double, end: Double, kind: String, offset: Int, limit: Int) async throws -> [String: Any] {
    guard (kind == "applications" || kind == "websites"), offset >= 0, (1...50).contains(limit), end > start, end - start <= 31 * 86400000 else { throw UsageAccessError.invalidQuery }
    let interval = DateInterval(start: Date(timeIntervalSince1970: start / 1000), end: Date(timeIntervalSince1970: end / 1000))
    let filter = DeviceActivityFilter(segment: .hourly(during: interval))
    var rows: [[String: Any]] = []
    for try await device in DeviceActivityData.activityData(filteredBy: filter, using: .live) {
      for await segment in device.activitySegments {
        for await category in segment.categories {
          if kind == "applications" {
            for await app in category.applications {
              guard let identifier = app.application.bundleIdentifier, app.totalActivityDuration > 0 else { continue }
              rows.append([
                "identifier": identifier, "displayName": app.application.localizedDisplayName ?? identifier,
                "category": category.category.localizedDisplayName ?? "", "deviceName": device.device.name ?? "",
                "startMs": segment.dateInterval.start.timeIntervalSince1970 * 1000,
                "endMs": segment.dateInterval.end.timeIntervalSince1970 * 1000,
                "durationMs": app.totalActivityDuration * 1000, "pickups": app.numberOfPickups,
                "notifications": app.numberOfNotifications, "granularity": "hourly-aggregate"
              ])
            }
          } else {
            for await web in category.webDomains {
              guard let identifier = web.webDomain.domain, web.totalActivityDuration > 0 else { continue }
              rows.append([
                "identifier": identifier, "category": category.category.localizedDisplayName ?? "",
                "deviceName": device.device.name ?? "", "startMs": segment.dateInterval.start.timeIntervalSince1970 * 1000,
                "endMs": segment.dateInterval.end.timeIntervalSince1970 * 1000,
                "durationMs": web.totalActivityDuration * 1000, "granularity": "hourly-aggregate"
              ])
            }
          }
          if rows.count > 100000 { throw UsageAccessError.rangeTooLarge }
        }
      }
    }
    rows.sort { a, b in
      let left = a["startMs"] as? Double ?? 0, right = b["startMs"] as? Double ?? 0
      if left != right { return left < right }
      return "\(a["deviceName"] ?? ""):\(a["identifier"] ?? "")" < "\(b["deviceName"] ?? ""):\(b["identifier"] ?? "")"
    }
    let last = min(rows.count, offset + limit)
    let page = offset < rows.count ? Array(rows[offset..<last]) : []
    return ["records": page, "nextOffset": last < rows.count ? last as Any : NSNull(),
      "warnings": ["Hourly aggregates can include other devices in the Screen Time account. Values are not individual sessions. The system may redact identifiers or omit data.", "Pagination re-reads live data. Use completed historical intervals to avoid changes between pages."]]
  }
}
private enum UsageAccessError: Error { case unavailable, invalidQuery, rangeTooLarge }
