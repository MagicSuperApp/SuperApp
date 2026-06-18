# Foundation — Session D code đã có sẵn (REUSE, không rewrite)

> **Mỗi session phải đọc file này trước khi viết spec/code.** Mọi thứ ở dưới ĐÃ TỒN TẠI và đã test pass (PR #14 BUILD SUCCEEDED). Specs 3Dmesh chỉ EXTEND không REWRITE.

## iOS native — `ios/LocalPods/ScannerModule/Core/Capture3D/`

| File | Trạng thái | Public API có sẵn | Session 3Dmesh tương tác |
|---|---|---|---|
| `Capture3DCoordinator.swift` | ✅ Full state machine | `start()`, `cancel()`, `handle(pixelBuffer,pose,...)`, finalizeBundling | **Mesim** modify: add `sinks: [Capture3DFrameSink]`, enable `sceneReconstruction=.mesh`, collect ARMeshAnchor, raycast bbox |
| `ARPoseProvider.swift` | ✅ Protocol + ARKit impl + IMU stub | `protocol ARPoseProviding`, `ARKitPoseProvider`, `IMUPoseProvider` | **Mesim** modify ARKitPoseProvider config (sceneReconstruction). KHÔNG đụng protocol. |
| `FrameSampler.swift` | ✅ 15 frames / 30s gate | `shouldCapture(timestamp)`, `isDone`, `start()` | KEEP AS-IS, KHÔNG đụng |
| `Capture3DStore.swift` | ✅ SQLite DAO riêng `orilife_capture3d.sqlite3` | `insert(row)`, `updateCID`, `updateBundle`, `listPending`, `setLastPayload` | KEEP AS-IS. **Mesim** chỉ thêm cập nhật mesh_face_count, mesh_coverage_pct vào row (qua field mới `manifest_json`). |
| `Bundle3DAssembler.swift` | ✅ POSIX ustar TAR + streamed SHA-256 | `assemble(sessionDir) -> (path, sizeBytes, sha256)` | KEEP AS-IS. **Mesim** chỉ đảm bảo các file mới (mesh.obj, texture.png, video.mp4, fruits_3d.json) nằm trong sessionDir → TAR tự pick up vì enumeration sorted. |
| `LampNetAPI.swift` | ✅ Multipart POST upload | `uploadBundle(archive, sessionId, treeId, farmId, bundleHash) -> cid` | KEEP AS-IS, KHÔNG đụng. |
| `Upload3DQueue.swift` | ✅ Task.detached pipeline assemble→upload→metadata | `enqueue(sessionId, sessionDir, bridge)`, `retry(sessionId)`, `resumeAll()` | KEEP AS-IS, KHÔNG đụng. Pipeline đã đầy đủ. |
| `CaptureMetadataAPI.swift` | ✅ Payload builder + POST gated `metadataPostEnabled=false` | `postIfReady(row, cid, bundleHash) -> Bool` | **MeshAPI** ship endpoint xong → flip flag `metadataPostEnabled=true` trong follow-up commit (Session A handle, KHÔNG ai đụng file này trong 3Dmesh). |
| `Capture3DBridgeModule.swift` | ✅ RCTEventEmitter, 4 methods (startSession/cancel/retry/listPending), 3 events (progress/complete/error) | `startSession(treeId,farmId)`, `cancelSession(id)`, `retryUpload(id)`, `listPending()` | **Mesim+MesVid** ADD events (`onMeshUpdate`, `onVideoReady`) vào `supportedEvents()`. KHÔNG đụng 4 methods hoặc 3 events có sẵn. |
| `Capture3DBridge.m` | ✅ ObjC RCT_EXTERN bridge | RCT_EXTERN_METHOD declarations | KEEP, append nếu Mesim/MesVid thêm method (không cần trong phase 1) |

## iOS app modifications (đã làm)

| File | Đã làm | Session 3Dmesh tương tác |
|---|---|---|
| `ScannerModule.podspec` | Đã add `'ARKit'` framework | **Mesim** append thêm `'Metal', 'SceneKit', 'ModelIO'`. **MesVid** append `'AVFoundation'` nếu chưa có. |
| `APISecrets.swift` | Đã add `lampNetUploadURL`, `captures3DURL` properties | KEEP, KHÔNG đụng |

## React Native — `src/modules/capture3d/`

| File | Trạng thái | Session 3Dmesh tương tác |
|---|---|---|
| `types.ts` | ✅ Domain types: `Capture3DSessionParams`, `Capture3DProgressEvent`, constants `CAPTURE_3D_FLAG_KEY='@aladin/feature/enable3DCapture'`, `CAPTURE_3D_TARGET_FRAMES=15`, `CAPTURE_3D_MAX_BUNDLE_BYTES=50MB` | **MeshUX** EXTEND thêm event types (`onMeshUpdate`, `onVideoReady`). **MeshView** add types cho `Fruit`, `TreeFruitsResponse`, `Capture` matching CONTRACT § 4, § 6. |
| `hooks/useCapture3DFlag.ts` | ✅ Read/toggle AsyncStorage flag | KEEP AS-IS. **MeshUX** KHÔNG đụng. |
| `native/Capture3DBridge.ts` | ✅ TS bridge với NativeEventEmitter + 4 method wrappers + 3 subscribe functions + Android fallback | **MeshUX** EXTEND `subscribeCapture3DMeshUpdate`, `subscribeCapture3DVideoReady` (parallel với 3 subscribe có sẵn). KHÔNG đụng existing. |
| `screens/Capture3DEntryScreen.tsx` | ✅ Wizard intro | **MeshUX** modify strings only (theo meshux-spec.md). KHÔNG đụng logic. |
| `screens/Capture3DSessionScreen.tsx` | ✅ Active capture progress, state machine, error handling | **MeshUX** modify strings + add haptic + confirm dialog Huỷ + subscribe `onMeshUpdate` + import `Mini3DPreview` từ MeshView. KHÔNG rewrite. |
| `screens/Capture3DStatusScreen.tsx` | ✅ Pending queue + manual retry | **MeshUX** modify strings only. KHÔNG đụng logic. |
| `index.ts` | ✅ Barrel exports | **MeshView** add export `Mini3DPreview`. **MeshUX** không đụng. |

## App-level modifications (đã làm)

| File | Đã làm | Session 3Dmesh tương tác |
|---|---|---|
| `src/navigation/index.tsx` | Đã register 3 routes Capture3DEntry/Session/Status | KEEP. **MeshView** modify TreeDetailScreen registration (đã có route, refactor screen impl). |
| `src/modules/trace/screens/FarmDetailScreen.tsx` | Đã add button "Quét 3D cây này" + chip "{fruitCount} quả" mock random | **MeshUX** modify: BỎ button (Major M1), fetch fruit_count thật từ API |
| `src/screens/AccountScreen.tsx` | Đã add 5-tap toggle | **MeshUX** modify strings sublabel + toast (farmer-friendly) |

## Schema bundle hiện tại (Session D output)

`<sessionId>.tar` đã có:
- `manifest.json` (schema v1, không có mesh_face_count/coverage)
- `frames/00..14.jpg`
- `poses/00..14.json`
- `detections/all.json` (YOLO 2D bbox)

**3Dmesh extends:** ADD `mesh.obj` + `texture.png` + `video.mp4` + `fruits_3d.json` + `depth/*.bin` (optional). Update manifest.json schema lên v1.1 (xem CONTRACT § 2).

## Endpoints backend (chưa có)

| Endpoint | Status | Session |
|---|---|---|
| `POST /captures/3d` | ❌ Stub trong CaptureMetadataAPI, `metadataPostEnabled=false` | MeshAPI build server-side |
| `GET /trees/{id}/fruits` | ❌ Chưa có | MeshAPI build |
| `GET /trees/{id}/captures` | ❌ Chưa có | MeshAPI build |
| `GET /fruits/{id}` | ❌ Chưa có | MeshAPI build |
| `PATCH /fruits/{id}` | ❌ Chưa có | MeshAPI build |

## Build verification

PR #14 trên branch `session-d/3d-capture` đã: `xcodebuild` Debug iphonesimulator → BUILD SUCCEEDED (sau pod install thật, verified by Session A).

## DON'T DO (anti-patterns nếu xảy ra = wasted work)

1. ❌ Mesim REWRITE Capture3DCoordinator.swift từ đầu → conflict với Session D logic. Chỉ MODIFY incremental.
2. ❌ MesVid mở `AVCaptureSession` riêng → conflict ARKit. Phải qua `Capture3DFrameSink` (Mesim ship protocol).
3. ❌ MeshView tạo lại Capture3DSessionScreen → MeshUX đang OWN, conflict.
4. ❌ MeshUX rewrite useCapture3DFlag hook → đã work, không cần đụng.
5. ❌ MeshAPI build mesh worker → đó là MeshGPU.
6. ❌ MeshGPU schema DB tự nghĩ ra → phải match MeshAPI CONTRACT § 7 chính xác.
7. ❌ Rewrite `LampNetAPI.swift` hoặc `Bundle3DAssembler.swift` → đã pass, đã test.
8. ❌ Tạo lại SQLite store mobile (`Capture3DStore.swift`) → đã có, chỉ extend nếu cần.
