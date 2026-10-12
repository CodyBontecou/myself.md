import SwiftUI
import WatchKit

@main struct MyselfWatchApp: App {
  @WKApplicationDelegateAdaptor(WatchApplicationDelegate.self) var delegate
  @Environment(\.scenePhase) private var phase
  @State private var runtime = WatchRuntime.shared
  var body: some Scene {
    WindowGroup {
      WatchHome(runtime: runtime)
        .task(id: phase) {
          runtime.activate()
          guard phase == .active else { return }
          await runtime.refresh()
          while !Task.isCancelled {
            do { try await Task.sleep(for: .seconds(30)) } catch { return }
            await runtime.refresh()
          }
        }
        .onOpenURL { url in if url.host == "export" { Task { await runtime.exportNow() } } }
    }
  }
}

final class WatchApplicationDelegate: NSObject, WKApplicationDelegate {
  func applicationDidFinishLaunching() { Task { @MainActor in WatchRuntime.shared.activate() } }
  func applicationDidEnterBackground() { Task { @MainActor in await WatchRuntime.shared.pauseTransfers() } }
  func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
    backgroundTasks.forEach { $0.setTaskCompletedWithSnapshot(false) }
  }
}

struct WatchHome: View {
  let runtime: WatchRuntime
  @State private var confirmReset = false
  private var summary: WatchSummary { runtime.snapshot.summary }
  private var isToday: Bool { summary.day == WatchInterval.today().day }
  var body: some View {
    NavigationStack {
      List {
        Section {
          VStack(alignment: .leading, spacing: 4) {
            Label("Steps today", systemImage: "figure.walk").font(.headline)
            Text(isToday ? summary.steps.map { $0.formatted(.number.precision(.fractionLength(0))) } ?? "—" : "—")
              .font(.largeTitle.weight(.semibold)).monospacedDigit().privacySensitive()
              .accessibilityLabel(isToday ? "Today’s steps, \(summary.steps.map { $0.formatted(.number.precision(.fractionLength(0))) } ?? "unavailable")" : "Today’s steps unavailable")
            if let updated = summary.observedAt.flatMap(WatchTimestamp.date), isToday {
              Text("Updated \(updated, style: .relative) ago").font(.footnote).foregroundStyle(.secondary)
            } else { Text("Refresh to read available steps.").font(.footnote).foregroundStyle(.secondary) }
          }
          .accessibilityElement(children: .combine)
          Button("Refresh", systemImage: "arrow.clockwise") { Task { await runtime.refresh() } }
            .disabled(runtime.busy || runtime.snapshot.configuration == nil).accessibilityIdentifier("watch-refresh")
        }
        if let configuration = runtime.snapshot.configuration {
          Section("Export") {
            Text(configuration.profile.name).font(.headline)
            Text(URL(string: configuration.profile.exportSettings.httpUrl ?? "")?.host ?? "HTTPS destination")
              .font(.footnote).foregroundStyle(.secondary).lineLimit(2)
            Button("Export now", systemImage: "arrow.up.doc") { Task { await runtime.exportNow() } }
              .disabled(runtime.busy).accessibilityIdentifier("watch-export")
            Text("Exports today’s watch samples as JSON. Keep this app open until delivered; interrupted exports retry on reopening.").font(.footnote).foregroundStyle(.secondary)
            if let stamp = runtime.snapshot.lastDeliveredAt.flatMap(WatchTimestamp.date) {
              Text("Last delivered \(stamp, style: .relative) ago").font(.footnote).foregroundStyle(.secondary)
            }
          }
          if let latest = runtime.snapshot.jobs.last {
            Section("Latest export") {
              Label(status(latest.status), systemImage: latest.status == "delivered" ? "checkmark.circle" : latest.status == "failed" ? "exclamationmark.circle" : "clock")
              if latest.partial { Text("Some source details were unavailable.").font(.footnote).foregroundStyle(.secondary) }
              if let error = latest.error { Text(error).font(.footnote).foregroundStyle(.secondary) }
              if latest.status == "failed" {
                Button("Export again") { Task { await runtime.exportNow() } }.disabled(runtime.busy)
              }
              if latest.status == "delivered" && !latest.reported { Text("Delivered. Account history will sync when connected.").font(.footnote).foregroundStyle(.secondary) }
            }
          }
        } else {
          Section("Set up Apple Watch") {
            Text("Keep this app open. On your iPhone, open myself.md → Settings → Apple Watch.").font(.body)
          }
        }
        if let message = runtime.message { Section { Text(message).font(.footnote).accessibilityIdentifier("watch-status") } }
        Section("Health access") {
          Button("Review Steps access") { Task { await runtime.authorizeHealth() } }
            .disabled(runtime.busy).accessibilityIdentifier("watch-health-access")
          Text("An empty result can mean no data or limited Health access.").font(.footnote).foregroundStyle(.secondary)
        }
        if runtime.snapshot.configuration != nil {
          Section { Button("Remove setup", role: .destructive) { confirmReset = true }.disabled(runtime.busy) }
        }
      }
      .navigationTitle("myself.md")
      .confirmationDialog("Remove watch setup?", isPresented: $confirmReset) {
        Button("Remove", role: .destructive) { Task { await runtime.reset() } }
        Button("Cancel", role: .cancel) {}
      } message: { Text("Revokes watch access and cancels pending exports. Data already sent stays at its destination.") }
    }
  }
  private func status(_ value: String) -> String {
    switch value { case "uploading": return "Uploading"; case "delivered": return "Delivered"; case "failed": return "Failed"
    case "cancelled": return "Cancelled"; case "awaiting_user": return "Review Health access"; default: return "Queued" }
  }
}

#Preview {
  WatchHome(runtime: WatchRuntime(preview: WatchSnapshot(summary: WatchSummary(steps: 4250, observedAt: WatchTimestamp.string(Date()), day: WatchInterval.today().day))))
}
