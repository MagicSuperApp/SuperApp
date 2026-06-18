# SPEC-ReID-Unified — Nhận diện cây & vật nuôi (Tree + Animal ReID)

> Phiên bản: 2026-06-09  
> Phạm vi: `orilife-mobile-app` — module ReID cho cả cây và vật nuôi.  
> Tham khảo: `src/services/treeReIDService.ts`, `src/services/animalReIDService.ts`,
> `src/components/reid/`, `src/screens/TreeIdentityScreen.tsx`, `src/screens/AnimalIdentityScreen.tsx`

---

## §0. Tổng quan

Module ReID cung cấp khả năng nhận diện lại cá thể (cây hoặc vật nuôi) từ ảnh chụp ngoài thực địa, không cần tem hoặc QR.

```
OriLife mobile app
  └── ReID module
        ├── Tree ReID  — nhận diện cây (iOS: native bridge + 2-round capture)
        └── Animal ReID — nhận diện vật nuôi (cả 2 platform: image picker)
```

**Nguyên tắc cốt lõi:**
- Server ẩn nội tạng với Animal ReID (không trả `similarity/margin/factors`).
- Tree ReID trả `factors` (CTX/PLANT/BASE/LEAF) để người dùng hiểu tại sao.
- 5 quyết định dùng chung, chỉ nhãn văn bản khác nhau theo context.
- iOS dùng `NativeCameraPreview` (bridge native) cho Tree ReID; Android dùng image picker cho mọi trường hợp.

---

## §1. Kiến trúc

### 1.1 Phân tầng component

```
Screens (UI + state)
  ├── TreeIdentityScreen      — Tree ReID, iOS native bridge
  ├── AnimalIdentityScreen    — Animal ReID, image picker
  ├── TreeEnrollScreen        — Đăng ký cây mới (sau NO_MATCH)
  └── AnimalEnrollScreen      — Đăng ký cá thể mới (sau NO_MATCH)

Components shared (src/components/reid/)
  ├── ResultBadge             — Badge màu 5 quyết định
  ├── FactorBreakdown         — Biểu đồ 4 tín hiệu (CHỈ Tree)
  └── ReidConfirmDialog       — Modal chọn cá thể khi UNCERTAIN

Services (src/services/)
  ├── treeReIDService.ts      — HTTP client Tree ReID
  ├── animalReIDService.ts    — HTTP client Animal ReID
  └── treeReIDNativeBridge.ts — iOS native bridge (camera + heading + round)
```

### 1.2 Shared vs Specific

| Thành phần | Tree | Animal |
|---|---|---|
| ResultBadge | Có (context='tree') | Có (context='animal') |
| FactorBreakdown | Có | Không |
| ReidConfirmDialog | Có | Có |
| NativeCameraPreview | Có (iOS only) | Không |
| image picker | Không (Android fallback) | Có (cả 2 platform) |
| GPS metadata | Có (gắn vào request) | Không |
| 2-round capture | Có | Không |

---

## §2. Tree ReID

### 2.1 API Contract

#### POST /api/identify
```
FormData:
  files[]    JPEG, tối đa 1280px mỗi chiều, bắt buộc ≥1 file
  lat?       float, vĩ độ GPS
  lon?       float, kinh độ GPS
  acc?       float, độ chính xác GPS (mét)
  heading?   float, hướng la bàn (độ)
  pitch?     float, góc nghiêng máy (độ)
  source     "phone" (cố định)

Response 200:
  ok:               boolean
  decision:         "MATCH"|"UNCERTAIN"|"NO_MATCH"|"EMPTY_BUCKET"|"MOVED"
  tree_id?:         string
  name?:            string
  code?:            string
  similarity:       float 0–1
  margin:           float
  factors:          { CTX, PLANT, BASE, LEAF }   // mỗi field float 0–1
  warnings:         string[]
  candidates:       [{ tree_id, name, code, sim, near_prev?, has3d?, anchor? }]
  moved_distance_m?: float
```

#### POST /api/enroll
```
FormData:
  name       string bắt buộc
  files[]    JPEG bắt buộc
  lat?, lon?, acc?, heading?, pitch?
  source     "phone"
  force?     "true" — bỏ qua kiểm tra trùng lặp

Response 200:
  ok:         boolean
  tree_id:    string
  n_views_added?:  number
  total_trees?:    number
  provenance?:     { code?, has3d?, anchor?, record_cid?, record_hash?, lampnet_view? }
```

#### POST /api/verify_add
```
FormData:
  tree_id    string bắt buộc
  files[]    JPEG bắt buộc

Response 200:
  ok:       boolean
  added?:   boolean
  n_added?: number
  total_trees?: number
  reason?:  string
  per_image?: [{ sim_chosen, sim_other, other_name?, ok }]
```

#### GET /api/trees
```
Header: Authorization: Bearer <token>

Response 200:
  trees: [{ tree_id, name, n_views, has3d, anchor }]
```

#### POST /api/delete
```
FormData: tree_id
```

#### POST /api/rename
```
FormData: tree_id, name
```

### 2.2 UX Flow

```
[Mở màn hình]
      │
      ▼
[Lượt 1 — Chụp thân cây]
  • Đi vòng quanh cây, chụp ≥4 góc khác nhau
  • iOS: NativeCameraPreview tự phát hiện góc chụp bằng heading sensor
  • Android: Alert hướng dẫn, dùng image picker chụp từng ảnh
      │
      ▼
[Lượt 2 — Chụp gốc/vỏ] (tuỳ chọn, có thể bỏ qua)
  • Chụp cận gốc cây ≥2 góc
      │
      ▼
[Nhấn "Nhận diện"] → Loading 45s timeout
      │
      ▼
[Kết quả] → hiện ResultBadge + FactorBreakdown
```

### 2.3 Xử lý 5 quyết định

| Decision | Màu | Nhãn | Hành động UI |
|---|---|---|---|
| MATCH | `#1b5e20` xanh lá | ✓ KHỚP | Hiện tên/code/similarity; nút "Thêm ảnh" (verify_add); nút "Xem hồ sơ" |
| UNCERTAIN | `#f9a825` vàng | ? CHƯA CHẮC | Mở ReidConfirmDialog với danh sách candidates |
| NO_MATCH | `#c62828` đỏ | ✗ CHƯA NHẬN RA | Nút "Đăng ký cây mới" → TreeEnrollScreen (truyền captures qua redux, KHÔNG qua params) |
| EMPTY_BUCKET | `#607d8b` xám | • CHƯA CÓ CÂY GẦN ĐÂY | Tương tự NO_MATCH — nút đăng ký mới |
| MOVED | `#1565c0` xanh dương | ➜ CÂY ĐÃ DỜI? | Hiện `moved_distance_m`; nút "Cập nhật vị trí" |

### 2.4 Xử lý lỗi 409

Server trả 409 kèm `code` và `existing_tree_id`:

| `error_code` | Xử lý |
|---|---|
| `duplicate_tree` | Hiện dialog "Cây này đã được đăng ký". Nút "Xem cây đó" dùng `existing_tree_id` để điều hướng |
| `heterogeneous` | Hiện cảnh báo "Ảnh chụp nhiều cây khác nhau — chỉ chụp 1 cây" |
| `flat` | Hiện cảnh báo "Chụp rõ hơn — ảnh quá phẳng, thiếu texture" |

```typescript
// Pattern xử lý 409
if (error.type === 'duplicate' && error.error_code === 'duplicate_tree') {
  // Dùng error.existing_tree_id để điều hướng
}
```

### 2.5 Factor Breakdown

Hiện khi `decision === 'MATCH'` hoặc `decision === 'UNCERTAIN'`.  
Component `FactorBreakdown` nhận `factors: FactorScores | null` và `visible: boolean`.

| Factor | Ý nghĩa | Ổn định theo thời gian |
|---|---|---|
| CTX | Bối cảnh GPS + bản đồ cây lân cận | Cao |
| PLANT | Đặc trưng tổng thể thân cây | Cao |
| BASE | Gốc + vỏ cây | Rất cao |
| LEAF | Tán lá | Thấp (biến đổi theo mùa) |

Ngưỡng màu thanh bar:
- ≥ 70% → xanh lá (`#1b5e20`) — tốt
- 50–69% → vàng (`#f9a825`) — tạm
- < 50% → đỏ (`#c62828`) — yếu (hiện icon cảnh báo)

---

## §3. Animal ReID

### 3.1 API Contract

#### POST /api/animal/identify
```
FormData:
  species    string: ga|lon|de|bo|vit|ngong|cho|meo|ca_dinh|ca_chep|...
             (service tự normalize: lowercase + replace space → _)
  farm_id    string bắt buộc
  image      JPEG đơn (1 file, key "image")

Response 200:
  ok:              boolean
  match:           boolean
  decision:        "MATCH"|"UNCERTAIN"|"NO_MATCH"|"EMPTY_FARM"|"MOVED"
  animal_did?:     string
  name?:           string
  candidate_count: number
  shoot_hint?:     string   // gợi ý chụp thêm góc

  // KHÔNG có: similarity, margin, factors (server ẩn nội tạng)
```

#### POST /api/animal/enroll
```
FormData:
  species    string
  farm_id    string
  name       string
  images[]   JPEG, 3–10 ảnh đa góc

Response 200:
  ok:           boolean
  animal_did:   string
  species:      string
  farm_id:      string
  n_images_added?: number
```

#### POST /api/animal/verify
```
FormData:
  animal_did  string
  image       JPEG đơn

Response 200:
  ok:          boolean
  match:       boolean
  animal_did:  string
  decision:    AnimalDecision
  shoot_hint?: string
```

#### GET /api/animal/list
```
Query params: farm_id?, species?, limit=20, offset=0

Response 200:
  animals: [{ animal_did, name?, species, farm_id, n_images?, created_at?, updated_at? }]
  total?: number
  offset?: number
  limit?: number
```

#### GET /api/animal/{animal_did}
```
Response 200: AnimalInfo (xem trên)
```

#### DELETE /api/animal/{animal_did}
```
Response 200: { ok: boolean }
```

### 3.2 UX Flow

```
[Mở màn hình]
  params: { species: string, farmId: string }
      │
      ▼
[Chụp 1 ảnh]
  • launchCamera (react-native-image-picker)
  • Cả iOS lẫn Android đều dùng image picker
  • Không dùng NativeCameraPreview
      │
      ▼
[Preview ảnh vừa chụp] + nút "Nhận diện" + nút "Chụp lại"
      │
      ▼
[Loading] → POST /api/animal/identify
      │
      ▼
[Kết quả] → ResultBadge (context='animal')
  + shoot_hint nếu có
```

### 3.3 Xử lý 5 quyết định

| Decision | Màu | Nhãn | Hành động UI |
|---|---|---|---|
| MATCH | `#1b5e20` | ✓ NHẬN RA | Hiện tên con; nút "Xem hồ sơ"; nút "Chụp lại" |
| UNCERTAIN | `#f9a825` | ? CHƯA CHẮC | Mở ReidConfirmDialog (context='animal') |
| NO_MATCH | `#c62828` | ✗ CHƯA NHẬN RA | Nút "Đăng ký cá thể mới" → AnimalEnrollScreen |
| EMPTY_FARM | `#607d8b` | • TRẠI CHƯA CÓ CÁ THỂ | Tương tự NO_MATCH — nút đăng ký mới |
| MOVED | `#1565c0` | ➜ ĐÃ DI CHUYỂN? | Hiện thông tin; nút xem hồ sơ |

### 3.4 Hướng dẫn chụp theo loài

Hiện khi mở màn hình lần đầu (tooltip hoặc onboarding card):

| Loài | Góc bắt buộc | Lưu ý |
|---|---|---|
| Gà (`ga`) | Đầu, mặt bên, lưng | Chú ý mào và màu lông |
| Lợn (`lon`) | Mặt, tai, thân bên | Đặc điểm tai và vết bớt |
| Dê (`de`) | Mặt, sừng, thân | Hoa văn lông đặc trưng |
| Bò (`bo`) | Đầu, tai tag, thân | Dấu tai/tag nếu có |
| Cá dinh (`ca_dinh`) | Trên mặt nước, thân bên | Ánh sáng đều, tránh phản chiếu |
| Cá chép (`ca_chep`) | Thân bên, đầu | Vẩy và màu đặc trưng |

### 3.5 Sử dụng shoot_hint

`shoot_hint` là chuỗi tiếng Việt gợi ý từ server, hiện bên dưới ResultBadge:

```typescript
{shoot_hint && (
  <View style={styles.hintBox}>
    <Icon name="camera-enhance" size={14} color="#1565c0" />
    <Text style={styles.hintText}>{shoot_hint}</Text>
  </View>
)}
```

Ví dụ giá trị: "Chụp thêm góc mặt bên phải", "Cần ảnh rõ hơn tai trái".

---

## §4. Shared Components

### 4.1 ResultBadge

**File:** `src/components/reid/ResultBadge.tsx`

```typescript
interface ResultBadgeProps {
  decision: string;           // 'MATCH'|'UNCERTAIN'|'NO_MATCH'|'EMPTY_BUCKET'|'EMPTY_FARM'|'MOVED'
  context: 'tree' | 'animal'; // quyết định bảng nhãn dùng
  extra?: string;             // dòng phụ: tên cây/con, khoảng cách, v.v.
}
```

**Hành vi:**
- Màu nền: màu decision + opacity `1A` (10%), viền màu đặc.
- Icon MaterialCommunityIcons theo decision (xem bảng §2.3/§3.3).
- `extra` hiện bên dưới badge, tối đa 2 dòng.
- Fallback: decision không khớp → dùng màu xám muted.

### 4.2 FactorBreakdown

**File:** `src/components/reid/FactorBreakdown.tsx`

```typescript
interface FactorScores {
  CTX:   number; // 0–1
  PLANT: number;
  BASE:  number;
  LEAF:  number;
}

interface FactorBreakdownProps {
  factors: FactorScores | null;
  visible: boolean; // false → render null (không chiếm không gian)
}
```

**Hành vi:**
- Chỉ dùng cho Tree ReID, Animal ReID không dùng component này.
- Thanh bar thuần View (không cần thư viện chart), width tính theo `score * 100%`.
- Mỗi hàng: icon + tên factor + thanh bar + % + icon cảnh báo nếu < 50%.
- Chú thích ngưỡng màu ở cuối (≥70% tốt / 50–69% tạm / <50% yếu).
- `factors === null` hoặc `visible === false` → trả `null`.

### 4.3 ReidConfirmDialog

**File:** `src/components/reid/ReidConfirmDialog.tsx`

```typescript
interface ReidCandidate {
  id: string;           // tree_id hoặc animal_did
  name: string;
  code?: string;        // mã cây (tree)
  sim?: number;         // 0–1, hiện badge % màu theo ngưỡng
  near_prev?: boolean;  // badge "Gần đây"
  has3d?: boolean;      // badge "3D" (tree)
  anchor?: string;      // 'confirmed'|'pending' — badge "Neo" (tree)
  species?: string;     // loài (animal)
  n_views?: number;     // số ảnh đã lưu
}

interface ReidConfirmDialogProps {
  visible: boolean;
  context: 'tree' | 'animal';
  candidates: ReidCandidate[];
  onSelect: (id: string | 'new') => void; // 'new' = chọn đăng ký mới
  onDismiss: () => void;
}
```

**Hành vi:**
- Modal slide-up từ đáy màn hình, tối đa 82% chiều cao.
- Mỗi candidate: icon + tên + code/loài + n_views + badges (3D/Neo/Gần đây) + % tương đồng.
- Nút "Mới" (dạng dashed border) luôn có ở cuối danh sách.
- `onSelect('new')` → màn hình điều hướng đến Enroll.
- Khi `candidates.length === 0` → hiện empty state + hướng dẫn chọn Mới.
- Safe area inset: `Math.max(insets.bottom, 16)` padding dưới.

---

## §5. Services

### 5.1 treeReIDService

**File:** `src/services/treeReIDService.ts`

```typescript
// Tất cả function đều nhận baseUrl đầu tiên, auth token tự lấy từ AsyncStorage

identifyTree(baseUrl, imagePaths, options?): Promise<{ ok, data?: IdentifyResponse, error?: APIError }>
enrollTree(baseUrl, name, imagePaths, options?): Promise<{ ok, data?: EnrollResponse, error?: APIError }>
verifyAddTree(baseUrl, treeId, imagePaths): Promise<{ ok, data?: VerifyAddResponse, error?: APIError }>
getTrees(baseUrl): Promise<{ ok, trees?: TreeInfo[], error?: APIError }>
deleteTree(baseUrl, treeId): Promise<{ ok, error?: APIError }>
renameTree(baseUrl, treeId, name): Promise<{ ok, error?: APIError }>
```

**APIError types:**

| type | Khi nào |
|---|---|
| `network_error` | Mất mạng, timeout (45s) — retry 1 lần tự động |
| `auth_error` | HTTP 401 — token hết hạn |
| `validation_error` | HTTP 422 — FormData sai |
| `duplicate` | HTTP 409 — trùng lặp; xem thêm `error_code` + `existing_tree_id` |
| `rate_limited` | HTTP 429 — xem `retry_after_seconds` |
| `server_error` | HTTP 5xx |

### 5.2 animalReIDService

**File:** `src/services/animalReIDService.ts`

```typescript
identifyAnimal(baseUrl, species, farmId, imagePath): Promise<{ ok, data?: AnimalIdentifyResponse, error?: APIError }>
enrollAnimal(baseUrl, species, farmId, name, imagePaths): Promise<{ ok, data?: AnimalEnrollResponse, error?: APIError }>
verifyAnimal(baseUrl, animalDid, imagePath): Promise<{ ok, data?: AnimalVerifyResponse, error?: APIError }>
listAnimals(baseUrl, farmId?, species?, limit?, offset?): Promise<{ ok, animals?: AnimalInfo[], error?: APIError }>
getAnimal(baseUrl, animalDid): Promise<{ ok, data?: AnimalInfo, error?: APIError }>
deleteAnimal(baseUrl, animalDid): Promise<{ ok, error?: APIError }>
```

**Lưu ý quan trọng:** `species` được normalize tự động (`normalizeSpecies`): lowercase + space → underscore. Caller không cần chuẩn hóa trước.

---

## §6. Cấu hình

### 6.1 Biến môi trường (.env)

```env
# URL backend ReID (cùng server với toàn bộ OriLife backend)
ORILIFE_API_BASE_URL=https://staging-api.orilife.io   # staging
# ORILIFE_API_BASE_URL=https://api.orilife.io         # prod

# URL riêng cho iOS native bridge (TreeReID)
ORILIFE_TREEID_BASE_URL=https://test.orilife.io
ORILIFE_TREEID_URL=https://test.orilife.io/TreeIdentity
```

### 6.2 Pattern dùng trong code

```typescript
// Dùng @env (react-native-dotenv)
import { ORILIFE_API_BASE_URL } from '@env';

const BASE_URL: string = ORILIFE_API_BASE_URL ?? 'https://test.orilife.io';
// Fallback staging để tránh crash khi .env chưa set
```

### 6.3 Auth pattern

```typescript
// Service tự lấy token — caller không cần truyền token
// Key: 'auth_token' trong AsyncStorage
// Header: Authorization: Bearer <token>
// Nếu không có token → request vẫn gửi, server sẽ trả 401
```

---

## §7. Ghi chú Platform

### 7.1 iOS

**Tree ReID:**
- Dùng `NativeCameraPreview` (`requireNativeComponent`) — component native iOS.
- Kết hợp `TreeReIDBridge` (NativeModules) để điều khiển session chụp.
- Các sự kiện qua `NativeEventEmitter`: `HeadingUpdate`, `CaptureTriggered`, `RoundComplete`.
- Native bridge tự xử lý heading sensor, phát hiện khi nào đủ góc để chụp.

**Animal ReID:**
- Dùng `launchCamera` từ `react-native-image-picker` — giống Android.

### 7.2 Android

**Cả Tree ReID lẫn Animal ReID đều dùng image picker:**

```typescript
// Guard bắt buộc trong TreeIdentityScreen
if (Platform.OS === 'ios') {
  // Render NativeCameraPreview + native bridge
} else {
  // Render nút "Chụp ảnh" → launchCamera (react-native-image-picker)
  // Yêu cầu quyền: PermissionsAndroid.PERMISSIONS.CAMERA
}
```

**Quyền Android cần khai báo trong `AndroidManifest.xml`:**
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

### 7.3 Fallback khi react-native-image-picker chưa cài

`AnimalIdentityScreen` dùng dynamic require để không crash khi thư viện thiếu:

```typescript
const imagePicker = (() => {
  try { return require('react-native-image-picker'); } catch { return null; }
})();

// Khi imagePicker === null → hiện Alert placeholder thay vì launchCamera
```

---

## §8. Danh sách kiểm tra khi test

### 8.1 Tree ReID

- [ ] iOS: NativeCameraPreview hiển thị đúng, không crash khi mở màn hình
- [ ] iOS: Lượt 1 chụp ≥4 ảnh, lượt 2 chụp ≥2 ảnh, heading sensor phản hồi
- [ ] Android: Nút chụp mở camera picker, ảnh được load vào danh sách
- [ ] Gửi identify với GPS lat/lon/acc/heading/pitch đính kèm
- [ ] MATCH: ResultBadge xanh + FactorBreakdown hiện đúng %
- [ ] UNCERTAIN: ReidConfirmDialog mở, chọn candidate → gọi verifyAddTree
- [ ] UNCERTAIN: Chọn "Mới" → navigate TreeEnrollScreen, captures truyền qua redux
- [ ] NO_MATCH + EMPTY_BUCKET: Nút "Đăng ký cây mới" hoạt động
- [ ] MOVED: Hiện `moved_distance_m`, nút cập nhật vị trí
- [ ] 409 `duplicate_tree`: Dialog hiện đúng, nút "Xem cây đó" điều hướng đúng
- [ ] 409 `heterogeneous`: Cảnh báo đúng văn bản
- [ ] 409 `flat`: Cảnh báo đúng văn bản
- [ ] Timeout 45s: Hiện lỗi thân thiện, không crash
- [ ] Mất mạng: Retry 1 lần tự động, sau đó hiện lỗi

### 8.2 Animal ReID

- [ ] iOS + Android: launchCamera mở được camera
- [ ] Preview ảnh sau chụp, nút "Chụp lại" clear ảnh cũ
- [ ] Gửi identify với đúng species (đã normalize) + farm_id
- [ ] MATCH: Badge xanh + tên con, nút "Xem hồ sơ"
- [ ] UNCERTAIN: ReidConfirmDialog (context='animal') mở đúng
- [ ] NO_MATCH + EMPTY_FARM: Nút đăng ký mới
- [ ] shoot_hint: Hiện bên dưới ResultBadge khi có giá trị
- [ ] Không hiện similarity/margin/factors (ẩn nội tạng đúng spec)
- [ ] enroll với 3–10 ảnh: tất cả ảnh được gửi trong FormData key `images`
- [ ] listAnimals: pagination hoạt động (limit/offset)

### 8.3 Shared

- [ ] 401: Điều hướng về màn hình đăng nhập
- [ ] 429: Hiện thông báo chờ (dùng `retry_after_seconds` nếu có)
- [ ] 5xx: Hiện lỗi máy chủ thân thiện, nút "Thử lại"
- [ ] ReidConfirmDialog: empty candidates → hiện empty state đúng
- [ ] FactorBreakdown: `visible=false` → không chiếm không gian layout
- [ ] ResultBadge: decision không xác định → fallback màu xám, không crash
