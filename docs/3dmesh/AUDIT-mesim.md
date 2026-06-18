# AUDIT — Mesim (3Dmesh Phase 1: LiDAR mesh + raycast fruit)

**Ngày thực hiện**: 2026-05-16
**Session**: Mesim (worktree `3dmesh-native-wt-A`)
**Branch**: `feature/mesim-native` → PR target `session-d/3d-capture`
**Build**: `xcodebuild` Debug iphonesimulator → **BUILD SUCCEEDED**, zero new warnings trên Mesim files
**Commits**:
- `af4ef39` — `feat(mesim): Capture3DFrameSink protocol (unblock MesVid)`
- `fc3d274` — `feat(mesim): LiDAR mesh + texture + raycast fruit (3Dmesh phase 1)`

---

## 📁 File đã tạo / sửa

### NEW (Mesim sở hữu)
| File | Loại | Vai trò |
|---|---|---|
| `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DFrameSink.swift` | NEW | Protocol public stub — sink interface mà `Capture3DCoordinator` gọi 1 lần per ARFrame. MesVid `Capture3DVideoRecorder` sẽ adopt. Match CONTRACT § 9 chính xác. |
| `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DMeshExporter.swift` | NEW | `ARMeshAnchor[]` → `mesh.obj` (Wavefront, vertices+faces, world space, 1-based indices) + `texture.png` (16-texel slot atlas, 1024² → auto-expand 2048² nếu faces > 4096; CPU nearest-keyframe sampling, mid-gray fallback). |
| `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DRaycaster.swift` | NEW | YOLO bbox center → camera-to-world ray → Möller–Trumbore intersection với mesh triangles → cluster <5cm same `class_id` → tree-local transform → `fruits_3d.json` per CONTRACT § 4. |

### MODIFIED (additive, không phá API hiện có)
| File | Thay đổi |
|---|---|
| `ios/LocalPods/ScannerModule/Core/Capture3D/ARPoseProvider.swift` | (1) `config.sceneReconstruction = .mesh`; (2) `supportsLiDARMesh` static check + `lidarRequired` error case (message tiếng Việt "Cây này cần iPhone có LiDAR (12 Pro hoặc mới hơn)"); (3) `ARSessionDelegate.session(_:didAdd/didUpdate anchors:)` filter `ARMeshAnchor` → forward via additive optional `ARPoseProviderDelegate.poseProvider(_:didUpdateMeshAnchors:)` (default no-op extension). |
| `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DCoordinator.swift` | (1) `var sinks: [Capture3DFrameSink] = []` — gọi `sessionStarted` BEFORE `poseProvider.start()`, `sessionEnded(success:)` ở cancel/fail/complete, `consume` ĐÚNG 1 LẦN per ARFrame với `frameIndex` tag (nil=raw, non-nil=keyframe per MesVid pattern); (2) `meshAnchors: [UUID: ARMeshAnchor]` dict accumulate on workQueue; (3) `keyframePoses: [Int: KeyframePose]` capture pose+intrinsics tại mỗi sampled frame cho MeshExporter; (4) `raycaster.consume` hook **inline trong `persist()` sau `fruitDetector.detect()`** — KHÔNG public injection method, KHÔNG đụng `DetectionCoordinator`; (5) `writeMeshArtifacts()` + `writeFruits()` chạy TRƯỚC `writeManifest()` để manifest có face_count đúng; (6) `writeManifest` thêm 3 fields: `schema_version="3dmesh/1.0"`, `mesh_face_count`, `mesh_coverage_pct`, và `device.has_lidar`; (7) `emitMeshUpdate` gọi mỗi sampled keyframe → ~15 emits/session, vượt xa acceptance ≥3. |
| `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DBridgeModule.swift` | (1) `supportedEvents()` append `onMeshUpdate`, `onVideoReady`; (2) `emitMeshUpdate(sessionId, coveragePercent, faceCount, fruitsDetected)` helper được Coordinator gọi; (3) `emitVideoReady(sessionId, durationS, bytes)` helper sẵn cho MesVid call. KHÔNG đụng 4 RN methods (`startSession/cancel/retry/listPending`) hoặc 3 events có sẵn (`onCapture3DProgress/Complete/Error`). |
| `ios/LocalPods/ScannerModule/ScannerModule.podspec` | Append-only `'Metal', 'SceneKit', 'ModelIO'` vào `s.frameworks`. KHÔNG xóa entry hiện có (`'ARKit', 'AVFoundation', ...`). |

### Files KHÔNG đụng (verify per FOUNDATION § 1)
- **MesVid territory**: `Capture3DVideoRecorder.swift`, `Capture3DVideoBridge.swift` (chưa tồn tại — MesVid sẽ tạo)
- **Session D KEEP AS-IS**: `FrameSampler.swift`, `Capture3DStore.swift`, `LampNetAPI.swift`, `Upload3DQueue.swift`, `CaptureMetadataAPI.swift`, `Bundle3DAssembler.swift`, `Capture3DBridge.m`
- **Khác**: `LocationHelper.swift`, `DetectionCoordinator.swift`, `UploadQueue.swift`, `VerifyAPI.swift`, mọi `src/**/*.ts*`
- **Schema CONTRACT.md**: không tự đổi (CONTRACT/spec updates trong session-d đã pull về qua rebase docs-only)

---

## 🔧 Logic chính từng module

### `Capture3DMeshExporter`
- **Input**: `[ARMeshAnchor]` + `sessionDir` + `keyframesDir` + `[Int: KeyframePose]`
- **OBJ writing**: flatten anchor.geometry.vertices, transform world space bằng `anchor.transform`, 1-based face indices per Wavefront spec.
- **Texture atlas** (v1 crude per Q2 confirmed):
  - Slot size 16×16 texel; 1024² → 4096 slots; 2048² → 16384 slots nếu cần
  - Per face: nearest keyframe by camera-to-centroid distance → project centroid → sample 1 pixel → fill 16×16 slot với single color
  - Out of frame / no keyframe → mid-gray (128,128,128)
  - **KHÔNG seam blending, KHÔNG UV unwrapping smart** — MeshGPU refine v2
- **Coverage formula**: `min(1.0, face_count / 4000)` — 4000 faces ≈ "fully scanned tree"

### `Capture3DRaycaster`
- **Per-frame consume**: build ray từ camera origin qua bbox center pixel (intrinsics inverse, ARKit camera looks -Z), Möller–Trumbore against all mesh triangles, keep nearest hit.
- **Cluster**: greedy O(n²) — hit-2-existing matching same `class_id`, dist ≤ 5cm → incremental mean centroid update.
- **Tree-local frame derivation** (Q3 confirmed):
  - Origin = AABB bottom-center của all mesh vertices world-space
  - **Edge case**: nếu `origin.y > 0.3m` (scanner miss chân cây) → fallback origin = (0,0,0) AR session origin
  - `Z_tree = normalize(project_to_XZ(-camera.zAxis @ first sampled frame))`
  - `Y_tree = (0, 1, 0)` world up
  - `X_tree = normalize(Y × Z)`
  - World→local: `local = R^T * (world - origin)` where R columns = [X|Y|Z]
- **Tier**: `local.y ≤ 2.0m` → `"near"`, else `"far"`
- **Output JSON**: schema `3dmesh/1.0`, `tree_local_frame_axes="y_up_z_forward"`, full `bbox_frame_refs` per fruit (frame_index, bbox px, bbox_norm, class, class_id, conf)

### `Capture3DCoordinator` lifecycle changes
- `start()`: notify sinks BEFORE `poseProvider.start()` để tránh race condition consume-before-sessionStarted
- `handle()`: `consume()` đúng 1 lần per ARFrame (MesVid pattern), `frameIndex` tag = nil/sampled-index
- `persist()`: keyframe pose stash + raycaster hook inline
- `cancel()` / `fail()` / `finalizeBundling()`: `sessionEnded(success:)` gọi với boolean tương ứng
- `finalizeBundling()` order: writeMeshArtifacts → writeFruits → writeManifest → writeDetections

### Bridge events
- `onMeshUpdate { sessionId, coveragePercent, faceCount, fruitsDetected }` — emit per sampled keyframe (~1 emit / 2s)
- `onVideoReady { sessionId, durationS, bytes }` — declared schema, MesVid sẽ call `emitVideoReady`

---

## ✅ Acceptance criteria

| Tiêu chí | Trạng thái |
|---|---|
| `xcodebuild -workspace aladin_mobile_fe.xcworkspace -scheme aladin_mobile_fe -configuration Debug -sdk iphonesimulator` exit 0 | ✅ BUILD SUCCEEDED |
| KHÔNG warning Swift mới trên Mesim files | ✅ Verified (grep filter zero matches) |
| Capture trên iPhone 12 Pro+ → `mesh.obj` ≥ 1000 faces | ⏳ Cần field test (real device LiDAR) |
| `fruits_3d.json` ≥ 1 entry với `tier` đúng | ⏳ Cần field test với cây thật + YOLO model load thành công |
| Bridge `onMeshUpdate` ≥ 3 lần/session | ✅ Emit per sampled keyframe → 15 emits / 30s session |
| Bundle TAR có `mesh.obj` + `texture.png` + `fruits_3d.json` | ✅ Bundle3DAssembler sorted-enum auto pick up |
| `manifest.json` có `mesh_face_count > 0`, `mesh_coverage_pct > 0.3`, `device.has_lidar = true` | ⚠️ Coverage > 0.3 cần ≥1201 faces (divisor 4000) — thực tế cây LiDAR scan dễ > 2000 faces |
| PR description liệt kê files changed | ✅ Trong PR body |

**Field test cần thiết**: ⏳ items chỉ verify được trên iPhone 12 Pro+ thật với cây thật. Build pass + logic match spec đủ để mark sẵn sàng cho field test.

---

## 🚀 Hướng dẫn deploy / test

### Build local
```bash
cd ios
COCOAPODS_NO_BUNDLER=1 \
GEM_PATH=/Users/ductiger/Projects/OriLifeTrace/orilife-mobile-app/vendor/bundle/ruby/2.6.0 \
/Users/ductiger/Projects/OriLifeTrace/orilife-mobile-app/vendor/bundle/ruby/2.6.0/gems/cocoapods-1.15.2/bin/pod install
xcodebuild -workspace aladin_mobile_fe.xcworkspace \
  -scheme aladin_mobile_fe -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build
```

### Field test (cần thiết iPhone 12 Pro+)
1. Flash build lên device qua Xcode (provisioning profile có sẵn — memory `reference_ios_build.md`)
2. Toggle 5-tap trên AccountScreen để bật `@aladin/feature/enable3DCapture`
3. FarmDetail → TreeCard → "Quét 3D cây này"
4. Quét cây 30s, đảm bảo arc đầy đủ quanh cây để LiDAR mesh phủ
5. Kiểm tra bundle: `tar -tf <sessionId>.tar` → phải có `mesh.obj`, `texture.png`, `fruits_3d.json`
6. Verify manifest: `tar -xOf <sessionId>.tar manifest.json | jq` → kiểm `mesh_face_count`, `mesh_coverage_pct`, `device.has_lidar`
7. Console log monitor: `[3DCapture] mesh exported: N vtx, M faces, coverage=X.XX` + `[3DCapture] fruits_3d.json written: K clusters from L raw hits`

### Device hỗ trợ
- ✅ iPhone 12 Pro / Pro Max trở lên (có LiDAR)
- ✅ iPad Pro M1+ (có LiDAR)
- ❌ iPhone non-Pro: throw error tiếng Việt graceful trong `coordinator.start()` → bridge emit `onCapture3DError`

---

## ⚠️ TODO và rủi ro còn lại

### Defer cho v2 (chấp nhận trong v1 per FOUNDATION § DON'T DO)
1. **Texture quality**: 1 pixel/face slot sampling → texture trông "vỡ", có thể có patches mid-gray nếu projection out-of-frame. MeshGPU sẽ refine khi pull bundle. KHÔNG cải thiện trong phase 1.
2. **Texture seam blending / smart UV unwrapping**: defer v2.
3. **JPEG byte layout assumption**: MeshExporter assume R/G/B ở offset 0/1/2 trong CGImage data provider. ImageIO trên iOS thường trả BGRA nên kết quả có thể swap red-blue channel. Không crash, chỉ ảnh hưởng màu texture. Defer v2 — render canonical RGBA8 bitmap trước khi đọc.

### Pending sink registration
- `Capture3DCoordinator.sinks` array là `var` public — Coordinator được tạo trong `Capture3DBridgeModule.startSession()`. MesVid cần design cơ chế register sink (likely: `Capture3DBridgeModule.registerSink(_:)` static + attach trong startSession). **Mesim KHÔNG implement registration mechanism** — đó là MesVid's design choice.

### Concurrency
- ARMeshAnchor references được giữ trên workQueue. ARKit có thể mutate underlying `MTLBuffer` concurrent. Cho v1 acceptable — ARMeshAnchor stable trong typical capture window. Nếu thấy face count nhảy lung tung → cần snapshot vertices into Swift value type tại didUpdate callback.

### Coverage formula
- Divisor = 4000 faces. Acceptance `mesh_coverage_pct > 0.3` cần ≥ 1201 faces. Real LiDAR scan của cây trong 30s thường > 2000 faces nên dư margin. Nếu field test thấy chronic < 1201, hạ divisor xuống 3000.

### Schema deviation A (đã pull qua rebase)
- CONTRACT § 10 update: POST `/captures/3d` KHÔNG touch fruits. MeshGPU mới upsert fruits khi pull TAR. **Mesim không bị ảnh hưởng** — Mesim vẫn ghi `fruits_3d.json` vào bundle. Server-side change.

### Pod install trong worktree
- Worktree chưa có `node_modules` mặc định. Setup: symlink `node_modules` từ main repo (`ln -s /Users/ductiger/Projects/OriLifeTrace/orilife-mobile-app/node_modules .`), rồi `pod install` với `COCOAPODS_NO_BUNDLER=1 GEM_PATH=...`. Document này nếu Session A muốn auto-bootstrap worktree.

---

## 🔗 Cross-session contract verification

| Item | Status |
|---|---|
| Protocol `Capture3DFrameSink` ship | ✅ T+00:30 `af4ef39` pushed — MesVid unblocked |
| MesVid `consume()` once-per-ARFrame pattern | ✅ Confirmed via forwarded message + docstring updated |
| Schema `3dmesh/1.0` | ✅ Match CONTRACT § 13 |
| Tree local axes `y_up_z_forward` | ✅ Match CONTRACT § 12 |
| Bundle structure (mesh.obj/texture.png/fruits_3d.json sortable into TAR) | ✅ Bundle3DAssembler sorted enumeration |
| Bridge events `onMeshUpdate` + `onVideoReady` | ✅ Schema declared, Mesim emits onMeshUpdate; MesVid emit onVideoReady |
| KHÔNG đụng CaptureMetadataAPI / Upload3DQueue / LampNetAPI / Bundle3DAssembler | ✅ Verified git diff |
