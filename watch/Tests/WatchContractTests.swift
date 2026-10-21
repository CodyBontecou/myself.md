import Foundation
import XCTest
@testable import WatchContract

final class WatchContractTests: XCTestCase {
  func fixture(_ name: String) throws -> Data {
    try Data(contentsOf: XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")))
  }
  func testQuantityProjectionMatchesJavaScriptContract() throws {
    let samples = try XCTUnwrap(JSONSerialization.jsonObject(with: fixture("native-steps")) as? [[String: Any]])
    let expected = try XCTUnwrap(JSONSerialization.jsonObject(with: fixture("expected-records")) as? [[String: Any]])
    XCTAssertEqual(NSArray(array: samples.map(WatchRecord.envelope)), NSArray(array: expected))
  }
  func testFilePreservesSourceAndDeclaresWatchCoverage() throws {
    let profile = try JSONDecoder().decode(WatchProfile.self, from: fixture("profile"))
    let samples = try XCTUnwrap(JSONSerialization.jsonObject(with: fixture("native-steps")) as? [[String: Any]])
    let interval = WatchInterval(start: "2026-10-12T00:00:00.000Z", end: "2026-10-12T12:00:00.000Z", day: "2026-10-12", timezone: "UTC")
    let bytes = try WatchRecord.file(profile: profile, deviceId: "watch-fixture", requestId: "fixture-operation", interval: interval, samples: samples, failures: [], earliest: interval.start, exportedAt: interval.end)
    let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
    XCTAssertEqual(payload["schema"] as? String, "myself.md.export.v1")
    XCTAssertEqual(payload["recordCount"] as? Int, samples.count)
    XCTAssertEqual((payload["coverage"] as? [String: String])?["scope"], "watch-local")
    XCTAssertEqual((payload["coverage"] as? [String: String])?["readAuthorization"], "unknown")
    XCTAssertNil(payload["token"])
    XCTAssertNil(payload["destinationBearer"])
  }
  func testInvalidPresetsAreRejected() throws {
    var profile = try JSONDecoder().decode(WatchProfile.self, from: fixture("profile"))
    profile.selection["time"] = ["native:screen-time"]
    XCTAssertThrowsError(try profile.validate())
    profile.selection["time"] = []
    profile.exportSettings.httpUrl = "http://example.test/upload"
    XCTAssertThrowsError(try profile.validate())
  }
  func testDayBoundsUseGregorianCalendarAndTimeZone() throws {
    let date = try XCTUnwrap(WatchTimestamp.date("2026-03-08T20:00:00.000Z"))
    let zone = try XCTUnwrap(TimeZone(identifier: "America/New_York"))
    let interval = WatchInterval.today(at: date, timezone: zone)
    XCTAssertEqual(interval.day, "2026-03-08")
    XCTAssertEqual(interval.start, "2026-03-08T05:00:00.000Z")
  }
  func testNextDayBoundaryAcrossDaylightSavingChanges() throws {
    let zone = try XCTUnwrap(TimeZone(identifier: "America/New_York"))
    for (stamp, expected) in [
      ("2026-11-01T04:30:00.000Z", "2026-11-02T05:00:00.000Z"),
      ("2026-03-09T03:30:00.000Z", "2026-03-09T04:00:00.000Z"),
      ("2026-10-21T16:00:00.000Z", "2026-10-22T04:00:00.000Z")
    ] {
      let now = try XCTUnwrap(WatchTimestamp.date(stamp))
      let midnight = WatchInterval.nextDay(after: now, timezone: zone)
      XCTAssertGreaterThan(midnight, now)
      XCTAssertEqual(WatchTimestamp.string(midnight), expected)
    }
  }
  func testNullableWireFieldsAreExplicit() throws {
    let summary = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(WatchSummary())) as? [String: Any])
    XCTAssertTrue(summary["steps"] is NSNull)
    XCTAssertTrue(summary["observedAt"] is NSNull)
    XCTAssertTrue(summary["day"] is NSNull)
    XCTAssertTrue(summary["earliestAvailable"] is NSNull)
    let receipt = WatchReceipt(requestId: "fixture-operation", status: "completed", recordCount: 0, bytes: 100, httpStatus: 200, partial: false, error: nil)
    let success = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(receipt)) as? [String: Any])
    XCTAssertTrue(success["error"] is NSNull)
    XCTAssertEqual(success["httpStatus"] as? Int, 200)
  }
}
