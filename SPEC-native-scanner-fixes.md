# SPEC sửa native scanner (Android) — gửi Thư

> Phân tích từ đọc code (máy Claude KHÔNG có Android SDK nên KHÔNG build/logcat được — Thư build + test thật). Định vị tới file:dòng. 4 lỗi anh test thực-địa.

## ĐÃ SỬA SẴN (an-toàn, Thư chỉ cần build kiểm compile)
1. `android/app/src/main/AndroidManifest.xml` — thêm `android:largeHeap="true"` (giảm crash hết-RAM, đệm tạm).
2. `android/orilifesdk/.../ui/OverlayView.kt:308` — nhãn box tiếng Việt (Thân/Cành/Lá/Quả), BỎ `%` (độ chính xác thấp → tránh niềm-tin-giả + ẩn-nội-tạng).
3. `android/orilifesdk/.../ui/CaptureGuidanceOverlay.kt:202` — "Hướng" → "La bàn" (hết nhầm "độ còn lại").

## CẦN THƯ SỬA + TEST (cần build + logcat + máy thật)

### A. CRASH "4/8 ảnh tắt app" = OOM bitmap (ưu tiên 1)
- **Gốc:** `coordinator/DetectionCoordinator.kt` giữ bitmap **ARGB_8888 full-res** mỗi sector: dòng **508** `processed.bitmap.copy(Bitmap.Config.ARGB_8888, false)` và **1032** `rawBitmap.copy(ARGB_8888, false)`. Ảnh camera full-res (vd 4000×3000 = ~48MB/bitmap). Giữ 4–5 cái trong RAM (chờ YOLO + upload queue `network/TreeDetectionQueue.kt`) → vượt heap → `OutOfMemoryError` → tắt app. Khớp "4/8 là tắt".
- **Việc:** (1) Thư chạy `adb logcat` lúc crash → xác nhận `OutOfMemoryError`. (2) **Downscale bitmap về ~1280px cạnh-dài TRƯỚC khi copy/đưa vào queue** (giữ 1 bản nén JPEG để upload thay vì giữ bitmap ARGB). (3) `recycle()` sớm + giới hạn số bitmap đồng thời trong queue (vd ≤2). (4) Nếu upload chậm → ghi JPEG ra file tạm, không giữ trong RAM. largeHeap chỉ là đệm — gốc là downscale.

### B. KẸT "tới 4 ảnh không phát hiện được nữa" (ưu tiên 2)
- **Gốc:** `coordinator/CircularCaptureStateMachine.kt:245` — bắt buộc `conditionYolo` (YOLO detect cây) ở **mỗi** sector mới chụp. Góc khó (cây khuất/nắng/góc xấu) → YOLO không detect → kẹt vô hạn ở sector đó (`checkAndTriggerCapture` return). Chỉ thoát bằng nút "Bỏ qua section".
- **Việc:** nới điều kiện: (1) sau N giây (vd 4s) kẹt 1 sector mà có `stable+blur` OK nhưng YOLO yếu → **tự chụp luôn** (đừng bắt YOLO chắc); HOẶC (2) hạ ngưỡng YOLO khi đã kẹt; HOẶC (3) tự auto-skip sector sau timeout (đừng để nông dân tự bấm skip). Mục tiêu: KHÔNG bao giờ kẹt cứng.

### C. "Chờ user DỪNG mới chụp" — anh muốn tự-chụp-khung-nét (ưu tiên 2)
- **Gốc:** state `STATIONARY_WAIT` + `conditionStable` (`StabilitySampler(stableThreshold=50f)`, dòng 41) bắt user đứng YÊN mới chụp.
- **Việc:** nới `stableThreshold` (cho phép di chuyển chậm) + tự-trigger khi `blur OK + yolo OK` dù đang lia chậm (như camera an-ninh chụp khung nét). Cân bằng: vẫn tránh ảnh mờ (giữ điều kiện `conditionBlur`), nhưng bỏ yêu cầu đứng-yên-tuyệt-đối.

### D. Điểm-dừng / lối-thoát rõ hơn (ưu tiên 3)
- Hiện `MIN_SECTORS_TO_COMPLETE=5` (CircularCaptureStateMachine:27) + nút "Bỏ qua section". Anh phản hồi "không có điểm kết thúc, không dừng được" → nút skip có thể khó thấy.
- **Việc:** thêm nút **"Hoàn tất với ảnh đã có"** hiển thị rõ khi `capturedCount ≥ 1` (đừng bắt đủ 5), + làm nút skip nổi bật hơn.

## Lưu ý
- File native em đã sửa (mục ĐÃ SỬA) chưa qua `./gradlew` ở máy Claude — Thư build kiểm compile trước. Nếu lỗi cú pháp nhỏ Thư sửa giúp.
- iOS có code tương đương (`ios/LocalPods/ScannerModule/Core/Capture/CircularCaptureManager.swift`, `Detection/DetectionCoordinator.swift`) — cùng bệnh, sửa song song nếu cần.
