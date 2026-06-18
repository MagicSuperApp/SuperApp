# Capture3D Redesign V2 — Build 52 Spec

> **Status:** Draft, build 52 (Ngày 2-3)
> **Owners:** Thư (Mobile/AI native) + Lợi (Backend) + Tùng (UI overlay)
> **Reviewer:** Lành (PM OriLife)

## Bối cảnh

Build 51 hoàn chỉnh giữ flow Capture3D **15 keyframes / 30 giây cố định**. Cơ sở toán học (tham khảo PROTOCOL § Capture3D):

- 360° quanh cây với FOV 70° + overlap 50% → cần ≥ 11 frames
- Gaussian Splatting + LiDAR depth fusion → 10-20 frames optimal
- Fruit detection cross-validate → 2-3 frames/quả × ~5-8 quả/cây = 10-25 frames
- Walking time 30s ở tốc độ 1 m/s ≈ 30m circumference → match 1.5-2m radius

**Tuy nhiên 15-frame fixed có 4 hạn chế field reality:**

1. **Xen canh + lá vướng** (Giang feedback) — outer orbit alone miss quả tán dưới
2. **Random angular distribution** — không guarantee đủ góc Đông/Tây/Nam/Bắc
3. **No tier coverage** — không biết frame nào ngước lên / ngang / chếch xuống
4. **Silent failure** — user không biết frame nào "đủ" / "chưa đủ"

## Mục tiêu Build 52

Redesign Capture3D với **24-slot system** + **rich per-frame metadata** + **per-slot UI feedback** để:

- Đủ coverage 24 góc/tier slot (8 horizontal × 3 vertical)
- Variable duration — không cố định 30s
- User feedback realtime: ✅/❌/⚠️ per slot
- Backend metadata đầy đủ cho AI training + 3D reconstruction

## 24-Slot System Definition

### Horizontal angles (8 slots, mỗi 45°)
- N (Bắc, 0°), NE (45°), E (Đông, 90°), SE (135°)
- S (Nam, 180°), SW (225°), W (Tây, 270°), NW (315°)

Detect từ camera heading via `CMMotionManager` compass + ARKit world orientation.

### Vertical tiers (3 slots)
- **Low** — camera pitch -10° đến +10° (tầm thấp, gốc cây + quả dưới)
- **Mid** — camera pitch +10° đến +30° (tầm trung, thân cây + cành)
- **High** — camera pitch +30° đến +60° (tầm cao, tán + quả tán dưới ngược lên)

Detect từ `CMDeviceMotion.attitude.pitch`.

### Distance bracket (optional refine, không phải slot riêng)
- **Near** — distance to trunk < 2.5m
- **Far** — distance to trunk ≥ 2.5m

Distance computed từ ARKit pose + trunk detection (LiDAR cluster center hoặc YOLO trunk bbox).

## Per-frame Metadata Schema (manifest 3dmesh/2.0)

```json
{
  "schema_version": "3dmesh/2.0",
  "frame_index": 7,
  "captured_at_ms": 1715942400123,
  "gps": {
    "lat": 12.6786,
    "lng": 108.0376,
    "accuracy_m": 4.2
  },
  "camera_pose": {
    "position_m": [1.85, 1.65, 0.42],
    "rotation_quat": [0.0, 0.707, 0.0, 0.707],
    "intrinsics": {
      "fx": 1465.3, "fy": 1465.3,
      "cx": 960.0, "cy": 540.0,
      "width": 1920, "height": 1080
    }
  },
  "camera_attitude": {
    "heading_deg": 87.5,
    "pitch_deg": 15.2,
    "roll_deg": 2.1
  },
  "slot": {
    "horizontal": "E",
    "vertical": "mid",
    "distance_bracket": "near"
  },
  "distance_to_trunk_m": 1.85,
  "estimated_camera_height_m": 1.65,
  "quality_metrics": {
    "sharpness_laplacian_var": 142.7,
    "exposure_mean": 0.52,
    "motion_blur_score": 0.08
  },
  "purpose": "both",
  "sensors_snapshot": {
    "accel_m_s2": [0.02, 9.78, 0.15],
    "gyro_rad_s": [0.001, 0.002, 0.0],
    "magnetic_uT": [22.1, -5.4, 35.7],
    "ambient_light_lux": 12500,
    "barometric_pressure_hpa": 1013.2
  }
}
```

### Field semantics

| Field | Compute method | Use case |
|---|---|---|
| `camera_pose.position_m` | ARKit `ARFrame.camera.transform` | 3D reconstruction (NeRF/3DGS) |
| `camera_attitude.heading_deg` | CMMotionManager + ARKit fused | Slot assignment horizontal |
| `camera_attitude.pitch_deg` | CMMotionManager pitch | Slot assignment vertical |
| `distance_to_trunk_m` | LiDAR cluster centroid OR YOLO trunk bbox depth | Distance bracket + size estimate |
| `estimated_camera_height_m` | Barometer delta from `ARFrame.lightEstimate.ambientIntensity` reference OR pose Y | Vertical reference cho future ground plane |
| `quality_metrics.sharpness_laplacian_var` | `cv::Laplacian().variance()` trên Y channel | Frame purpose classifier — sharper = training candidate |
| `quality_metrics.exposure_mean` | Mean luminance frame | Reject over/under-exposed |
| `quality_metrics.motion_blur_score` | Gyro angular velocity at capture instant | Reject high-blur frames |
| `purpose` | Classifier (see below) | Backend dataset partitioning |

## Frame Purpose Classifier Algorithm

```python
# Run after capture session ends, before bundle TAR
def classify_frame(frame_meta, fruit_detections):
    sharpness = frame_meta.quality_metrics.sharpness_laplacian_var
    exposure = frame_meta.quality_metrics.exposure_mean
    blur = frame_meta.quality_metrics.motion_blur_score
    fruits_visible = [d for d in fruit_detections if d.frame_index == frame_meta.frame_index]
    max_fruit_conf = max([d.confidence for d in fruits_visible], default=0.0)

    # Discard nếu chất lượng quá kém
    if sharpness < 50.0 or blur > 0.5 or exposure < 0.15 or exposure > 0.85:
        return "discard"

    # Evidence: quả visible confidence cao
    is_evidence = max_fruit_conf >= 0.7

    # Training candidate: sharpest + well-exposed + diverse angle
    is_training = (
        sharpness >= 100.0 and
        0.3 <= exposure <= 0.75 and
        blur <= 0.2
    )

    if is_training and is_evidence: return "both"
    if is_training: return "training_candidate"
    if is_evidence: return "evidence"
    return "discard"  # acceptable quality but no fruit + not best-of-slot
```

**Slot dedup:** sau khi classify, mỗi (horizontal × vertical) slot giữ ≤ 3 frames:
- 1 best `training_candidate` (highest sharpness)
- 1 best `evidence` per detected fruit
- 1 backup `both` nếu có

→ Bundle final ~30-50 frames (vs 15 fixed hiện tại), variable size theo cây.

## UI Overlay (Tùng)

```
┌─────────────────────────────────────┐
│  🎥 Đang chụp ảnh 3D — Cây #3       │
│                                     │
│  [Live camera preview]              │
│                                     │
│  Tầm cao:  ✅ N  ✅ E  ❌ S  ❌ W   │
│  Tầm trung: ✅ N  ✅ NE ✅ E ⚠️ SE  │
│  Tầm thấp:  ✅ N  ❌ E  ❌ S  ❌ W  │
│                                     │
│  Tiến độ: 9/24 góc (37%)            │
│  ━━━━━━━━━░░░░░░░░░░░░░░░░░       │
│                                     │
│  Hướng dẫn: Đi tiếp sang phải +     │
│  ngước máy lên một chút.            │
│                                     │
│  [⏸ Dừng]              [✓ Hoàn thành│
│                          (cần ≥ 16)] │
└─────────────────────────────────────┘
```

**Realtime navigation hint:** dựa nearest empty slot, AppBuilder suggest direction:
- Empty slot SE-mid + current heading 270° → "Đi tiếp sang phải"
- Empty slot N-high + current pitch 10° → "Ngước máy lên một chút"

## Database Schema Migration (Lợi)

```sql
ALTER TABLE captures ADD COLUMN slot_coverage_json JSONB;
-- Stores: { "N-low": 1, "N-mid": 2, ..., "NW-high": 0 } slot occupancy

ALTER TABLE captures ADD COLUMN frames_extracted_json JSONB;
-- Stores: per-frame purpose classification + quality_metrics

CREATE INDEX idx_captures_slot_coverage ON captures USING GIN (slot_coverage_json);
```

## Effort Estimate

| Component | Owner | Effort |
|---|---|---|
| Capture3DCoordinator 24-slot logic + classifier | Thư | 12h |
| ARKit pose → slot mapping + distance computation | Thư | 6h |
| Per-frame metadata extraction (sharpness, blur, exposure) | Thư | 4h |
| UI overlay 24-slot grid + nav hint | Tùng | 10h |
| Backend manifest 3dmesh/2.0 ingest + slot_coverage schema | Lợi | 6h |
| Backend frame purpose API + extraction sidecar | Lợi | 8h |
| QA + field test Đắk Lắk | Lành + Giang | 6h |
| **Total** | | **~52h, ~2-3 ngày** |

## Acceptance Criteria

- [ ] 24-slot overlay hiển thị realtime trên capture screen
- [ ] User hiểu rõ slot nào đã chụp / chưa / cần làm lại
- [ ] Min 16/24 slots → Finish button enable (66% coverage)
- [ ] Bundle manifest 3dmesh/2.0 chứa per-frame metadata đầy đủ
- [ ] Backend classifier label per-frame purpose chính xác > 90%
- [ ] Walking duration giảm trung bình 30% (vs blind 30s fixed)
- [ ] AI training dataset export pipeline ready (sẽ ship parallel Build 52)
