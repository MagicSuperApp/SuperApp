# MobileCore Standard — Lõi chuẩn năng-lực-xử-lý thiết bị mobile

> **Cấp:** L1 Platform — Ecosystem-wide Standard (đồng cấp INTEGRATION-STANDARD).
> **Status:** v0.2 — 2026-07-16. Khớp code v0.2 (261 test L0 thật: geo 39 / capture 48 / detect 38 / ml 43 / net 30 / resource 17 / sync 46). Dẫn xuất từ hội đồng 7 agent (E1–E4 liệt kê + optimizer placement + critic MECE + adversary), đã qua council-gate + phản biện đối kháng + vòng rà-soát 3 agent khớp/nhất-quán/lỗ-hổng.
> **Owner:** Aladin (founder). Interface-contract giữ bởi SuperApp-as-platform; tầng danh tính giữ bởi PhoenixKey.
> **Quan hệ:** tuân INTEGRATION-STANDARD (INV-1, §0.4, §1.3, §3.1). Khi mâu thuẫn, invariant (INV-1) thắng.
>
> **Thay đổi v0.1→v0.2 (1 dòng):** sửa nhãn tầng E2 (phần lớn `l0/ml` là L0 TS thuần, không L1) + bổ sung năng lực ống-kính v0.2 (orientation/stability/sector/crop/feather/proto-mask) và net/sync bền (token-timeout/unwrap opt-in/4-trạng-thái-auth/CSPRNG idempotency); thêm danh mục MÃ LỖI, §4.5 bất-biến-dùng-đúng, §7 roadmap 3 nhóm, §8 build-gate; gắn [NEEDS-EVIDENCE] cho quan hệ khoá E1 + domain-separation keystore.

---

## 0. Mục đích & phạm vi

Một lõi DUY NHẤT cung cấp **năng lực XỬ LÝ của thiết bị mobile** cho mọi platform + app ngoài tái dùng — thay vì mỗi platform tự viết lại. Mọi platform cần dùng bất cứ gì từ mobile (sinh trắc, ống-kính/ML, định vị, đồng bộ...) hoặc tối ưu để tích hợp lên app PHẢI tuân lõi này.

**TRONG phạm vi:** năng lực XỬ LÝ trên thiết bị (chạy model trên khung hình, khớp mẫu sinh trắc, ký enclave, toán GPS/IMU, đồng bộ offline...).
**NGOÀI phạm vi:** (a) UI/UX; (b) phần cứng thiết bị biên (camera/cảm biến chip — thuộc chuẩn thiết-bị-biên riêng); (c) logic nghiệp vụ platform (nhận-diện-cây, chấm-công...) — lõi chỉ cung NĂNG LỰC, platform ghép nghiệp vụ.

**Nguyên tắc phân biệt cốt lõi:** lõi cung *năng lực xử lý*, KHÔNG cung *cảm biến*. Ví dụ: camera (phần cứng) ngoài phạm vi; nhưng chạy YOLO trên khung hình đã chụp = trong phạm vi.

---

## 1. Mô hình 2 TẦNG (nguyên tắc kiến trúc bất biến)

Mỗi năng lực tách làm 2 tầng theo bản chất kỹ thuật — KHÔNG theo platform:

| Tầng | Bản chất | Đóng gói | Dedupe được? |
|---|---|---|---|
| **L0 — Logic/interface** | Thuần tính toán, không chạm phần cứng | SDK **TS thuần** (test Jest, chạy mọi runtime); Flutter dùng qua port/FFI | ✅ viết 1 lần dùng chung tuyệt đối |
| **L1 — Engine** | Buộc phần cứng/OS (enclave, NPU, driver) | native-module (TurboModule interface + Swift pod / Kotlin) | ❌ chỉ hợp nhất INTERFACE; engine viết per-OS |

Ràng buộc: **contract L0/L1 phải ngôn-ngữ-agnostic**, KHÔNG RN-specific (PhoenixKey-Core là Flutter — chỉ tái dùng L0 + interface, không nuốt TurboModule).

**Cặp L0-producer ⟷ L1-sensor (cụm capture-motion):** toán chuyển-động (fusion ma-trận-xoay→góc, variance đo đứng-yên) là **L0 thuần** (`l0/ml/orientation.ts`, `l0/ml/stability.ts`); nguồn cảm biến thô (`getRotationMatrix`/`getAcceleration`/`subscribe`) là **L1 native** (`l1/motion.interface.ts` `MotionEngine`). L1 CHỈ cấp số thô, MỌI toán ở L0 — không lặp lại fusion/variance ở native. Đây là nửa còn thiếu của hợp đồng: L0 ml là producer toán, MotionEngine là nguồn cảm biến cấp đầu vào cho nó.

---

## 2. Bốn nhóm năng lực (MECE)

Ranh giới MECE (critic chốt): token TẠO/LƯU thuộc E3 (E1 chỉ trả chữ ký); phép khoảng-cách địa lý GỌI LẠI haversine E4 (không cài lại); per-reading attestation KÝ ở E1 nhưng input-frame do E2, input-toạ-độ do E4.

**RULE phân nhóm MECE — phân theo NGUỒN SINH tín hiệu, KHÔNG theo consumer.** Cụm **capture-motion** (`l0/ml/orientation.ts`, `stability.ts`, `sector.ts`, `heading.ts`) bản chất là tín-hiệu **chuyển-động (E4-motion)**, NHƯNG hiện đồng-vị-trí với `l0/ml` vì phục vụ DUY NHẤT luồng chụp ống-kính. Quyết-định-hoãn có kiểm soát (Aladin veto được): **KHÔNG dời file lúc này** — tránh khuấy PR #51 đang review + YAGNI. Cảnh báo config-coupling: `stability.ts` lấy ngưỡng qua `getModelConfig` của registry ML (`stabilityWindowSize`/`stabilityThreshold`) → đây là **điểm-tách tương lai**: khi có consumer motion phi-ML (vd giữ máy ổn định quét NFC) → tách `l0/motion/` + tách config riêng.

### E1 — Danh tính & mật mã · tầng chủ đạo **L1 (native sâu)** · chủ **PhoenixKey**
Sinh khoá HW non-exportable HW_Key **P-256/secp256r1** (Android Keystore / iOS Secure Enclave) = khoá **DID-auth**; ký gated-sinh-trắc ECDSA (BiometricPrompt.CryptoObject / LAContext) → compact 64B `r‖s` low-S (không DER); **khớp mẫu sinh trắc** (Face/Touch ID — dù qua OS API hay model, LUÔN thuộc E1); canonical-serialize trước ký; đọc pubkey (SEC1) / kiểm tồn tại / xoá-wipe khoá; ký challenge DID; Master_KEK + BIP39 mnemonic; HKDF derive; **Ed25519 ký TAAD** (`taad_sign_ed25519`) = khoá on-chain RIÊNG (khác HW_Key); AES-256-GCM wrap KEK; PBKDF2-300k Device_KEK từ PIN; ECDSA P-256 verify low-S; BLAKE2b sinh DID; ký tx Cardano.

**✅ Quan hệ 2 khoá (Phoenix chốt 2026-07-16):** khoá enclave **P-256** gate-sinh-trắc (`generateKeypair('did-identity')`) CHÍNH LÀ khoá **DID-auth** — server verify bằng `p256.verify(sig, sha256(msg), pub)` (`verifier.ts:141`). **Ed25519** (`taad_sign_ed25519`) là **TAAD_Key ký giao dịch ON-CHAIN**, khác khoá & khác đường-cong, KHÔNG thuộc keystore. → `publicKeyHex` từ `generateKeypair('did-identity')` = pubkey P-256 dùng verify DID-auth (đúng); KHÔNG dùng nó cho chữ ký on-chain Ed25519.

_Đề xuất (chưa code — KHÔNG đóng khung package tới khi có mã):_ per-reading attestation (ký frame lúc chụp); device integrity attestation (Play Integrity / App Attest).
**Bất biến (SEMANTIC):** `canonicalize` + DID/token **schema** đồng-version với signer & authority DID — nghĩa mật-mã (canonicalize + DID/token schema + domain-separation) KHÔNG rời PhoenixKey (lệch version = chữ ký hợp lệ hoá vô hiệu; schema nơi khác = nguồn DID thứ 2, phá INV-1). Xem §3 [I3] tách bạch nghĩa SEMANTIC vs vị-trí-file-interface.

### E2 — Media & ML · tầng **2 lớp: L0 toán thuần + L1 engine** · chủ **SuperApp-core**
**SỬA NHÃN TẦNG (v0.2):** nói "E2 chủ đạo L1" là SAI — phần lớn `l0/ml` là **L0 TS thuần** (test Jest, chạy mọi runtime). E2 có 2 tầng rạch ròi:

**L0 (toán thuần — `l0/ml/*`, KHÔNG chạm TFLite/pixel buffer):**
- Hình-học/decode: `computeLetterbox` / `unLetterbox` / `letterboxCoord`; `decodeYolo` (un-letterbox + lọc kích-thước/tỉ-lệ/lề); `decodeProtoMasks` (suy bố-cục **NHWC/NCHW từ SHAPE tensor**, không từ dữ-liệu); `iou` / `nms`.
- Mask: `sigmoid` / `reconstructMask` / `resizeMaskBilinear` (bilinear) / `thresholdMask` (cứng, `>` nghiêm) / `featherMask` (mềm 2-ngưỡng inner=0.6 / outer=0.3, alpha gradient) / `mapBoxToProto` (map bbox ảnh gốc → lưới proto **QUA không-gian letterbox** — bỏ bước này thì ảnh portrait lệch ~35 ô proto) / `applyMaskToCrop` (xoá nền); `isValidMask` / `assertValidMask`.
- Crop: `cropRectForBox` / `unionBox` / `cropRectForDetections` / `cropRectForModelBox` (padding 30% clamp 30–120px).
- Tracking: `smoothBox` (EMA) / `trackDetections` (match GLOBAL theo IoU giảm dần — KHÔNG greedy-theo-hàng, chống hoán-đổi danh-tính → gắn ảnh nhầm cây) / `filterConfirmed` / `stepTracker` (`id`=`t<n>` tất-định, `isConfirmed` khi count ≥ `trackerConfirmFrames`).
- Blur: `blurVariance` (Laplacian kernel 3×3) / `isBlurry` / `sharpnessScore`.
- Gate: `gatePass` (staleness `gateStalenessMs`=800ms → rơi về stillness) / `requireTarget`.
- Cụm **capture-motion** (bản chất E4-motion, đồng-vị-trí — xem RULE MECE trên): `computeOrientationFromRotationMatrix` (sensor-fusion ma-trận-xoay 9/16 phần-tử → heading/pitch/roll, clamp `[-1,1]` trước `asin`) / `accelOnlyTilt` (fallback thiếu magnetometer) / `lowPassAngleFilter` (EMA **wrap-aware** 359°→1°); `createStabilitySampler` (variance |accel| cửa-sổ 15 mẫu, đo đứng-yên) / `sampleVariance`; `headingToSector` / `sectorCenter` / `sectorContainsHeading` (dung-sai biên 5° chống lật cung khi rung) / `guidanceToTarget` (CW/CCW xoay ngắn nhất) / `nearestUncapturedSector` / `remainingSectors`; `decideSectorCapture` (quyết-định-1-frame STATELESS — SESSION FSM là của consumer, xem §4.5).
- Config: `getModelConfig` / `DEFAULT_MODEL_CONFIG` (`modelName` CHỈ chọn ngưỡng/kích-thước, KHÔNG kích inference).

**L1 (engine per-OS — `l1/ml-engine.interface.ts`, `l1/camera.interface.ts`, `l1/motion.interface.ts`):** load TFLite + allocate tensor; inference 1 khung + warmup; chọn compute delegate GPU/NPU/CPU-fallback; đọc pixel buffer / rotation vector / accelerometer thô. Camera-engine THI HÀNH con số frame-skip do policy E4 truyền (KHÔNG tự đọc `thermalState`).

_Đề xuất:_ embedding on-device (DINO/SuperPoint); **CoreML/Metal delegate iOS** (hiện ANE chưa nối → chạy CPU-only, góp phần chậm/nóng); batch inference; YUV→RGB + rotate-bitmap (L1-interface); model-registry nội-dung từng species/thiết-bị.

### E3 — Dữ liệu / đồng bộ / mạng · tầng chủ đạo **L0 (cross-platform TS)** · chủ **SuperApp-core**
SQLite per-user + CRUD; durable outbox + vòng lặp `drain()` + khoá re-entrancy (`isProcessing`) + async-mutex index (chống lost-update enqueue↔drain); retry-backoff (`computeBackoffMs` = base·2^n, BASE=5s / MAX=5min / MAX_RETRY=5) + dead-letter (`sync/permanent` | `sync/retry-exhausted`, TTL purge 7 ngày) + xử orphan 'sending' + `drainNow()` drain-on-reconnect; dedup-cache TTL + địa lý (window 5min / 8m / TTL 30 ngày / max 100/group — gọi haversine E4); API client `createHttpClient` phân loại lỗi (net/*); gắn token; timeout/abort; **401 refresh single-flight** (chặn `/auth/*` bằng `startsWith`, `disableAutoRefresh` cho backend không refresh-token vd PhoenixKey); 429 retry-after; multipart upload; lưu token nguyên tử; vòng đời DB theo phiên.

**Năng lực v0.2 mới:**
- **`withTokenTimeout`** — bọc `TokenProvider.getToken`/`refreshToken` (do platform inject, có thể TREO) bằng timeout riêng `tokenTimeoutMs`=15s; hết giờ → `net/timeout` (retryable) thay vì đóng băng `drain()` vĩnh viễn.
- **unwrap tách OPT-IN** — `defaultUnwrap` = **PASS-THROUGH** an toàn (KHÔNG đoán envelope, không ném theo hình-dạng); backend có envelope PHẢI truyền tường minh `phoenixKeyUnwrap` (`{code,message,result}`, code≠1000 → ném `net/validation`) hoặc `nestJsUnwrap` (`{data,message,statusCode}`).
- **FormData multipart passthrough** — không stringify, xoá Content-Type thiếu `boundary=` để RN tự set (chống upload ảnh lỗi câm).
- **4-trạng-thái auth net↔sync** — `net/auth-transient` → sync `'blocked-on-auth'` (backoff riêng `authBlockCount`, KHÔNG dead-letter); `net/unauthorized` → `'auth-expired'` (terminal, giữ dữ liệu); `unblockAuth()` = tiêu-chí-thoát tường minh (về 'pending').
- **CSPRNG `genId`** — `defaultGenId` dùng `crypto.randomUUID`/`getRandomValues`, TUYỆT ĐỐI KHÔNG `Math.random` (id yếu → đụng → mất write lặng); thiếu cả hai → ném `sync/no-csprng`. 1 id dùng chung `transactionId` + `idempotencyKey`.
- **`buildSyncSend`** — bọc callback gửi để ÉP `idempotencyKey`=`item.idempotencyKey` trước khi tới net (đóng end-to-end đường idempotency).

_Đề xuất:_ cầu DID challenge/sign/verify (điều phối HTTP; ký ở E1; **tạo/lưu token ở đây**); mã hoá bản ghi cục bộ (khoá E1 cấp — ProofChat secure-storage, mở rộng keystore encrypt at-rest); per-field CRDT (hiện thực tế = lww); upload chunked/resumable; [NEEDS-EVIDENCE] bù lệch giờ, xử lý push-payload, tìm kiếm/chỉ mục cục bộ, nén phi-ảnh.

### E4 — Định vị/chuyển động & quản trị tài nguyên · tầng chủ đạo **L0 + chính sách native** · chủ **SuperApp-core**
Haversine; diện tích/chu vi/point-in-polygon/khoảng-cách-cạnh/tự-cắt đa giác; phân loại tốc độ; accuracy-gate; distance-gate; walk-away auto-stop; GPS-lost timeout; validate polygon; cap MAX_VERTICES; throttle distanceFilter; vòng đời watch; iOS GPS auto-pause (.fitness); camera auto-power-off idle; frame-rate throttle/skip (CHÍNH SÁCH — E4 sở hữu; lệnh gọi model ở E2); pause/resume theo lifecycle; WorkManager thực thi nền.
**Đã build v0.2 (`l0/resource`):** `decideThermalThrottle` (nominal/fair=1×, serious=2×, critical=4×) + `decideFrameSkip`; `decideWatchPause` (idle `WATCH_PAUSE_IDLE_MS`=60s → 'pause', sửa lỗi nóng máy field); `shouldAttemptRefresh` (cooldown `REFRESH_FAIL_COOLDOWN_MS`=30s, chỉ cooldown khi lỗi-server/session, KHÔNG khi user-cancel). Cụm capture-motion (heading/pitch/roll qua `orientation.ts`) đã build nhưng đồng-vị-trí `l0/ml` (xem RULE MECE §2).
_Đề xuất / GAP:_ thống nhất distanceFilter 1 tham số; wake-lock/foreground-service/thread-pool config; gesture-trigger (shake/cutting/movement-stopped) — thuật toán L0 tách được nhưng ngưỡng nguồn `Config.kt` là TEST-HACK (xem §7 Nhóm 1).

---

## 2.1 Danh mục MÃ LỖI (`l0/errors.ts` — `MobileCoreError.code`, ổn định, phân nhóm domain)

`MobileCoreError` mang `code` (không đổi text để phân loại) + `retryable` + `detail` máy-đọc (redact khoá nhạy cảm). Text người-đọc để tầng UI platform (L0 KHÔNG chạm UI).

| Nhóm | Mã | Ý nghĩa / retryable |
|---|---|---|
| **net (E3)** | `net/timeout` | fetch/token quá giờ · retryable |
| | `net/aborted` | caller huỷ (AbortSignal) · KHÔNG |
| | `net/offline` | hỏng tầng mạng thật (DNS/mất sóng) · retryable |
| | `net/unauthorized` | phiên THẬT hết / credential vô hiệu · KHÔNG (terminal) |
| | `net/auth-transient` | refresh chết TẠM THỜI (5xx/mạng) · retryable, sync KHÔNG dead-letter |
| | `net/conflict` | 409 (idempotency trùng / bản đã tồn tại) · KHÔNG |
| | `net/rate-limited` | 429 (kèm `retryAfterSeconds`) · retryable |
| | `net/validation` | 4xx khác / envelope lỗi (PhoenixKey code≠1000) · KHÔNG |
| | `net/server` | 5xx · retryable |
| | `net/unknown` | không phân loại được / unwrap ném lỗi lạ · KHÔNG |
| **sync (E3)** | `sync/permanent` | dead-letter lỗi vĩnh viễn (không retryable) |
| | `sync/retry-exhausted` | dead-letter cạn MAX_RETRY |
| | `sync/no-csprng` | thiếu CSPRNG (`crypto` không có randomUUID/getRandomValues) · KHÔNG |
| **geo (E4)** | `geo/invalid-polygon` | đa giác không hợp lệ (tự-cắt / < 3 điểm / quá MAX_VERTICES) |
| | `geo/gps-lost` | GPS xấu quá `GPS_BAD_HARD_TIMEOUT_MS` (5 phút) |
| **ml (E2)** | `ml/invalid-mask` | mask rỗng/all-zero/NaN, lệch shape proto, inner≤outer feather |
| | `ml/invalid-input` | ma-trận-xoay < 9 phần-tử, `computeLetterbox` kích-thước ≤0 |
| | `ml/no-target` | `requireTarget` không có detection nào |

Quy ước: **thêm mã mới ở CUỐI nhóm, KHÔNG đổi mã cũ** (mã là hợp đồng net↔sync + consumer).

---

## 3. Đặt ở đâu & sở hữu

- **Tầng danh tính (E1) → PhoenixKey** (silent module, INTEGRATION-STANDARD §3.1/§0.4). **[I3] Tách 2 nghĩa của "ownership" (hết mâu thuẫn §3↔§5):**
  - **(a) SEMANTIC** (canonicalize + DID/token schema + domain-separation + digest scheme) → PhoenixKey, **KHÔNG rời**. "SuperApp KHÔNG re-own khoá" nghĩa là KHÔNG re-own nghĩa mật-mã này — KHÔNG tự định nghĩa lại canonicalize / DID-token schema / digest scheme (domain-separation nằm trong canonical JSON Phoenix dựng).
  - **(b) Vị-trí file INTERFACE** — `l1/keystore.interface.ts` ĐƯỢC host tại `MobileCore/l1` (cùng chỗ các L1 interface khác), MIỄN LÀ chỉ khai *chữ ký* sinh-khoá-HW + ký-digest và KHÔNG định nghĩa lại semantic (a). Native glue là PER-APP; canonicalize payload trước khi lấy `dataHex` là việc TẦNG GỌI, không phải KeystoreEngine.
- **Device-processing core (E2/E3/E4) → SuperApp-as-platform** maintain interface-contract.
- **App tích hợp thẳng platform (không qua SuperApp UI):** dùng lõi qua package versioned (`import`), KHÔNG kéo SuperApp shell — đúng silent module (không khai entrypoint/route). Lưu ý: package ≠ độc lập tổ chức (vẫn phụ thuộc nhịp release owner).
- **Flutter (PhoenixKey-Core):** tái dùng L0 + interface/spec, KHÔNG dùng lại engine native.

---

## 4. Điều kiện GOVERNANCE bắt buộc (adversary)

1. `canonicalize` + DID/token schema KHÔNG rời PhoenixKey; device-core không đụng chữ ký.
2. KHÔNG đưa năng lực CHƯA-CÓ-MÃ (capability_router, per-reading attestation) vào ranh giới package tới khi có mã thật.
3. **Chỉ tách repo lõi versioned + CI 3-target (npm+pod+maven) khi có consumer RN thật thứ 2 ngoài SuperApp shell.** Trước đó: giữ modular-monolith, ranh giới bằng thư mục/manifest, **cập-nhật-nguyên-tử** (đổi interface → grep toàn callers + sửa đồng thời).
4. Nếu tách: PHẢI chỉ định RÕ người gác version-skew interface L0/L1/native — nếu không seam tái tạo drift INV-1 đang chống.

---

## 4.5 Bất biến DÙNG-ĐÚNG cho consumer (hợp đồng phải biết kẻo dùng sai)

Mỗi mục = 1 hợp đồng + hậu quả nếu sai. Core cố ý thuần/stateless ở nhiều chỗ → consumer PHẢI ráp đúng.

1. **`referenceHeading` = heading lúc MỞ PHIÊN** (cung tương-đối, mặc định 0 = neo Bắc). OriLife PHẢI truyền heading lúc mở phiên vào `decideSectorCapture`/`headingToSector`. Quên truyền → cung neo Bắc, ép user quét qua Bắc, **cung sai LẶNG LẼ** (không crash).
2. **SESSION FSM 8-hướng là của CONSUMER.** Core (`decideSectorCapture`) chỉ trả quyết-định-1-frame STATELESS; tập `capturedSectors`, `captureCooldownMs`=1500, advance/skip/complete do OriLife giữ. Coi core là state-machine → chụp dồn / không cooldown.
3. **`trackerConfirmFrames`=5 (AR overlay) ≠ `stableFrames`=3 (processing)** — 2 ngưỡng KHÁC mục đích (xác-nhận-tracker chống chụp trùng vs ổn-định-pipeline-xử-lý). Dùng nhầm 1 cho cả hai → hoặc chụp trùng, hoặc trễ xác nhận.
4. **PhoenixKey client PHẢI truyền `unwrap: phoenixKeyUnwrap`** — default nay là PASS-THROUGH. Không truyền → lỗi ứng-dụng ẩn trong HTTP 200 (code≠1000) bị coi là thành công → **tái tạo lỗi nuốt-lỗi-HTTP-200**.
5. **Business-idempotency THẬT cần caller truyền `transactionId` BỀN** (derive tất-định từ hành-động user, vd hash `{userId, formId, nội-dung}`). `genId` CHỈ là fallback CSPRNG: mỗi enqueue sinh id MỚI → app crash SAU enqueue TRƯỚC khi lưu id, user bấm lại → **double-submit**. Truyền transactionId ổn định → lần 2 trùng id → guard bỏ bản 2 (đúng).
6. **`TokenProvider` phải tự lo không-treo.** net ép `tokenTimeoutMs`=15s quanh `getToken`/`refreshToken`; quá giờ → `net/timeout`. Provider treo mà không có timeout riêng → đóng băng toàn outbox (đã chống, nhưng provider vẫn nên nhanh).
7. **net↔sync auth 4-trạng-thái (BẤT BIẾN chống-mất-dữ-liệu).** `net/auth-transient` → sync `'blocked-on-auth'` (backoff riêng `authBlockCount`, **KHÔNG dead-letter**); `net/unauthorized` → `'auth-expired'` (terminal, **giữ dữ liệu**, chờ `unblockAuth()`). Consumer coi auth-transient là lỗi thường → dead-letter → **mất write nông dân offline**. `drainNow()` (reconnect) TUYỆT ĐỐI không đụng backoff nhánh auth.
8. **`smoothingAlpha` default 0.3 KHÔNG phải production** (iOS live = 0.15, mượt hơn). `smoothBox`/`trackDetections` nhận α tham số — consumer production PHẢI truyền α thật của họ, đừng ngầm dùng 0.3.

---

## 5. Chỉ thị build (thư mục `SuperApp/MobileCore/`)

Aladin chốt: **xây MỚI trong `SuperApp/MobileCore/`, đúng chuẩn từ đầu** — hơn sửa+gộp nhánh rải rác.
- Rebuild năng lực từ TẤT CẢ nhánh mobile hiện có (orilife-mobile-app các `claude/*`, orilife-mobile-core @ review-mvp, SuperApp modules) về MỘT bản nhất quán theo §1–§4; **loại bỏ code cũ/lỗi thời/mock**.
- **Cây thư mục THỰC TẾ v0.2:**
  - `l0/` (TS thuần, test Jest): `errors.ts` · `types.ts` (hợp-đồng đóng-băng) · `geo/` · `resource/` · `net/` · `sync/` · `ml/` (`config` `nms` `letterbox` `mask` `tracking` `crop` `blur` `gate` `frameClassifier` + cụm capture-motion `orientation` `stability` `sector` `heading`).
  - `l1/` (CHỈ interface TS, `@needs-device-test`): `keystore.interface.ts` · `ml-engine.interface.ts` · `sqlite.interface.ts` · `location.interface.ts` · `camera.interface.ts` · `motion.interface.ts`.
  - **`l0/crypto-serialize` CỐ Ý KHÔNG build** — canonicalize + DID/token schema thuộc PhoenixKey (single-source), dựng lại ở đây = nguồn DID thứ 2, phá INV-1 (giải điểm I4). MobileCore chỉ khai `KeystoreEngine.sign(dataHex)` ký canonical bytes Phoenix trao, KHÔNG serialize.
- Mỗi năng lực ship kèm test thật (Jest cho L0: 261 test đang xanh; test máy cho L1). Không nhãn "xong" nếu chưa test thật (§8 BUILD-GATE).
- **Trạng thái khởi động (đã xong):** E4 quản-trị-tài-nguyên (`l0/resource`: thermal throttle/frame-skip + watch idle-pause + refresh cooldown) ĐÃ build + test — vừa lập chuẩn vừa sửa lỗi nóng máy field. E2 media-ml (L0) + E3 net/sync (L0) cũng đã build v0.2.

---

## 6. Provenance & NEEDS-EVIDENCE (trung thực nguồn)
- Bảng §2 rút từ code thật (file:line trong docstring mỗi module + `_Agents/topics/mobile-core-standard.md`). [ĐỀ XUẤT] = suy từ nguyên lý, chưa ai dùng.
- CHƯA đọc repo PhoenixKey-SDK → chưa xác nhận "L0 crypto agnostic (@noble/curves)" tái dùng được vs bản native Keystore đang dùng.
- capability_router (định tuyến nhiệt/pin) tồn tại ở orilife-core NHƯNG chưa nối mobile.
- mergePolicy thực tế = `lww`, không phải per-field-CRDT.
- **✅ ĐÃ ĐÓNG — keystore/quan-hệ-khoá (Phoenix xác nhận 2026-07-16, inbox `Phoenix-4items`):**
  1. **Quan hệ 2 khoá:** HW_Key **P-256** gate-sinh-trắc (`generateKeypair('did-identity')`) CHÍNH LÀ khoá DID-auth mà server verify bằng `p256.verify(sig, sha256(msg), pub)` (`verifier.ts:141`). **Ed25519** (`taad_sign_ed25519`) là **TAAD_Key on-chain RIÊNG**, khác khoá — KHÔNG thuộc keystore này.
  2. **`sign()` KHÔNG có `domainTag`** — domain-separation (nếu có) nằm TRONG canonical JSON do Phoenix dựng; keystore chỉ ký bytes canonical.
  3. **`dataHex` = canonical bytes THÔ** (Phoenix trao); keystore tự **ECDSA-SHA256** nội bộ (không băm sẵn phía caller).
  4. **Output = compact 64-byte `r‖s` hex, low-S, KHÔNG DER** (native mặc định DER → PHẢI convert — điểm gãy hay gặp nhất). Pubkey = SEC1 (chốt uncompressed 65B, publish cùng kiểu với `GET /identity/{did}/pubkey`).
  → keystore.interface.ts ĐÃ áp 5 ràng buộc này. **Còn mở:** contract `FaceCapture` cho Knowme (Phoenix cần để build face-2FA).

---

## 7. Roadmap (3 nhóm — bảng phân loại đã kiểm chéo)

| Nhóm | Hạng mục | Tầng | Nguồn / ghi chú |
|---|---|---|---|
| **1 — READY-INDEPENDENT** (build được, chưa build v0.2) | YUV→RGB + rotate-bitmap | L1-interface | nguồn `ImageProcessor.kt` |
| | model-registry ĐỘNG (mở rộng `getModelConfig`) | L0 | cơ chế đã có, thêm biến thể vào `MODEL_CONFIGS` |
| | ProofChat secure-storage (encrypt at-rest) | L1 | mở rộng keystore |
| | ⚠ gesture-trigger (shake/cutting/movement-stopped) | L0 | thuật toán tách được NHƯNG ngưỡng nguồn `Config.kt` là **TEST-HACK** (SENSOR_SHAKE 15→8, MOVEMENT 0.5→0.1) — **KHÔNG đóng băng**; cần số production thật HOẶC để ngưỡng làm THAM SỐ bắt buộc |
| **2 — interface-only chờ platform cấp nội dung** | model-registry nội dung từng species/thiết-bị | L0 config | OriLife / AladinWork cấp ngưỡng+model thật |
| **3 — BLOCKED-platform** (chưa build) | face-2FA Knowme | E1/Phoenix | `deviceAttestation` ai sở hữu chưa chốt |
| | Eye embedding / OCR | E2 | AladinWork/LampNet, chờ chốt TEE-tier |
| | ProofChat WS realtime | E3 | chờ event-contract |
| | embedding DINO/SuperPoint | E2 | chưa có model |
| | per-reading attestation + device-integrity | E1 | Phoenix; §4.2 CẤM đóng package khi chưa có mã |

---

## 8. BUILD-GATE — tiêu chí "xong"

Không có file "BUILD-GATE" riêng — tiêu chí neo về **`CONVENTIONS.md §4` (Test)**. Một năng lực chỉ được nhãn "xong" khi:
- Có test THẬT trong `<module>/__tests__/<name>.test.ts`: input→output cụ thể + ca biên (wrap-around, self-intersection, walk-away polygon lõm, 401 single-flight đồng thời, cooldown chỉ khi lỗi-server...). KHÔNG `expect(true)`/test rỗng.
- Chạy xanh: `npx jest MobileCore/l0/<module>` (v0.2: 261 test L0 xanh).
- L1 interface: mỗi symbol gắn `@needs-device-test`; "xong" phần interface ≠ "xong" native (native cần test máy thật, chưa tính vào 261).
- Verify bằng thực-thi (Forall §an-toàn-tri-thức): test pass là trọng-tài ngoài mô hình, thắng suy đoán nội bộ.

---
## Change Log
- **v0.2 (2026-07-16):** Khớp code v0.2 (261 test L0). Sửa nhãn tầng E2 (l0/ml là L0 TS thuần, không L1) + liệt kê năng lực ống-kính v0.2 (orientation/stability/sector/crop/feather/proto-mask NHWC-NCHW) và net/sync bền (withTokenTimeout / unwrap opt-in pass-through / FormData passthrough / 4-trạng-thái-auth / CSPRNG genId / buildSyncSend). Thêm §2.1 danh mục MÃ LỖI, §4.5 bất-biến-dùng-đúng cho consumer (8 điểm), §7 roadmap 3 nhóm, §8 build-gate. Chốt RULE MECE "phân theo nguồn-sinh tín-hiệu" cho cụm capture-motion (không dời file — quyết-định-hoãn có kiểm soát). Tách [I3] ownership SEMANTIC vs vị-trí-file-interface. Cập nhật §5 cây thư mục thực tế + `l0/crypto-serialize` cố ý không build (I4). Gắn [NEEDS-EVIDENCE]: quan hệ khoá P-256↔Ed25519 (E1) + 4 điểm domain-separation keystore (§6).
- v0.1 (2026-07-15): Khởi tạo từ hội đồng 7 agent. 4 nhóm năng lực MECE, mô hình 2 tầng L0/L1, đặt-ở-đâu + 4 điều kiện governance, chỉ thị build `MobileCore/`.
