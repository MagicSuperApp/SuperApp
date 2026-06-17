# OriLife Mobile App - Farm & Tree API Integration

## 📋 Tổng quan

Tài liệu này mô tả việc tích hợp Farm & Tree Management API vào OriLife Mobile App (Android + React Native).

**Ngày hoàn thành:** 2026-05-04  
**Phiên bản:** 1.0.0

---

## ✅ Đã triển khai

### **Phase 1: Android Database Migration**

#### **1.1. PendingTreeDetection - Thêm 6 fields mới**
```kotlin
// android/orilifesdk/src/main/java/com/mvp/orilife/database/PendingTreeDetection.kt
val farmId: String?           // FK to farm
val regionCode: String?       // e.g. "vn-south-01"
val geohash7: String?         // Geohash precision 7
val rowIdx: Int?              // Grid row index
val colIdx: Int?              // Grid column index
val treeMetadata: String?     // JSON: {"species":"durian","cultivar":"Monthong"}
```

#### **1.2. SavedTree - Thêm 9 fields mới**
```kotlin
// android/orilifesdk/src/main/java/com/mvp/orilife/database/SavedTree.kt
val farmId: String?
val regionCode: String?
val geohash7: String?
val latitude: Double?
val longitude: Double?
val rowIdx: Int?
val colIdx: Int?
val treeMetadata: String?
val serverSynced: Boolean     // Đã tạo trên server chưa?
```

#### **1.3. FarmEntity - Entity mới**
```kotlin
// android/orilifesdk/src/main/java/com/mvp/orilife/database/FarmEntity.kt
@Entity(tableName = "farms")
data class FarmEntity(
    @PrimaryKey val farm_id: String,
    val owner_did: String,
    val region_code: String,
    val farm_name: String?,
    val boundary_json: String,  // GeoJSON Polygon
    val lon_origin: Double?,
    val lat_origin: Double?,
    val row_spacing: Double?,
    val col_spacing: Double?,
    val created_at: Long,
    val updated_at: Long,
    val synced_at: Long?
)
```

#### **1.4. Database Migration 15→16**
- Thêm columns vào `saved_trees` và `pending_tree_detections`
- Tạo bảng `farms` mới
- Tạo indexes cho performance

---

### **Phase 2: Android API Layer**

#### **2.1. ApiResponse.kt - Envelope wrapper**
```kotlin
// android/orilifesdk/src/main/java/com/mvp/orilife/network/ApiResponse.kt
data class ApiEnvelope<T>(
    val statusCode: Int,
    val message: String,
    val error: Any?,
    val data: T?
)

class ApiException(val statusCode: Int, override val message: String)
```

#### **2.2. FarmAPI.kt**
```kotlin
// android/orilifesdk/src/main/java/com/mvp/orilife/network/FarmAPI.kt
class FarmAPI(baseUrl: String, apiKey: String) {
    suspend fun getFarms(): Result<FarmListData>
    suspend fun createFarm(request: FarmCreateRequest): Result<Farm>
    suspend fun getFarmById(farmId: String): Result<Farm>
    suspend fun getGridConfig(farmId: String): Result<GridConfigResponse>
    suspend fun setGridConfig(farmId: String, config: GridConfigRequest): Result<GridConfigResponse>
}
```

#### **2.3. TreeAPI.kt**
```kotlin
// android/orilifesdk/src/main/java/com/mvp/orilife/network/TreeAPI.kt
class TreeAPI(baseUrl: String, apiKey: String) {
    suspend fun createTree(request: TreeCreateRequest): Result<Tree>
    suspend fun getTreeById(treeId: String): Result<Tree>
    suspend fun getTrees(farmId: String?): Result<TreeListData>
}
```

#### **2.4. Data Models**
- `FarmModels.kt` - Farm, FarmCreateRequest, GridConfig
- `TreeModels.kt` - Tree, TreeCreateRequest

---

### **Phase 3: Android Upload Flow**

#### **3.1. GeohashHelper.kt**
```kotlin
// android/orilifesdk/src/main/java/com/mvp/orilife/utils/GeohashHelper.kt
object GeohashHelper {
    fun encode(latitude: Double, longitude: Double, precision: Int = 7): String
    fun decode(geohash: String): Pair<Double, Double>
    fun getBounds(geohash: String): Quadruple<Double, Double, Double, Double>
}
```

#### **3.2. Config.kt - Thêm API config**
```kotlin
// android/orilifesdk/src/main/java/com/mvp/orilife/Config.kt
val BASE_API_URL = BuildConfig.BASE_API_URL  // http://localhost:8001
val API_KEY = BuildConfig.API_KEY            // X-API-Key header
const val DEFAULT_REGION_CODE = "vn-south-01"
```

#### **3.3. TreeDetectionQueue - Upload flow mới**
```kotlin
// TRƯỚC (SAI):
uploadDetection() {
    sendSecureDetection()  // ❌ Gọi thẳng /ingest
}

// SAU (ĐÚNG):
uploadDetection() {
    ensureTreeExistsOnServer()  // ✅ Tạo tree trước
    sendSecureDetection()       // ✅ Sau đó mới ingest
}
```

**Logic `ensureTreeExistsOnServer()`:**
1. Check `SavedTree.serverSynced`
2. Nếu `false` → gọi `POST /trees`
3. Mark `serverSynced = true`
4. Return success

#### **3.4. enqueueDetectionWithMaskedImage - Thêm params**
```kotlin
suspend fun enqueueDetectionWithMaskedImage(
    // ... existing params ...
    farmId: String? = null,
    regionCode: String? = null,
    rowIdx: Int? = null,
    colIdx: Int? = null,
    treeMetadata: String? = null
)
```

---

### **Phase 4: React Native Real API**

#### **4.1. orilife-api.ts**
```typescript
// src/services/orilife-api.ts
class OriLifeAPIClient {
    // Farm APIs
    async getFarms(): Promise<Farm[]>
    async createFarm(request: FarmCreateRequest): Promise<Farm>
    async getFarmById(farmId: string): Promise<Farm>
    async setGridConfig(farmId: string, config: GridConfigRequest): Promise<void>
    
    // Tree APIs
    async createTree(request: TreeCreateRequest): Promise<Tree>
    async getTrees(params?: { farm_id?: string }): Promise<Tree[]>
    async getTreeById(treeId: string): Promise<Tree>
}
```

#### **4.2. farmSlice.ts - Thêm sync**
```typescript
// src/modules/trace/store/farmSlice.ts
export const syncFarmsFromBackend = createAsyncThunk(
  'farm/syncFarmsFromBackend',
  async (userId: string) => {
    const backendFarms = await oriLifeAPI.getFarms({ owner_did: userId });
    for (const farm of backendFarms) {
      await database.saveFarm(farm);
    }
    return backendFarms;
  }
);
```

#### **4.3. Environment Configuration**
```bash
# .env
ORILIFE_API_URL=http://localhost:8001
ORILIFE_API_KEY=mock-local-api-key
ORILIFE_REGION_CODE=vn-south-01
```

---

## 🔄 **FLOW MỚI - End-to-End**

### **1. Onboarding (Lần đầu sử dụng app)**
```
User mở app lần đầu
  ↓
Check farm đã có chưa (GET /farms)
  ↓
Nếu chưa → Tạo farm (POST /farms)
  ↓
Set grid config (POST /farms/{farm_id}/grid-config)
  ↓
Lưu farm vào local DB
```

### **2. Scan Tree (Mỗi lần scan)**
```
User scan cây
  ↓
YOLO detect → Crop → Background removal
  ↓
Tạo treeId local (IdGenerator)
  ↓
Tính geohash_7 từ GPS (GeohashHelper)
  ↓
Enqueue detection với farm metadata:
  - farmId, regionCode, geohash7
  - rowIdx, colIdx (nếu có grid)
  - treeMetadata (species, cultivar)
  ↓
Lưu vào PendingTreeDetection
```

### **3. Upload (Background - UploadWorker)**
```
UploadWorker trigger
  ↓
Lấy pending detections
  ↓
Cho mỗi detection:
  ├─ Check SavedTree.serverSynced
  ├─ Nếu false:
  │   ├─ Tạo TreeCreateRequest
  │   ├─ POST /trees
  │   └─ Mark serverSynced = true
  ├─ POST /evidences/ingest
  └─ Mark detection success
```

---

## 📝 **CẤU HÌNH CẦN THIẾT**

### **Android (build.gradle)**
```gradle
android {
    defaultConfig {
        // Thêm vào buildConfigField
        buildConfigField "String", "BASE_API_URL", "\"http://localhost:8001\""
        buildConfigField "String", "API_KEY", "\"mock-local-api-key\""
    }
}
```

### **React Native (.env)**
```bash
ORILIFE_API_URL=http://localhost:8001
ORILIFE_API_KEY=mock-local-api-key
ORILIFE_REGION_CODE=vn-south-01
```

---

## 🧪 **TESTING**

### **Test Case 1: Tạo Farm**
```kotlin
val farmApi = FarmAPI(Config.BASE_API_URL, Config.API_KEY)
val request = FarmCreateRequest(
    farmId = "farm-test-001",
    ownerDid = "did:example:user-001",
    regionCode = "vn-south-01",
    farmName = "Test Farm",
    boundary = GeoJsonPolygon(
        type = "Polygon",
        coordinates = listOf(listOf(
            listOf(107.0, 10.0),
            listOf(107.1, 10.0),
            listOf(107.1, 10.1),
            listOf(107.0, 10.1),
            listOf(107.0, 10.0)
        ))
    )
)
val result = farmApi.createFarm(request)
```

### **Test Case 2: Tạo Tree**
```kotlin
val treeApi = TreeAPI(Config.BASE_API_URL, Config.API_KEY)
val request = TreeCreateRequest(
    id = "tree-test-001",
    regionCode = "vn-south-01",
    farmId = "farm-test-001",
    geohash7 = GeohashHelper.encode(10.12367, 107.12372),
    latitude = 10.12367,
    longitude = 107.12372,
    metadata = mapOf("species" to "durian", "cultivar" to "Monthong")
)
val result = treeApi.createTree(request)
```

### **Test Case 3: Upload Flow**
```kotlin
// Enqueue detection với farm metadata
val queue = TreeDetectionQueue.getInstance(context)
queue.enqueueDetectionWithMaskedImage(
    detection = detection,
    maskedImagePath = imagePath,
    boxCoordinates = floatArrayOf(0f, 0f, 1f, 1f),
    latitude = 10.12367,
    longitude = 107.12372,
    gpsAccuracy = 5.0f,
    heading = 180.0,
    pitch = -5.0,
    roll = 2.0,
    imageId = "img-001",
    treeId = "tree-001",
    farmId = "farm-test-001",
    regionCode = "vn-south-01",
    treeMetadata = """{"species":"durian","cultivar":"Monthong"}"""
)

// Trigger upload
queue.syncPendingDetections()
```

---

## ⚠️ **LƯU Ý QUAN TRỌNG**

### **1. Database Migration**
- App sẽ tự động migrate từ version 15 → 16
- Dữ liệu cũ được giữ nguyên
- Các field mới có giá trị `null` cho records cũ

### **2. Backward Compatibility**
- Code cũ vẫn hoạt động (các field mới là optional)
- Upload sẽ dùng default values nếu thiếu farm metadata
- `getDefaultFarmId()` fallback khi không có farm

### **3. Error Handling**
- Nếu `POST /trees` fail → retry
- Nếu `POST /ingest` fail → retry
- Nếu không có mạng → lưu local, sync sau

### **4. Performance**
- Geohash tính 1 lần khi enqueue
- Tree creation check cache (serverSynced flag)
- Batch upload với SYNC_BATCH_SIZE = 5

---

## 📊 **METRICS & MONITORING**

### **Logs quan trọng**
```
✅ Tree created on server: tree-xxx
✅ Tree already synced: tree-xxx
❌ Failed to create tree: error message
📤 UPLOAD_ATTEMPT: treeId=xxx, farmId=xxx, geohash7=xxx
```

### **Database queries để monitor**
```sql
-- Trees chưa sync
SELECT * FROM saved_trees WHERE serverSynced = 0;

-- Pending detections
SELECT COUNT(*) FROM pending_tree_detections WHERE serverTreeId IS NULL;

-- Farms
SELECT * FROM farms;
```

---

## 🚀 **NEXT STEPS**

### **Immediate (Cần làm ngay)**
1. ✅ Test migration trên device thật
2. ✅ Test upload flow end-to-end
3. ✅ Verify backend nhận đúng data

### **Short-term (1-2 tuần)**
1. ⏳ Implement farm onboarding UI
2. ⏳ Add farm selection trong scan flow
3. ⏳ Sync farms từ backend khi app start

### **Long-term (1-2 tháng)**
1. ⏳ Grid visualization trên map
2. ⏳ Bulk tree creation
3. ⏳ Offline-first sync strategy

---

## 📞 **SUPPORT**

Nếu gặp vấn đề:
1. Check logs: `adb logcat | grep TreeDetectionQueue`
2. Verify database: `adb shell "run-as com.mvp.orilife sqlite3 /data/data/com.mvp.orilife/databases/measure_database"`
3. Test API: `curl -H "X-API-Key: mock-local-api-key" http://localhost:8001/farms`

---

**Tài liệu này được tạo tự động bởi Claude Code**  
**Phiên bản:** 1.0.0  
**Ngày:** 2026-05-04
