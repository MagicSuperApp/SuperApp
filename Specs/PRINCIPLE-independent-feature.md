# Nguyên tắc Vận hành Độc lập (Independent Feature Operation)

> **Phiên bản:** 1.0 — 2026-05-18
> **Trigger:** Field test Build 53, Giang loay hoay cả buổi sáng vì không tạo được farm → không test được bất kỳ tính năng nào khác.
> **Phạm vi áp dụng:** Toàn bộ Aladin Mobile App (`vn.aladinapp`), Aladin Web, mọi module của OriLife ecosystem. Áp dụng **vĩnh viễn**.

---

## 1. Phát biểu nguyên tắc

> **Mọi tính năng (feature) hướng người dùng PHẢI có thể truy cập và thực thi độc lập, KHÔNG phụ thuộc vào sự thành công của bất kỳ tính năng nào khác.**

Cụ thể với Aladin:

- ✅ User PHẢI quét/chụp được **quả** dù **chưa định danh được cây**
- ✅ User PHẢI định danh được **cây** dù **chưa tạo được vườn (farm)**
- ✅ User PHẢI tạo được **vườn** dù **chưa đăng nhập**
- ✅ User PHẢI dùng được app dù **không có internet**, **không có GPS**, **không có LiDAR**, hoặc **backend chết**
- ✅ Mọi capture (ảnh, video, voice, 3D mesh, GPS) phải lưu **local-first**, sync khi có thể

---

## 2. Vì sao nguyên tắc này là sống còn với Aladin / OriLife

### 2.1. Bio-ID core value prop bị phá vỡ nếu có gating

Bio-ID OriLife cam kết: định danh **bất kỳ sinh vật nào, bất kỳ đâu, bất kỳ lúc nào**, không dùng tem/QR/RFID. Nếu user phải "tạo farm → tạo cây → mới chụp được quả", thì:

- App đang **hành xử như spreadsheet**, không phải Bio-ID engine
- Bất kỳ bước nào fail → toàn bộ capture pipeline chết → giá trị cốt lõi mất

### 2.2. Field reality: data is on the tree NOW

Khi Giang đứng dưới gốc cây sầu riêng:
- Trái sầu đang chín **bây giờ**, không chờ
- Mạng 4G ở Đắk Lắk có thể chập chờn
- GPS có thể mất 30s mới fix
- Backend Tiger có thể đang restart
- Apple ID có thể vừa hết session

Nếu **bất kỳ điều nào ở trên** khiến app không capture được → data đó **mất vĩnh viễn**. Tester sẽ không quay lại cây đó lần nữa.

### 2.3. Field test Build 53 đã chứng minh sai lầm này

Giang dành cả buổi sáng cố tạo farm. Kết quả:
- 0 cây đăng ký
- 0 quả chụp
- 0 capture 3D
- 0 voice memo

Trong khi đó, **mỗi tính năng kia hoạt động độc lập đã có thể thu thập data**. Chúng ta để cả buổi vô ích vì 1 dependency.

### 2.4. Data integrity KHÔNG bị ảnh hưởng

Người ta hay biện hộ: "Phải có farm thì cây mới có context, mới link được". **Sai**. Mỗi capture đã có:
- GPS lat/lng (auto)
- Timestamp (auto)
- Device ID (auto)
- User ID (nếu đã login, optional)

Linking farm/tree là **metadata sau**, không phải **precondition trước**. Server hoặc user có thể link orphan capture vào farm sau bằng GPS clustering + user confirm.

---

## 3. Patterns BẮT BUỘC áp dụng

### 3.1. Capture-first, link-later

Mỗi capture (cây, quả, 3D, voice, ảnh) tạo **một record độc lập** với:
```
{
  capture_id: UUID,
  capture_type: "tree" | "fruit" | "capture3d" | "voice" | "photo",
  gps: { lat, lng, accuracy } | null,
  timestamp: ISO8601,
  device_id: string,
  user_id: string | null,        // null nếu chưa login
  farm_id: string | null,        // null nếu chưa link
  parent_capture_id: string | null,  // null nếu chưa link cha
  payload: { ... }
}
```

Linking là **một thao tác sau**, không phải **một field bắt buộc**.

### 3.2. Offline-first storage

- Mọi write đi vào **SQLite local trước**
- Sync queue chạy background
- UI **không bao giờ** hiển thị "Không có mạng → không thể tiếp tục"
- Hiển thị badge sync status (X/Y đã sync) nhưng không block thao tác

### 3.3. Login bắt buộc — nhưng đơn giản hoá bằng biometric

(Sửa 2026-05-18: ban đầu doc này đề xuất guest mode. CPO Đức xét lại và bỏ
guest mode vì đánh đổi quá nhiều — privacy, attack surface, data migration
phức tạp. Login đã được rút gọn xuống chỉ còn vân tay hoặc Face ID, mất ~5
giây và hoàn toàn offline.)

- App khởi động → **Login screen biometric** → Main
- Biometric flow self-contained on device (ReactNativeBiometrics + AsyncStorage), KHÔNG gọi server
- Lần đầu: mint fresh DID + lưu local. Lần sau: scan vân tay / face → resolve DID.
- Sau khi login, MỌI tính năng vẫn phải hoạt động độc lập theo các pattern còn lại (capture-first, offline-first, sanity-degrade)

→ Nguyên tắc Độc lập KHÔNG yêu cầu bỏ login. Nó yêu cầu KHÔNG để bất kỳ feature nào chặn feature khác. Login là 1 hành động duy nhất ~5s, không phải gate kéo dài.

### 3.4. Implicit parent auto-creation

Nếu user chụp quả mà **chưa có cây nào** được tạo:
- App **tự tạo** một "Cây ẩn" với GPS hiện tại
- Lưu quả vào cây ẩn đó
- Hiển thị nhẹ: "Đã tạo cây tạm tại đây. Đổi tên/gán farm sau."

Nếu chưa có farm:
- Quả/cây gán vào farm placeholder "Chưa phân loại"
- Bản đồ vẫn hiện cây ở vị trí GPS

### 3.5. Graceful degradation per capability

| Capability mất | Hành xử ĐÚNG | Hành xử SAI |
|---|---|---|
| GPS denied | Capture vẫn lưu, gps=null, hiện hint "bật GPS để gán vị trí" | Block capture, ép user vào Settings |
| LiDAR không có | Capture 3D fallback chụp 2D + photogrammetry, hoặc disable nút (KHÔNG crash toàn app) | App crash, hoặc "Thiết bị không hỗ trợ → thoát app" |
| Camera denied | Hiện Alert + nút "Mở Cài đặt" + cho phép import từ Photos | Silent fail (bug build 50) |
| Backend 500 | Queue local, retry exponential backoff | Modal "Server lỗi" che màn hình |
| Mất mạng | Tất cả tính năng vẫn work | "Cần internet để tiếp tục" |
| Chưa login | Capture vẫn work với user_id=null | Login wall chặn app |

### 3.6. Composability, not hierarchy

**Sai:** `Farm → Tree → Capture3D → Fruit` (pipeline bắt buộc)

**Đúng:** `Farm`, `Tree`, `Capture3D`, `Fruit` là **4 atoms ngang hàng**. Mỗi atom standalone. Quan hệ là **metadata link**, không phải **navigation gate**.

UI tab structure nên là: Capture (default), History, Map, Settings. **Không** ép user đi qua Farm → Tree → Fruit theo thứ tự.

### 3.7. Một-tap-vào-capture (1-tap-to-capture)

Từ home screen, user phải **chụp được quả trong ≤ 1 tap**:
- Mở app → home → "Chụp ngay" → camera mở trong < 2s
- Không hỏi farm, không hỏi cây, không hỏi login

Mọi context (cây nào, farm nào) hỏi **sau khi đã chụp**, optional.

---

## 4. Anti-patterns CẤM TUYỆT ĐỐI

Code review reject nếu thấy bất kỳ pattern nào dưới đây:

| Anti-pattern | Ví dụ | Lý do cấm |
|---|---|---|
| **Modal gating** | "Bạn cần tạo nông trại trước" rồi disable nút | Block giá trị cốt lõi |
| **Disabled-by-dependency** | Nút "Thêm quả" disabled khi chưa chọn cây | User không hiểu phải làm gì |
| **Login wall** | Splash → ép login trước khi vào app | Mất data field |
| **Server-required validation** | Phải POST /trees trả 200 mới hiện UI cây | Mất mạng = mất app |
| **Hard fail on permission denied** | GPS denied → "App cần GPS, vui lòng thoát" | User mất quyền tự quyết |
| **Cascade crash** | 1 module crash → toàn app crash | Mất tất cả data session |
| **Sequential wizard required** | Onboarding 5 bước bắt buộc tuần tự | Test build 53 đã chứng minh |
| **No offline mode** | "Cần internet để tiếp tục" | Vùng nông thôn = đa số use case |

---

## 5. Acceptance criteria cho mọi feature mới

Trước khi merge feature vào main, **PHẢI** verify 5 câu hỏi:

1. ☐ Feature này có chạy được khi **chưa login** không?
2. ☐ Feature này có chạy được khi **offline 100%** không?
3. ☐ Feature này có chạy được khi **mọi feature khác đều fail** không?
4. ☐ Nếu permission bị denied (GPS/Camera/Mic), feature có **degrade graceful** không (vẫn dùng được phần khác)?
5. ☐ Nếu user thoát giữa chừng, data đã capture có **persist local** không?

Nếu **bất kỳ câu nào "Không"** → feature CHƯA đủ điều kiện ship.

---

## 6. Build 54 — action items áp dụng nguyên tắc

| # | Item | Owner | Estimate |
|---|---|---|---|
| 1 | Auto-create farm default "Vườn của tôi" lần đầu mở app (user không phải tạo farm) | Tùng (FE) | 2h |
| 2 | Implicit "Cây tạm" khi chụp quả không có cây active | Tùng + Long | 4h |
| 3 | Đổi Trace tab default screen từ "Danh sách farm" → "Chụp ngay" (1-tap-to-capture) | Tùng | 3h |
| 4 | Guest mode: bỏ login wall, app vào thẳng capture | Tùng + Lợi (BE link device_id→user_id sau) | 6h |
| 5 | Offline queue: mọi capture lưu SQLite trước, sync background với retry | Long + Lợi | 8h |
| 6 | Permission denied → degrade graceful (GPS/Camera/Mic riêng biệt, không cascade) | Tùng | 4h |
| 7 | Loại bỏ tất cả modal "Bạn cần X trước" trong codebase | Tùng (audit) | 2h |
| 8 | Test acceptance 5 câu hỏi cho từng module trước khi cut Build 54 | Lành (PM) | 1h |

---

## 7. Workaround tạm cho field test Build 53 (hôm nay)

Vì Build 53 đã ship + đang ở TestFlight review, **không hotfix kịp**. Hướng dẫn Giang/Cường:

1. **Bỏ qua bước tạo farm.** Nếu không tạo được, kệ.
2. Vào thẳng tab Trace → tìm bất kỳ farm placeholder/demo nào có sẵn → vào trong → test "Thêm cây" + "Capture 3D" + "Thêm quả" + "Voice memo"
3. Nếu **không có farm nào** để vào → báo Lành ngay, dev push hotfix server-side: tạo 1 farm demo "Vườn test Build 53" gán sẵn cho user `aladincontract@gmail.com` + Giang + Cường để họ vào test các tính năng còn lại
4. Document mọi bug feature khác (cây, quả, 3D, voice) → input cho Build 54

---

## 8. Tham chiếu / lịch sử

- 2026-05-18: Field test Build 53 Giang loay hoay cả sáng không tạo được farm → CPO ban hành nguyên tắc.
- Liên quan:
  - `docs/PRINCIPLES/` — folder các nguyên tắc dev của Aladin/OriLife (sẽ bổ sung)
  - Memory: `feedback_bioid_no_physical.md` — Bio-ID không dùng vật lý (nguyên tắc gốc khác)
  - Memory: `project_aladin_ecosystem.md` — multi-backend per module

---

**Ký:** CPO Đức (aladincontract@gmail.com) — 2026-05-18
