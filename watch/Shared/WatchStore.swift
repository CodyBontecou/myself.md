import Foundation

enum WatchStore {
  static var group: String { Bundle.main.object(forInfoDictionaryKey: "WatchAppGroup") as? String ?? "group.com.myself.md.watch" }
  static func root() throws -> URL {
    guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { throw WatchFailure.storage }
    return url
  }
  static func directory(_ name: String) throws -> URL {
    let url = try root().appendingPathComponent(name, isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }
  static func load() throws -> WatchSnapshot {
    let url = try root().appendingPathComponent("snapshot.json")
    guard FileManager.default.fileExists(atPath: url.path) else { return WatchSnapshot() }
    return try JSONDecoder().decode(WatchSnapshot.self, from: Data(contentsOf: url))
  }
  static func save(_ snapshot: WatchSnapshot) throws {
    try JSONEncoder().encode(snapshot).write(to: root().appendingPathComponent("snapshot.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }
  // Widget and app write distinct request files. The watch app alone owns snapshot/outbox mutation.
  @discardableResult static func enqueue() throws -> WatchExportRequest {
    let request = WatchExportRequest(id: UUID().uuidString.lowercased(), interval: .today())
    try JSONEncoder().encode(request).write(to: directory("requests").appendingPathComponent("\(request.id).json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    return request
  }
  static func requests() throws -> [(URL, WatchExportRequest)] {
    try FileManager.default.contentsOfDirectory(at: directory("requests"), includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == "json" }.map { ($0, try JSONDecoder().decode(WatchExportRequest.self, from: Data(contentsOf: $0))) }
  }
}
