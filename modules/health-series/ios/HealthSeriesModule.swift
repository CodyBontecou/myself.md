import ExpoModulesCore
import HealthKit
import CoreLocation
import CoreFoundation
import WorkoutKit

private enum SeriesReadError: Error {
  case invalidQuery, missingSample, incompleteSeries
}

public final class HealthSeriesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HealthSeries")
    AsyncFunction("sampleDetails") { (identifier: String, id: String) async throws -> String in
      return await capturedJSON("sampleDetails", identifier: identifier) {
        let store = HKHealthStore()
        let sample = try await readSample(store, identifier: identifier, id: id)
        var fields = sampleFields(sample)
        if let workout = sample as? HKWorkout {
          let details = try await workoutFields(workout, store: store)
          let failures = (fields["captureFailures"] as? [[String: Any]] ?? []) + (details["captureFailures"] as? [[String: Any]] ?? [])
          fields.merge(details) { _, new in new }
          if !failures.isEmpty { fields["captureFailures"] = failures }
        }
        return fields
      }
    }
    AsyncFunction("characteristic") { (identifier: String) async throws -> String in
      return await capturedJSON("characteristic", identifier: identifier) {
        let store = HKHealthStore()
        let value: Any
        switch identifier {
        case HKCharacteristicTypeIdentifier.activityMoveMode.rawValue:
          value = try store.activityMoveMode().activityMoveMode.rawValue
        case HKCharacteristicTypeIdentifier.biologicalSex.rawValue:
          value = try store.biologicalSex().biologicalSex.rawValue
        case HKCharacteristicTypeIdentifier.bloodType.rawValue:
          value = try store.bloodType().bloodType.rawValue
        case HKCharacteristicTypeIdentifier.fitzpatrickSkinType.rawValue:
          value = try store.fitzpatrickSkinType().skinType.rawValue
        case HKCharacteristicTypeIdentifier.wheelchairUse.rawValue:
          value = try store.wheelchairUse().wheelchairUse.rawValue
        case HKCharacteristicTypeIdentifier.dateOfBirth.rawValue:
          let date = try store.dateOfBirthComponents()
          var components: [String: Any] = [:]
          components["year"] = date.year
          components["month"] = date.month
          components["day"] = date.day
          components["era"] = date.era
          components["calendar"] = date.calendar.map { String(describing: $0.identifier) }
          components["timeZone"] = date.timeZone?.identifier
          value = components
        default: throw SeriesReadError.invalidQuery
        }
        let capturedAt = Date()
        return ["characteristicType": identifier, "characteristicValue": value,
                "captureKind": "current-snapshot", "capturedAt": preciseDate(capturedAt), "capturedAtReferenceSeconds": capturedAt.timeIntervalSinceReferenceDate]
      }
    }
    AsyncFunction("workoutRoutes") { (id: String) async throws -> String in
      do {
      let store = HKHealthStore()
      let sample = try await readSample(store, identifier: HKWorkoutType.workoutType().identifier, id: id)
      guard let workout = sample as? HKWorkout else { throw SeriesReadError.invalidQuery }
      let routes = try await readSamples(store, type: HKSeriesType.workoutRoute(),
                                        predicate: HKQuery.predicateForObjects(from: workout))
      var records: [[String: Any]] = []
      for sample in routes {
        guard let route = sample as? HKWorkoutRoute else { continue }
        var fields = sampleFields(route)
        let (locations, failures) = await routeLocations(store, route: route)
        fields["locations"] = locations.map(locationFields)
        fields["count"] = route.count
        if !failures.isEmpty {
          fields["captureFailures"] = (fields["captureFailures"] as? [[String: Any]] ?? []) + failures
        }
        fields["HKMetadataKeySyncIdentifier"] = route.metadata?[HKMetadataKeySyncIdentifier] as? String
        fields["HKMetadataKeySyncVersion"] = route.metadata?[HKMetadataKeySyncVersion] as? NSNumber
        records.append(fields)
      }
      return try encoded(["records": records, "captureFailures": []])
      } catch {
        return try encoded(["records": [], "captureFailures": [readFailure("workoutRoutes", identifier: id, error: error)]])
      }
    }
    AsyncFunction("quantitySeries") { (identifier: String, id: String, unitString: String) async throws -> String in
      do {
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
          "mostRecentStartDate": preciseDate(discrete.mostRecentQuantityDateInterval.start),
          "mostRecentEndDate": preciseDate(discrete.mostRecentQuantityDateInterval.end),
          "mostRecentStartDateReferenceSeconds": discrete.mostRecentQuantityDateInterval.start.timeIntervalSinceReferenceDate,
          "mostRecentEndDateReferenceSeconds": discrete.mostRecentQuantityDateInterval.end.timeIntervalSinceReferenceDate,
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
      var failures: [[String: Any]] = []
      do {
      for try await result in series.results(for: store) {
        points.append([
          "timestamp": preciseDate(result.dateInterval.start),
          "endDate": preciseDate(result.dateInterval.end),
          "timestampMs": result.dateInterval.start.timeIntervalSince1970 * 1000,
          "timestampReferenceSeconds": result.dateInterval.start.timeIntervalSinceReferenceDate,
          "endDateReferenceSeconds": result.dateInterval.end.timeIntervalSinceReferenceDate,
          "endTimestampMs": result.dateInterval.end.timeIntervalSince1970 * 1000,
          "value": result.quantity.doubleValue(for: unit), "unit": unitString,
          "sampleId": (result.sample ?? sample).uuid.uuidString
        ])
      }
      } catch { failures.append(readFailure("quantitySeries", identifier: id, error: error)) }
      if points.count != count {
        failures.append(readFailure("quantitySeriesCount", identifier: id, error: SeriesReadError.incompleteSeries))
      }
      if !failures.isEmpty { details["captureFailures"] = failures }
      details["quantitySeries"] = points
      let bytes = try JSONSerialization.data(withJSONObject: details)
      return String(decoding: bytes, as: UTF8.self)
      } catch {
        return try encoded(["captureFailures": [readFailure("quantitySeries", identifier: identifier, error: error)]])
      }
    }
  }
}

// JSON is the portable boundary: integer strings and typed values avoid JS precision/type loss.
private func encoded(_ value: Any) throws -> String {
  String(decoding: try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), as: UTF8.self)
}

private func readFailure(_ operation: String, identifier: String, error: Error) -> [String: Any] {
  let native = error as NSError
  return ["operation": operation, "identifier": identifier, "status": "failed",
          "domain": native.domain, "code": native.code, "message": native.localizedDescription]
}

private func capturedJSON(_ operation: String, identifier: String,
                          read: () async throws -> [String: Any]) async -> String {
  do { return try encoded(try await read()) }
  catch {
    // Failure envelopes contain diagnostics only, never NSError.userInfo or sample values.
    return (try? encoded(["captureFailures": [readFailure(operation, identifier: identifier, error: error)]]))
      ?? "{\"captureFailures\":[{\"operation\":\"serialize\",\"status\":\"failed\"}]}"
  }
}

private func preciseDate(_ date: Date) -> String {
  let seconds = date.timeIntervalSince1970
  var whole = floor(seconds)
  var nanos = Int(((seconds - whole) * 1_000_000_000).rounded())
  if nanos == 1_000_000_000 { whole += 1; nanos = 0 }
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  let prefix = String(formatter.string(from: Date(timeIntervalSince1970: whole)).dropLast())
  return String(format: "%@.%09dZ", prefix, nanos)
}

private func typedValue(_ value: Any) -> [String: Any] {
  if let number = value as? NSNumber {
    if CFGetTypeID(number) == CFBooleanGetTypeID() { return ["type": "boolean", "value": number.boolValue] }
    switch String(cString: number.objCType) {
    case "c", "s", "i", "l", "q": return ["type": "signed_integer", "value": number.stringValue]
    case "C", "S", "I", "L", "Q": return ["type": "unsigned_integer", "value": number.stringValue]
    default:
      let scalar = number.doubleValue
      if scalar.isFinite { return ["type": "floating_point", "value": scalar] }
      return ["type": "floating_point", "value": number.stringValue, "encoding": "nonfinite"]
    }
  }
  if let date = value as? Date { return ["type": "date", "value": preciseDate(date), "referenceSeconds": date.timeIntervalSinceReferenceDate] }
  if let data = value as? Data { return ["type": "data", "encoding": "base64", "value": data.base64EncodedString()] }
  if let url = value as? URL { return ["type": "url", "value": url.absoluteString] }
  if let string = value as? String { return ["type": "string", "value": string] }
  if let array = value as? [Any] { return ["type": "array", "value": array.map(typedValue)] }
  if let dictionary = value as? [String: Any] { return ["type": "dictionary", "value": dictionary.mapValues(typedValue)] }
  if let quantity = value as? HKQuantity {
    // Secure native representation retains a quantity even when no portable unit is known.
    var result: [String: Any] = ["type": "quantity", "rawDescription": quantity.description]
    if let archive = try? NSKeyedArchiver.archivedData(withRootObject: quantity, requiringSecureCoding: true) {
      result["nativeArchiveBase64"] = archive.base64EncodedString()
    }
    for unit in [HKUnit.count(), .percent(), .meter(), .second(), .gram(), .kilocalorie(),
                 .degreeCelsius(), .liter(), .millimeterOfMercury(), .internationalUnit(),
                 HKUnit.count().unitDivided(by: .minute()), HKUnit.meter().unitDivided(by: .second())] {
      if quantity.is(compatibleWith: unit) {
        result["unit"] = unit.unitString
        result["value"] = quantity.doubleValue(for: unit)
        return result
      }
    }
    result["portableUnitUnavailable"] = true
    return result
  }
  if value is NSNull { return ["type": "null"] }
  return ["type": "unsupported", "nativeType": String(reflecting: type(of: value)),
          "description": String(describing: value)]
}

private func hasUnsupportedValue(_ value: Any) -> Bool {
  if let dictionary = value as? [String: Any] {
    if dictionary["type"] as? String == "unsupported" { return true }
    return dictionary.values.contains(where: hasUnsupportedValue)
  }
  return (value as? [Any])?.contains(where: hasUnsupportedValue) ?? false
}

private func sampleFields(_ sample: HKSample) -> [String: Any] {
  let metadata = (sample.metadata ?? [:]).mapValues(typedValue)
  let revision = sample.sourceRevision
  let os = revision.operatingSystemVersion
  var source: [String: Any] = ["source": ["name": revision.source.name, "bundleIdentifier": revision.source.bundleIdentifier],
                              "operatingSystemVersion": "\(os.majorVersion).\(os.minorVersion).\(os.patchVersion)"]
  source["version"] = revision.version
  source["productType"] = revision.productType
  var fields: [String: Any] = ["uuid": sample.uuid.uuidString, "objectTypeIdentifier": sample.sampleType.identifier,
                             "sourceRevision": source, "hasUndeterminedDuration": sample.hasUndeterminedDuration,
                             "startDate": preciseDate(sample.startDate),
                             "endDate": preciseDate(sample.endDate), "typedMetadata": metadata,
                             "startDateReferenceSeconds": sample.startDate.timeIntervalSinceReferenceDate,
                             "endDateReferenceSeconds": sample.endDate.timeIntervalSinceReferenceDate]
  if let device = sample.device {
    var data: [String: Any] = [:]
    data["name"] = device.name
    data["manufacturer"] = device.manufacturer
    data["model"] = device.model
    data["hardwareVersion"] = device.hardwareVersion
    data["firmwareVersion"] = device.firmwareVersion
    data["softwareVersion"] = device.softwareVersion
    data["localIdentifier"] = device.localIdentifier
    data["udiDeviceIdentifier"] = device.udiDeviceIdentifier
    fields["device"] = data
  }
  if hasUnsupportedValue(metadata) {
    fields["captureFailures"] = [["operation": "typedMetadata", "identifier": sample.uuid.uuidString,
                                  "status": "failed", "message": "Unsupported native metadata type; inspect typedMetadata."]]
  }
  return fields
}

private func sampleType(_ identifier: String) throws -> HKSampleType {
  if let type = HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: identifier)) { return type }
  if let type = HKObjectType.categoryType(forIdentifier: HKCategoryTypeIdentifier(rawValue: identifier)) { return type }
  if let type = HKObjectType.correlationType(forIdentifier: HKCorrelationTypeIdentifier(rawValue: identifier)) { return type }
  switch identifier {
  case HKWorkoutType.workoutType().identifier: return HKWorkoutType.workoutType()
  case HKSeriesType.workoutRoute().identifier: return HKSeriesType.workoutRoute()
  case HKObjectType.electrocardiogramType().identifier: return HKObjectType.electrocardiogramType()
  case HKSeriesType.heartbeat().identifier: return HKSeriesType.heartbeat()
  default:
    if #available(iOS 18.0, *), identifier == HKObjectType.stateOfMindType().identifier { return HKObjectType.stateOfMindType() }
    throw SeriesReadError.invalidQuery
  }
}

private func readSamples(_ store: HKHealthStore, type: HKSampleType, predicate: NSPredicate) async throws -> [HKSample] {
  try await withCheckedThrowingContinuation { continuation in
    store.execute(HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
      if let error { continuation.resume(throwing: error) }
      else { continuation.resume(returning: samples ?? []) }
    })
  }
}

private func readSample(_ store: HKHealthStore, identifier: String, id: String) async throws -> HKSample {
  guard let uuid = UUID(uuidString: id) else { throw SeriesReadError.invalidQuery }
  guard let sample = try await readSamples(store, type: sampleType(identifier), predicate: HKQuery.predicateForObject(with: uuid)).first else {
    throw SeriesReadError.missingSample
  }
  return sample
}

private func quantityFields(_ quantity: HKQuantity?, unit: HKUnit) -> Any? {
  quantity.map { ["unit": unit.unitString, "value": $0.doubleValue(for: unit)] as [String: Any] }
}

private func intervalFields(_ interval: DateInterval) -> [String: Any] {
  ["startDate": preciseDate(interval.start), "endDate": preciseDate(interval.end),
   "startDateReferenceSeconds": interval.start.timeIntervalSinceReferenceDate, "endDateReferenceSeconds": interval.end.timeIntervalSinceReferenceDate]
}

private func statisticFields(_ statistics: HKStatistics, unit: HKUnit) -> [String: Any] {
  var fields: [String: Any] = ["quantityTypeIdentifier": statistics.quantityType.identifier,
                             "unit": unit.unitString, "startDate": preciseDate(statistics.startDate), "endDate": preciseDate(statistics.endDate),
                             "startDateReferenceSeconds": statistics.startDate.timeIntervalSinceReferenceDate, "endDateReferenceSeconds": statistics.endDate.timeIntervalSinceReferenceDate]
  fields["sum"] = quantityFields(statistics.sumQuantity(), unit: unit)
  fields["average"] = quantityFields(statistics.averageQuantity(), unit: unit)
  fields["minimum"] = quantityFields(statistics.minimumQuantity(), unit: unit)
  fields["maximum"] = quantityFields(statistics.maximumQuantity(), unit: unit)
  fields["mostRecent"] = quantityFields(statistics.mostRecentQuantity(), unit: unit)
  fields["duration"] = quantityFields(statistics.duration(), unit: .second())
  fields["mostRecentDateInterval"] = statistics.mostRecentQuantityDateInterval().map(intervalFields)
  fields["sources"] = (statistics.sources ?? []).map { source in
    var values: [String: Any] = ["name": source.name, "bundleIdentifier": source.bundleIdentifier]
    values["sum"] = quantityFields(statistics.sumQuantity(for: source), unit: unit)
    values["average"] = quantityFields(statistics.averageQuantity(for: source), unit: unit)
    values["minimum"] = quantityFields(statistics.minimumQuantity(for: source), unit: unit)
    values["maximum"] = quantityFields(statistics.maximumQuantity(for: source), unit: unit)
    values["mostRecent"] = quantityFields(statistics.mostRecentQuantity(for: source), unit: unit)
    values["duration"] = quantityFields(statistics.duration(for: source), unit: .second())
    values["mostRecentDateInterval"] = statistics.mostRecentQuantityDateInterval(for: source).map(intervalFields)
    return values
  }
  return fields
}

private func eventFields(_ event: HKWorkoutEvent) -> [String: Any] {
  ["type": event.type.rawValue, "dateInterval": intervalFields(event.dateInterval),
   "typedMetadata": (event.metadata ?? [:]).mapValues(typedValue)]
}

private func workoutFields(_ workout: HKWorkout, store: HKHealthStore) async throws -> [String: Any] {
  let types = Set(workout.allStatistics.keys).union(workout.workoutActivities.flatMap { $0.allStatistics.keys })
  let units = try await store.preferredUnits(for: types)
  func statistics(_ values: [HKQuantityType: HKStatistics]) throws -> [String: Any] {
    var result: [String: Any] = [:]
    for (type, value) in values {
      guard let unit = units[type] else { throw SeriesReadError.invalidQuery }
      result[type.identifier] = statisticFields(value, unit: unit)
    }
    return result
  }
  let activities: [[String: Any]] = try workout.workoutActivities.map { activity in
    let configuration = activity.workoutConfiguration
    var config: [String: Any] = ["activityType": configuration.activityType.rawValue,
                               "locationType": configuration.locationType.rawValue,
                               "swimmingLocationType": configuration.swimmingLocationType.rawValue]
    config["lapLength"] = quantityFields(configuration.lapLength, unit: .meter())
    var fields: [String: Any] = ["uuid": activity.uuid.uuidString, "startDate": preciseDate(activity.startDate),
                               "startDateReferenceSeconds": activity.startDate.timeIntervalSinceReferenceDate,
                               "duration": activity.duration, "activityType": configuration.activityType.rawValue,
                               "workoutConfiguration": config, "typedMetadata": (activity.metadata ?? [:]).mapValues(typedValue),
                               "events": activity.workoutEvents.map(eventFields), "allStatistics": try statistics(activity.allStatistics)]
    fields["endDate"] = activity.endDate.map(preciseDate) ?? NSNull()
    fields["endDateReferenceSeconds"] = activity.endDate.map { $0.timeIntervalSinceReferenceDate } ?? NSNull()
    return fields
  }
  var fields: [String: Any] = ["activities": activities, "events": (workout.workoutEvents ?? []).map(eventFields),
                             "allStatistics": try statistics(workout.allStatistics)]
  if #available(iOS 17.0, *) {
    do {
      if let plan = try await workout.workoutPlan {
        fields["workoutPlan"] = ["id": plan.id.uuidString, "activityType": plan.workout.activity.rawValue,
                                 "dataRepresentation": try plan.dataRepresentation.base64EncodedString(), "encoding": "base64"]
      }
    } catch {
      var failure = readFailure("workoutPlan", identifier: workout.uuid.uuidString, error: error)
      if (error as NSError).domain == "WorkoutKit.ImportError" {
        failure["nativeError"] = String(reflecting: error)
        failure["message"] = "WorkoutKit could not import this workout's optional structured plan. The workout and its readable samples are retained."
      }
      fields["captureFailures"] = [failure]
    }
  }
  if hasUnsupportedValue(activities) || hasUnsupportedValue(fields["events"] ?? []) {
    var failures = fields["captureFailures"] as? [[String: Any]] ?? []
    failures.append(["operation": "workoutMetadata", "identifier": workout.uuid.uuidString, "status": "failed", "message": "Unsupported native activity/event metadata type."])
    fields["captureFailures"] = failures
  }
  return fields
}

private func routeLocations(_ store: HKHealthStore, route: HKWorkoutRoute) async -> ([CLLocation], [[String: Any]]) {
  await withCheckedContinuation { continuation in
    var locations: [CLLocation] = []
    var finished = false
    store.execute(HKWorkoutRouteQuery(route: route) { _, batch, done, error in
      guard !finished else { return }
      locations.append(contentsOf: batch ?? [])
      if let error {
        finished = true
        continuation.resume(returning: (locations, [readFailure("routeLocations", identifier: route.uuid.uuidString, error: error)]))
      } else if done {
        finished = true
        let failures = locations.count == route.count ? [] : [readFailure("routeLocationCount", identifier: route.uuid.uuidString, error: SeriesReadError.incompleteSeries)]
        continuation.resume(returning: (locations, failures))
      }
    })
  }
}

private func locationFields(_ location: CLLocation) -> [String: Any] {
  var fields: [String: Any] = ["date": preciseDate(location.timestamp), "timestamp": preciseDate(location.timestamp),
                             "timestampReferenceSeconds": location.timestamp.timeIntervalSinceReferenceDate,
                             "latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude,
                             "altitude": location.altitude, "horizontalAccuracy": location.horizontalAccuracy,
                             "verticalAccuracy": location.verticalAccuracy, "course": location.course,
                             "courseAccuracy": location.courseAccuracy, "speed": location.speed, "speedAccuracy": location.speedAccuracy]
  fields["floor"] = location.floor?.level
  if #available(iOS 15.0, *), let source = location.sourceInformation {
    fields["sourceInformation"] = ["isSimulatedBySoftware": source.isSimulatedBySoftware,
                                  "isProducedByAccessory": source.isProducedByAccessory]
  }
  return fields
}
