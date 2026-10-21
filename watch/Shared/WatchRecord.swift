import Foundation

enum WatchRecord {
  // Matches core/data.js and core/time-series.js for native quantity samples.
  static func envelope(_ native: [String: Any]) -> [String: Any] {
    let start = native["startDate"] as? String
    let end = native["endDate"] as? String ?? start
    var series: [String: Any] = [:]
    if let points = native["quantitySeries"] as? [[String: Any]] {
      series["quantitySeries"] = points.map { point -> [String: Any] in
        var value = point
        value["timestamp"] = point["timestamp"] ?? start ?? NSNull()
        value["value"] = point["quantity"] ?? point["value"] ?? point
        return value
      }
    } else if let quantity = native["quantity"] {
      var point = native
      point["timestamp"] = start ?? NSNull(); point["value"] = quantity
      series["samples"] = [point]
    }
    return ["domain": "health", "type": "HKQuantityTypeIdentifierStepCount", "source": "healthkit",
            "start": start ?? NSNull(), "end": end ?? NSNull(), "native": native, "timeSeries": series]
  }
  static func file(profile: WatchProfile, deviceId: String, requestId: String, interval: WatchInterval,
                   samples: [[String: Any]], failures: [[String: Any]], earliest: String, exportedAt: String) throws -> Data {
    try profile.validate()
    let warnings = ["Only samples available on this watch are included. Phone health history is not implied.",
                    "Empty HealthKit reads can mean no samples or denied access; read authorization is not observable."]
    let value: [String: Any] = ["schema": profile.exportSettings.schema, "records": samples.map(envelope),
      "billingOperationId": requestId, "profileId": profile.id, "profileName": profile.name, "deviceId": deviceId,
      "interval": ["start": interval.start, "end": interval.end, "day": interval.day, "timezone": interval.timezone],
      "recordCount": samples.count, "status": failures.isEmpty ? "complete" : "partial", "failures": failures,
      "exportedAt": exportedAt, "coverage": ["scope": "watch-local", "earliestAvailable": earliest, "readAuthorization": "unknown"],
      "captures": [["domain": "health", "type": "HKQuantityTypeIdentifierStepCount", "source": "native",
                    "capture": "native-readable-samples", "warnings": warnings]]]
    return try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
  }
}
