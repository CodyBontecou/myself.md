import Foundation

struct WatchProfile: Codable {
  struct ExportSettings: Codable { var schema: String; var destination: String; var httpUrl: String?; var formats: [String] }
  var id: String
  var name: String
  var selection: [String: [String]]
  var exportSettings: ExportSettings
  var agentAccess: Bool?
  enum CodingKeys: String, CodingKey { case id, name, selection, agentAccess; case exportSettings = "export" }
  func validate() throws {
    guard exportSettings.schema == "myself.md.export.v1", exportSettings.destination == "http",
          exportSettings.formats == ["json"], selection["health"] == ["native:HKQuantityTypeIdentifierStepCount"],
          selection["time"] == [], selection["location"] == [],
          let endpoint = exportSettings.httpUrl, let url = URL(string: endpoint), url.scheme == "https",
          url.host != nil, url.user == nil, url.password == nil, url.fragment == nil else { throw WatchFailure.invalidProfile }
  }
}
struct WatchConfiguration: Codable {
  var deviceId: String
  var revision: String
  var expiresAt: Double
  var server: String
  var profile: WatchProfile
}
struct WatchProvision: Codable {
  var deviceId: String
  var revision: String
  var expiresAt: Double
  var server: String
  var profile: WatchProfile
  var token: String
  var destinationBearer: String
  var configuration: WatchConfiguration { .init(deviceId: deviceId, revision: revision, expiresAt: expiresAt, server: server, profile: profile) }
}
struct WatchSecrets: Codable { var token: String; var destinationBearer: String; var endpoint: String; var revision: String }
struct WatchInterval: Codable, Equatable {
  var start: String; var end: String; var day: String; var timezone: String
  static func nextDay(after date: Date, timezone: TimeZone = .current) -> Date {
    var calendar = Calendar(identifier: .gregorian); calendar.timeZone = timezone
    return calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: date))!
  }
  static func today(at date: Date = Date(), timezone: TimeZone = .current) -> WatchInterval {
    var calendar = Calendar(identifier: .gregorian); calendar.timeZone = timezone
    let formatter = DateFormatter(); formatter.calendar = calendar; formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = timezone; formatter.dateFormat = "yyyy-MM-dd"
    return .init(start: WatchTimestamp.string(calendar.startOfDay(for: date)), end: WatchTimestamp.string(date),
                 day: formatter.string(from: date), timezone: timezone.identifier)
  }
}
struct WatchSummary: Codable {
  var steps: Double? = nil; var observedAt: String? = nil; var day: String? = nil
  var timezone: String = TimeZone.current.identifier; var earliestAvailable: String? = nil; var permissionRequested = false
  enum CodingKeys: String, CodingKey { case steps, observedAt, day, timezone, earliestAvailable, permissionRequested }
  func encode(to encoder: Encoder) throws {
    var fields = encoder.container(keyedBy: CodingKeys.self)
    try fields.encode(steps, forKey: .steps); try fields.encode(observedAt, forKey: .observedAt)
    try fields.encode(day, forKey: .day); try fields.encode(timezone, forKey: .timezone)
    try fields.encode(earliestAvailable, forKey: .earliestAvailable); try fields.encode(permissionRequested, forKey: .permissionRequested)
  }
}
struct WatchRemoteJob: Codable, Identifiable {
  var id: String; var revision: String; var createdAt: Double; var updatedAt: Double; var expiresAt: Double
  var status: String; var actor: String; var client: String?; var interval: WatchInterval?
  var recordCount: Int?; var bytes: Int?; var httpStatus: Int?; var partial: Bool; var error: String?
}
struct WatchReceipt: Codable {
  var action = "settle"; var requestId: String; var status: String; var recordCount: Int
  var bytes: Int; var httpStatus: Int?; var partial: Bool; var error: String?
  enum CodingKeys: String, CodingKey { case action, requestId, status, recordCount, bytes, httpStatus, partial, error }
  func encode(to encoder: Encoder) throws {
    var fields = encoder.container(keyedBy: CodingKeys.self)
    try fields.encode(action, forKey: .action); try fields.encode(requestId, forKey: .requestId)
    try fields.encode(status, forKey: .status); try fields.encode(recordCount, forKey: .recordCount)
    try fields.encode(bytes, forKey: .bytes); try fields.encode(httpStatus, forKey: .httpStatus)
    try fields.encode(partial, forKey: .partial); try fields.encode(error, forKey: .error)
  }
}
struct WatchLocalJob: Codable, Identifiable {
  var id: String; var interval: WatchInterval; var status: String = "queued"; var filename: String? = nil
  var recordCount = 0; var bytes = 0; var partial = false; var error: String? = nil
  var retryAt: Double = 0; var attempts: Int = 0
  var reported = false; var receipt: WatchReceipt? = nil; var taskIdentifier: Int? = nil
}
struct WatchSnapshot: Codable {
  var configuration: WatchConfiguration? = nil
  var summary = WatchSummary()
  var jobs: [WatchLocalJob] = []
  var lastDeliveredAt: String? = nil
}
struct WatchExportRequest: Codable { var id: String; var interval: WatchInterval }
enum WatchTimestamp {
  static func string(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }
  static func date(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: value)
  }
}
enum WatchFailure: LocalizedError {
  case invalidProfile, missingSetup, permissions, http(Int), oversized, storage
  var errorDescription: String? {
    switch self {
    case .invalidProfile: return "Set up a Steps JSON profile with an HTTPS destination."
    case .missingSetup: return "Set up Apple Watch in myself.md on your iPhone."
    case .permissions: return "Review Steps access on your watch before exporting."
    case .http(let code):
      switch code {
      case 401: return "Session expired. Set up Apple Watch again on your iPhone."
      case 402: return "Your free exports are used. Unlock lifetime access in the phone app."
      case 403: return "Watch access was revoked. Review setup on your iPhone."
      case 429: return "Five exports are already pending. Wait for one to finish."
      default: return "Request failed (HTTP \(code)). Try again when connected."
      }
    case .oversized: return "This watch export exceeds the file limit."
    case .storage: return "Watch storage could not be opened. Try again."
    }
  }
}
