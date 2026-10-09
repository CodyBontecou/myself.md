#if DEBUG && canImport(UIKit)
import Foundation

struct QueuedReport: Codable {
    let endpoint: URL
    let apiKey: String
    let repository: String?
    let metadataJSON: Data
    let comment: String
    let pngData: Data
    let createdAt: Date

    init(
        endpoint: URL,
        apiKey: String,
        repository: String?,
        metadataJSON: Data,
        comment: String,
        pngData: Data,
        createdAt: Date = Date()
    ) {
        self.endpoint = endpoint
        self.apiKey = apiKey
        self.repository = repository
        self.metadataJSON = metadataJSON
        self.comment = comment
        self.pngData = pngData
        self.createdAt = createdAt
    }
}

final class RetryQueue {
    static let shared = RetryQueue()

    private let directory: URL
    private let maxItems = 25
    private let maxAge: TimeInterval = 7 * 24 * 60 * 60
    private let lock = NSLock()

    private init() {
        let base = (try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )) ?? URL(fileURLWithPath: NSTemporaryDirectory())
        self.directory = base.appendingPathComponent("Gripe/queue", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func enqueue(_ report: QueuedReport) {
        lock.lock(); defer { lock.unlock() }
        do {
            let url = directory.appendingPathComponent("\(UUID().uuidString).json")
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(report)
            try data.write(to: url, options: .atomic)
            evictIfNeededLocked()
        } catch {
            // Best-effort persistence; if we can't write, the report is simply lost.
        }
    }

    func flushInBackground() {
        Task.detached(priority: .background) { [weak self] in
            await self?.flush()
        }
    }

    private func flush() async {
        let snapshot: [(url: URL, report: QueuedReport)] = {
            lock.lock(); defer { lock.unlock() }
            return listEntriesLocked()
        }()
        for entry in snapshot {
            if expired(entry) {
                try? FileManager.default.removeItem(at: entry.url)
                continue
            }
            let result = await GripeAPIClient.shared.send(entry.report)
            switch result {
            case .success:
                try? FileManager.default.removeItem(at: entry.url)
            case .failure(let error):
                if let gripe = error as? GripeError {
                    if !gripe.isTransient {
                        try? FileManager.default.removeItem(at: entry.url)
                    }
                    if case .rateLimited = gripe {
                        return
                    }
                }
            }
        }
    }

    /// Caller must hold `lock`.
    private func listEntriesLocked() -> [(url: URL, report: QueuedReport)] {
        guard let urls = try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let entries: [(url: URL, report: QueuedReport)] = urls.compactMap { url in
            guard url.pathExtension == "json",
                  let data = try? Data(contentsOf: url),
                  let report = try? decoder.decode(QueuedReport.self, from: data) else {
                try? FileManager.default.removeItem(at: url)
                return nil
            }
            return (url: url, report: report)
        }
        return entries.sorted { $0.report.createdAt < $1.report.createdAt }
    }

    private func expired(_ entry: (url: URL, report: QueuedReport)) -> Bool {
        Date().timeIntervalSince(entry.report.createdAt) > maxAge
    }

    /// Caller must hold `lock`.
    private func evictIfNeededLocked() {
        let entries = listEntriesLocked()
        guard entries.count > maxItems else { return }
        let extra = entries.count - maxItems
        for i in 0..<extra {
            try? FileManager.default.removeItem(at: entries[i].url)
        }
    }

    // MARK: - Test hooks

    #if DEBUG
    /// Returns a snapshot of queued entries. Test-only.
    /// The labeled tuple type is the regression guard for the 0.2.1 flush() bug.
    func snapshotForTesting() -> [(url: URL, report: QueuedReport)] {
        lock.lock(); defer { lock.unlock() }
        return listEntriesLocked()
    }

    /// Removes every persisted entry. Test-only.
    func purgeForTesting() {
        lock.lock(); defer { lock.unlock() }
        for entry in listEntriesLocked() {
            try? FileManager.default.removeItem(at: entry.url)
        }
    }
    #endif
}
#endif
