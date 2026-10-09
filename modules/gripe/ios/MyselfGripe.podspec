Pod::Spec.new do |s|
  s.name = 'MyselfGripe'
  s.version = '1.0.0'
  s.summary = 'Development-only in-app iOS feedback'
  s.license = { :type => 'MIT', :file => 'vendor/LICENSE' }
  s.author = 'myself.md'
  s.homepage = 'https://github.com/CodyBontecou/gripe-sdk'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'UIKit'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
