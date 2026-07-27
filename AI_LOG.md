# AI_LOG

> Nhật ký thay đổi do AI thực hiện. **Đọc file này TRƯỚC khi làm việc** thay vì quét cả project.
> Mỗi mục: ngắn gọn — làm gì / file liên quan / cách dùng. Mục mới thêm lên đầu.

---

## KHÔNG-GIAN 3D vườn · cây · quả (three + @react-three/fiber/native)

Một hệ giao diện 3D DUY NHẤT thay cho các sơ đồ 2D rời rạc + WebView `/view/{code}`.

### Màn hình
- `src/screens/Space3DScreen.tsx` — route **`Space3D`**. 2 chế độ trong CÙNG một cảnh:
  - **Toàn cảnh vườn**: mặt đất dựng từ ĐIỂM NỐI ranh giới (`Farm.coordinates`) + mọi cây (model `assets/models/tree1.glb`). Chạm 1 cây → **fly-in vòng cung** (camera lượn ra rồi sà vào, ease-in-out, ~1.6 s).
  - **Xem 1 cây**: chấm QUẢ phát sáng + tên cây/tên quả. Chạm quả → thẻ thông tin (toạ-độ, số góc ảnh, ảnh các góc, đặt lại vị trí).
  - Cử chỉ: 1 ngón xoay · 2 ngón phóng · chạm nhanh chọn. Nền TỐI.
- `src/screens/FruitPlace3DScreen.tsx` — route **`FruitPlace3D`**. Đặt toạ-độ quả bằng cách KÉO icon quả trên hình cây, qua **3 hướng chiếu** (mỗi hướng khoá 1 trục): Trước = X·Y (khoá Z) · Bên = Z·Y (khoá X) · Trên = X·Z (khoá Y).

### Lõi (`src/features/space3d/`, phần toán THUẦN có test)
- `geo.ts` — lat/lng → mét (+X Đông, −Z Bắc), đa-giác ranh giới, `seededPointInRing` (cây chưa có GPS đứng NGẪU NHIÊN nhưng ỔN ĐỊNH theo tree_id → không nhảy chỗ mỗi lần mở). Ranh giới thiếu/suy biến → ô vuông mặc định.
- `treeFrame.ts` — **hệ toạ-độ riêng của mỗi cây**: x,z ∈ [−1,1], y ∈ [0,1] (gốc→ngọn); 1 đơn vị = `TREE_RADIUS`/`TREE_HEIGHT` mét. `coordToServer`/`coordFromServer` giữ tương thích `zone`/`pos_x`/`pos_h`.
- `projection.ts` — quy đổi px ⇄ mét cho 3 hướng chiếu (camera ORTHO nên tuyến tính, đảo ngược chính xác → icon quả vẽ bằng View của RN vẫn khớp cây, luôn kéo được, không cần raycast).
- `controller.ts` (máy quay + fly-in), `visuals.ts` (bảng màu tối + texture quầng sáng dựng bằng `DataTexture`, RN không có canvas), `labelBus.ts` (nhãn 3D → `<Text>` RN, tránh setState làm dựng lại `<Canvas>`), `positionStore.ts`, `useSpaceData.ts`.
- Test: `geo.test.ts` · `treeFrame.test.ts` · `projection.test.ts` — **65 test** (đi-vòng px⇄toạ-độ, trục bị khoá, tính ổn định theo id, hình lõm…).

### Quả phát sáng xuyên cây (kiểu Minecraft)
Quả nằm trong tán nên bị model che → mỗi quả 2 lớp `depthTest:false` + `renderOrder` cao: lõi đặc + quầng `AdditiveBlending` đập theo nhịp thở. Quả đang chọn to & sáng hơn.

### Vị trí cây / quả
- Cây: **ưu tiên** đặt tay → GPS → ngẫu nhiên ổn định trong ranh giới. Đặt tay = bật chế độ đặt rồi chạm mặt đất (cắt tia xuống mặt phẳng y=0). Vào thẳng chế độ này qua `Space3D { placeTreeId }` — nút 📍 ở header Chi tiết cây.
- Quả: `FruitCropper` bước đặt tên nay có ô **"Đặt vị trí trên cây (3D)"** (vẫn giữ 3 nút tầng làm lối tắt thô). Toạ-độ ban đầu ước lượng sẵn từ bbox trong ảnh.
- **Server chỉ lưu 2 chiều** (`zone`+`pos_x`+`pos_h`) → trục z và vị-trí cây đặt tay lưu tại MÁY (`positionStore`, AsyncStorage). x/y vẫn đẩy lên server nên máy khác + sơ đồ 2D cũ vẫn đúng, chỉ mất chiều sâu.

### Lối vào đã đổi (mọi nút sơ đồ → 1 hệ 3D)
`TreeDetail` "Sơ đồ 3D" · `FarmDetail` nút 3D trên thẻ cây · `FruitList` "Sơ đồ 3D" → đều mở `Space3D`. `TreeMap2D`/`FarmMap2D`/`TreeViewer3D` GIỮ đăng ký route (deep-link cũ) nhưng không nút nào trỏ tới nữa. Nút "Xem 3D" cũ chỉ hiện khi `has_3d` → nay cây NÀO cũng xem được.

### Gỡ build Android sau khi thêm expo-modules (5 lỗi nối tiếp)
1. **`Kotlin 1.9.24 is not supported by Expo modules` (min 2.1.20)** → `android/build.gradle`: `kotlinVersion = "2.1.20"`. Đây vốn là bản RN 0.84 dùng trong version catalog của `@react-native/gradle-plugin`, VÀ khớp KSP đã ghim sẵn (`2.1.20-1.0.32`) — tức con số 1.9.24 cũ đã lệch từ trước.
2. **`Please remove 'kotlin.incremental.useClasspathSnapshot=false'`** → gỡ khỏi `android/gradle.properties`. Flag này từng dùng để né bug snapshot của Kotlin 1.9 + Gradle 9 + JDK 21; Kotlin 2.1.20 bỏ hẳn flag và báo lỗi cứng nếu còn. Đã ghi chú tại chỗ để không ai thêm lại.
3. **`Could not find host.exp.exponent:expo.modules.gl:57.0.2`** → `android/settings.gradle`: `repositoriesMode` từ `PREFER_SETTINGS` → **`PREFER_PROJECT`**. Expo SDK 57 ship AAR dựng sẵn trong `node_modules/<gói>/local-maven-repo`, và `expoAutolinking.useExpoModules()` đăng ký các repo đó ở MỨC PROJECT (`rootProject.allprojects { linkLocalMavenRepository }`) — `PREFER_SETTINGS` bỏ qua sạch. Lý do cũ đặt PREFER_SETTINGS (ép lib gọi jcenter đi mavenCentral) không còn cần: patch `react-native-sqlite-storage` đã sửa jcenter→mavenCentral ngay trong module autolinking dùng, mà đó là repo của `buildscript` nên vốn không chịu ảnh hưởng khối này.
4. **`Refused to load dangerous environment variables from .env files (.env: ENV)`** → task `createExpoConfig` của expo-constants đọc `.env` bằng @expo/env, mà `.env` dự án có khoá `ENV` nằm trong danh sách chặn. App KHÔNG dùng hệ config Expo (nạp .env bằng `react-native-dotenv` lúc Babel, `app.json` là JSON tĩnh) → đặt `EXPO_NO_DOTENV=1` **chỉ cho riêng task đó** trong `android/build.gradle` (`subprojects` + `tasks.matching{}.configureEach{}` để bắt được task đăng ký muộn), không đụng môi trường build chung.
5. **Manifest merger: `WRITE_EXTERNAL_STORAGE` maxSdkVersion 29 (app) vs 32 (expo-file-system)** → thêm `xmlns:tools` + `tools:replace="android:maxSdkVersion"`, GIỮ 29 của app (chặt hơn).
6. **Build C++ expo-modules-core gãy: `no member named 'tryGetMutableBuffer' in jsi::ArrayBuffer`** → **HẠ Expo từ SDK 57 xuống SDK 56**. Gốc rễ: **RN 0.84.1 KHÔNG có Expo SDK nào khớp** (bảng của install-expo-modules: SDK 55 ↔ RN 0.83, SDK 56 ↔ RN 0.85 — Expo bỏ qua 0.84). SDK 57 dùng API JSI chỉ có ở RN mới hơn. Đã kiểm chứng bằng cách tải mã nguồn expo-modules-core 55/56 và grep: cả hai đều KHÔNG dùng `tryGetMutableBuffer`. Chốt bộ SDK 56: `expo@56.0.17` · `expo-gl@56.0.6` · `expo-asset@~56.0.21` · `expo-file-system@~56.0.8` (kéo theo expo-modules-core 56.0.22).
7. **`fatal error: 'worklets/Compat/StableApi.h' file not found`** → `patches/expo-modules-core+56.0.22.patch` + `expo.enableWorkletsIntegration=false` trong `android/gradle.properties`. expo-modules-core 56 tự bật tích hợp worklets khi thấy project `:react-native-worklets`, và cần header chỉ có ở worklets mới hơn 0.7.4 (bản dự án đang dùng). Patch mở property để TẮT. An toàn vì: `WorkletRuntimeInstaller.cpp` bọc toàn bộ trong `#if WORKLETS_ENABLED` (tắt → trả nullptr/0), phía Kotlin chỉ tham chiếu class của chính expo chứ không import class thư viện worklets, và app không chạy expo module nào trên worklet runtime. Nâng react-native-worklets sau này thì bỏ property + gỡ patch.
8. **iOS**: `platform :ios` trả về `min_ios_version_supported` (RN 0.84 = 15.1) thay cho số cứng `'16.4'` mà công cụ đặt cho SDK 57 — SDK 56 chỉ cần 15.1, đúng bằng mức tối thiểu của RN.

9. **Chạy app ra màn đỏ `404 .expo/.virtual-metro-entry.bundle`** → `MainApplication.kt`: truyền `jsMainModulePath = "index"` cho `ExpoReactHostFactory.getDefaultReactHost(...)`. Hàm này MẶC ĐỊNH `".expo/.virtual-metro-entry"` (entry ảo của Expo CLI) — app chạy metro RN gốc nên không có đường dẫn đó. Cùng bản chất với chỗ đã sửa bên `AppDelegate.swift` (`forBundleRoot: "index"`), nhưng bên Android nó NẤP trong tham số mặc định của hàm chứ không hiện ra trong diff của công cụ.

10. **Mở sơ đồ 3D nổ `undefined is not a function` tại `three.core.js` (extractUrlBase) + `TreeModel` chết** → `metro.config.js`: `resolver.resolveRequest` ép MỌI `import 'three'` về đúng `node_modules/three/build/three.module.js`.
   Gốc rễ = **dual package hazard**: `three` khai báo `exports["."]` hai nhánh, `require` → `build/three.cjs` (bundle TỰ CHỨA, bản sao riêng của mọi class), `import` → `build/three.module.js` (re-export từ `three.core.js`). Metro nạp CẢ HAI:
   · `@react-three/fiber/native` resolve qua `main` → bản CJS → `require('three')` → **three.cjs**
   · `three/examples/jsm/loaders/GLTFLoader.js` (ESM) → `import 'three'` → **three.core.js**
   R3F vá `THREE.LoaderUtils.extractUrlBase` + `THREE.FileLoader.prototype.load` (để đọc asset RN qua expo-asset) trên bản three.cjs, còn GLTFLoader chạy bản three.core.js CHƯA vá → nhận module-id dạng SỐ của `require('tree1.glb')` → `url.lastIndexOf is not a function`.
   Nguy hiểm hơn: 2 bản three còn làm mọi `instanceof` giữa R3F và code app sai âm thầm.
   Kiểm chứng sau khi sửa: bundle 5.09 MB → **4.36 MB** (−730 KB = đúng 1 bản three), số lần xuất hiện `extractUrlBase` 10 → 7.
   ⚠️ Đổi metro config → phải `npx react-native start --reset-cache` (KHÔNG cần build lại native).

11. **Vẫn nổ `extractUrlBase` sau khi ép 1 bản three (hình vườn hiện, CÂY không hiện)** → BỎ HẲN `useLoader` cho model, tự nạp trong `src/features/space3d/treeAsset.ts`:
   `require(glb)` → `Asset.fromModule().downloadAsync()` → `readAsStringAsync(base64)` → ArrayBuffer → **`new GLTFLoader().parse(buffer, '')`**.
   `parse()` KHÔNG gọi `extractUrlBase`, KHÔNG dùng `FileLoader` → không còn phụ thuộc bản-vá-khỉ của R3F (thứ chỉ ăn khi R3F và GLTFLoader dùng chung thể-hiện three, không có gì bảo đảm). Nạp 1 lần, cache promise ở mức module, mỗi cây chỉ `clone()`.
   `TreeModel` giờ trả **null** khi model chưa xong / lỗi thay vì ném — hỏng model thì chỉ mất hình cây, mặt đất + ranh giới + chấm quả vẫn hiện (bỏ luôn `<Suspense>` vì không còn gì suspend).
   Thêm `base64-js` vào dependencies (trước là gói bắc cầu).

12. **Thao tác được sơ đồ nhưng KHÔNG thấy model cây** → `src/features/space3d/glb.ts` (mới): tách texture nhúng khỏi GLB trước khi `parse()`.
   Gốc rễ: `tree1.glb` NHÚNG sẵn PNG trong buffer. `GLTFLoader.loadImageSource` mở đầu bằng `const URL = self.URL || self.webkitURL` — **`self` là global của TRÌNH DUYỆT, React Native không có** → `parse()` ném `self is not defined`, không cây nào hiện (mặt đất/ranh giới vẫn hiện nên dễ tưởng model sai tỉ lệ).
   Đã TÁI HIỆN y hệt bằng Node ngoài môi trường DOM: `PARSE FAILED: self is not defined` tại `GLTFLoader.js:3301`.
   Cách xử lý: tách chunk JSON/BIN → lôi PNG ra khỏi bufferView → xoá `images`/`textures`/`samplers` + `baseColorTexture` → ghép lại GLB → `parse()` chỉ còn hình học (đã kiểm bằng Node: **PARSE OK, 1 mesh, 97 đỉnh**, UV còn nguyên) → ghi PNG ra cache, tự dựng `THREE.Texture` theo đúng dạng expo-gl cần (`image = { data: { localUri }, width, height }` + `isDataTexture`), `flipY=false` + `SRGBColorSpace` theo đúng quy ước glTF của three.
   Gắn vân hỏng → chỉ mất vân, cây vẫn hiện (try/catch riêng).
   Test: `glb.test.ts` — 14 test đọc **tệp .glb THẬT** của dự án (magic PNG, đi vòng split→build→split, căn 4 byte, giữ nguyên hình học, tệp hỏng không đọc lố).

13. **`ReferenceError: Property 'TextDecoder' doesn't exist`** → `src/features/space3d/textCodec.ts` (mới): polyfill TextEncoder/TextDecoder UTF-8, cài ở đầu `glb.ts`.
   **Hermes KHÔNG có TextDecoder/TextEncoder.** Không chỉ mã của mình cần: `GLTFLoader.parse()` gọi `new TextDecoder()` NGAY DÒNG ĐẦU để đọc chunk JSON của .glb → thiếu nó thì không model nào nạp được, dù mọi thứ khác đúng.
   Chỉ cài khi môi trường thiếu (không giẫm lên bản native nhanh hơn). Xử lý đúng cặp thay thế (emoji), bỏ BOM (JSON.parse sẽ nghẹn nếu còn), giải mã theo lô 4096 để chuỗi dài không tràn ngăn xếp, byte hỏng → U+FFFD chứ không ném.
   Kiểm chứng E2E: xoá `TextDecoder` khỏi Node để giả lập Hermes, chỉ cài polyfill → **PARSE OK, 1 mesh, 97 đỉnh**.
   Test: `textCodec.test.ts` — 19 test (đi vòng tiếng Việt/emoji, đúng số byte, byteOffset của khung nhìn, BOM, không giẫm bản dựng sẵn).
14. **Chẩn đoán về sau**: `TreeModel` có **CÂY DỰ PHÒNG** (thân trụ + 2 tán nón, cùng tỉ-lệ) và Space3D hiện **lỗi nạp model thẳng lên HUD**. Nhờ vậy phân biệt được ngay: thấy cây-nón + thông báo = lỗi NẠP MODEL (có lý do cụ thể); không thấy gì = lỗi DỰNG HÌNH/ÁNH SÁNG/VỊ TRÍ. Chính cơ chế này đã lôi ra lỗi TextDecoder ở trên chỉ sau 1 lần chạy.
   Vật liệu được đặt màu lá TRƯỚC khi thử gắn vân → vân hỏng thì cây vẫn xanh, không thành khối đen tàng hình trên nền tối.
   `resolveAssetUri` có 2 đường: expo-asset → lùi về `Image.resolveAssetSource` + `FileSystem.downloadAsync` (bare RN không có plugin metro `hashAssetFiles` của Expo), hỏng cả hai thì báo GỘP cả 2 lý do.

### Chọn model 3D cho từng cây (11 model, mở rộng được)
- `treeModels.ts` — **SỔ ĐĂNG KÝ**. Thêm model mới = chép .glb vào `assets/models/` + thêm ĐÚNG 1 mục vào `TREE_MODELS`; bộ chọn, kho lưu và phần nạp tự ăn theo, không sửa gì thêm. Trường: `id` (khoá lưu xuống máy — phải ỔN ĐỊNH), `label`, `source` (`require()` viết THẲNG, Metro cần hằng chuỗi), `heightScale`, `credit`.
- **Mặc định = "Cây tự tạo"** (`source: null`, dựng bằng hình học) → không cần tệp, luôn hiển thị được.
- `treeModelStore.ts` — lưu lựa chọn theo từng cây (AsyncStorage, server chưa có chỗ chứa). Đọc hàng loạt bằng multiGet; id lạ (model bị gỡ khỏi sổ) → rơi về mặc định chứ không nổ.
- `TreeModelPreview.tsx` — **icon nút chính là model 3D**, quay chậm, camera tự canh theo hộp bao nên model nào cũng vừa ô. Bộ chọn là LƯỚI 3 cột, ô VUÔNG bo góc 8px, bề rộng tính theo màn hình.
- ⚠️ Mỗi ô xem trước = 1 ngữ-cảnh GL riêng (11 ô). Chỉ gắn khi hộp thoại MỞ + tắt khử răng cưa. Nếu máy yếu thấy giật thì hướng tối ưu: chỉ dựng ô đang lọt khung nhìn, hoặc chụp 1 lần ra ảnh rồi cache.

**Hai lỗi đã chặn trước khi phát sinh** (kiểm 10 tệp bằng Node trước khi ghép vào):
1. **Tên tệp** — RN `getAndroidResourceIdentifier` XOÁ mọi ký tự không phải `[a-z0-9_]`. Tên gốc có dấu cách, gạch ngang và chữ `à` ("Tree by Marc Solà") sẽ bị biến dạng khi build Android → đã đổi sang `bush.glb`, `tree_zsky_a.glb`… Thông tin tác giả chuyển vào trường `credit` (hiện trong app, đúng chỗ hơn nằm trong tên tệp). Đã xác nhận bundle ra `assets_models_*.glb` sạch, đủ 10 tệp.
2. **Màu vật liệu** — 4/10 model KHÔNG có texture nhúng, chúng dùng màu tự khai (chậu / đất / lá riêng màu). Code cũ ghi đè màu lá lên MỌI vật liệu → sẽ phá màu gốc. Nay chỉ động vào vật liệu THẬT SỰ mất ảnh: ghi lại tên vật liệu có `baseColorTexture` TRƯỚC khi xoá, rồi chỉ bù màu/gắn vân cho đúng những cái đó.
- `normalize()` nhận thêm `heightScale`; vẫn đo hộp bao lúc chạy nên model từ 0.9 đến 509 đơn-vị đều ra đúng cỡ, và kéo theo `box.min.y` nên model có `minY < 0` (bush −0.29, tree_zsky_b −8.99) không bị lún/lơ lửng.
- `jest.config.js` + `__mocks__/assetModuleStub.js`: map `.glb/.gltf` sang stub số — Metro biến `require()` thành id asset dạng số, Jest không có bước đó nên sẽ cố parse tệp nhị phân và nổ.

✅ `gradlew app:assembleDebug` **BUILD SUCCESSFUL** — `app-debug.apk` (274.6 MB, debug).

> ⚠️ **Tổ hợp KHÔNG được Expo hỗ trợ chính thức** (RN 0.84 + Expo SDK 56). Chỉ dùng expo-modules-core làm nền cho expo-gl. Khi nâng RN, kiểm tra lại 2 điểm gãy đã biết: API JSI (`tryGetMutableBuffer`) và header worklets.

### Hạ tầng (BẮT BUỘC BUILD LẠI NATIVE — không phải reload metro)
- Thêm `three` · `@react-three/fiber` · `expo-gl` · `expo-asset` · `expo-file-system` · `expo` (SDK 57).
- `npx install-expo-modules` để autolink expo-modules-core (bare RN). **Đã sửa tay 3 lỗi công cụ sinh ra**: `import` đặt TRƯỚC `package` trong `MainActivity.kt`/`MainApplication.kt` (không biên dịch được), và bundle entry iOS trỏ `.expo/.virtual-metro-entry`.
- **CỐ Ý hoàn tác** phần "Expo CLI integration": giữ `babel.config.js` = preset RN gốc và `metro.config.js` = metro RN gốc (app là bare RN, chỉ mượn expo-modules-core cho expo-gl; đổi preset toàn app là rủi ro thừa cho dotenv/worklets).
- `babel.config.js`: thêm `@babel/plugin-transform-class-static-block` — three.js ESM dùng `static { … }`, preset RN chưa hiểu → metro gãy ngay ở `class Vector2`.
- `metro.config.js`: `assetExts` thêm `glb, gltf, bin, hdr`.
- iOS `platform :ios` 16.4 (yêu cầu của expo-modules) → cần `pod install` lại.
- Đã kiểm chứng: `tsc` sạch · eslint 0 error ở file mới · 492 test pass · **`react-native bundle` Android chạy được** (glb ra `raw/assets_models_tree1.glb`). CHƯA chạy thử trên máy thật.

## Fix chi tiết cây KHÔNG hiện danh sách quả (2 nguồn dữ-liệu quả tách rời)

Triệu chứng: thêm quả xong, vào Chi tiết cây → "DANH SÁCH QUẢ" luôn rỗng.
Gốc rễ: **hai nguồn quả khác nhau**. Luồng thêm quả (`TreeDetail → FruitList → FruitCropper → POST /api/fruit/enroll`) ghi lên **field-reid (server)**; còn `TreeDetailScreen` lại đọc **bảng SQLite `fruits`** qua thunk `loadFruits` — bảng đó CHỈ được ghi bởi luồng "Lưu onnet" đã bỏ (`handleSaveOnnet` là code chết, `setFruitIdentificationResult` không nơi nào gọi). → danh sách luôn rỗng, không phải lỗi lưu.
- `TreeDetailScreen.tsx`: bỏ `loadFruits/saveFruit/state.farm.fruits` → dùng `getTreeLayout(ORILIFE_BASE, tree.id)` (`GET /api/tree/{id}/layout`) — ĐÚNG nguồn `FruitListScreen`/`TreeMap2D` đang dùng.
  - Nạp lại bằng `useFocusEffect` (khoanh quả xong quay về là thấy ngay); lần đầu có spinner, lần sau im lặng; `reqIdRef` chống phản-hồi cũ ghi đè.
  - Trạng thái quả đổi sang từ-vựng ĐÚNG server `on_tree/harvested/lost` (bộ cũ `growing/mature/sold` không khớp gì → bộ lọc vô dụng). Bộ lọc + hero-stats + chip đều theo bộ mới.
  - Thẻ quả: ảnh thumbnail server + tên + `n_views` góc + zone + ngày; trước hiện `item.code`/`weightGram`/`diameter` — field KHÔNG tồn tại.
  - Vòng % giờ tính `harvested/total` (server `/api/trees` không trả `harvestProgress` → trước luôn 0%).
  - Thêm trạng thái **đang tải / lỗi + "Thử lại"** — trước lỗi mạng hiện như "Chưa có quả nào" (tưởng mất dữ liệu).
  - Tab "Lịch sử": trước đọc `capture_id`/`captured_at`/`frame_count` từ object không có field đó → trắng + "Invalid Date". Nay = danh sách quả theo thời-gian.
  - **Hooks đặt TRƯỚC early-return `if (!tree)`** (trước có hook nằm SAU → sai thứ tự hook khi tree đổi).
  - Kẹp `currentPage ≤ totalPages` (danh sách co lại sau reload → trang trống oan).
  - Xoá code chết: overlay "Lưu onnet" + `handleSaveOnnet` + styles liên quan.
- `fruitReIDService.ts` `_apiCall`: tự `ensureOrilifeToken(base)` TRƯỚC mỗi gọi + gặp 401 thì ký lại (force) rồi thử lại 1 lần. Trước đây file này KHÔNG hề ký token (khác `farmSlice`/`FarmDetail`/`FruitVideo`) → vào thẳng luồng quả sau khi mở app là 401 "Phiên hết hạn" oan. Sửa 1 chỗ → mọi endpoint quả/species/layout/cropper hưởng.
- `loadFruits`/`saveFruit` trong `farmSlice` + `database.saveFruit` nay KHÔNG còn nơi gọi (giữ lại, chưa gỡ).

## Truy xuất mở Dashboard MẤT navbar → tab Farm = Dashboard

Nút "Truy xuất" (Home/Dịch vụ) mở route `Dashboard` = MÀN ROOT-STACK → phủ trùm `Main` (nơi chứa navbar + AppHeader) → mất navbar. Các service khác giữ navbar vì đích của chúng là TAB.
Quyết định (user chọn): **tab Farm hiện Dashboard**; danh sách vườn tách thành màn con `FarmList`.
- `registry.ts` trace.screens: `Farms: DashboardScreen` (tab giờ = Dashboard), thêm `FarmList: FarmListScreen`, giữ `Dashboard: DashboardScreen` (deep-link cũ).
- `trace/module.manifest.json` routes: thêm `"FarmList"`.
- `modules/index.ts` trace `routeName: 'Dashboard'` → `'Farms'` (điều hướng vào TAB → giữ navbar).
- `DashboardScreen` nút "Trang trại" → `navigate('FarmList')` (thay `'Farms'` tự trỏ chính nó).
- `HomeScreen.handleCreateFarm` → `navigate('FarmDetail',{farm_id:null})` (vì `'Farms'` nay là Dashboard).
- `FarmListScreen`: thêm nút quay lại (giờ là drill-down root-stack, không có navbar).
- `resolveGateItems.test.ts`: mục `prominent` (Trace-quét, icon-only) MIỄN kiểm label rỗng.
- Nguyên tắc: muốn màn GIỮ navbar+header → phải là TAB trong `Main`; điều hướng `navigate('Main',{screen:<tab>})` hoặc tới route tab. Màn root-stack luôn phủ Main.

## Fix Trace màn trắng khi store.farm rỗng (Home hiện 0 farm) — cold-start

Triệu chứng: reopen app → "Thông tin nhanh" (Home) hiện 0 trang trại/0 cây dù đã thêm; bấm Truy xuất → màn trắng skeleton. Khi Home hiện đúng số → Truy xuất mở bình thường.
Gốc rễ: store redux KHÔNG persist → mỗi phiên khởi động store.farm rỗng. Home CHỈ đọc `s.farm.*`, KHÔNG bao giờ dispatch load. Dashboard là nơi DUY NHẤT nạp farm, mà lại đọc `farms` từ closure cũ (rỗng ở focus đầu) → dễ kẹt/rỗng.
Fix:
- `HomeScreen.tsx`: thêm effect warm-load `loadFarms`+`loadTrees` khi có `user.id` (DB đã mở sau đăng nhập). → Home hiện đúng số & hâm nóng store trước khi bấm Truy xuất.
- `DashboardScreen.tsx` `loadDashboard`: dùng `dispatch(loadFarms).unwrap()` lấy mảng farm THẬT (bỏ đọc `farms` closure) → nạp trees/activities ngay lần đầu; lỗi DB → catch → hiện trạng thái LỖI (có retry) thay vì skeleton trắng vô hạn. Bỏ `farms` khỏi deps.
- Bối cảnh: `databaseManager` mở DB per-DID CHỈ trong thunk `loginUser`; app luôn bắt đăng nhập lại mỗi phiên nên DB sẵn sau login. `loadTrees.fulfilled` REPLACE `state.trees` (nhiều farm chỉ giữ trees farm cuối — bug cũ, chưa sửa).

## Fix Dashboard Trace kẹt loading khi user mới / chưa có trang trại

`src/modules/trace/screens/DashboardScreen.tsx` — vào Trace (route `Dashboard`) khi `currentUser` null (user mới, chưa có farm) → màn trắng, chỉ skeleton loading mãi.
- Nguyên nhân: `loadDashboard` có `if (!user) return;` ĐẶT TRƯỚC `try/finally` → `setHasLoadedOnce(true)` trong finally không chạy → điều kiện loading (`!hasLoadedOnce && !hasData`) kẹt true.
- Fix: chuyển guard `if (!user) return;` VÀO trong `try` → finally luôn chạy → rơi xuống empty state "Chưa có dữ liệu / Hãy thêm trang trại đầu tiên".

## Fix icon Home + QR scan không hiện (sót MCI name)

`resolveGateItems.ts` có registry icon RIÊNG chưa migrate → nút giữa (Home) & mục Trace-quét (QR) render null.
- `index.tsx` mainIcon fallback `home-variant` → `house`.
- `resolveGateItems.ts`: pine-tree→tree, needle→syringe, barn→warehouse, wallet-outline→wallet, bell-outline→bell, **qrcode-scan→qrcode**.
- Bài học: icon strings nằm ở NHIỀU registry (navLabels, actionRegistry, **resolveGateItems**, + fallback rải rác). Đổi bộ icon phải quét HẾT. Dùng script cross-check: node so tên `icon:`/`name=` với `ICONS`.

## Áp dụng Icon cho Navbar + Arc menu

Đã thay `react-native-vector-icons/MaterialCommunityIcons` → `<Icon>` (FA Solid) ở navbar + arc menu.
- Files: `src/navigation/NavItemFrame.tsx`, `src/navigation/index.tsx` (import), `src/navigation/navLabels.ts` (NAV_FRAME), `src/navigation/actionRegistry.ts` (action icons).
- Tên icon trong registry đổi từ MCI → FA Solid. FA Solid là 1 style → `icon` = `iconActive` (trạng thái active/nghỉ phân biệt bằng MÀU `tint`/`dimTint`, không đổi glyph).
- Map: home→house, chat-processing→comments, sprout→seedling, briefcase→briefcase, lightning-bolt→bolt, account-circle→circle-user, close-circle-outline→circle-xmark, pine-tree→tree, fruit-cherries→apple-whole, video-plus→video, paw→paw, watering-can→droplet, silverware-fork-knife→utensils, needle→syringe, barn→warehouse, cow→cow. Fallback dashboard→table-cells-large.
- `<Icon name>` giờ nhận `IconName | string` (registry truyền string động; tên lạ → null + warn DEV).
- `react-native-vector-icons` VẪN còn dùng ở file khác — chưa gỡ khỏi package.json.

## Hệ thống Icon (Font Awesome Solid)

**Bộ icon chính của toàn app** = Font Awesome Solid (`fa6-solid`) tải từ Iconify.

- **Nguồn (source of truth):** `assets/icons/*.svg` — file SVG tải từ Iconify.
- **Registry (auto-gen):** `src/components/Icon/icons.generated.ts` — KHÔNG sửa tay.
- **Component:** `src/components/Icon/Icon.tsx` (render bằng `react-native-svg`).
- **Import:** đường dẫn tương đối tới `src/components/Icon`, vd `import { Icon } from '../../components/Icon'` (project chưa cấu hình path alias).
- **Script:** `scripts/icons.js`.

### Dùng
```tsx
<Icon name="house" size={24} color="#16A34A" />        // fill (mặc định)
<Icon name="bell" size={20} color="#111" variant="outline" strokeWidth={28} />
<Icon name="user" size={28} color="#888" opacity={0.6} accessibilityLabel="Hồ sơ" />
```
Props: `name` (bắt buộc) · `size` (cao px, rộng tự scale, def 24) · `color` (def #000) ·
`variant` `'fill'|'outline'` (def fill) · `strokeWidth` (def 24) · `opacity` · `style` · `accessibilityLabel`.
Icon không tồn tại → render null + cảnh báo ở DEV.

### Thêm icon mới
1. Tìm tên tại https://icon-sets.iconify.design/fa6-solid/
2. `npm run icons -- <ten1> <ten2>`  → tải SVG + regenerate registry.
   (Hoặc `node scripts/icons.js` không tham số = chỉ regenerate từ SVG đã có.)

### Đã seed 62 icon (49 gốc + 13 cho navbar/arc)
arrow-left/right, arrow-right-from-bracket, bars, bell, bookmark, briefcase, calendar, camera,
check, chevron-(left/right/up/down), circle-(info/check/xmark/exclamation), clock, comment(s),
credit-card, ellipsis-vertical, envelope, eye, eye-slash, filter, gear, gift, heart, house,
house-chimney, image, leaf, location-dot, lock, magnifying-glass, paper-plane, pen, phone, plus,
qrcode, share-nodes, sliders, star, trash, user, wallet, xmark.
+navbar/arc: seedling, bolt, circle-user, table-cells-large, tree, apple-whole, video, paw, droplet,
utensils, syringe, warehouse, cow.

### Ghi chú kỹ thuật
- `react-native-svg@15.15.5` đã thêm vào `package.json` (trước đó chỉ là transitive dep).
- Icon FA Solid là glyph đặc → `variant="outline"` = stroke silhouette (dùng khi cần, có thể không đẹp mọi icon).
- viewBox width mỗi icon khác nhau (vd house 576×512) → component scale rộng theo tỉ lệ, cao = `size`.
