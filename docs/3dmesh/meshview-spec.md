# MeshView — Mobile RN: TreeDetail 3-tab + 3D viewer + fruit picker

**Repo:** `orilife-mobile-app` worktree `/Users/ductiger/Projects/OriLifeTrace/3dmesh-view-wt-C`
**Branch:** `feature/meshview-ui` base `session-d/3d-capture`
**Budget:** 4 giờ
**MUST READ FIRST:**
1. [FOUNDATION.md](FOUNDATION.md) — Session D đã làm gì
2. [CONTRACT.md](CONTRACT.md) — đặc biệt § 6 API, § 4 fruits_3d, § 12 coord

## Role

Bạn là MeshView. **ADD new components** (3D viewer, fruit picker, Mini3DPreview) và REFACTOR TreeDetailScreen hiện có thành 3 tab. KHÔNG REWRITE Capture3D screens (Session D + MeshUX own). KHÔNG đụng native ARKit (Mesim). KHÔNG đụng backend (MeshAPI).

**REUSE bắt buộc (Session D đã có):**
- `Capture3DBridge.ts` (Session D): KEEP AS-IS. Nếu cần subscribe `onMeshUpdate` cho Mini3DPreview → import existing `subscribeCapture3DProgress` pattern, hoặc dùng wrapper MeshUX sẽ add.
- `types.ts` (Session D): EXTEND types `Fruit`, `TreeFruitsResponse`, `Capture` — KHÔNG xóa existing types.
- `Capture3DSessionScreen.tsx` (Session D + MeshUX): KHÔNG đụng. MeshUX import Mini3DPreview của bạn.
- `Capture3DEntryScreen.tsx`, `Capture3DStatusScreen.tsx` (Session D + MeshUX): KHÔNG đụng.
- `useCapture3DFlag.ts` (Session D): nếu Tree3DViewer cần check flag → import existing hook, KHÔNG tạo hook khác.

**KHÔNG được rewrite:** mọi file trong `src/modules/capture3d/screens/`, `src/modules/capture3d/hooks/`, `src/modules/capture3d/native/`. Bạn chỉ ADD `src/modules/capture3d/components/` (NEW dir).

## Deliverables (file ownership của MeshView)

1. **REFACTOR** `src/modules/trace/screens/TreeDetailScreen.tsx`:
   - Thay layout hiện tại → 3 tabs: "Tổng quan" / "Hình cây" / "Lịch sử" (dùng `@react-navigation/material-top-tabs` hoặc `react-native-tab-view`)
   - GIỮ existing logic Activity navigation trong tab "Tổng quan"
   - Tab "Tổng quan": thumbnail + tên + GPS + chip "🍈 N quả · N gần chín" + button "📸 Chụp lại" + section Activity hiện tại
   - Tab "Hình cây": render `<Tree3DViewer treeId={tree.id} />`
   - Tab "Lịch sử": list captures + compare slider (basic v1 — chỉ list, compare slider defer)

2. **NEW** `src/components/tree-3d-viewer/Tree3DViewer.tsx`:
   - Props: `treeId: string`
   - Fetch `GET /trees/{treeId}/fruits` (axios) → state `fruits[]`
   - Render `<SceneKit3DView meshCid={latest_mesh_cid} fruits={fruits} onFruitTap={handleFruitTap} />`
   - Loading state, empty state ("Cây chưa có hình"), error state

3. **NEW** `src/components/tree-3d-viewer/SceneKit3DView.tsx`:
   - RN bridge wrapper cho native SceneKit view
   - Props: `meshCid: string | null`, `fruits: Fruit[]`, `onFruitTap: (fruitId: string) => void`
   - `requireNativeComponent('SceneKit3DView')` + event prop

4. **NEW** `ios/LocalPods/ScannerModule/UI/SceneKit3DBridge.swift` + `SceneKit3DBridge.m`:
   - Native SwiftUI/SceneKit RCTViewManager
   - Receive `meshCid` → download bundle from LampNet (dùng `LampNetAPI.download` hoặc cache local nếu đã có) → extract `mesh.obj` + `texture.png` → load vào `SCNNode`
   - Receive `fruits[]` → vẽ chấm màu tại `position_3d_v2 ?? position_3d`:
     - status `non` → màu vàng
     - `near_ripe` → cam
     - `ripe` → đỏ
     - `harvested` → xám (faded)
   - Hit-test tap → emit RN event `onFruitTap(fruitId)`
   - Allow drag rotate + pinch zoom (SCNCameraController default OK)

5. **NEW** `src/modules/capture3d/components/FruitPickerSheet.tsx`:
   - Bottom sheet open khi tap fruit dot trong Tree3DViewer
   - Fetch `GET /fruits/{fruitId}` → state `fruit`
   - Render:
     - Carousel ảnh + video player inline (use existing `react-native-video` lib)
     - Info: "Phát hiện X ngày trước · size growth"
     - Label tier: `near` → "✓ Quả gần (vị trí chính xác)" / `far` → "≈ Quả xa (vị trí ước lượng)"
     - Buttons: "✓ Đánh dấu đã hái" (PATCH status=harvested) / "Sửa vị trí quả này" (open position editor — basic v1: alert "Tính năng đang hoàn thiện")

6. **NEW** `src/modules/capture3d/components/Mini3DPreview.tsx`:
   - Standalone component export — MeshUX sẽ import (KHÔNG sửa, chỉ dùng)
   - Props: `meshCid: string`
   - Render mini SceneKit view trong modal sau capture xong (KB1 bước 9)
   - Tự fetch + hiển thị mesh không cần fruits

7. **NEW** `src/api/captures3d.ts`:
   - Wrapper axios:
     - `getTreeFruits(treeId)` → `GET /trees/{id}/fruits`
     - `getFruit(fruitId)` → `GET /fruits/{id}`
     - `updateFruitStatus(fruitId, status)` → `PATCH /fruits/{id}`
   - Headers `X-API-Key` từ existing `apiClient.ts` (reuse pattern)

8. **REGISTER** route trong `src/navigation/index.tsx`:
   - Đã có `TreeDetail` route → giữ nguyên, screen mới sẽ replace internally

## File KHÔNG được đụng

`src/modules/capture3d/screens/Capture3DSessionScreen.tsx` (MeshUX), `Capture3DEntryScreen.tsx` (MeshUX), `Capture3DStatusScreen.tsx` (MeshUX), `AccountScreen.tsx` (MeshUX), `FarmDetailScreen.tsx` TreeCard (MeshUX), mọi file Mesim/MesVid trong `Core/Capture3D/`.

## Acceptance criteria

- [ ] `npx tsc --noEmit` exit 0 (no new errors beyond baseline 85)
- [ ] `xcodebuild` Debug → exit 0 (native bridge compile pass)
- [ ] Mở TreeDetail bất kỳ → thấy 3 tab "Tổng quan / Hình cây / Lịch sử"
- [ ] Tab "Hình cây" với mock data hiển thị mesh + chấm quả (mock OK nếu API chưa ready)
- [ ] Tap chấm quả → bottom sheet hiện carousel + info
- [ ] Drag/pinch 3D viewer work
- [ ] Mini3DPreview export accessible via `import { Mini3DPreview } from '@/modules/capture3d/components/Mini3DPreview'`
- [ ] PR description liệt kê: files changed, mock data assumption, screenshot 3 tab

## Constraints

- KHÔNG dùng paid 3D SDK (Filament free OK, nhưng SceneKit native iOS đủ cho v1)
- Android: stub `SceneKit3DView.android.tsx` return placeholder "Coming v2.1" — đừng leave undefined component
- KHÔNG modify CONTRACT.md
- Mock data tạm OK nếu MeshAPI chưa deploy — PR note rõ "tested against mock"

## Khi xong

Push branch `feature/meshview-ui` → PR target `session-d/3d-capture` với title `feat(meshview): TreeDetail 3-tab + 3D viewer + fruit sheet (3Dmesh phase 1)`.
