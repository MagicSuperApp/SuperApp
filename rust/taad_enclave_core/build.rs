// ================================================================
// PhoenixKey — Build Script
// Generates C header via cbindgen for FFI bindings
//
// Workflow:
//   1. cbindgen reads lib.rs → generates taad_enclave_core.h in ios/
//   2. Flutter FFI uses the header to call Rust functions
// ================================================================

use std::env;

fn main() {
    let crate_dir = env::var("CARGO_MANIFEST_DIR").unwrap();

    let header_path = format!("{}/ios/taad_enclave_core.h", crate_dir);

    // Generate C header
    let _ = cbindgen::Builder::new()
        .with_crate(&crate_dir)
        .with_language(cbindgen::Language::C)
        .with_autogen_warning("/* DO NOT EDIT */")
        .with_include_guard("TAAD_ENCLAVE_CORE_H")
        .with_namespace("taad_enclave_core")
        .generate()
        .expect("Unable to generate bindings")
        .write_to_file(&header_path);

    println!("cargo:rerun-if-changed=src/lib.rs");
    println!("cargo:rerun-if-changed=src/crypto.rs");
    println!("cargo:rerun-if-changed=Cargo.toml");
}
