// Milestone A — interop wire-format OpenMLS <-> ts-mls.
//
// Luồng (tất cả trong 1 process để private key của "bob" nằm nguyên trong
// in-memory provider của OpenMLS):
//   1. OpenMLS tạo BasicCredential "bob-stake" + P-256 signature keypair.
//   2. Build KeyPackage (suite MLS_128_DHKEMP256_AES128GCM_SHA256_P256).
//   3. Serialize KeyPackage dạng MLSMessage wire -> base64 -> kp-from-rust.b64.
//   4. Shell ra: node ../node-harness/make-welcome.mjs <abs path kp>.
//      ts-mls (alice) tạo nhóm, add KeyPackage của Rust, xuất Welcome.
//   5. Đọc welcome-for-rust.json, base64-decode welcome_b64, deserialize,
//      JOIN nhóm bằng OpenMLS.
//   6. Join OK -> in epoch + "MILESTONE A PASS".

use std::path::PathBuf;
use std::process::Command;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as B64;

use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use tls_codec::{Deserialize as _, Serialize as _};

const CIPHERSUITE: Ciphersuite =
    Ciphersuite::MLS_128_DHKEMP256_AES128GCM_SHA256_P256;

fn main() {
    if let Err(e) = run() {
        eprintln!("❌ MILESTONE A FAIL: {e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    // Thư mục crate (nơi có Cargo.toml) — dùng làm gốc cho đường dẫn tuyệt đối.
    let crate_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let kp_out_path = crate_dir.join("kp-from-rust.b64");
    let node_harness = crate_dir.join("..").join("node-harness");
    let make_welcome = node_harness.join("make-welcome.mjs");
    let welcome_json = node_harness.join("welcome-for-rust.json");

    // --- Provider in-memory: giữ cả key material lẫn group state trong RAM. ---
    let provider = OpenMlsRustCrypto::default();

    // --- 1. Signature keypair P-256 + lưu vào storage của provider. ---
    let signer = SignatureKeyPair::new(CIPHERSUITE.signature_algorithm())?;
    signer.store(provider.storage())?;

    // --- BasicCredential identity = "bob-stake". ---
    let credential = BasicCredential::new(b"bob-stake".to_vec());
    let credential_with_key = CredentialWithKey {
        credential: credential.into(),
        signature_key: signer.public().into(),
    };

    // --- 2. Build KeyPackage. Trong 0.8 build() trả về 1 bundle. ---
    let kp_bundle = KeyPackage::builder().build(
        CIPHERSUITE,
        &provider,
        &signer,
        credential_with_key,
    )?;
    let key_package = kp_bundle.key_package().clone();

    // --- 3. Serialize KeyPackage dạng MLSMessage wire -> base64 -> file. ---
    let kp_msg = MlsMessageOut::from(key_package);
    let kp_bytes = kp_msg.tls_serialize_detached()?;
    let kp_b64 = B64.encode(&kp_bytes);
    std::fs::write(&kp_out_path, &kp_b64)?;
    println!("✔ KeyPackage viết ra {} ({} byte wire)", kp_out_path.display(), kp_bytes.len());

    // --- 4. Shell ra ts-mls (alice) để sinh Welcome. ---
    let kp_abs = std::fs::canonicalize(&kp_out_path)?;
    let output = Command::new("node")
        .arg(&make_welcome)
        .arg(&kp_abs)
        .current_dir(&node_harness)
        .output()?;
    if !output.stdout.is_empty() {
        println!("[node stdout] {}", String::from_utf8_lossy(&output.stdout).trim());
    }
    if !output.stderr.is_empty() {
        eprintln!("[node stderr] {}", String::from_utf8_lossy(&output.stderr).trim());
    }
    if !output.status.success() {
        return Err(format!("node make-welcome.mjs exit {:?}", output.status.code()).into());
    }

    // --- 5. Đọc Welcome ts-mls, deserialize, JOIN. ---
    let welcome_txt = std::fs::read_to_string(&welcome_json)?;
    let welcome_val: serde_json::Value = serde_json::from_str(&welcome_txt)?;
    let welcome_b64 = welcome_val
        .get("welcome_b64")
        .and_then(|v| v.as_str())
        .ok_or("welcome-for-rust.json thiếu welcome_b64")?;
    let alice_epoch = welcome_val.get("aliceEpoch").and_then(|v| v.as_i64()).unwrap_or(-1);
    println!("✔ ts-mls alice epoch = {alice_epoch}");

    let welcome_bytes = B64.decode(welcome_b64)?;
    let welcome_msg = MlsMessageIn::tls_deserialize_exact(&welcome_bytes)?;

    // Lấy body Welcome ra khỏi MLSMessage.
    let welcome = match welcome_msg.extract() {
        MlsMessageBodyIn::Welcome(w) => w,
        other => {
            return Err(format!("kỳ vọng Welcome, nhận body khác: {other:?}").into());
        }
    };

    // ts-mls bật ratchetTreeExtension:true => ratchet tree nằm trong Welcome,
    // nên truyền None cho tham số ratchet tree.
    let mls_group_config = MlsGroupJoinConfig::default();
    let staged_welcome = StagedWelcome::new_from_welcome(
        &provider,
        &mls_group_config,
        welcome,
        None, // ratchet tree — đã có trong welcome extension
    )?;
    let group = staged_welcome.into_group(&provider)?;

    // --- 6. Thành công. ---
    let joined_epoch = group.epoch().as_u64();
    println!("✔ OpenMLS joined — epoch = {joined_epoch}");
    println!("✅ MILESTONE A PASS: OpenMLS joined ts-mls welcome");

    Ok(())
}
