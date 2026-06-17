# MeshUX — Mobile RN strings + farmer UX fixes (F1-F5 + jargon)

**Repo:** `orilife-mobile-app` worktree `/Users/ductiger/Projects/OriLifeTrace/3dmesh-ux-wt-D`
**Branch:** `feature/meshux-strings` base `session-d/3d-capture`
**Budget:** 4 giờ
**MUST READ FIRST:**
1. [FOUNDATION.md](FOUNDATION.md) — Session D code bạn đang chỉnh strings, đừng đụng logic
2. [CONTRACT.md](CONTRACT.md) — § 8 bridge events

## Role

Bạn là MeshUX. **MODIFY strings + UX patterns trong screens Session D đã build**, KHÔNG REWRITE. Fix 5 UX issue (F1-F5) đã audit. KHÔNG đụng logic state machine, KHÔNG đụng native code, KHÔNG đụng TreeDetailScreen (MeshView).

**REUSE bắt buộc (Session D đã có, bạn chỉ chỉnh strings + thêm haptic):**
- `Capture3DSessionScreen.tsx` (Session D): state machine `idle/capturing/bundling/uploading/uploaded/metadata_posted/error` KEEP. Bridge subscriptions `subscribeCapture3DProgress/Complete/Error` KEEP. Bạn chỉ:
  - Đổi text labels
  - ADD subscribe `subscribeCapture3DMeshUpdate` (đăng ký event mới)
  - ADD haptic feedback (`Vibration.vibrate` mỗi frameIndex tăng)
  - ADD confirm dialog Huỷ (Alert.alert)
  - ADD import `Mini3DPreview` từ MeshView, dùng trong modal success
- `Capture3DEntryScreen.tsx` (Session D): KEEP logic validate treeId/farmId, KEEP navigation. Bạn chỉ đổi strings + icon.
- `Capture3DStatusScreen.tsx` (Session D): KEEP logic `listPending` + retry. Bạn chỉ đổi strings + format error message.
- `AccountScreen.tsx` (Session D + existing): KEEP 5-tap logic. Bạn chỉ đổi sublabel + toast.
- `FarmDetailScreen.tsx` TreeCard (Session D): KEEP entire structure, BỎ render button 3D (KHÔNG xóa styles), fetch fruit_count thật.
- `useCapture3DFlag.ts` (Session D): KEEP AS-IS, KHÔNG đụng hook logic.
- `types.ts` (Session D): EXTEND types `Capture3DMeshUpdateEvent` + `Capture3DVideoReadyEvent` matching CONTRACT § 8. KHÔNG xóa existing.
- `native/Capture3DBridge.ts` (Session D): ADD function `subscribeCapture3DMeshUpdate`, `subscribeCapture3DVideoReady` (parallel pattern với 3 subscribe có sẵn). KHÔNG đụng 4 method wrappers + 3 subscribe có sẵn.

## Deliverables (file ownership của MeshUX)

### 1. Strings fix (Critical C3 từ farmer audit)

**FILE** `src/modules/capture3d/screens/Capture3DEntryScreen.tsx`:
- Header "Quét 3D cây" → **"Chụp toàn bộ cây"**
- Hero title "Thu thập dữ liệu 3D" → **"Chụp cây để hệ thống ghi nhớ"**
- Hero sub: bỏ "đời sống sinh vật", "tem QR" → **"App sẽ quay quanh cây và chụp ~15 ảnh. Sau đó bạn có thể xem mô hình cây này bất cứ lúc nào."**
- Icon `cube-scan` (header + hero) → **`camera-iris`** (đã có hoặc `tree-outline` nếu trực quan hơn)
- Tips "Đi vòng quanh cây đều tay, đừng dừng giữa chừng." → **giữ**
- Tips "Giữ camera hướng vào thân cây + tán." → **giữ**
- Tips "Ánh sáng tự nhiên, tránh ngược nắng." → **"Đứng quay lưng vào mặt trời"**
- Tips "Cần GPS bật + quyền camera." → **bỏ hẳn** (app tự xin permission khi cần)
- Warning "Native module 3D Capture chưa sẵn sàng" → **"Tính năng đang được cập nhật"**
- Button "Bắt đầu quét" → **"📸 Bắt đầu chụp"**
- "Cây: tree_xxx" / "Vườn: farm_xxx" → fetch tree name từ existing tree object (passed in route params); show **"Cây: {tree.name || 'Cây #' + tree.shortId}"** + **"Vườn: {farm.name}"**
- Status button header (cloud-upload icon) → **"📋 Lần chụp trước"** với text + icon
- Tất cả textSub fontSize 12 → **14**
- Disabled button: thêm text giải thích bên dưới "(Đang kiểm tra GPS...)" hoặc "(Cần thông tin cây)"

**FILE** `src/modules/capture3d/screens/Capture3DSessionScreen.tsx`:
- Stage "Đang đóng gói dữ liệu..." → **"Đang lưu ảnh..."**
- Stage "Đang gửi lên LampNet..." → **"Đang gửi lên hệ thống..."**
- Stage "Đang ghép ảnh + pose + bbox" → **"Đang xử lý..."**
- Hint "Có thể mất 1-2 phút tuỳ mạng" → **giữ**
- Hint "Đi vòng quanh cây, giữ camera hướng vào thân" → **giữ**
- Success "Đã gửi xong" + cid hash text → **bỏ cid display**. Thay bằng "Đã chụp xong cây {tree.name}". 2 button rõ:
  - **"📸 Chụp cây khác"** → `navigation.popToTop()` về Farm
  - **"👁 Xem mô hình cây"** → navigate TreeDetail tab "Hình cây"
- Error "Có lỗi" / "Có lỗi khi quét" → **map error code → message tiếng Việt + action:**
  - Network error → "Mạng yếu. Đi gần wifi rồi bấm Gửi lại"
  - Bundle too large → "Quá nhiều ảnh. Hãy chụp lại khi trời sáng hơn"
  - ARKit not supported → "iPhone của bạn chưa hỗ trợ. Cần iPhone 12 Pro trở lên"
  - Generic → "Có lỗi xảy ra. Hãy thử lại sau ít phút"
- Counter "Đang chụp 1/15" → **giữ + add Vibration.vibrate(50) mỗi lần frameIndex tăng** (haptic feedback)
- Add `Sound` import hoặc `react-native-haptic-feedback` để tap sound mỗi frame
- "Huỷ" button → khi tap, hiện confirm dialog: **"Bấm Huỷ sẽ mất {frameIndex} ảnh đã chụp. Vẫn huỷ?"** với 2 button "Huỷ tiếp" / "Tiếp tục chụp"

**FILE** `src/modules/capture3d/screens/Capture3DStatusScreen.tsx`:
- Header "Hàng đợi 3D" → **"Các lần chụp"**
- Empty "Không có capture nào đang chờ gửi" → **"Không có lần chụp nào đang chờ"**
- Card "Cây {row.treeId}" → fetch tree name từ API hoặc local cache; show **"Cây {treeName || 'số ' + shortId}"**
- Card "Session #abc12345…" → **bỏ hẳn**
- Card "Lần thử: N · {lastError raw}" → format human:
  - Lần thử 1, 2 → **"Đang thử lại..."**
  - Lần thử 3+ → **"Cần can thiệp"**
  - Map error giống Capture3DSessionScreen
- Retry button "Thử lại" → **"📤 Gửi lại"**

**FILE** `src/screens/AccountScreen.tsx`:
- Sublabel "OriLife v1.0.0 · 3D Capture: BẬT" → **"OriLife v1.0.0" + nhỏ hơn "· Chụp cây nâng cao: BẬT"** (khi enabled)
- Toast "Tính năng ẩn — 3D Capture: BẬT" → **"Tính năng nâng cao — Chụp cây: BẬT"**

**FILE** `src/modules/trace/screens/FarmDetailScreen.tsx`:
- TreeCard button "Quét 3D cây này" → **BỎ HẲN** (Major M1 — không nhồi vào card). Đưa entry point này vào TreeDetailScreen (MeshView lo).
- TreeCard chip "{fruitCount} quả" → fetch từ API thật:
  - Format: **"🍈 {fruit_count} quả"** nếu count > 0
  - Format: **"chưa chụp"** nếu count = 0 hoặc null
  - **Limbo window state:** Sau khi farmer chụp cây xong (POST /captures/3d trả 201), `trees.fruit_count` chưa update ngay vì MeshGPU phải pull TAR + parse fruits_3d.json + upsert fruits rows (~2-5 phút). Nếu `tree.latest_capture_id` mới + `tree.fruit_count` chưa thay đổi → hiển thị **"⏳ đang xử lý..."** thay vì count cũ. Detect bằng so sánh `trees.last_scanned_at` vs `captures.processed_at` (latest capture). Nếu `processed_at` IS NULL → đang xử lý.
- Xóa state `harvestPct = Math.random()` fallback demo — chỉ hiện progress bar nếu có data thật từ API
- KHÔNG đụng styles `treeCapture3DBtn*` — chỉ bỏ render

### 2. F1 fix — "vùng đã quét" thay vì wireframe (Critical from audit)

**FILE** `src/modules/capture3d/screens/Capture3DSessionScreen.tsx`:
- Subscribe bridge event `onMeshUpdate { sessionId, coveragePercent }` (CONTRACT § 8)
- Hiển thị progress bar trên cùng "Đã quét: {Math.round(coveragePercent * 100)}%"
- KHÔNG render mesh wireframe overlay (native ARKit không expose anyway — tốt rồi)
- Add chip "🍈 Đã thấy {fruitsDetected} quả" — subscribe `onMeshUpdate.fruitsDetected`
- Native camera preview: **import `Mini3DPreview` từ MeshView** chỉ để show MODAL sau capture xong (KB1 bước 9). Trong khi capturing, screen vẫn là camera native — KHÔNG đụng.

### 3. F2-F5 fix (Major from audit)

F2-F5 nằm trong TreeDetailScreen + fruit picker → MeshView lo. MeshUX KHÔNG đụng. Nếu trong process MeshUX thấy text cần sửa trong files mình OWN → sửa luôn.

## File KHÔNG được đụng

`TreeDetailScreen.tsx` (MeshView refactor), mọi component trong `src/components/tree-3d-viewer/` (MeshView), `FruitPickerSheet.tsx` (MeshView), `Mini3DPreview.tsx` (MeshView — chỉ import), mọi file native Swift `.swift` `.m`, mọi file `src/api/*` (không touch).

## Acceptance criteria

- [ ] `npx tsc --noEmit` exit 0 (no new errors beyond baseline 85)
- [ ] Đọc qua từng screen, KHÔNG còn từ jargon nào trong list: "3D", "capture", "session", "CID", "bundle", "metadata", "LampNet", "native module", "pose", "bbox", "queue"
- [ ] Toàn bộ fontSize ≥ 14 (text chính ≥ 16)
- [ ] Capture3DSessionScreen subscribe `onMeshUpdate` event không crash khi chưa có data
- [ ] FarmDetailScreen TreeCard KHÔNG còn button "Quét 3D cây này"
- [ ] AccountScreen toggle hoạt động bình thường (test 5-tap)
- [ ] PR description note: tất cả strings đã sửa, list từng screen + before/after
- [ ] Add test thủ công checklist trong PR

## Constraints

- KHÔNG thay đổi logic — chỉ strings + UI primitives + event subscription
- KHÔNG thêm dependency mới (haptic feedback dùng RN built-in `Vibration.vibrate` nếu chưa có lib)
- KHÔNG modify CONTRACT
- KHÔNG sửa file MeshView OWN

## Khi xong

Push branch `feature/meshux-strings` → PR target `session-d/3d-capture` với title `feat(meshux): farmer-friendly strings + F1-F5 fixes (3Dmesh phase 1)`.
