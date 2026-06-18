# AUDIT — Journey CHỤP/ĐỊNH DANH CÂY · TRANG TRẠI · CHỤP 3D

Ngày: 2026-05-30. Phạm vi: cụm nghiệp vụ ngoài vườn (farm → định danh cây → 3D → offline sync).
Phương pháp: đọc + grep, KHÔNG sửa code. Mỗi lỗi: bước người dùng → file:dòng → lý do → đề xuất.
Phân loại nguồn: [MOBILE] lỗi code mobile · [INFRA] phụ thuộc backend/hạ tầng.

---

## P0 — chặn nghiệp vụ / mất dữ liệu / sai số liệu cho nông dân

### P0-1 [MOBILE] syncService KHÔNG đồng bộ gì cả — toàn bộ là stub giả lập
- Bước: nông dân lưu farm/chụp quả offline → app báo "sẽ tự sync khi có mạng".
- File: `src/services/syncService.ts:82-117` (`syncToBlockchain`).
- Lý do: hàm chỉ chạy `this.delay(...)` theo `payload.type` rồi `if (Math.random() < 0.1) throw`. KHÔNG có call API/LampNet/Cardano thật. Mọi item trong hàng đợi hoặc "thành công ảo" (xoá khỏi queue mà chưa gửi đi đâu) hoặc fail ngẫu nhiên 10%. Đây là đường dữ liệu duy nhất cho `fruit_identification` (`TreeDetailScreen.tsx:342`) và `activity` (`ActivityScreen.tsx:281`). Dữ liệu quả/hoạt động của nông dân thực tế KHÔNG bao giờ rời máy.
- Sửa: thay `syncToBlockchain` bằng call thật tới `aladin-api` (POST /fruits, /evidences...). Bỏ `Math.random` fail. Trước khi `removeFromSyncQueue` phải có response 2xx thật.

### P0-2 [MOBILE] Luồng định danh cây offline-queue (treeIdentify.ts) là dead code — không ai gọi
- Bước: chụp cây khi mất mạng → kỳ vọng vào hàng đợi, tự gửi lại khi có mạng.
- File: `src/services/treeIdentify.ts` toàn bộ; grep `identifyTree|drainQueue|confirmTreeIdentify` ⇒ 0 caller trong `src/` (chỉ định nghĩa + test).
- Lý do: module có timeout 8s, AbortController, enqueue 503/network, idempotency, `drainQueue()` — nhưng KHÔNG màn hình nào import. Luồng chụp cây thực tế (`SmartCaptureScreen` + `FarmDetailScreen` handlers) đi qua native `ScannerSDK`/`OriLifeModule`, không qua module này. Không có `NetInfo`/event listener nào gọi `drainQueue()` khi mạng phục hồi ⇒ kể cả nếu có enqueue thì hàng đợi cũng không bao giờ được rút.
- Sửa: hoặc nối `treeIdentify` vào luồng chụp thật + đăng ký `NetInfo.addEventListener` gọi `drainQueue()` khi online; hoặc xác nhận native tự lo offline queue rồi xoá module này để tránh ngộ nhận đã có offline-first ở lớp JS.

### P0-3 [MOBILE] Dedup cache "1 cây 2 mã" bị bypass trong luồng 3D thực tế
- Bước: chụp lại cùng một cây trong vài phút → kỳ vọng hỏi "dùng cây cũ?".
- File: `Capture3DSessionScreen.tsx:237` gọi `Capture3DBridge.startSession(...)` TRỰC TIẾP, không qua `startSessionWithDedup` (`Capture3DBridge.ts:101`, hàm chứa `checkPotentialDuplicate` + dialog).
- Lý do: `startSessionWithDedup` (lớp chống trùng mobile fast-path) không có caller nào trong `src/`. Session screen còn không truyền `lat/lng`. Cache `treeDedupCache` warm-load ở `App.tsx:18` nhưng nhánh 3D không bao giờ đọc. Bug gốc "1 cây ra 2 mã" mà Build 52/58 định vá vẫn hở ở đường đi thật.
- Sửa: trong Entry/Session lấy GPS hiện tại và gọi `startSessionWithDedup({...params, lat, lng})` thay cho `startSession`.

---

## P1 — lỗi rõ ảnh hưởng UX/đúng đắn, không chặn toàn bộ

### P1-1 [MOBILE] SmartCaptureScreen: cleanup listener đua với promise, dễ rò + double-subscribe
- Bước: mở màn quét, thoát nhanh / bấm "Quét lại" nhiều lần.
- File: `SmartCaptureScreen.tsx:138-162`. `launchNativeScanner` tạo 3 subscription rồi trả cleanup qua `.then`. useEffect cleanup (159-161) chạy `cleanup?.()` — nhưng nếu unmount xảy ra trước khi promise resolve thì `cleanup` còn `undefined` ⇒ 3 listener rò. `handleScanAgain` (166-171) gọi lại `launchNativeScanner` mà không gỡ listener cũ ⇒ nhân đôi listener mỗi lần "Quét lại".
- Sửa: đăng ký listener trong useEffect đồng bộ (không trong async), giữ ref tới subs để cleanup chắc chắn; hoặc `ScannerSDK.removeAllListeners()` đầu mỗi lần launch.

### P1-2 [MOBILE] iOS không xin quyền Camera/GPS trong luồng quét → kẹt im lặng
- Bước: nông dân iPhone bấm chụp cây lần đầu.
- File: `SmartCaptureScreen.tsx:54-55` `requestCameraPermission` return `true` ngay nếu `Platform.OS !== 'android'`; `FarmDetailScreen.handleAddTree:1787` cũng không xin quyền.
- Lý do: trên iOS quyền do native lo, nhưng nếu user đã từ chối thì JS không phát hiện được, màn chỉ kẹt ở "Đang khởi động scanner..." hoặc native im lặng. Không có đường dẫn user tới Settings.
- Sửa: kiểm tra quyền iOS (check-permissions) trước khi `startScanner`, nếu denied hiện Alert + nút mở Settings.

### P1-3 [MOBILE] getTreeFruits/getTreeCaptures: lỗi nuốt thành rỗng → "0 quả" giả khi mạng yếu
- Bước: mở chi tiết cây ngoài vườn mạng yếu.
- File: `TreeDetailScreen.tsx:262-264` `.catch(() => setMeshSummary(null))`; `:303-306` `.catch(() => setCaptures([]))`.
- Lý do: lỗi mạng/timeout (client timeout 15s, `captures3d.ts:40`) bị biến thành "không có dữ liệu" — không phân biệt với cây thật sự chưa có quả. Nông dân thấy "0 quả" dù chỉ do rớt mạng, mất niềm tin (đúng loại lỗi field test 25/5 đã than).
- Sửa: tách state error vs empty; hiện "Không tải được, thử lại" + nút retry khi catch.

### P1-4 [MOBILE] harvestPct fallback `?? 42` còn sót — mâu thuẫn chủ trương Build 58 bỏ số ngẫu nhiên
- Bước: xem chi tiết cây chưa có dữ liệu thu hoạch.
- File: `TreeDetailScreen.tsx:363` `const harvestPct = tree?.harvestProgress ?? 42;`.
- Lý do: TreeCard (`FarmDetailScreen.tsx:182`) đã sửa về `?? 0` vì nông dân mất niềm tin với % ảo, nhưng TreeDetail vẫn hiện cứng 42% khi thiếu data. Số liệu sai/bịa hiển thị ra UI.
- Sửa: đổi thành `?? 0` cho nhất quán.

### P1-5 [MOBILE] handleUpdateFarmName dùng sai action → đổi tên farm hỏng
- Bước: bấm tên farm để đổi tên.
- File: `FarmDetailScreen.tsx:2024-2036`. `loadFarms(farm_id)` (dòng 2028) thực chất nhận `userId` (xem `FarmListScreen.tsx:229` `loadFarms(user.id)`), ở đây truyền `farm_id` ⇒ trả danh sách/sai shape; rồi `{...oldFarm, name}` (2029) spread một payload sai rồi `saveFarm`. Local state `farm` không refresh (tự ghi chú dòng 2031).
- Sửa: dùng `loadFarm(farm_id)` (single, đã import) lấy farm hiện tại, merge name, `saveFarm`, rồi `setFarm`.

### P1-6 [MOBILE] FarmList sort lệch khỏi farmId format do handleAddFarm tạo
- Bước: tạo farm mới → kỳ vọng farm mới lên đầu.
- File: tạo id `farm-${Date.now()}` (`FarmDetailScreen.tsx:1600`, dấu gạch ngang) nhưng sort tách bằng `_`: `FarmListScreen.tsx:260-262` `a.id?.split('_')[1]` và `FarmDetailMode` tree sort `:975`.
- Lý do: `'farm-1748...'.split('_')[1]` = `undefined` → `Number(undefined||0)=0` cho mọi farm mới ⇒ sort "mới nhất lên đầu" không hoạt động cho farm tạo từ luồng này (comment dòng 258 giả định `farm_<ts>` nhưng code tạo `farm-<ts>`).
- Sửa: thống nhất một dấu phân tách (đề nghị `_`) giữa nơi tạo id và nơi sort.

---

## P2 — rủi ro nhỏ / chai pin / kỹ thuật lộ UI / cải thiện

### P2-1 [MOBILE] watchPosition `enableHighAccuracy:true` không bao giờ dừng khi vào edit-ready → hao pin
- File: `FarmDetailScreen.tsx:364-404`. `watchPosition` mount theo `AddFarmMode`, chỉ `clearWatch` lúc unmount. Khi chuyển 'edit-ready' GPS độ chính xác cao vẫn chạy nền suốt lúc user sửa polygon. Ngoài nắng + máy yếu = nóng máy, tụt pin.
- Sửa: pause/clearWatch khi `editMode==='edit-ready'`, resume khi quay lại recording.

### P2-2 [MOBILE] Error boundary lộ `error.message` kỹ thuật ra UI nông dân
- File: `FarmDetailScreen.tsx:117-120` hiện thẳng `this.state.error.message` dưới "Đã xảy ra lỗi khi tải...".
- Sửa: ẩn message kỹ thuật (chỉ log), UI giữ câu thân thiện.

### P2-3 [MOBILE] geohash_7 hardcode `'w3gvk9q'` + region `'vn-south-01'` cho MỌI cây
- File: `FarmDetailScreen.tsx:1848-1851` (Android), `:1937` (iOS). Mọi cây đăng ký backend cùng một geohash/region bất kể GPS thật. Làm hỏng spatial dedup phía backend (vốn đã thiếu — xem comment treeDedupCache).
- Sửa: tính geohash từ `latitude/longitude` thực của cây trước khi `createTree`.

### P2-4 [MOBILE] Double-tap "Bắt đầu chụp" 3D / "Thêm cây" không khoá nút khi đang khởi tạo
- File: `Capture3DEntryScreen.handleStart:186` chỉ chặn theo `canStart` nhưng `navigate` có thể bị nhấn 2 lần liên tiếp tạo 2 session. `FarmDetailScreen.handleAddTree:1787` không có cờ "đang mở scanner".
- Sửa: thêm cờ `starting`/disable nút sau nhấn đầu.

### P2-5 [MOBILE] checkPotentialDuplicate trả `false` khi cache chưa load (fire-and-forget)
- File: `App.tsx:18` warm-load không await; `treeDedupCache.ts:123-128` nếu `!loaded` trả `{likelyDuplicate:false}`. Scan đầu ngay sau khởi động app (đúng tình huống nông dân mở app rồi chụp ngay) sẽ bỏ qua dedup. (Mức P2 vì hiện luồng 3D đã không gọi dedup — xem P0-3; sẽ thành P1 sau khi P0-3 sửa.)
- Sửa: khi nối lại dedup, `await loadTreeDedupCache()` trước check đầu tiên, hoặc trì hoãn cho phép chụp tới khi loaded.

### P2-6 [INFRA] MeshAPI (/trees/{id}/fruits, /captures) có thể chưa deploy đầy đủ
- File: `captures3d.ts:3` comment "FOUNDATION.md confirms ❌ chưa deploy". Bối cảnh đã verify backend có /trees /fruits nhưng DB rỗng. Nếu endpoint mesh chưa đủ, UI 3D sẽ luôn rỗng — không phải lỗi mobile.
- Sửa: xác nhận trạng thái deploy; nếu chưa, gate tính năng rõ ràng thay vì hiện rỗng.

---

## Ghi chú điểm ĐÚNG (để không sửa nhầm)
- `Capture3DSession` đã đặt `gestureEnabled:false` (`navigation/index.tsx:226`) — chống vuốt back khi job 3D đang chạy. OK.
- `handleCancel` 3D có confirm khi đang `capturing/bundling/uploading` (`Capture3DSessionScreen.tsx:268-298`). OK.
- Haptic completion timers được cleanup khi unmount (`:143-150`). OK.
- `handleAddFarm` lưu local trước, backend best-effort (`FarmDetailScreen.tsx:1613-1654`) — offline-first đúng cho farm. OK.
- watchPosition cleanup dùng cờ `cancelled` chống race (`:348-404`). OK (trừ vấn đề pin P2-1).
