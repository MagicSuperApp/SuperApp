Pod::Spec.new do |s|
  s.name         = 'ScannerModule'
  s.version      = '1.0.0'
  s.summary      = 'iOS Native Module for OriLife — TreeReID, PhoenixKey Enclave, VoiceMemo'
  s.description  = <<-DESC
    Swift native module (pod name kept as ScannerModule for stability).
    Scanner YOLO (tree/fruit detection + circular capture + upload) đã gỡ.
    Còn lại:
    - TreeReID: định danh cây bằng camera (capture-by-heading)
    - PhoenixKey: HW key P-256 (did_auth) + TaadEnclave (Master_KEK/BIP39 ví Cardano)
    - VoiceMemo: ghi âm 30s
    - Hạ tầng camera/sensor dùng chung (AVFoundation preview, CoreMotion, CoreLocation)
  DESC

  s.homepage     = 'https://orilife.app'
  s.license      = { :type => 'Proprietary', :text => 'Copyright 2026 OriLife' }
  s.author       = { 'OriLife' => 'dev@orilife.app' }

  s.platform     = :ios, '15.1'
  s.source       = { :path => '.' }
  s.source_files = '**/*.{swift,m,h}'
  # Scanner YOLO đã gỡ → không còn .tflite. Giữ secrets.plist + GoogleService-Info.plist.
  s.resources    = ['Resources/secrets.plist', 'Resources/GoogleService-Info.plist']

  s.swift_version = '5.9'

  # Chỉ giữ framework mà phần còn lại (TreeReID/PhoenixKey/VoiceMemo/Camera) dùng.
  s.frameworks = 'AVFoundation', 'CoreMotion', 'CoreLocation', 'CoreVideo', 'CoreMedia'

  # TensorFlowLiteSwift / SQLite.swift / Firebase/Analytics đã gỡ cùng scanner YOLO
  # (không file giữ lại nào dùng). Firebase app-level vẫn khai báo riêng trong Podfile.

  # PhoenixKey Rust core (Master_KEK / BIP39) — TaadEnclaveModule.swift imports it.
  s.dependency 'taad_enclave_core'

  # ProofChat E2EE Rust core — ChatMlsModule.swift (Core/Enclave) imports `chat_mls`.
  # THIẾU dep này → "no such module 'chat_mls'" khi build archive (như taad ở trên).
  s.dependency 'chat_mls'

  s.dependency 'React-Core'
end