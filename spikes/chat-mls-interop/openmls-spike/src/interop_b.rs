// Milestone B — interop KEY-SCHEDULE giữa OpenMLS (fork) và ts-mls.
//
// Lặp lại đúng luồng Milestone A (OpenMLS sinh KeyPackage P-256 → ts-mls "alice"
// tạo nhóm, add KeyPackage, xuất Welcome → OpenMLS join Welcome), rồi CHỨNG MINH
// thêm: raw MLS key-schedule `epoch_secret` (RFC 9420 §8) mà OpenMLS tính cho
// epoch vừa join KHỚP BYTE-FOR-BYTE với `aliceEpochSecret_hex` ts-mls tính cho
// cùng nhóm đó.
//
// Fork OpenMLS (../openmls-fork) đã được patch tối thiểu để lộ giá trị này ra
// public API: `MlsGroup::epoch_secret() -> Option<&[u8]>`.
//
// So sánh là ĐỘNG theo từng lần chạy: đọc `aliceEpochSecret_hex` sống từ file
// welcome-for-rust.json của lần chạy hiện tại (giá trị đổi mỗi lần do random MLS).

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
        eprintln!("❌ MILESTONE B FAIL: {e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let crate_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let kp_out_path = crate_dir.join("kp-from-rust.b64");
    let node_harness = crate_dir.join("..").join("node-harness");
    let make_welcome = node_harness.join("make-welcome.mjs");
    let welcome_json = node_harness.join("welcome-for-rust.json");

    // --- Provider in-memory. ---
    let provider = OpenMlsRustCrypto::default();

    // --- 1. Signature keypair P-256. ---
    let signer = SignatureKeyPair::new(CIPHERSUITE.signature_algorithm())?;
    signer.store(provider.storage())?;

    // --- BasicCredential "bob-stake". ---
    let credential = BasicCredential::new(b"bob-stake".to_vec());
    let credential_with_key = CredentialWithKey {
        credential: credential.into(),
        signature_key: signer.public().into(),
    };

    // --- 2. Build KeyPackage. ---
    let kp_bundle = KeyPackage::builder().build(
        CIPHERSUITE,
        &provider,
        &signer,
        credential_with_key,
    )?;
    let key_package = kp_bundle.key_package().clone();

    // --- 3. Serialize KeyPackage (MLSMessage wire) -> base64 -> file. ---
    let kp_msg = MlsMessageOut::from(key_package);
    let kp_bytes = kp_msg.tls_serialize_detached()?;
    let kp_b64 = B64.encode(&kp_bytes);
    std::fs::write(&kp_out_path, &kp_b64)?;
    println!("✔ KeyPackage viết ra {} ({} byte wire)", kp_out_path.display(), kp_bytes.len());

    // --- 4. Shell ra ts-mls (alice) để sinh Welcome + epoch_secret của alice. ---
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

    // --- 5. Đọc Welcome + aliceEpochSecret_hex (ĐỘNG, của lần chạy này). ---
    let welcome_txt = std::fs::read_to_string(&welcome_json)?;
    let welcome_val: serde_json::Value = serde_json::from_str(&welcome_txt)?;
    let welcome_b64 = welcome_val
        .get("welcome_b64")
        .and_then(|v| v.as_str())
        .ok_or("welcome-for-rust.json thiếu welcome_b64")?;
    let alice_epoch = welcome_val.get("aliceEpoch").and_then(|v| v.as_i64()).unwrap_or(-1);
    let alice_epoch_secret_hex = welcome_val
        .get("aliceEpochSecret_hex")
        .and_then(|v| v.as_str())
        .ok_or("welcome-for-rust.json thiếu aliceEpochSecret_hex (ts-mls không lộ epoch_secret?)")?
        .to_string();
    println!("✔ ts-mls alice epoch = {alice_epoch}");

    let welcome_bytes = B64.decode(welcome_b64)?;
    let welcome_msg = MlsMessageIn::tls_deserialize_exact(&welcome_bytes)?;
    let welcome = match welcome_msg.extract() {
        MlsMessageBodyIn::Welcome(w) => w,
        other => return Err(format!("kỳ vọng Welcome, nhận body khác: {other:?}").into()),
    };

    // ts-mls bật ratchetTreeExtension:true => ratchet tree nằm trong Welcome.
    let mls_group_config = MlsGroupJoinConfig::default();
    let staged_welcome = StagedWelcome::new_from_welcome(
        &provider,
        &mls_group_config,
        welcome,
        None,
    )?;
    let group = staged_welcome.into_group(&provider)?;

    let joined_epoch = group.epoch().as_u64();
    println!("✔ OpenMLS joined — epoch = {joined_epoch}");

    // --- 6. So epoch_secret: OpenMLS (fork) vs ts-mls. ---
    let openmls_epoch_secret = group
        .epoch_secret()
        .ok_or("fork OpenMLS không giữ epoch_secret cho nhóm vừa join (patch sai code path?)")?;
    let openmls_epoch_secret_hex = hex_encode(openmls_epoch_secret);

    println!();
    println!("  ts-mls   aliceEpochSecret_hex = {alice_epoch_secret_hex}");
    println!("  OpenMLS  epoch_secret         = {openmls_epoch_secret_hex}");
    println!();

    if openmls_epoch_secret_hex == alice_epoch_secret_hex {
        println!("✅ MILESTONE B PASS: epoch_secret khớp ts-mls");
        Ok(())
    } else {
        Err(format!(
            "epoch_secret KHÔNG khớp:\n  ts-mls  = {alice_epoch_secret_hex}\n  OpenMLS = {openmls_epoch_secret_hex}"
        )
        .into())
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}
