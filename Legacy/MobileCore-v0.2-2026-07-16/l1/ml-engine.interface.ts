/**
 * MobileCore L1 — ML inference engine CONTRACT (interface only).
 *
 * NO native code lives here. Mỗi method là chữ ký cho native module
 * (TFLite interpreter iOS/Android) hiện thực ở PHASE-3. Xem
 * `MobileCore/CONVENTIONS.md` §1 — L1 = interface only.
 *
 * ── HIỆN TRẠNG NATIVE (ghi để PHASE-3 không lặp lại lỗi) ────────────────
 * Harvest từ `orilife-mobile-app@claude/surface-data-collection`
 * `ios/LocalPods/ScannerModule/Core/Detection/YOLOTFLiteRunner.swift`:
 *   - `loadModel()` (dòng 75) build `Interpreter.Options()` KHÔNG gắn
 *     delegate nào → chạy CPU-only.
 *   - Dòng 91-94: comment thật trong code —
 *       "// Try ANE delegate first (fastest on Apple Silicon)"
 *       "// ANE delegate not directly available via TFLite Swift public API"
 *       "// Falls back to default GPU/CPU"
 *     nhưng KHÔNG có nhánh code nào thật sự gắn GPU delegate — đây là
 *     dead-code/comment-only, hành vi thực = CPU-only mọi trường hợp.
 *   - Model registry hiện là `enum ModelType { case tree, fruit }` với
 *     `modelFileName` hardcode string literal — KHÔNG phải registry
 *     động (MOBILE-CORE-STANDARD.md §2 E2 yêu cầu registry ĐỘNG đa
 *     platform, thay hardcode tree/fruit).
 * → `selectDelegate()` dưới đây là interface CHO PHASE-3 sửa (chọn
 *   GPU/NNAPI/ANE thật hoặc fallback CPU tường minh) — KHÔNG phải mô
 *   tả hành vi hiện có (hiện tại luôn trả `'cpu'` bất kể tham số).
 * `loadModel(modelName)` nhận `modelName` là KEY registry ĐỘNG (không
 * phải `ModelType` enum cứng) — PHASE-3 hiện thực registry tra
 * modelName → file .tflite, KHÔNG hardcode như bản harvest.
 * ──────────────────────────────────────────────────────────────────────
 */

/** Delegate tính toán khả dụng cho 1 lần infer. */
export type MlDelegate = 'cpu' | 'gpu' | 'ane' | 'nnapi';

/** Tensor thô — buffer + shape, không gắn ý nghĩa domain (bbox/mask...). */
export interface MlTensor {
  data: Float32Array;
  shape: readonly number[];
}

/** Handle của 1 model đã load — đủ thông tin để tầng gọi tự dựng input tensor đúng shape. */
export interface MlModelHandle {
  modelName: string;
  inputShape: readonly number[];
  outputShapes: readonly (readonly number[])[];
  /** Delegate thực sự đang chạy sau khi load (không phải delegate được yêu cầu). */
  activeDelegate: MlDelegate;
}

/**
 * Contract native cho việc load model TFLite + chạy inference 1 khung.
 * KHÔNG bao gồm tiền/hậu xử lý domain (letterbox, NMS, decode YOLO...)
 * — đó là logic E2 khác, ngoài phạm vi 3 method tối thiểu này theo
 * yêu cầu build hiện tại.
 */
export interface MlEngine {
  /**
   * Load model từ registry theo `modelName` (KEY động — PHASE-3 định
   * nghĩa registry tra tên → đường dẫn `.tflite` trong bundle, KHÔNG
   * hardcode enum như bản harvest OriLife). Cấp phát tensor
   * (`allocateTensors`) xảy ra trong lệnh gọi này.
   *
   * @param modelName Key registry (ví dụ: "tree-detector-v1"), KHÔNG
   *   phải tên file cứng.
   * @throws khi không tìm thấy model trong bundle/registry, hoặc
   *   allocate tensor thất bại.
   * @needs-device-test Cần máy thật để xác nhận resolve bundle path
   *   (CocoaPods embed framework bundle khác `Bundle.main`) và
   *   allocateTensors không crash trên thiết bị low-RAM.
   */
  loadModel(modelName: string): Promise<MlModelHandle>;

  /**
   * Chạy 1 lần inference (interpreter.invoke) trên `inputTensor` đã
   * được tầng gọi tiền xử lý đúng shape của model đang load. KHÔNG
   * thread-safe — native phải tự khoá (harvest: `NSLock` quanh
   * copy-input → invoke → read-output) nếu có warmup chạy song song
   * frame trực tiếp.
   *
   * @param inputTensor Input đã đúng `inputShape` của model đang load.
   * @returns 1 tensor cho mỗi output index của model (thứ tự khớp
   *   `outputShapes` trong `MlModelHandle`).
   * @throws khi copy input, invoke, hoặc đọc output thất bại.
   * @needs-device-test Cần máy thật — hiệu năng CPU-only trên
   *   simulator không đại diện; đồng thời cần verify không crash khi
   *   gọi song song `warmup()`.
   */
  infer(inputTensor: MlTensor): Promise<MlTensor[]>;

  /**
   * Chọn delegate tính toán cho model đang/sẽ load. `preferred` là gợi
   * ý (best-effort) — native PHẢI trả lại delegate THỰC SỰ được gắn
   * (có thể khác `preferred` nếu thiết bị không hỗ trợ), KHÔNG được
   * âm thầm claim GPU/ANE trong khi thực chạy CPU (đây chính là lỗi
   * hiện có ở bản harvest — xem ghi chú đầu file).
   *
   * @param preferred Delegate mong muốn; bỏ trống = để native tự chọn
   *   tốt nhất khả dụng.
   * @returns Delegate thực sự sẽ dùng cho lần `loadModel`/`infer` kế tiếp.
   * @needs-device-test Delegate GPU/ANE/NNAPI chỉ verify được trên
   *   phần cứng thật tương ứng (không có trên simulator/emulator).
   */
  selectDelegate(preferred?: MlDelegate): Promise<MlDelegate>;
}
