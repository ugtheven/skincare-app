Pod::Spec.new do |s|
  s.name = 'SkincareTextRecognition'
  s.version = '0.1.0'
  s.summary = 'On-device iOS packaging text recognition with Apple Vision'
  s.description = s.summary
  s.license = 'MIT'
  s.author = 'Skincare App'
  s.homepage = 'https://localhost/skincare-app'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => 'https://localhost/skincare-app.git' }
  s.static_framework = true
  s.swift_version = '5.9'

  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
