# MobileCore Standard — Lõi chuẩn năng-lực-xử-lý thiết bị mobile

> **Cấp:** L1 Platform — Ecosystem-wide Standard (đồng cấp INTEGRATION-STANDARD).
> **Status:** DRAFT v0.1 — 2026-07-15. Dẫn xuất từ hội đồng 7 agent (E1–E4 liệt kê + optimizer placement + critic MECE + adversary), đã qua council-gate + phản biện đối kháng.
> **Owner:** Aladin (founder). Interface-contract giữ bởi SuperApp-as-platform; tầng danh tính giữ bởi PhoenixKey.
> **Quan hệ:** tuân INTEGRATION-STANDARD (INV-1, §0.4, §1.3, §3.1). Khi mâu thuẫn, invariant (INV-1) thắng.

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

---

## 2. Bốn nhóm năng lực (MECE)

Ranh giới MECE (critic chốt): token TẠO/LƯU thuộc E3 (E1 chỉ trả chữ ký); phép khoảng-cách địa lý GỌI LẠI haversine E4 (không cài lại); per-reading attestation KÝ ở E1 nhưng input-frame do E2, input-toạ-độ do E4.

### E1 — Danh tính & mật mã · tầng chủ đạo **L1 (native sâu)** · chủ **PhoenixKey**
Sinh khoá HW non-exportable (Android Keystore secp256r1 / iOS Secure Enclave P256); ký gated-sinh-trắc ECDSA (BiometricPrompt.CryptoObject / LAContext); **khớp mẫu sinh trắc** (Face/Touch ID — dù qua OS API hay model, LUÔN thuộc E1); canonical-serialize trước ký; đọc pubkey / kiểm tồn tại / xoá-wipe khoá; ký challenge DID (trả chữ ký); Master_KEK + BIP39 mnemonic; HKDF derive; Ed25519 ký TAAD; AES-256-GCM wrap KEK; PBKDF2-300k Device_KEK từ PIN; ECDSA P-256 verify low-S; BLAKE2b sinh DID; ký tx Cardano.
_Đề xuất (chưa code — KHÔNG đóng khung package tới khi có mã):_ per-reading attestation (ký frame lúc chụp); device integrity attestation (Play Integrity / App Attest).
**Bất biến:** `canonicalize` + DID/token **schema** đồng-version với signer & authority DID — KHÔNG rời PhoenixKey (lệch version = chữ ký hợp lệ hoá vô hiệu; schema nơi khác = nguồn DID thứ 2, phá INV-1).

### E2 — Media & ML · tầng chủ đạo **L1 (native per-OS)** · chủ **SuperApp-core**
Load TFLite + allocate tensor; **model-registry ĐỘNG đa-platform** (thay hardcode tree/fruit → cây/quả/thú/thiết-bị); inference 1 khung + warmup; chọn compute delegate GPU/NPU/CPU-fallback; tiền xử lý (letterbox / EXIF-orientation / chuẩn hoá NHWC / resize); hậu xử lý (decode YOLO / lọc / un-letterbox); NMS; tái tạo + resize + áp mask phân đoạn (cứng/mềm/union); crop (bbox/gộp/HQ); xoá nền; đo blur (Laplacian/vDSP); tracking detection (IoU + EMA).
_Đề xuất:_ embedding on-device (DINO/SuperPoint); **CoreML/Metal delegate iOS** (hiện ANE chưa nối → chạy CPU-only, góp phần chậm/nóng); batch inference.

### E3 — Dữ liệu / đồng bộ / mạng · tầng chủ đạo **L0 (cross-platform TS)** · chủ **SuperApp-core**
SQLite per-user + CRUD; durable outbox + vòng lặp + khoá re-entrancy; retry-backoff + dead-letter + khôi phục orphan 'sending' + drain-on-reconnect; idempotency-key client; priority queue + máy trạng thái; KV storage; dedup-cache TTL + địa lý (gọi haversine E4); API client phân loại lỗi (network/auth/validation/rate-limit/server); gắn token; timeout/abort; 401 refresh single-flight; cầu DID challenge/sign/verify (điều phối HTTP; ký ở E1; **tạo/lưu token ở đây**); 429 retry-after; multipart upload; unwrap envelope; lưu token nguyên tử; vòng đời DB theo phiên.
_Đề xuất:_ mã hoá bản ghi cục bộ (khoá E1 cấp); per-field CRDT (hiện thực tế = lww); upload chunked/resumable; [NEEDS-EVIDENCE] bù lệch giờ, xử lý push-payload, tìm kiếm/chỉ mục cục bộ, nén phi-ảnh.

### E4 — Định vị/chuyển động & quản trị tài nguyên · tầng chủ đạo **L0 + chính sách native** · chủ **SuperApp-core**
Haversine; diện tích/chu vi/point-in-polygon/khoảng-cách-cạnh/tự-cắt đa giác; phân loại tốc độ; accuracy-gate; distance-gate; walk-away auto-stop; GPS-lost timeout; validate polygon; cap MAX_VERTICES; throttle distanceFilter; vòng đời watch; iOS GPS auto-pause (.fitness); camera auto-power-off idle; frame-rate throttle/skip (CHÍNH SÁCH — E4 sở hữu; lệnh gọi model ở E2); pause/resume theo lifecycle; WorkManager thực thi nền.
_Đề xuất / GAP:_ **xử lý IMU/la bàn (heading/pitch/roll)** [CONFIRMED — field log có 3 trường]; **RN watchPosition tạm-dừng-idle/nhiệt** [GỐC NÓNG MÁY]; **token-refresh cooldown** [gốc retry-loop]; thống nhất distanceFilter 1 tham số; wake-lock/foreground-service/thread-pool config.

---

## 3. Đặt ở đâu & sở hữu

- **Tầng danh tính (E1) → PhoenixKey** (silent module, INTEGRATION-STANDARD §3.1/§0.4). SuperApp KHÔNG re-own khoá/sinh trắc.
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

## 5. Chỉ thị build (thư mục `SuperApp/MobileCore/`)

Aladin chốt: **xây MỚI trong `SuperApp/MobileCore/`, đúng chuẩn từ đầu** — hơn sửa+gộp nhánh rải rác.
- Rebuild năng lực từ TẤT CẢ nhánh mobile hiện có (orilife-mobile-app các `claude/*`, SuperApp modules) về MỘT bản nhất quán theo §1–§4; **loại bỏ code cũ/lỗi thời/mock**.
- Cấu trúc đề xuất: `MobileCore/l0/{crypto-serialize (→PhoenixKey), geo, sync, net, resource}` (TS) + `MobileCore/l1/{ios,android}/{keystore, ml, sqlite}` (native, interface TS chung).
- Mỗi năng lực ship kèm test thật (Jest cho L0; test máy cho L1). Không nhãn "xong" nếu chưa test thật (theo BUILD-GATE).
- **Khởi động bằng E4 quản-trị-tài-nguyên** (watchPosition idle/thermal pause + token cooldown) — vừa lập chuẩn vừa sửa lỗi nóng máy field đang có.

---

## 6. Provenance & NEEDS-EVIDENCE (trung thực nguồn)
- Bảng §2 rút từ code thật (file:line ở `_Agents/topics/mobile-core-standard.md`). [ĐỀ XUẤT] = suy từ nguyên lý, chưa ai dùng.
- CHƯA đọc repo PhoenixKey-SDK → chưa xác nhận "L0 crypto agnostic (@noble/curves)" tái dùng được vs bản native Keystore đang dùng.
- capability_router (định tuyến nhiệt/pin) tồn tại ở orilife-core NHƯNG chưa nối mobile.
- mergePolicy thực tế = `lww`, không phải per-field-CRDT.

---
## Change Log
- v0.1 (2026-07-15): Khởi tạo từ hội đồng 7 agent. 4 nhóm năng lực MECE, mô hình 2 tầng L0/L1, đặt-ở-đâu + 4 điều kiện governance, chỉ thị build `MobileCore/`.
