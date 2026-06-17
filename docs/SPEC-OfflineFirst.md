# SPEC-OfflineFirst — OriLife hoạt động offline trên điện thoại nông dân

> Phiên bản: 2026-06-10
> Phạm vi: `orilife-mobile-app` — kiến trúc 2 tầng (edge + cloud) cho vùng 4G yếu/mất mạng.
> Phụ thuộc: `src/services/treeReIDService.ts`, `src/services/animalReIDService.ts`,
> `src/services/syncService.ts`, `src/utils/database.ts`, `src/store/syncSlice.ts`

---

## §1. Kiến trúc 2 tầng

### Tổng quan

```
[Điện thoại nông dân]                    [Tiger Server + LampNet]
        │                                         │
   Tầng 1 (Edge)                           Tầng 2 (Cloud)
   ─────────────                           ──────────────
   EfficientNet-B0 INT8                    DINOv2 ViT-S (full)
   ~15MB, <100ms inference                 ~85MB, ≥96% top-1
   4-kênh embedding local                  Cardano anchor
   SQLite gallery + queue                  LampNet CID ghi vĩnh viễn
   Kết quả sơ bộ (73%)                    Xác nhận chính thức + fee_quote
        │                                         │
        └──── batch POST khi có mạng ────────────►│
        ◄──── delta sync + kết quả đã xác nhận ───┘
```

### Lý do không dùng DINOv2 trên thiết bị

| Tiêu chí | DINOv2 ViT-S | EfficientNet-B0 INT8 |
|---|---|---|
| Kích thước | ~85MB (unquantized) | ~15MB sau INT8 |
| Sau INT8 quantization | ~22MB (vẫn quá nặng) | ~15MB |
| Inference Snapdragon 665 | ~800–1200ms | <100ms |
| Accuracy top-1 same-species | ≥96% | ≥80% |
| RAM footprint | ~350MB | ~80MB |
| Phù hợp offline | Không — vừa nặng vừa chậm | Phù hợp |

DINOv2 là ViT (Vision Transformer) — attention tính toán bậc hai theo số patch, không thể chạy realtime trên mid-range Android 2021 (Snapdragon 665, 4GB RAM). EfficientNet-B0 được thiết kế theo MBConv blocks, tối ưu cho inference mobile. Khoảng cách 16 điểm phần trăm accuracy chấp nhận được vì đây chỉ là kết quả sơ bộ — kết quả chính thức vẫn từ server.

---

## §2. On-device model

### 2.1 Thông số kỹ thuật

```
Model:      EfficientNet-B0 với multi-head embedding projection
Format:     TFLite (Android) + CoreML (iOS)
Input:      224×224×3 RGB, normalized [0,1]
Output:     Tensor [4, 384] — 4 kênh embedding, mỗi kênh 384 chiều
            Kênh 0 = CTX  (bối cảnh không gian: tán lá, tổng thể)
            Kênh 1 = PLANT (thân/gốc cây — đặc trưng cấu trúc)
            Kênh 2 = BASE  (gốc rễ và vùng đất xung quanh)
            Kênh 3 = LEAF  (lá: màu sắc, gân lá, hình dạng)
            Với vật nuôi: BODY / FACE / MARK / BIO thay thế
Size:       ≤20MB (TFLite INT8), ≤18MB (CoreML INT8)
Inference:  <100ms trên Snapdragon 665 (target), <60ms trên Snapdragon 778G+
RAM usage:  ≤80MB khi inference
Accuracy:   ≥80% top-1 trên same-species test (DINOv2 ≥96% làm baseline)
Threshold:  cosine similarity ≥0.72 → MATCH sơ bộ; 0.55–0.72 → UNCERTAIN; <0.55 → NO_MATCH
```

### 2.2 Quy trình tạo model

**Bước 1 — Knowledge distillation từ DINOv2 teacher:**
```
Teacher:  DINOv2 ViT-S/14 (server, pretrained Facebook)
Student:  EfficientNet-B0 + 4-head projection layer (4×384 output)
Loss:     L = L_CE(student_logits, labels)
            + α × L_KD(student_embed, teacher_embed)   [α = 0.7]
            + β × L_cosine_align                        [β = 0.3]
Dataset:  Tập huấn luyện đã có tại Tiger server
          + augment: random crop, flip, color jitter, gaussian noise
Epochs:   100, lr=1e-3 cosine decay, batch=64
Validation: same-species split (20%), metric = top-1 accuracy
```

**Bước 2 — INT8 quantization:**
```python
# representative_dataset: 500 ảnh mẫu từ tập thực địa
converter = tf.lite.TFLiteConverter.from_saved_model(saved_model_dir)
converter.optimizations = [tf.lite.Optimize.DEFAULT]
converter.representative_dataset = representative_dataset_gen
converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
converter.inference_input_type = tf.int8
converter.inference_output_type = tf.float32  # output vẫn float để tính cosine
tflite_model = converter.convert()
```

**Bước 3 — Export đa platform:**
- Android: `model_efficientnet_b0_int8.tflite` → đặt trong `android/app/src/main/assets/`
- iOS: convert sang CoreML bằng `coremltools.convert(tflite_model, source='tensorflow')` → `EfficientNetB0ReID.mlmodel` → đặt trong `ios/OriLife/Resources/`

**Bước 4 — Validation trước khi release:**
```
Chạy benchmark trên:
  - Snapdragon 665 (Xiaomi Redmi 9, Android 10) — thiết bị baseline
  - Snapdragon 778G (Samsung A52s, Android 12)
  - Apple A15 Bionic (iPhone 13, iOS 16)
Tiêu chí pass: inference <100ms trên Snapdragon 665, accuracy ≥78% top-1
```

---

## §3. Local Gallery Schema

### 3.1 SQLite tables

Database file: `OriLife-<userDID_slug>.db` (đã có, xem `src/utils/database.ts`)

```sql
-- Bảng chính: cây/vật nuôi đã đăng ký trên thiết bị này
CREATE TABLE IF NOT EXISTS enrolled_entities (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type     TEXT NOT NULL CHECK(entity_type IN ('tree','animal')),
  entity_id       TEXT NOT NULL,  -- tree_id hoặc animal_did từ server
  name            TEXT,
  embedding       BLOB NOT NULL,  -- 4×384×4 bytes = 6144 bytes Float32 raw
  embedding_version TEXT DEFAULT 'efficientnet_b0_int8_v1',
  farm_id         TEXT,
  species         TEXT,           -- dành cho vật nuôi
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_sync       TEXT,           -- lần cuối được confirm từ server
  server_checksum TEXT,           -- SHA256 của embedding từ server để phát hiện drift
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_enrolled_type ON enrolled_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_enrolled_farm ON enrolled_entities(farm_id);

-- Hàng đợi sự kiện chờ sync lên server
CREATE TABLE IF NOT EXISTS pending_events (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type          TEXT NOT NULL CHECK(event_type IN (
                        'identify','enroll','verify_add','animal_identify','animal_enroll'
                      )),
  payload_path        TEXT NOT NULL,  -- đường dẫn tuyệt đối tới ảnh JPEG đã lưu local
  preliminary_result  TEXT,           -- JSON: {decision, confidence, matched_entity_id, matched_name}
  gps_lat             REAL,
  gps_lon             REAL,
  gps_acc             REAL,
  heading             REAL,
  pitch               REAL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at           TEXT,           -- NULL = chưa sync
  server_result       TEXT,           -- JSON từ server sau khi sync
  retry_count         INTEGER DEFAULT 0,
  last_error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_unsynced ON pending_events(synced_at)
  WHERE synced_at IS NULL;

-- Log mỗi lần sync batch
CREATE TABLE IF NOT EXISTS sync_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_size      INTEGER NOT NULL,
  event_ids       TEXT NOT NULL,      -- JSON array of pending_events.id
  server_response TEXT,               -- JSON tổng từ server
  discrepancies   TEXT,               -- JSON array: {event_id, offline_decision, online_decision}
  synced_at       TEXT NOT NULL DEFAULT (datetime('now')),
  duration_ms     INTEGER
);
```

### 3.2 Giới hạn kích thước gallery

```
Tối đa:     500 entities mỗi thiết bị
Embedding:  4 × 384 × 4 bytes = 6,144 bytes mỗi entity
Tổng:       500 × 6,144 = 3,072,000 bytes ≈ 3MB
Ảnh cache: Không lưu ảnh gốc vào gallery — chỉ lưu embedding
           Ảnh chụp pending: lưu tạm vào thư mục cache, xóa sau khi sync thành công
Vượt giới hạn: Xóa entity cũ nhất (last_sync xa nhất) → thông báo user
```

### 3.3 Mã hóa

SQLite Cipher (react-native-sqlcipher-storage) với khóa = SHA256(userDID + deviceId).
Không lưu khóa rõ ràng trong AsyncStorage; derive mỗi lần mở app.

---

## §4. Sync Protocol

### 4.1 Điều kiện kích hoạt sync

```
Trigger 1: App foreground, có kết nối (WiFi hoặc 4G với signal ≥ -100dBm)
Trigger 2: Sau mỗi lần chụp ảnh thành công nếu đang có mạng
Trigger 3: Timer 5 phút nếu có pending_events chưa sync (thay vì 30 giây như hiện tại)
Trigger 4: App about-to-background với pending queue > 0
```

### 4.2 Luồng sync chi tiết

```
1. Kiểm tra điều kiện:
   - database.isInitialized() === true
   - NetInfo.isConnected === true
   - pending_events WHERE synced_at IS NULL → lấy tối đa 20 bản ghi (ORDER BY id ASC)

2. Gom batch:
   - batch = pending_events[0..19]
   - Với mỗi event: đọc file ảnh tại payload_path, gắn kèm preliminary_result

3. POST /api/batch_identify:
   Request body (multipart/form-data):
     events[]        JSON metadata mỗi event (event_type, preliminary_result, gps, created_at)
     files[]         Tệp ảnh JPEG tương ứng (1-1 với events[])
     device_id       string
     batch_token     UUID v4 mỗi batch (để server idempotent)

4. Server xử lý:
   - Với mỗi event: chạy DINOv2 full, so với preliminary_result
   - Nếu khớp: confirm → trả kết quả cuối
   - Nếu lệch: override → trả kết quả mới + discrepancy flag
   - Ghi anchor Cardano cho các event type 'enroll'
   - Trả fee_quote tổng batch

5. Cập nhật local:
   - UPDATE pending_events SET synced_at = NOW(), server_result = <json> WHERE id IN batch_ids
   - Nếu server_result.discrepancy == true:
       INSERT INTO sync_log(discrepancies) — lưu để phân tích
       Cập nhật UI: thay kết quả sơ bộ bằng kết quả server
   - Xóa file ảnh cache tại payload_path (không cần giữ sau sync)

6. Incremental entity sync (delta):
   GET /api/entities/delta?since=<last_sync_timestamp>&farm_id=<id>
   - Server trả danh sách entity đã thay đổi kể từ last_sync
   - INSERT OR REPLACE vào enrolled_entities
   - Cập nhật last_sync timestamp

7. Conflict resolution:
   - Offline result khác online result → online thắng (server là source of truth)
   - Log discrepancy vào sync_log để model improvement
   - User thấy thông báo: "Kết quả đã được cập nhật sau xác nhận"
```

### 4.3 Xử lý lỗi và retry

```
Lỗi mạng (timeout, connection refused):
  - retry_count += 1
  - Retry tối đa 3 lần với exponential backoff: 30s → 2min → 10min
  - Sau 3 lần: giữ trong queue, chờ trigger tiếp theo

Lỗi server 5xx:
  - Retry sau 5 phút, tối đa 5 lần
  - Nếu vẫn fail: giữ event, thông báo user nếu pending > 24h

Lỗi server 4xx (validation, auth):
  - Không retry
  - last_error = response body
  - Đánh dấu event là 'failed_permanent'
  - Thông báo user: "Một số ảnh không thể gửi — [lý do]"

File ảnh không còn tồn tại tại payload_path:
  - Đánh dấu event là 'failed_missing_file'
  - Bỏ qua trong batch (không làm fail toàn batch)
```

---

## §5. React Native Implementation

### 5.1 File mới cần tạo

#### `src/services/offlineReIDService.ts`

```typescript
/**
 * offlineReIDService — Edge inference trên thiết bị
 *
 * Chạy EfficientNet-B0 INT8 qua TFLite (Android) hoặc CoreML (iOS).
 * Trả kết quả sơ bộ < 500ms.
 * Enqueue vào pending_events để sync sau.
 */

import { Platform } from 'react-native';
import { database } from '../utils/database';

export interface OfflinePreliminaryResult {
  decision: 'MATCH' | 'UNCERTAIN' | 'NO_MATCH' | 'EMPTY_GALLERY';
  confidence: number;          // cosine similarity cao nhất [0,1]
  matched_entity_id?: string;
  matched_name?: string;
  top3_candidates: Array<{
    entity_id: string;
    name?: string;
    similarity: number;
  }>;
  inference_ms: number;
  model_version: string;       // 'efficientnet_b0_int8_v1'
}

export interface OfflineIdentifyOptions {
  entity_type: 'tree' | 'animal';
  farm_id?: string;
  species?: string;
  gps_lat?: number;
  gps_lon?: number;
  gps_acc?: number;
  heading?: number;
  pitch?: number;
}

/**
 * identifyOffline — Nhận diện sơ bộ trên thiết bị, không cần mạng.
 *
 * 1. Load model TFLite/CoreML (lazy load lần đầu, cache sau)
 * 2. Preprocess ảnh: resize 224×224, normalize [0,1]
 * 3. Inference → embedding [4, 384]
 * 4. Cosine similarity với toàn bộ enrolled_entities cùng entity_type
 * 5. Trả top-3 candidates + decision
 * 6. Enqueue vào pending_events
 *
 * Trả về sau <500ms trên Snapdragon 665.
 */
export async function identifyOffline(
  imagePath: string,
  options: OfflineIdentifyOptions,
): Promise<OfflinePreliminaryResult> {
  // TODO: implement TFLite/CoreML inference
  // Native module bridge: NativeModules.OfflineReIDModule.infer(imagePath)
  // → trả Float32Array[4*384]
  throw new Error('NOT_IMPLEMENTED: cần build native module TFLite/CoreML');
}

/**
 * enqueueForSync — Đẩy event vào pending_events để sync khi có mạng.
 */
export async function enqueueForSync(
  imagePath: string,
  eventType: string,
  preliminaryResult: OfflinePreliminaryResult,
  options: OfflineIdentifyOptions,
): Promise<number> {
  return database.addPendingEvent({
    event_type: eventType,
    payload_path: imagePath,
    preliminary_result: JSON.stringify(preliminaryResult),
    gps_lat: options.gps_lat,
    gps_lon: options.gps_lon,
    gps_acc: options.gps_acc,
    heading: options.heading,
    pitch: options.pitch,
  });
}

/**
 * getPendingCount — Số event chưa sync.
 */
export async function getPendingCount(): Promise<number> {
  return database.countPendingEvents();
}

/**
 * computeEmbeddingDistance — Cosine similarity thuần TypeScript.
 * Dùng để test / fallback khi native module chưa có.
 *
 * a, b: Float32Array cùng độ dài.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom < 1e-8 ? 0 : dot / denom;
}

/**
 * THRESHOLD — ngưỡng quyết định sơ bộ.
 * Thấp hơn ngưỡng server (0.75) vì model nhẹ hơn.
 */
export const OFFLINE_THRESHOLD_MATCH     = 0.72;
export const OFFLINE_THRESHOLD_UNCERTAIN = 0.55;
```

#### `src/services/syncService.ts` (cập nhật file hiện có)

File hiện tại (`syncService.ts`) sử dụng fake delay và simulate random failure. Cần thay toàn bộ phần `syncToBlockchain` bằng:

```typescript
// Thay thế syncToBlockchain bằng:
private async flushPendingEvents(): Promise<void> {
  const events = await database.getPendingEvents({ limit: 20 });
  if (events.length === 0) return;

  const formData = new FormData();
  const validEvents: typeof events = [];

  for (const evt of events) {
    // Kiểm tra file còn tồn tại
    const exists = await RNFS.exists(evt.payload_path);
    if (!exists) {
      await database.markEventFailed(evt.id, 'missing_file');
      continue;
    }
    validEvents.push(evt);
    formData.append('events[]', JSON.stringify({
      id: evt.id,
      event_type: evt.event_type,
      preliminary_result: evt.preliminary_result,
      gps_lat: evt.gps_lat,
      gps_lon: evt.gps_lon,
      created_at: evt.created_at,
    }));
    (formData as any).append('files[]', {
      uri: evt.payload_path,
      type: 'image/jpeg',
      name: `evt_${evt.id}.jpg`,
    });
  }

  if (validEvents.length === 0) return;

  formData.append('batch_token', uuid.v4());

  const resp = await fetch(`${BASE_URL}/api/batch_identify`, {
    method: 'POST',
    headers: { Authorization: await getAuthHeader() },
    body: formData,
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const result = await resp.json();
  await database.markEventsSynced(validEvents.map(e => e.id), result);
  await syncDeltaEntities();  // incremental entity sync
}
```

#### `src/store/offlineSlice.ts`

```typescript
/**
 * offlineSlice — Redux state cho offline queue và sync status.
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface OfflineState {
  pendingCount: number;          // số pending_events chưa sync
  isSyncing: boolean;
  lastSyncAt: string | null;     // ISO timestamp
  lastSyncError: string | null;
  discrepancyCount: number;      // số lần offline khác online
  gallerySize: number;           // số entities trong local gallery
  galleryCapacityMax: number;    // 500
}

const initialState: OfflineState = {
  pendingCount: 0,
  isSyncing: false,
  lastSyncAt: null,
  lastSyncError: null,
  discrepancyCount: 0,
  gallerySize: 0,
  galleryCapacityMax: 500,
};

const offlineSlice = createSlice({
  name: 'offline',
  initialState,
  reducers: {
    setPendingCount: (state, action: PayloadAction<number>) => {
      state.pendingCount = action.payload;
    },
    setSyncing: (state, action: PayloadAction<boolean>) => {
      state.isSyncing = action.payload;
    },
    setSyncComplete: (state, action: PayloadAction<{ syncedAt: string; discrepancies: number }>) => {
      state.isSyncing = false;
      state.lastSyncAt = action.payload.syncedAt;
      state.lastSyncError = null;
      state.discrepancyCount += action.payload.discrepancies;
    },
    setSyncError: (state, action: PayloadAction<string>) => {
      state.isSyncing = false;
      state.lastSyncError = action.payload;
    },
    setGallerySize: (state, action: PayloadAction<number>) => {
      state.gallerySize = action.payload;
    },
  },
});

export const {
  setPendingCount,
  setSyncing,
  setSyncComplete,
  setSyncError,
  setGallerySize,
} = offlineSlice.actions;

export default offlineSlice.reducer;
```

### 5.2 Luồng trong app

```
User chụp ảnh
        │
        ▼
offlineReIDService.identifyOffline(imagePath, options)
  └── Load model (cached sau lần đầu, ~200ms)
  └── Preprocess: resize 224×224, normalize
  └── Inference: TFLite/CoreML → embedding [4×384]
  └── Query enrolled_entities cùng farm_id
  └── Cosine similarity với tất cả → sort → top-3
  └── Apply threshold → decision
        │
        ▼
Hiển thị ngay (<500ms):
  "Phân tích sơ bộ: Sầu riêng Ri6 (chưa xác nhận)"
  ResultBadge: màu vàng cho UNCERTAIN, xám cho MATCH sơ bộ
  FactorBreakdown: ẩn (offline không có factor breakdown)
        │
        ▼
enqueueForSync(imagePath, 'identify', prelimResult, options)
  └── INSERT INTO pending_events
  └── dispatch(setPendingCount(count + 1))
  └── Hiển thị icon "đang chờ đồng bộ" trên header
        │
        ▼
Background: syncService lắng nghe NetInfo
  Khi có mạng:
  └── flushPendingEvents() → POST /api/batch_identify
  └── Server chạy DINOv2, trả kết quả chính thức
  └── UPDATE pending_events SET synced_at, server_result
  └── dispatch(setSyncComplete)
        │
        ▼
UI cập nhật kết quả chính thức:
  "Đã xác nhận: Sầu riêng Ri6 (độ chính xác cao)"
  ResultBadge: màu xanh MATCH
  FactorBreakdown: hiển thị CTX/PLANT/BASE/LEAF từ server
  Nếu discrepancy: "Kết quả đã được cập nhật sau xác nhận"
```

### 5.3 Trạng thái UI khi offline

```
Trạng thái       Màu badge    Văn bản hiển thị
─────────────────────────────────────────────────────────────────
MATCH sơ bộ      Vàng         "Có thể là [tên] (chưa xác nhận)"
UNCERTAIN sơ bộ  Cam          "Không chắc chắn — cần xác nhận"
NO_MATCH sơ bộ   Đỏ nhạt      "Không nhận ra — cần đăng ký mới"
EMPTY_GALLERY    Xám          "Chưa có dữ liệu offline"
─────────────────────────────────────────────────────────────────
Sau sync server:
MATCH chính thức  Xanh        "Xác nhận: [tên] (độ chính xác cao)"
```

---

## §6. Attribute Profiler Offline

### 6.1 Mục đích

`attribute_profiler.py` trên server chiết xuất đặc trưng thị giác (màu sắc, kết cấu, hình dạng) để tạo tên tự động theo quy ước OriLife. Phần này port sang JavaScript (React Native) để hoạt động ngay khi chụp — không cần server.

### 6.2 Input / Output

```
Input:  ImageData từ Canvas API (RGBA Uint8ClampedArray)
Output: {
  dominant_colors: string[],   // ví dụ: ["xanh đậm", "nâu"]
  texture: string,             // "nhẵn" | "sần sùi" | "có vảy"
  shape_ratio: number,         // chiều cao / chiều rộng của bounding box
  suggested_name: string,      // "Cây-XanhĐậm-SầnSùi-01"
  color_histogram: number[],   // 12 bins (4 hue bins × 3 saturation levels)
}
```

### 6.3 Triển khai TypeScript (React Native — chạy trên JS thread)

```typescript
// src/utils/attributeProfiler.ts

/**
 * attributeProfiler — Chiết xuất đặc trưng thị giác, không cần server.
 *
 * Dùng Canvas API qua react-native-canvas hoặc expo-gl.
 * Chạy hoàn toàn trên JS thread — không cần native module.
 * Thời gian: <50ms cho ảnh 224×224.
 */

export interface AttributeProfile {
  dominant_colors: string[];
  texture_label: 'nhẵn' | 'sần sùi' | 'có vảy' | 'không xác định';
  shape_ratio: number;
  suggested_name: string;
  color_histogram: number[];  // 12 bins
}

/**
 * profileImage — phân tích RGBA pixel array.
 *
 * pixels: Uint8ClampedArray từ Canvas.getImageData()
 * width, height: kích thước ảnh (khuyến nghị dùng 224×224)
 */
export function profileImage(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): AttributeProfile {
  const histogram = new Array(12).fill(0);
  let totalPixels = 0;

  // Bước qua từng pixel (bỏ kênh alpha, bước 4 bytes)
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a < 128) continue;  // bỏ pixel trong suốt

    const [h, s, v] = rgbToHsv(r, g, b);

    // 4 hue bins: đỏ/cam (0–60°), xanh lá (60–180°), xanh dương (180–300°), tím/hồng (300–360°)
    const hueBin = Math.min(3, Math.floor(h / 90));
    // 3 saturation bins: xám (0–0.2), nhạt (0.2–0.6), đậm (0.6–1.0)
    const satBin = s < 0.2 ? 0 : s < 0.6 ? 1 : 2;

    histogram[hueBin * 3 + satBin]++;
    totalPixels++;
  }

  if (totalPixels > 0) {
    for (let i = 0; i < 12; i++) histogram[i] /= totalPixels;
  }

  // Tên màu chủ đạo (top 2 bins)
  const sorted = histogram
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v);

  const colorNames = [
    'đỏ-xám', 'đỏ-nhạt', 'đỏ-đậm',
    'xanh-lá-xám', 'xanh-lá-nhạt', 'xanh-lá-đậm',
    'xanh-dương-xám', 'xanh-dương-nhạt', 'xanh-dương-đậm',
    'tím-xám', 'tím-nhạt', 'tím-đậm',
  ];

  const dominant_colors = sorted.slice(0, 2).map(x => colorNames[x.i]);

  // Texture ước lượng qua variance của gradient đơn giản
  const texture_label = estimateTexture(pixels, width, height);

  // Shape ratio: bounding box của non-transparent pixels
  const shape_ratio = estimateShapeRatio(pixels, width, height);

  // Tên gợi ý
  const colorSlug = dominant_colors[0].replace(/-/g, '').slice(0, 10);
  const texSlug = texture_label === 'nhẵn' ? 'N' : texture_label === 'sần sùi' ? 'S' : 'V';
  const suggested_name = `Cây-${colorSlug}-${texSlug}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

  return { dominant_colors, texture_label, shape_ratio, suggested_name, color_histogram: histogram };
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rN = r / 255, gN = g / 255, bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rN)      h = ((gN - bN) / delta) % 6;
    else if (max === gN) h = (bN - rN) / delta + 2;
    else                 h = (rN - gN) / delta + 4;
    h = ((h * 60) + 360) % 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return [h, s, v];
}

function estimateTexture(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): AttributeProfile['texture_label'] {
  // Gradient magnitude trung bình (Sobel đơn giản trên grayscale)
  let totalGrad = 0, count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const gray = (pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114);

      const left  = (pixels[((y) * width + (x - 1)) * 4] * 0.299);
      const right = (pixels[((y) * width + (x + 1)) * 4] * 0.299);
      const top   = (pixels[((y - 1) * width + x) * 4] * 0.299);
      const bot   = (pixels[((y + 1) * width + x) * 4] * 0.299);

      const gx = right - left;
      const gy = bot - top;
      totalGrad += Math.sqrt(gx * gx + gy * gy);
      count++;
    }
  }

  const avgGrad = count > 0 ? totalGrad / count : 0;
  if (avgGrad < 8)  return 'nhẵn';
  if (avgGrad < 20) return 'sần sùi';
  return 'có vảy';
}

function estimateShapeRatio(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  let minX = width, maxX = 0, minY = height, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = pixels[(y * width + x) * 4 + 3];
      if (a > 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return w > 0 ? h / w : 1;
}
```

### 6.4 Tích hợp trong capture flow

```typescript
// Trong CaptureScreen, ngay sau khi chụp ảnh thành công:
import { profileImage } from '../utils/attributeProfiler';

// Render ảnh xuống Canvas 224×224 để lấy pixel data
const pixelData = await renderToOffscreenCanvas(imagePath, 224, 224);
const profile = profileImage(pixelData.data, 224, 224);

// Hiển thị ngay cho user (không cần chờ server):
setSuggestedName(profile.suggested_name);
setDominantColors(profile.dominant_colors);
// → "Tên gợi ý: Cây-XanhLáĐậm-S-3K7F"
```

Không cần native module cho phần này — Canvas API chạy trên JS thread React Native.

---

## §7. Ưu tiên triển khai

### 7.1 Phụ thuộc kỹ thuật

| Phụ thuộc | Gói npm | Ghi chú |
|---|---|---|
| SQLite | `react-native-sqlite-storage` | Đã có trong repo |
| SQLite mã hóa | `react-native-sqlcipher-storage` | Thay thế sqlite-storage khi cần mã hóa |
| TFLite Android | `react-native-fast-tflite` | Native module cần link |
| CoreML iOS | bridge native Swift/ObjC | Cần viết NativeModule |
| File system | `react-native-fs` | Kiểm tra file tại payload_path |
| Canvas offline | `react-native-canvas` | Cho attribute profiler |
| Network status | `@react-native-community/netinfo` | Đã có trong repo |
| UUID | `react-native-uuid` | Cho batch_token |

### 7.2 Thứ tự triển khai gợi ý

```
Phase 1 (không cần native module):
  P1.1 — pending_events schema thêm vào database.ts
  P1.2 — offlineSlice.ts (Redux)
  P1.3 — attributeProfiler.ts (JS thuần, chạy ngay)
  P1.4 — syncService.ts: thay fake delay bằng flushPendingEvents thật

Phase 2 (cần native module):
  P2.1 — Android: tích hợp react-native-fast-tflite, load model TFLite
  P2.2 — iOS: viết Swift NativeModule cho CoreML
  P2.3 — offlineReIDService.ts: triển khai identifyOffline() thật
  P2.4 — Tích hợp vào CaptureScreen + AnimalCaptureScreen

Phase 3 (model training):
  P3.1 — Knowledge distillation script (Python, chạy ở server)
  P3.2 — INT8 quantization + export TFLite/CoreML
  P3.3 — Benchmark trên thiết bị thực
  P3.4 — Tích hợp model file vào app bundle
```

---

## Checklist triển khai (10 items)

- [ ] **1. Schema database** — Thêm bảng `enrolled_entities`, `pending_events`, `sync_log` vào `src/utils/database.ts`; viết migration guard (`IF NOT EXISTS`); thêm phương thức `addPendingEvent`, `getPendingEvents`, `markEventsSynced`, `countPendingEvents`, `addEnrolledEntity`.

- [ ] **2. offlineSlice.ts** — Tạo `src/store/offlineSlice.ts` với các actions: `setPendingCount`, `setSyncing`, `setSyncComplete`, `setSyncError`, `setGallerySize`; đăng ký vào root reducer trong `src/store/index.ts`.

- [ ] **3. syncService.ts refactor** — Thay `syncToBlockchain` (stub với fake delay) bằng `flushPendingEvents` thật; tích hợp `react-native-fs` kiểm tra file tồn tại trước khi upload; thay timer 30s bằng 5 phút; thêm exponential backoff.

- [ ] **4. attributeProfiler.ts** — Tạo `src/utils/attributeProfiler.ts` theo spec §6.3; viết unit test 3 ảnh mẫu (cây xanh đậm, cây khô/nâu, ảnh blur); tích hợp vào màn hình chụp để hiển thị tên gợi ý ngay lập tức.

- [ ] **5. offlineReIDService.ts — stub** — Tạo `src/services/offlineReIDService.ts` với đầy đủ interface; `identifyOffline` trả kết quả mock hợp lý trong lúc chờ native module; `cosineSimilarity` hoạt động đúng; `enqueueForSync` gọi database thật.

- [ ] **6. Native module Android (TFLite)** — Tích hợp `react-native-fast-tflite`; đặt `model_efficientnet_b0_int8.tflite` vào `android/app/src/main/assets/`; bridge `NativeModules.OfflineReIDModule.infer(imagePath)` trả `Float32Array[1536]`; test inference time trên emulator và thiết bị thật.

- [ ] **7. Native module iOS (CoreML)** — Viết `OfflineReIDModule.swift`; đặt `EfficientNetB0ReID.mlmodel` vào `ios/OriLife/Resources/`; expose qua `RCTBridgeModule`; xử lý đúng orientation ảnh (CGImagePropertyOrientation); test inference time trên iOS Simulator và iPhone thật.

- [ ] **8. Local gallery matching** — Triển khai đầy đủ `identifyOffline`: query `enrolled_entities`, compute cosine similarity với tất cả, sort top-3, apply threshold để ra decision; giới hạn 500 entities; xử lý trường hợp gallery rỗng → `EMPTY_GALLERY`.

- [ ] **9. Batch sync API** — Thêm endpoint `POST /api/batch_identify` vào Tiger server (backend); trả per-event result với `discrepancy` flag; thêm `GET /api/entities/delta?since=&farm_id=` cho incremental sync; cập nhật `src/services/treeReIDService.ts` và `animalReIDService.ts` với hàm `batchIdentify`.

- [ ] **10. E2E test offline flow** — Test thủ công: bật airplane mode → chụp 5 ảnh → kiểm tra pending_events trong DB (5 bản ghi, synced_at IS NULL) → tắt airplane mode → đợi 5 phút → kiểm tra tất cả 5 đã sync (synced_at NOT NULL); kiểm tra UI hiển thị đúng trạng thái sơ bộ → chính thức; kiểm tra discrepancy log khi server override kết quả.
