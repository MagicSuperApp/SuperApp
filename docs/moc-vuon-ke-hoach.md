# Mốc vườn — kế hoạch chia giai đoạn cho issue #77 (Persistent AR Garden)

> Bản đo ngày 2026-08-18, trên nhánh `claude/wakeme-va-ton-dong` (`5f9c503`).
> Mọi khẳng định "đã có"/"chưa có" đều kèm `file:line` hoặc đầu ra lệnh. Chỗ nào chưa đo
> được thì ghi thẳng là chưa đo, không suy.

## 0. Câu trả lời ngắn

Issue #77 mô tả một **nền tảng mới** (ARKit/ARCore + ARWorldMap/Cloud Anchor). Nền tảng đó
**không có một dòng nào trong kho** — nên nó không vào được bản này.

Nhưng phần **giá trị thật** của issue — "đứng ở vườn, biết cây nào ở quanh mình, đi tới đúng
gốc cây" — thì **đã dựng xong và đang chạy**, bằng GPS + la bàn, không cần thư viện AR nào.
Việc còn lại của bước 1 là hai mảnh nhỏ nằm hoàn toàn trong JS.

## 1. Cái đã có (đo được)

### 1.1. Dẫn đường ngoài thực địa — ĐÃ XONG, đang chạy

| Mảnh | Ở đâu |
|---|---|
| Màn dẫn đường 3 chế độ (đang đi · tới nơi · tìm một cây) | `src/screens/WayfindScreen.tsx` (718 dòng) |
| Đăng ký trong điều hướng | `src/navigation/index.tsx:69`, `:1669` |
| Lối vào cho người dùng | `FarmDetailScreen.tsx:78`, `FarmListScreen.tsx`, `TreeManagementScreen.tsx` (qua `WayfindButton`) |
| Toán dẫn đường thuần tính | `src/features/wayfind/wayfind.ts` (261 dòng, 28 hàm xuất) |
| Mặt phẳng tìm cây bán kính 20 m + vẽ ranh giới vườn | `src/features/wayfind/TreeRadar.tsx`, `radar.ts` |
| Kim la bàn có quán tính, đi vòng ngắn | `src/features/wayfind/CompassNeedle.tsx`, `needle.ts` |
| Luật "đặt tay thắng GPS" cho toạ độ cây | `src/features/space3d/treeGeo.ts:60` |

Kiểm: `npx jest src/features/wayfind src/features/space3d` → **11 bộ, 254 phép, xanh hết, 0,5 s**.

### 1.2. La bàn đã TÁCH KHỎI camera — đây là chỗ trước đây tưởng còn thiếu

Bình luận 10/08 trong issue ghi hướng nhìn "đang bị buộc vào phiên chụp ảnh cây". Việc đó
**đã làm rồi**:

- Android: `android/app/src/main/java/com/aladincontract/company/compass/CompassHeadingModule.kt`
  (130 dòng), đăng ký tại `MainApplication.kt:25`.
- iOS: `ios/LocalPods/ScannerModule/Core/Compass/CompassHeadingModule.swift`, dùng
  `CLLocationManager.startUpdatingHeading`, lấy `trueHeading` chứ không lấy `magneticHeading`.
- JS: `src/features/wayfind/useHeading.ts:63` — có mô-đun thì dùng la bàn, không có thì lùi về
  hướng-đi GPS, và **màn nói rõ đang dùng nguồn nào**.

Hai bên giữ chung một hợp đồng (`start`/`stop`/`hasCompass`, sự kiện `HeadingUpdated`).

### 1.3. Toán địa lý ↔ mét, và cảnh 3D

- `src/features/space3d/geo.ts:28` `latLngToMeters`, `:37` `metersToLatLng`, `:48` `centroidLatLng`,
  `:113` `buildFarmRing`.
- Cảnh 3D vườn: `src/screens/Space3DScreen.tsx` (1136 dòng) + `scene/TreeMarkers`, `FruitDots`,
  `MapGround`, `TreeModel`; máy quay ở `controller.ts`.
- Vị trí đặt tay lưu cục bộ: `src/features/space3d/positionStore.ts` (AsyncStorage).

### 1.4. Máy chủ đã tự tính tâm vườn theo cây

`GET /api/farm/layout` trả `center {lat,lon}` = trọng tâm các cây **có GPS**, kèm `x_m`/`y_m`
từng cây (đo bằng `curl -s https://api.orilife.io/openapi.json`, mô tả đường này ghi rõ công
thức equirectangular). App đã gọi được: `src/services/fruitReIDService.ts:481`, dùng ở
`src/screens/FarmMap2DScreen.tsx:51`.

## 2. Cái THẬT SỰ còn thiếu

1. **Không có hạ tầng AR nào.** `grep -rniE "arkit|arcore|arworldmap|cloudanchor|relocaliz|
   sceneform|ARSession|ARSCNView"` trên `src ios/aladin_mobile_fe ios/LocalPods ios/Podfile
   android/app package.json` → **0 kết quả thật** (chỉ dính `clearSessionToken` và
   `circularSession` do trùng chuỗi con). `package.json` không có thư viện AR nào; thứ có là
   `three`, `@react-three/fiber`, `expo-gl`, `react-native-camera-kit`,
   `react-native-geolocation-service`, `@maplibre/maplibre-react-native`.

2. **Không có màn hình ảnh máy ảnh + cảnh 3D vẽ đè.** Hai thành phần xem trước máy ảnh hiện có
   đều **dính chặt phiên chụp cây**, không dùng lại trần được:
   - iOS `TreeReIDCameraPreview.swift:17` — "Auto-connects to TreeReIDBridgeModule's shared
     capture session".
   - Android `TreeReIDPreviewView.kt:31` — tự gắn lớp vẽ khung YOLO qua `TreeReIDCamera.onBoxes`.

   Và có một rủi ro đã ghi sẵn trong mã: `Space3DScreen.tsx:553-558` cảnh báo hai ngữ cảnh
   `expo-gl` cùng sống là cảnh giật; nền máy ảnh + canvas trong suốt chưa ai đo trên máy thật.

3. **Không có khái niệm "mốc" ở bất cứ đâu.** `grep -rniE "landmark|điểm mốc|mốc vườn"` trên
   `src` → 0 kết quả.

4. **Máy chủ không có chỗ lưu mốc.** Trong 146 đường của `openapi.json`:
   - `POST /api/tree/marker` chỉ nhận `{tree_id, label, side}` với `side ∈ {left,right,front,back}`
     — **không có toạ độ, không có ảnh**. Không làm mốc vườn được.
   - `pose`, `origin`, `frame`: **0 đường**.
   - 4 đường `anchor` đều là neo blockchain (`/api/anchor/pending`, `/status`, `/submit`,
     `/{entity}/{id}/event/{event_id}/anchor`) — đúng như đã chốt trong issue: **không đụng vào**.
   - Chỗ trống duy nhất là `note` (chuỗi tự do) của `POST /api/farm` và `/api/farm/{id}/update`.
     Nhét JSON mốc vào ô ghi chú của người dùng là lặp lại đúng lỗi ô `anchor` — **không làm**.

5. **Gốc toạ độ rơi về ngẫu nhiên khi vườn chưa vẽ ranh giới.** `geo.ts:120` trả `origin = null`
   khi ranh giới có 0 đỉnh hợp lệ; khi đó `useSpaceData.ts:162-166` bỏ qua GPS thật của cây và
   đặt cây bằng `seededPointInRing(t.id, ring)` — **mất luôn vị trí thật**. Máy chủ đã có sẵn
   con số thay thế (mục 1.4) mà app chưa dùng.

## 3. Chia giai đoạn

Nguyên tắc: bước 1 tự nó phải dùng được ngoài vườn.

### Bước 1 — Vá gốc toạ độ + "Đặt mốc ở đây" (JS thuần, không AR, không máy chủ)

**Làm gì**

a. `geo.ts`: thêm hàm thuần `originFromTrees(trees)` (trung bình toạ độ cây có GPS) và cho
   `buildFarmRing` nhận gốc dự phòng đó khi ranh giới < 3 đỉnh. Không đổi chữ ký cũ —
   thêm tham số tuỳ chọn.
b. `useSpaceData.ts:114` truyền toạ độ cây vào; nhánh `posSource = 'auto'` chỉ còn dùng cho cây
   **không có GPS**, thay vì cho cả vườn.
c. **Mốc vườn**: kho cục bộ `markerStore.ts` theo đúng khuôn `positionStore.ts` (AsyncStorage),
   mỗi mốc = `{id, farmId, name, lat, lon, accuracyM, photoPath?, createdAt}`. Ảnh dùng
   `react-native-image-picker` (đã có trong `package.json`) + `treeImageStore.ts` đã có sẵn.
d. `WayfindScreen`: một nút **Đặt mốc ở đây** (ghi GPS đang đọc + tên + ảnh tuỳ chọn), và mốc
   hiện thành chấm khác màu trong `TreeRadar` cùng dòng danh sách bên dưới.

**Cần gì:** không thư viện mới, không đổi native, không đổi máy chủ.

**Ước lượng công:** cỡ 200–300 dòng JS + ca kiểm thêm vào `geo.test.ts` (đã có, 254 phép đang
xanh). Không có bước dựng native nào phải chờ.

**Nông dân dùng được việc gì:** mở màn dẫn đường, thấy đúng "cổng vườn", "gốc cây to", "chỗ để
máy bơm" mình tự đặt, đi tới đúng chỗ; và vườn chưa vẽ ranh giới thì cây thôi nhảy lung tung.

**Nghiệm thu:** vườn chưa vẽ ranh giới nhưng có ≥ 1 cây có GPS → sơ đồ 3D đặt cây theo GPS thật
(`posSource === 'gps'`), không phải `'auto'`. Đặt mốc xong, thoát app, mở lại còn nguyên.

### Bước 2 — Đưa mốc lên máy chủ (chặn ở nhà khác)

Máy chủ chưa có chỗ (mục 2.4). Cần Core mở một ô riêng ghi qua `_set_unhashed_field`, **không**
đưa vào `PUBLIC_FIELDS` (đã chốt trong issue #77, bình luận 15/08). Trước khi có ô đó, mốc chỉ
sống trong máy — mất máy là mất mốc, và người khác trong nhà không thấy mốc của nhau. Nói thẳng
điều đó trên màn, đừng để người dùng tự đoán.

### Bước 3 — Chỉnh hướng bằng cách chụp một cây đã đăng ký

La bàn là mắt xích yếu nhất: lệch 20° ở 30 m là cây hiện sai chỗ hơn 10 m. Dùng lại `identifyTree`
(`src/services/treeReIDService.ts`) — nhận ra cây nào, biết cây đó ở đâu, biết mình ở đâu → suy
ra hướng, không cần la bàn. **Điều kiện vào bước này: có số đo la bàn thật ngoài vườn** (đo ở
5 chỗ, ghi rõ vật kim loại gì cách bao xa). 5° thì bỏ qua bước này; 40° thì nó là bắt buộc.

### Bước 4 — Màn AR nhẹ: hình máy ảnh + cảnh 3D vẽ đè

Đây là chỗ đầu tiên phải đụng native. Hai đường, **cả hai đều chưa đo**:
- Dùng `<Camera>` của `react-native-camera-kit` (đã là phụ thuộc, đang chạy ở
  `TraceScanScreen.tsx:19` và `WebLoginScanScreen.tsx:24`) làm nền, canvas `expo-gl` trong suốt
  vẽ đè.
- Hoặc thêm một view xem trước nhẹ, tách khỏi phiên `TreeReID` (mục 2.2).

Phải dựng thử trên máy thật rồi mới ước lượng được. Đừng hứa ngày trước khi có bản dựng chạy.

### Bước 5 — ARKit/ARCore, chỉ khi bước 4 đo ra là chưa đủ

Giữ nguyên kết luận trong issue: iOS ARWorldMap là **lớp thêm**, hỏng thì rơi êm về GPS;
Android chờ đo chi phí Cloud Anchor. Không đặt cược bản nào vào nó.

## 4. Cái nên bỏ khỏi phạm vi

Giữ nguyên ba mục đã chốt trong issue (bình luận 14/08): bỏ "đo khoảng cách giữa các đối tượng",
đẩy ARWorldMap/Cloud Anchor sang bước 5, chờ Core #292 cho bản dựng 3D cây thật.

---

Đo và soạn bởi SuperApp agent, 2026-08-18. Chưa đổi một dòng nào trong `src/`.
