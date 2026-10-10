#if DEBUG && canImport(UIKit)
import UIKit

// MARK: - Wire format
//
// POST {endpoint}  (default: https://gripe.isolated.tech/v1/reports)
//
// Headers:
//   Authorization: Bearer <apiKey>
//   Content-Type: multipart/form-data; boundary=<boundary>
//   X-Gripe-Protocol-Version: <protocolVersion>
//   X-Gripe-SDK: ios/<sdkVersion>
//
// Body fields (multipart/form-data):
//   comment      text/plain    user-authored body. Title + tags + description joined by the SDK.
//   metadata     text/plain    JSON-encoded GripeMetadata (see MetadataCollector.swift).
//   repository   text/plain    optional "owner/repo" override; backend falls back to its default.
//   image        image/png     screenshot bytes.
//
// Success response (HTTP 2xx, application/json):
//   { "issueUrl": "https://github.com/...", "issueNumber": 123 }
//
// Error response (HTTP 4xx/5xx, application/json):
//   { "error": "<code>", "detail": "<optional human message>" }
//
// 429 responses SHOULD include a `Retry-After` header (seconds). The SDK honors it when
// flushing the offline retry queue.
//
// Versioning: any breaking change to this contract bumps `protocolVersion` and the SDK
// emits the new value via X-Gripe-Protocol-Version. The server is expected to accept
// older protocol versions for at least one minor SDK release before refusing them.

enum GripeError: LocalizedError {
    case notConfigured
    case encodingFailed
    case unauthorized
    case rateLimited(retryAfter: TimeInterval?)
    case serverError(Int, String?)
    case invalidResponse
    case network(Error)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Gripe.start(apiKey:) was not called."
        case .encodingFailed:
            return "Couldn't encode the screenshot."
        case .unauthorized:
            return "API key was rejected. Check the key in your gripe.isolated.tech dashboard."
        case .rateLimited(let after):
            if let after { return "Rate limited. Try again in \(Int(after.rounded()))s." }
            return "Rate limited. Try again shortly."
        case .serverError(let code, let body):
            if let body, !body.isEmpty { return "Server returned \(code): \(body)" }
            return "Server returned \(code)."
        case .invalidResponse:
            return "Server returned an invalid response."
        case .network(let underlying):
            return "Network error: \(underlying.localizedDescription)"
        }
    }

    /// Whether the SDK should keep this submission in the retry queue.
    /// 4xx (other than 429) means the payload is bad; retry won't help.
    var isTransient: Bool {
        switch self {
        case .rateLimited, .network:
            return true
        case .serverError(let code, _):
            return code >= 500
        case .notConfigured, .encodingFailed, .unauthorized, .invalidResponse:
            return false
        }
    }
}

// Project diagnostic fields only; never serialize requests, headers or arbitrary userInfo.
enum GripeErrorDetails {
    static func json(_ error: Error, redacting apiKey: String = "") -> String {
        func scrub(_ value: String) -> String {
            let text = String(value.prefix(16000))
            return apiKey.isEmpty ? text : text.replacingOccurrences(of: apiKey, with: "[redacted]")
        }
        func native(_ error: NSError, depth: Int = 0) -> [String: Any] {
            var value: [String: Any] = [
                "name": "NSError",
                "domain": error.domain,
                "code": error.code,
                "message": scrub(error.localizedDescription)
            ]
            if let suggestion = error.localizedRecoverySuggestion {
                value["recoverySuggestion"] = scrub(suggestion)
            }
            if depth < 4, let cause = error.userInfo[NSUnderlyingErrorKey] as? NSError {
                value["cause"] = native(cause, depth: depth + 1)
            }
            return value
        }
        var details: [String: Any] = ["name": String(describing: type(of: error)), "message": scrub(error.localizedDescription)]
        if let gripe = error as? GripeError {
            details["retryable"] = gripe.isTransient
            switch gripe {
            case .notConfigured: details["code"] = "not_configured"
            case .encodingFailed: details["code"] = "encoding_failed"
            case .unauthorized: details["code"] = "unauthorized"
            case .rateLimited(let after):
                details["code"] = "rate_limited"
                if let after, after.isFinite { details["retryAfterSeconds"] = after }
            case .serverError(let status, let body):
                details["code"] = "http_error"
                details["status"] = status
                if let body {
                    // Preserve JSON payloads as JSON and keep non-JSON responses as text.
                    details["response"] = (try? JSONSerialization.jsonObject(with: Data(scrub(body).utf8), options: [.fragmentsAllowed])) ?? scrub(body)
                    if body.count > 16000 { details["responseTruncated"] = true }
                }
            case .invalidResponse: details["code"] = "invalid_response"
            case .network(let underlying):
                details["code"] = "network_error"
                details["cause"] = native(underlying as NSError)
            }
        } else {
            details["cause"] = native(error as NSError)
        }
        guard let data = try? JSONSerialization.data(withJSONObject: ["error": details], options: [.prettyPrinted, .sortedKeys]),
              let result = String(data: data, encoding: .utf8) else {
            return "{\"error\":{\"name\":\"ErrorSerializationError\",\"message\":\"Error details could not be serialized.\"}}"
        }
        if data.count > 16000 {
            var bounded: [String: Any] = ["name": String(describing: type(of: error)), "message": String(scrub(error.localizedDescription).prefix(1000)), "truncated": true]
            for key in ["code", "status", "retryable", "retryAfterSeconds"] { if let value = details[key] { bounded[key] = value } }
            if let data = try? JSONSerialization.data(withJSONObject: ["error": bounded], options: [.prettyPrinted, .sortedKeys]), let json = String(data: data, encoding: .utf8) { return json }
        }
        return result
    }
}

final class GripeAPIClient {
    static let shared = GripeAPIClient()
    static let protocolVersion = "1"

    var reporterKey: String?

    private init() {}

    func submit(image: UIImage, comment: String, metadata: GripeMetadata) async -> Result<URL, Error> {
        guard let config = Gripe.shared.configuration else {
            return .failure(GripeError.notConfigured)
        }
        guard let pngData = image.pngData() else {
            return .failure(GripeError.encodingFailed)
        }

        let metadataJSON: Data
        do {
            metadataJSON = try Self.encodeMetadata(metadata)
        } catch {
            return .failure(error)
        }

        if config.dryRun {
            print("[Gripe] dryRun submit:")
            print("  endpoint:", config.endpoint.absoluteString)
            print("  comment:", comment)
            print("  metadata:", String(data: metadataJSON, encoding: .utf8) ?? "{}")
            print("  image bytes:", pngData.count)
            return .success(URL(string: "https://gripe.isolated.tech/dry-run/\(UUID().uuidString)")!)
        }

        let payload = QueuedReport(
            endpoint: config.endpoint,
            apiKey: config.apiKey,
            repository: config.repository,
            reporterKey: reporterKey,
            metadataJSON: metadataJSON,
            comment: comment,
            pngData: pngData
        )

        let result = await send(payload)
        if case .failure(let error) = result, let gripeErr = error as? GripeError, gripeErr.isTransient {
            RetryQueue.shared.enqueue(payload)
        }
        return result
    }

    func send(_ payload: QueuedReport) async -> Result<URL, Error> {
        var request = URLRequest(url: payload.endpoint)
        request.httpMethod = "POST"
        request.setValue("Bearer \(payload.apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue(Self.protocolVersion, forHTTPHeaderField: "X-Gripe-Protocol-Version")
        request.setValue("ios/\(Gripe.sdkVersion)", forHTTPHeaderField: "X-Gripe-SDK")
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.appendField(boundary: boundary, name: "comment", value: payload.comment)
        body.appendField(boundary: boundary, name: "metadata", value: String(data: payload.metadataJSON, encoding: .utf8) ?? "{}")
        if let repository = payload.repository, !repository.isEmpty {
            body.appendField(boundary: boundary, name: "repository", value: repository)
        }
        if let reporterKey = payload.reporterKey {
            body.appendField(boundary: boundary, name: "reporterKey", value: reporterKey)
        }
        body.appendFile(boundary: boundary, name: "image", filename: "screenshot.png", contentType: "image/png", data: payload.pngData)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        do {
            let (data, response) = try await URLSession.shared.upload(for: request, from: body)
            guard let http = response as? HTTPURLResponse else {
                return .failure(GripeError.invalidResponse)
            }
            let status = http.statusCode
            if (200..<300).contains(status) {
                struct Resp: Decodable { let issueUrl: String }
                do {
                    let decoded = try JSONDecoder().decode(Resp.self, from: data)
                    guard let url = URL(string: decoded.issueUrl) else { return .failure(GripeError.invalidResponse) }
                    return .success(url)
                } catch {
                    return .failure(GripeError.invalidResponse)
                }
            }

            switch status {
            case 401, 403:
                return .failure(GripeError.unauthorized)
            case 429:
                let retryAfter = (http.value(forHTTPHeaderField: "Retry-After") as NSString?).flatMap { TimeInterval($0.doubleValue) }
                return .failure(GripeError.rateLimited(retryAfter: retryAfter))
            default:
                let bodyString = String(data: data, encoding: .utf8)
                return .failure(GripeError.serverError(status, bodyString))
            }
        } catch {
            return .failure(GripeError.network(error))
        }
    }

    private static func encodeMetadata(_ metadata: GripeMetadata) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(metadata)
    }
}

private extension Data {
    mutating func appendField(boundary: String, name: String, value: String) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
        append("\(value)\r\n".data(using: .utf8)!)
    }

    mutating func appendFile(boundary: String, name: String, filename: String, contentType: String, data: Data) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        append("Content-Type: \(contentType)\r\n\r\n".data(using: .utf8)!)
        append(data)
        append("\r\n".data(using: .utf8)!)
    }
}
#endif
