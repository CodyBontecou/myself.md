import Foundation
import Observation
import WidgetKit
import WatchKit

@MainActor @Observable final class WatchRuntime {
  static let shared = WatchRuntime()
  var snapshot = WatchSnapshot()
  var busy = false
  var message: String? = nil
  let health = WatchHealth()
  private var started = false
  private let transferDelegate = WatchTransferDelegate()
  private lazy var transfers: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.waitsForConnectivity = true
    configuration.timeoutIntervalForResource = 60
    return URLSession(configuration: configuration, delegate: transferDelegate, delegateQueue: nil)
  }()
  init(preview: WatchSnapshot? = nil) {
    if let preview { snapshot = preview; return }
    do { snapshot = try WatchStore.load() } catch { message = WatchFailure.storage.localizedDescription }
  }
  func persist() throws { try WatchStore.save(snapshot); WidgetCenter.shared.reloadAllTimelines() }
  func activate() {
    if !started { started = true; _ = transfers; WatchConnection.shared.activate() }
  }
  func authorizeHealth() async {
    guard !busy else { return }; busy = true
    do { try await health.authorize(); snapshot.summary.permissionRequested = true; try persist() }
    catch { message = "Health permission review could not finish. Try again on your watch." }
    busy = false; await refresh()
  }
  func pauseTransfers() async {
    let tasks = await transfers.allTasks; tasks.forEach { $0.cancel() }
    // Completion callbacks preserve acknowledgments or requeue the frozen file. A process restart also requeues orphan tasks.
  }
  func configure(_ provision: WatchProvision) async throws {
    guard !busy else { throw WatchFailure.storage }
    busy = true; defer { busy = false }
    try provision.profile.validate()
    guard UUID(uuidString: provision.deviceId) != nil, UUID(uuidString: provision.revision) != nil,
          provision.expiresAt > Date().timeIntervalSince1970 * 1000,
          provision.token.count == 43, provision.destinationBearer.utf8.count <= 4096,
          !provision.destinationBearer.contains("\n"), !provision.destinationBearer.contains("\r"),
          let server = URL(string: provision.server), server.scheme == "https", server.host != nil,
          server.user == nil, server.password == nil, server.query == nil, server.fragment == nil,
          server.path.isEmpty || server.path == "/" else { throw WatchFailure.invalidProfile }
    let tasks = await transfers.allTasks
    tasks.forEach { $0.cancel() }
    try FileManager.default.removeItem(at: WatchStore.directory("outbox"))
    for (url, _) in try WatchStore.requests() { try FileManager.default.removeItem(at: url) }
    try WatchKeychain.save(.init(token: provision.token, destinationBearer: provision.destinationBearer,
                              endpoint: provision.profile.exportSettings.httpUrl!, revision: provision.revision))
    snapshot = WatchSnapshot(configuration: provision.configuration)
    try persist(); message = "Review Steps access on this watch."
  }
  func exportNow() async {
    guard !busy else { return }
    do { guard snapshot.configuration != nil else { throw WatchFailure.missingSetup }; try WatchStore.enqueue(); await refresh() }
    catch { message = error.localizedDescription }
  }
  struct Revoked: Decodable { var status: String }
  func reset() async {
    guard !busy else { return }
    busy = true; defer { busy = false }
    do { _ = try await request(["action": "revoke"], as: Revoked.self) }
    catch WatchFailure.http(let code) where code == 401 || code == 403 { /* Already expired/revoked; clear the unusable local setup. */ }
    catch { message = "Connect your watch to remove setup, or revoke it from Settings on your iPhone."; return }
    let tasks = await transfers.allTasks; tasks.forEach { $0.cancel() }
    for (url, _) in (try? WatchStore.requests()) ?? [] { try? FileManager.default.removeItem(at: url) }
    if let directory = try? WatchStore.directory("outbox") { try? FileManager.default.removeItem(at: directory) }
    WatchKeychain.clear(); snapshot = WatchSnapshot()
    UserDefaults.standard.removeObject(forKey: "watchDeviceId")
    do { try persist(); message = nil } catch { message = WatchFailure.storage.localizedDescription }
  }
  private lazy var controls = URLSession(configuration: .ephemeral, delegate: transferDelegate, delegateQueue: nil)
  func request<T: Decodable>(_ value: [String: Any], as type: T.Type) async throws -> T {
    guard let configuration = snapshot.configuration, (configuration.expiresAt > Date().timeIntervalSince1970 * 1000 || value["action"] as? String == "revoke"),
          let secrets = try WatchKeychain.read(), secrets.revision == configuration.revision,
          let url = URL(string: configuration.server + "/api/watch/runtime") else { throw WatchFailure.missingSetup }
    var request = URLRequest(url: url); request.httpMethod = "POST"; request.timeoutInterval = 20
    request.setValue("Watch \(secrets.token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: value)
    let (data, response) = try await controls.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw WatchFailure.storage }
    guard (200..<300).contains(http.statusCode) else { throw WatchFailure.http(http.statusCode) }
    return try JSONDecoder().decode(type, from: data)
  }
  private func object<T: Encodable>(_ value: T) throws -> [String: Any] {
    guard let result = try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [String: Any] else { throw WatchFailure.storage }
    return result
  }
  struct Poll: Decodable { var revision: String; var expiresAt: Double; var profile: WatchProfile; var jobs: [WatchRemoteJob] }
  struct Started: Decodable { var job: WatchRemoteJob; var profile: WatchProfile }
  func refresh() async {
    guard !busy, snapshot.configuration != nil, WKApplication.shared().applicationState == .active else { return }
    busy = true; defer { busy = false }
    do {
      do { snapshot.summary = try await health.summary() }
      catch { snapshot.summary.steps = nil; snapshot.summary.observedAt = nil }
      var sharedSummary = snapshot.summary
      if snapshot.configuration?.profile.agentAccess != true {
        sharedSummary.steps = nil; sharedSummary.observedAt = nil; sharedSummary.day = nil; sharedSummary.earliestAvailable = nil
      }
      let poll = try await request(["action": "poll", "summary": try object(sharedSummary), "foreground": true], as: Poll.self)
      guard poll.revision == snapshot.configuration?.revision else { throw WatchFailure.invalidProfile }
      try poll.profile.validate()
      snapshot.configuration?.profile = poll.profile
      snapshot.configuration?.expiresAt = poll.expiresAt
      for remote in poll.jobs where ["accepted", "awaiting_user", "running"].contains(remote.status) && !snapshot.jobs.contains(where: { $0.id == remote.id }) {
        let date = Date(timeIntervalSince1970: remote.createdAt / 1000)
        let interval = remote.interval ?? WatchInterval.today(at: date)
        snapshot.jobs.append(.init(id: remote.id, interval: interval))
      }
      let tasks = await transfers.allTasks
      for index in snapshot.jobs.indices where ["queued", "uploading", "awaiting_user"].contains(snapshot.jobs[index].status) {
        let id = snapshot.jobs[index].id
        if let remote = poll.jobs.first(where: { $0.id == id }), ["cancelled", "expired"].contains(remote.status) {
          tasks.filter { $0.taskDescription == id }.forEach { $0.cancel() }
          snapshot.jobs[index].status = "cancelled"; snapshot.jobs[index].error = "This request is no longer active."
          removeFile(index)
        } else if snapshot.jobs[index].status == "uploading" && !tasks.contains(where: { $0.taskDescription == id }) {
          // A process restart may outlive the system task. Keep the exact file/id for an idempotent retry.
          snapshot.jobs[index].status = "queued"; snapshot.jobs[index].taskIdentifier = nil
        }
      }
      for (url, pending) in try WatchStore.requests() {
        if !snapshot.jobs.contains(where: { $0.id == pending.id }) {
          guard snapshot.jobs.filter({ ["queued", "uploading", "awaiting_user"].contains($0.status) }).count < 5 else {
            message = "Five exports are already pending."; break
          }
          snapshot.jobs.append(.init(id: pending.id, interval: pending.interval)); try persist()
        }
        try FileManager.default.removeItem(at: url)
      }
      try persist()
      for index in snapshot.jobs.indices where snapshot.jobs[index].receipt != nil && !snapshot.jobs[index].reported {
        let receipt = snapshot.jobs[index].receipt!
        _ = try await request(try object(receipt), as: WatchRemoteJob.self)
        snapshot.jobs[index].reported = true; removeFile(index); try persist()
      }
      let queued = snapshot.jobs.filter { ["queued", "awaiting_user"].contains($0.status) && $0.retryAt <= Date().timeIntervalSince1970 }.map(\.id)
      for id in queued {
        do { try await begin(id) }
        catch {
          if let index = snapshot.jobs.firstIndex(where: { $0.id == id }), snapshot.jobs[index].status == "failed" { continue }
          throw error
        }
      }
      let retained = snapshot.jobs.filter { ["queued", "uploading", "awaiting_user"].contains($0.status) || ($0.receipt != nil && !$0.reported) }
      let finished = snapshot.jobs.filter { job in !retained.contains(where: { pending in pending.id == job.id }) }
      snapshot.jobs = (Array(finished.suffix(max(0, 40 - retained.count))) + retained).sorted { $0.interval.end < $1.interval.end }; try persist()
      message = nil
    } catch {
      message = error is URLError ? "Offline. Reopen this watch app when connected to retry queued exports." : error.localizedDescription
      try? persist()
    }
  }
  private func begin(_ id: String) async throws {
    guard let index = snapshot.jobs.firstIndex(where: { $0.id == id }), let configuration = snapshot.configuration else { return }
    guard WKApplication.shared().applicationState == .active else { return }
    let interval = snapshot.jobs[index].interval
    let queued = try await request(["action": "enqueue", "requestId": id, "interval": try object(interval)], as: WatchRemoteJob.self)
    if ["completed", "failed", "cancelled", "expired"].contains(queued.status) {
      snapshot.jobs[index].status = queued.status == "completed" ? "delivered" : queued.status == "failed" ? "failed" : "cancelled"
      snapshot.jobs[index].reported = true; snapshot.jobs[index].error = queued.error; try persist(); return
    }
    if try await health.needsAuthorization() {
      _ = try await request(["action": "awaiting_user", "requestId": id], as: WatchRemoteJob.self)
      snapshot.jobs[index].status = "awaiting_user"; try persist(); throw WatchFailure.permissions
    }
    let started = try await request(["action": "start", "requestId": id, "interval": try object(interval)], as: Started.self)
    guard started.job.status == "running", started.job.revision == configuration.revision else { throw WatchFailure.invalidProfile }
    do {
      try started.profile.validate()
      var job = snapshot.jobs[index]
      if job.filename == nil {
        let captured = try await health.capture(interval)
        let data = try WatchRecord.file(profile: started.profile, deviceId: configuration.deviceId, requestId: id,
          interval: interval, samples: captured.samples, failures: captured.failures, earliest: captured.earliest, exportedAt: WatchTimestamp.string(Date()))
        guard data.count <= 2 * 1024 * 1024 else { throw WatchFailure.oversized }
        let filename = "\(id).json"
        try data.write(to: WatchStore.directory("outbox").appendingPathComponent(filename), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        job.filename = filename; job.recordCount = captured.samples.count; job.bytes = data.count; job.partial = !captured.failures.isEmpty
      }
      guard let endpoint = started.profile.exportSettings.httpUrl, let url = URL(string: endpoint), let secrets = try WatchKeychain.read(),
            secrets.revision == configuration.revision, secrets.endpoint == endpoint, let filename = job.filename else { throw WatchFailure.invalidProfile }
      var request = URLRequest(url: url); request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.setValue(started.profile.id, forHTTPHeaderField: "X-Export-Profile")
      request.setValue(interval.day, forHTTPHeaderField: "X-Export-Day")
      request.setValue(configuration.deviceId, forHTTPHeaderField: "X-Export-Device")
      request.setValue(id, forHTTPHeaderField: "Idempotency-Key")
      if !secrets.destinationBearer.isEmpty { request.setValue("Bearer \(secrets.destinationBearer)", forHTTPHeaderField: "Authorization") }
      guard WKApplication.shared().applicationState == .active else { snapshot.jobs[index] = job; try persist(); return }
      let task = transfers.uploadTask(with: request, fromFile: try WatchStore.directory("outbox").appendingPathComponent(filename))
      task.taskDescription = id
      job.status = "uploading"; job.error = nil; job.taskIdentifier = task.taskIdentifier
      snapshot.jobs[index] = job; try persist(); task.resume()
    } catch {
      snapshot.jobs[index].status = "failed"; snapshot.jobs[index].error = "Step capture or file preparation failed. Review Health access and retry."
      snapshot.jobs[index].receipt = .init(requestId: id, status: "failed", recordCount: snapshot.jobs[index].recordCount,
        bytes: snapshot.jobs[index].bytes, httpStatus: nil, partial: true, error: snapshot.jobs[index].error)
      try persist(); throw error
    }
  }
  func transferFinished(id: String, httpStatus: Int?, networkError: Bool) async {
    guard let index = snapshot.jobs.firstIndex(where: { $0.id == id }), snapshot.jobs[index].status == "uploading" else { return }
    snapshot.jobs[index].taskIdentifier = nil
    if networkError && httpStatus == nil {
      snapshot.jobs[index].status = "queued"; snapshot.jobs[index].error = "Connection interrupted. The same export will retry."
      snapshot.jobs[index].attempts += 1
      snapshot.jobs[index].retryAt = Date().timeIntervalSince1970 + min(300, 5 * pow(2, Double(min(6, snapshot.jobs[index].attempts))))
    } else {
      let delivered = httpStatus.map { (200..<300).contains($0) } ?? false
      snapshot.jobs[index].status = delivered ? "delivered" : "failed"
      snapshot.jobs[index].error = delivered ? nil : "Destination rejected the export (HTTP \(httpStatus ?? 0))."
      if delivered { snapshot.lastDeliveredAt = WatchTimestamp.string(Date()) }
      snapshot.jobs[index].receipt = .init(requestId: id, status: delivered ? "completed" : "failed",
        recordCount: snapshot.jobs[index].recordCount, bytes: snapshot.jobs[index].bytes, httpStatus: httpStatus,
        partial: snapshot.jobs[index].partial, error: snapshot.jobs[index].error)
    }
    do { try persist() } catch { message = WatchFailure.storage.localizedDescription }
    if WKApplication.shared().applicationState == .active { await refresh() }
  }
  private func removeFile(_ index: Int) {
    if let filename = snapshot.jobs[index].filename, let directory = try? WatchStore.directory("outbox") {
      try? FileManager.default.removeItem(at: directory.appendingPathComponent(filename))
    }
  }
}

private final class WatchTransferDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let id = task.taskDescription else { return }
    let status = (task.response as? HTTPURLResponse)?.statusCode
    Task { @MainActor in await WatchRuntime.shared.transferFinished(id: id, httpStatus: status, networkError: error != nil) }
  }
}
