# 3Dmesh CONTRACT — Single source of truth cho 6 session

> **MỌI session đọc file này TRƯỚC khi code.** KHÔNG session nào được thay đổi schema mà không hỏi Session A. Vi phạm = downstream session break.

## 1. Bundle TAR structure (output Mesim+MesVid → input MeshGPU+MeshView)

```
<session_id>.tar           (POSIX ustar, sorted entries, ~50-200MB)
├── manifest.json          (REQUIRED, schema § 2)
├── mesh.obj               (REQUIRED, ARKit Scene Reconstruction export)
├── texture.png            (REQUIRED, 1024×1024 atlas sampled từ camera frames)
├── video.mp4              (REQUIRED, 30s 1080p H.264 từ ARFrame.capturedImage)
├── frames/00.jpg..14.jpg  (REQUIRED, 15 keyframes, 1280px max, q=0.6)
├── poses/00.json..14.json (REQUIRED, schema § 3)
├── depth/00.bin..14.bin   (OPTIONAL, LiDAR depth maps Float32 BE)
├── fruits_3d.json         (REQUIRED, schema § 4)
└── detections/all.json    (OPTIONAL, raw YOLO per-frame bbox, schema § 5)
```

## 2. manifest.json schema

```json
{
  "schema_version": "3dmesh/1.0",
  "session_id": "uuid-v4",
  "tree_id": "uuid (FK trees.id)",
  "farm_id": "uuid (FK farms.id)",
  "captured_at": "ISO8601 UTC",
  "device": { "model": "iPhone 17 Pro", "os": "iOS 26.4", "has_lidar": true },
  "app_version": "2.0+47",
  "ar_engine": "ARKit",
  "frame_count": 15,
  "mesh_face_count": 12345,
  "mesh_coverage_pct": 0.85,
  "video_duration_s": 30.2,
  "video_fps": 30,
  "video_resolution": "1920x1080",
  "gps": { "lat": 11.93, "lng": 108.43, "accuracy_m": 4.2 },
  "auth": {
    "device_id": "string",
    "nonce": "string",
    "counter": 42,
    "timestamp": 1715758800,
    "bundle_hash": "sha256-hex",
    "signature": "ECDSA-P256-base64"
  }
}
```

## 3. poses/NN.json schema

```json
{
  "frame_index": 0,
  "timestamp_ms": 1715758800123,
  "matrix4x4_row_major": [16 floats],
  "intrinsics_3x3_row_major": [9 floats],
  "ar_tracking_state": "normal | limited | not_available"
}
```

## 4. fruits_3d.json schema (Mesim output)

```json
{
  "schema_version": "3dmesh/1.0",
  "tree_local_frame_origin": { "x": 0, "y": 0, "z": 0 },
  "tree_local_frame_axes": "y_up_z_forward",
  "fruits": [
    {
      "fruit_id": "uuid-v4-LOCAL",
      "position_3d": { "x": 0.12, "y": 1.45, "z": -0.34 },
      "height_m": 1.45,
      "confidence": 0.78,
      "bbox_frame_refs": [
        { "frame_index": 3, "bbox": [120, 200, 80, 90], "bbox_norm": [0.18, 0.27, 0.12, 0.12], "class": "durian", "class_id": 0, "conf": 0.87 }
      ],
      "raycast_method": "lidar_mesh | depth_estimate",
      "tier": "near | far"
    }
  ]
}
```

**Tier classification (Mesim):**
- `tier="near"` if `height_m <= 2.0` (tầm với farmer, server-side sẽ refine)
- `tier="far"` if `height_m > 2.0` (chấp nhận xấp xỉ)

## 5. detections/all.json schema (optional, debug)

```json
[
  { "frame_index": 0, "bboxes": [{ "x": 120, "y": 200, "w": 80, "h": 90, "class_id": 0, "conf": 0.87 }] }
]
```

## 6. API endpoints (MeshAPI implement)

### POST /captures/3d
Request:
```json
{
  "payload": { /* manifest.json + auth fields */ },
  "cid": "lamp://ln1q_..."
}
```
Response 201: `{ "capture_id": "uuid", "status": "uploaded_v1" }`
Response 401: invalid signature
Response 422: schema invalid

### GET /trees/{tree_id}/captures
Response 200:
```json
[
  { "capture_id": "uuid", "captured_at": "...", "cid_v1": "lamp://...", "cid_v2": null, "frame_count": 15 }
]
```

### GET /trees/{tree_id}/fruits
Response 200:
```json
{
  "tree_id": "uuid",
  "fruit_count": 7,
  "last_scanned_at": "ISO8601",
  "latest_mesh_cid": "lamp://...",
  "fruits": [
    {
      "fruit_id": "uuid",
      "position_3d": { "x": 0.12, "y": 1.45, "z": -0.34 },
      "position_3d_v2": null,
      "height_m": 1.45,
      "confidence": 0.78,
      "tier": "near",
      "status": "non | near_ripe | ripe | harvested",
      "first_detected_at": "ISO8601",
      "last_seen_at": "ISO8601",
      "evidence_count": 3
    }
  ]
}
```

### GET /fruits/{fruit_id}
Response 200:
```json
{
  "fruit_id": "uuid",
  "tree_id": "uuid",
  "position_3d": {...},
  "position_3d_v2": {...},
  "tier": "near",
  "status": "non",
  "first_detected_at": "...",
  "size_history": [
    { "captured_at": "...", "estimated_size_cm": 6.2 }
  ],
  "evidence": [
    {
      "capture_id": "uuid",
      "cid": "lamp://...",
      "captured_at": "...",
      "frame_refs": [3, 7]
    }
  ]
}
```

### PATCH /fruits/{fruit_id}
Request:
```json
{ "status": "harvested" }
```
hoặc
```json
{ "position_3d_override": { "x": 0.10, "y": 1.50, "z": -0.30 } }
```
Response 200: updated fruit object.

### Auth pattern (mọi endpoint)
- Header `X-API-Key: <api_key>` cho server-server
- Mobile dùng signature embedded trong `payload.auth` (giống EvidenceAPI)

## 7. DB schema (MeshAPI implement)

### trees (EXTEND additive nullable)
```sql
ALTER TABLE trees ADD COLUMN fruit_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trees ADD COLUMN last_scanned_at TIMESTAMP NULL;
ALTER TABLE trees ADD COLUMN latest_capture_id UUID NULL;
ALTER TABLE trees ADD COLUMN latest_mesh_cid TEXT NULL;
```

### captures (NEW)
```sql
CREATE TABLE captures (
  id UUID PRIMARY KEY,
  tree_id UUID NOT NULL REFERENCES trees(id),
  farm_id UUID NOT NULL REFERENCES farms(id),
  captured_at TIMESTAMP NOT NULL,
  device_id TEXT,
  gps_lat DOUBLE PRECISION, gps_lng DOUBLE PRECISION, gps_accuracy_m REAL,
  cid_v1 TEXT NOT NULL,
  cid_v2 TEXT NULL,
  frame_count INTEGER NOT NULL,
  mesh_face_count INTEGER,
  mesh_coverage_pct REAL,
  quality_score_v2 REAL NULL,
  ar_engine TEXT,
  app_version TEXT,
  raw_manifest JSONB,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_captures_tree ON captures(tree_id, captured_at DESC);
CREATE INDEX idx_captures_pending_v2 ON captures(captured_at) WHERE cid_v2 IS NULL;
```

### fruits (NEW)
```sql
CREATE TABLE fruits (
  id UUID PRIMARY KEY,
  tree_id UUID NOT NULL REFERENCES trees(id),
  position_3d JSONB NOT NULL,
  position_3d_v2 JSONB NULL,
  height_m REAL NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('near','far')),
  confidence REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'non' CHECK (status IN ('non','near_ripe','ripe','harvested')),
  first_detected_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL,
  estimated_size_cm REAL NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fruits_tree ON fruits(tree_id);

CREATE TABLE fruit_evidence (
  fruit_id UUID NOT NULL REFERENCES fruits(id) ON DELETE CASCADE,
  capture_id UUID NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  frame_indices INTEGER[] NOT NULL,
  PRIMARY KEY (fruit_id, capture_id)
);
```

### Trigger update trees.fruit_count
```sql
CREATE OR REPLACE FUNCTION recalc_tree_fruit_count() RETURNS TRIGGER AS $$
BEGIN
  UPDATE trees SET
    fruit_count = (SELECT COUNT(*) FROM fruits WHERE tree_id = COALESCE(NEW.tree_id, OLD.tree_id) AND status != 'harvested')
  WHERE id = COALESCE(NEW.tree_id, OLD.tree_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_fruits_recalc AFTER INSERT OR UPDATE OR DELETE ON fruits
  FOR EACH ROW EXECUTE FUNCTION recalc_tree_fruit_count();
```

## 8. Bridge events (Mesim+MesVid emit → MeshView+MeshUX subscribe)

### Existing (Session D) — KHÔNG đổi
- `onCapture3DProgress { stage, frameIndex }`
- `onCapture3DComplete { sessionId, cid }`
- `onCapture3DError { code, message }`

### NEW events (Mesim+MesVid add)
```typescript
onMeshUpdate {
  sessionId: string,
  coveragePercent: number,   // 0..1
  faceCount: number,
  fruitsDetected: number     // running count
}

onVideoReady {
  sessionId: string,
  durationS: number,
  bytes: number
}
```

## 9. Swift protocol (Mesim define, MesVid implement)

```swift
protocol Capture3DFrameSink: AnyObject {
    /// Called sync on session queue per ARFrame after Mesim consumed it.
    /// Sinks must process quickly (<5ms) or copy buffer for async work.
    func consume(
        pixelBuffer: CVPixelBuffer,
        pose: simd_float4x4,
        intrinsics: simd_float3x3,
        timestamp: TimeInterval,
        frameIndex: Int?  // nil = ARFrame, non-nil = sampled keyframe
    )
    
    /// Called when ARSession starts.
    func sessionStarted(sessionId: String, sessionDir: URL)
    
    /// Called when ARSession ends (success or cancel).
    func sessionEnded(success: Bool)
}
```

Mesim modify `Capture3DCoordinator` to support `sinks: [Capture3DFrameSink]` array. MesVid's `Capture3DVideoRecorder` adopts protocol.

## 10. Storage hierarchy (data flow)

```
Mobile capture (Mesim+MesVid):
  /Caches/3DCapture/<sessionId>/
    ├── mesh.obj, texture.png, video.mp4, frames/, poses/, depth/, fruits_3d.json
  ↓ Bundle3DAssembler tar
  /Caches/3DCapture/<sessionId>.tar
  ↓ LampNet upload
  cid = "lamp://ln1q_..."

Mobile metadata POST → orilife-core:
  POST /captures/3d { payload (manifest minimal), cid }
  → captures row created (cid_v1 = cid, cid_v2 = NULL, fruits_upserted = false)
  → trees.last_scanned_at + latest_capture_id + latest_mesh_cid updated
  → fruits NOT touched yet (payload không chứa fruits[] — nằm trong TAR)
  → mobile UI hiển thị "đang xử lý..." cho tree.fruit_count (limbo window vài phút)

Tiger server MeshGPU:
  poll DB → SELECT * FROM captures WHERE cid_v2 IS NULL ORDER BY created_at LIMIT 1
  → pull bundle from LampNet by cid_v1
  → extract fruits_3d.json → upsert fruits + fruit_evidence rows (radius 15cm match)
       (trigger recalc_tree_fruit_count fires → trees.fruit_count updated)
  → run gsplat reconstruction → upload v2 bundle → cid_v2
  → run triangulation → UPDATE fruits.position_3d_v2 cho tier=near
  → mark captures.processed_at = NOW()
  
Mobile pull:
  GET /trees/{id}/fruits → returns position_3d_v2 if available, else position_3d (v1)
  GET /fruits/{id} → returns evidence_cids → mobile fetches from LampNet for display
```

## 11. Naming conventions

| Component | Convention | Example |
|---|---|---|
| Swift class | UpperCamelCase | `Capture3DMeshExporter` |
| Swift file | match class | `Capture3DMeshExporter.swift` |
| TS component | UpperCamelCase | `FruitPickerSheet.tsx` |
| TS module | kebab-case dir | `src/components/tree-3d-viewer/` |
| Python file | snake_case | `gsplat_runner.py` |
| Python class | UpperCamelCase | `GsplatRunner` |
| DB table | snake_case plural | `captures`, `fruits`, `fruit_evidence` |
| DB column | snake_case | `position_3d_v2` |
| API route | kebab-case | `/captures/3d`, `/trees/{id}/fruits` |
| JSON field | snake_case | `position_3d`, `tree_id`, `captured_at` |
| Bridge event | camelCase | `onMeshUpdate` |

## 12. Coord conventions

- **AR world coord**: ARKit default Y-up, right-handed, origin = ARSession start point
- **Tree local coord**: origin = mesh bounding box bottom-center; Y up; Z forward (camera initial position)
- All `position_3d` in JSON = **tree local coord** (Mesim transforms before saving)
- All matrices in poses/NN.json = **AR world coord** (raw from ARKit)

## 13. Versioning

Schema version: `3dmesh/1.0`. Bump to `3dmesh/1.1` for backward-compatible additions. Bump to `3dmesh/2.0` for breaking changes.

Any session that detects bundle with unknown schema_version → reject with error, NOT silently process.
