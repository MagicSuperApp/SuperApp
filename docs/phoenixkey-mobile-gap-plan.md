# PhoenixKey — Kế hoạch mobile nhận đủ tính năng backend (7/2026)

Đối chiếu backend **PhoenixKey-Database** (Spring Boot, context `/api/v1`) vs mobile SuperApp.
Trạng thái triển khai theo pha. Cập nhật 2026-07-27.

> ⚠ **Tệp này là NHẬT KÝ của các đợt làm việc trong tháng 7/2026, không phải bản mô tả
> hiện trạng.** Mỗi mục đúng với ngày nó được viết. Muốn biết một thứ hôm nay còn sống
> không thì mở mã, đừng đọc bảng ở đây.
>
> Một chỗ đã lệch, ghi ra để không ai phải truy lại: mọi câu nhắc `getlamp.*` /
> `getlampService` (mục "Follow-up ③ + GetLAMP" và "đợt 3") nói về một tệp nay là **mã
> chết** — `src/services/wakemeService.ts` đã thay nó và tự ghi điều đó ở đầu tệp.
> Không sửa các dòng dưới: chúng là ghi chép của một thời điểm, viết lại là làm hỏng
> chính thứ nhật ký dùng để làm.

---

## Pha 0 — Realign & thêm endpoint mới ✅ (đã code, 0 lỗi TS)
`src/services/phoenixKey-api.ts`:
- `wallet.txSubmit(signedTxCbor)` → `POST /wallet/tx/submit`, response `{ cardanoTxHash }`.
- `pools.list/get`, `delegation.status` → `/pools`, `/pools/{id}`, `/delegation/status/{stake}`.
- `identity.deviceKeyOptIn(did, {devicePublicKeyHex, signature, nonce})` → `POST /identity/{did}/device-key`.
- Realign `phoenixWallet-api.ts`: did_payment build/submit ĐÃ LỖI THỜI → thay bằng `tx/submit`.

## Pha 1 — Hoàn thiện việc dở ✅ (đã đối chiếu contract backend)
- **Guardian** (`guardianService.ts`): canonical `PHOENIXKEY_GUARDIAN_ADD:userDid:guardianDid:nonce`
  (remove: `_REMOVE:`), ký owner-key ECDSA (SHA256withECDSA). **Khớp** `GuardianServiceImpl.java`.
- **activity-logs** (`ActivityLogScreen.tsx`): đổi sang cursor `{limit,cursor,filter,range}` →
  `{logs, nextCursor}` khớp `ActivityLogPage.java`; thêm phân trang "tải thêm".
- **keys.revoke**: body `{userDid, publicKeyHex, nonce, signature}` khớp `KeyRevokeRequest.java`.
- **keys.rotate**: API đã đúng (`PHOENIXKEY_ROTATE:newPubkey:nonce`, ECDSA khoá cũ). *UI xoay khoá: follow-up.*

## Pha 2 — Đường ống giao dịch Cardano ✅ (code xong, CHỜ anh build native + BE proxy)
Mô hình: **client dựng+ký CBOR (Rust Enclave) → backend relay `/wallet/tx/submit`**.
Đã thêm bridge `taad_kek_build_signed_transfer` xuyên 5 tầng:
`transfer.rs`(sẵn) → `mobile_kek.rs` → `lib.rs`(C FFI) + `android_jni.rs`(JNI) →
`TaadEnclaveModule.kt/.swift/.m` → `taadEnclave.ts` → `cardanoTxService.sendCardano()`.
- **Cần rebuild native** (cargo-ndk Android + build_ios.sh iOS) để `.so`/`.a` có hàm mới.
- Số u64 (lovelace) truyền dạng **String** qua cầu (vượt double-precision RN).

### ⚠️ CẦN BACKEND — 2 endpoint proxy Blockfrost (Pha 2 chạy end-to-end)
Client cần UTXO + protocol-params để dựng tx; backend hiện KHÔNG có. Đề nghị team Đức thêm
2 endpoint **passthrough Blockfrost**, `result` GIỮ NGUYÊN JSON Blockfrost (snake_case — mobile
fetch THÔ, không camelCase, để Rust `TransferUtxo` parse đúng):

| Method | Path | Auth | result (verbatim Blockfrost) |
|---|---|---|---|
| GET | `/wallet/utxos?address={bech32}` | Bearer session | mảng UTXO = Blockfrost `GET /addresses/{addr}/utxos` |
| GET | `/wallet/params` | public/Bearer | object = Blockfrost `GET /epochs/latest/parameters` |

Envelope chuẩn `{ code:1000, message, result }`. **KHÔNG** đổi tên field bên trong `result`
(Rust cần `tx_hash`, `amount[].unit/quantity`, `coins_per_utxo_size`…). Có thể cache như
`BlockfrostPoolCache`. Khi 2 endpoint sẵn sàng, `cardanoTxService` chạy được ngay (không sửa mobile).

## Pha 3 — Staking / SPO 🔜 (read-only làm được ngay)
- Read: `pools.list/get` + `delegation.status(stakeAddress)` — client đã có (Pha 0).
- Delegate: cert delegation (Rust `staking.rs`) → sign → `tx/submit` — dùng lại bridge Pha 2.

---

## Follow-up ③ + GetLAMP (đợt 2026-07-29)

### ✅ ĐÃ code (0 lỗi TS)
- **Delegate (write)**: bridge `taad_kek_build_stake_delegation` đủ 5 tầng (mirror Pha 2,
  dùng `staking::build_stake_delegation_tx`) → `stakingService.delegateToPool()`.
- **GetLAMP client**: `getlamp.build/submit/vaultStatus/pot` + `getlampService.getPot/getVaultStatus`
  (đọc chạy được với stub). Type khớp `ActivationVaultDtos.java`.

### ✅ ĐÃ code thêm (đợt 2, 0 lỗi TS)
- **2FA DeviceKey**: native `taad_device_key_optin` đủ 5 tầng (sinh Ed25519 ngẫu nhiên +
  ký canonical trong `sign.rs::device_key_optin`) → `deviceKeyService.enableDeviceKey()`
  (lưu secret K_bio qua secureStore) → toggle "Bảo mật 2 lớp" trong PhoenixWalletScreen.
- **Staking screen** (`StakingScreen.tsx`, route `Staking`): trạng thái delegation +
  tra pool (getPool) + uỷ thác (delegateToPool). Điểm vào "Uỷ thác Stake" ở PhoenixWalletScreen.

### ✅ ĐÃ code (đợt 3 — hoàn tất 2 việc "rủi ro cao")
- **GetLAMP write**: native `taad_kek_witness_unsigned_tx` (tái dùng hash+witness của
  transfer.rs, gộp vào witness-set có sẵn) đủ 5 tầng → `getlampService.getLamp()` build→
  witness→submit. **De-risk còn lại: test preprod submit thật.**
- **keys.rotate**: con trỏ alias `getOwnerAlias()/setOwnerAlias()/nextOwnerAlias()` trong
  sdk/phoenixKey (refactor mọi owner-key op) + `keyRotateService.rotateOwnerKey()` (sinh
  khoá mới alias next → ký bằng khoá cũ → /keys/rotate → chỉ khi OK mới đổi con trỏ + xoá
  khoá cũ; lỗi → rollback xoá khoá mới) + entry "Xoay khoá bảo mật" ở PhoenixWalletScreen.
  **De-risk còn lại: PHẢI test máy thật (biometric khoá cũ + đăng nhập lại bằng khoá mới + rollback).**

## Việc còn phụ thuộc
- **Anh build/test native** cho Pha 2 + delegate (Rust FFI mới).
- **Team Đức** thêm 2 proxy endpoint UTXO/params (bảng trên) + nối logic GetLAMP (đang stub/501).
