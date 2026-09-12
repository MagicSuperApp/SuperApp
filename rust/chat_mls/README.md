# chat_mls

Lõi Rust cho tính năng **chat E2EE (ProofChat)** trên mobile. Port 3 tầng giao thức của
web (`ts-mls`) để **interop với client web đang chạy**.

> ⛔ **12/09/2026 — tầng 2 KHÔNG còn liên thông với web. Đừng đọc
> `spikes/chat-mls-interop/PHA0-FINDINGS.md` như bằng chứng hiện hành.**
>
> Câu ở đây trước là "Pha 0 đã chứng minh khớp byte-for-byte". Nó đúng lúc viết và
> **sai bây giờ**: web đã chuyển tầng 2 sang **application message của RFC 9420**,
> còn `src/message_layer.rs` (`derive_message_key`) vẫn là sơ đồ HKDF cũ. Đo bằng
> thực thi, không bằng suy luận: thân tin của web mở đầu `0001000206636f6e` (byte
> dây MLS, **không có trường `epoch`**), `decode_body_b64` ném lỗi trên thân của
> web, và `ffi.rs` (`core_decrypt`) thì lại đọc `body.epoch` — trường mà thân của
> web không mang.
>
> Vì sao bản khảo sát vẫn xanh: bộ ca kiểm liên thông nạp hàm dẫn khoá từ một tệp
> **không mã sản xuất nào import**, và tập vector chỉ có tầng 2 + tầng 3 — không có
> vector cho application message. Nó xanh trong khi hai bên không đọc được nhau.
> Đây đúng là ca §"có phép kiểm ĐỎ ở chốt X ≠ chốt X được ghim" của rule chung.
>
> Hướng vá do bên chủ ProofChat chốt (cả hai đường đều mất tin cũ). Chưa chốt thì
> **không sửa `message_layer.rs` theo phỏng đoán** — sửa lệch pha là hỏng thêm một
> lớp nữa. Trạng thái hai app: CheckFarm khai `modules: ["trace","join"]` nên không
> chạm chỗ này; Aladin khai `"all"` nên có chạm.

## Ba tầng

| Tầng | Module | Nội dung |
|---|---|---|
| 1 — MLS | `src/mls.rs` | RFC 9420 qua **OpenMLS fork** (vendored), ciphersuite `MLS_128_DHKEMP256_AES128GCM_SHA256_P256`. Sinh KeyPackage, tạo/join nhóm, process commit, expose `epoch_secret`. |
| 2 — message | `src/message_layer.rs` | `HKDF-SHA256(epoch_secret, "mls-msg:"+id)` → `AES-256-GCM`. |
| 3 — Merkle | `src/merkle.rs` | Poseidon BN254 (`light-poseidon`, khớp circomlibjs) + Ed25519 session sig. |

Persistence: `MlsIdentity::export_state()` / `import_state()` — serialize OpenMLS storage +
cache `epoch_secret` theo `(conversation, epoch)` (fork giữ epoch_secret trong RAM, mất khi
`MlsGroup::load` → cache cứu, và cho phép giải mã tin ở epoch cũ).

## FFI (bridge RN)

- **iOS**: C-ABI trong `src/ffi.rs` → header tự sinh `ios/chat_mls.h` (cbindgen). Hàm
  `chat_mls_*`, handle `u64` (con trỏ `MlsIdentity`), chuỗi JSON `{"ok":bool,...}`.
- **Android**: `src/android_jni.rs` (cfg android) — class Kotlin
  `com.aladincontract.company.ChatMlsModule`, hàm `native*`, handle `Long`.
- Cả hai gọi chung `ffi::core_*` (một nguồn logic).

## Fork OpenMLS

Vendored tại `rust/vendor/openmls` (patch tag `// [chat_mls patch]`) để expose raw
`epoch_secret` — không có crate MLS Rust nào expose sẵn. chat_mls trỏ qua
`[patch.crates-io]`. Patch capture epoch_secret ở **create + join + merge-commit** path.

## Build / test

```bash
cargo test                              # 10/10 (golden vector web + MLS thật + persistence)
cargo build                             # sinh staticlib + cdylib + ios/chat_mls.h
cargo check --target aarch64-linux-android   # type-check JNI shim
```

Cross-compile thật (`.a` iOS / `.so` Android) + codemagic: xem `build_ios.sh` / `build_android.sh`
(pattern như `taad_enclave_core`) — cần macOS cho iOS, Android NDK cho Android.

## API (tóm tắt)

`chat_mls_new(stake) -> handle` · `generate_key_package` · `create_group(conv, membersJson)` ·
`join_from_welcome(welcomeB64)` · `process_commit(conv, commitB64)` · `encrypt(conv, plaintext)` ·
`decrypt(conv, bodyB64)` · `export_state` / `import_state` · `free`.
