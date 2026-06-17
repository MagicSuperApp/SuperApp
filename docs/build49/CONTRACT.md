# Build 49 — Rich Data Capture CONTRACT

> **4 sessions parallel** đọc file này TRƯỚC khi code. Không session nào được thay đổi schema mà không hỏi Session A.

## Bối cảnh

Build 48 v3 đã ship TestFlight (commit `875996f` trên fix/build48-3dmesh-hardening, merged vào v2.0-aladin-rebrand). Pipeline capture hiện tại có:
- ARKit pose + LiDAR mesh + camera intrinsics
- YOLO bbox per keyframe + 3D raycast position
- GPS lat/lng/accuracy
- Video 30s 1080p
- 15 keyframes JPEG + poses + depth

**Build 49 mục tiêu** — thu thập data RICH hơn cho training AI tương lai (MECE 8 buckets), giữ flag OFF default.

## Bundle schema EXTEND (manifest.json v1.2)

### NEW top-level field `sensors` (Session 1 SensorPack)

```json
"sensors": {
  "magnetometer": {
    "heading_degrees": 142.3,       // 0=North, 90=East, magnetic
    "true_heading_degrees": 145.1,  // true north (compass + declination correction)
    "accuracy_degrees": 3.5
  },
  "barometer": {
    "pressure_kpa": 100.32,
    "relative_altitude_m": 12.5     // chiều cao so với điểm "zero" lúc session start
  },
  "imu_motion": {
    "frames_per_sec": 60,
    "path_length_m": 4.2,            // tổng quãng đường device di chuyển 30s
    "max_lateral_speed_mps": 0.8,    // tốc độ tối đa khi đi vòng
    "rotation_deg": 358.7            // tổng góc quay quanh trục Y
  },
  "ambient_light": {
    "intensity_lumens": 950,         // ARKit ambientIntensity raw (lumens proxy 0-2000, default 1000). NOT lux — Q1 SensorPack clarification.
    "color_temperature_k": 5800,     // 5000-6500K cho daylight
    "estimated_from": "arkit_light_estimate"
  },
  "audio_summary": {
    "duration_s": 30.2,
    "peak_db": -12.5,                // -20dB tĩnh, -5dB rất ồn
    "wind_hint": false               // heuristic FFT detect wind noise
  },
  "device_orientation_log": [
    { "t_ms": 0, "orientation": "portrait" },
    { "t_ms": 15000, "orientation": "portrait" }
  ]
}
```

### NEW top-level field `derived_metrics` (Session 2 MeshMetrics)

```json
"derived_metrics": {
  "tree": {
    "height_m": 8.4,                 // mesh AABB Y
    "canopy_diameter_m": 6.2,        // max(AABB X, AABB Z)
    "canopy_height_m": 5.1,          // height từ branch lowest đến top
    "trunk_axis_world": [0.01, 1.0, 0.02], // unit vector y-up nominal
    "trunk_diameter_m": 0.32,        // best-fit cylinder fit base
    "ground_plane_y_offset_m": 0.0,  // mesh origin so với ground
    "volume_m3": 24.7,               // mesh closed volume estimate (rough)
    "leaf_density_score": 0.72       // mesh point density per volume
  },
  "fruits_enriched": [
    {
      "fruit_id": "...",             // match fruits_3d.json
      "distance_from_trunk_m": 1.8,
      "height_from_ground_m": 4.5,
      "angular_position_deg": 95.0,  // 0=front cây (direction Z_tree), CCW
      "size_estimate_cm": 18.5,      // bbox depth + scale
      "color_sample_rgb": [85, 65, 30],  // RGB tại bbox center
      "cluster_id": "c0",            // quả cùng cành (nếu detect được)
      "reachable_from_ground": true  // height < 2.0m
    }
  ],
  "capture_quality": {
    "mesh_coverage_pct": 0.85,
    "frames_with_detections_count": 12,
    "thermal_state_max": "nominal",
    "session_duration_s": 30.2,
    "quality_score": 0.78          // composite 0-1 cho server prioritize
  }
}
```

### NEW top-level field `tree_metadata` (Session 3 TreeMetadata)

```json
"tree_metadata": {
  "species": "Durio zibethinus",      // sầu riêng
  "variety": "Ri6",                    // farmer dropdown enum
  "age_years": 12,                     // farmer input
  "health_status": "healthy",          // enum 9 values (Q2 expanded): healthy | flowering | fruiting | pest_damage | nutrient_deficiency | diseased | dry | dead | unknown
  "last_harvest_date": "2024-08-15",  // ISO date or null
  "notes": "Cây ven bờ ao, lá xanh tốt", // free text Vietnamese
  "voice_memo_path": "file:///.../tree_metadata_voice.m4a",  // local file:// URI (TreeMetadata PR #21)
  "voice_memo_duration_s": 12.5,
  "voice_memo_recorded_at": "2026-05-16T07:00:00Z",
  "input_source": "manual",            // future: "ocr" | "import"
  "last_updated_at": "ISO8601"
}
```

### NEW field `social` (extend existing)

```json
"social": {
  "device_id": "...",                  // existing
  "tester_id": "quang-field-01",       // OPTIONAL — for internal team tagging
  "tester_role": "internal_field",     // enum: internal_field | internal_dev | external_beta | production
  "phoenix_did": "did:phoenix:..."     // existing optional
}
```

## Bundle file tree (extends § 1 from 3dmesh CONTRACT)

```
<session_id>.tar
├── manifest.json (schema v1.2 với sensors/derived_metrics/tree_metadata)
├── mesh.obj, texture.png, video.mp4
├── frames/00.jpg..14.jpg
├── poses/00.json..14.json
├── depth/00.bin..14.bin
├── fruits_3d.json
├── detections/all.json
├── sensors/                          [NEW Session 1]
│   ├── imu_motion.csv                // timestamp,accel_x,accel_y,accel_z,gyro_x,gyro_y,gyro_z 60Hz raw
│   ├── magnetometer_log.csv          // timestamp,heading,true_heading
│   └── audio.m4a                     // 30s AAC mono 22kHz (~150KB)
└── tree_metadata_voice.m4a           [NEW Session 3, optional]
```

## API extension — POST /captures/3d

Backend (MeshAPI Session 4) đón cùng `payload` flat structure (deviation A đã chốt) NHƯNG accept thêm fields:
- `sensors`: optional, store JSONB raw
- `derived_metrics`: optional, indexed (tree_height_m, canopy_diameter_m)
- `tree_metadata`: optional, denormalize vào trees table (species, variety, age_years, health)

## Session ownership boundaries

| Session | iOS files | RN files | Other |
|---|---|---|---|
| **1 SensorPack** | `ScannerModule/Core/Capture3D/Sensors/*.swift` (NEW), modify Coordinator.start/stop để hook | none | Manifest schema `sensors:{}` |
| **2 MeshMetrics** | `ScannerModule/Core/Capture3D/Metrics/*.swift` (NEW), `Capture3DMeshExporter.swift` (read), modify Coordinator.finalizeBundling để compute | none | Manifest schema `derived_metrics:{}` |
| **3 TreeMetadata** | none | `src/modules/trace/screens/TreeMetadataTab.tsx` (NEW), `src/modules/trace/screens/TreeDetailScreen.tsx` (add 4th tab) | DB schema extend trees |
| **4 BackendDeploy** | none | none | Deploy LampNet + merge MeshAPI PR #21 + run MeshGPU Tiger |

**No file overlap.** Mọi session merge clean vào v2.0-aladin-rebrand.

## Acceptance per session

Mỗi session phải:
- Build local PASS (`xcodebuild` Debug + `npx tsc --noEmit` 0 new error)
- Update manifest.json schema theo CONTRACT § này
- PR target v2.0-aladin-rebrand với description liệt kê:
  - Files changed
  - Manifest additions (JSON example)
  - Test instrumentation (sample log output)
- Backwards-compat: nếu field missing → defaults sensible, không crash
