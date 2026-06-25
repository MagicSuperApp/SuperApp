Pod::Spec.new do |s|
  s.name         = 'ScannerModule'
  s.version      = '1.0.0'
  s.summary      = 'iOS Native Scanner Module for OriLife — Camera, YOLO Detection, Circular Capture'
  s.description  = <<-DESC
    Swift native module providing full scanner functionality:
    - AVFoundation camera with real-time preview
    - YOLO TFLite inference (same model as Android)
    - Blur detection (vImage Laplacian)
    - 8-sector circular capture workflow
    - Offline upload queue
    - Native overlay UI (CAShapeLayer bounding boxes)
  DESC

  s.homepage     = 'https://orilife.app'
  s.license      = { :type => 'Proprietary', :text => 'Copyright 2026 OriLife' }
  s.author       = { 'OriLife' => 'dev@orilife.app' }

  s.platform     = :ios, '15.1'
  s.source       = { :path => '.' }
  s.source_files = '**/*.{swift,m,h}'
  s.resources    = ['Resources/**/*.tflite', 'Resources/secrets.plist', 'Resources/GoogleService-Info.plist']

  s.swift_version = '5.9'

  s.frameworks = 'AVFoundation', 'CoreMotion', 'CoreLocation', 'Accelerate', 'CoreImage', 'SystemConfiguration', 'ARKit', 'Metal', 'SceneKit', 'ModelIO'

  s.dependency 'TensorFlowLiteSwift', '~> 2.17.0'
  s.dependency 'SQLite.swift', '~> 0.15.0'
  s.dependency 'Firebase/Analytics'

  # PhoenixKey Rust core (Master_KEK / BIP39) — TaadEnclaveModule.swift imports it.
  s.dependency 'taad_enclave_core'

  s.dependency 'React-Core'
end