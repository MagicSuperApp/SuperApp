# Thư's Existing Tree Dedup Solution — Audit Findings 2026-05-17

> **Discovery:** User flagged "Thư đã build dedup code build 46 debug-branch". AppBuilder Agent audited và confirm — solution ALREADY exists trong main nhưng chỉ wired cho legacy Scanner, KHÔNG Capture3D.

## Files đã merge vào main

| File | LOC | Vai trò |
|---|---|---|
| `ios/LocalPods/ScannerModule/Core/Network/VerifyAPI.swift` | 251 | POST `/evidences/verify` (§6.4) + `/evidences/verify-transparent` (§6.5) — image + GPS + IMU, server-side spatial match radius 30m, returns isMatched + matchedTreeId + confidence + reason |
| `ios/LocalPods/ScannerModule/Core/Network/TreeMatchHandler.swift` | 103 | 3-tier confirmation: ≥0.95 auto-accept, 0.6-0.95 user confirm, <0.6 auto-reject |
| `ios/LocalPods/ScannerModule/UI/TreeMatchConfirmationView.swift` | 224 | SwiftUI confirmation UI với image preview + location + capture date |
| `ios/LocalPods/ScannerModule/Core/Network/UploadQueue.swift` (+145) | — | Step 1 trong upload flow: verify → if matched → callback ask user → reuse/create |
| `ios/LocalPods/ScannerModule/UI/ScannerViewController.swift:186` | 18 | Callback `oldQueue.onTreeMatchFound = { ... }` wires UI |

## Current wired flow

### ✅ Legacy Scanner (build 40-45 era, KHÔNG đang dùng)
```
ScannerViewController.startScanning()
  → DetectionCoordinator.detect()
  → UploadQueue.enqueue(item)
  → UploadQueue.processItem() Step 1:
    → VerifyAPI.verify(image, timeSeries, metadata, radius=30m)
    → if isMatched && confidence ≥ 0.85 → reuse OR
    → callback onTreeMatchFound → TreeMatchHandler.showConfirmation()
      → ≥0.95 auto-accept
      → 0.6-0.95 SwiftUI dialog
      → <0.6 auto-reject
  → Step 2: Upload với final tree_id
```

### ❌ Capture3D (build 47+ — Giang đang dùng) BYPASS
```
Capture3DBridgeModule.startCapture3D()
  → Capture3DCoordinator.run()
  → LampNetAPI.uploadBundle(tar)
  → ✗ KHÔNG verify
  → Backend POST /captures/3d → create tree blindly
```

## Root cause "1 cây 2 mã" Giang báo

User scan cùng cây 2 lần qua Capture3D path → 2 tree_id khác nhau (random hoặc grid-hashed) → backend tạo 2 rows. Dedup solution của Thư KHÔNG được trigger.

## Action: Wire Capture3D → VerifyAPI

**Owner:** Thư (T-Th2-07, 4-6h)

**Implementation pattern (copy từ ScannerViewController):**

```swift
// Capture3DBridgeModule.swift — trong startCapture3D() trước khi tạo coordinator

@objc func startCapture3D(_ options: NSDictionary, ...) {
    // ... existing setup (sessionId, paths, gps, etc.) ...

    // ⭐ NEW: Verify before creating capture
    Task {
        let firstFrameImage = await captureInitialFrame()  // Helper: grab 1 frame ARKit preview
        let verifyAPI = APISecrets.createVerifyAPI()

        let verifyResult: VerifyResponse
        do {
            verifyResult = try await verifyAPI.verify(
                image: firstFrameImage,
                timeSeries: TimeSeriesData(
                    latitude: gps?.lat ?? 0,
                    longitude: gps?.lng ?? 0,
                    timestamp: Int64(context.capturedAt.timeIntervalSince1970 * 1000),
                    heading: heading,
                    pitch: pitch,
                    roll: roll
                ),
                metadata: MetadataData(deviceId: deviceId, nonce: nonce, signature: signature),
                radius: 30.0
            )
        } catch {
            print("[Capture3DBridge] Verify failed, proceed with new tree: \(error)")
            // Fallback: proceed with new tree_id (existing behavior)
            await proceedWithNewTree(...)
            return
        }

        // Check dedup result
        let finalTreeId: String
        if verifyResult.isMatched, let matchedId = verifyResult.matchedTreeId {
            if verifyResult.confidence >= 0.95 {
                // Auto-accept high confidence
                finalTreeId = matchedId
                print("[Capture3DBridge] ✅ Auto-reuse tree: \(matchedId) (conf=\(verifyResult.confidence))")
            } else if verifyResult.confidence >= 0.6 {
                // User confirmation 0.6-0.95
                let confirmed = await TreeMatchHandler.showConfirmation(
                    originalTreeId: newTreeId,
                    matchedTreeId: matchedId,
                    confidence: verifyResult.confidence,
                    verifyResponse: verifyResult,
                    presentingViewController: currentPresentingVC
                )
                finalTreeId = confirmed ? matchedId : newTreeId
            } else {
                // Auto-reject low confidence — create new
                finalTreeId = newTreeId
            }
        } else {
            // No match — create new
            finalTreeId = newTreeId
        }

        // Proceed with finalTreeId
        await startCoordinatorWith(treeId: finalTreeId, ...)
    }
}
```

**Test plan:**

1. **Giang field test cycle:**
   - Scan cây A → cache tree_id_A
   - Walk 30s, scan cây A lần 2 → expected: TreeMatchConfirmationView hiện
   - Confirm → reuse tree_id_A
   - Backend chỉ 1 capture row mới (cùng tree_id)

2. **Edge cases:**
   - Verify API timeout → fallback create new (KHÔNG block flow)
   - Confidence 0.95-1.0 → auto-accept (KHÔNG popup, smooth UX)
   - Different cây cùng vườn → confidence <0.6 → KHÔNG popup, create new
   - Cross-farm scan → KHÔNG match (radius 30m within-farm)

## Mobile fast-path layer: `treeDedupCache.ts`

**Retain với role mới: instant UX fallback cho rapid re-scan**

- Mobile cache (60s + 1.5m) → hit → skip VerifyAPI call (instant)
- Cache miss → call VerifyAPI (server smarter)
- Defense-in-depth, không conflict

**Implementation note (Lợi/Thư cùng review):**

```typescript
// Wrapper trong Capture3DSDK bridge wrapper
const dupCheck = checkPotentialDuplicate(farmId, lat, lng);
if (dupCheck.likelyDuplicate) {
  // Show dialog "Có vẻ là cây bạn vừa quét cách 0.5m — dùng cây cũ?"
  const useCached = await Alert.alert(...);
  if (useCached) return { treeId: dupCheck.cachedTreeId };
}
// Cache miss or user create new → fallback native VerifyAPI
const result = await ScannerSDK.startCapture3D({ farmId, lat, lng });
cacheTreeScan(result.treeId, farmId, lat, lng);
```

## 5 commits trên debug-branch chưa merge — RÀ XONG

| Commit | Diff | Verdict | Action |
|---|---|---|---|
| `cea0754` | project.pbxproj 4 lines | Cosmetic | Skip |
| `022b2e1` | FarmDetailScreen.tsx +875/-317 | **Mostly Prettier reformat** | Skip (reformat đã có ở build 51) |
| `dcfd477` | FarmDetailScreen.tsx 11 lines | Minor | Skip |
| `0565ca7` | DetectionCoordinator + aladin-api integration | Minor | Eval case-by-case nếu cần |
| `926e1f8` | "fix trùng id" commit message | **DEBUG instrumentation — adds 3 FAKE GPS points** để dev test polygon (KHÔNG phải production fix) | **SKIP** — never merge to production |

## Protocol violation reflection

AppBuilder Agent đã miss check `debug-branch` trước khi design Build 52 dedup solution (spawn sub-agent audit chỉ check main + feat). Nếu user không flag, sẽ duplicate work.

**Lesson learned cho PROTOCOL.md:**

> § 3.X — Trước khi spec/implement feature mới, AppBuilder Agent BẮT BUỘC check tất cả branches có liên quan (`debug-branch`, `feature/*`, `fix/*` pending) qua `git log --all --grep="<keyword>"` để tránh duplicate work với dev's existing code.

→ Sẽ add vào PROTOCOL.md sau khi sprint kế.
