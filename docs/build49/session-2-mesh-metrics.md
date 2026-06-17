# Session 2 — MeshMetrics (derived geometry + fruit attributes)

**Repo:** orilife-mobile-app worktree `/Users/ductiger/Projects/OriLifeTrace/3dmesh-video-wt-B`
**Branch:** `feature/mesh-metrics` base `v2.0-aladin-rebrand`
**Budget:** 4 giờ
**Agent tên:** MeshMetrics
**MUST READ FIRST:** [CONTRACT.md](CONTRACT.md) — đặc biệt § `derived_metrics:{}` schema

## Role

Bạn là MeshMetrics. Compute **derived geometry** từ ARMeshAnchor + per-fruit enrichment từ frames/poses. Output structured manifest fields cho training AI:
- Tree-level: height, canopy diameter, trunk axis, ground plane, volume estimate
- Fruit-level: distance from trunk, height from ground, angular position, size estimate, color sample, cluster
- Quality: composite score 0-1 cho server prioritize captures

KHÔNG đụng sensor collection (Session 1's), KHÔNG đụng UI (Session 3).

## Foundation (reuse)

- `Capture3DCoordinator.meshAnchors: [UUID: ARMeshAnchor]` — đã collect anchors
- `Capture3DMeshExporter` — đã có triangulation + texture sampling
- `Capture3DRaycaster.consume(...)` → `fruits_3d.json` (đã có position_3d, height_m, tier)
- `frames/NN.jpg` + `poses/NN.json` đã write trong sessionDir
- `Bundle3DAssembler` enumerate tự nhiên

## Deliverables

### File mới `ios/LocalPods/ScannerModule/Core/Capture3D/Metrics/`

1. **`MeshMetricsComputer.swift`** — main entry. Public:
   ```swift
   struct TreeMetrics {
       let heightM: Double
       let canopyDiameterM: Double
       let canopyHeightM: Double
       let trunkAxisWorld: simd_float3
       let trunkDiameterM: Double
       let groundPlaneYOffsetM: Double
       let volumeM3: Double
       let leafDensityScore: Double  // 0-1
   }
   func compute(anchors: [ARMeshAnchor], groundPlane: simd_float3?) -> TreeMetrics
   ```
   - Tree height = AABB.max.y - AABB.min.y
   - Canopy diameter = max(AABB.x_extent, AABB.z_extent)
   - Canopy height = height - estimated trunk height (heuristic: lowest 1/3 mesh density = trunk)
   - Trunk axis: PCA on bottom-third mesh vertices → principal Y eigenvector
   - Trunk diameter: best-fit cylinder horizontal cross-section ở y_offset_m + 0.5
   - Volume: mesh closed volume via tetrahedron sum (rough, accept negative due to non-closed)
   - Leaf density = vertex count / (volume × constant)

2. **`FruitEnricher.swift`** — input `fruits_3d.json` + `MeshMetrics` + frames/poses
   ```swift
   struct FruitEnriched {
       let fruitId: String
       let distanceFromTrunkM: Double
       let heightFromGroundM: Double
       let angularPositionDeg: Double
       let sizeEstimateCm: Double
       let colorSampleRgb: [UInt8]  // 3 bytes
       let clusterId: String?       // nullable nếu chưa detect cluster
       let reachableFromGround: Bool
   }
   func enrich(fruits: [FruitPosition3D], treeMetrics: TreeMetrics, frames: [URL], poses: [KeyframePose]) -> [FruitEnriched]
   ```
   - distance_from_trunk = horizontal distance position_3d → trunk_axis line
   - height_from_ground = position_3d.y - ground_plane_y_offset
   - angular_position = atan2(z_tree, x_tree) → degrees CCW from Z_tree (camera initial)
   - size_estimate_cm = bbox.w_norm × frame_resolution × scale_factor(depth) (heuristic)
   - color_sample_rgb = mean RGB inside bbox center 5×5 patch nearest keyframe
   - cluster_id: simple greedy — fruits within 50cm 3D distance → same cluster ("c0", "c1", ...) — Q5 expanded từ 30cm vì sầu riêng quả to spacing 30-80cm
   - reachable_from_ground = height_from_ground_m <= 2.0

3. **`CaptureQualityScorer.swift`** — composite quality 0-1 cho server prioritize
   ```swift
   struct CaptureQuality {
       let meshCoveragePct: Double
       let framesWithDetectionsCount: Int
       let thermalStateMax: String
       let sessionDurationS: Double
       let qualityScore: Double  // 0-1 weighted
   }
   ```
   - qualityScore = 0.4×meshCoverage + 0.3×(frames_with_det/15) + 0.2×(1.0 - thermal_penalty) + 0.1×(duration in [25,35]s)

### Modify `Capture3DCoordinator.swift`

- `finalizeBundling()`:
  - Sau `writeFruits()` + `writeDetections()` → run MeshMetricsComputer + FruitEnricher + QualityScorer
  - Pass result vào `writeManifest(..., derivedMetrics: ...)`
  - Persist `fruits_enriched_3d.json` trong sessionDir (optional separate file, hoặc gộp vào `fruits_3d.json` thay thế)

### Modify `writeManifest()`

```swift
private func writeManifest(videoPresent: Bool = true,
                            sensors: [String: Any]? = nil,
                            derivedMetrics: [String: Any]? = nil) throws {
    // ... existing ...
    if let sensors = sensors {
        manifest["sensors"] = sensors
    }
    if let derivedMetrics = derivedMetrics {
        manifest["derived_metrics"] = derivedMetrics
    }
}
```

Match CONTRACT § `derived_metrics:{}` exactly.

## File KHÔNG được đụng

- `Sensors/` directory (Session 1's)
- `Capture3DRaycaster.swift` (chỉ READ output, không modify)
- `Capture3DMeshExporter.swift` (read-only public API)
- All RN files
- `LocationHelper.swift`, `DetectionCoordinator.swift`

## Acceptance criteria

- [ ] `xcodebuild` Debug iphonesimulator → exit 0
- [ ] Capture trên iPhone Pro + cây thật → manifest.json có top-level `derived_metrics:{}` đầy đủ schema CONTRACT
- [ ] `tree.height_m` > 0 (mesh không empty)
- [ ] `fruits_enriched` array length = `fruits_3d` length
- [ ] mỗi fruit có `distance_from_trunk_m` reasonable (< canopy_diameter)
- [ ] mesh AABB empty → metrics return safe defaults (height=0, etc.), không crash
- [ ] PR description có sample manifest snippet

## Constraints

- Heuristics tốt v1 OK — không cần perfection. Mục tiêu là RICH data cho training, không phải UI display.
- Tất cả compute INLINE post-capture, không async background queue (giữ pipeline single-threaded predict).
- Trunk axis PCA — dùng simd_float3 manual eigendecomp HOẶC simplify: trunk = vertical line through AABB center bottom-third centroid.

## Khi xong

`git push origin feature/mesh-metrics` → PR target `v2.0-aladin-rebrand` title `feat(mesh-metrics): tree height/canopy/trunk + fruit enrichment + quality score (build 49)`.
