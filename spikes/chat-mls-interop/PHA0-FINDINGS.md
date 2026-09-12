# Pha 0 — Spike interop: kết quả

> ⛔ **HẾT HIỆU LỰC 12/09/2026 — đọc như tư liệu lịch sử, KHÔNG dùng làm căn cứ.**
>
> Dấu ✅ ở tầng 2 bên dưới **không còn đúng**: web đã chuyển tầng 2 sang application
> message của RFC 9420, còn bản Rust vẫn giữ sơ đồ HKDF mà bảng này nghiệm thu. Hai
> bên hiện **không đọc được tin của nhau** — đo bằng thực thi: thân tin của web mở
> đầu `0001000206636f6e` và không mang trường `epoch`; hàm giải mã của ta ném lỗi
> trên thân đó, còn hàm giải mã của web trả `undefined` trên thân của ta.
>
> Bảng này vẫn xanh vì bộ ca kiểm liên thông nạp hàm dẫn khoá từ một tệp không mã
> sản xuất nào import, và tập vector thiếu hẳn vector cho application message. Nên
> **màu xanh ở đây là màu của một phép đo không đo gì**, không phải bằng chứng.
>
> Bên chủ ProofChat chốt hướng vá, và bước đầu của họ là mở rộng tập vector trước.
> Trạng thái hiện hành nằm ở `rust/chat_mls/README.md`.

> Mục tiêu: chứng minh bản Rust khớp giao thức MLS 3-tầng của web (ts-mls) **trước khi**
> đầu tư Pha 1. Cập nhật: 2026-07-01.

## Tóm tắt trạng thái

| Tầng | Nội dung | Trạng thái |
|---|---|---|
| **2 — message-layer** | HKDF-SHA256(salt rỗng, `"mls-msg:"+id`) → AES-256-GCM | ✅ **Rust khớp byte-for-byte** |
| **3 — Merkle** | Poseidon BN254 (circomlib) + Ed25519 session sig | ✅ **Rust khớp byte-for-byte** |
| **1 — MLS (wire)** | Milestone A: OpenMLS join Welcome của ts-mls | ✅ **PASS — khớp wire 100%** |
| **1 — MLS (epoch_secret)** | Milestone B: fork OpenMLS expose `epoch_secret` == ts-mls | ✅ **PASS — khớp 3/3 lần chạy** |

> **PHA 0 HOÀN TẤT.** Cả 3 tầng giao thức MLS của web đã chứng minh port được sang Rust và
> interop với ts-mls (byte-for-byte). Plan 6-pha khả thi. Fork OpenMLS ở `openmls-fork/`
> (patch 60 dòng, 7 file, tag `// [chat_mls patch]`). Milestone B binary: `openmls-spike/src/interop_b.rs`.
>
> ⚠️ **Lưu ý mang sang production:** patch giữ `epoch_secret` trong RAM, **mất khi `MlsGroup::load`**
> (không persist). Nếu production cần epoch_secret sống qua reload → phải mở rộng storage provider
> (thay đổi lớn hơn, cố ý tránh trong spike). Cách né: sau reload, dẫn lại epoch_secret bằng cách
> reprocess commit gần nhất, hoặc cache epoch_secret ở tầng chat_mls store (ngoài OpenMLS).

**ts-mls tự thân**: đã chạy được suite `MLS_128_DHKEMP256_AES128GCM_SHA256_P256` trong
Node; nhóm 2 thành viên (alice+bob) **đồng thuận `epoch_secret`** (32 byte). → epoch_secret
là giá trị deterministic của nhóm, đúng như RFC.

## Cách chạy lại

```bash
# 1) Sinh golden vectors từ đúng lib của web
cd spikes/chat-mls-interop/node-harness
npm install
node gen-vectors.mjs          # → rust/chat_mls/vectors/web-vectors.json, mls-sample.json

# 2) Đối chiếu bằng Rust (phải in "✅ TẤT CẢ KHỚP")
cd ../rust-spike
cargo run --bin verify_vectors
```

## Kết quả đối chiếu (đã chạy)

```
=== TẦNG 2 — HKDF-SHA256 + AES-256-GCM ===
  [PASS] messageKey / ciphertext(b64) / tag(b64)
=== TẦNG 3 — Poseidon BN254 + Ed25519 ===
  [PASS] contentField / saltField / ptCommit / leafHash / ed25519_pub / signature
  [PASS] verify chữ ký tweetnacl bằng ed25519-dalek
✅ TẤT CẢ KHỚP — tầng 2 & 3 interop OK
```

## Chốt kỹ thuật (dùng cho Pha 1)

### Tầng 2 — message-layer (bản Rust dùng được production)
- IKM = `epoch_secret` (32B từ MLS key schedule).
- `messageKey = HKDF-SHA256(salt = rỗng→None, info = "mls-msg:"+messageId, L=32)`.
  - ⚠️ WebCrypto `salt: new Uint8Array(0)` ⇔ Rust `Hkdf::new(None, ikm)` (KHÔNG phải `Some(&[])` về mặt ngữ nghĩa, nhưng cho cùng kết quả).
- `AES-256-GCM`, IV 12B ngẫu nhiên, tag 128-bit, **không AAD**.
- plaintext = `utf8(JSON.stringify({salt, nonce, plaintext}))` (đúng thứ tự khoá).
- `body` gửi lên WS = `base64(JSON{epoch, messageId, iv:b64, ciphertext:b64, tag:b64})`.
- `messageId` = UUID sinh mới mỗi tin (nằm trong body, bên nhận đọc từ đây để dẫn khoá).

### Tầng 3 — Merkle (bản Rust dùng được production)
- Crate: **`light-poseidon` 0.2** (`Poseidon::<ark_bn254::Fr>::new_circom(nInputs)`) — **khớp `circomlibjs` 0.1.7**.
- `strToField(s)` = `Fr::from_be_bytes_mod_order(blake2b256(utf8(s))[..31])` — lấy **31 byte đầu** của blake2b-256.
- `saltField` = `Fr::from_be_bytes_mod_order(salt_bytes[..31])` (salt 32B, lấy 31B đầu).
- `ptCommit = Poseidon([contentField, saltField])`.
- `leafHash = Poseidon([strToField(convId), strToField(senderId), Fr(timestamp_ms), ptCommit])`.
- Xuất field → `into_bigint().to_bytes_be()` (32B big-endian) → hex.
- Chữ ký: Ed25519 (`ed25519-dalek` v2) ký trên **bytes của leafHashHex** (hex-decode 32B).
  `tweetnacl` (web) và `ed25519-dalek` tương thích cả sign lẫn verify.

### Tầng 1 — MLS (đang kiểm)
- ts-mls API đã dùng: `getCiphersuiteImpl(getCiphersuiteFromName(...))`, `generateKeyPackage(cred, defaultCapabilities(), defaultLifetime, [], impl)`, `createGroup`, `createCommit({state,cipherSuite},{extraProposals:[{proposalType:'add',add:{keyPackage}}],ratchetTreeExtension:true})`, `joinGroup(welcome, pub, priv, emptyPskIndex, impl)`.
- credential = `basic`, identity = utf8(stakeAddress).
- `epoch_secret` = `groupState.keySchedule.epochSecret` (32B).
- **Ẩn số cần chốt:** thư viện MLS Rust (OpenMLS/mls-rs) có expose `epoch_secret` thô để dẫn khoá tầng 2 giống ts-mls không. RFC 9420 §8: epoch_secret là intermediate deterministic → 2 impl đúng chuẩn PHẢI ra cùng bytes; vấn đề chỉ là API có lộ ra không (nhiều khả năng phải fork/patch nhỏ để surface).
- Mẫu KeyPackage(bob) + Welcome do ts-mls sinh nằm ở `node-harness/mls-sample.json` để bước Rust consume.

## Quyết định thư viện MLS Rust (đã chốt)

**Chọn OpenMLS 0.8 + `openmls_rust_crypto` 0.5** (provider thuần Rust `p256`). Lý do:
- Suite `MLS_128_DHKEMP256_AES128GCM_SHA256_P256` là enum first-class.
- Provider thuần Rust → cross-compile iOS/Android **không cần C toolchain** (mls-rs mặc định kéo aws-lc C).
- License **MIT**.
- `epoch_secret` đã tồn tại dạng `pub(crate) EpochSecret` trong `openmls/src/schedule/mod.rs`
  → **patch nhỏ nhất** để expose (mls-rs vứt epoch_secret ngay sau khi dùng, khó hơn).

**Xác nhận từ RFC 9420 §8:** `epoch_secret = ExpandWithLabel(member_secret, "epoch", GroupContext, KDF.Nh)`
— là intermediate root, deterministic. Hai impl đúng chuẩn PHẢI ra cùng bytes → interop được
đảm bảo, chỉ cần expose ra API.

Không có crate Rust nào expose sẵn `epoch_secret` → **bắt buộc fork OpenMLS** (patch vài dòng:
giữ lại `EpochSecret` trên `MlsGroup` + thêm `pub fn epoch_secret(&self) -> &[u8]`).

## Tầng 1 — chia 2 mốc

- **Milestone A (KHÔNG cần fork): ✅ PASS.** OpenMLS 0.8.1 sinh KeyPackage P-256 (401B wire) →
  ts-mls decode `mls_key_package` OK → add + tạo Welcome (nhúng ratchet tree qua extension) →
  OpenMLS `StagedWelcome::new_from_welcome(.., None)` join OK, cả hai epoch=1. **KHÔNG lệch wire nào**
  (KeyPackage, Welcome, ratchet-tree-in-extension, BasicCredential, P-256 sig, HPKE-P256). Compile lần
  đầu chạy luôn. Binary: `openmls-spike/src/interop_a.rs`. API OpenMLS 0.8 đã dùng — xem cuối file.
  Chạy lại: `cd openmls-spike && cargo run --bin interop_a`.
- **Milestone B (cần fork):** patch OpenMLS expose `epoch_secret`; sau khi join, khẳng định
  `epoch_secret(Rust) == epochSecret(ts-mls alice)`. RFC bảo đảm bằng nhau → chỉ là đọc ra & so.

## Kết luận Pha 0 (tạm)
Tầng 2 & 3 — **xanh hoàn toàn**, port thẳng sang crate `chat_mls` production được. Tầng 1: lib đã
chốt (OpenMLS), interop được RFC bảo đảm; còn lại là chạy Milestone A (wire) rồi B (fork epoch_secret).

## OpenMLS 0.8 — API dùng cho crate production (từ Milestone A)

```rust
const CS: Ciphersuite = Ciphersuite::MLS_128_DHKEMP256_AES128GCM_SHA256_P256;
let provider = OpenMlsRustCrypto::default();
let signer = SignatureKeyPair::new(CS.signature_algorithm())?;
signer.store(provider.storage())?;                    // StorageProvider qua prelude
let cwk = CredentialWithKey {
    credential: BasicCredential::new(b"<stakeAddress>".to_vec()).into(),
    signature_key: signer.public().into(),
};
let kp = KeyPackage::builder().build(CS, &provider, &signer, cwk)?.key_package().clone();
let kp_wire = MlsMessageOut::from(kp).tls_serialize_detached()?;   // wireformat mls_key_package
// join:
let welcome = match MlsMessageIn::tls_deserialize_exact(&bytes)?.extract() {
    MlsMessageBodyIn::Welcome(w) => w, _ => bail!(),
};
let group = StagedWelcome::new_from_welcome(&provider, &MlsGroupJoinConfig::default(), welcome, None)?
    .into_group(&provider)?;                          // ratchet tree = None (nằm trong extension)
```

Deps đã chốt (resolved): `openmls 0.8.1`, `openmls_rust_crypto 0.5.1`, `openmls_basic_credential 0.5.0`,
`tls_codec 0.4.2`. (`openmls_traits` không cần khai trực tiếp — re-export qua prelude.)

## Ghi chú chiến lược: fork vs migrate exporter
Fork OpenMLS để expose `epoch_secret` là để **khớp web hiện tại KHÔNG đổi web**. Phương án thay thế
(về lâu dài, tránh gánh nặng maintain fork qua các bản nâng cấp): đổi CẢ web lẫn native sang dùng
**RFC exporter** (`export_secret(label="mls-msg", ...)`) cho tầng 2 — chuẩn RFC, mọi lib expose sẵn,
không cần fork. Nhưng phải sửa `D:\FE` và ảnh hưởng client web đã deploy → cân nhắc khi có dịp refactor.
Trước mắt: giữ fork để interop ngay với web đang chạy.

## Cập nhật Pha 1 — patch fork phải mở rộng thêm merge-commit path

Fork Milestone B chỉ capture `epoch_secret` ở **create + join** path. Khi dựng crate
production `rust/chat_mls` và test alice tạo nhóm + add bob (alice advance epoch qua
`merge_pending_commit`), phát hiện epoch_secret của alice **kẹt ở epoch 0** → lệch bob.

→ Đã mở rộng patch trong **bản vendored** `rust/vendor/openmls` (canonical cho production):
- `staged_commit.rs`: thêm field `epoch_secret: Vec<u8>` (`#[serde(default)]`) vào
  `MemberStagedCommitState` + param `new()`; capture ở `derive_epoch_secrets` result
  (received-commit path); trong `merge_commit` set `self.epoch_secret = Some(state.epoch_secret)`.
- `commit_builder.rs`: capture `provisional_epoch_secret` (self-commit path) → truyền vào
  `MemberStagedCommitState::new`.

Kết quả: `cargo test -p chat_mls` → **9/9 PASS**, gồm `alice_bob_agree_epoch_secret` và
`end_to_end_encrypt_with_real_epoch_secret` (MLS thật → epoch_secret → AES-GCM 2 chiều).

⚠️ Bản `spikes/.../openmls-fork` giữ patch cũ (đủ cho spike join-only). Bản vendored
`rust/vendor/openmls` là bản ĐẦY ĐỦ dùng cho production.
