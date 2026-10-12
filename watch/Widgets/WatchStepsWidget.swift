import AppIntents
import SwiftUI
import WidgetKit

struct StepsEntry: TimelineEntry {
  let date: Date
  let snapshot: WatchSnapshot
  let requests: Int
}
struct StepsProvider: TimelineProvider {
  func placeholder(in context: Context) -> StepsEntry { .init(date: Date(), snapshot: WatchSnapshot(), requests: 0) }
  func getSnapshot(in context: Context, completion: @escaping (StepsEntry) -> Void) { completion(read()) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<StepsEntry>) -> Void) {
    let now = Date(), midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(86400))
    let current = read()
    let nextDay = StepsEntry(date: midnight, snapshot: current.snapshot, requests: current.requests)
    completion(Timeline(entries: [current, nextDay], policy: .after(min(now.addingTimeInterval(900), midnight))))
  }
  private func read() -> StepsEntry {
    .init(date: Date(), snapshot: (try? WatchStore.load()) ?? WatchSnapshot(), requests: (try? WatchStore.requests().count) ?? 0)
  }
}
struct StepsWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: StepsEntry
  private var steps: Double? { entry.snapshot.summary.day == WatchInterval.today(at: entry.date).day ? entry.snapshot.summary.steps : nil }
  var body: some View {
    Group {
      if family == .accessoryCircular {
        VStack(spacing: 2) {
          Image(systemName: "figure.walk")
          Text(steps.map { $0.formatted(.number.notation(.compactName).precision(.fractionLength(0))) } ?? "—").monospacedDigit().minimumScaleFactor(0.6)
        }
      } else {
        HStack {
          VStack(alignment: .leading, spacing: 2) {
            Label("Steps today", systemImage: "figure.walk").font(.headline)
            Text(steps.map { $0.formatted(.number.precision(.fractionLength(0))) } ?? "—").monospacedDigit()
            if ["queued", "uploading", "failed", "awaiting_user"].contains(entry.snapshot.jobs.last?.status ?? "") || entry.requests > 0 {
              Text(status).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            } else if steps != nil, let observed = entry.snapshot.summary.observedAt.flatMap(WatchTimestamp.date) {
              Text("Updated \(observed, style: .relative) ago").font(.caption).foregroundStyle(.secondary).lineLimit(1)
            } else { Text(status).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
          }
          Spacer(minLength: 4)
          if entry.snapshot.configuration != nil {
            Button(intent: ExportWatchStepsIntent()) { Image(systemName: "arrow.up.doc") }
              .accessibilityLabel("Export watch steps")
          }
        }
      }
    }
    .privacySensitive()
    .containerBackground(for: .widget) { Color.clear }
    .widgetURL(URL(string: "myselfmd-watch://steps"))
  }
  private var status: String {
    if entry.requests > 0 { return "Queued" }
    guard entry.snapshot.configuration != nil else { return "Set up on iPhone" }
    switch entry.snapshot.jobs.last?.status {
    case "uploading": return "Uploading"
    case "delivered": return entry.snapshot.jobs.last?.partial == true ? "Delivered · partial" : "Delivered"
    case "failed": return "Export failed"
    case "queued": return "Queued"
    case "awaiting_user": return "Review Health access"
    default: return "Open to refresh"
    }
  }
}
@main struct WatchStepsWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "myself.md.watch.steps", provider: StepsProvider()) { StepsWidgetView(entry: $0) }
      .configurationDisplayName("Watch steps")
      .description("View today’s available steps and export directly from your watch.")
      .supportedFamilies([.accessoryRectangular, .accessoryCircular])
  }
}
