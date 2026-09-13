# chat_mls

Lõi Rust cho tính năng **chat E2EE (ProofChat)** trên mobile. Port 3 tầng giao thức của
web (`ts-mls`) để **interop với client web đang chạy** — bản khảo sát Pha 0 ở
`spikes/chat-mls-interop/PHA0-FINDINGS.md`, **mốc đo 2026-07-01**. Mốc đó là phần quan trọng:
xem ô trạng thái từng tầng ngay dưới đây, vì ba tầng KHÔNG cùng một mức bằng chứng.

## Ba tầng

| Tầng | Module | Nội dung |
|---|---|---|
| 1 — MLS | `src/mls.rs` | RFC 9420 qua **OpenMLS fork** (vendored), ciphersuite `MLS_128_DHKEMP256_AES128GCM_SHA256_P256`. Sinh KeyPackage, tạo/join nhóm, process commit, expose `epoch_secret`. |
| 2 — message | `src/message_layer.rs` | `HKDF-SHA256(epoch_secret, "mls-msg:"+id)` → `AES-256-GCM`. |
| 3 — Merkle | `src/merkle.rs` | Poseidon BN254 (`light-poseidon`, khớp circomlibjs) + Ed25519 session sig. |

## Ba tầng interop với web ở ba mức bằng chứng KHÁC nhau

Bản trước tệp này viết *"tầng 2 đã rẽ, còn tầng 1 và tầng 3 VẪN KHỚP"*. Câu đó gộp ba trạng
thái khác nhau vào một chữ, và chữ ấy chắc hơn thứ đo được.

| tầng | trạng thái đúng | neo |
|---|---|---|
| 2 — message | **đã rẽ khỏi bản web** | — |
| 3 — Merkle | **đã đối chiếu MỘT LẦN, mốc 2026-07-01** | output thô trong `PHA0-FINDINGS.md` (`[PASS] contentField / saltField / ptCommit / leafHash / ed25519_pub / signature`) + `vectors/web-vectors.json` khoá `tier3_merkle` |
| 1 — MLS | **`[KHÔNG ĐO ĐƯỢC]` hôm nay** | xem ba lý do dưới |

### Vì sao tầng 1 là `[KHÔNG ĐO ĐƯỢC]`, không phải "khớp" và cũng không phải "lệch"

1. `vectors/web-vectors.json` chỉ mang `tier2_message` và `tier3_merkle` — **không có dữ liệu
   tầng 1**, nên không phép kiểm nào chạy lại được nó.
2. `PHA0-FINDINGS.md` **tự mâu thuẫn** về chính tầng này: bảng đầu tệp ghi Milestone A và B đều
   `✅ PASS`, còn thân tệp ghi *"Tầng 1 — MLS (đang kiểm)"* và *"Kết luận Pha 0 (tạm) … còn lại
   là chạy Milestone A rồi B"*. Bảng được cập nhật, thân không — nên không đọc ra được lần chạy
   nào là lần cuối.
3. Milestone A có mô tả chi tiết đủ để tin (KeyPackage P-256 401 byte, ts-mls decode, join,
   cả hai epoch=1) nhưng **không có output thô dán vào**; Milestone B chỉ có một ô bảng
   *"khớp 3/3 lần chạy"*.

### Và một điều đúng cho CẢ tầng 3: vector là hằng số chép ở chỗ khác

`src/golden.rs:14` tự đặt điều kiện **cần cả hai nửa**: test Rust đọc tệp vector đã commit, VÀ
một bước CI chạy lại `gen-vectors.mjs` từ nguồn web rồi `diff` với đúng tệp ấy. Nửa thứ hai
thuộc CI kho ProofChat và **không có ở đó** (nhà ProofChat đo, 2026-09-13).

Thiếu nửa đó thì `tier3_merkle` là một hằng số chép: **web trôi mà không ai biết.** Nên "đã đối
chiếu" ở tầng 3 là phát biểu về **ngày 01/07/2026**, không phải về hôm nay.

### Hàng rào — vẫn cần, chỉ đổi nội dung

⚠ **Đừng kết luận "đã phân kỳ cả ba tầng" rồi đi dựng lại thứ không cần dựng.** Cái giá đó là
thật. Nhưng hàng rào đúng không phải *"hai tầng kia đã đối chiếu rồi"* — mà là: **tầng 3 đối
chiếu một lần ở một mốc đã cũ, tầng 1 chưa ai đo lại được. Đừng kết luận theo CẢ HAI chiều.**

Tệp này là **bản sao có nhãn**, không phải nguồn — nguồn là docstring trong kho ProofChat.
Ghim bản chép ở `scripts/vendored-tree-pin.json`; chỉ cập nhật ghim khi commit nguồn đã nằm
trên `main` của kho đó, không cập nhật lúc họ mới mở PR.

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
