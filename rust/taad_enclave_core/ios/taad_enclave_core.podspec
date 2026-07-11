Pod::Spec.new do |s|
  s.name             = 'taad_enclave_core'
  s.version          = '0.2.0'
  s.summary          = 'PhoenixKey Rust Core — Master_KEK / BIP39 / crypto (FFI)'
  s.description      = <<-DESC
    PhoenixKey Enclave Rust core (taad_enclave_core), exposed to iOS via a
    static library (libtaad_enclave_core.a) + cbindgen C header. Swift imports
    the module `taad_enclave_core` and calls the `taad_*` C functions directly.

    The .a + header are BUILD OUTPUTS produced on CI (Codemagic) by
    `rust/taad_enclave_core/build_ios.sh` BEFORE `pod install`. They are not
    committed to git (.gitignore) — see codemagic.yaml "Build Rust core (iOS)".
  DESC
  s.homepage         = 'https://github.com/AladinContract/PhoenixKey'
  s.license          = { :type => 'Proprietary', :text => 'Copyright 2026 OriLife' }
  s.author           = { 'OriLife' => 'dev@orilife.app' }
  s.source           = { :path => '.' }
  s.platform         = :ios, '13.0'

  # cbindgen-generated header (public, để Swift `import taad_enclave_core` thấy C decls)
  # + module_shim.c (committed) — buộc CocoaPods build framework/module dưới
  # use_frameworks! :static (pod chỉ-header sẽ KHÔNG sinh module → "no such module").
  s.source_files        = 'taad_enclave_core.h', 'module_shim.c'
  s.public_header_files = 'taad_enclave_core.h'

  # Rust staticlib — CocoaPods tự link qua vendored_libraries (symbol được Swift
  # TaadEnclaveModule tham chiếu nên không bị dead-strip; nếu sau này thiếu symbol
  # thì thêm -force_load). preserve_paths giữ .a/.h khỏi bị dọn.
  s.preserve_paths      = 'libtaad_enclave_core.a', 'taad_enclave_core.h'
  s.vendored_libraries  = 'libtaad_enclave_core.a'

  # DEFINES_MODULE → CocoaPods sinh modulemap để Swift `import taad_enclave_core`.
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
end
