# Mesim — iOS LiDAR mesh capture + raycast fruit positions

**Repo:** `orilife-mobile-app` worktree `/Users/ductiger/Projects/OriLifeTrace/3dmesh-native-wt-A`
**Branch:** `feature/mesim-native` base `session-d/3d-capture`
**Budget:** 4 giờ
**MUST READ FIRST:**
1. [FOUNDATION.md](FOUNDATION.md) — Session D đã làm gì, code nào bạn EXTEND vs KEEP AS-IS
2. [CONTRACT.md](CONTRACT.md) — schema/protocol/event chung

## Role

Bạn là Mesim. **EXTEND Session D's 3D capture pipeline** (PR #14 đã merge, build pass) với LiDAR scene reconstruction + 3D fruit position. KHÔNG REWRITE — chỉ modify incremental.

**REUSE bắt buộc (đã có trong session-d/3d-capture):**
- `Capture3DCoordinator.swift` — state machine có sẵn, bạn MODIFY thêm sinks + mesh anchor collection + raycast hook
- `ARPoseProvider.swift` — protocol + ARKitPoseProvider có sẵn, bạn chỉ modify config (sceneReconstruction)
- `FrameSampler.swift` — KEEP AS-IS, đã đúng
- `Capture3DStore.swift` — KEEP AS-IS, SQLite local đã hoạt động
- `Bundle3DAssembler.swift` — KEEP AS-IS, TAR writer sorted enumeration sẽ tự pick up file mới
- `LampNetAPI.swift` — KEEP AS-IS, upload pipeline đã work
- `Upload3DQueue.swift` — KEEP AS-IS, Task.detached pipeline đã work
- `Capture3DBridgeModule.swift` — MODIFY chỉ thêm 2 events vào supportedEvents()

KHÔNG đụng UI (giao MeshView/MeshUX). KHÔNG đụng video (giao MesVid). KHÔNG deploy backend (giao MeshAPI/MeshGPU).

## Deliverables (file ownership của Mesim)

1. **MODIFY** `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DCoordinator.swift`:
   - Enable `ARWorldTrackingConfiguration.sceneReconstruction = .mesh`
   - Add property `sinks: [Capture3DFrameSink]` array
   - Call `sink.sessionStarted/Ended/consume` tại đúng điểm trong ARSession lifecycle
   - Per ARFrame: call all sinks với pixelBuffer + pose + intrinsics + timestamp
   - Collect `ARMeshAnchor[]` qua time, update mesh coverage
   - Khi capture finish: hand off mesh data cho `Capture3DMeshExporter`
   - Raycast YOLO bbox center qua mesh → 3D fruit positions, hand off cho `Capture3DRaycaster`
   - Emit bridge events: `onMeshUpdate { sessionId, coveragePercent, faceCount, fruitsDetected }`

2. **NEW** `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DFrameSink.swift`:
   - Protocol definition (xem CONTRACT § 9)
   - Public, để MesVid implement

3. **NEW** `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DMeshExporter.swift`:
   - Class `MeshExporter` consume `ARMeshAnchor[]` → write `mesh.obj` + `texture.png`
   - Texture sampling: project mỗi mesh face center vào camera frame nearest, sample color
   - Atlas packing: 1024×1024 atlas
   - Apple Metal OK nhưng simpler dùng CPU sampling (chấp nhận chậm hơn cho v1)

4. **NEW** `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DRaycaster.swift`:
   - Class `FruitRaycaster` consume YOLO `[YOLODetection]` per frame + camera pose + mesh
   - Per bbox: raycast từ camera center qua bbox center → intersection với mesh = 3D position (AR world)
   - Transform AR world → tree local coord (origin = mesh bounding box bottom-center, Y up)
   - Cluster raycasts của cùng quả qua nhiều frames (3D distance < 5cm) → 1 fruit_id + average position
   - Output `[FruitPosition3D]` struct conforming schema CONTRACT § 4
   - Write `fruits_3d.json` vào sessionDir

5. **MODIFY** `ios/LocalPods/ScannerModule/Core/Capture3D/Bundle3DAssembler.swift`:
   - Append `mesh.obj`, `texture.png`, `fruits_3d.json` vào TAR (sorted)
   - Update `manifest.json` thêm: `mesh_face_count`, `mesh_coverage_pct`, `device.has_lidar`

6. **MODIFY** `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DBridgeModule.swift`:
   - Add `supportedEvents` cho `onMeshUpdate` + `onVideoReady` (chưa emit `onVideoReady`, MesVid sẽ)
   - Emit `onMeshUpdate` từ Coordinator

7. **MODIFY** `ios/LocalPods/ScannerModule/ScannerModule.podspec`:
   - Đảm bảo `s.frameworks` có `'ARKit', 'Metal', 'SceneKit', 'ModelIO'`
   - **Append-only** — KHÔNG xóa entry hiện có

## File KHÔNG được đụng

`Capture3DVideoRecorder.swift`, `Capture3DVideoBridge.swift`, mọi `.tsx`, `.ts`, `TreeDetailScreen.tsx`, `FarmDetailScreen.tsx`, `Capture3DSessionScreen.tsx`, mọi file trong `src/`, `LocationHelper.swift`, `DetectionCoordinator.swift`, `UploadQueue.swift`, `VerifyAPI.swift`.

## T+00:00 → T+00:30 BLOCKING deliverable

Ship `Capture3DFrameSink.swift` protocol stub + push commit. MesVid bị block đến lúc này.

```swift
// File ship tại T+00:30
protocol Capture3DFrameSink: AnyObject {
    func consume(pixelBuffer: CVPixelBuffer, pose: simd_float4x4, intrinsics: simd_float3x3, timestamp: TimeInterval, frameIndex: Int?)
    func sessionStarted(sessionId: String, sessionDir: URL)
    func sessionEnded(success: Bool)
}
```

Commit message: `feat(mesim): Capture3DFrameSink protocol (unblock MesVid)`. Push origin.

## Acceptance criteria

- [ ] `xcodebuild -workspace aladin_mobile_fe.xcworkspace -scheme aladin_mobile_fe -configuration Debug -sdk iphonesimulator build` → exit 0
- [ ] Capture session trên iPhone 12 Pro+ → `mesh.obj` ≥1000 faces saved
- [ ] `fruits_3d.json` có ≥1 entry với `tier` đúng (`near` if height ≤2m else `far`)
- [ ] Bridge event `onMeshUpdate` emit ≥3 lần trong session
- [ ] Bundle TAR có `mesh.obj` + `texture.png` + `fruits_3d.json` (verify bằng `tar -tf`)
- [ ] manifest.json có `mesh_face_count > 0`, `mesh_coverage_pct > 0.3`, `device.has_lidar = true`
- [ ] KHÔNG có error Swift, KHÔNG có warning mới
- [ ] PR description liệt kê: files changed, KHÔNG đụng files, screenshot bundle structure

## Constraints (BẮT BUỘC)

- Device target: chỉ iPhone với LiDAR (12 Pro+). Non-Pro → throw "Cây này cần iPhone Pro" graceful error
- KHÔNG dùng 3rd-party paid SDK
- KHÔNG modify schema CONTRACT.md mà không hỏi Session A
- Build local pass TRƯỚC mỗi push (memory: `feedback_swift_build_local.md`)

## Khi xong

Push branch `feature/mesim-native` → tạo PR target `session-d/3d-capture` với title `feat(mesim): LiDAR mesh + texture + raycast fruit (3Dmesh phase 1)`. Tag Session A merge.
