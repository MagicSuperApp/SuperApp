# OriLife Mobile - Tree Identity (MassTreeIdentify) Change Plan

**Ngày soạn:** 2026-06-03
**Source:** Server commit `4b743bc` - branch `cla mau/masstreeidentify`
**Mục tiêu:** Tích hợp tính năng định danh cây bằng ảnh (Visual Tree ReID) vào mobile app

---

## 0. IMPLEMENTATION STATUS - Phương án A: WebView ✅

### Completed Tasks

| Task | Status | File/Location |
|---|---|---|
| Tạo TreeIdentityWebScreen | ✅ Done | `src/screens/TreeIdentityWebScreen.tsx` |
| Thêm vào navigation | ✅ Done | `src/navigation/index.tsx` (route: TreeIdentityWeb) |
| Thêm nút Quick Actions | ✅ Done | `src/screens/HomeScreen.tsx` (icon lá xanh) |
| Cài react-native-webview | ✅ Done | Package installed via npm |
| Android permissions | ✅ Already exists | CAMERA, GPS, READ_MEDIA_IMAGES trong AndroidManifest.xml |
| iOS permissions | ✅ Already exists | NSCamera, NSLocation, NSMotion trong Info.plist |
| Update .env.example | ✅ Done | Thêm `ORILIFE_TREEID_URL` |
| Update codemagic.yaml | ✅ Done | Thêm biến ORILIFE_TREEID_URL cho iOS build |

### Files Changed

```
NEW:
  src/screens/TreeIdentityWebScreen.tsx

MODIFIED:
  src/navigation/index.tsx         (thêm import + screen)
  src/screens/HomeScreen.tsx        (thêm nút Quick Actions)
  .env.example                      (thêm ORILIFE_TREEID_URL)
  codemagic.yaml                    (thêm ORILIFE_TREEID_URL cho iOS)
```

### How to Test

1. **Android:** Build và chạy app → HomeScreen → nhấn nút "Nhận diện" (icon lá xanh) → WebView mở web client
2. **iOS:** Push lên branch → Codemagic sẽ build tự động

---

## 1. TÓM TẮT THAY ĐỔI TỪ SERVER

### 1.1 API Mới hoàn toàn
Server cung cấp một bộ API hoàn toàn mới cho tính năng **Tree Visual ReID**:

| Method · Endpoint | Mô tả |
|---|---|
| `POST /api/identify` | Nhận diện cây từ ảnh + GPS |
| `POST /api/enroll` | Đăng ký cây mới (≥4 góc) |
| `POST /api/verify_add` | Xác nhận & học thêm góc cho cây |
| `GET /api/trees` | Danh sách cây đã đăng ký |
| `POST /api/rename` | Sửa tên cây |
| `POST /api/delete` | Xoá cây |
| `GET /api/tree_views` | Xem ảnh + điểm từng cây |
| `POST /api/remove_views` | Xoá ảnh điểm thấp |
| `POST /api/update_location` | Cập nhật vị trí cây đã dời |
| `GET /gimg/<path>` | Serve ảnh cây |

### 1.2 Đặc điểm quan trọng
- **Định dạng gửi:** `multipart/form-data` (FormData), field `files[]` cho ảnh
- **GPS:** gửi `lat`/`lon` riêng (KHÔNG phải mảng)
- **Image resize:** Mobile cần nén ảnh ≤1280px, JPEG quality 0.82
- **HEIC:** Server chưa hỗ trợ chắc chắn → luôn gửi JPEG
- **EXIF:** Server tự xoay ảnh theo EXIF flag → mobile không cần xoay
- **Source tag:** `source=phone|flycam|chatbot` để phân biệt nguồn

### 1.3 Response Structure cho Identify
```typescript
{
  ok: boolean,
  decision: "MATCH" | "UNCERTAIN" | "NO_MATCH" | "EMPTY_BUCKET" | "MOVED",
  tree_id: string | null,
  name: string | null,
  similarity: number,      // 0-1, độ giống hợp
  margin: number,          // biên top1 - top2
  moved_distance_m: number | null,
  factors: {               // breakdown 4 yếu tố
    CTX: number,           // Bối cảnh (0-1)
    PLANT: number,         // Cây
    BASE: number,          // Gốc
    LEAF: number          // Tán lá
  },
  warnings: string[],      // cảnh báo từ breakdown
  candidates: [{           // cây gần đúng nhất (cho user xác nhận)
    tree_id, name, sim
  }]
}
```

---

## 2. SO SÁNH: API CŨ vs API MỚI

| Aspect | API CŨ (TreeAPI.kt) | API MỚI (MassTreeIdentify) |
|---|---|---|
| **Purpose** | CRUD cây (create/read/update/delete) | Định danh cây bằng ảnh (Visual ReID) |
| **Protocol** | JSON REST | multipart/form-data |
| **Auth** | `X-API-Key` header | Hiện chưa có (test phase) |
| **Image** | Gửi file riêng, JSON metadata | Gửi trong FormData cùng GPS |
| **GPS** | JSON body | FormData field `lat`, `lon` |
| **Detection** | TreeDetectionAPI - YOLO bounding box | DINOv2 ViT-S/14 - full image embedding |
| **Response** | `{success, message, treeId, confidence}` | Rich object với decision, factors, candidates |

### Nhận xét:
- **API cũ** và **API mới** là 2 tính năng KHÁC NHAU, không thay thế nhau
- API cũ: quản lý metadata cây (tên, vị trí grid, farm)
- API mới: nhận diện cây bằng hình ảnh (ai đó chụp cây → hệ nhận ra)

---

## 3. NHỮNG GÌ CẦN THAY ĐỔI TRÊN MOBILE

### 3.1 Configuration (.env)

**Cần thêm biến mới:**
```env
# Tree Identity (Visual ReID)
ORILIFE_TREEID_URL=https://test.orilife.io/TreeIdentity
```

### 3.2 Dependencies cần cài thêm

| Package | Mục đích | Ưu tiên |
|---|---|---|
| `react-native-image-picker` | Chụp ảnh (gọi camera hệ thống) | Bắt buộc |
| `react-native-image-resizer` | Nén ảnh ≤1280px, JPEG 0.82 | Bắt buộc |
| `react-native-webview` | Con đường A - nhúng web client | Ưu tiên thấp |
| `react-native-compass-heading` | Đọc heading (optional) | Tuỳ chọn |

### 3.3 Screens cần tạo mới

#### Screen 1: `TreeIdentityScreen`
- Màn hình nhận diện cây chính
- Luồng: Chụp ảnh → Nén → Gọi identify → Hiện badge theo decision
- Badge colors:
  - 🟢 **MATCH** (xanh): "✓ KHỚP" + tên cây + breakdown 4 yếu tố + candidates
  - 🟡 **UNCERTAIN** (vàng): "? CHƯA CHẮC"
  - 🔴 **NO_MATCH** (đỏ): "✗ CHƯA NHẬN RA" (không mời xác nhận)
  - ⚪ **EMPTY_BUCKET** (xám): "• CHƯA CÓ CÂY GẦN ĐÂY"
  - 🔵 **MOVED** (xanh dương): "➜ CÂY ĐÃ DỜI?"

#### Screen 2: `TreeEnrollScreen`
- Đăng ký cây mới
- Tên cây + ≥4 góc (chụp vòng quanh)
- Xử lý các error cases:
  - `409 heterogeneous`: "⚠️ Nhiều cây trong ảnh" → nút force
  - `409 flat`: "🚫 Ảnh phẳng/lặp"
  - `409 duplicate`: "🔎 Giống cây đã có" → Gộp hoặc Tạo mới
  - `400 need_gps`: "📍 Cần bật GPS"

#### Screen 3: `TreeManagementScreen`
- Danh sách cây đã đăng ký
- Sửa tên / Xoá cây
- Xem ảnh từng cây + điểm → xoá ảnh điểm thấp

#### Screen 4: `TreeConfirmDialog`
- Dialog xác nhận cây đúng (sau khi identify → candidates)
- Nút "Đúng — [tên cây]" → gọi `verify_add`
- Nếu server yêu cầu thêm góc → mở camera để chụp thêm

### 3.4 Utility Functions cần viết

#### `compressImage(fileUri: string): Promise<File>`
```typescript
// Input: file URI từ image-picker
// Output: resized file ≤1280px, JPEG 0.82
// Giải quyết: HEIC → JPEG, giảm bandwidth
```

#### `createTreeIdentityFormData(
  images: File[],
  options: {
    lat?: number,
    lon?: number,
    acc?: number,
    heading?: number,
    pitch?: number,
    roll?: number,
    source?: 'phone' | 'flycam' | 'chatbot'
  }
): FormData
```
```typescript
// Tạo FormData đúng format theo spec
// images: array of compressed JPEG files
```

#### `callTreeIdentityAPI<T>(
  endpoint: string,
  formData: FormData,
  timeout?: number
): Promise<T>
```
```typescript
// Wrapper với timeout 45s, retry 1-2 lần
// Retry chỉ cho lỗi mạng, không retry 4xx
```

### 3.5 Android Permissions

**Cần thêm trong `AndroidManifest.xml`:**
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<!-- Android 13+ -->
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
```

**Runtime permission handling:**
- Xin quyền TRƯỚC khi mở camera
- Xử lý trường hợp user từ chối (hiện thông báo thân thiện)

### 3.6 iOS Permissions

**Kiểm tra `Info.plist`:**
- `NSCameraUsageDescription` ✅ (đã có)
- `NSLocationWhenInUseUsageDescription` ✅ (đã có)
- `NSPhotoLibraryUsageDescription` ✅ (đã có)

→ iOS gần như đủ, chỉ cần rà lại nội dung mô tả.

---

## 4. IMPLEMENTATION PLAN

### Phase 1: Setup & Configuration (Tuần này)
| Task | Description | Effort |
|---|---|---|
| 1.1 | Thêm `ORILIFE_TREEID_URL` vào `.env` + `.env.example` | 🟢 Dễ |
| 1.2 | Cài `react-native-image-picker` | 🟡 Vừa |
| 1.3 | Cài `react-native-image-resizer` | 🟡 Vừa |
| 1.4 | Thêm Android permissions (`AndroidManifest.xml`) | 🟢 Dễ |
| 1.5 | Rà iOS permissions trong `Info.plist` | 🟢 Dễ |

### Phase 2: Core Utilities
| Task | Description | Effort |
|---|---|---|
| 2.1 | Viết `compressImage()` function | 🟡 Vừa |
| 2.2 | Viết `createTreeIdentityFormData()` | 🟡 Vừa |
| 2.3 | Viết `TreeIdentityAPI` class (với timeout + retry) | 🟡 Vừa |
| 2.4 | Viết TypeScript models cho response | 🟡 Vừa |

### Phase 3: Screens
| Task | Description | Effort |
|---|---|---|
| 3.1 | `TreeIdentityScreen` - Nhận diện (chụp → identify → badge) | 🔴 Khó |
| 3.2 | `TreeEnrollScreen` - Đăng ký cây mới | 🔴 Khó |
| 3.3 | `TreeConfirmDialog` - Xác nhận cây | 🟡 Vừa |
| 3.4 | `TreeManagementScreen` - Quản lý cây | 🟡 Vừa |

### Phase 4: Integration
| Task | Description | Effort |
|---|---|---|
| 4.1 | Thêm navigation (Stack) cho tree identity flow | 🟡 Vừa |
| 4.2 | Kết nối GPS (dùng `react-native-geolocation-service` đã có) | 🟢 Dễ |
| 4.3 | Xử lý error cases (409 heterogeneous, flat, duplicate) | 🟡 Vừa |
| 4.4 | UI: breakdown 4 yếu tố (CTX, PLANT, BASE, LEAF) | 🟡 Vừa |
| 4.5 | UI: warnings display | 🟡 Vừa |

### Phase 5: Testing & Polish
| Task | Description | Effort |
|---|---|---|
| 5.1 | Test trên Android (Oppo Reno 12) | 🟡 Vừa |
| 5.2 | Test trên iOS | 🟡 Vừa |
| 5.3 | Xử lý edge cases (mạng yếu, GPS lỗi) | 🟡 Vễa |

---

## 5. FILE CHANGES MỚI CẦN TẠO

```
src/
├── modules/
│   └── treeIdentity/
│       ├── screens/
│       │   ├── TreeIdentityScreen.tsx
│       │   ├── TreeEnrollScreen.tsx
│       │   └── TreeManagementScreen.tsx
│       ├── components/
│       │   ├── TreeResultBadge.tsx
│       │   ├── TreeFactorBreakdown.tsx
│       │   ├── TreeCandidateSelector.tsx
│       │   ├── TreeConfirmDialog.tsx
│       │   ├── TreeImageGrid.tsx
│       │   └── ErrorHandler.tsx
│       ├── api/
│       │   ├── TreeIdentityAPI.ts
│       │   └── types.ts
│       └── utils/
│           ├── imageCompressor.ts
│           └── formDataBuilder.ts

android/
└── app/src/main/AndroidManifest.xml  (thêm permissions)

ios/
└── Runner/Info.plist  (rà lại permissions)

.env.example  (thêm ORILIFE_TREEID_URL)
```

---

## 6. LƯU Ý QUAN TRỌNG

### 6.1 KHÔNG merge hay push gì cả
Chỉ đọc và lên plan. Tất cả code cần được review trước khi merge.

### 6.2 Two Paths khuyến nghị
Theo spec, có 2 con đường:
- **Path A (Nhanh):** Nhúng web client vào WebView → có thể test ngay tuần này
- **Path B (Native):** Viết React Native screens gọi REST API → hướng chính cho production

**Khuyến nghị:** Làm Path A trước để collect data thực địa, song song với Path B.

### 6.3 Backend đang ở test phase
- Chưa có authentication
- Chạy qua cloudflared tunnel
- Đang chạy CPU (chưa GPU)
- URL: `https://test.orilife.io/TreeIdentity`

### 6.4 Keep ảnh vừa chụp
Khi user chụp ảnh để identify, GIỮ LẠI ảnh đó trong memory:
- Nếu `MATCH`/`UNCERTAIN` → dùng lại ảnh để `verify_add`
- Nếu `NO_MATCH` → mang ảnh sang màn enroll làm góc 1

### 6.5 Xử lý lỗi cụ thể

| HTTP Code | Error Type | Handling |
|---|---|---|
| 409 | `heterogeneous: true` | "⚠️ Nhiều cây trong ảnh" → nút "Vẫn lưu" với `force: "1"` |
| 409 | `flat: true` | "🚫 Ảnh phẳng/lặp" → bắt chụp lại |
| 409 | `duplicate: true` | "🔎 Giống cây đã có" → Gộp hoặc Tạo mới |
| 400 | `need_gps: true` | "📍 Cần bật GPS" |
| 4xx | Other | Hiện error message, cho retry |

---

## 7. DEEP DIVE: API CONTRACT

### 7.1 POST /api/identify

**Request:**
```
POST /api/identify
Content-Type: multipart/form-data

files[]: <JPEG file>
lat: "10.7629"
lon: "106.6604"
acc: "5.0"
heading: "45"
pitch: "-5"
roll: "3"
source: "phone"
```

**Response:**
```json
{
  "ok": true,
  "decision": "MATCH",
  "tree_id": "abc123",
  "name": "Sứ gốc to",
  "similarity": 0.847,
  "margin": 0.091,
  "moved_distance_m": null,
  "factors": {
    "CTX": 0.78,
    "PLANT": 0.85,
    "BASE": 0.91,
    "LEAF": 0.72
  },
  "warnings": ["Tán LÁ khớp yếu — có thể cây đã tỉa cành"],
  "candidates": [
    {"tree_id": "abc123", "name": "Sứ gốc to", "sim": 0.847},
    {"tree_id": "def456", "name": "Sứ góc sân", "sim": 0.756}
  ]
}
```

### 7.2 POST /api/verify_add

**Request:** Same as identify + `tree_id`

**Response:**
```json
{
  "ok": true,
  "added": true,
  "n_added": 1,
  "per_image": [
    {"sim_chosen": 0.82, "sim_other": 0.71, "other_name": "Mai góc sân", "ok": true}
  ],
  "reason": "1/1 ảnh xác thực đạt"
}
```

### 7.3 POST /api/enroll

**Request:**
```
POST /api/enroll
Content-Type: multipart/form-data

name: "Sứ gốc to"
files[]: <JPEG file 1>
files[]: <JPEG file 2>
files[]: <JPEG file 3>
files[]: <JPEG file 4>
lat: "10.7629"
lon: "106.6604"
acc: "5.0"
source: "phone"
```

**Success Response:**
```json
{
  "ok": true,
  "tree_id": "xyz789",
  "n_views_added": 4,
  "total_trees": 15
}
```

**Error 409 (heterogeneous):**
```json
{
  "ok": false,
  "error": "Các ảnh có vẻ gồm NHIỀU cây khác nhau",
  "heterogeneous": true
}
```

---

## 8. CHECKLIST IMPLEMENTATION

```
□ Phase 1: Setup & Configuration
  □ 1.1 Thêm ORILIFE_TREEID_URL vào .env/.env.example
  □ 1.2 Cài react-native-image-picker
  □ 1.3 Cài react-native-image-resizer
  □ 1.4 Thêm Android permissions
  □ 1.5 Rà iOS permissions

□ Phase 2: Core Utilities
  □ 2.1 compressImage()
  □ 2.2 createTreeIdentityFormData()
  □ 2.3 TreeIdentityAPI class
  □ 2.4 TypeScript models

□ Phase 3: Screens
  □ 3.1 TreeIdentityScreen
  □ 3.2 TreeEnrollScreen
  □ 3.3 TreeConfirmDialog
  □ 3.4 TreeManagementScreen

□ Phase 4: Integration
  □ 4.1 Navigation setup
  □ 4.2 GPS integration
  □ 4.3 Error handling
  □ 4.4 UI: factor breakdown
  □ 4.5 UI: warnings

□ Phase 5: Testing
  □ 5.1 Android test
  □ 5.2 iOS test
  □ 5.3 Edge cases
```

---

**Document status:** Planning only - NO code changes made
**Last updated:** 2026-06-03