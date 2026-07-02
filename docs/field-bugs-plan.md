# Plan xử lý lỗi field (Issue #20) — màn quét cây

> Đã đối chiếu code trên `feat/foundation`. Trạng thái + hướng sửa từng lỗi, ưu tiên theo
> tác động field. Cập nhật: 2026-07-02.

## Bảng tổng hợp (nền + trạng thái)

| # | Lỗi | iOS | Android | Loại sửa | Trạng thái |
|---|---|---|---|---|---|
| 1 | Tự chụp khi bấm Bắt đầu | dính | **không dính** | Native (Swift) | ✅ **ĐÃ SỬA** (iOS) |
| 2 | Thiếu bộ lọc độ-nét/ổn-định → ảnh trùng → server chặn `flat` | dính | dính | Native (2 nền) | ⏳ chờ chốt **A/B** |
| 3 | App không hiện field-error server | dính | dính | RN (dùng chung) | ▶️ làm ngay |
| 4 | Version hard-code "v1.0.0" | dính | dính | RN (dùng chung) | ▶️ làm ngay |
| 5 | Android không tạo được farm | — | riêng | RN/DB | 🔎 cần logcat |
| 6 | Nút quả → màn cây | dính | dính | — | ⛔ để yên (chờ spec anh) |

---

## Quyết định cần chốt TRƯỚC (chặn #2)

**#2 là gốc thật của "chụp 10 tấm không tạo được cây"** (ảnh trùng → server trả `flat`).
Cần 2 dev chốt hướng capture:

- **(A) Khôi phục scanner YOLO + bộ lọc chất-lượng cũ (từ `main`)** — có cả phát-hiện dẫn-chụp
  lẫn lọc ảnh (blur + đứng-yên). Đúng phân-tầng thiết-bị (YOLO nhẹ trên máy, DINOv2/SAM ở
  server). Anh nghiêng (A). Chi phí: gỡ lại module cũ + nối vào treereid pipeline.
- **(B) Giữ treereid, chỉ port M-2 (độ-nét Laplacian + đứng-yên)** vào `HeadingCaptureManager`
  (cả `.swift` lẫn `.kt`). Nhẹ hơn, nhưng **không có** YOLO dẫn-chụp.

→ **Chốt A hay B rồi mới làm #2.** Khuyến nghị: A (đúng định hướng dài hạn).

**Branch/trunk (Tùng chốt):** hiện PR #14 để `feat/foundation → main`, còn quy-tắc build là
dồn vào `develop`. Cần thống nhất 1 nhánh trunk để mọi người build cùng chỗ (tránh mỗi người
build một nhánh). Không phải việc code — nhưng chặn việc "build đúng nhánh".

---

## Đợt 1 — SHIP NGAY (RN, ăn cả 2 nền, không chờ quyết định)

Mục tiêu: field có thể biết build nào đang chạy + nông dân biết phải làm gì khi lỗi.

### #4 — Version thật (thay "Aladin v1.0.0")
- **Vị trí:** [AccountScreen.tsx:294](../src/screens/AccountScreen.tsx#L294) (`showInfo`), [:647](../src/screens/AccountScreen.tsx#L647) (`sublabel`).
- **Cách (khuyến nghị a):** thêm `react-native-device-info`, đọc `getVersion()` + `getBuildNumber()`
  → hiện `Aladin v{version} ({build})`. Tự đúng theo build, không phải sửa tay.
  - `npm i react-native-device-info` → `pod install` (iOS) → rebuild.
  - Autolink RN 0.84 tự nhận; không cần đăng ký tay.
- **Phương án b (nếu ngại thêm native dep):** 1 hằng `APP_VERSION` sinh lúc build (đồng bộ
  `versionName`/`MARKETING_VERSION`). Rẻ nhưng phải nhớ cập nhật.
- **Kiểm:** cài build mới → màn Tài khoản hiện đúng version + build number (khác nhau giữa 2 build).
- **Rủi ro:** thấp. Effort: ~30ph (a).

### #3 — Hiện field-error server cho nông dân
- **Đã có sẵn:** [treeReIDService.ts](../src/services/treeReIDService.ts) parse `error_code`
  (`duplicate_tree | heterogeneous | flat | need_gps`) + `reason`. **Thiếu:** [TreeIdentityScreen.tsx](../src/screens/TreeIdentityScreen.tsx)
  không hiển thị — chỉ xử lý `decision` (MATCH/UNCERTAIN/MOVED).
- **Cách:**
  1. Map `error_code`/`reason` → câu tiếng Việt rõ (dùng câu server trả nếu có, fallback map cứng):
     - `flat` → "Các góc chụp gần như giống nhau. Hãy **đi vòng quanh cây thật** và chụp các góc khác nhau."
     - `heterogeneous` → "Ảnh lẫn nhiều vật khác nhau — hãy chụp tập trung vào 1 cây."
     - `need_gps` → "Cần bật định vị (GPS) để tạo cây."
     - `duplicate_tree` → giữ dialog trùng hiện có (đã có 409 handler).
  2. Ở nhánh xử lý kết-quả enroll/identify của TreeIdentityScreen: khi `error.type === 'validation_error'`
     hoặc có `error_code`, hiện thông báo trên (Alert/toast), không nuốt thành "lỗi" chung.
- **Kiểm:** ép server trả `flat` (chụp trùng) → app hiện câu hướng dẫn thay vì "lỗi".
- **Rủi ro:** thấp. Effort: ~1–2h.

**Gộp Đợt 1 thành 1 PR nhỏ** (RN thuần) → build 2 nền test nhanh, không đụng native.

---

## Đợt 2 — CORE FIX #2 (sau khi chốt A/B) — cả 2 nền

### Nếu chọn (B) port M-2 (nhẹ, làm nhanh trước để field tạm ổn):
1. **iOS** ([HeadingCaptureManager.swift](../ios/LocalPods/ScannerModule/Core/TreeReID/HeadingCaptureManager.swift)) +
   **Android** ([HeadingCaptureManager.kt](../android/app/src/main/java/com/aladincontract/company/treereid/HeadingCaptureManager.kt)):
   thêm 2 điều-kiện AND vào `checkCaptureTrigger`/`process` — chỉ `shouldCapture=true` khi:
   - đủ góc (Δheading/Δpitch — đã có), **VÀ**
   - **độ-nét đạt** (Laplacian variance ≥ ngưỡng — lấy công thức từ `CircularCaptureManager` trên `main`), **VÀ**
   - **máy đứng yên** (gyro/accel dưới ngưỡng chuyển động một khoảng ngắn).
2. **KHÔNG dùng cooldown thời-gian** (anh dặn) — nhịp theo góc + độ-nét, không theo đồng-hồ.
3. Cần bridge frame ảnh (hoặc độ-nét tính sẵn) vào manager — xem cách `CircularCaptureManager`
   nhận buffer camera trên `main`.

### Nếu chọn (A) khôi phục YOLO scanner + bộ lọc (đúng định hướng):
1. Lấy lại module scanner YOLO (5.8MB) + `CircularCaptureManager` từ `main` vào field.
2. Nối pipeline: YOLO phát-hiện + dẫn-chụp + cắt thô trên máy; DINOv2/SAM giữ ở server (KHÔNG
   đưa vào vòng chụp mỗi-frame).
3. Thay/đặt cạnh treereid capture-by-heading (quyết định giữ heading hay bỏ).
4. Regression: bảo đảm không phá luồng identify/enroll hiện có (form 24–32 ảnh → giờ ít + nét hơn).

→ **Kết quả kỳ vọng #2:** ảnh gửi lên đa-góc + nét → server không còn trả `flat` → tạo cây được.
Kết hợp #1 (iOS) đã sửa → hết chuỗi "chụp nhiều vẫn báo lỗi".

---

## Đợt 3 — #5 Android không tạo được farm → **BUILD CŨ / LỆCH ENV** (đã chốt nguyên nhân)

**Triệu chứng thật (ảnh field):** "Không thể tạo trang trại: Request failed with status code **404**",
màn có nút "Ghi điểm/Hoàn thành". Chỉ Android, iOS OK.

**Chẩn đoán (đã xác minh):**
- Lỗi là **404** (không phải DB/401) → request TỚI server nhưng path `/farms` không tồn tại.
- `curl POST test.orilife.io/farms` = **404** (khớp máy); `staging-api.orilife.io/farms` = **502**
  (khác). → Android đang gọi farm vào **test.orilife.io** (server tree-reid, KHÔNG có `/farms`),
  không phải server farm.
- Chuỗi "Không thể tạo trang trại" và nút "Ghi điểm" **KHÔNG có** trong `feat/foundation` lẫn
  `main` hiện tại (code hiện tại nuốt lỗi backend thành "Đã lưu vào máy · Saved locally" —
  [FarmDetailScreen.tsx:1674-1685](../src/modules/trace/screens/FarmDetailScreen.tsx#L1674)). Trong khi
  iOS field log `appVersion: "2.0"`.
- ⇒ **Máy Android đang chạy BUILD CŨ / nhánh khác** (code + base URL cũ). Đúng cảnh báo "mỗi
  người build một nhánh" của issue #20.

**KHÔNG phải bug code hiện tại.** Fix:
1. **Cài lại Android** bằng build MỚI NHẤT từ nhánh trunk thống nhất (feat/foundation) với
   `BASE_API_URL` đúng (= giá trị mà build iOS đang chạy được dùng).
2. Dùng **#4 version display** (đã sửa) để xác nhận máy chạy đúng build/version.
3. ⚠️ **Backend:** `staging-api.orilife.io/farms` đang trả **502** (gateway chết). Nếu build mới
   trỏ vào đó thì VẪN fail → backend phải xác nhận server farm khoẻ, hoặc app trỏ đúng host farm
   mà iOS đang dùng.

**Việc code (nếu muốn phòng ngừa tái diễn):** log `[AladinAPI] Initialized: <baseURL>` lên remote
log server + hiện baseURL ở màn debug (tap version 5 lần) để field tự soi máy đang trỏ đâu.

---

## Đã xong (không cần làm lại)
- **#1 iOS** — [HeadingCaptureManager.swift](../ios/LocalPods/ScannerModule/Core/TreeReID/HeadingCaptureManager.swift):
  thêm cờ `hasRealHeading`, chỉ tính Δheading khi có la-bàn thật (bỏ seed 0 giả), bỏ reading
  `headingAccuracy < 0`. Verify khi build iOS trên codemagic.
- **#1 Android** — không dính (heading lấy từ cùng 1 sự kiện `TYPE_ROTATION_VECTOR`, luôn số thật).

## Thứ tự đề xuất
1. **Đợt 1 (#3 + #4)** — ship ngay, 1 PR RN, ~nửa ngày. Field biết build + biết cách xử lỗi.
2. **Chốt A/B + branch trunk** (2 dev + Tùng).
3. **Đợt 2 (#2)** — core fix theo A/B.
4. **Đợt 3 (#5)** — sau khi có logcat máy Nhi.
5. **#6** — chờ spec anh.
