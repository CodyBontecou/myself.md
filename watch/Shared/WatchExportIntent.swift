import AppIntents
import WidgetKit

struct ExportWatchStepsIntent: AppIntent {
  static var title: LocalizedStringResource = "Export watch steps"
  static var description = IntentDescription("Export today’s available step samples to your saved HTTPS destination.")
  static var openAppWhenRun = true
  func perform() async throws -> some IntentResult {
    guard try WatchStore.load().configuration != nil else { throw WatchFailure.missingSetup }
    try WatchStore.enqueue()
    WidgetCenter.shared.reloadAllTimelines()
    return .result()
  }
}

struct WatchExportShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: ExportWatchStepsIntent(), phrases: ["Export watch steps with \(.applicationName)"],
                shortTitle: "Export watch steps", systemImageName: "arrow.up.doc")
  }
}
