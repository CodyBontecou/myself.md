import Foundation
import HealthKit
import CoreFoundation

final class WatchHealth {
  let store = HKHealthStore()
  let steps = HKQuantityType.quantityType(forIdentifier: .stepCount)!
  func authorize() async throws {
    guard HKHealthStore.isHealthDataAvailable() else { throw WatchFailure.permissions }
    try await store.requestAuthorization(toShare: [], read: [steps])
  }
  func needsAuthorization() async throws -> Bool {
    guard HKHealthStore.isHealthDataAvailable() else { return true }
    return try await withCheckedThrowingContinuation { continuation in
      store.getRequestStatusForAuthorization(toShare: [], read: [steps]) { status, error in
        if let error { continuation.resume(throwing: error) }
        else { continuation.resume(returning: status != .unnecessary) }
      }
    }
  }
  func summary() async throws -> WatchSummary {
    if try await needsAuthorization() { throw WatchFailure.permissions }
    let interval = WatchInterval.today()
    let predicate = HKQuery.predicateForSamples(withStart: Calendar.current.startOfDay(for: Date()), end: Date(), options: .strictStartDate)
    let quantity: Double? = try await withCheckedThrowingContinuation { continuation in
      store.execute(HKStatisticsQuery(quantityType: steps, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, error in
        if let error { continuation.resume(throwing: error) }
        else { continuation.resume(returning: statistics?.sumQuantity()?.doubleValue(for: .count())) }
      })
    }
    return .init(steps: quantity, observedAt: WatchTimestamp.string(Date()), day: interval.day,
                 timezone: interval.timezone, earliestAvailable: WatchTimestamp.string(store.earliestPermittedSampleDate()), permissionRequested: true)
  }
  struct Capture { var samples: [[String: Any]]; var failures: [[String: Any]]; var earliest: String }
  func capture(_ interval: WatchInterval) async throws -> Capture {
    if try await needsAuthorization() { throw WatchFailure.permissions }
    guard let start = WatchTimestamp.date(interval.start), let end = WatchTimestamp.date(interval.end) else { throw WatchFailure.invalidProfile }
    let earliest = store.earliestPermittedSampleDate()
    let predicate = HKQuery.predicateForSamples(withStart: max(start, earliest), end: end, options: .strictStartDate)
    let descriptor = HKSampleQueryDescriptor(predicates: [.quantitySample(type: steps, predicate: predicate)],
                                             sortDescriptors: [SortDescriptor(\HKQuantitySample.startDate)], limit: 5001)
    let samples = try await descriptor.result(for: store)
    guard samples.count <= 5000 else { throw WatchFailure.oversized }
    var failures: [[String: Any]] = []
    if start < earliest { failures.append(failure("history", "The requested day starts before this watch’s available health history.")) }
    var records: [[String: Any]] = []
    var pointCount = 0
    for sample in samples {
      var fields = sampleFields(sample)
      fields["quantityType"] = steps.identifier; fields["quantity"] = sample.quantity.doubleValue(for: .count()); fields["unit"] = "count"
      fields["sampleCount"] = sample.count; fields["aggregationStyle"] = steps.aggregationStyle.rawValue
      fields["startTimestampMs"] = sample.startDate.timeIntervalSince1970 * 1000
      fields["endTimestampMs"] = sample.endDate.timeIntervalSince1970 * 1000
      if let cumulative = sample as? HKCumulativeQuantitySample { fields["cumulativeQuantity"] = ["sum": cumulative.sumQuantity.doubleValue(for: .count()), "unit": "count"] }
      if sample.count > 1 {
        let query = HKQuantitySeriesSampleQueryDescriptor(predicate: .quantitySample(type: steps, predicate: HKQuery.predicateForObject(with: sample.uuid)), options: [.includeSample])
        var points: [[String: Any]] = []
        var nestedFailures: [[String: Any]] = []
        do {
          for try await result in query.results(for: store) {
            guard pointCount < 10000 else { throw WatchFailure.oversized }; pointCount += 1
            points.append(["timestamp": precise(result.dateInterval.start), "endDate": precise(result.dateInterval.end),
              "timestampMs": result.dateInterval.start.timeIntervalSince1970 * 1000, "endTimestampMs": result.dateInterval.end.timeIntervalSince1970 * 1000,
              "timestampReferenceSeconds": result.dateInterval.start.timeIntervalSinceReferenceDate, "endDateReferenceSeconds": result.dateInterval.end.timeIntervalSinceReferenceDate,
              "value": result.quantity.doubleValue(for: .count()), "unit": "count", "sampleId": (result.sample ?? sample).uuid.uuidString])
          }
        } catch { nestedFailures.append(failure("quantitySeries", "Step series could not be fully captured.")) }
        if points.count != sample.count { nestedFailures.append(failure("quantitySeriesCount", "Step series count differs from its parent sample.")) }
        fields["quantitySeries"] = points
        if !nestedFailures.isEmpty { fields["captureFailures"] = nestedFailures; failures.append(contentsOf: nestedFailures) }
      }
      if containsUnsupported(fields["typedMetadata"] ?? [:]) {
        let item = failure("typedMetadata", "Inspect unsupported native metadata types.")
        fields["captureFailures"] = (fields["captureFailures"] as? [[String: Any]] ?? []) + [item]; failures.append(item)
      }
      records.append(fields)
    }
    return Capture(samples: records, failures: failures, earliest: WatchTimestamp.string(earliest))
  }
  private func failure(_ operation: String, _ message: String) -> [String: Any] {
    ["domain": "health", "type": steps.identifier, "source": "native", "operation": operation, "status": "failed", "message": message]
  }
  private func sampleFields(_ sample: HKSample) -> [String: Any] {
    let revision = sample.sourceRevision, os = sample.sourceRevision.operatingSystemVersion
    var source: [String: Any] = ["source": ["name": revision.source.name, "bundleIdentifier": revision.source.bundleIdentifier],
      "operatingSystemVersion": "\(os.majorVersion).\(os.minorVersion).\(os.patchVersion)"]
    source["version"] = revision.version; source["productType"] = revision.productType
    var fields: [String: Any] = ["uuid": sample.uuid.uuidString, "objectTypeIdentifier": sample.sampleType.identifier,
      "sourceRevision": source, "hasUndeterminedDuration": sample.hasUndeterminedDuration,
      "startDate": precise(sample.startDate), "endDate": precise(sample.endDate),
      "startDateReferenceSeconds": sample.startDate.timeIntervalSinceReferenceDate, "endDateReferenceSeconds": sample.endDate.timeIntervalSinceReferenceDate,
      "typedMetadata": (sample.metadata ?? [:]).mapValues(typed)]
    if let device = sample.device {
      var value: [String: Any] = [:]
      value["name"] = device.name; value["manufacturer"] = device.manufacturer; value["model"] = device.model
      value["hardwareVersion"] = device.hardwareVersion; value["firmwareVersion"] = device.firmwareVersion; value["softwareVersion"] = device.softwareVersion
      value["localIdentifier"] = device.localIdentifier; value["udiDeviceIdentifier"] = device.udiDeviceIdentifier
      fields["device"] = value
    }
    return fields
  }
  private func precise(_ date: Date) -> String {
    let seconds = date.timeIntervalSince1970
    var whole = floor(seconds), nanos = Int(((seconds - floor(seconds)) * 1_000_000_000).rounded())
    if nanos == 1_000_000_000 { whole += 1; nanos = 0 }
    let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime]
    return String(format: "%@.%09dZ", String(formatter.string(from: Date(timeIntervalSince1970: whole)).dropLast()), nanos)
  }
  private func typed(_ value: Any) -> [String: Any] {
    if let number = value as? NSNumber {
      if CFGetTypeID(number) == CFBooleanGetTypeID() { return ["type": "boolean", "value": number.boolValue] }
      switch String(cString: number.objCType) {
      case "c", "s", "i", "l", "q": return ["type": "signed_integer", "value": number.stringValue]
      case "C", "S", "I", "L", "Q": return ["type": "unsigned_integer", "value": number.stringValue]
      default: return number.doubleValue.isFinite ? ["type": "floating_point", "value": number.doubleValue] : ["type": "floating_point", "value": number.stringValue, "encoding": "nonfinite"]
      }
    }
    if let date = value as? Date { return ["type": "date", "value": precise(date), "referenceSeconds": date.timeIntervalSinceReferenceDate] }
    if let data = value as? Data { return ["type": "data", "encoding": "base64", "value": data.base64EncodedString()] }
    if let url = value as? URL { return ["type": "url", "value": url.absoluteString] }
    if let string = value as? String { return ["type": "string", "value": string] }
    if let array = value as? [Any] { return ["type": "array", "value": array.map(typed)] }
    if let dictionary = value as? [String: Any] { return ["type": "dictionary", "value": dictionary.mapValues(typed)] }
    if value is NSNull { return ["type": "null"] }
    return ["type": "unsupported", "nativeType": String(reflecting: type(of: value)), "description": String(describing: value)]
  }
  private func containsUnsupported(_ value: Any) -> Bool {
    if let fields = value as? [String: Any] { return fields["type"] as? String == "unsupported" || fields.values.contains(where: containsUnsupported) }
    return (value as? [Any])?.contains(where: containsUnsupported) ?? false
  }
}
