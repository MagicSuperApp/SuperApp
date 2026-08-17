/**
 * MobileCore L1 — Keystore engine CONTRACT (interface only).
 *
 * NO native code lives here. Every method below is a signature that a
 * per-OS native module (TurboModule / Swift pod / Kotlin module) must
 * implement. See `MobileCore/CONVENTIONS.md` §1 — L1 = interface only.
 *
 * ── PHOENIXKEY SCHEMA BOUNDARY (đọc trước khi hiện thực bất cứ đâu) ──────
 * `canonicalize()` và schema DID/token là tài sản của PhoenixKey
 * (rust_core + `PhoenixKey-SDK/src/verifier.ts:222-243`, hàm
 * `canonicalJsonString` — sort key theo bảng chữ cái, khớp backend
 * `SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS`). MobileCore KHÔNG
 * định nghĩa lại canonicalize hay DID/token schema ở bất kỳ tầng nào
 * (L0 hay L1) — lệch version giữa 2 bản canonicalize làm invalid hoá
 * chữ ký đã ký (MOBILE-CORE-STANDARD.md §2 E1 "Bất biến").
 *
 * `KeystoreEngine` bên dưới chỉ bọc phần *sinh khoá HW non-exportable +
 * ký* (Android Keystore secp256r1 / iOS Secure Enclave P256).
 * Việc canonicalize payload trước khi lấy `dataHex` để truyền vào
 * `sign()` là việc của TẦNG GỌI (app/platform), KHÔNG phải của
 * KeystoreEngine — engine chỉ ký bytes đã canonical hoá sẵn.
 *
 * ── QUAN HỆ 2 KHOÁ (Phoenix xác nhận 2026-07-16, ĐÓNG NEEDS-EVIDENCE) ────
 * Khoá HW_Key P-256 (secp256r1) gate-sinh-trắc dưới đây CHÍNH LÀ khoá
 * DID-auth mà server Phoenix verify bằng `@noble/curves p256`
 * (`PhoenixKey-SDK/src/verifier.ts:141` `p256.verify(sig, sha256(msg), pub)`).
 * KHÁC HẲN `TAAD_Key` Ed25519 dùng ký giao dịch ON-CHAIN qua
 * `taad_sign_ed25519` — TAAD_Key KHÔNG thuộc keystore này. Đừng đánh đồng:
 * `getPublicKeyHex` ở đây trả pubkey P-256 để verify DID-auth, KHÔNG phải
 * pubkey Ed25519 on-chain.
 *
 * Native glue là PER-APP — KHÔNG có 1 binary dùng chung giữa các app.
 * Mỗi app tự bind theo interface này. Bản mẫu tham khảo (OriLife,
 * KHÔNG phải MobileCore sở hữu, chỉ để harvest signature/hành vi):
 *   - RN bridge: orilife-mobile-app@origin/main `src/services/phoenixKey-native.ts`
 *   - Android:   orilife-mobile-app@origin/main
 *                `android/app/src/main/java/com/aladincontract/company/PhoenixKeyModule.kt`
 *   - iOS:       orilife-mobile-app@origin/main
 *                `ios/LocalPods/ScannerModule/UI/PhoenixKeyModule.swift`
 *
 * "Gọi sang PhoenixKey" từ MobileCore/platform nghĩa là gọi REST API
 * (`identity.register` + verify server-side) — KHÔNG import code
 * PhoenixKey vào MobileCore, KHÔNG copy rust_core/SDK vào đây.
 * ──────────────────────────────────────────────────────────────────────
 */

/**
 * Kết quả sinh cặp khoá.
 * `publicKeyHex` = SEC1 hex. Phoenix `@noble/curves p256` nhận cả nén (33B)
 * lẫn không nén (65B, `0x04…`) — CHỐT 1 kiểu và publish cùng kiểu với
 * `GET /identity/{did}/pubkey`. Mặc định harvest: không nén `0x04…` (65B).
 */
export interface KeystoreKeypairResult {
  alias: string;
  publicKeyHex: string;
}

/**
 * Mục đích của khoá được sinh — quyết định BẤT BIẾN hợp đồng về gating.
 *
 * - `'did-identity'`: khoá phục vụ ĐỊNH DANH DID (PhoenixKey). Bắt buộc
 *   gate sinh trắc — xem bất biến ở `generateKeypair`. KHÔNG hạ cấp được.
 * - `'general'`: khoá dùng chung (phiên/ký kỹ thuật không định danh) —
 *   caller tự chọn có gate sinh trắc hay không qua `requireBiometric`.
 */
export type KeystoreKeyPurpose = 'did-identity' | 'general';

/**
 * Contract native cho việc sinh/đọc/xoá/ký bằng khoá phần cứng
 * (Android Keystore / iOS Secure Enclave). Mỗi method map 1-1 với
 * 1 lệnh gọi TurboModule — KHÔNG có logic nghiệp vụ ở đây.
 */
export interface KeystoreEngine {
  /**
   * Sinh cặp khoá EC (secp256r1/P256) non-exportable trong HW keystore
   * dưới `alias`. Nếu `requireBiometric`, khoá được gate bởi
   * BiometricPrompt.CryptoObject (Android) / LAContext (iOS) — mọi lần
   * `sign()` sau đó bắt buộc xác thực sinh trắc trước khi enclave ký.
   *
   * ── BẤT BIẾN HỢP ĐỒNG: biometric-gated DID ─────────────────────────
   * Khi `keyPurpose === 'did-identity'`, sinh trắc BẮT BUỘC bật:
   *   - `requireBiometric` bị ÉP `true` bất kể giá trị caller truyền vào.
   *   - Engine native PHẢI TỪ CHỐI (throw) mọi yêu cầu tạo khoá
   *     `'did-identity'` KHÔNG gate sinh trắc — không có đường hạ cấp.
   *   - Đây là bất biến ĐỊNH DANH: khoá đại diện DID người dùng không
   *     được phép ký khi chưa có xác thực sinh trắc sống.
   * Khi `keyPurpose === 'general'`, caller tự quyết qua `requireBiometric`.
   * ───────────────────────────────────────────────────────────────────
   *
   * @param alias Định danh khoá trong keystore (per-app, per-user).
   * @param keyPurpose Mục đích khoá — `'did-identity'` kích hoạt bất biến
   *   ép sinh trắc ở trên; `'general'` cho khoá dùng chung.
   * @param requireBiometric Gate ký bằng sinh trắc học. BỊ BỎ QUA (ép
   *   `true`) khi `keyPurpose === 'did-identity'`.
   * @throws khi alias đã tồn tại (harvest: `E_KEY_EXISTS`), keygen thất
   *   bại (harvest: `E_KEYGEN_FAILED`), hoặc tạo khoá `'did-identity'`
   *   mà không gate sinh trắc (bất biến vi phạm — native PHẢI throw;
   *   harvest đề xuất: `E_DID_KEY_REQUIRES_BIOMETRIC`).
   * @needs-device-test Cần chạy trên máy thật có Secure Enclave/StrongBox
   *   thật — simulator/emulator không đại diện hành vi enclave.
   */
  generateKeypair(
    alias: string,
    keyPurpose: KeystoreKeyPurpose,
    requireBiometric: boolean,
  ): Promise<KeystoreKeypairResult>;

  /**
   * Đọc public key hex (uncompressed EC point) của khoá đã tồn tại
   * dưới `alias`. KHÔNG yêu cầu xác thực sinh trắc (public key không
   * nhạy cảm).
   *
   * @throws khi không tìm thấy khoá (harvest: `E_NO_KEY`).
   * @needs-device-test
   */
  getPublicKeyHex(alias: string): Promise<string>;

  /**
   * Kiểm tra khoá có tồn tại trong HW keystore dưới `alias` hay không.
   * Không throw khi không tìm thấy — trả `false`.
   *
   * @needs-device-test
   */
  hasKey(alias: string): Promise<boolean>;

  /**
   * Xoá khoá khỏi HW keystore. Trả `true` nếu xoá thành công (hoặc
   * đã sẵn không tồn tại — idempotent theo hành vi harvest).
   *
   * @needs-device-test
   */
  deleteKey(alias: string): Promise<boolean>;

  /**
   * Ký `dataHex` (bytes đã hex-encode, ĐÃ canonical hoá bởi tầng gọi —
   * xem PHOENIXKEY SCHEMA BOUNDARY ở đầu file) bằng khoá private dưới
   * `alias`. Nếu khoá được sinh với `requireBiometric = true`, lệnh
   * này trigger prompt sinh trắc (`promptTitle`/`promptSubtitle` hiển
   * thị trên dialog OS) trước khi enclave thực hiện ký.
   *
   * ── HỢP ĐỒNG KÝ (Phoenix xác nhận 2026-07-16 — 5 ràng buộc BIND) ─────
   * Để chữ ký khớp verifier Phoenix (`verifier.ts:141`
   * `p256.verify(sig, sha256(msg), pub)`):
   *   1. Đường cong = **P-256 (secp256r1)** cho HW_Key (KHÔNG Ed25519 —
   *      Ed25519 là TAAD_Key on-chain, khác khoá).
   *   2. Output = **compact 64-byte `r‖s` hex, KHÔNG DER.** Keystore native
   *      iOS/Android mặc định trả DER → **PHẢI convert sang compact**
   *      (điểm gãy hay gặp nhất — verifier `@noble/curves p256` mong compact).
   *   3. Băm = **ECDSA-SHA256** nội bộ trong keystore: `dataHex` là
   *      **canonical bytes THÔ** (message Phoenix trao đã canonical hoá),
   *      keystore tự `sha256` bên trong. Keystore KHÔNG canonicalize,
   *      KHÔNG băm sẵn phía caller.
   *   4. Domain-separation (nếu có) đã nằm TRONG canonical JSON do Phoenix
   *      dựng — keystore KHÔNG nhận `domainTag`, KHÔNG tự ghép nhãn.
   *   5. **low-S canonical** (chống malleability) — keystore ép low-S
   *      trước khi trả.
   * ───────────────────────────────────────────────────────────────────
   *
   * @param alias Khoá dùng để ký.
   * @param dataHex Canonical bytes THÔ cần ký (hex) — Phoenix/tầng gọi đã
   *   canonical hoá; keystore tự ECDSA-SHA256 nội bộ (ràng buộc #3).
   * @param promptTitle Tiêu đề dialog sinh trắc (text người-đọc — do
   *   tầng UI platform truyền vào, KHÔNG hard-code trong core).
   * @param promptSubtitle Phụ đề dialog sinh trắc (tuỳ chọn).
   * @returns Chữ ký **compact 64-byte `r‖s` hex, low-S** (ràng buộc #2,#5).
   * @throws khi không có khoá (harvest: `E_NO_KEY`), init ký lỗi
   *   (harvest: `E_SIGN_INIT`), lỗi sau xác thực (harvest:
   *   `E_SIGN_AFTER_AUTH`), user huỷ (harvest: `E_USER_CANCELED`), hoặc
   *   khoá sinh trắc bị khoá do thử sai nhiều lần (harvest:
   *   `E_BIOMETRIC_LOCKOUT`).
   * @needs-device-test Bắt buộc test máy thật với sinh trắc thật (Face
   *   ID/Touch ID/vân tay Android) — không mock được BiometricPrompt/
   *   LAContext trên simulator một cách đáng tin.
   */
  sign(
    alias: string,
    dataHex: string,
    promptTitle: string,
    promptSubtitle?: string,
  ): Promise<string>;
}
