Pod::Spec.new do |s|
  s.name = 'WatchBridge'
  s.version = '1.0.0'
  s.summary = 'Apple Watch profile provisioning'
  s.description = s.summary
  s.license = 'MIT'
  s.author = 'myself.md'
  s.homepage = 'https://myself.md'
  s.platforms = { :ios => '16.0' }
  s.swift_version = '5.9'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WatchConnectivity'
  s.source_files = '**/*.swift'
end
