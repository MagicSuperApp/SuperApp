# MesVid — iOS video recorder qua ARFrame pixel buffer

**Repo:** `orilife-mobile-app` worktree `/Users/ductiger/Projects/OriLifeTrace/3dmesh-video-wt-B`
**Branch:** `feature/mesvid-video` base `session-d/3d-capture`
**Budget:** 4 giờ
**MUST READ FIRST:**
1. [FOUNDATION.md](FOUNDATION.md) — Session D đã làm gì
2. [CONTRACT.md](CONTRACT.md) — đặc biệt § 9 protocol Capture3DFrameSink

## Role

Bạn là MesVid. Record video 30s 1080p từ pixel buffer Mesim cung cấp qua sink protocol. KHÔNG mở `AVCaptureSession` riêng (sẽ xung đột với ARKit của Session D). KHÔNG đụng mesh, raycast, UI.

**REUSE bắt buộc:**
- `Capture3DCoordinator.swift` (Session D + Mesim's protocol hook): chỉ ADD 1-2 dòng wire VideoRecorder vào `sinks` array
- `Capture3DBridgeModule.swift` (Session D): chỉ ADD event `onVideoReady` vào supportedEvents, KHÔNG đụng 3 events có sẵn
- `LampNetAPI.swift`, `Upload3DQueue.swift`, `Bundle3DAssembler.swift` (Session D): KEEP AS-IS, video.mp4 nằm trong sessionDir sẽ tự được TAR pickup

## T+00:00 → T+00:30 BLOCKED

Đợi Mesim push `Capture3DFrameSink.swift` protocol stub. Trong lúc đó:
- Đọc CONTRACT.md kỹ § 1, § 8, § 9
- Setup worktree, rebase từ origin/session-d/3d-capture mới nhất
- Đọc code Session D hiện tại: `Capture3DCoordinator.swift`, `Capture3DBridgeModule.swift`
- Plan implementation `Capture3DVideoRecorder.swift`

T+00:30: pull commit Mesim → Capture3DFrameSink available → bắt đầu implement.

## Deliverables (file ownership của MesVid)

1. **NEW** `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DVideoRecorder.swift`:
   - Class `VideoRecorder: NSObject, Capture3DFrameSink`
   - `sessionStarted(sessionId, sessionDir)` → init `AVAssetWriter` với output path `<sessionDir>/video.mp4`
   - Config: H.264, 1920×1080, 30fps, ~5Mbps bitrate
   - `consume(pixelBuffer, pose, intrinsics, timestamp, frameIndex)`:
     - Convert pixelBuffer (BGRA from ARKit) → orientation-corrected
     - Append to AVAssetWriterInputPixelBufferAdaptor
     - Drop frames nếu writer chưa ready
   - Cap 30 giây (1800 frames @30fps). Stop recording sau đó.
   - `sessionEnded(success)`:
     - Finalize AVAssetWriter
     - If success: emit bridge event `onVideoReady { sessionId, durationS, bytes }`
     - If cancel: delete partial video.mp4

2. **NEW** `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DVideoBridge.swift`:
   - Helper extension cho `Capture3DBridgeModule` để emit `onVideoReady`
   - Public function `emitVideoReady(sessionId:durationS:bytes:)`

3. **WIRE** trong `Capture3DCoordinator.swift`:
   - **CHỈ ADD 1-2 dòng** đăng ký `VideoRecorder` instance vào `coordinator.sinks` array khi session start
   - **KHÔNG** modify gì khác trong Coordinator (Mesim manage)

## File KHÔNG được đụng

`Capture3DMeshExporter.swift`, `Capture3DRaycaster.swift`, `Capture3DFrameSink.swift` (Mesim define), mọi file UI (`*.tsx`, `*.ts`), `ScannerModule.podspec` (Mesim manage).

## Acceptance criteria

- [ ] `xcodebuild` Debug → exit 0
- [ ] Capture session 30s → `video.mp4` saved trong sessionDir
- [ ] Video file ≥10MB, ≤80MB, playable bằng QuickTime
- [ ] Duration video thực tế = 28-32 giây (cho phép ±2s do frame drop)
- [ ] Bridge event `onVideoReady` emit đúng 1 lần khi session success
- [ ] Cancel session giữa chừng → video.mp4 bị xóa, không leak
- [ ] PR description note dependency: "Built on Mesim commit <sha> Capture3DFrameSink protocol"

## Constraints

- KHÔNG mở `AVCaptureSession` riêng (sẽ kill ARKit). Pixel buffer PHẢI từ Mesim's sink.
- KHÔNG dùng 3rd-party encoder (chỉ Apple AVFoundation)
- KHÔNG modify CONTRACT.md mà không hỏi Session A
- Build local pass trước push

## Khi xong

Push branch `feature/mesvid-video` → PR target `session-d/3d-capture` với title `feat(mesvid): video recorder 30s 1080p từ ARFrame (3Dmesh phase 1)`. Note rebase requirement nếu Mesim đã ship.
