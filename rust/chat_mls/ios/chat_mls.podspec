Pod::Spec.new do |s|
  s.name             = 'chat_mls'
  s.version          = '0.1.0'
  s.summary          = 'ProofChat E2EE Rust core — MLS(P-256) + message-layer + Merkle (FFI)'
  s.description      = <<-DESC
    Lõi chat E2EE (rust/chat_mls) 3 tầng khớp web ts-mls, phơi cho iOS qua static lib
    (libchat_mls.a) + cbindgen C header (chat_mls.h). Swift import module `chat_mls` và
    gọi các hàm C `chat_mls_*` trực tiếp (xem ChatMlsModule.swift).

    .a + header là BUILD OUTPUT sinh trên CI (Codemagic) bởi
    `rust/chat_mls/build_ios.sh` TRƯỚC `pod install`. Không commit vào git — xem
    codemagic.yaml "Build Rust chat_mls (iOS)".
  DESC
  s.homepage         = 'https://github.com/AladinContract/PhoenixKey'
  s.license          = { :type => 'Proprietary', :text => 'Copyright 2026 OriLife' }
  s.author           = { 'OriLife' => 'dev@orilife.app' }
  s.source           = { :path => '.' }
  s.platform         = :ios, '13.0'

  # header (public) + module_shim.c (committed) — buộc CocoaPods sinh module dưới
  # use_frameworks! :static (pod chỉ-header sẽ KHÔNG sinh module → "no such module").
  s.source_files        = 'chat_mls.h', 'module_shim.c'
  s.public_header_files = 'chat_mls.h'

  # Rust staticlib — link qua vendored_libraries. Symbol được ChatMlsModule.swift
  # tham chiếu nên không bị dead-strip; nếu thiếu symbol thì thêm -force_load.
  s.preserve_paths      = 'libchat_mls.a', 'chat_mls.h'
  s.vendored_libraries  = 'libchat_mls.a'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
end
