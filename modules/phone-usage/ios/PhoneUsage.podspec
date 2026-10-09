Pod::Spec.new do |s|
  s.name = 'PhoneUsage'
  s.version = '1.0.0'
  s.summary = 'Read-only phone usage bridge'
  s.description = s.summary
  s.license = 'MIT'
  s.author = 'myself.md'
  s.homepage = 'https://github.com/expo/expo'
  s.platforms = { :ios => '16.0' }
  s.swift_version = '5.9'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'FamilyControls', 'DeviceActivity', 'ManagedSettings'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
