Pod::Spec.new do |s|
  s.name = 'ExportFolder'
  s.version = '1.0.0'
  s.summary = 'Persistent owner-selected export folder access'
  s.description = s.summary
  s.license = 'MIT'
  s.author = 'myself.md'
  s.homepage = 'https://myself.md'
  s.platforms = { :ios => '16.0' }
  s.swift_version = '5.9'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
