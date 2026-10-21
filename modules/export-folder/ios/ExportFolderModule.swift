import ExpoModulesCore
import Foundation

/// Bookmarks remain on this device. Keep the resolved scope alive for Expo file I/O.
public final class ExportFolderModule: Module {
  private var scopes: [String: URL] = [:]

  public func definition() -> ModuleDefinition {
    Name("ExportFolder")
    AsyncFunction("bookmark") { (uri: URL) throws -> String in
      guard uri.isFileURL else { throw FolderError.invalid }
      return try uri.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil).base64EncodedString()
    }.runOnQueue(.main)
    AsyncFunction("restore") { (bookmark: String) throws -> [String: String] in
      guard let data = Data(base64Encoded: bookmark) else { throw FolderError.invalid }
      var stale = false
      let url = try URL(resolvingBookmarkData: data, options: .withoutUI, relativeTo: nil, bookmarkDataIsStale: &stale)
      if self.scopes[url.absoluteString] == nil {
        if url.startAccessingSecurityScopedResource() {
          self.scopes[url.absoluteString] = url
        } else if !url.standardizedFileURL.path.hasPrefix(NSHomeDirectory() + "/") {
          throw FolderError.denied
        }
      }
      let renewed = stale ? try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil).base64EncodedString() : bookmark
      return ["uri": url.absoluteString, "bookmark": renewed]
    }.runOnQueue(.main)
    OnDestroy {
      for url in self.scopes.values { url.stopAccessingSecurityScopedResource() }
      self.scopes.removeAll()
    }
  }
}
private enum FolderError: String, Error {
  case invalid = "Invalid export folder. Choose the folder again."
  case denied = "Export folder access expired. Choose the folder again."
}
