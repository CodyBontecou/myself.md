import Foundation
import Security

enum WatchKeychain {
  private static let service = "com.myself.md.watch.destination"
  static func read() throws -> WatchSecrets? {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                               kSecAttrAccount as String: "current", kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else { throw WatchFailure.storage }
    return try JSONDecoder().decode(WatchSecrets.self, from: data)
  }
  static func save(_ secrets: WatchSecrets) throws {
    let key: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "current"]
    let values: [String: Any] = [kSecValueData as String: try JSONEncoder().encode(secrets), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
    let status = SecItemUpdate(key as CFDictionary, values as CFDictionary)
    if status == errSecItemNotFound {
      guard SecItemAdd(key.merging(values) { _, new in new } as CFDictionary, nil) == errSecSuccess else { throw WatchFailure.storage }
    } else if status != errSecSuccess { throw WatchFailure.storage }
  }
  static func clear() {
    SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
  }
}
