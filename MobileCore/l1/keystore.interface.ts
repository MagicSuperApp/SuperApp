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
 * ký digest* (Android Keystore secp256r1 / iOS Secure Enclave P256).
 * Việc canonicalize payload trước khi lấy `dataHex` để truyền vào
 * `sign()` là việc của TẦNG GỌI (app/platform), KHÔNG phải của
 * KeystoreEngine — engine chỉ ký bytes đã canonical hoá sẵn.
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

/** Kết quả sinh cặp khoá — publicKeyHex là uncompressed EC point (0x04...). */
export interface KeystoreKeypairResult {
  alias: string;
  publicKeyHex: string;
}

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
   * @param alias Định danh khoá trong keystore (per-app, per-user).
   * @param requireBiometric Gate ký bằng sinh trắc học.
   * @throws khi alias đã tồn tại (harvest: `E_KEY_EXISTS`), hoặc keygen
   *   thất bại (harvest: `E_KEYGEN_FAILED`).
   * @needs-device-test Cần chạy trên máy thật có Secure Enclave/StrongBox
   *   thật — simulator/emulator không đại diện hành vi enclave.
   */
  generateKeypair(alias: string, requireBiometric: boolean): Promise<KeystoreKeypairResult>;

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
   * @param alias Khoá dùng để ký.
   * @param dataHex Bytes cần ký, dạng hex string (đã canonical hoá).
   * @param promptTitle Tiêu đề dialog sinh trắc (text người-đọc — do
   *   tầng UI platform truyền vào, KHÔNG hard-code trong core).
   * @param promptSubtitle Phụ đề dialog sinh trắc (tuỳ chọn).
   * @returns Chữ ký ECDSA dạng hex (DER hoặc raw r||s tuỳ native — ghi
   *   rõ định dạng khi hiện thực, PHASE-3 phải khớp verifier phía server).
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
