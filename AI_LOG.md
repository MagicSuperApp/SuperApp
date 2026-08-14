# AI_LOG

> Nhật ký thay đổi do AI thực hiện. **Đọc file này TRƯỚC khi làm việc** thay vì quét cả project.
> Mỗi mục: ngắn gọn — làm gì / file liên quan / cách dùng. Mục mới thêm lên đầu.

---

## BẬT LẠI 3D — bỏ chốt chặn `globalThis.expo`, thay bằng phép dò expo-gl thật

Từ `3149f0b` mọi màn 3D (`Space3D` · `FruitPlace3D`) bị **chặn cứng** trong `_make3D` (`src/navigation/index.tsx`): `typeof globalThis.expo === 'undefined'` ⇒ hiện màn "Mô hình 3D tạm chưa xem được", **không bao giờ import** màn thật. Chốt đó đúng ở thời điểm nó ra đời (bản signed crash SIGABRT), và commit ấy tự ghi rõ *"3D chỉ HẾT CRASH, chưa HIỂN THỊ lại"*. Nguyên nhân gốc đã sửa từ lâu — `patches/expo+56.0.17.patch` set `host.runtimeDelegate` cho iOS (RN 0.84.1 không tự set như 0.85+), Android đã dùng `ExpoReactHostFactory` trong `MainApplication.kt` — nhưng **chốt JS thì chưa ai gỡ**. Nay gỡ.

**Thay bằng `_glAvailable()` — dò THẬT, không đoán:**
```ts
try { require('expo-gl'); ok = true } catch (e) { ok = false }   // dò 1 lần, nhớ kết quả
```
`require` **đồng bộ** trong `try/catch` là mấu chốt an-toàn: nếu native chưa cài `globalThis.expo`, expo-modules-core ném ở module-eval và lỗi bị bắt **ngay tại đây** như một lỗi JS thường. Khác hẳn việc để `React.lazy` nuốt lỗi **bất đồng bộ** — đường đó ở bản RELEASE đi qua `ExceptionsManager.reportException` rồi **tự SIGABRT** trước khi `GLErrorBoundary` kịp bắt (chính là lý do chốt cứng ra đời).

Vì sao dò hơn kiểm cờ: `globalThis.expo` chỉ là dấu hiệu **gián tiếp**. Cờ có mà expo-gl vẫn hỏng (R8 ăn `GLContext.flush()` như mục "Crash 3D bản AAB" bên dưới) thì cờ nói dối; ngược lại cờ được cài bằng đường khác thì chốt cứng chặn oan. Dò đúng thứ sắp dùng thì không có khe hở đó.

Thời điểm dò **không đổi so với trước**: chỉ chạy khi người dùng mở màn 3D, nên expo **vẫn không** bị kéo về lúc startup — lý do `React.lazy` tồn tại vẫn còn nguyên. `Suspense` + `GLErrorBoundary` giữ nguyên. `Expo3DUnavailable` giữ lại nhưng đổi vai: từ **công tắc tắt** thành **lưới an toàn** cuối cùng.

**Mốc log mới** `viewer3d_gl_probe {ok, message}` (`remoteLogger.ts`) — đọc log là biết ngay máy đó nạp được expo-gl hay không, kèm câu lỗi. Trước đây không phân biệt được "máy thiếu expo" với "3D chưa bật".

⚠ `node_modules` trên máy local **chưa được vá** (cài trước khi có patch) → đã chạy `npx patch-package`. Ai kéo về mà build iOS thì phải chắc `postinstall` đã chạy, không thì `globalThis.expo` vẫn thiếu và 3D lại rơi vào lưới an toàn.

Kiểm: `tsc --noEmit` sạch · 39/39 test `src/navigation` xanh. Còn lại phải thử trên máy thật (dựng ngữ-cảnh GL là chuyện native, không test JS được).

## Chuỗi thử LẺ ký tự làm mọi lần đăng nhập báo "khoá đã hỏng" + nút Khôi phục chết

Hai lỗi người dùng báo ngay sau bản trước. Lỗi đầu là **do chính bản trước gây ra**.

### 1. Đăng nhập nào cũng báo khoá hỏng — vì chuỗi hex lẻ ký tự
Triệu chứng: tạo tài khoản xong, thoát app 2 giây rồi vào lại là nhận *"Khoá trên máy không còn dùng được (thường do vừa thêm hoặc xoá vân tay…)"* trong khi không ai đụng vào vân tay. Thực ra **lần đăng nhập nào cũng vậy**, không riêng lúc vào lại.

Chuỗi thử viết là `Date.now().toString(16)` (**11** ký tự) ghép 8 ký tự ngẫu nhiên = **19 ký tự — LẺ**. Bên native:

```kotlin
require(clean.length % 2 == 0) { "Hex string must be even length…" }   // ném
```
mà lệnh `hexToBytes` đó nằm **cùng khối `try` với `initSign`**, nên lỗi trả về là `E_SIGN_INIT` — đúng cái mã mà bản trước vừa dịch thành "khoá không còn dùng được". Một lỗi định dạng chuỗi đội lốt một lỗi phần cứng bảo mật.

Sửa: sinh nonce **theo từng byte** (16 byte → 32 ký tự hex), độ dài luôn chẵn theo cấu tạo chứ không nhờ may mắn.

> Bài học giữ lại trong mã: `E_SIGN_INIT` bên native gộp **mọi** lỗi lúc dựng chữ ký, không riêng "khoá bị huỷ". Ai dịch mã đó thành một câu khẳng định chắc nịch thì phải chắc đầu vào của mình sạch trước.

### 2. Nhập đủ 24 từ mà nút Khôi phục vẫn khoá
`RestoreIdentityScreen` đếm từ bằng `phrase.trim().split(/\s+/)`. Người dùng chép cụm từ kèm **số thứ tự** ("1. abandon 2. ability …"), dấu phẩy hay gạch đầu dòng thì máy đếm ra **48** trong khi trên màn nhìn vẫn đúng 24 ⇒ `countOk` sai ⇒ nút chết, và **không có gì chỉ ra chỗ sai** (bộ đếm nhỏ ở góc thì mấy ai để ý).

- `utils/mnemonic.ts` (**9 bài kiểm**): bỏ chữ số + dấu câu, gộp khoảng trắng, viết thường — rồi mới đếm. **Giữ** chữ có dấu và kana: wordlist BIP39 còn bản tiếng Pháp và tiếng Nhật, bỏ hết thứ không phải `a–z` là giết cụm từ của họ.
- Cụm từ **gửi đi khôi phục** cũng dùng bản đã chuẩn hoá — BIP39 đối chiếu theo TỪ, dấu phẩy dính vào là trượt hết wordlist.
- Nút **vẫn bấm được** khi chưa đủ 24 từ (chỉ mờ đi) để câu báo sẵn có *"Cần đúng 24 từ — hiện có N"* nói ra được. Khoá cứng thì người dùng chỉ thấy một cái nút chết, mà họ đang tin là mình nhập đúng.

Kiểm: `tsc` sạch · **804/805 test xanh** (`treeModels.test.ts` đỏ sẵn từ trước) · eslint không thêm lỗi mới. Phần đăng nhập vẫn phải thử trên máy thật.

## Đăng nhập sinh trắc: từ một cờ `true` ở tầng JS → thành một CHỮ KÝ của chip

Đo lại đúng hai lỗi trong issue. **Lỗi 1 đã sửa từ trước** (mục "Màn Đăng nhập: gộp 2 nút sinh trắc" bên dưới): nhánh `else { showError(…) }` rồi chạy tiếp đã bị xoá hẳn, `runBiometric` chặn ngay đầu hàm bằng `if (busy || noSensor) return`. **Không đụng lại.** Mục đó cũng đã tự ghi: *"Chưa làm, thuộc issue khác: lỗi bảo mật ở issue đăng nhập sinh trắc học"* — nay làm nốt.

**Lỗi 2 thì còn nguyên.** `rn.simplePrompt()` trả một `boolean` ở tầng JS, không ký gì, không mở gì, không ràng buộc vào cặp khoá trong chip; bước sau `isKeypairEnrolled()` chỉ hỏi *"trong chip CÓ khoá không"*, không hỏi *"chủ khoá CÓ MẶT không"*. Cả đường đăng nhập không có một chữ ký nào — trong khi đường KÝ (`sdk/phoenixKey.ts` → `signRaw`) thì làm đúng vì buộc phải đi qua chip.

### Sửa: cho đăng nhập đi đúng con đường mà việc ký đang đi
```ts
const nonceHex = <thời-điểm + số ngẫu nhiên, dạng hex>;
await signRaw(nonceHex, prompt, t('Xác thực để mở danh tính trên máy này'));
// signRaw ném ⇒ chưa xác thực ⇒ KHÔNG đăng nhập
```
Hộp thoại nay do **chip** bật (Android: `BiometricPrompt` gắn `CryptoObject`; khoá sinh với `setUserAuthenticationValidityDurationSeconds(-1)` nên **mỗi lần dùng đều phải xác thực lại** · iOS: access control `.privateKeyUsage + .biometryCurrentSet`). Sửa JS không đi vòng được. Chữ ký **không gửi đi đâu** — giá trị của nó nằm ở chỗ nó KHÔNG TỒN TẠI nếu chủ khoá vắng mặt. Cũng vì thế không cần nguồn ngẫu-nhiên mật-mã cho chuỗi thử: không ai xác minh chữ ký này, thứ bảo vệ đăng nhập là lời gọi native NÉM.

### Bốn mã lỗi, bốn câu khác nhau
| Mã | Nói với người dùng |
|---|---|
| `E_USER_CANCELED` | **im lặng** quay lại màn đăng nhập — tự huỷ thì không phải lỗi |
| `E_BIOMETRIC_LOCKOUT` | máy đang tạm khoá, chờ ~30 giây hoặc mở khoá bằng mã PIN trước |
| `E_NO_KEY` · `E_SIGN_INIT` | khoá không dùng được nữa → khôi phục danh tính |
| còn lại | "Đăng nhập sinh trắc học thất bại" (như cũ) |

Nhánh thứ ba là thứ **trước đây không ai phát hiện được lúc đăng nhập**: người dùng thêm/xoá vân tay trong Cài đặt khiến hệ điều hành HUỶ khoá, mà `hasKey()` vẫn trả `true`, nên mãi tới lúc ký giao dịch mới lộ ra — muộn hơn nhiều.

### Một thay đổi thứ tự, cố ý
Máy **chưa có** danh tính (`did`/`hasKey` rỗng) nay đi thẳng sang màn tạo tài khoản, **không** bật hộp thoại sinh trắc nữa. Trước đây phải qua `simplePrompt` rồi mới bị đẩy sang đó — bắt người dùng xác thực cho một cái khoá **không tồn tại**. Cùng màn đích, bớt một hộp thoại vô nghĩa; và nếu không kiểm trước thì `signRaw` sẽ ném `E_NO_KEY` và người mới cài app lại đọc phải câu "khoá không còn dùng được".

Phần dò cảm biến (`isSensorAvailable`) giữ nguyên — nó chỉ chọn icon và nhãn cho trình đọc màn hình, không còn là bên phán quyết.

Kiểm: `tsc --noEmit` sạch · `jest --ci` **795/796 xanh** (`treeModels.test.ts` đỏ sẵn từ trước) · eslint không thêm lỗi mới · 3 chuỗi mới khai đủ 4 ngôn ngữ, soi 2039 khoá không trùng. **Chưa thử trên máy thật** — hai phép thử tay trong issue (máy ảo không khai sinh trắc học; huỷ hộp thoại) phải chạy trên thiết bị.

## Gỡ tên module nội bộ khỏi giao diện: 39 chuỗi kỹ thuật → 0

Luật đã chốt (giao diện không gọi tên module nội bộ, không dùng từ kỹ thuật) nay được thi hành cho **83 dòng từ điển + ~40 nơi gọi trong mã**, chạm 50 file.

**Nguyên tắc áp:** người dùng cần biết *chuyện gì đang xảy ra với thứ của họ*, không cần biết *bộ phận nào trong hệ thống* đang làm việc đó.

| Trước | Sau |
|---|---|
| `Daemon LampNet đang bận…` | `Máy chủ đang bận. Thử lại sau ít phút.` |
| `Phát tán lưu trữ trên mạng phân tán LampNet...` | `Đang lưu bản sao an toàn…` |
| `Chưa ráp Enclave native ký giao dịch (Thư)…` | `Tính năng ký giao dịch sẽ mở ở bản sau.` |
| `Máy này chưa có DID.` | `Máy này chưa có danh tính.` |
| `Chưa có danh tính PhoenixKey` | `Chưa có danh tính` |
| `Cần cài react-native-image-picker.\nnpm install…` | `Bản app này chưa mở được máy ảnh. Vui lòng cập nhật app rồi thử lại.` |

Quy ước từ: **DID** → `danh tính` (khi nói về *của ai*) hoặc `mã định danh` (khi nói về *chuỗi để chép/đối chiếu*) · **PhoenixKey** → bỏ, hoặc `khoá trên máy` · **LampNet** → `mạng lưới` / `kho an toàn` / `máy chủ` tuỳ ngữ cảnh · **OriLife** → `hệ thống` / `chúng tôi` · **VeData** → `hệ thống kiểm định` · **epoch** → `đợt` · **Pledge** → `tiền cọc` · **mint** → `phát hành` · **endpoint · CBOR · P-256 · Enclave · SDK native** → bỏ hẳn.

**Giữ nguyên hai ngoại lệ:** tên token (LAMP · MAGIC · CARP — in trên ví, trên sổ, trên sàn) và chuỗi `did:phoenix…` khi đang hiện **chính giá trị** để người dùng chép; chỉ câu *hướng dẫn* quanh nó viết bằng tiếng thường.

### Sửa bằng script, không sửa tay
`scratchpad/dejargon*.js` thay **nguyên dòng** từ điển (khoá vi + `en`/`zh`/`ja` cùng lúc) rồi thay chuỗi vi ở mọi nơi gọi trong cùng một lượt. Sửa tay thì kiểu gì cũng có dòng đổi khoá mà quên bản dịch — khi đó `autoText` **lặng lẽ** hiện lại tiếng Việt cho người nước ngoài: không lỗi, không cảnh báo. Lưu ý repo có **4 ngôn ngữ** (`en`/`zh`/**`ja`**), không phải 2 như issue viết.

### Ba cái bẫy chỉ lộ ra khi chạy kiểm
1. **Khoá trùng GIỮA các file không làm `tsc` đỏ.** `dictionary.ts` gộp 8 bộ theo thứ tự, bộ khai SAU **đè** bộ khai TRƯỚC (chỉ `console.warn` ở DEV). Gộp chuỗi làm sinh 6 khoá trùng mới (`Ví của tôi`, `Chưa có danh tính`, `Gửi lại`…) — đã gỡ bản thừa, để lại dòng chú thích trỏ sang nơi khai chính.
2. **Chuỗi nối bằng `+` và chữ trong `<Text>` không dính script.** `AccountScreen` · `RestoreIdentityScreen` nối 4 mảnh rồi mới tra từ điển; `ActivityScreen` viết `&amp;` trong JSX. Phải sửa tay đúng 14 chỗ — sót một mảnh là cả câu trượt khoá.
3. **Bỏ tiếng Anh có thể LÀM ĐỎ bài kiểm i18n.** `ALADIN · PHOENIXKEY DID` không dấu nên lọt lưới `authScreensI18n`; đổi thành `ALADIN · DANH TÍNH SỐ` là có dấu tiếng Việt ⇒ phải khai từ điển, không thì người dùng tiếng Nhật thấy nguyên tiếng Việt.

### Kiểm
`scratchpad/checkphrases.js` (bài tương đương `src/i18n/phrases.test.ts` của PR #107 — **chưa có trên nhánh này**) soi 2020 dòng: không khoá trùng, không bản dịch rỗng/thiếu. Phép đo của issue còn **1 chuỗi**, là tiền tố `console.log` không bao giờ lên màn. `tsc --noEmit` sạch · **749/750 test xanh** (`treeModels.test.ts` đỏ sẵn từ trước, đã kiểm bằng stash) · ảnh chụp `FeeDisplay` cập nhật theo `OriLife Treasury` → `Quỹ hệ thống`.

> **Cố ý KHÔNG đụng — 4 dòng chẩn đoán kỹ thuật:** `buildSignedTransfer:` · `buildStakeDelegation:` (ném từ `sdk/taadEnclave.ts`, giá trị nằm ở chỗ gọi ĐÚNG TÊN hàm hỏng) · `[CẦN XÁC NHẬN CONTRACT] activity:…` (có test bám: `syncDispatch.test.ts:122`) · `stored=false (byte chưa lên LampNet)` (dòng mồ côi, không nơi nào gọi). Đây là chữ cho kỹ sư đọc log, không phải chữ cho nông dân đọc trên màn.

## Màn Đăng nhập: gộp 2 nút sinh trắc thành MỘT nút tròn chỉ-icon

`src/screens/LoginScreen.tsx` — trước có 2 thẻ "Khuôn mặt" / "Vân tay" đặt cạnh nhau, mỗi thẻ có icon + tiêu đề + phụ đề. Nay còn **một nút tròn, không chữ**, icon đổi theo cảm biến của máy: Face ID → `face-recognition` · Touch ID → `fingerprint` · còn lại (Android `Biometrics`, hoặc lúc chưa dò xong) → `shield-lock-outline`.

**Vì sao gộp được:** hai nút cũ chỉ khác nhau ở phần hiển thị. Cả hai gọi cùng `rn.simplePrompt()` rồi `phoenixKeyAuth.unlockExistingIdentity()` — `unlockExistingIdentity()` **không nhận tham số**, nên `kind` (`'face'`/`'fingerprint'`) chưa bao giờ đổi hành vi xác thực; nó chỉ chọn nút nào sáng lên và tên sự kiện analytics. Hộp thoại sinh trắc là do HỆ ĐIỀU HÀNH vẽ, người dùng không thật sự "chọn" mặt hay vân tay — thiết bị đã quyết định sẵn. Logic xác thực giữ nguyên 100%.

**Vì sao không "làm cho nó thật" được** — giới hạn nền tảng, không phải thiếu công sức. iOS: mỗi máy chỉ có MỘT loại (Face ID **hoặc** Touch ID), không có gì để chọn. Android: `BiometricPrompt` chọn theo **độ mạnh** (`BIOMETRIC_STRONG`/`WEAK`), cố ý không cho ứng dụng ép người dùng dùng bộ phận cơ thể nào. Hai nút kia không thể thành thật — chỉ có thể thôi hứa.

### `biometricKindFromType()` — một nguồn duy nhất, suy từ CẢM BIẾN chứ không từ NÚT
Thêm ở `src/services/phoenixKeyAuthService.ts` (cạnh `type BiometricKind`, giữ nguyên type). `FaceID → 'face'` · `TouchID → 'fingerprint'` · còn lại (kể cả `Biometrics` và lúc chưa dò xong) `→ 'strong'`.

Ba nơi từng tự suy, nay dùng chung:
| file | trước | vấn đề |
|---|---|---|
| `LoginScreen` | từ nút người dùng bấm | đếm một lựa chọn không tồn tại |
| `SignUpBiometricScreen:152` | `hasFaceId ? 'face' : 'fingerprint'` | **máy Android chỉ báo `Biometrics` bị gán nhầm `'fingerprint'`** (đúng ra `'strong'`) → nhãn khoá sai so với thứ đã xảy ra |
| `TreeIdentityScreen:548` | ternary tay, đã đúng | bản sao trùng lặp |

### `biometric_did_map`: một DID = MỘT bản ghi
`BiometricSettings.tsx` trước ghi `map.face = did; map.fingerprint = did;` — bật một cái là bật cả hai, vì chúng chưa bao giờ là hai thứ. Nay ghi **một khoá**, đặt theo cảm biến thật, kèm dọn khoá loại khác cùng trỏ về DID đó. Cùng cách dọn (`pruneOtherKindsForDid`) áp cho `persistLegacyStores` + `migrateLegacyDidStores` trong service.

**Máy cài từ bản cũ KHÔNG phải bật lại:** đường đọc quét theo **giá trị** (`Object.values(map).includes(did)`), không theo tên khoá — bản ghi `face`/`fingerprint` cũ vẫn được nhận là "đã bật". Chỉ phía GHI mới gộp.

### Bốn trạng thái của nút, kể cả trạng thái không có cảm biến
| `biometryType` | icon | `accessibilityLabel` |
|---|---|---|
| `FaceID` | `face-recognition` | Đăng nhập bằng khuôn mặt |
| `TouchID` | `fingerprint` | Đăng nhập bằng vân tay |
| `Biometrics` | `shield-lock-outline` | Đăng nhập bằng sinh trắc học |
| không có | `fingerprint-off` | **nút TẮT** + câu chỉ đường, chạm mở `Linking.openSettings()` |

`sensorAvailable` đổi `boolean` → **`boolean \| null`**: `null` = chưa dò xong. Thiếu phân biệt này thì nút loé sang trạng thái tắt trong mấy khung hình đầu mỗi lần mở màn. `noSensor` chỉ đúng khi `=== false`.

Nhánh `else { showError('Thiết bị chưa hỗ trợ sinh trắc học…') }` trong `runBiometric` **xoá hẳn** — `tsc` chứng minh nó không tới được nữa (`noSensor` đã chặn ở đầu hàm và nút cũng đã tắt). Lúc `null` thì vẫn gọi `simplePrompt()`: hệ điều hành mới là bên phán quyết cuối, không phải kết quả dò của ta.

### Analytics đổi khuôn — cập nhật dashboard nếu có báo cáo bám tên cũ
`biometric_face_button` + `biometric_fingerprint_button` → gộp thành **`biometric_button`**, kèm `metadata.kind` (suy từ cảm biến) và `metadata.biometryType`. Áp cho cả `login_success`. Số liệu cũ **đang đếm nút được bấm**, không đếm thứ đã xảy ra. Thêm sự kiện `open_device_settings`.

### i18n
Nút không chữ ⇒ `accessibilityLabel` là thứ DUY NHẤT trình đọc màn hình đọc được. Prop chuỗi không đi qua `<Text>` nên lớp tự dịch không với tới — phải gọi `t()` tay. Thêm `'Đăng nhập bằng sinh trắc học'` + `'Bật Face ID hoặc vân tay trong Cài đặt máy để đăng nhập'` (đủ `en`/`zh`/`ja`) vào `phrases/navigation.ts`; `'Đăng nhập bằng khuôn mặt'`/`'Đăng nhập bằng vân tay'` đã nằm sẵn trong từ điển nhưng **chưa từng được dùng**, nay mới thật sự chạy. Gỡ `'Quét khuôn mặt'`/`'Quét vân tay'` — chỉ là phụ đề của 2 nút cũ.

### Chi tiết UI
**Kích thước co theo màn, chặn hai đầu:** `BIO_BTN_SIZE = clamp(SCREEN_W * 0.24, 84, 108)`, icon `= 44%` đường kính. Máy nhỏ vẫn quá vùng chạm 44pt, tablet không phình thành cái đĩa.

**Trạng thái "đang xác thực" bỏ dòng chữ, thay bằng vòng sóng lan toả** (`bioPulseRing`, scale 1→1.6 · opacity 0.45→0) để nút thuần icon. Vòng nằm **dưới** nút nhờ `elevation: 8` của nút — trên Android thứ tự JSX không quyết định lớp vẽ, `elevation` mới quyết định.

Đã dọn: state `busyKind: BiometricKind | null` → `busy: boolean`, `isGenericBiometric`, 8 style `bioGrid`/`bioIconOuter`/`bioIconWrap`/`bioTitle`/`bioSub`/`bioBusy`…, import `BiometryTypes` thừa ở `TreeIdentityScreen`. Sửa kèm: `useEffect` của pulse thiếu cleanup nên `Animated.loop` chạy tiếp sau khi unmount.

`tsc --noEmit` sạch · **749/750 test xanh** (`treeModels.test.ts` đỏ **sẵn từ trước**, đã kiểm bằng cách stash — không liên quan sinh trắc học) · eslint không thêm lỗi mới.

> **Chưa làm, thuộc issue khác:** lỗi bảo mật ở issue đăng nhập sinh trắc học (cùng file, cùng hàm `runBiometric`) — theo yêu cầu phải xong TRƯỚC lần gộp UI này. Chưa có mô tả lỗi đó nên không đụng vào.
>
> Sẵn có từ trước, **không** đụng tới: `ACCENT_ORANGE` (`LoginScreen.tsx:65`) là hằng chết; các catch-param `error` không dùng ở `BiometricSettings` — đều bị eslint báo đỏ nhưng nằm ngoài phạm vi.

## Module TRACE đổi sang bộ icon Iconify (fa6-solid): 79 → 140 icon, bỏ hẳn MaterialCommunityIcons

Toàn bộ 9 file của `src/modules/trace` (Dashboard · FarmList · FarmDetail · TreeDetail · TreeMetadataTab · Activity · CommonPopup · PaginationControls · VoiceMemoButton) nay dùng `components/Icon` thay `react-native-vector-icons/MaterialCommunityIcons`.

Lý do bỏ MCI: kéo theo file font riêng, nét dày mỏng không đồng bộ với phần còn lại của app (vốn đã dùng fa6-solid), và **tên icon không được kiểm** — gõ sai thì lặng lẽ ra ô trống.

### Tải icon: `node scripts/icons.js <tên>`
Thêm **61 icon** cho nghiệp vụ truy xuất nguồn gốc: `tractor` · `draw-polygon` (ranh giới vườn) · `location-crosshairs` · `map-pin` · `arrows-rotate` · `cloud-arrow-up` · `clipboard-list` · `spray-can` · `bug` · `flask` · `basket-shopping` · `truck-fast` · `certificate` · `clock-rotate-left` · `wand-magic-sparkles` · `coins` · `satellite` … (`wifi-slash` KHÔNG có trong fa6-solid — dùng `plug-circle-xmark`).

### Dashboard: bảng `ICON` theo NGHĨA thay vì rải tên glyph
Cùng một khái niệm (vườn · cây · quả · hoạt động) xuất hiện ở thẻ thống kê, pill lọc VÀ hàng dữ liệu — trước mỗi chỗ gõ lại tên nên sửa một chỗ là lệch ba chỗ. Nay gom về một bảng, khai kiểu `IconName` (qua `satisfies`) nên gõ sai là `tsc` báo.
Quick action đổi: Trang trại `pine-tree`→`tractor` · Thêm cây `plus-circle`→`seedling` · Đồng bộ `sync`→`arrows-rotate`/`cloud-arrow-up` · Tài khoản `account-outline`→`user-gear`. Token đổi sang 4 hình PHÂN BIỆT được: MAGIC `wand-magic-sparkles` · LAMP `bolt` · CARP `fish` · ADA `coins`.

### Ba cái bẫy khi đổi bộ icon
1. **Thay theo tên chuỗi là nguy hiểm** — `'history'` ở `TreeDetailScreen` là **TabKey**, không phải icon; `'normal'`/`'satellite'` ở `FarmDetailScreen` là kiểu bản đồ. Chỉ đổi trên dòng có `name=` hoặc `icon:`, và `tsc` bắt được chỗ lọt (`TS2322: '"clock-rotate-left"' is not assignable to type 'TabKey'`).
2. **`style` của Icon là `ViewStyle`, không phải `TextStyle`** — icon-font cũ nhận `style={{color}}`, Icon mới vẽ SVG nên không. Hai chỗ `styles.searchIcon` chỉ mang mỗi `color` → gỡ hẳn (màu đã truyền qua prop `color`).
3. **Tên sai KHÔNG làm đỏ gì cả** — `<Icon>` trả `null`, chỉ `console.warn` ở DEV, bản release im lặng. Lần đổi này suýt để lọt **21 tên** (`food-apple-outline`, `vector-polygon`, `flower-outline`…) vì lượt grep đầu chỉ soi `name=` mà bỏ qua cấu hình `icon:` trong mảng.

### Test mới: `Icon/iconNames.test.ts`
Quét mã nguồn — file nào import `components/Icon` thì MỌI tên icon dạng chuỗi trong đó phải có trong registry. Chính bài này biến "ô trống lặng lẽ" thành lỗi đỏ. Có kèm bài canh `files.length > 5` để đổi đường dẫn import không làm bài tự vô hiệu hoá (quét 0 file thì luôn xanh).

Toàn bộ **750 test xanh**, `tsc --noEmit` sạch.

> Các module khác (work · proofchat · join · pool · screens/) VẪN dùng MaterialCommunityIcons — chưa đụng tới.

## Phủ kín tiếng Anh: 85% → 95% từ điển, +247 mục (app chạy EN không còn lọt tiếng Việt)

Sau khi chốt tiếng Anh làm mặc định (mục dưới), giao diện vẫn lẫn tiếng Việt ở những chỗ chưa khai trong từ điển. Đã **đo trước, dịch sau** thay vì mò từng màn.

### Đo: quét mã nguồn rồi đối chiếu với từ điển
Script quét `src/**/*.{ts,tsx}` (bỏ chú thích bằng máy trạng thái, bỏ `src/i18n` và file test), rút chuỗi có dấu tiếng Việt rồi so với khoá từ điển:

| | trước | sau |
|---|---|---|
| chuỗi VI trong mã | 2043 | 2044 |
| đã có bản dịch | 1730 (**85%**) | 1949 (**95%**) |
| chưa có | 313 | 95 |

**313 chuỗi "thiếu" KHÔNG phải 313 việc phải làm.** Bóc ra: 22 chuỗi `console.*` (không bao giờ lên màn) · 15 mẩu mã lọt lưới regex · 5 chuỗi CỐ Ý không qua từ điển (màn chọn ngôn ngữ, endonym) · 31 **mảnh của chuỗi nối bằng `+`** · phần còn lại mới là việc thật. Đã thêm **247 mục** (đủ cả `en` · `zh` · `ja`).

95 chuỗi còn lại đã soi tay từng cái: đều là điểm mù của script (chuỗi khai bằng nháy kép, ký tự thoát `\n`/`\'`, thực thể `&amp;`) hoặc **TÊN RIÊNG của người** — cố ý không khai để giữ nguyên ở mọi ngôn ngữ.

### Ba khuôn khiến khoá viết theo mã nguồn là SAI
Đây là phần dễ mất công nhất, nay đã ghim bằng test trong `i18n.test.tsx`:
- **Nối chuỗi `'a ' + 'b'`** → `t()` chỉ nhận được chuỗi ĐÃ nối. Khoá phải là cả câu; khai từng mảnh thì không mảnh nào khớp. (7 câu dài ở `SeedExport` · `RestoreIdentity` · `FruitVideo` · `syncDispatch`.)
- **JSX đổi `&amp;` → `&`** lúc dịch mã. Khoá viết `&amp;` sẽ không bao giờ khớp.
- **JSX xuống dòng gộp thành MỘT dòng** ngăn bằng một dấu cách (đã biết từ trước, nay có test).

### Template literal thì từ điển bó tay — phải sửa mã
`FeeDisplay.tsx`: `accessibilityLabel={\`Phí tác vụ: ${fee}. Nhấn để ${expanded ? 'thu gọn' : 'xem chi tiết'}.\`}` — chuỗi dựng lúc chạy nên không khoá nào khớp, mà `accessibilityLabel` cũng KHÔNG đi qua lớp autoText (lớp đó chỉ bọc `<Text>`/placeholder). Đổi sang `tf('Phí tác vụ: {fee}. Nhấn để {action}.', {...})` + `useT()` để vẽ lại khi đổi ngôn ngữ.
> ⚠️ `useT()` phải gọi TRƯỚC nhánh `if (!feeQuote) return null` — thứ tự hook không được đổi giữa các lần vẽ.

### Dữ liệu MẪU cũng phải dịch
`modules/work/data/mockData.ts` (70 chuỗi) · `proofchat/.../mock.ts` (35) · `workMockApi.ts` (15) là nội dung DEMO hiện thẳng lên màn — tin tuyển việc, hồ sơ thợ, hội thoại mẫu. Đã dịch cả ba thứ tiếng.
- **Tên người giữ nguyên** (Nguyễn Văn Tài, Phạm Thị Hằng…): không khai = tự động giữ, đúng như tên thật của người dùng. Riêng **kính ngữ + tên** thì dịch phần kính ngữ (`Anh Tuấn` → `Mr. Tuan`).
- Tên tổ chức dịch phần danh từ chung, giữ phần riêng (`Nông trại Bảy Núi` → `Bay Nui Farm`).
- `treeModels.ts`: `Bàng Singapore` là tên LOÀI → dịch; `Marc Solà` là tên tác giả model → giữ.
- `services/analytics/config.ts`: `'mật khẩu'` nằm trong `SENSITIVE_FIELD_HINTS` — là **mẫu để dò**, không phải chữ trên màn. Dịch là hỏng bộ lọc.

### Vạ lây
- Gỡ **8 khoá khai trùng** phát sinh khi thêm (screens ↔ navigation/chat/trace, và 3 mục trùng trong CÙNG một file — `tsc` bắt bằng TS1117).
- `FeeDisplay.test.tsx`: cập nhật snapshot — `accessibilityLabel` nay ra tiếng Anh, đúng như mặc định mới.

### Test
`i18n.test.tsx` +3 (ba khuôn ở trên). Toàn bộ **748 test xanh**, `tsc --noEmit` sạch.

## TIẾNG ANH là mặc định — cả lúc khởi động lẫn khi từ điển thiếu bản dịch

Hai chỗ trước đây rơi về tiếng Việt, nay rơi về tiếng Anh. Đổi hành vi, không đổi kiến trúc: khoá từ điển VẪN là chuỗi tiếng Việt trong mã, KHÔNG đụng file màn hình nào.

### 1. Khởi động: bỏ dò ngôn ngữ máy (`i18n/store.ts`)
```diff
- let current: LangCode = detectDeviceLang() ?? DEFAULT_LANG;
+ let current: LangCode = DEFAULT_LANG;   // 'en' cho MỌI máy
```
Trước: điện thoại đặt tiếng Việt/Nhật thì app mở ra bằng đúng thứ tiếng đó. Nay máy nào cũng mở bằng tiếng Anh, rồi màn "Chọn ngôn ngữ" hỏi ngay sau đó — một thao tác rõ ràng hơn là đoán theo locale rồi đoán sai. Khớp SG9 §5.2 (tiếng Anh là chuẩn, nằm dòng trên ở khung nav).
- `detectDeviceLang()` GIỮ LẠI ở `i18n/types.ts` (hàm thuần, có test, là chỗ duy nhất biết đọc locale) nhưng **không còn nối vào store** — đã ghi chú tại chỗ để không ai mắc lại.
- `LanguageSelectScreen` không phải sửa: mục preselect đọc `getLanguage()` nên tự thành English.

### 2. Từ điển: nấc rơi về tiếng Anh (`i18n/translate.ts`)
`ngôn ngữ đang chọn → FALLBACK_LANG ('en') → chuỗi nguồn`. Nấc giữa là phần mới.

Vì sao cần: khoá từ điển là chuỗi tiếng Việt, nên thiếu MỘT bản tiếng Nhật là nguyên câu tiếng Việt lọt ra giữa màn tiếng Nhật — người dùng Nhật không đọc được gì; tiếng Anh thì ít nhất còn đoán được. Nấc CUỐI giữ nguyên nên tên riêng & thuật ngữ (Aladin, PhoenixKey, DID…) và dữ liệu người dùng vẫn tự động giữ nguyên như cũ.

`FALLBACK_LANG` khai RIÊNG, không tái dùng `DEFAULT_LANG`: đổi ngôn ngữ mở-máy-lần-đầu là quyết định về THỊ TRƯỜNG, không được lặng lẽ đổi luôn ngôn ngữ chống đỡ của từ điển.

> `hasTranslation()` cố ý KHÔNG tính nấc rơi — nó là bài đo ĐỘ PHỦ từ điển.

### 3. Hai lỗi vạ lây, sửa luôn
- **Khoá khai trùng** `'Cài đặt ngôn ngữ của bạn'` (account.ts + navigation.ts, nội dung y hệt) — đang làm đỏ bài "không có khoá nào bị khai TRÙNG". Gỡ bản ở `navigation.ts`.
- **`SignUpBiometricScreen`**: `<Text>Tên đăng nhập{'\n'}+ Sinh trắc học</Text>` lọt tiếng Việt ra màn. `autoText` tra từ điển theo TỪNG child là chuỗi, mà `'+ Sinh trắc học'` không khớp khoá nào. Tách `{'+ '}` thành node riêng → `'Sinh trắc học'` khớp bình thường.
  ⚠️ Khuôn chung: chuỗi hiển thị bị dính THÊM ký tự ở đầu/cuối trong JSX thì phải tách ký tự đó ra, đừng thêm khoá "bẩn" vào từ điển.

### Test
`i18n.test.tsx` +5 (dựng từ điển GIẢ bằng `jest.isolateModules` + `doMock` — từ điển thật không còn lỗ hổng nào để đo nấc rơi) · `i18nFirstLaunch.test.ts` +1 (giả lập máy `ja-JP`, app vẫn phải mở bằng `en`). Toàn bộ 745 test xanh.

## Gộp HAI hệ ngôn ngữ chạy song song + thêm tiếng NHẬT (vi · en · zh · ja)

Merge #103 (`i18n/languages.ts`) và #104 (`i18n/store.ts`) vào cùng một nhánh, mỗi bên mang một hệ ngôn ngữ RIÊNG. Hậu quả nếu để nguyên:

| | nhánh #103 | nhánh #104 |
|---|---|---|
| khoá lưu | `app_lang_v1` | `app_language_v1` |
| ngôn ngữ | vi · zh · ja | vi · en · zh |
| điều khiển | nhãn nav | lớp tự dịch toàn app |
| màn chọn | `LanguageScreen` | `LanguageSelectScreen` + popup |

→ Cài đặt có **hai** dòng "Ngôn ngữ", đổi ở dòng này thì dòng kia và nhãn nav **không** đổi theo.

**Lỗi bundle chặn build** (`Identifier 'lang' has already been declared`, `NavItemFrame.tsx:53`) chỉ là phần nổi: merge giữ CẢ hai dòng `const lang = useNationalLanguage()` và `const lang = useLanguage()`.

### Đã gộp về MỘT kho: `i18n/store.ts`
- **Xoá** `i18n/languages.ts` · `i18n/useNationalLanguage.ts` · `screens/LanguageScreen.tsx` và dòng "Ngôn ngữ" thứ hai ở AccountScreen.
- **Giữ lại phần hay của #103**, chuyển vào `i18n/types.ts`: `SUPPORTED_LANGS` · `normalizeLangTag` (nhận `vi-VN`, `zh-Hans-CN`, `ja_JP`, `ZH`) · `detectDeviceLang()` bằng `Intl` (KHÔNG thêm `react-native-localize` — thêm là phải dựng lại cả hai nền tảng) · `LANG_ENDONYM`.
- **Đọc khoá cũ `app_lang_v1`** khi hydrate (chỉ đọc, ghi luôn khoá mới) → ai đã chọn ngôn ngữ ở bản dựng trung gian không phải chọn lại.
- Giá trị ban đầu = **ngôn ngữ máy** (nếu app hỗ trợ) → `DEFAULT_LANG`. → ĐÃ BỎ, nay luôn là tiếng Anh (xem mục đầu file).
- `languages.test.ts` giữ nguyên ý đồ, trỏ sang API hợp nhất — kể cả bài canh **không nhãn NAV_FRAME/SUBHOME_FRAME nào thiếu ở bất kỳ ngôn ngữ nào**.

### `NATIONAL_LANGS` — vì sao tách khỏi `SUPPORTED_LANGS`
Khung nav song ngữ (SG9 §5.2): tiếng Anh là CHUẨN ở dòng TRÊN, ngôn ngữ quốc gia ở dòng DƯỚI. Nên `national` khoá theo `NATIONAL_LANGS` = `['vi','zh','ja']` (KHÔNG có `'en'`, khai lại là in trùng chữ), còn `SUPPORTED_LANGS` = 4 ngôn ngữ chọn được ở Cài đặt.

### Tiếng Nhật: 1803 mục
Thêm bằng **script** (`addja.js` — quét khoá, chèn `ja:` sau `zh:`), KHÔNG viết tay lại 8 file: 1803 mục viết lại tay là chắc chắn rơi mất mục. Cũng gỡ **7 khoá khai trùng** do merge (`Đăng xuất` · `Thông báo` · `Ngôn ngữ` · `Trợ lý ảo` · `Sinh trắc học` · `Chạy luồng hướng dẫn` · `Hủy` — đã có ở `account.ts`/`common.ts`, khai lại ở `navigation.ts`).

Test mới canh: mọi mục đủ CẢ BA ngôn ngữ đích (duyệt theo `SUPPORTED_LANGS` nên thêm ngôn ngữ mà quên dịch là đỏ ngay) · không khoá nào khai trùng · so bản dịch với CHÍNH từ điển thay vì ghim chuỗi cứng (sửa câu chữ không được làm đỏ test).

## ĐA NGÔN NGỮ (Việt · Anh · Trung) — dịch TOÀN APP mà KHÔNG sửa 177 file màn hình

Mục "Ngôn ngữ" ở Cài đặt trước đây là nút chết. Nay có: **màn chọn ngôn ngữ lúc mới cài**, **nút cờ ở màn Đăng nhập**, và **popup đổi ngôn ngữ ở Tài khoản → Cài đặt** — đổi là áp dụng NGAY cho mọi màn, không khởi động lại, không mất ngăn xếp điều hướng.

### Cơ chế: bọc Ở CỬA RA, không bọc từng chuỗi
App có ~1.7k chuỗi Việt hard-code trong 177 file. Bọc tay `t('…')` từng chỗ = sửa 177 file, dễ sót và dễ vỡ (template literal, chuỗi nối, chuỗi trong Alert). Thay vào đó: **mọi chữ muốn lên màn đều phải đi qua `<Text>`**, nên chỉ cần bọc `<Text>`.

`src/i18n/install.ts` ghi đè thuộc tính `Text` / `TextInput` trên module `react-native`:
```ts
const RN = require('react-native');            // KHÔNG dùng `import * as RN`
Object.defineProperty(RN, 'Text', { get: () => AutoText, configurable: true });
```
- `react-native/index.js` khai component bằng **getter trên object literal** → configurable → ghi đè được.
- Babel dịch `import { Text } from 'react-native'` thành `_reactNative.Text` **tại chỗ dùng** (giữ live-binding ESM) → mọi file, kể cả trong `node_modules`, nhận bản đã bọc.
- ⚠️ PHẢI dùng `require`: `import * as RN` bị Babel bọc `_interopRequireWildcard` → trả **bản sao**, ghi đè lên đó là vô ích.
- Gọi ở `index.js` NGAY sau `crashReporter`, trước `require('./App')` — component render trước lời gọi này sẽ giữ Text gốc.
- RN tương lai đổi cách khai → `defineProperty` ném → bắt lại, cảnh báo DEV, app chạy tiếng Việt (KHÔNG sập).

### Khoá từ điển = CHÍNH chuỗi tiếng Việt trong mã nguồn
`src/i18n/phrases/*.ts` → `{ 'Đăng xuất': { en: 'Sign out', zh: '退出登录' } }` (1785 mục, 8 file theo mảng nghiệp vụ), gom ở `dictionary.ts`.
- Không khớp → **trả nguyên văn**. Hỏng từ điển không bao giờ ra màn trắng hay `missing.key.xxx`.
- **Tên riêng & thuật ngữ tự động giữ nguyên**: Aladin, PhoenixKey, DID, LAMP, MAGIC, CARP, Cardano, ProofChat, LampNet… chỉ cần KHÔNG khai trong từ điển. Dữ liệu người dùng (tên vườn, tên người, địa chỉ ví) cũng rơi vào nhánh này → không cần danh sách loại trừ.
- Khoảng trắng hai đầu được giữ (JSX hay tách `{'Xin chào '}{name}`).
- Text JSX nhiều dòng bị JSX gộp thành MỘT chuỗi nối bằng **một dấu cách** → khoá phải viết liền một dòng.

### Vẽ lại khi đổi ngôn ngữ
Trạng thái ngôn ngữ sống **ngoài React** (`i18n/store.ts` + AsyncStorage `app_language_v1`) để `t()` gọi được cả trong service/util. `AutoText` bọc `useSyncExternalStore` → đổi ngôn ngữ là mọi `<Text>` đang mount tự vẽ lại. KHÔNG remount navigator (giữ nguyên màn đang mở).

### Chuỗi KHÔNG nằm trong `<Text>` thì gọi tay
`accessibilityLabel`, tiêu đề truyền qua props, chuỗi dựng trong service → `t('…')`; trong component cần vẽ lại thì `useT()`. Chuỗi có chỗ thay dùng `tf('Xin chào {name}', { name })` — **nối chuỗi sẽ không bao giờ khớp từ điển** (đã sửa lời chào ở `AppHeader`).

### Màn hỏi-một-lần lúc mới cài
`screens/LanguageSelectScreen.tsx` là màn ĐẦU TIÊN khi `hasChosenLanguage()` = false. `AppNavigator` `await whenLanguageReady()` trước khi chốt `initialRoute` (đọc AsyncStorage bất đồng bộ) → không thấy Login nhấp nháy rồi mới nhảy. Bấm Tiếp tục = `setLanguage(picked, true)` (force — chọn đúng mặc định vẫn tính là đã chọn) rồi `replace('Login')`.
> Màn này là chỗ DUY NHẤT cố ý **không** qua từ điển: người dùng chưa chọn ngôn ngữ nào nên mọi chữ phải tự đọc được — tên ngôn ngữ viết bằng chính nó, tiêu đề in cả ba thứ tiếng, nhãn nút đổi theo mục đang chọn.

### Ngôn ngữ MẶC ĐỊNH khi chưa chọn = `DEFAULT_LANG` (`'en'`, khai ở `i18n/types.ts`)
Khác `SOURCE_LANG` (`'vi'` — ngôn ngữ viết trong mã). Hệ quả: **cụm từ nào chưa khai trong từ điển sẽ hiện nguyên văn tiếng Việt**, nên khi mặc định ≠ `'vi'` giao diện có thể LẪN hai thứ tiếng cho tới khi từ điển phủ hết (hiện phủ ~83% chuỗi UI). Đổi hằng số này là đổi hành vi lần chạy đầu của MỌI máy mới.
> ĐÃ ĐỔI: nay thiếu bản dịch thì rơi về TIẾNG ANH trước (`FALLBACK_LANG`), chỉ thiếu cả tiếng Anh mới ra chuỗi nguồn — xem mục đầu file.

### Nhãn nav
`navLabels.getNationalLanguage()` nay đọc `getLanguage()` (trước hardcode `'vi'`). `NavItemFrame` gọi `useLanguage()` để vẽ lại.
> ⚠️ Bẫy đã sập một lần: **KHÔNG** cho `navNational()` trả chuỗi rỗng khi app là tiếng Anh. `resolveGateItems` dùng chính hàm đó làm nhãn DUY NHẤT cho mục cổng xoè → cung tròn mất hết chữ. Việc bỏ dòng thứ hai khi nó trùng dòng EN là quyết định TRÌNH BÀY, để trong `NavItemFrame` (`showNational = national !== en`).

### File
`src/i18n/` (types · store · translate · autoText · install · useLanguage · dictionary · phrases/) · `src/components/LanguagePickerModal.tsx` · `src/screens/LanguageSelectScreen.tsx` · sửa `index.js` · `AccountScreen` · `LoginScreen` · `AppHeader` · `navLabels` · `NavItemFrame` · `subHomeLabels` · `navigation/index.tsx`.
Test: `__tests__/i18n.test.tsx` (ghim cơ chế + tính toàn vẹn từ điển) · `__tests__/i18nFirstLaunch.test.ts` (luồng hỏi-một-lần).

### Thêm bản dịch về sau
Chỉ sửa `src/i18n/phrases/*.ts` — KHÔNG đụng màn hình. Chuỗi chưa khai vẫn hiện tiếng Việt.

## Crash 3D bản AAB **lần 2** (build 83) — KHÔNG phải R8 nữa; bọc chắn cho FruitPlace3D

Triệu chứng: build 83 (đã có rule `-keep class expo.modules.gl.**`) mở Space3D **và** FruitPlace3D vẫn sập app.

**Đã loại trừ R8-ăn-expo-gl**: `android/app/build/outputs/mapping/release/seeds.txt` của chính bản đó có đủ 292 mục `expo.modules.gl.*` (`GLContext$GLThread`, `GLView`, `cpp.EXGL`…) → rule ăn rồi.

**Phân loại crash**: logcat cho `DropBoxManagerService: add tag=data_app_crash` (KHÔNG phải `data_app_native_crash`) + hộp thoại "Application Error" → **exception Java/JS chưa bắt**, không phải SIGABRT của JNI như lần trước. Bản release RN biến lỗi JS chưa bắt thành `JavascriptException` đúng dạng này.
> Cách phân loại nhanh về sau: `data_app_crash` = Java/JS · `data_app_native_crash` (+ tombstone) = native. Đọc stack thật bằng `adb logcat -b crash -d`.

**Đã làm (giảm thiệt hại, chưa phải sửa gốc)** — `FruitPlace3DScreen.tsx`:
- Bọc `<Canvas>` bằng `GLErrorBoundary tag="fruit_place3d"` — trước đó CHỈ Space3D có chắn, màn này để trần nên lỗi JS trong cảnh làm sập cả app.
- Thêm mốc trace `viewer3d_place_mount` / `place_gl_created` / `place_unmount` (`remoteLogger.ts`), cùng bộ với Space3D → đọc mốc CUỐI biết chết lúc dựng ngữ-cảnh GL hay lúc render cảnh.

> ⚠️ Lưu ý giới hạn: ErrorBoundary chỉ bắt lỗi lúc RENDER. Lỗi ném trong callback native (`onContextCreate` của expo-gl) hay trong vòng lặp vẽ nằm NGOÀI tầm — vẫn sập. Nếu bọc rồi mà còn sập thì thủ phạm ở đó.

## Mở màn 3D là CRASH ở bản AAB/release (dev `npm run android` thì ổn) — R8 ăn `GLContext.flush()`

Triệu chứng: `npm run android` mở Space3D / FruitPlace3D bình thường; đóng gói `.aab` rồi mở sơ đồ 3D của vườn là **crash tức thì**, không kịp thấy màn nào.

### Gốc rễ — `expo-gl` KHÔNG ship rule ProGuard nào, mà C++ của nó gọi Java THEO TÊN
`android/app/build.gradle` có `enableProguardInReleaseBuilds = true` → bản release chạy R8, bản debug thì không. Đó là toàn bộ khác biệt giữa hai bản.

`expo-gl/android/src/main/cpp/EXGLJniApi.cpp` — `EXGLContextPrepare()`:
```cpp
jclass    GLContextClass  = env->GetObjectClass(glContext);
jmethodID flushMethodRef  = env->GetMethodID(GLContextClass, "flush", "()V");
// ... về sau: threadLocalEnv->CallVoidMethod(glContextRef, flushMethodRef);
```
`expo.modules.gl.GLContext` là class Java **thường**: không `extends Module`, không `implements ExpoView/Record/Enumerable`, không `@DoNotStrip` → **không rule nào đang áp giữ tên `flush()`**:
- `expo-modules-core` và `expo` CÓ `consumerProguardFiles` (tự áp vào app) — nhưng chỉ giữ Module / ExpoView / Record / enum Enumerable / `@DoNotStrip`.
- `expo-gl`, `expo-asset`, `expo-file-system` **không có** `consumerProguardFiles` (đã kiểm `build.gradle` từng gói). expo-asset/expo-file-system không sao vì mã Kotlin của chúng toàn Module + Record → đã được rules của core phủ. **expo-gl là ngoại lệ duy nhất.**
- Rule của app `-keepclasseswithmembernames class * { native <methods>; }` giữ được `cpp/EXGL` (class có `native <methods>`, và `keepclasseswithmembernames` giữ CẢ tên class → tên hàm JNI `Java_expo_modules_gl_cpp_EXGL_*` vẫn khớp). Nhưng `GLContext.flush()` là hàm Java thường, rule này không với tới.

→ R8 đổi tên (hoặc nội-tuyến rồi bỏ) `flush()` → `GetMethodID` trả **NULL** + treo sẵn `NoSuchMethodError` → `CallVoidMethod` với `jmethodID` NULL → **JNI abort / SIGABRT**. Xảy ra ở lần flush ĐẦU TIÊN, tức đúng khoảnh khắc ngữ-cảnh GL được dựng = lúc `<Canvas>` gắn vào cây → crash "ngay khi mở".

**Sửa** — `android/app/proguard-rules.pro`: `-keep class expo.modules.gl.** { *; }`. Cả gói chỉ có 5 class + `cpp/EXGL`, giữ hết gần như không tăng kích thước. Lý do đầy đủ đã ghi ngay tại chỗ trong file.

> ⚠️ Nâng `expo-gl` sau này thì kiểm lại: nếu upstream thêm `consumerProguardFiles` thì rule này thành dư (vô hại). Nếu thêm chỗ tra-cứu-theo-tên mới thì rule cả-gói vẫn phủ.
> ⚠️ iOS không bị: không có R8.

### Lỗi thứ hai (cùng lúc, KHÔNG chí mạng): bản release không nạp được model `.glb` nào
`treeAsset.ts` → `uriViaResolveAssetSource`. Đường đọc model ở bản release **luôn** thất bại → mọi cây rơi về **cây dự phòng hình nón**. Dev không lộ vì đi đường khác (HTTP của metro).

- `uriViaExpoAsset` vô dụng ở app này: `expo-asset` cần `expo-updates` để có `localAssets`; không có thì `selectAssetSource` trả `{ uri: '' }` → ném → rơi sang đường dự phòng. (Đúng như ghi chú cũ: expo-asset trông cậy vào plugin metro riêng của Expo.)
- `uriViaResolveAssetSource`: ở release, `AssetSourceResolver.defaultAsset()` → `resourceIdentifierWithoutScale()` → uri là **TÊN TÀI NGUYÊN TRẦN không scheme**, vd `assets_models_tree1` (Metro nhét `.glb` vào `res/raw/`).
- Code cũ trả thẳng tên đó ra, rồi `readAsStringAsync(uri, { encoding: 'base64' })`. Nhánh base64 của expo-file-system đi qua `getInputStream()`, hàm này **chỉ nhận `file://` · `asset://` · SAF** → scheme null là ném `Unsupported scheme for location`.
  (Trớ trêu: nhánh **UTF-8** của cùng hàm đó lại có `uri.scheme == null -> openResourceInputStream(...)`. Chỉ nhánh base64 thiếu.)
- **Sửa**: uri không có scheme thì `FileSystem.copyAsync({ from: uri, to: <cache>.glb })` **trước**, rồi đọc file thật. `copyAsync` CÓ nhánh `fromUri.scheme == null` → `openResourceInputStream` → `resources.openRawResource(getIdentifier(name, "raw", pkg))` (`FileSystemLegacyModule.kt`). Quyền cũng OK: `permissionsForUri` cho `scheme == null` → READ.

## Sửa: chụm 2 ngón ở màn KHOANH QUẢ là ảnh phóng hết cỡ ngay

`FruitCropperScreen` → `panResponder`. Kéo 1 ngón vẫn đúng, nhưng vừa chụm 2 ngón là zoom nhảy thẳng tới `ZOOM_MAX`.

**Gốc rễ**: `onPanResponderGrant` chỉ chạy **một lần** — lúc ngón ĐẦU chạm xuống. Đặt ngón thứ hai sau đó KHÔNG sinh grant mới, nên mốc cử-chỉ vẫn là mốc của 1 ngón với `dist: 0` (`|| 1` ép về 1). Nhịp pinch đầu tiên tính `touchDist(t) / g.dist` = vài trăm px / 1 → tỉ-lệ hàng trăm lần → chạm trần ngay. Rời bớt một ngón (2→1) cũng lệch tương tự vì mốc cũ là tâm 2 ngón.

**Sửa**: tách hàm `rebase(touches)` và ghi thêm `n` (số ngón lúc lấy mốc) vào `gStart`. Trong `onPanResponderMove`, hễ `g.n` khác số ngón hiện tại thì **lấy mốc mới rồi bỏ qua nhịp đó** — nhịp sau mới tính. Nhờ vậy 1↔2 ngón đổi qua lại giữa chừng đều liền mạch, không giật.

## Lớp phủ ĐANG QUÉT (khoanh quả): đổi sang SÓNG CHẤM XANH

`FruitCropperScreen` → `ScanOverlay`. Bỏ vạch sáng quét lên-xuống và khung ngắm bốn góc — hai thứ đó mượn hình máy quét QR, mà đây không quét QR; cái hộp vuông còn vẽ sẵn một chỗ giả nơi quả sắp nằm.

Nay: **lưới chấm xanh mờ phủ kín màn khoanh**, mỗi chấm phồng–xẹp nhẹ; hàng dưới trễ pha hơn hàng trên nên cả lưới gợn thành sóng chạy từ trên xuống.

- **Một `Animated.Value` duy nhất** chạy tuyến-tính 0→1 rồi lặp (`WAVE_PERIOD` 2400 ms). Hình sin của từng hàng dựng sẵn bằng `interpolate` lấy mẫu cosin ĐÃ DỊCH PHA (`WAVE_SAMPLES` 24 mốc) → cả trăm chấm chỉ tốn một driver, chạy trọn trên luồng native. Cosin liền mạch tại mốc 0 và 1 nên vòng lặp nối lại không giật.
- Lưới tự chia theo kích thước màn (`DOT_GAP` 54, `DOT_SIZE` 13); độ trễ giữa hai hàng = `WAVE_ROW_LAG` (0.075 chu kỳ) — tăng thì sóng dốc hơn.
- Thẻ "Đang quét ảnh để tìm quả…" + nút "Tự canh bằng tay" giữ nguyên: vẫn là lối thoát duy nhất khi mạng chết.

## Màn KHOANH QUẢ: bỏ nút "Tự căn khung quả" — quét ảnh rồi TỰ căn

`FruitCropperScreen`. Trước: ảnh vào màn là chạy `detectFruit` ngầm, tìm được thì hiện một CÁI NÚT xanh nhấp nháy mời bấm để nhảy khung vào quả. Thừa một bước: máy đã biết quả nằm đâu rồi, còn ai không đoán ra nút làm gì thì vẫn è cổ kéo-phóng bằng tay.

Nay: vào màn → **lớp phủ ĐANG QUÉT** (`ScanOverlay`: vạch sáng chạy dọc ảnh + bốn góc ngắm thở nhẹ + thẻ "Đang quét ảnh để tìm quả…") → xong thì khung **tự trượt vào ôm quả**, kèm một câu báo tự tắt sau 3,2 s. Bỏ hẳn `DetectInvite`.

- **Trong lúc quét thì GIẤU mask + vòng crop** (và cả cột nút phải, thanh dưới): vòng trống giữa màn lúc ảnh chưa căn chỉ tổ rối; quét xong khung mới hiện ra, đúng lúc nó đã ôm vào quả.
- **Trượt mượt, không nhảy cóc** — `glideTo()` (rAF + easeOutCubic, ~520 ms) đổi `tx/ty/zoom`. Nhảy phắt một cái thì người dùng mất dấu, không rõ ảnh vừa bị phóng hay bị đổi chỗ. **Chạm vào ảnh là DỪNG ngay** (`stopGlide()` trong `onPanResponderGrant`) — tay người luôn thắng hoạt-ảnh.
- ⚠️ `jumpToBox` nay tính bán-kính khung TỪ `vw/vh` chứ không lấy `ringRef`: hàm này ép `shape='circle'`, mà ring của khung ELIP đang mở có `rx/ry` khác → lấy nhầm thì căn lệch. (Lỗi cũ, ít lộ vì mặc định là khung tròn.)
- **Luôn có lối thoát**: hạn chờ API là 45 s, nên lớp phủ có nút "Tự canh bằng tay"; bấm rồi thì kết quả quét về sau KHÔNG giật khung nữa (`scanSkipped` ref). `detectFruit(...)` bọc `.catch(() => null)` — mạng chết cũng phải tắt được lớp phủ.
- Nút bullseye canh-lại chuyển vào **cột nút bên phải** (chỉ hiện khi đã tìm ra quả) — không còn là lời mời, chỉ là đường về sau khi kéo lệch mất quả.
- Không thấy quả / lỗi → báo "Chưa nhận ra quả — kéo và phóng để đưa quả vào vòng" rồi im. Luồng THÊM GÓC (`fruitId`) không quét, không lớp phủ, y như cũ.

## Mất BẢN ĐỒ khi bỏ chọn cây (và giữ chế độ xem cây sau khi đặt vị trí)

Triệu chứng: xác nhận vị trí quả xong, về Space3D thì KHÔNG có bản đồ; chạm vào một cây là bản đồ hiện lại.

**Gốc rễ — `useSpaceData` để `farmId` rơi về `undefined`.** Mở Space3D từ Chi tiết cây / Danh sách quả thì route KHÔNG có `farmId` (chỉ có `treeId`), vườn hoàn toàn suy ra từ CÂY ĐANG MỞ. Hễ `focusTreeId` về null là đổ dây chuyền:
`farm = null` → mất `coordinates` → mặt đất tụt về ô vuông mặc định · `origin = null` → `mapVisible` false → **mất lớp bản đồ** · `farmTrees` hoá thành TẤT CẢ cây của mọi vườn.
Chạm một cây làm `focusTreeId` có lại → farmId suy ra được → bản đồ về. Đúng y triệu chứng.
Sửa: `farmId` **BÁM DÍNH** — nhớ giá trị đã biết trong ref, không bao giờ tụt về undefined. Vườn không tự đổi giữa chừng nên nhớ lại là đúng.
⚠️ Lỗi này KHÔNG chỉ xảy ra sau màn đặt vị trí: nút "xem toàn cảnh" trên header cũng gọi `flyToFarm()` → `focusTreeId = null` → mất bản đồ + cây bị rải lại chỗ khác. Nay hết cả hai.

**Giữ chế độ xem cây sau khi xác nhận.** `FruitPlace3D.done()` trả kèm `placedTreeId`/`placedFruitId`; Space3D đọc rồi chọn lại đúng cây + quả đó, sau đó XOÁ tham số (không xoá thì mỗi lần vẽ lại sẽ ép chọn lại, người dùng không bay đi đâu được). `openFruitPlacer` truyền thêm `returnTo: 'Space3D'` để khỏi phải đoán màn trước qua `navigation.getState()`.

**Texture bản đồ không được dùng chung giữa hai ngữ-cảnh GL.** Từ khi `<Canvas>` bị tháo lúc mất tiêu điểm (mục dưới), lần quay lại là ngữ-cảnh GL KHÁC — đưa lại đúng thể-hiện `THREE.Texture` cũ là trò may rủi. `mapTexture.ts` nay chỉ nhớ **TỆP + kích thước** (phần đắt: lượt tải mạng), còn `THREE.Texture` dựng MỚI mỗi lần; `MapGround` giữ danh sách texture của mình và `dispose()` khi tháo (kể cả ảnh về trễ sau khi đã tháo).

## Luồng QUẢ: dựng lại giao diện + 3 lỗi đã sửa

### 1. Kéo quả ở màn Đặt vị trí cứ TRÔI VỀ CHỖ CŨ  ⟵ lỗi nặng nhất
`FruitPlace3DScreen`: `PanResponder.create` nằm trong `useMemo([offset.dx, offset.dy, coord, mpp, view])` → **mỗi lần kéo là dựng lại một thể-hiện MỚI**.
Gốc rễ: `gestureState.dx` của PanResponder là quãng đường tích luỹ TỪ LÚC ĐẶT NGÓN, và nó nằm TRONG thể-hiện. Kéo → `setCoord` → render → thể-hiện mới có `dx = 0`; View đang giữ quyền phản hồi nhận tiếp sự-kiện move bằng thể-hiện mới đó. Code lại cộng `g.dx` vào mốc lúc BẮT ĐẦU kéo (`dragStart`, một ref nên vẫn còn) → mỗi khung hình quả bị kéo tuột về sát chỗ ban đầu. Đúng triệu chứng "kéo tới đâu nó chạy về đó".
Sửa: `PanResponder.create` gọi ĐÚNG MỘT LẦN trong `useRef`, mọi giá trị đọc qua ref `live`. Cùng khuôn với `DraggableVertex` bên `FarmDetailScreen` (chỗ đó đã làm đúng từ trước).
⚠️ Quy tắc chung: **PanResponder không bao giờ được nằm trong `useMemo` có deps đổi trong lúc kéo.**

### 2. Quay về Space3D thì cảnh GIẬT, back ra vào lại mới hết
Stack navigator GIỮ NGUYÊN màn bên dưới khi mở màn mới → sang `FruitPlace3D` (cũng có `<Canvas>`) là có **HAI ngữ-cảnh expo-gl cùng sống**, và vòng lặp dựng hình của R3F (`_roots`, một `requestAnimationFrame` chung) vẽ CẢ HAI mỗi khung hình.
Sửa: cả `Space3DScreen` lẫn `FruitPlace3DScreen` chỉ dựng `<Canvas>` khi `useIsFocused()` — mất tiêu điểm là tháo. Vừa cắt hẳn cảnh hai ngữ-cảnh cùng chạy, vừa bảo đảm lần quay lại LUÔN là ngữ-cảnh GL sạch, tức chính cái mà "back ra rồi vào lại" đang làm thủ công.
Tư-thế máy quay không mất: nó nằm ở `controller` NGOÀI canvas, khung đầu tiên sau khi dựng lại `CameraDriver` ghi lại ngay.
> Chưa chạy trên máy thật. Đây là nguyên nhân KHẢ DĨ NHẤT chứ chưa đo được; điểm chắc chắn là sau sửa thì trạng thái hỏng không thể sống sót qua một lần điều hướng nữa.

### 3. Luồng đặt vị trí quả: 3 BƯỚC tuần tự
`projection.ts`: `ViewDef.icon` → `ViewDef.step` (1..3), thêm `nextView()` (thuần, có test).
Trước → *Dùng vị trí này* → Bên → *Dùng vị trí này* → Trên → **Xác nhận**. Ba thẻ hướng vẫn bấm được để quay lại sửa; thẻ đã qua hiện dấu tích. Chip toạ-độ nào đang bị khoá thì mờ đi + ghi "đang khoá".
Vì sao vẫn giữ bước Trên: hai hướng đầu đã đủ khoá cả 3 trục, nhưng nhìn từ trời mới thấy ngay quả nằm trong hay ngoài tán.
Test: `projection.test.ts` +4 (thứ tự bước, `nextView` đi hết chuỗi không lặp, hướng cuối trả null).

### 4. Giao diện — simplify modern, bỏ sạch ký-tự-hình
- **Bỏ mọi emoji/ký tự làm icon** trong chuỗi (`＋ − ↺ ↻ ◯ ⬭ ✓ ➕ ▾ ▴ ↩︎ 💾 🎯 🆕 📍 📷 ✏️ ⭐ 🥥 🌿`) → dùng `components/Icon`. Lý do: emoji mỗi máy vẽ một kiểu, không đổi màu theo trạng thái, không canh được đường nền chữ.
- **Icon**: tải thêm 17 icon fa6-solid → tổng **79** (`minus`, `magnifying-glass-plus/minus`, `rotate-left/right`, `circle`, `bullseye`, `floppy-disk`, `arrow-rotate-left`, `wifi`, `cube`, `images`, `crop-simple`, `circle-plus`, `tag`, `triangle-exclamation`, `arrows-up-down-left-right`).
- **Nút + tròn** dùng `FAB` của **react-native-paper** — gói đã nằm trong `package.json` từ trước mà CHƯA CHỖ NÀO dùng. Icon truyền bằng HÀM DỰNG (`icon={({size,color}) => <Icon…/>}`) nên không kéo theo font MaterialCommunityIcons mà Paper mặc định dùng, và không cần `PaperProvider` (Paper v5 `createTheming(MD3LightTheme)` đã có theme mặc định khi không có Provider).
- **`components/BottomSheet.tsx`** (mới) — tấm trượt từ đáy thay `Alert.alert`. Hộp thoại hệ thống mỗi nền tảng một kiểu, không đặt được icon, và **Android tự sắp lại thứ tự nút** nên bộ "Huỷ / Thư viện / Chụp ảnh" hiện ra mỗi máy một khác. Giữ `<Modal>` sống thêm một nhịp để chạy nốt hoạt-ảnh đóng.
  ⚠️ Mở tấm này TỪ tấm chi tiết phải đóng cái trước rồi mới mở (chờ 220 ms) — hai `<Modal>` chồng nhau hay nuốt thao tác của nhau. Mở bộ chọn ảnh cũng chờ tấm đóng xong.
- **`FruitListScreen`**: header eyebrow + tên cây, chip loài, thẻ thống kê 3 cột, hàng quả bấm được, trạng thái rỗng/lỗi có khối icon riêng. Thêm **CHI TIẾT QUẢ** (trước đây không có: hàng danh sách không bấm được) — tấm trượt gồm ảnh đại diện, trạng thái, 3 ô dữ-kiện, dải ảnh các góc (`GET /api/fruit/{id}/views`), nút "Xem trong 3D" và "Thêm góc ảnh" (mở thẳng cropper ở chế độ `fruitId`).
- **`FruitCropperScreen`**: bước KHOANH dựng theo lối máy ảnh — ảnh chiếm TRỌN màn, nút nổi lên trên (trước là khung cố định cao 340 px rồi xếp nút thành hàng bên dưới). Tâm vòng ngắm hạ xuống `0.44·h` vì thanh nút dưới che mất phần đáy. Chọn hình khung là segmented `Quả tròn | Quả dài`, hình elip vẽ bằng CHÍNH icon `circle` kéo giãn ngang `scaleX 1.5`. Hai bước sau là màn sáng có nhãn "Bước 2/3", "Bước 3/3".
- Toàn bộ phần TOÁN của cropper (`regionToOrig`, `posFromBox`, `jumpToBox`, PanResponder pinch/pan) giữ NGUYÊN — chỉ đổi vỏ.

### 5. Lời mời "đã tìm thấy quả" — vòng sáng toả liên tục (`DetectInvite`)
Máy đã tự tìm ra quả rồi mà người dùng vẫn è cổ kéo-phóng bằng tay, vì cái chip gợi ý cũ đứng yên, màu lam như mọi nút khác, lại nằm tít trên đỉnh màn.
- Dời xuống **ngay trên thanh `Quả tròn | Quả dài`** — vùng ngón cái đang đặt sẵn, và nằm cạnh nhau thì thấy ngay là có đường tắt.
- **Xanh lá rực `#22C55E`**, KHÔNG dùng `COLORS.success` (#3D7A5E): màu đó trầm, đặt trên ảnh chụp vườn vốn toàn lá xanh sẫm thì chìm nghỉm.
- **Vòng sáng TOẢ RA liên tục** + nút nảy nhẹ. Hai vòng lệch pha nửa nhịp (vòng sau vào sau 750 ms của nhịp 1500 ms) nên không có quãng đứng hình. Vòng dùng `StyleSheet.absoluteFillObject` phủ đúng bằng nút rồi phóng ra → luôn đồng tâm, không phải căn tay theo bề rộng chữ (chữ đổi theo trạng thái).
- Chỉ chạy `transform` + `opacity` → `useNativeDriver: true`, không giành khung hình với cảnh 3D.
- Bấm rồi thì **THÔI động** (`detectUsed`): đã hiểu ý thì nhấp nháy tiếp chỉ còn là phiền; nút vẫn ở đó, đổi chữ thành "Canh lại vào quả đã tìm thấy".
- Chỉ hiện ở luồng quả MỚI (`fruitId` rỗng) — đúng như phần auto-detect vốn có.

## BẢN ĐỒ NỀN dưới thửa đất + hai kiểu xem 3D ⇄ 2D trong Space3D

Ảnh bản đồ trải ngay DƯỚI mặt đất của vườn, đặt đúng theo ĐIỂM NỐI ranh giới đã vẽ lúc thêm vườn. **Không thêm thư-viện nào** — ô bản đồ chỉ là ảnh 256×256 theo lưới Web-Mercator, tự tính lấy.

### Vì sao không nhét MapLibre vào cảnh
MapLibre là view native RIÊNG, không vẽ được vào ngữ-cảnh GL của `<Canvas>` (đặt chồng lên thì không xoay/nghiêng theo camera 3D được). Đường đi đúng: tải ô raster về rồi dán làm texture trong CHÍNH cảnh three.

### Lõi (toán THUẦN, có test)
- `mapTiles.ts` — lat/lng ⇄ ô `z/x/y`, sổ đăng ký nguồn ảnh, `planTiles()` chọn ô phủ kín vườn. Mức phóng chọn từ NÉT NHẤT hạ dần cho tới khi số ô ≤ trần (`MAX_TILES = 36`) → vườn nhỏ được ảnh nét, vườn lớn tự lùi ra chứ không nổ số lượt tải. Vị trí ô trả về bằng MÉT trong hệ vườn.
- `geo.ts` thêm `metersToLatLng()` (nghịch đảo `latLngToMeters`) — cần để đổi hộp bao của vườn về lat/lng mới hỏi được ô.
- **Hai phép chiếu khác nhau vẫn khớp**: `geo.ts` dùng equirectangular, ô bản đồ dùng Mercator. Hai cái chỉ lệch ở hệ-số giãn theo vĩ độ, gần như hằng số trong vài km → sai lệch dưới chục cm, nhỏ hơn sai số GPS. Và vì MỌI ô quy đổi qua cùng một hàm nên cạnh chung khớp tuyệt đối → **không hở đường ke** (có test kiểm).
- Test: `mapTiles.test.ts` — **23 test** (đi vòng lat/lng⇄ô, thứ tự `{z}/{y}/{x}` của Esri vs `{z}/{x}/{y}` của OSM, quấn vòng x / kẹp y, hạ mức phóng khi vườn rộng, phủ kín ranh giới, ô kề nhau khít cạnh, Nam bán cầu).
- ✅ Đã gọi thử URL thật: Esri z19 trả **HTTP 200, JPEG 256×256** — xác nhận mẫu URL và thứ tự trục đúng.

### Nạp ảnh (RN không có DOM)
`mapTexture.ts` — `TextureLoader` của three vô dụng ở RN. Dùng lại đúng đường đã chạy thật ở `treeAsset.ts`: `downloadAsync` → `Image.getSize` → texture dạng `image = { data: { localUri }, width, height }` + `isDataTexture`, để expo-gl tự giải mã ảnh ở tầng native.
- **`flipY = true`** (NGƯỢC với đường glTF ở `treeAsset` để `false`): ảnh bản đồ có gốc ở góc trên-trái, `PlaneGeometry` lấy uv(0,1) ở mép trên. Đã đọc mã nguồn expo-gl xác nhận nhánh nạp theo `localUri` CÓ tôn trọng `UNPACK_FLIP_Y_WEBGL` (`EXWebGLMethodsTextures.cpp`: `loadImage` xong thì `flipPixels`). Nếu sau này bản đồ hiện LỘN NGƯỢC thì đây là công tắc duy nhất cần lật.
- **CỐ Ý không bật mipmap**: texture chỉ upload xong ở lô lệnh kế tiếp, `glGenerateMipmap` trên texture chưa hoàn chỉnh cho ra ô ĐEN — hỏng nặng hơn hẳn cái giá là hơi rung khi nhìn chếch. Giữ đúng cấu hình lọc `treeAsset` đã chạy thật.
- Cache 2 tầng: theo URL ở mức module (đổi 3D⇄2D không tải lại, không upload lại GPU) + tệp trong `cacheDirectory` (mở lại app không tốn mạng).
- Ô hỏng chỉ mất ô đó; các ô khác vẫn hiện dần từng cái một.

### Cảnh
- `scene/MapGround.tsx` — mỗi ô = 1 `<mesh>` phẳng riêng. Xoay `−π/2` quanh X làm +Y cục bộ (mép TRÊN của ảnh) quay về −Z = **BẮC**, đúng quy ước ô bản đồ → khỏi sửa uv bằng tay. `meshBasicMaterial` vì ảnh vệ tinh đã có sẵn nắng trong đó, cho đèn cảnh tác động nữa thì vườn tối đen một nửa.
- `FarmGround` thêm `mapUnder`: có bản đồ thì thửa đất thành lớp nhuộm MỜ (`opacity 0.16`, `depthWrite=false` để không che chấm/nhãn vẽ sau) và TẮT lưới mốc — giữ mặt đất đặc thì bản đồ bên dưới vô hình.
- Sương mù đẩy XA khi bật bản đồ, nếu không nó nhuộm đen rìa ảnh trông như cháy góc.

### Hai kiểu xem (nút [3D]/[2D] ở cạnh phải)
- **3D** — như cũ: máy quay nghiêng, model cây dựng đứng, bản đồ trải dưới.
- **2D** — nhìn thẳng từ trên xuống, **BẮC HƯỚNG LÊN** (`theta = 0`), KHOÁ nghiêng (`controller.phiLocked`), cây thu về **chấm dẹt** (`scene/TreeMarkers.tsx`) vì nhìn từ trên thì tán 3D chồng lên nhau che gần hết ảnh.
- **Không hạ `phi` về 0**: máy quay dựng đúng trục đứng thì `lookAt` suy biến (hướng nhìn song song vector "lên") và cảnh lật lung tung → dùng `PHI_MIN`, mắt gần như không phân biệt được.
- `controller.panBy()` mới: ở 2D, 1 ngón **KÉO bản đồ** thay vì xoay (góc nghiêng đã khoá thì kéo dọc sẽ không có phản hồi gì cả). Quy đổi px→mét theo `2·r·tan(fov/2)/chiều-cao-khung` nên kéo 1 px luôn đi đúng 1 px cảnh ở mọi mức phóng.
- Mọi đường bay đều phải biết kiểu xem: `flyToTree`/`flyToFarm` đọc `modeRef` — ở 2D thì bay THẲNG (giữ top-down) chứ không dùng `treePose`/`farmPose` (2 cái đó có `phi` nghiêng, `flyTo` ghi thẳng vào pose nên bỏ qua `phiLocked`).
- Chỗ bắt chạm cây đổi theo kiểu xem: 3D nhắm nửa thân cây, 2D nhắm sát mặt đất. Nhãn cây cũng hạ xuống ~0.3 m ở 2D (nhìn từ trên thì ngọn nằm chồng lên gốc).

### Nút bấm & báo lỗi
Cạnh phải: `[3D]/[2D]` · bật/tắt lớp bản đồ · đổi nguồn ảnh (Vệ tinh Esri ↔ Bản đồ OSM, **mặc định vệ tinh** — vườn nông thôn nhìn ảnh vệ tinh mới thấy tán cây/luống/bờ ranh, bản đồ đường phố thường trắng trơn). Đặt ở GIỮA cạnh phải để không đụng thanh tiêu đề, thẻ quả, dòng gợi ý và băng "đang đặt vị trí" (`top: 108`).
Lớp bản đồ trống thì nói RÕ lý do ngay trên màn (chưa có điểm nối GPS / không tải được ảnh / thiếu n trên m ô) — không có nó thì người dùng chỉ thấy nền tối và tưởng nút hỏng.

> ⚠️ Vườn chưa có `Farm.coordinates` → `origin = null` → KHÔNG có gì để neo bản đồ. Trùng với cảnh báo ở mục dưới: `loadFarm` không đẩy farm vào `state.farm.farms` nên vào FarmDetail bằng đường lạnh cũng mất ranh giới.
> ⚠️ OSM yêu cầu User-Agent hợp lệ và cấm dùng nặng. Đang là nguồn PHỤ; nếu sau này dùng nhiều thì chuyển sang nhà cung cấp có khoá riêng.

## Nút "Xem sơ đồ 3D của vườn" ở Chi tiết trang trại

Trước đây từ `FarmDetail` chỉ vào 3D được qua chip "Xem 3D" trên TỪNG thẻ cây (mà chip đó chỉ hiện khi cây có `has_3d`) → không có lối nào xem TOÀN CẢNH vườn.
- `FarmDetailScreen.tsx`: thêm prop `onView3DFarm` cho `FarmDetailMode` + nút phụ trong thanh đáy (trên nút "Cập nhật hoạt động"), style `view3DFarmBtn`.
- Điều hướng `Space3D { mode:'farm', farmId }` — **KHÔNG truyền `treeId`** chính là thứ quyết định chế độ toàn cảnh (Space3D chỉ bay sà vào cây khi có `treeId`).
- `farmId` lấy `farm?.id ?? farm_id`: `farm` đọc từ SQLite qua thunk `loadFarm`, có thể chưa về khi mở nhanh; `farm_id` từ route params luôn có.
- ⚠️ `loadFarm` KHÔNG có reducer → không đẩy farm vào `state.farm.farms`, mà `useSpaceData` lại tìm ranh giới trong ĐÓ. Vào FarmDetail bằng đường thường (qua `FarmList`/Home đã `loadFarms`) thì đủ dữ liệu; đường lạnh thì rơi về ô vuông mặc định — mất ranh giới thật chứ không nổ.
- Chỗ chừa của FlatList tăng 30 → 86 px vì thanh đáy giờ cao thêm 1 nút (thanh này `position:absolute`, phủ lên list).

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
`TreeDetail` "Sơ đồ 3D" · `FarmDetail` nút 3D trên thẻ cây + nút "Xem sơ đồ 3D của vườn" ở thanh đáy · `FruitList` "Sơ đồ 3D" → đều mở `Space3D`. `TreeMap2D`/`FarmMap2D`/`TreeViewer3D` GIỮ đăng ký route (deep-link cũ) nhưng không nút nào trỏ tới nữa. Nút "Xem 3D" cũ chỉ hiện khi `has_3d` → nay cây NÀO cũng xem được.

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

### Đã seed 79 icon (49 gốc + 13 navbar/arc + 17 luồng quả)
arrow-left/right, arrow-right-from-bracket, bars, bell, bookmark, briefcase, calendar, camera,
check, chevron-(left/right/up/down), circle-(info/check/xmark/exclamation), clock, comment(s),
credit-card, ellipsis-vertical, envelope, eye, eye-slash, filter, gear, gift, heart, house,
house-chimney, image, leaf, location-dot, lock, magnifying-glass, paper-plane, pen, phone, plus,
qrcode, share-nodes, sliders, star, trash, user, wallet, xmark.
+navbar/arc: seedling, bolt, circle-user, table-cells-large, tree, apple-whole, video, paw, droplet,
utensils, syringe, warehouse, cow.
+luồng quả: minus, magnifying-glass-plus, magnifying-glass-minus, rotate-left, rotate-right, circle,
bullseye, floppy-disk, arrow-rotate-left, wifi, cube, images, crop-simple, circle-plus, tag,
triangle-exclamation, arrows-up-down-left-right.

### Ghi chú kỹ thuật
- `react-native-svg@15.15.5` đã thêm vào `package.json` (trước đó chỉ là transitive dep).
- Icon FA Solid là glyph đặc → `variant="outline"` = stroke silhouette (dùng khi cần, có thể không đẹp mọi icon).
- viewBox width mỗi icon khác nhau (vd house 576×512) → component scale rộng theo tỉ lệ, cao = `size`.
