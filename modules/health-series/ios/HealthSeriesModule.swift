import ExpoModulesCore
import HealthKit

private enum SeriesReadError: Error {
  case invalidQuery, missingSample, incompleteSeries
}

public final class HealthSeriesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HealthSeries")
    AsyncFunction("quantitySeries") { (identifier: String, id: String, unitString: String) async throws -> String in
      guard let uuid = UUID(uuidString: id),
            let type = HKQuantityType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: identifier)),
            !unitString.isEmpty else { throw SeriesReadError.invalidQuery }
      let store = HKHealthStore()
      let predicate = HKQuery.predicateForObject(with: uuid)
      let descriptor = HKSampleQueryDescriptor(
        predicates: [.quantitySample(type: type, predicate: predicate)],
        sortDescriptors: [], limit: 1
      )
      guard let sample = try await descriptor.result(for: store).first else {
        throw SeriesReadError.missingSample
      }
      let unit = HKUnit(from: unitString)
      let count = sample.count
      let formatter = ISO8601DateFormatter()
      formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      var details: [String: Any] = [
        "sampleCount": count,
        "startTimestampMs": sample.startDate.timeIntervalSince1970 * 1000,
        "endTimestampMs": sample.endDate.timeIntervalSince1970 * 1000,
        "aggregationStyle": sample.quantityType.aggregationStyle.rawValue
      ]
      // These are original HealthKit parent properties, not computed daily summaries.
      if let discrete = sample as? HKDiscreteQuantitySample {
        details["discreteQuantity"] = [
          "minimum": discrete.minimumQuantity.doubleValue(for: unit),
          "average": discrete.averageQuantity.doubleValue(for: unit),
          "maximum": discrete.maximumQuantity.doubleValue(for: unit),
          "mostRecent": discrete.mostRecentQuantity.doubleValue(for: unit),
          "mostRecentStartTimestampMs": discrete.mostRecentQuantityDateInterval.start.timeIntervalSince1970 * 1000,
          "mostRecentEndTimestampMs": discrete.mostRecentQuantityDateInterval.end.timeIntervalSince1970 * 1000,
          "unit": unitString
        ]
      }
      if let cumulative = sample as? HKCumulativeQuantitySample {
        details["cumulativeQuantity"] = ["sum": cumulative.sumQuantity.doubleValue(for: unit), "unit": unitString]
      }
      if count <= 1 {
        let bytes = try JSONSerialization.data(withJSONObject: details)
        return String(decoding: bytes, as: UTF8.self)
      }
      let series = HKQuantitySeriesSampleQueryDescriptor(
        predicate: .quantitySample(type: type, predicate: predicate),
        options: [.includeSample]
      )
      var points: [[String: Any]] = []
      for try await result in series.results(for: store) {
        points.append([
          "timestamp": formatter.string(from: result.dateInterval.start),
          "endDate": formatter.string(from: result.dateInterval.end),
          "timestampMs": result.dateInterval.start.timeIntervalSince1970 * 1000,
          "endTimestampMs": result.dateInterval.end.timeIntervalSince1970 * 1000,
          "value": result.quantity.doubleValue(for: unit), "unit": unitString,
          "sampleId": (result.sample ?? sample).uuid.uuidString
        ])
      }
      guard points.count == count else { throw SeriesReadError.incompleteSeries }
      details["quantitySeries"] = points
      let bytes = try JSONSerialization.data(withJSONObject: details)
      return String(decoding: bytes, as: UTF8.self)
    }
  }
}
