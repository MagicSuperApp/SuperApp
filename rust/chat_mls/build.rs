// Sinh C header (ios/chat_mls.h) qua cbindgen cho FFI — Swift dùng trực tiếp.
// Cùng pattern taad_enclave_core.

use std::env;

fn main() {
    let crate_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let header_path = format!("{}/ios/chat_mls.h", crate_dir);

    let cfg = cbindgen::Config {
        language: cbindgen::Language::C,
        // Chỉ export các hàm C-ABI (bỏ qua type nội bộ openmls/arkworks).
        export: cbindgen::ExportConfig {
            include: vec![],
            ..Default::default()
        },
        ..Default::default()
    };

    match cbindgen::Builder::new()
        .with_crate(&crate_dir)
        .with_config(cfg)
        .with_autogen_warning("/* DO NOT EDIT — sinh bởi cbindgen */")
        .with_include_guard("CHAT_MLS_H")
        .with_namespace("chat_mls")
        .generate()
    {
        Ok(bindings) => {
            bindings.write_to_file(&header_path);
        }
        Err(e) => {
            // Không chặn build (vd khi chạy trên target không cần header).
            println!("cargo:warning=cbindgen: {e}");
        }
    }

    println!("cargo:rerun-if-changed=src/ffi.rs");
    println!("cargo:rerun-if-changed=Cargo.toml");
}
