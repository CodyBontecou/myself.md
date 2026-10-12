// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "WatchContract",
  products: [.library(name: "WatchContract", targets: ["WatchContract"])],
  targets: [
    .target(name: "WatchContract", path: "Shared", exclude: ["WatchStore.swift", "WatchExportIntent.swift"], sources: ["WatchModels.swift", "WatchRecord.swift"]),
    .testTarget(name: "WatchContractTests", dependencies: ["WatchContract"], path: "Tests", resources: [.copy("Fixtures")])
  ]
)
