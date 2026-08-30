## Mỗi app ký nhận luật SuperApp, và có cổng nổ khi không ký

### Cái thiếu, và vì sao nó không phải chuyện giấy tờ
Kho này dựng nhiều app từ một nền mã. Câu "mỗi app phải có danh tính riêng và tuân luật SuperApp" cho tới nay **không có chỗ nào cưỡng chế**: `instances/<mã>/instance.json` có bốn khoá — `id`, `displayName`, `android`, `ios` — không DID, không neo vào luật nào. Thêm một thư mục là thành một app.

### Luật viết ra, và nó tự nói chỗ chưa canh được
`instances/LUAT-SUPERAPP.md`, bảy mục, mỗi mục ghi rõ có cổng thật hay chưa. §6 (khoá ký) và §7 (chia phần tiền giữa các app) tự khai **CHƯA CƯỠNG CHẾ**, và có bài kiểm giữ nguyên chữ đó — xoá chữ mà không dựng cổng là đỏ. Không có phép này thì một tệp luật dần đọc như thể cả bảy mục đã được canh.

### Cổng ở hai chỗ, hai lý do khác nhau

| chỗ | bắt được cái mà chỗ kia không bắt |
|---|---|
| `android/app/build.gradle` | bản dựng trên máy cá nhân, không qua CI |
| `src/config/instanceRules.test.ts` | đỏ ngay trên máy không có Android SDK, không phải chờ 20 phút |

Cổng đòi: khối `superapp` bắt buộc · `rulesVersion` khớp số ở đầu tệp luật · `phoenixDid` không `null` với app mới · hai app không dùng chung DID.

**`rulesVersion` là chỗ đáng đọc kỹ.** Sửa luật ⇒ nâng số ⇒ **mọi app đỏ** cho tới khi có người đọc luật mới rồi ký nhận trong tệp của app mình. Cố ý làm phiền: không có bước này thì một ràng buộc mới thêm vào tài liệu sẽ đúng với app viết SAU nó và **im lặng sai** với mọi app viết TRƯỚC.

### Hai app hiện có được miễn TẠM — và cái miễn đó là nợ
`aladin` và `checkfarm` để `phoenixDid: null`, vì chưa có đường cấp DID cho một *instance* (khác DID của **người dùng**, thứ đã có sẵn). Tên hai app ghi thẳng trong cổng kèm ngày và lý do, và một bài kiểm chặn danh sách đó **dài thêm** — nó chỉ được rút ngắn. Cách khác là bắt cả hai có DID ngay, và hôm nay chỉ làm được bằng cách bịa một chuỗi trông giống DID: cổng xanh mà không có gì đứng sau.

### Kiểm chứng bằng đột biến — 4/4
thêm app thứ ba không DID · nâng phiên bản luật · hai app trùng DID · gỡ khối kiểm khỏi gradle.

⚠ Cổng gradle **chưa chạy được ở máy soạn** (không có Java). Bài kiểm JS canh phần văn bản của cổng; việc gradle cấu hình trót lọt thì lượt CI đầu tiên mới nói được.

### README viết lại — bản cũ sai ở đúng chỗ người mới sẽ tắc
- `src/config/instances/myapp.config.ts` — **đường không tồn tại**;
- `moduleList` khai theo từng app — trường đã gỡ, tập module nay là hằng dẫn xuất từ `moduleIds.ts`;
- nhánh `dev` — **không tồn tại**, nhánh tích hợp là `develop`;
- "INV-1 = mỗi module giữ dữ liệu riêng" — trái với `Integration-Standard.md:119` ("store DID là single source of truth; mọi host là CLIENT");
- không nói rõ Codemagic **chỉ dựng Aladin** (cả hai luồng Android khai `ANDROID_FLAVOR: aladin`).

Kèm `src/config/docLinks.test.ts`: quét mọi `.md` ở gốc kho + `instances/`, đỏ khi một liên kết tương đối trỏ vào tệp không có. Một liên kết chết không làm bản dựng đỏ, không làm bài kiểm nào đỏ, và nó sống được hàng tháng — đúng lớp lỗi vừa nêu.

### Rà tiếp
Tên kho cũ `AladinContract/SuperApp` còn ở 6 chỗ (gồm một câu hướng dẫn trong `android-aab.yml` bảo người đọc chạy `gh api` vào kho sai) → `MagicSuperApp/SuperApp`. Mục "PR đang mở" của `VersionChecklist.md` còn ba PR đã gộp từ tháng 7 → thay bằng năm PR mở thật. `CONTRIBUTING.md` đo lại thì đúng nguyên.

---

## Chat nối API ProofChat thật, gỡ hết dữ-liệu mẫu, dựng lại giao-diện theo Fluent

### Cái đã gỡ, và vì sao nó nguy chứ không chỉ thừa
`store/chatSlice.ts` cũ nạp `MOCK_ROOMS` / `MOCK_MESSAGES` / `MOCK_INVITATIONS` thẳng vào `initialState`. Hệ quả không phải "thiếu dữ liệu" mà là **dữ liệu bịa giả làm dữ liệu thật**: máy chủ chưa mở, hoặc gọi hỏng, thì màn chat vẫn vẽ đủ 5 phòng, đủ tin nhắn, đủ số chưa-đọc, đủ huy hiệu "Đã xác thực". Người dùng nhắn vào đó rồi ngồi đợi trả lời.

Gỡ hẳn, cùng những thứ chỉ tồn tại để nuôi nó:

| Tệp bỏ | Nó dựng ra cái gì |
|---|---|
| `features/chat/data/mock.ts` (370 dòng) | 5 phòng, 13 tin, 3 lời mời, 3 mã phòng "công khai", ví + 5 giao dịch |
| `features/proof/lifecycle.ts` | 2 "đường ống bằng-chứng" chạy bằng `setTimeout` |
| `features/proof/components/ProofPipelineIndicator.tsx` | hoạt-cảnh "đang mã hoá → đang ký → đang gửi" |
| `features/proof/components/VerificationBadge.tsx` | huy hiệu "Đã xác thực" đeo dưới **mọi** tin |
| `features/escrow/{types.ts,components/EscrowStatusCard.tsx}` | thẻ ký-quỹ kèm số tiền, trong một module manifest ghi rõ "CHAT KHÔNG escrow/ví" |
| `features/wallet/{types.ts,components/IdentityCard.tsx}` | thẻ danh-tính + `TOKEN_SYMBOL`, không màn nào còn dùng |
| `features/chat/components/JobRoomItem.tsx` | dòng danh sách bày `jobTitle`/`escrow` — máy chủ không cấp trường nào |

Trong `ChatScreen.tsx`, `handleDecrypt` chọn nội dung "giải mã được" **theo id tin**: `m.id === 'm6'` → *"Em vừa kiểm tra lại — model anh sửa được…"*. Đó là một câu viết cứng trong mã nguồn, hiện ra sau một hoạt-cảnh bốn chặng có vẻ như đang làm mật mã.

### Bề mặt API đã nối (`services/proofchat-api.ts`, +435 dòng)
Trước bản này client chỉ có `auth` + `conversations.list/get/create/getMessages` + `users.search` + `mls`. Thêm, theo `docs/PROOFCHAT-APIS.md`:

* **conversations** — `update` · `addParticipants` · `updateParticipant` · `removeParticipant` · `join` · `leave` · `listPins` · `pin` · `unpin`
* **memberRequests** — `pending` · `accept` · `decline` · `listForConversation` · `invite` · `myStatus` · `approve` · `reject` · `cancel`
* **messages** — `react` · `reactions` · `unreact` · `remove` · `save` · `unsave` · `saved`
* **readSignals** — `send` (Trackmess `/trackmess/signals`)
* **uploads** — `image` (multipart `/support/uploads`) + `absoluteUrl`

Điểm phân vai giữ nguyên và được ghi lại ở đầu tệp: **REST chỉ chở phần vỏ và metadata** (danh sách phòng, cảm-xúc, ghim, đã-xem); **nội dung tin đi đường riêng** qua `proofchatService` (mã hoá MLS + socket). Nhờ vậy cảm-xúc/ghim/lưu dùng được ngay cả khi máy này chưa mở được nội dung — đó cũng là lý do có trạng-thái tin `'locked'`.

### Ai quyết định — đã trả về đúng chỗ
`JoinConversationModal` cũ giữ **trong máy** một danh sách ba mã phòng "công khai" (bịa trong mock) rồi tự đoán: mã có trong danh sách → báo *"Đã tham gia phòng"*, không có → báo *"Đã gửi yêu cầu"*. Cả hai câu đều có thể sai vì máy chủ mới biết phòng mở hay kín. Nay app gửi mã lên `POST /conversations/:id/join` và **đọc** `action`: `JOINED` → vào thẳng; khác → đang chờ duyệt.

Cùng lớp lỗi, cùng cách sửa: lời mời nay là `GET /member-requests/pending` thật, nhận/từ chối gọi `accept`/`decline` thật — trước đó chỉ lật một cờ trong máy, bên kia không hề hay biết.

### Giao-diện: Fluent, không thêm phụ-thuộc native
`theme/fluent.ts` + `shared/components/Fluent.tsx` dựng bốn lớp đúng thứ tự Fluent: **Mica** (nền màn, hai vệt loang `RadialGradient` qua `react-native-svg` đã có sẵn), **Acrylic** ba độ dày (thanh đầu màn · pill · hộp thoại), **Layer** (thẻ đặc), **Stroke** (viền tóc bắt sáng), cộng `ELEVATION`/`RADIUS`/`SPACE`/`MOTION`.

⚠ **Blur ở đây là blur giả.** Blur GPU thật trên React Native cần `@react-native-community/blur` hoặc `expo-blur` — kho chưa có, thêm vào là buộc dựng lại cả hai nền. Nên lớp vật-liệu dựng bằng nền chuyển sắc + phủ trắng bán trong + viền sáng. Ghi rõ trong `fluent.ts`: khi nào có mô-đun native thì chỉ cần bọc `ACRYLIC.*` bằng `<BlurView>`, bảng màu đã tính sẵn cho trường hợp đó.

Màu thô **không** nằm trong module: theo YC-1, giá trị sống ở `theme/tokens.ts` (`CHAT_SURFACE_TOKENS`, `AVATAR_TONE_TOKENS`) và `modules/chat/theme/fluent.ts` chỉ ghép chúng với brand `chat`. `npx eslint src/modules/chat` nay còn **0 lỗi, 1 cảnh báo** (`>>>` trong hàm băm tên → màu avatar).

### Chữ trên màn hình
Bỏ khỏi giao-diện: *"End-to-end · Proof System"*, *"Đã xác thực / Đang xác thực"*, *"Tin nhắn đã mã hóa — chạm để giải mã"*, địa chỉ ví rút gọn `0x7a3f…e3f4` trên đầu phòng, `DIRECT/GROUP/THREAD/JOB_NEGOTIATION` in thẳng ra cho người đọc.

Nguyên tắc thay thế: **im lặng nghĩa là ổn**. Tin bình thường không đeo huy hiệu nào; chỉ khi nội dung không khớp chữ ký người gửi mới lên tiếng, và lên tiếng bằng câu người ta làm được gì với nó — *"Nội dung không khớp với người gửi. Đừng làm theo tin này."* Dòng phụ trên đầu phòng đổi từ chuỗi băm sang thứ dùng được: bao nhiêu người trong phòng, hoặc ai đang gõ.

### Hai lỗi thứ tự đã chặn trước khi nó thành lỗi báo cáo
1. **Danh tính đến sau danh sách.** `iAmAdmin` và tên phòng 1-1 đều tính theo "tôi là ai". Tải danh sách trước khi `getDid()` trả lời thì mọi phòng nạp lúc đó **vĩnh viễn** thiếu nút quản lý. Chặn bằng `identityResolved` — hỏi danh tính xong mới tải; không có phiên vẫn mở khoá (xem được phòng, chỉ không nhận ra mình trong đó). `setMeId` đồng thời tính lại `iAmAdmin` cho phòng đã nạp.
2. **`onTyping` đăng ký vào socket chưa tồn tại.** `chatSocket.onTyping` gọi `socket?.on(...)` — socket còn `null` thì nó **im lặng không làm gì**, chỉ báo "đang nhập" chết mà không có một dòng lỗi. Nay gắn sau khi `initProofChat()` đã `resolve`.

Cùng tinh thần: `loadMessages.fulfilled` giữ lại nội dung đã mở được ở lượt trước. REST chỉ trả phần vỏ, ghi đè thẳng thì cả phòng "đóng" lại mỗi lần mở màn.

### Còn thiếu, nói thẳng
* **Ảnh đính kèm chưa nối vào phòng chat.** `uploads.image` đã có ở tầng API, nhưng `CreateMessageDto` phía máy chủ **không có trường đính kèm**, và `/support/uploads` theo tài liệu là đường của support chat. Chưa có khuôn dạng tin mang tệp thì không dựng nút — `ChatInput` ẩn hẳn nút kẹp tệp khi không truyền `onPickImage`, chứ không để một nút bấm-không-ra-gì.
* **`GET /users/search` có thể vẫn tắt phía máy chủ.** `MemberPicker` phân biệt rõ hai câu: 404 → *"Máy chủ chưa mở phần tìm người. Chưa tra được — không phải là không có ai."*, khác 404 → *"Chưa tra cứu được lúc này."* Nuốt lỗi thành danh sách rỗng là bắt người dùng gõ lại mãi.
* **Poll và tin hẹn giờ** (`/polls/*`, `/conversations/:id/scheduled`) có trong tài liệu nhưng chưa nối — chưa có chỗ nào trong luồng hiện tại cần tới.

### Đo
`npx tsc --noEmit` sạch · `npx jest` **115 suite / 1692 test** đều xanh · `npx eslint src/modules/chat` 0 lỗi. 18 tệp đổi, **+3013 / −3136** dòng.

---

## Lát `x86` hỏng vẫn vào AAB — `abiFilters` KHÔNG cắt được nó

### Đo được, không suy
Dựng thật `bundleRelease` hôm nay với đúng cấu hình đang có trong kho — `android/app/build.gradle` khai `abiFilters 'armeabi-v7a', 'arm64-v8a', 'x86_64'` (không có x86) — tệp `.aab` ra vẫn chứa:

| lát | số tệp |
|---|---|
| arm64-v8a | 28 |
| armeabi-v7a | 28 |
| **x86** | **25** |
| x86_64 | 28 |

Ba tệp thiếu ở lát `x86`: `libtaad_enclave_core.so`, `libchat_mls.so`, `libcardano_serialization_lib`. Đúng ba thư viện gốc của tầng danh tính PhoenixKey — **cùng dạng hỏng với bản 87**.

Plugin `com.facebook.react` đọc `reactNativeArchitectures` trong `gradle.properties` rồi **ghi đè** `abiFilters` viết tay. Chỗ thật sự cắt lát là dòng đó, không phải khối `ndk {}`.

### Ba chú thích trong kho đều tin sai
`android/app/build.gradle:131`, `scripts/soi-aab.sh:67`, `.github/workflows/android-aab.yml:307` — cả ba đều ghi *"chỉ `abiFilters` mới cắt x86"*. Đã đính chính cả ba tại chỗ, kèm số liệu đo được, chứ không xoá dòng cũ đi.

### Sửa bốn nơi khai `reactNativeArchitectures`
`armeabi-v7a,arm64-v8a,x86,x86_64` → `armeabi-v7a,arm64-v8a,x86_64`:

* `android/gradle.properties` (bị gitignore — chỉ sửa được ở máy này)
* `.github/workflows/android-aab.yml:179` — heredoc tự sinh gradle.properties
* `codemagic.yaml:1037` và `:1302`

⚠ Hai đường CI cũng đang khai `x86`, nghĩa là **mọi AAB ra từ CI trước bản này đều mang lát x86 hỏng**. `debug-apk.yml` thì không dính (nó vốn chỉ khai hai ABI).

⚠ `android/gradle.properties` nằm trong `.gitignore`, nên máy của người khác vẫn còn `x86` cho tới khi họ tự sửa. Không có tệp mẫu nào trong kho để vá chỗ này.

Đo lại sau khi sửa: `ABI trong tệp: arm64-v8a, armeabi-v7a, x86_64`, sáu `.so` Rust đủ ba lát, và tệp **giảm từ 110,5 MB xuống 92,4 MB** — 18 MB kia là lát không máy nào cài được đúng.

### Cổng bắt được lỗi nhưng không nói được lỗi gì
`scripts/build-aab.ps1` bắt đúng lát lạ, rồi in ra `DỪNG: Tệp .aab KHÔNG đầy đủ:` và **một dòng trống**.

Nguyên nhân: PowerShell gọi hàm ở **chế độ đối số**, nên `Die "a" + $b` truyền **ba** đối số (`"a"`, `"+"`, `$b`) và `Die` chỉ nhận cái đầu. Phải viết `Die ("a" + $b)`. Đã vá cả hai chỗ và ghi lý do ngay trên định nghĩa `Die` — mất thêm một lượt dựng 12 phút chỉ để biết nó đang phàn nàn cái gì.

### `dlltool` — chuỗi biên dịch Windows, không phải lỗi dự án
Bản Rust host GNU (chọn vì máy không có trình liên kết Visual Studio, và ổ C: chỉ còn 7,3 GB) thiếu `dlltool.exe`, nên `windows-sys` — phụ thuộc dựng cho **host**, không phải cho Android — không biên dịch được:

```
error: error calling dlltool 'dlltool.exe': program not found
```

Gợi ý cargo in kèm (`rustup target install aarch64-linux-android`) **dẫn sai hướng** — target không hề thiếu.

Vá bằng `llvm-dlltool.exe` có sẵn trong NDK, không tải thêm gì. Đã thêm bước soát vào script: chỉ hỏi khi host là `*-windows-gnu`, và in sẵn đường dẫn `llvm-dlltool` tính từ chính NDK script vừa dò ra.

### `.gitignore`
Thêm `build-aab.log` và `android/app/src/main/jniLibs/` — thư mục sau là sản phẩm `cargo ndk`, hàng chục MB, khác nhau theo bản NDK từng máy.

## Cổng jest đỏ GIẢ ở bản dựng AAB — hai bộ test bị bỏ đói, không phải chậm

`npm run build:aab` dừng ở bước 3 với hai bộ đỏ:

```
TreeManagementScreen › mang MÃ VƯỜN của màn danh sách sang màn Dẫn đường
WayfindScreen        › bỏ cây của vườn khác cách 30 km, giữ cây trong tầm đi bộ
   thrown: "Exceeded timeout of 5000 ms for a test."
```

Chạy RIÊNG hai bộ đó: **xanh, 4,4 giây cả hai cộng lại.** Vậy không phải mã màn chậm.

### Đo được nguyên nhân
Máy dựng có **16 nhân** ⇒ jest mở ~15 tiến trình con, mỗi tiến trình nạp trọn đồ thị module RN. Lúc dựng, máy còn **0,8 GB RAM trống**. Chúng tranh nhau bộ nhớ và bị hoán trang, nên các bộ dựng NGUYÊN một màn RN không kịp xong trong 5 giây — bị **bỏ đói CPU**, không phải chậm về logic.

Kèm theo là hai dấu hiệu của cùng một gốc, trước đây đọc như lỗi riêng:
`A worker process has failed to exit gracefully` và `You are trying to import a file after the Jest environment has been torn down` — cả hai là *hậu quả* của việc test bị cắt giữa chừng rồi phần async của nó chạy tiếp sau khi môi trường đã dọn.

### Sửa hai chỗ
* `jest.config.js` — thêm `testTimeout: 30_000`. 5000ms là **mặc định của Jest**, không phải con số ai đó đo cho kho này, và nó quá chật cho bộ test dựng nguyên màn.
* `scripts/build-aab.ps1` — cổng chạy `--maxWorkers=50%`. Đây mới là chỗ chạm vào gốc: nửa số nhân thì không còn hoán trang.

Đo lại sau khi sửa: **109 bộ / 1 639 test xanh trong 8,4 giây** — nhanh hơn hẳn 34,7 giây của lượt đỏ. Ít tiến trình hơn mà nhanh hơn, đúng dấu hiệu của thiếu bộ nhớ chứ không thiếu CPU.

CI (ubuntu runner, máy trống) vẫn dùng số worker mặc định — không đụng tới.

### Vì sao đáng sửa chứ không "chạy lại cho xanh"
Một cổng đỏ giả tệ hơn một cổng chậm: nó dạy người ta bấm chạy lại tới khi xanh, và thói quen ấy sẽ nuốt luôn ngày có một test đỏ THẬT.

## `gradlew bundleRelease` gõ tay đang ra bản THIẾU ví · DID · chat mã hoá

### Lỗ
Hai module Kotlin nạp thư viện native lúc lớp khởi tạo:

```
TaadEnclaveModule.kt:392   System.loadLibrary("taad_enclave_core")
ChatMlsModule.kt:168       System.loadLibrary("chat_mls")
```

Cả hai `.so` **không có trong git** (`git ls-files android/app/src/main/jniLibs` → rỗng; thư mục ấy còn không tồn tại trên máy này), và `android/app/build.gradle` **không có** cargo/rust/externalNativeBuild nào — gradle không biết chúng tồn tại. Chúng do một bước RIÊNG dựng, chạy TRƯỚC gradle: `.github/actions/rust-android/action.yml` và `codemagic.yaml:1054`.

Gõ thẳng `.\gradlew bundleRelease` bỏ mất bước ấy. Kết quả:

* gradle dựng **xanh**;
* AAB ký đúng, Play nhận;
* app mở được — hai module có `try/catch`, đặt `libLoaded=false` rồi reject mọi method;
* và toàn bộ tầng danh tính PhoenixKey (ví · DID · Master_KEK · cụm 24 từ · uỷ thác) cùng chat đầu-cuối **im lặng không dùng được**.

Xanh ở máy dựng, hỏng ở tay người dùng. Đo thêm: máy này **chưa cài `cargo`** — nên mọi bản AAB từng dựng tay ở đây đều thiếu hai thư viện đó.

### `scripts/build-aab.ps1`
Dựng lại đúng thứ tự của CI, trên Windows, dừng ở lỗi đầu tiên:

1. soát công cụ + tệp bí mật — node · Java · SDK · **NDK đúng bản `rootProject.ext.ndkVersion`** · `.env` · `keySigning.bin` · đủ **bốn** khoá `ALADIN_UPLOAD_*`;
2. `npm install --legacy-peer-deps` (kéo theo `patch-package`);
3. cổng `tsc` + `jest --ci --forceExit`;
4. `cargo ndk` hai crate × ba ABI → `jniLibs`, rồi kiểm **cả sáu** tệp;
5. `gradlew bundleRelease --no-daemon`;
6. **mở tệp `.aab` ra đọc danh sách mục.**

Bước 6 là bước đáng giá nhất: nó kiểm **thành phẩm**, không kiểm "các bước đã chạy". Ba thứ phải có mặt — `base/assets/index.android.bundle`, `base/lib/{arm64-v8a,armeabi-v7a,x86_64}/lib{taad_enclave_core,chat_mls}.so` — và **không** được có lát ABI nào khác. Một lát `x86` lọt vào là một lát chắc chắn thiếu `.so` Rust (Rust cố ý không dựng cho x86), và Play sẽ giao đúng lát đó cho thiết bị x86: chính là lỗi bản 87.

### Bốn chỗ khác đã soát ra
* **NDK**: CI lấy "bản mới nhất đang cài" — đúng ở runner (chỉ một bản), **sai ở máy này** (đang có 5 bản). Script lấy đúng bản `android/build.gradle` khai, nếu không thì Rust và gradle dựng bằng hai NDK khác nhau trong cùng một tệp.
* **`reactNativeArchitectures`** trong `android/gradle.properties` vẫn còn `x86`, trong khi `abiFilters` đã bỏ từ 15/08. Không sai kết quả (abiFilters lọc lát ra), chỉ tốn thời gian dựng RN native cho một ABI rồi vứt đi. Sửa được bằng một dòng — tệp đó bị gitignore nên nằm ngoài commit.
* **`versionCode` = 92**, cố định trong `build.gradle`. Play từ chối tệp trùng versionCode; script cảnh báo trước khi dựng.
* **Java**: máy này 21, CI dựng bằng **17**. Cảnh báo mềm chứ không chặn — chưa đo được 21 gãy, nhưng bản ra Play nên khớp bản đã đo.

### Một cái bẫy của chính script
Windows PowerShell 5.1 đọc `.ps1` theo bảng mã ANSI nếu tệp **không có BOM UTF-8** — mọi chú thích tiếng Việt thành rác, và rác đó chứa ký tự bộ phân tích đọc thành dấu nháy: 19 lỗi cú pháp ở một tệp viết đúng. Và `2>&1` trên một `.exe` dưới `$ErrorActionPreference='Stop'` bọc từng dòng stderr thành ErrorRecord rồi ném — mà `java -version` in ra stderr theo thiết kế. Cả hai đã vấp và đã sửa.

Thêm `npm run build:aab`.

## Giá nông sản: từ 2 mặt hàng lên 6, và một lỗi đọc số nhân giá lên gấp mười

### Vì sao chỉ có hai
`AGRO_ITEMS` trong `agroPriceService.ts` đóng cứng đúng hai dòng: sầu riêng và cà phê nhân. Không phải nguồn nghèo — ô chọn của agro.gov.vn có **230 mục**.

Nhưng phần lớn 230 mục ấy đã chết. Đã dò thật ngày 19/08: POST từng mục, cửa sổ 400 ngày, thử cả ba nhịp *ngày/tuần/tháng*. Chỉ **sáu** mục còn số liệu của hôm qua (18-08-2026):

| mặt hàng | giá | thị trường |
|---|---|---|
| Sầu riêng Ri6 đẹp | 53.000 đ/kg | Tây Nguyên |
| Cà phê nhân | 96.800 đ/kg | Đắk Lăk |
| **Hạt tiêu đen trong nước** | 138.000 đ/kg | Đắk Lắk |
| **Heo hơi trại** | 57.000 đ/kg | Bắc Ninh |
| **Cà phê Robusta** | 3.769 USD/tấn | London |
| **Cà phê Arabica** | 345,1 cent/lb | New York |

Mục thoi thóp gần nhất là `Hạt điều tươi` (06-01-2026) và `Phân đạm Urê Phú mỹ` (22-12-2025) — quá cũ để bày cạnh giá hôm qua, nên **không** đưa vào. Toàn bộ nhóm gạo/lúa, thuỷ sản, trái cây khác (thanh long, xoài, cam) trả bảng rỗng ở cả ba nhịp.

Đừng thêm mục chỉ vì thấy tên trong ô chọn: một mục chết làm mục giá dài thêm một dòng "—" chẳng nói gì, và đẩy những dòng đang sống xuống dưới.

### Cụm "Thế giới" hết trống
London và New York không phải trong nước, nên chúng đi vào cụm **Thế giới** — cụm mà trước bản này **luôn trống**, vì nguồn duy nhất của nó (FAOSTAT) đòi một token Cognito sống 60 phút, không nhúng vào app được (`config/faostat.ts` đã ghi rõ, và `FAOSTAT_TOKEN` vẫn là `null`). Hai dòng sàn lấp đúng chỗ ấy bằng số liệu **hôm qua** thay vì số liệu 2024.

### Lỗi đọc số: `345.1` thành `3451`
Bản trước đọc ô giá bằng `String(cell).replace(/[.,\s]/g, '')` — vứt sạch mọi dấu chấm và phẩy. Với `138.000` (phân nhóm nghìn kiểu Việt) thì đúng. Với `345.1` — Arabica, cent/pound — nó ra **3451**, tức **gấp mười lần**.

Đây là loại hỏng tệ nhất: 3451 vẫn là số hợp lệ, vẫn lọt mọi khoảng hợp lý, vẫn được vẽ lên màn. Lỗi chưa cắn ai chỉ vì hai mặt hàng cũ đều là số đồng tròn — nó cắn ngay ngày thêm mặt hàng đầu tiên có phần thập phân, tức là hôm nay.

`parseAgroNumber` đọc theo ba luật, đúng thứ tự: mọi nhóm đúng ba chữ số ⇒ phân nhóm; đuôi một–hai chữ số ⇒ thập phân; còn lại ⇒ đọc thô. Nhập nhằng còn lại (`3.769`) giải theo lối Việt Nam — mà một giá 3,769 đồng cũng không tồn tại.

Kéo theo hai chỗ nữa: `latestAndPrevious` thôi `Math.round` khi gộp trung bình các vùng, và màn dùng `formatPriceValue(n, decimals)` thay `formatVnd` để giữ đúng số chữ số của từng mặt hàng.

### Lọc khoảng hợp lý: theo DÒNG, không theo mặt hàng
Bản trước lấy ngày mới nhất rồi mới xét khoảng — nên một phiên hỏng ở nguồn làm **cả mặt hàng biến mất**. Đã gặp thật: Robusta ngày 18-08-2026 trang ghi `36700` giữa hai phiên `3769` và `3810` (nguồn tự rơi mất dấu thập phân). Nay lọc ở mức từng dòng, trước khi chọn ngày mới nhất: phiên hỏng bị bỏ, người dùng vẫn thấy giá phiên liền trước kèm đúng ngày của nó.

### Một chỗ dễ "sửa cho sạch" rồi hỏng
Nhãn gửi đi phải là **chính chuỗi** trong `<option>`, kể cả dấu cách thừa: `'Heo hơi trại |Live hog '`. Gõ lại cho gọn thì WebForms trả 200 kèm bảng **rỗng** — không lỗi nào để lần ra. Có test khoá đúng chuỗi này.

### Đo lại
`tsc` 0 lỗi · eslint 0 lỗi · **106 bộ / 1 610 test** xanh (20 test mới). Bốn khoá tên và hai khoá đơn vị mới, đủ cả bốn ngôn ngữ.

## Vị trí cây: có toạ độ thì CẮM GHIM và chỉ đường được, thôi hiện "máy chủ chưa cho biết"

### Câu cũ trả lời sai người
Bản trước, dòng "nơi trồng" là `gpsPrecisionLabelVi('unknown')` — *"Máy chủ chưa cho biết vị trí này chính xác tới đâu"*. Câu đó nói về **sự thiếu của máy chủ**, không trả lời câu hỏi của người mua. Mà trong tay đã có `gps: [20.989, 105.944]`: một chỗ có thật, đi tới được.

### Ba việc đổi
**1. Tra ngược toạ độ ra địa chỉ.** Nền bản đồ đang dùng vốn đã có dữ liệu hành chính của chỗ đó, nên lấy ngay từ đấy — `reverseGeocode.ts`, Nominatim/OSM. Đo thật với đúng toạ độ cây mẫu:

```
GET nominatim.openstreetmap.org/reverse?format=jsonv2&lat=20.989&lon=105.944&zoom=16&accept-language=vi
→ display_name: "Vinhomes Ocean Park, Xã Gia Lâm, Hà Nội, 17710, Việt Nam"
```

Không dùng thẳng `display_name`: mã bưu chính và tên nước đẩy phần có nghĩa ra khỏi dòng trên máy hẹp. `shortAddressVi` gắp lại theo **bốn bậc hành chính Việt Nam** — thôn/khu → xã/phường → huyện/quận → tỉnh — rồi cắt còn ba mẩu. Gộp bậc xã với bậc huyện làm một (bản đầu tôi viết thế, test bắt được) làm ca nông thôn `village + county + state` mất hẳn cấp huyện: ra *"Xã Cẩm Sơn, Tiền Giang"*, mà một tỉnh có nhiều xã trùng tên.

Ba tầng lùi ở dòng "nơi trồng": địa chỉ tra được → toạ độ thô (vẫn chép dán sang bản đồ khác được) → mới đến "chưa có thông tin vị trí".

**2. Bản đồ luôn cắm ghim, và ghim có nhãn tên cây.** Một cái chấm không tên không nói được nó đang chỉ cái gì.

**3. Nút "Chỉ đường"** mở `https://www.google.com/maps/dir/?api=1&destination=lat,lon` — đường universal, máy có app Google Maps thì hệ điều hành bắt lấy mở thẳng app. Không dùng `geo:` vì iOS không có gì nhận. Đây là lý do tồn tại của cái ghim: không có nút này thì toạ độ vẫn chỉ là hai con số, chỉ khác là có một chấm đè lên.

### Vòng ước lượng: giữ, nhưng thu hẹp điều kiện
Vòng chỉ vẽ khi máy chủ **tự khai** `gps_precision='coarse'` kèm `gps_precision_m` — lúc đó mới biết chắc bán kính. Không khai gì thì không vẽ. `UNKNOWN_RADIUS_M = 250` của bản trước đã **xoá**: vẽ một vòng bịa bán kính còn tệ hơn không vẽ, vì nó trông y như một phép đo.

### Giữ Nominatim sống được
Họ cho 1 lượt/giây và đòi khai `User-Agent` — thiếu là chặn IP, mà chặn thì **mọi máy** mất dòng địa chỉ cùng lúc, im lặng. Nên: mỗi toạ độ hỏi đúng một lần (đệm bộ nhớ + đĩa 30 ngày, khoá làm tròn 4 chữ số ≈ 11m), hai lượt hỏi song song dùng chung một lời hứa. Đệm đĩa **chỉ ghi ca thành công** — ghi cả ca hỏng là khoá một toạ độ vào trạng thái "không có địa chỉ" chỉ vì một lần mất sóng.

Đây là lượt gọi duy nhất của màn đi ra ngoài hệ thống, nên nó chỉ mang hai con số máy chủ đã công khai: không mã cây, không token. Có test khoá đúng điều đó.

### Một cái bẫy trong chính bộ test
Bốn ca đầu xanh giả: bản giả của `AsyncStorage` **lưu thật**, nên ca đầu ghi địa chỉ vào đĩa và mọi ca sau đọc lại — `fetch` giả không được gọi lần nào, và cả nhóm hoá ra chỉ đang kiểm bộ đệm. Thêm `AsyncStorage.clear()` vào `beforeEach`.

### Đo lại
`tsc` 0 lỗi · eslint 0 lỗi · **105 bộ / 1 590 test** xanh (17 test mới cho `reverseGeocode`).

## Màn "Nguồn gốc" dựng lại theo mắt NGƯỜI MUA — ảnh, danh tính, nhật ký trước; bản đồ, 3D, chuỗi khối sau

### Bố cục cũ hỏng ở đâu
Bản trước xếp một ô ảnh cao 200px, rồi một thẻ bốn dòng ngang hàng nhau: *Ghi nhận · Vị trí · Góc chụp lúc đăng ký · Neo lên chuỗi*. Bốn dòng ấy đều đúng, nhưng chúng là bốn câu trả lời cho câu hỏi **"chứng minh đi"** — mà đó không phải câu hỏi đầu tiên của người đang cầm quả ở sạp.

Người mua hỏi theo thứ tự: *trông nó thế nào → cây gì, của ai → ở đâu → đã trải qua gì*. Nay màn xếp đúng thứ tự đó, và ba khối "chứng minh" (bản đồ, khối 3D, neo chuỗi) rơi xuống các mục **gập, đóng sẵn** ở cuối.

Gập không chỉ để gọn. Bản đồ MapLibre và `<Canvas>` 3D **mỗi thứ là một bề mặt GL**; mount cả hai cho một người chỉ nhìn được một là làm máy yếu nóng lên đúng lúc họ đang xem kỹ. Vì vậy `Fold` nhận `render: () => ReactNode` chứ không nhận node — đóng nghĩa là **chưa gọi**, tức chưa tốn gì.

### Hai chỗ máy chủ KHÔNG trả lời, và màn phải nói ra
Đo thân thật 19/08 (`GET /api/tree_by_code/ORI-w7er6uf-Z9MMB2PS`):

**1. Không có trường nào về chủ vườn.** Allowlist `_public_prov` trả đúng 15 khoá: `anchor · code · created_at · embedding_hash · gps · images · lampnet_base · lampnet_pending · lampnet_view · model3d · n_views · name · record_cid · record_hash · tree_id`. Đã dò thêm `/api/booth/public/{code}` — khác không gian mã, trả 404 với mã cây.

Người mua hỏi "của ai" **trước tiên**. Nên ô đó vẫn đứng đầu thẻ, và nó nói thẳng *"Hồ sơ công khai chưa kèm tên chủ vườn"* — không bỏ hẳn dòng (là giấu mất câu hỏi của họ), không đắp `author_did` vào (một chuỗi băm không phải tên người).

`ownerLine()` vẫn đọc `owner_name`/`owner`/`farm_name`/`farm` để ngày máy chủ mở thêm thì hiện ra ngay, không phải chờ bản app mới.

**2. Dòng thời gian đòi phiên đăng nhập.** `GET /api/tree/{id}/timeline` trả `401 {"error":"Cần đăng nhập."}` cho khách. Bản trước `EntityTimeline` hiện "Phiên hết hạn" — với người mua thì đó là câu vô nghĩa: họ không có tài khoản nào để hết hạn, và câu ấy sai bảo họ đi làm một việc không làm được.

Nay `EntityTimeline` nhận `authHint`, và màn nguồn gốc truyền câu đúng với người của nó. Bên cạnh đó, `milestones()` dựng **hai mốc đọc được từ chính hồ sơ** — ngày đăng ký, lượt neo chuỗi — xếp **cũ trước** (đây là tiểu sử, không phải bảng tin), kèm một dòng nói rõ chúng đến từ hồ sơ xuất xứ chứ không phải nhật ký chăm sóc.

### Bản đồ: VÒNG, không phải ghim
Thân thật **không có `gps_precision`** ⇒ `gpsPrecision()` trả `'unknown'` ⇒ `canPinExactly()` = false. Cắm ghim nhọn lên một toạ độ đã qua `_coarsen_public_gps` là **nói dối bằng đồ hoạ**.

`circleGeo.ts` dựng vòng bằng **đa giác theo toạ độ**, không dùng `CircleLayer` (vẽ theo *pixel*, nên phóng to thu nhỏ là mất hết nghĩa về khoảng cách). Vòng nhân `cos(lat)` cho chiều đông-tây — bỏ nó thì ở vĩ độ 21 vòng dẹt mất ~7%, nhìn ra ngay là hình bầu dục; có test đo lại bằng Haversine. Chưa biết bán kính thì vẽ `UNKNOWN_RADIUS_M = 250` **nét đứt**, và chữ dưới bản đồ là `gpsPrecisionLabelVi('unknown')`, không mượn câu của `coarse` (câu đó ngụ ý đã đo).

### Khối 3D
`https://lampnet.cloud/ln1q_7da38f774a97ca3a_file` → 200, **`text/plain`**, 73 953 byte, `ply / format ascii 1.0 / element vertex 2048`, có `red green blue`.

Ba điều rút ra vào mã:
- `Content-Type` là `text/plain` cho **mọi** tệp trong kho ⇒ đừng lọc theo MIME để đoán ascii/nhị phân; đưa `ArrayBuffer` cho `PLYLoader.parse` là nó tự đọc dòng `format`.
- Điểm **có màu** ⇒ `vertexColors: true`, không thì mọi model trông y hệt nhau.
- Không dùng `PLYLoader.load(url)`: nó đi qua XHR và lỗi chui ra không mang mã HTTP, nên không tách được "404 chưa dựng model" khỏi "mất sóng". Dùng `fetch` thì bốn nhánh hỏng ra bốn câu khác nhau — và chỉ **một** trong bốn đáng hiện nút "Thử lại".

`coverage.advice` của máy chủ (*"Mới chụp ~60° (một phía cây)…"*) hiện **nguyên văn** dưới ô. Không có nó thì người mua nhìn một khối lỗ chỗ rồi kết luận hồ sơ dối, trong khi sự thật chỉ là chưa chụp đủ vòng. Số điểm lấy số **đọc được từ tệp**, không lấy số máy chủ khai — hai số lệch nhau là dấu hiệu tệp bị cắt, ưu tiên số khai sẽ giấu nó đi.

### Một dòng gỡ mìn
`TraceResultScreen` cũ có `Clipboard.setString(JSON.stringify(p))` **chạy trong thân render** — một dòng gỡ lỗi bỏ quên, và nó cướp bảng nháp của người dùng mỗi lần màn vẽ lại. Đã xoá; chép mã cây nay là một nút có chủ đích, có phản hồi "đã chép".

### Đo lại
`jest.config.js` thêm `three` vào `transformIgnorePatterns`: `three/examples/jsm/**` là ESM thuần (lõi `three` có bản CJS nên vẫn nạp được, các loader thì không), nên trước bản này **bất kỳ** test nào chạm tới `GLTFLoader`/`PLYLoader` đều chết ở dòng `import` đầu tiên.

`tsc` 0 lỗi · eslint 0 lỗi · **104 bộ / 1 573 test** xanh (42 test mới cho `provenanceView`, `circleGeo`, `plyPointCloud`).

## SỬA: nút "Tải ảnh mã QR" gửi MÃ DẠNG CHỮ thay vì ảnh

### Nguyên nhân, đọc từ mã React Native
Bản trước gọi `Share.share({ url: dataUrl, message: code })`. Trên Android, `Share` của RN **vứt bỏ `url`**: nó chỉ dựng lại `{ title, message }` rồi gửi đi.

```js
// react-native/Libraries/Share/Share.js:112-115
const newContent = {
  title: content.title,
  message: typeof content.message === 'string' ? content.message : undefined,
};
```

Nên nó gửi đúng cái `message: code` tôi truyền vào. Comment tôi viết trong bản trước — *"ở Android ta chia sẻ chuỗi `data:`"* — là **sai**: nhánh Android không đọc `url` dưới bất kỳ dạng nào.

### Đây là loại hỏng tệ nhất
Nó **không báo lỗi**. Một việc khác đã xảy ra, và báo thành công. Người dùng bấm "tải ảnh", nhận được chữ, và không có gì trên màn nói rằng có chuyện gì sai.

Nên luật của tệp đó bây giờ là: **không có đường lùi nào gửi chữ thay cho ảnh.** Không xuất được ảnh thì nói không xuất được ảnh.

### Đường đúng
Thêm `expo-sharing` (~56.0.23, khớp SDK) — nó chia sẻ được TỆP trên cả hai nền, và trên Android tự dựng `content://` qua FileProvider của chính nó, thứ mà `Share` của RN không làm còn app này thì chưa khai FileProvider nào.

Đường đi: PNG base64 → ghi tệp tạm → `Sharing.shareAsync(uri, { mimeType: 'image/png' })`.

Đường lùi **chỉ trên iOS**, và chỉ với `url` là `file://` — ở đó nhánh `ios` của `Share.js` thật sự đọc `url`. Android **không có đường lùi**, và đó là câu trả lời đúng chứ không phải thiếu sót.

### Bài kiểm khoá đúng lỗi này
`saveQrImage.test.ts` không chỉ kiểm "có gọi chia sẻ không". Nó kiểm rằng không đường nào gửi chữ:
- expo-sharing dùng được ⇒ **không đụng** tới `Share` của RN;
- ghi tệp hỏng ⇒ `unavailable`, `Share` không được gọi;
- Android + expo-sharing báo không hỗ trợ ⇒ `unavailable`, `Share` không được gọi (đây chính là ca đã hỏng);
- ngay cả đường lùi iOS cũng **không** truyền `message`.

### Câu lỗi tách làm hai
`unavailable` (chưa dựng lại app sau khi thêm gói) nói *"cần cập nhật ứng dụng"*; `failed` nói *"thử lại giúp"*. Gộp lại thì người dùng bấm mãi một nút không bao giờ chạy được trên bản app họ đang cầm.

Kiểm: `tsc` sạch · **1.478/1.478 test xanh** (+11) · eslint 0 lỗi.

## Mã QR công khai: chấm tròn trên nền logo, và một tấm trượt để bật

### Vì sao phải tự dựng lưới, không dùng ảnh của máy chủ
`GET /qr/{code}` trả một tấm SVG **đã vẽ xong** — ô vuông đen, nền trắng, không có chỗ chen vào. Muốn cái nhìn khác thì phải có **LƯỚI**, không phải có **ẢNH**. Nên thêm `qrcode-generator` (thuần JS, không native, không cần dựng lại app) và app tự sinh lưới ở `features/treeQr/qrMatrix.ts`.

Tự sinh mã an toàn ở đây vì thứ nhúng vào QR là URL công khai do chính app dựng (`publicTraceUrl`) — không phải bí mật nào của máy chủ, và hai bên ra cùng một chuỗi.

### Ba chốt giữ cho mã còn quét được
Ảnh nền + chấm tròn đều ăn vào phần "sạch" của mã. Ba thứ bù lại, đừng gỡ cái nào:

1. **Ô SÁNG cũng phải vẽ** (chấm màu nền, đục). Bỏ chúng thì logo lộ nguyên mảng và độ tương phản sáng/tối biến mất — mã trông đẹp hơn và chết hẳn. Logo lộ ra qua **bốn góc nhỏ** mà chấm tròn chừa lại ở mỗi ô; máy quét lấy mẫu ở TÂM ô, nơi luôn là màu đặc.
2. **Ba ô định vị vẽ VUÔNG, trên nền trơn.** Máy quét tìm mã bằng tỉ lệ 1:1:3:1:1 của ba ô đó. Bo tròn hoặc cho logo chạy qua là phá đúng cái mốc dùng để tìm mã. Bản mẫu web cũng giữ vuông — nhưng nó dùng `zone = 11` (quét cả vùng canh giờ), ở đây dùng đúng 7×7 rồi lót thêm một ô trắng mỗi phía.
3. **Mức sửa lỗi H (~30%)**, không phải mặc định M. Cái giá là lưới dày hơn ⇒ ô nhỏ đi — đánh đổi đúng cho một cái tem đem dán ngoài vườn.

Thêm một chốt bản mẫu web không có: **lề trắng 4 ô** theo chuẩn. Nhiều thư viện rút xuống 1–2 cho gọn, và đó là lý do quen thuộc khiến một mã "đẹp" không quét được khi dán sát mép nhãn.

### Tải ảnh: bảng chia sẻ, KHÔNG phải lưu thẳng vào thư viện
`react-native-svg` có sẵn `toDataURL` trên ref → PNG base64. Lưu thẳng vào thư viện ảnh cần `expo-media-library`/CameraRoll — dự án không có, và thêm mô-đun native nghĩa là phải dựng lại app trước khi nút sống. Bảng chia sẻ thì có sẵn và làm được nhiều hơn: chọn *Lưu ảnh*, hoặc **gửi thẳng cho thợ in** — với một cái tem cần đem đi in thì việc sau hay xảy ra hơn.

Hai bẫy đã tránh: Android **không nhận `file://`** qua `Share` (đòi `content://` + FileProvider) nên ở đó chia sẻ chuỗi `data:`; và tên tệp mang **mã cây**, không phải `qr.png` — xuất mã cho mười cây rồi mở thư mục Tải về mà nhìn thấy mười tệp `qr.png` thì coi như hỏng.

### Nút bật công khai ra khỏi chỗ khuất
Trước đây đây là NƠI DUY NHẤT bật được công khai, và nó là một thẻ nằm trong tab thứ ba. Đo trên kho sản xuất 08/2026: **139 cây — 54 riêng tư, 85 chưa đặt, 0 công khai.** Không phải nông dân không muốn; là không ai tìm ra chỗ bấm.

Nay: nút **ngay trên nút "Thu hoạch quả"**, mở một tấm trượt (`TreePublicSheet`). Nút phụ vẽ **viền** chứ không đặc, để hai nút không tranh nhau làm nút chính của màn.

⚠ Điều kiện dựng thanh dưới đã đổi: trước nó chỉ hiện khi cây **đã có quả**, vì trong thanh chỉ có nút thu hoạch. Bật công khai thì không đợi cây có quả — nó là mắt xích đầu của chuỗi truy xuất, phải bấm được từ ngày trồng. Nên thanh hiện ở mọi cây; riêng nút thu hoạch giữ điều kiện cũ.

`TreePublicCard` (tab Thông tin) rút về đúng vai: một dòng cho biết trạng thái + lối đi tới cùng tấm trượt đó. Giữ cả hai bản giao diện thì thành hai màn cùng làm một việc, và sớm muộn hai bản lệch nhau.

Kiểm: `tsc` sạch · **1.467/1.467 test xanh** (+16) · eslint 0 lỗi trên tệp mới (TreeDetailScreen giữ đúng 6 lỗi có sẵn).

## Thẻ vườn ở trang Tổng quan: một mảng xanh lá mạ, có tán lá ở góc

Thẻ "Vườn của tôi" (tab thông tin) từ **ba ô trắng rời** thành **một thẻ màu**.

### Vì sao đổi lần thứ tư
Ba bản trước: thẻ to bọc ba cụm icon-trên-số ngăn bằng vạch dọc (lối bảng biểu 2010) → lưới hai hàng → một hàng ba ô trắng. Vấn đề còn lại của bản ba: **ba ô trắng trên nền trắng thì mắt phải đi tìm chúng**. Vườn · cây · quả là thứ liếc MỘT cái rồi đi tiếp — một mảng màu đặc kéo mắt tới đúng chỗ nhanh hơn mọi cỡ chữ.

Và nó chỉ hiệu quả chừng nào **trong trang chỉ có MỘT** mảng như vậy. Thêm cái thứ hai là hai cái cùng mất tác dụng — ghi thẳng vào chú thích của `LIME_CARD` để bản sau không rải màu ra khắp trang.

### Màu: lá mạ, hạ tối vừa đủ để chữ trắng đọc được
`#4F7D22`. "Lá mạ" là xanh ngả vàng của mạ non, không phải xanh lá cây già. Với chữ trắng cho tỉ lệ tương phản **~5,4:1** — qua mức AA (4,5) cho cả cỡ chữ nhỏ, mà vẫn còn ra màu mạ chứ chưa thành màu rêu. Đặt trong `theme/depth.ts` chứ không viết thẳng vào màn: eslint của dự án cấm hex trong component, và đúng ra là vậy.

### Hoạ tiết tán lá — góc dưới bên phải
Dùng lại `<Leaf>` sẵn có ở `components/layered/Organic` (phiến lá + gân giữa), ba lá **lệch cỡ và lệch góc**: xoay đều nhau thì ra hình do máy vẽ, lệch thì mắt đọc thành tán lá thật.

Hai chi tiết có chủ ý:
- Lá **tràn ra ngoài mép** và bị `overflow: hidden` cắt. Lá bị cắt ở mép trông như tán còn tiếp diễn; lá nằm gọn trong khung trông như một cái tem dán.
- Lớp lá `pointerEvents="none"` và nằm DƯỚI chữ — không bao giờ ăn mất cú chạm.

### Hai thứ dọn theo
- **Cả thẻ bấm được** (mở danh sách vườn). Bản trước chỉ ô "Vườn" bấm được, tức hai phần ba mảng là vùng chết mà nhìn y hệt phần sống.
- **Bỏ `hint` ở SectionHeader.** Tên vườn nay nằm trong chính thẻ; để cả hai chỗ là in cùng một chuỗi hai lần cách nhau 40 px, người đọc phải kiểm xem hai dòng có khác nhau không rồi phát hiện là không.
- Xoá hẳn `Tile` và năm khoá kiểu của nó — không ai gọi nữa.

Kiểm: `tsc` sạch · **1.451/1.451 test xanh** · eslint 0 lỗi.

## Gộp develop vào feat/scan — hai nhánh cùng dựng cửa tra quả

Bốn tệp xung đột, và không phải xung đột vặt: nhánh `develop` (PR #184) và nhánh này **dựng trùng nhau** cửa `POST /api/fruit/lookup` — hai service, hai màn hình, cùng một endpoint.

### Điều đáng mừng: hai bên độc lập đọc ra CÙNG một hợp đồng
Bản của develop cũng dùng `pick` · `regions` · `img_urls` · `lookup_id` · `verdict`/`EMPTY_SCOPE` · `image_unusable` · `rate_limited` · `sess`. Tức cả hai đã đọc từ máy chủ thật, không ai đoán. Xung đột là về **hình dạng API phía app**, không phải về sự thật.

### Chọn gì, và vì sao

| tệp | giữ | lý do |
|---|---|---|
| `TraceScanScreen.tsx` | bản này | ba lượt quyết định của anh nằm ở đây: bỏ tự chụp, bỏ khoanh vùng, cắt vuông theo khung ngắm. Bản develop là màn QR cũ 198 dòng, chưa có gì trong số đó. |
| `fruitLookupService.ts` | bản này | có `imageBytes` (`prepareImage` cần), chốt 2MB tại máy, `safeExplorerUrl`/`safeHttpUrl`, và 36 bài kiểm bám theo. |
| `fruitLookupService.test.ts` | bản này | đi kèm service trên. |
| `FarmDetailScreen.tsx` | gộp tay | **cả hai bên đều thêm khối dòng thời gian vườn** — cùng một kết luận, khác chỗ đặt. Giữ vị trí TRÊN danh sách cây, và giữ lập luận của develop: vẽ cả khi vườn chưa có cây nào, vì việc đồng áng không đợi có cây mới ghi được. |

### Không vứt cái của người khác
Ba thứ develop đo được mà bên này chưa có, đã chép vào đầu `fruitLookupService`:

- **Ba đường quả** — `identify` (nông dân, cần đăng nhập, pool theo owner) · `scan` (khách hội chợ, theo phiên trưng bày) · `lookup` (người lạ, theo cây công khai). Kèm cảnh báo của chính máy chủ: *"TUYỆT ĐỐI KHÔNG nới /api/fruit/identify cho người lạ — nới nó là biến kho thành máy tra-cứu-ngược toàn bộ quả của mọi chủ."*
- **`SOLO` không có nghĩa "chắc chắn là quả này"** — nó nghĩa là "trong tầm chỉ có một ứng viên". Ở ngưỡng 0,72 có 73% (412/564) cặp quả khác nhau cùng cây bị nhận nhầm; siết hết nhận nhầm thì chỉ giữ 7,8% quả thật.
- Số đo `server.py:8321` làm căn cứ cho việc màn hình không được có dấu tích xanh.

Một chỗ CỐ Ý không theo develop: mã phiên `sess` **không lưu xuống đĩa**. Máy chủ tự nhận đây là lớp giữ trải nghiệm chứ không phải lớp an ninh và "giả được", nên lưu chẳng siết thêm gì — chỉ đổi lấy một mã bền theo máy, đúng thứ dùng để lần theo một người mua không đăng nhập.

### Việc phải làm thêm mà danh sách xung đột KHÔNG báo
`FruitLookupScreen.tsx` của develop (màn riêng, route `FruitLookup`) không nằm trong bốn tệp xung đột, nhưng nó gọi API của service vừa bị thay ⇒ vỡ lúc dịch. Đã chuyển nó sang union bảy nhánh.

Bài học: git chỉ báo tệp **cả hai bên cùng sửa**. Tệp chỉ MỘT bên sửa mà phụ thuộc vào bên kia thì nó im — `tsc` mới là thứ tìm ra.

Kiểm sau gộp: `tsc` sạch · **1.451/1.451 test xanh** (92 bộ) · eslint 0 lỗi mới (FarmDetailScreen giữ đúng 30 lỗi có sẵn từ trước, không thêm bớt).

## Thông báo: tin nhiều báo cùng đưa · dông · gió giật · mưa to

Luật cảnh báo (`alertRules`) đã có từ trước nhưng **chưa có đường ra** — nó quyết định cái gì đáng báo rồi không có gì đưa nó khỏi app. Nay nối xong, và thêm nhánh thời tiết.

### Thời tiết theo GIỜ, không theo ngày
`weatherService` nay xin thêm `hourly=weather_code,precipitation_probability,wind_gusts_10m`. Không có mảng giờ thì chỉ nói được "hôm nay có lúc mưa" — đúng nhưng vô dụng: nhà vườn cần biết còn hai tiếng nữa hay tối mới mưa.

`wind_gusts_10m` chứ không phải `wind_speed_10m`: **lốc là GIẬT**, và gió trung bình 20 km/h có thể giấu một cú giật 70 km/h thổi bay giàn lưới.

**Một cái bẫy múi giờ đã vá trước khi nó cắn.** Open-Meteo trả `"2026-08-18T14:00"` không kèm múi giờ. `Date.parse` chuỗi đó hiểu theo múi giờ CỦA MÁY — đúng khi máy để giờ Việt Nam, lệch đúng 7 tiếng khi không. Một cảnh báo "dông trong 2 giờ nữa" lệch 7 tiếng thì tệ hơn không có cảnh báo. Nên `hourEpoch()` quy bằng `utc_offset_seconds` mà chính máy chủ gửi kèm, không đoán theo máy.

### Nói đúng cái đo được: KHÔNG có chữ "bão"
Nguồn là mô hình dự báo toàn cầu. Từ đó suy ra được **dông** (WMO 95·96·99), **gió giật** (km/h), **mưa to** (WMO 65·82).

Không suy ra được, và app không được nói như thể biết:
- **Bão có tên** (Yagi, Trà Mi…) — cảnh báo bão ở Việt Nam do Trung tâm Dự báo KTTV Quốc gia phát; Open-Meteo không có cờ nào cho nó. Nên chữ trong app nói **"gió rất mạnh"**, không nói "bão": người đọc chữ "bão" sẽ đi chằng nhà — một việc lớn — dựa trên thứ ta chỉ đo được bằng km/h.
- **Lốc/vòi rồng** — hiện tượng cục bộ vài trăm mét, lưới mô hình ~10 km không thấy. Thứ đo được là gió giật, và đó là điều app nói.

Ngưỡng lấy từ thang **Beaufort** (thang chính thức trong bản tin KTTV): 50 km/h ở ranh cấp 6→7 ("cất đồ"), 75 km/h ở ranh cấp 8→9 ("gãy cành, bật gốc"). Không bịa số tròn cho đẹp.

### Một cơn = MỘT cảnh báo
Dông thường kèm gió giật và mưa to. Báo ba cái cho một cơn là dạy người ta tắt thông báo. `weatherAlerts` trả **nhiều nhất một** cảnh báo mỗi lượt, chọn theo mức nặng: đang dông > sắp dông > gió giật nguy hiểm > gió giật mạnh > mưa to.

"Đang dông" vẫn đáng báo dù nghe có vẻ thừa: người có vườn không phải lúc nào cũng đứng trong vườn. Toạ độ tra thời tiết là toạ độ **vườn**, không phải chỗ họ đang đứng.

### Đường ra: `localNotify` (notifee)
`@notifee/react-native` đã có trong `package.json` nhưng chưa nơi nào dùng. Nay có, nạp kiểu **`require` mềm** như mọi mô-đun native khác trong repo: máy chưa dựng lại thì trả `false`, không ném.

Thời tiết dữ đi kênh **ưu tiên cao** (kêu, hiện đè lên màn); tin tức thì im, chỉ nằm trên khay — một tin nông sản rung máy giữa đêm là cách nhanh nhất để bị tắt thông báo.

Không khai `smallIcon`: dự án **chưa có** drawable `ic_notification`, và khai một tên không tồn tại thì notifee ném "Icon not found" — mất luôn thông báo. **Việc còn thiếu**: Android vẽ icon thông báo dưới dạng mặt nạ đơn sắc, nên icon ứng dụng nhiều màu sẽ ra một ô trắng trên thanh trạng thái. Cần một drawable trắng-trên-nền-trong.

### `alertDispatcher`: hai cái chốt, cần cả hai
1. `dropRecent` — cùng MỘT chuyện không báo lại trong 12 giờ.
2. `MIN_RUN_GAP_MS` (30 phút) — cả LƯỢT XÉT cũng có nhịp tối thiểu.

Chốt 1 không thay được chốt 2: mở app 20 lần buổi sáng thì chốt 1 vẫn im, nhưng đã chạy 20 lượt đọc/ghi AsyncStorage cho không. Chốt 2 không thay được chốt 1: qua 30 phút được xét lại, nhưng cơn dông vẫn là cơn dông cũ.

**Ghi sổ SAU khi thông báo hiện thành công.** Ghi trước là tự khoá mình: một lượt gửi hỏng (thiếu quyền, chưa dựng native) vẫn tính là "đã báo", và cơn dông đó im lặng suốt 12 giờ. Có bài kiểm canh đúng chỗ này.

Sổ `sentAt` tự **quên sau 7 ngày** — không thì nó chỉ có lớn lên, và sau một năm là vài chục KB đọc/ghi mỗi lần mở app.

### Chạy ở đâu, và giới hạn phải nói thẳng
Gọi từ trang Tổng quan, **sau khi** thời tiết và tin đã tải xong — trang đó vốn đã tải cả hai để vẽ màn, bắt bộ cảnh báo tải lại là nhân đôi lượt mạng của người dùng cho cùng một dữ liệu.

⚠ **App đóng hẳn thì KHÔNG có cảnh báo.** Thông báo cục bộ chỉ hiện được khi mã JS có chạy, tức lúc mở app hoặc quay lại app. Không có cảnh báo lúc 3 giờ sáng. Muốn có thì phải để **máy chủ đẩy push** (FCM đã nhận sẵn ở `pushHandler`) hoặc dựng tác vụ nền. Đừng viết trong màn Cài đặt câu "bật để nhận cảnh báo bão" như thể nó chạy 24/7.

Kiểm: `tsc` sạch · **1.302/1.302 test xanh** (+49) · eslint 0 lỗi.

## "Ảnh có nhiều quả" KHÔNG phải do mô hình trên máy — do khung ngắm nói dối

### Đo trước, sửa sau
Báo cáo: màn truy xuất vẫn hiện *"trong ảnh có nhiều quả — chạm vào đúng quả muốn tra"*, nghi do mô hình nhận diện trong máy.

**Không có mô hình nào chạy ở luồng này.** `grep` cả màn quét và `features/traceScan`: không `TreeReIDYolo`, không `detectFruit`, không cầu native nào. Mô hình trên máy (`yolov26seg.tflite`) chỉ nạp bên trong phiên chụp của `TreeReIDBridge` — luồng đăng ký CÂY, không dính gì tới đây. Và chuỗi chữ cũ (`scan.state.pickFruit`) đã bị xoá khỏi mã.

Câu đó là **của MÁY CHỦ**: nhánh `need_region` trả kèm `message`, và màn hình đang cho câu máy chủ thắng câu app.

### Nguyên nhân THẬT: gửi rộng hơn thứ người dùng ngắm
Khung ngắm trên màn là ô **VUÔNG**, nhưng `capture()` trả **trọn khung máy ảnh — 4:3**. Hai mép trái/phải là phần người dùng KHÔNG nhìn thấy và không chọn.

Nên chuyện xảy ra đúng như vậy: người mua cẩn thận đưa **một** quả vào giữa khung, tấm gửi lên lại có thêm mấy quả ở hai mép, máy chủ đếm được nhiều quả và trả `need_region`. App trách người dùng vì một việc họ đã làm đúng.

### Hai sửa
**1. Cắt về ô vuông giữa ảnh trước khi gửi** (`prepareForLookup(..., { square: true })`). Với `resizeMode="cover"` trên khung vuông, ô vuông giữa CHÍNH LÀ vùng đang hiện trên màn — không hơn, không kém. Đây **không phải nhận diện**: không dò quả, không đoán gì, chỉ là gửi đúng thứ người ta đã ngắm.

Ba chi tiết dễ sai, đã khoá bằng test:
- **Cắt TRƯỚC, co SAU** — `crop` đo bằng pixel ảnh gốc; co trước là cắt vào một toạ độ không còn tồn tại.
- **Thang co đo trên cỡ ĐÃ CẮT** — 4032×3024 cắt còn 3024×3024 mà vẫn đo theo 4032 là co quá tay.
- **Ảnh nhẹ vẫn phải cắt.** Đường tắt "đã dưới trần thì gửi nguyên" phải nhường khi có yêu cầu cắt, nếu không tấm nhẹ lại lọt nguyên khung 4:3.

Ảnh chọn từ **thư viện** thì KHÔNG cắt: ở đó không có khung ngắm nào, cắt là tự ý xén ảnh của người ta.

**2. Nhánh `need_region` KHÔNG chuyển tiếp câu của máy chủ.** Câu ấy là "mời chỉ đúng quả rồi gửi lại" — sai với app này, vì không còn hộp nào để chạm. Bảo người ta làm một việc màn hình không cho làm là cách chắc nhất để họ nghĩ app hỏng.

Luật đúng, nay ghi vào mã: **câu máy chủ thắng, TRỪ khi nó mô tả một thao tác client không có.** Lúc đó app phải tự nói một câu người dùng làm theo được — ở đây là *"lại gần, chụp riêng MỘT quả thôi"*.

### Một lỗ hổng test bắt được
Khi mô-đun co ảnh ném ở **mọi** bậc mà tấm gốc vẫn dưới 2MB, bản trước trả `too_large` — từ chối một tấm gửi được. Nay lùi về tấm gốc: mất phần cắt vuông, được phần tra cứu.

Kiểm: `tsc` sạch · **1.263/1.263 test xanh** (+10) · eslint 0 lỗi.

## BỎ phần khoanh vùng quả ở màn truy xuất — gửi nguyên tấm ảnh

Màn quét nay **gửi nguyên tấm ảnh** cho máy chủ và không làm gì với nó ngoài việc co cho lọt trần 2MB. Không dò quả, không vẽ hộp, không chấm điểm.

### Đã bỏ những gì
Cửa `/api/fruit/lookup` nhận `bbox`/`points` để chỉ đúng quả, và bản trước dùng nó: máy chủ trả `need_region` → màn vẽ hộp nhận diện lên khung xem → người dùng chạm chọn → app gửi lại **cùng tấm ảnh** kèm `bbox`.

Xoá cả cụm đó cùng ba tệp dựng nên nó: `previewBox.ts` · `previewBox.test.ts` · `ScanBox.tsx`. Kéo theo: `Outcome.pick_region`, `onFrameTap`, năm ô vẽ `slots`, `matchSlots`/`hitTest`/`padBbox`/`imageBoxToPreview`/`previewPointToImage`, và khoá chữ `scan.state.pickFruit`.

**Lý do**: nó bắt người mua học một thao tác mới — chạm đúng một hộp trong mấy hộp vừa hiện ra — để giải một bài mà **máy chủ giải tốt hơn**. Và mỗi hộp vẽ ra là thêm một phép quy đổi toạ độ có thể lệch: ảnh 4:3 ↔ khung xem vuông ↔ tấm đã co xuống 1600px. Ba hệ toạ độ cho một tính năng phụ.

### `need_region` vẫn phải trả lời tử tế
Máy chủ giữ nguyên quyền trả `need_region` (ảnh nhiều quả, hoặc không thấy quả nào). App **không im lặng** và cũng **không tự đoán quả nào**: nó nói thẳng *"máy chủ chưa chắc bạn hỏi quả nào — lại gần, chụp riêng MỘT quả thôi"*. Một câu người dùng làm theo được ngay, khác hẳn một màn hình đầy hộp mà không rõ phải chạm cái nào.

Khung xem cũng thôi làm `Pressable`: không còn gì để chạm trong đó, và một vùng nuốt cú chạm rồi không làm gì là một vùng làm người ta tưởng app đơ.

### Giữ lại có chủ ý
`LookupRegionInput` ở `fruitLookupService` **vẫn còn**, kèm ghi chú rằng hiện không màn nào gửi. Đó là hợp đồng thật của máy chủ, không phải tính năng bỏ quên — ngày nào có màn cần chỉ đúng quả (cắt ảnh, chọn từ thư viện ảnh nhiều quả) thì đường đã sẵn và đã có bài kiểm.

Còn `prepareImage` (co ảnh xuống dưới 2MB) — vẫn cần, vì camera chụp ở độ phân giải tối đa.

Kiểm: `tsc` sạch · **1.253/1.253 test xanh** (−21, đúng bằng bộ test của mã đã xoá) · eslint 0 lỗi.

## BỎ vòng tự chụp ở màn quét — người dùng bấm nút

### Vì sao bỏ
Bản trước tự bấm máy khi thấy điện thoại đứng yên đủ lâu. Nó làm màn hình khó hiểu và khó gỡ lỗi:

- **Không ai biết máy đang làm gì.** Ảnh tự gửi đi mà người dùng không bấm gì; câu dưới khung đổi liên tục (đang lấy nét → giữ yên → đang gửi → chưa tìm thấy → …). Nhìn vào chỉ thấy màn hình tự nhấp nháy.
- **Không tái hiện được lỗi.** Một lượt hỏng thì không biết tấm nào đã gửi, gửi lúc nào, vì cái gì. Bấm tay thì mỗi lỗi ứng với đúng một cú bấm.
- **Chốt "đứng yên" là một phép đo YẾU.** Nó chỉ đo góc xoay của la bàn, và im lặng tắt hẳn trên máy thiếu từ kế hoặc trên iOS. Một cái chốt lúc có lúc không thì không phải cái chốt.
- **Tốn mạng của người khác.** Vòng lặp gửi ảnh 3G mà người dùng không chủ động yêu cầu lượt nào.

Nay: **một cú bấm = một lượt gửi**. Muốn thử lại thì bấm lại.

### Đã xoá hẳn, không để lại mã chết
`features/traceScan/autoShot.ts` · `autoShot.test.ts` · `useShakeMeter.ts` — xoá. Cùng với chúng là bốn khoá chữ chỉ phục vụ vòng lặp (`scan.state.warmingUp` · `ready` · `moving` · `budget`). Giữ lại một bộ máy quyết-định-khi-nào-chụp mà không ai gọi là để dành một cái bẫy cho người đọc sau.

Còn nguyên vì vẫn dùng thật: `previewBox` (quy hộp máy chủ về khung xem, chạm chọn quả), `prepareImage` (co ảnh xuống dưới 2MB), `ScanBox` (khung trượt mượt).

### Hai chỗ phải sửa theo, không hiển nhiên
1. **`image_unusable` và `empty_scope` nay nói NGAY.** Trước đây hai nhánh này im lặng vài lượt để vòng tự chụp thử tấm khác — tức người dùng nhìn màn hình đứng im trong khi máy đã biết ảnh không dùng được. Bỏ vòng thì im lặng không còn nghĩa gì.
2. **Lệnh chờ 429 phải có HẸN GIỜ tường minh.** Vòng tự chụp vẽ lại màn mỗi 350ms, nên nút chụp "sống lại" đúng lúc một cách tình cờ. Bỏ vòng mà không hẹn giờ thì `blockedUntil` qua hạn vẫn nằm đó và nút chết cho tới khi có việc khác làm màn vẽ lại — người dùng chịu phạt lâu hơn thời gian máy chủ thật sự xin.

Máy chủ vẫn giữ quyền bảo chờ, và nút chụp vẫn tôn trọng lệnh đó — chừa một cửa "bấm tay không tính" là chừa đúng cái cửa người sốt ruột sẽ bấm liên tục.

Kiểm: `tsc` sạch · **1.274/1.274 test xanh** (−20, đúng bằng bộ test của mã đã xoá) · eslint 0 lỗi.

## SỬA: `ReadableStream doesn't exist` — expo âm thầm thay `fetch` của cả app

### Triệu chứng
Chụp quả xong thì nổ `ReferenceError: Property 'ReadableStream' doesn't exist`.

### Đường đi của lỗi (đo trên chính cây `node_modules` này)
1. `metro.config.js` dùng `expo/metro-config` — **bắt buộc**, vì `export:embed` cần serializer của expo. Cấu hình đó khai `getModulesRunBeforeMainModule`, và danh sách trả về gồm **`expo/src/winter/index.ts`**. Tức mã của expo chạy **trước `index.js`**, dù không tệp nào trong `src/` import `expo`. (Kiểm được: `node -e "require('./metro.config.js').serializer.getModulesRunBeforeMainModule({platform:'android'})"`.)
2. `expo/src/winter/runtime.native.ts` **thay `globalThis.fetch`** bằng `expo/fetch`, trừ khi `process.env.EXPO_PUBLIC_USE_RN_FETCH === '1'`. Biến đó ở đây **luôn `undefined`**: nó chỉ được nội-suy lúc dịch bởi `babel-preset-expo`, mà `babel.config.js` cố ý giữ `@react-native/babel-preset` (bare RN). Nhánh thay fetch luôn chạy.
3. `expo/fetch` chuẩn hoá thân yêu cầu ở `winter/fetch/RequestUtils.ts:83`: `if (body instanceof ReadableStream)` — **tham chiếu trần** tới một global Hermes không có. Chính expo ghi trong `runtime.native.ts` rằng "ReadableStream is injected by Metro as a global", nhưng bộ polyfill thật sự nạp ở đây là `@react-native/js-polyfills`, và nó **chỉ có `console` với `error-guard`**.
4. Nhánh đó nằm **TRƯỚC** nhánh `FormData`. Nên đây **không phải lỗi của màn quét**: mọi yêu cầu có thân FormData đi cùng một cửa — đăng ký cây, đăng ký quả, tạo vườn, tải clip, `careService`, `grantService`, `animalReIDService`… **chín tệp service**.

### Vì sao KHÔNG polyfill `ReadableStream` cho xong
Vá được lỗi này thì lộ ra lỗi nặng hơn ngay sau đó. Chính `winter/fetch/convertFormData.ts` ghi ở đầu hàm:

> "`uri` is not supported for React Native's FormData."

Mà **toàn bộ** app đính tệp theo đúng kiểu RN — `{ uri, type, name }`. Cho `expo/fetch` dựng thân multipart nghĩa là nó ghi vào thân một **object** thay vì byte của tấm ảnh: yêu cầu đi được, máy chủ trả 200, **và ảnh thì rỗng**. Hỏng-mà-không-ai-báo, tệ hơn hẳn một ReferenceError nổ thẳng vào mặt.

`fetch` của React Native đẩy `FormData` xuống tầng mạng **native**, nơi `{uri}` được đọc thành tệp thật. Đó là bản mọi service trong repo được viết dựa trên, và là bản đã chạy ngoài thực địa.

### Đã sửa
`src/config/networkFetch.ts`, nạp **dòng đầu tiên** của `index.js` (trước cả crash reporter — nó cũng gọi fetch). Nó trả `fetch` · `Headers` · `Request` · `Response` về bản `whatwg-fetch` mà `Libraries/Core/setUpXHR.js` vẫn cài.

Ba chi tiết có chủ ý:
- **Nhận diện bằng DẤU, không bằng tên hàm.** `expo/winter/installGlobal` đóng `Symbol.for('expo.builtin')` lên mọi global nó cài, và tự khai đó là cách để phát hiện. Tên hàm đổi theo bản; dấu thì là hợp đồng.
- **Không giành quyền quản `fetch`.** Global nào không mang dấu expo thì để yên — bộ giả lập test, công cụ ghi log, hay một bản ai đó cố ý cài đều đi qua bình thường.
- **Thay cả bốn**, không riêng `fetch`: bên trong `whatwg-fetch` có `instanceof Headers`/`Request`. Trộn `fetch` bản này với `Headers` bản kia là dựng bẫy cho người sửa lỗi sau.

Cái giá: mất khả năng đọc thân trả về theo dòng. App không có chỗ nào đọc theo dòng — mọi cửa đều `resp.json()`. Ngày nào cần thật thì `import { fetch } from 'expo/fetch'` ở đúng chỗ đó, **đừng đổi global lại**.

### Bài học
Một gói phụ thay global của cả app, ở một tệp không ai import, qua một móc của bundler. Không có gì trong `src/` chỉ ra điều đó. Đường duy nhất tìm ra là **đọc `getModulesRunBeforeMainModule` thật sự trả về gì**.

Kiểm: `tsc` sạch · **1.294/1.294 test xanh** (+7) · eslint 0 lỗi.

## SỬA: client tra quả viết sai hợp đồng — đọc openapi rồi viết lại

### Triệu chứng và nguyên nhân
Màn quét báo **"Có trục trặc khi tra. Thử lại nhé"**. Câu đó là của app, và nó là **hai lỗi chồng nhau**:

**1. Client viết theo lời kể, không theo hợp đồng.** Đã tra `https://api.orilife.io/openapi.json` (146 đường): `POST /api/fruit/lookup` **có thật và đang sống**, kèm mô tả tự nhận là "nguồn sự thật của hợp đồng — không có tệp .md nào khác mô tả route này". Đối chiếu ra bốn chỗ sai tên:

| client viết | máy chủ thật |
|---|---|
| `detections[]` | **`regions[]`** |
| `fruit_id` | **`pick`** — máy chủ **cố ý không trả id** ("ẩn nội tạng": không điểm, không biên, không id, không chủ) |
| `thumbnail_url` / `image_url` | **`img_urls[]`** (đường tương đối, qua mã có hạn `/api/fruit/lookup/img/{token}`) |
| `provenance` ở gốc thẻ | **`tree.provenance`** |
| `query_id` | **`lookup_id`** |

Hậu quả nặng nhất: bộ đọc **lọc bỏ mọi thẻ thiếu `fruit_id`** — mà máy chủ không bao giờ trả trường đó — nên danh sách ứng viên **luôn rỗng**. Và `openCandidate` đi theo `tree_id` (không tồn tại) nên có chọn được cũng không mở được gì.

**2. Câu lỗi nuốt mất nguyên nhân.** `runLookup` gộp **mọi** nhánh lỗi vào một câu và ném đi `error.detail`. Máy chủ trả `400 {"error_code":"image_unusable"}` cho ảnh mờ — ca **hay gặp nhất** ở đường tự chụp, và có cách xử rõ ràng (lại gần, đủ sáng) — nhưng người dùng chỉ thấy "có trục trặc". Đúng thứ mà cả kho mã này cảnh báo suốt: gộp mấy nguyên nhân khác nhau vào một câu là ném đi thứ người ta cần để làm tiếp.

### Đã sửa
`fruitLookupService` viết lại theo hợp đồng thật. Bảy nhánh kết quả thay cho năm, vì mỗi nhánh dẫn tới một **hành động khác nhau**:
- `candidates` · `need_region` · `empty_scope` (câu trả lời bình thường)
- **`image_unusable`** (400) — vòng tự chụp cứ thử tiếp, đó chính là việc của nó
- **`rate_limited`** (429) — **DỪNG** vòng tự chụp tới hạn máy chủ đưa
- `too_large` · `error` (kèm `detail` thật)

Màn hình nay **hiện câu của máy chủ** khi có (`message`, `verdict_label`, `warning_messages`, `provenance.label`) và chỉ tự soạn khi máy chủ im. Máy chủ biết chuyện gì vừa xảy ra rõ hơn app, và câu của nó đổi theo máy chủ chứ không kẹt ở bản dịch cũ.

**429 vào thẳng `decideShot`** qua `blockedUntil`, không nằm riêng ở màn hình: đó là nơi giữ mọi trần của vòng tự chụp, rải ra chỗ khác là mở đường cho một nhánh quên hỏi — mà quên ở đây nghĩa là app dập đúng cái cửa vừa xin mình chờ. Lệnh chờ **thắng cả trần lượt của app**, **khoá luôn nút bấm tay**, và **không bị "quét lại" xoá** — lệnh là của máy chủ, bấm hai cái không huỷ được nó. `retry_after` đọc **từ thân trước**, rồi mới tới header.

Thêm `sess` (mã phiên client tự sinh) — máy chủ dùng nó cho lớp hạn tần suất chặt nhất. Không gửi thì mọi người rơi chung vào lớp địa chỉ gọi, và ở một quán cà phê dùng chung wifi thì người thứ hai bị khoá vì người thứ nhất. Sinh mới mỗi lần mở app, **không lưu xuống đĩa**: đây không phải danh tính, và một mã theo máy vĩnh viễn đúng là thứ dùng để lần theo người mua.

Đường mở kết quả nay đi theo **`tree.code`** (mã `ORI-…` công khai) → `TraceResultScreen` vốn đã nhận đúng tham số đó; rơi tiếp về `tree.public_url`, rồi `explorer_url`. 422 của FastAPI trả `detail` là **mảng** — nối lại thay vì in `[object Object]` lên mặt người dùng.

### Bài học ghi lại
Bài kiểm bản trước **xanh hết** trong khi client sai gần như mọi tên trường — vì nó chép lại đúng cái hợp đồng tưởng tượng mà client dựng lên. Bài kiểm chỉ chắc bằng nguồn mà nó chép. Lần sau: **đọc `openapi.json` của bản đang chạy TRƯỚC khi viết**, không viết theo lời kể.

### Soi luôn ba bộ API kia — và `boundary_method` cũng sai
Cùng một lỗi (viết theo lời kể) nên đã đối chiếu nốt openapi cho timeline/proof/anchor và farm.

**Timeline · proof · anchor: khớp.** Bốn đường đều có thật. Mô tả proof xác nhận đúng những gì `timelineService` đang làm: 404 gộp "không có" với "riêng-tư" (không lộ tồn-tại event ẩn), `anchor: {tx_hash, explorer_url, status}` chỉ có khi root đã lên chain, và `n`/`index` chỉ cấp cho CHỦ. Anchor thì "neo TRỌN chuỗi", `event_id` ở path chỉ là mốc user bấm chốt.

**Farm: SAI tự vựng.** Máy chủ nhận `boundary_method ∈ {gps_walk, map_draw, mixed}`, **giá trị lạ → `unknown`**. Bản trước gửi `walk`/`manual` theo `drawMode` của màn vẽ ranh ⇒ máy chủ **lặng lẽ ghi `unknown`**, lời khai nguồn-gốc ranh biến mất và VeData chấm độ-tin mảnh vườn như thể chưa ai nói gì. Không 422, không cảnh báo — đúng loại hỏng chỉ đọc hợp đồng mới thấy. Đã đổi sang đúng ba giá trị.

Đồng thời nhận thêm mấy trường **máy chủ tự tính** mà bản trước bỏ qua: `area_sqm`, `perimeter_m`, `boundary_warnings`, và `method_verified` — máy chủ **đo hình dạng ranh rồi chấm lại lời khai `boundary_method`**. Thẻ thông tin vườn nay ưu tiên diện tích của máy chủ (hai bên tự tính ra hai số thì không ai biết tin cái nào) và **hiện ra khi máy chủ nói cách đo chưa được xác nhận** — giấu đi là để một lời khai sai đứng yên trong hồ sơ truy xuất.

Ghi thêm cảnh báo ở `updateFarm`: đổi `boundary_json` mà **không** gửi kèm method thì máy chủ **reset nguồn-gốc ranh về `unknown` và xoá sai số**. Sửa tên vườn kèm ranh là mất sạch lời khai đo đạc, im lặng.

Kiểm: `tsc` sạch · **1.287/1.287 test xanh** (+15) · eslint 0 lỗi.

## Màn quét truy xuất: thêm đường CHỤP QUẢ, và nói thật về mô hình nhận diện

### Mô hình nhận quả nằm ở MÁY CHỦ, không ở máy
Đây là chỗ dễ hiểu ngược nhất, nên ghi trước.

Máy **có** một mô hình trên thiết bị — `yolov26seg.tflite` — nhưng nó là mô hình **một lớp** dùng gác khung có-cây-hay-không cho luồng đăng ký cây, và bị khoá trong phiên chụp của `TreeReIDBridge`. Đầu ra 38 giá trị = 4 hộp + 1 conf + **1 lớp** + 32 hệ số mask (`TreeReIDYolo.kt:38-42`). Đem nó ra nhận QUẢ là khai một điều chưa ai đo.

Bộ nhận quả thật là `POST /api/fruit/lookup`: nó trả `need_region` **kèm `detections`** khi thấy nhiều quả. Đó chính là hộp nhận diện, chỉ ở đầu bên kia dây mạng. Nên **mọi khung xanh trên màn này đều là hộp máy chủ trả về** — không có khung nào được vẽ mà không có phép đo đỡ nó.

### "Ảnh rõ nét, quả sáng sủa" — đo được tới đâu thì gác tới đó
Ba vế của yêu cầu, và sự thật về từng vế:
- **Có quả trong khung** → máy chủ phán (xem trên).
- **Ảnh rõ nét** → `react-native-camera-kit` **không mở khung hình cho JS** (không frame processor), và không thư viện nào trong máy đọc được pixel của tấm JPEG vừa chụp. **Không đo trực tiếp được.**
- **Sáng sủa** → cũng vậy.

Nên `autoShot.ts` gác bằng thứ đo được thật: **máy có đang đứng yên không**. Rung tay là nguồn nhoè áp đảo trên điện thoại; lấy nét tự động lo phần còn lại. Số đo lấy từ `CompassHeadingModule` của chính dự án. Máy thiếu la bàn (hoặc iOS) → `motionDegPerSec` trả **`null`** và chốt đứng-yên **tự tắt** — không bịa một ngưỡng cho một phép đo không tồn tại.

`useShakeMeter` **không** dùng lại `features/wayfind/useHeading`: hook kia làm-mượt α=0,15 để vẽ kim không rung, tức nó vứt đúng thứ ta cần đo. Lọc rung rồi đo rung là đo cái bóng của mình. Và nó trả hàm `read()` chứ không trả state — la bàn bắn ~20 lần/giây, đưa vào `useState` là vẽ lại cả màn có camera ngần ấy lần.

Đo tốc độ xoay lấy **cú giật tệ nhất** trong cửa sổ 700ms, không lấy trung bình: một cú giật vẫn làm nhoè cả tấm, mà trung bình thì làm nó biến mất. Có `angleDelta` vì la bàn quấn vòng — 359°→1° là nhích 2°, trừ thẳng ra 358 và mỗi lần người dùng ngắm về hướng Bắc là máy tưởng họ vừa quay một vòng.

**Trần 6 lượt tự chụp** rồi dừng, mời bấm tay. Vòng tự chụp là vòng lặp gửi ảnh 3G của người khác lên mạng; không có trần thì một cái điện thoại úp mặt bàn cũng tốn hết dung lượng.

### Ảnh phải co lại, và đó là lý do thêm một gói
`camera-kit` chụp ở **độ phân giải tối đa** và không có tham số nào hạ xuống (`ImageCapture.Builder()` chỉ đặt tỉ lệ — `CKCamera.kt:343-351`; `capture()` phía JS không nhận tuỳ chọn). Máy 12MP ra tấm 2,5–5MB ⇒ **phần lớn** máy vượt trần 2MB nếu gửi thẳng. Nên thêm `expo-image-manipulator` (~56.0.23, khớp SDK đang dùng).

`prepareImage.ts` co theo một cái **thang** (1600/0.82 → 1280/0.7 → 1024/0.6) chứ không một lần: ảnh cùng số điểm ảnh nhưng khác nội dung thì nặng khác nhau vài lần — tán lá rậm nén tệ hơn quả trên nền trời. Dừng ngay khi lọt trần. Không hạ dưới bậc cuối: một tấm lọt trần mà máy chủ không đọc nổi **tệ hơn** một tấm bị từ chối, vì nó trả "không tìm thấy quả nào" và người ta tưởng quả mình chưa từng được đăng ký.

Gói là mô-đun native ⇒ `require` trong `try`. Thiếu (chưa dựng lại app) thì vẫn gửi tấm gốc; nếu tấm gốc quá nặng thì trả cờ `noResizer` để màn nói đúng nguyên nhân ("cần cập nhật ứng dụng") thay vì đổ cho người dùng chụp ảnh nặng. **Cần build lại native** trước khi đường co ảnh sống.

### Khung nhận diện trượt mượt
`ScanBox` là **ô sống lâu**, không phải View dựng mới mỗi lượt: dựng mới thì mỗi View sinh ra đúng chỗ nó cần và **không có gì để trượt** — hoạt ảnh biến mất, khung nhấp nháy theo nhịp mạng.

`matchSlots` gán hộp mới vào ô theo **tâm gần nhất**, không theo chỉ số mảng: máy chủ không hứa giữ thứ tự `detections`, và gán theo chỉ số thì hai khung **bay chéo qua nhau** giữa màn hình đúng lúc người ta đang cố chạm vào một quả.

Lần đầu một ô nhận hộp thì **đặt thẳng**, không chạy hoạt ảnh — nếu không nó bay từ góc trên trái (0,0) tới quả, trông như lỗi vẽ.

**QR thì KHÔNG có hộp.** `camera-kit` chỉ trả chuỗi mã, không trả toạ độ (`OnReadCodeData = { codeStringValue, codeFormat }`). Vẽ một hộp "quanh mã" là vẽ một vị trí không đo được — đúng chừng nào người dùng đặt mã vào giữa, sai lặng lẽ mọi lúc khác. Thay vào đó **bốn góc khung thít vào** và đổi màu: nói đúng điều đã biết ("đọc được rồi"), không nói sai điều chưa biết ("mã nằm ở đây").

### `need_region` dùng đúng như nó được thiết kế
Nhiều quả trong ảnh → **dừng vòng tự chụp**, vẽ hộp, mời chạm chọn quả. Chạm xong gửi lại **CHÍNH tấm ảnh đó** kèm `bbox` (đã nới 6% để giữ rìa — cuống, vết sẹo, đường gân là chỗ phân biệt hai quả cùng cây). Chụp tấm mới thì quả đã xê dịch và hộp vừa chạm trỏ vào chỗ khác.

Chạm ra ngoài mọi hộp vẫn dùng được: quy điểm chạm về pixel ảnh rồi tìm hộp chứa nó. Ngón tay to hơn khung, bắt chạm cho trúng là bắt người ta chơi trò bấm nút.

### Giao diện
Nền **sáng** (bản trước nền đen) — người mua mở màn này giữa chợ hoặc trong bếp, nền đen giữa ban ngày là nền chói nhất có thể chọn. Khung xem **vuông, giữa màn**. Thêm nút **đèn** và **ảnh có sẵn**; nút chụp tay ở giữa. Biểu tượng lấy từ bộ Iconify riêng của dự án (`components/Icon`, thêm `lightbulb` · `bolt-lightning` · `crosshairs`), bỏ `react-native-vector-icons`.

Chữ đi qua khoá `scan.*` (28 khoá × 4 thứ tiếng) thay cho chuỗi tiếng Việt viết thẳng trong mã.

Bộ chọn ứng viên **không có dấu tích xanh** cho quả điểm cao nhất — máy soi quả nhận nhầm 73% cặp quả khác nhau cùng một cây. Mỗi hàng nói trước nó sẽ đưa đi đâu (hồ sơ xuất xứ / bằng chứng trên chuỗi), và trạng thái neo có **ba** giá trị: máy chủ không nói thì hiện "chưa rõ", không hiện "chưa lên chuỗi".

**Không xin quyền vị trí, không gửi toạ độ.** Người mua chụp quả trong bếp nhà mình.

Kiểm: `tsc` sạch · **1.272/1.272 test xanh** (+49) · eslint 0 lỗi trên các tệp mới.

## Bốn API mới, và mục Vườn tách làm hai thẻ

### `POST /api/fruit/lookup` — người mua hỏi, không cần tài khoản
`fruitLookupService.ts` là tệp RIÊNG, không nhét vào `fruitReIDService`, vì tệp kia ký DID ở **mọi** lượt gọi. Người mua vừa bổ quả ra ăn thì không có DID nào cả — bắt họ đăng nhập là khoá cửa ngay trước mặt đúng người cửa này sinh ra để phục vụ.

Bốn chỗ làm khác thói quen:
- **Không có tham số nào nhận toạ độ.** Không phải "mặc định tắt" — là không có đường vào. Chụp quả trong bếp nhà mình mà app lặng lẽ đính toạ độ bếp vào một yêu cầu không đăng nhập thì đó là theo dõi.
- **Cân ảnh trước khi gửi** (trần 2MB). Để máy chủ từ chối thì người dùng đã ngồi hết một lượt tải 2G. Cân KHÔNG được (`content://`, thiếu expo-file-system) thì **vẫn gửi** — chặn oan một tấm ảnh hợp lệ tệ hơn nhận một 413.
- **`need_region` là câu trả lời**, không phải lỗi. Nhiều quả trong ảnh thì máy chủ mời khoanh vùng, và nó được xét **trước** danh sách ứng viên — trả ứng viên ở ca đó là bày danh sách của quả nào đó trong ảnh mà người mua tưởng là quả mình hỏi.
- **Cắt lại 5 ứng viên** ở phía app. Máy soi quả nhận nhầm 73% cặp quả khác nhau cùng cây, nên câu trả lời cuối phải do mắt người đưa ra — và một cuộn dài tám ảnh thì người ta chọn bừa.

`explorer_url` do máy chủ gửi mà đi thẳng vào `Linking.openURL`, nên qua `safeExplorerUrl()`: chỉ `http`/`https`. Không lọc thì một trường JSON đẩy được `javascript:` vào tay người dùng.

`anchored=false` KHÔNG phải "quả giả" — là chưa lên chuỗi, có thể đang chờ gộp lô. `isAnchored()` trả **ba** giá trị vì "chưa biết" không phải "chưa neo".

### Proof + anchor cho dòng thời gian
`timelineService` nay có `fetchEventProof` và `anchorEvent`.

App **không tự kiểm lại được** cây Merkle: `leaf_hash` do chính máy chủ băm, còn app không giữ nội dung gốc dưới dạng chuẩn hoá byte-cho-byte. Thứ kiểm được độc lập là `tx_hash` trên trình duyệt chuỗi — nên `explorer_url` mới là nút quan trọng nhất của màn bằng chứng, không phải bảng băm dài.

Neo là việc **tốn tiền và không hoàn tác**: mỗi lượt là một giao dịch. Không gọi tự động sau khi ghi sự kiện, không thử lại trong vòng lặp — một lượt hỏng giữa chừng có thể ĐÃ vào hàng đợi. 409 "đã neo rồi" trả về nhánh **thành công** kèm cờ: với người dùng đó là việc đã xong, không phải chữ đỏ.

### Ranh vườn: ba trường đi cùng nhau
`boundary` (các điểm nối) nay đi kèm `boundary_method` và `boundary_acc_m`. Vẽ vùng vườn mà bỏ hai trường này là **vẽ một đường sắc nét cho một số liệu mờ** — ranh chấm tay và ranh đi bộ đo GPS lệch nhau cả chục mét mà trên bản đồ trông y hệt.

Màn tạo vườn nay gửi cả hai. Sai số lấy **con tệ nhất trong cả vòng đi**, không phải lần đọc cuối: người ta hay dừng ở chỗ thoáng để bấm Lưu, nên lần đọc cuối là lần đẹp nhất buổi — lấy nó là khai thấp đi đúng chỗ nó tệ nhất, dưới tán cây. Ranh chấm tay gửi `null`, **không gửi 0**: 0 là lời khai "chính xác tuyệt đối".

Đường thử-lại-khi-401 lúc trước gửi thiếu hai trường này — vườn nào tạo trúng lúc token hết hạn sẽ mất metadata, im lặng và không lấy lại được. Đã vá.

### Mục Vườn ở trang Tổng quan: hai thẻ
**Vườn của tôi** (ba con số, như cũ) · **Bản đồ**. Cùng một mục nhưng hai câu hỏi: "tôi có bao nhiêu" và "chúng nằm ở đâu". Nhồi cả hai vào một khung dọc thì bản đồ đẩy thời tiết và giá xuống dưới nếp gấp.

Mặc định mở thẻ DANH SÁCH. Bản đồ tốn một bề mặt OpenGL và một loạt lượt tải ô ảnh — mở nó cho mọi người ở mọi lần vào app là bắt máy yếu và gói 3G trả giá cho thứ thỉnh thoảng mới cần.

Bản đồ (`components/FarmsMap.tsx` + `utils/farmMapGeo.ts`, nền OSM, đổi được sang vệ tinh):
- **Ghim là `MarkerView`, không phải `SymbolLayer`.** SymbolLayer vẽ chữ bằng glyph, mà style ở đây là raster thuần nên **không có nguồn glyph** — `textField` ra rỗng và ta được một hàng chấm không tên. Vườn của một người đếm bằng đầu ngón tay, chi phí MarkerView chấp nhận được.
- **Vùng vườn chỉ hiện từ zoom 13.** Ở mức nhìn cả tỉnh, mảnh vườn 2 ha nhỏ hơn đầu ghim — vẽ ra chỉ là một chấm màu thứ hai chồng lên ghim.
- **Ranh dưới 3 điểm không thành vùng.** Hai điểm là một đoạn thẳng; ép thành đa giác là bịa ra mảnh đất chưa ai đo.
- **Kéo một ngón chỉ bật khi toàn màn hình.** Thẻ gọn nằm trong trang cuộn dọc: kéo bản đồ và cuộn trang là cùng một cử chỉ, ai thắng cũng sai với một nửa số lần. Chụm hai ngón không đụng gì tới cuộn, nên phóng-to-thấy-ranh vẫn chạy ở thẻ gọn.
- **Tìm vườn bỏ dấu** — gõ "vuon ba tu" ra "Vườn Bà Tư". Không dùng `String.normalize('NFD')`: Hermes chỉ có nó khi bản dựng bật ICU, thiếu thì ô tìm kiếm ngừng khớp chữ có dấu mà không ai thấy lỗi. Dùng bảng tra.
- Thiếu số liệu thì hiện **"—", không hiện 0**: vườn đọc từ cache lúc mất mạng không mang số đếm của máy chủ, mà "0 cây" đọc ra là dữ liệu đã bay mất.
- Dòng ghi nguồn OpenStreetMap là nghĩa vụ giấy phép ODbL, không phải trang trí — nên mép dưới xếp thành **một cột chồng** thay vì mấy lớp cùng neo vào đáy (neo riêng thì thẻ thông tin đè lên nó).

Trang Tổng quan nay nạp **cache trước, máy chủ sau, và KHÔNG nạp lại cache**: bảng `farms` trong SQLite chỉ có bốn cột, nạp lại là ném đi đúng tâm vườn và số cây vừa lấy về.

Kiểm: `tsc` sạch · **1.223/1.223 test xanh** (+60) · eslint 0 lỗi mới trên các tệp đụng tới.

## Tổng quan: vườn thu gọn · giá nông sản · thời tiết theo giờ · luật cảnh báo

### Mục vườn thu gọn
Lưới hai hàng → **một hàng ba ô**, số từ 34 xuống 24, icon nhỏ 12 px cạnh nhãn thay cho ô icon to. Ba con số này là thứ **liếc qua**, không phải thứ đọc kỹ — chiếm hơn một phần ba màn hình cho chúng là lấy mất chỗ của thời tiết và giá, hai thứ người ta mở app để xem.

### Thời tiết đổi theo giờ
`wxPalette(isDaytime())` — 6h–18h dùng tông sáng của trang, ngoài giờ đó dùng thẻ tối. Ban đêm mà thẻ trắng thì mở app lúc 4 giờ sáng đi thăm vườn là chói mắt; giữa trưa mà thẻ tối thì đó là chỗ khó đọc nhất trên màn. Tính lại mỗi lượt vẽ, không nhớ — mở lúc 17h55 rồi quay lại 18h05 phải thấy đã đổi.

### Giá nông sản — và sự thật về nguồn
**Không có API miễn phí chính thức nào của Việt Nam cho giá nông sản.** Đã dò: `nongsan.mard.gov.vn` không phân giải được tên miền; dịch vụ có dữ liệu đàng hoàng đều thu phí. Thứ lấy được là **trang web công khai**, và đọc giá từ trang web thì mong manh.

Nên `agriPriceService` viết ngược với thói quen thường gặp:
- không khớp đúng khuôn đã biết → **trả `null`**, không đoán, không lấy đại con số đầu tiên trong trang;
- **chặn khoảng hợp lệ** — 9 đ/kg hay 95 triệu đ/kg là đọc sai, vẫn `null`;
- `"95,300"` và `"95.300"` đều là chín-lăm-nghìn-ba-trăm (bẫy `parseFloat` ra 95,3).

Một con số giá SAI tệ hơn hẳn ô trống: nhà vườn bán hay giữ hàng theo chính con số đó.

Biến động so với **lần đọc trước** lưu trong máy, vì trang không có lịch sử — và màn nói rõ điều đó thay vì để người đọc tưởng là so với hôm qua. Lần đầu chạy hiện dấu gạch, **không** hiện mũi tên 0%.

> Sầu riêng — mặt hàng chính của app — **chưa có nguồn miễn phí nào** đăng giá theo ngày dưới dạng máy đọc được. Bảng nguồn để thêm một dòng là xong khi tìm được.

### Luật cảnh báo — có, nhưng chưa gửi đi được
`alertRules.ts` (16 bài kiểm): giá đổi **≥5%** thì đáng cắt ngang; dưới mức đó là dao động thường ngày.

Tin thì **không chấm điểm tiêu đề theo từ khoá** — đó là gán ý nghĩa cho thứ không đo được. Thứ đo được là **sự trùng hợp**: ≥3 **nguồn khác nhau** cùng viết một chuyện trong 6 giờ. Một báo đăng là một bài báo; bốn báo cùng đăng là một chuyện đang xảy ra. Có bài kiểm cho đúng bẫy "một trang đăng lại chính nó ba lần".

Kèm `dropRecent` — cùng một cảnh báo không lặp trong 12 giờ, nếu không người dùng tắt hết thông báo trong hai ngày.

**CHƯA gửi được về điện thoại.** App chỉ có `@react-native-firebase/messaging` (nhận push từ máy chủ), **không có thư viện hiện thông báo cục bộ** — `grep` cả `src/` không ra `notifee`/`displayNotification`. Cần một trong hai: cài `@notifee/react-native` rồi dựng lại app, hoặc để máy chủ đẩy push. Phần quyết định đã xong và kiểm được; chỉ thiếu đường ra.

Kiểm: `tsc` sạch · **848/848 test xanh** (+28) · eslint 0 trên các tệp mới.

# AI_LOG

> Nhật ký thay đổi do AI thực hiện. **Đọc file này TRƯỚC khi làm việc** thay vì quét cả project.
> Mỗi mục: ngắn gọn — làm gì / file liên quan / cách dùng. Mục mới thêm lên đầu.

---

## Quay video giờ đẻ ra một QUẢ thật, không chỉ còn cái mã lưu trữ

### Vì sao phải chụp thêm một tấm ảnh
`POST /api/fruit/enroll` — đường **duy nhất** tạo được bản ghi quả — đòi một **ảnh tĩnh** kèm vùng khoanh. Còn `fruit_video` chỉ đếm quả trên khung hình, không enroll (câu này ghi sẵn ở đầu `fruitVideoService.ts`). Máy chủ cũng không mở đường tạo quả từ keyframe của clip, và dự án chưa có thư viện nào cắt khung hình từ video. Nên tấm ảnh phải do người dùng bấm — **một chạm**.

### Vùng khoanh lấy từ đâu
Gửi tấm ảnh qua `POST /api/fruit/detect` để **chính máy chủ** chỉ ra quả nằm đâu, rồi enroll bằng ô **lớn nhất** nó tìm được. Máy chủ không thấy gì thì lùi về ô vuông giữa khung (60% cạnh ngắn) — đúng chỗ màn đã dặn đặt quả vào. Khoanh cả khung là nhét luôn lá và nền vào chữ ký nhận dạng của quả.

### Thứ tự gửi có chủ ý: CLIP trước, QUẢ sau
Clip là bằng chứng gốc, phải vào LampNet trước. Tạo quả hỏng thì clip vẫn còn nguyên và màn **nói rõ** còn thiếu bước nào. Làm ngược lại thì hỏng ở clip sẽ để lại **một quả mồ côi không có bằng chứng**.

Nhánh mạng yếu (clip nằm lại hàng đợi) **vẫn thử tạo quả**: clip kẹt có thể chỉ vì LampNet chưa nhận byte, mà `enroll` là đường khác hẳn. Và chỉ dọn màn khi quả đã tạo xong — còn thiếu quả mà xoá sạch ảnh với tên là bắt người ta chụp lại từ đầu.

Trùng quả **không chặn** ở đây (`allowDup`): người dùng đang giữa vườn, vừa quay xong; dựng cổng hỏi-trùng tại đó là bắt họ phán xử giữa nắng. VeData gộp sau — mất một bản ghi tệ hơn có một bản thừa.

### Màn quay nay bốn chặng
`Quay → Ảnh quả → Đặt tên → Chọn cây`. Nút Gửi vẫn nói thẳng cái đang thiếu ("Chụp ảnh quả trước đã" / "Đặt tên cho quả trước đã"), nên hộp thoại chặn "Hãy chọn cây" của bản cũ không còn ai bấm tới — đã gỡ. Ảnh bìa + tên quả nằm trong bản nháp cùng clip, app bị ngắt giữa chừng vẫn dựng lại đủ.

Xong việc, màn kết quả hiện thẳng **"Đã lưu thành quả «tên»"** cạnh mã lưu trữ. Quay về trang Quả trên cây là thấy quả đó (`useFocusEffect` nạp lại).

Kiểm: `tsc` sạch · **669/669 test xanh** · eslint `FruitVideoScreen` 0 lỗi.

## Bốn màn QUẢ · một cửa thêm quả · hai thứ đi tìm lại

### `FruitVideoScreen` — viết lại, bố cục thành BA CHẶNG
Bản cũ đổ tất cả xuống một trang cuộn: khung quay, chọn cây, ghi chú, nút Gửi — ngang hàng nhau, không cái nào nói cho biết còn thiếu gì. Người dùng quay xong, bấm Gửi, **rồi mới** bị hộp thoại chặn "Hãy chọn cây".

Nay có **vạch ba chặng** (quay → chọn cây → gửi) tự sáng theo việc đã làm, và nút Gửi **nói thẳng cái đang thiếu** ("Quay clip trước đã" / "Chọn cây trước đã") thay vì để người ta bấm rồi mới báo. Cả hai đọc từ cùng một biến `stage` nên không bao giờ nói lệch nhau. Danh sách cây quá 6 cây thì tự hiện ô tìm theo tên.

### `FruitListScreen` — ba con số thống kê nay BẤM ĐƯỢC
Câu hỏi thật của nhà vườn luôn là "quả nào **còn trên cây**" hay "đã hái bao nhiêu rồi". Ba con số cũ nằm im ở đầu màn; nay chính là **bộ lọc**, số trên chip và số quả trong danh sách cùng một nguồn nên luôn khớp. Lọc ra rỗng nói khác "cây chưa có quả nào".

Bảng `STATUS_VI`/`ZONE_VI` tên là "VI" mà ruột là tiếng Anh (`On Tree`, `Harvested`, `Base`, `Canopy`) — nhà vườn đọc màn tiếng Việt gặp bốn chữ tiếng Anh. Đã sang khoá. Nút nổi bỏ `FAB` của react-native-paper (tròn đều + bóng Material, lạc giữa các thẻ bo góc lệch).

### `FruitCropperScreen` · `FruitPlace3DScreen`
Hai tấm "Đây là quả nào?" và "Quả mới" sang tông đất + khoá chữ. **Bước khoanh vùng và khung 3D giữ nền tối** — chúng đặt trên ảnh thật / cảnh 3D thật, đổi sang nền sáng là vòng khoanh chìm vào ảnh và mô hình cây mất luôn độ đọc. Bỏ chữ kỹ sư viết cho chính mình: `SET FRUIT LOCATION · STEP 1/3`, `Next Front`, `lock X`.

### Một cửa thêm quả
Màn chi tiết cây có **hai nút cùng nói "thêm quả" mà chạy hai cơ chế khác hẳn**:

| nút | đường đi | kết quả |
|---|---|---|
| Thêm quả | FruitList → Cropper → `POST /api/fruit/enroll` | **tạo một bản ghi quả** — có tên, có ảnh góc, hiện trong danh sách |
| Video quả | `POST /api/tree/{id}/fruit_video` | chỉ **đếm** quả trên khung hình — *không enroll, không đụng gallery* |

Dòng thứ hai là câu ghi sẵn ở đầu `fruitVideoService.ts`. **Đó chính là lý do quay video xong danh sách quả vẫn rỗng, chỉ thấy mã lưu trữ ở "Video đã lưu"** — không phải lỗi, mà là hợp đồng của máy chủ.

Nay còn một cửa: "Thêm quả" mở trang Quả trên cây, và chính trang đó cho chọn **chụp ảnh · thư viện · quay video**, trong đó lối video ghi thẳng nó làm gì. Bỏ luôn nút "Chụp lại" cạnh sơ đồ 3D (lối chụp thứ ba cho cùng mục đích).

### Mô tả cây: không mất, chỉ bị chôn và im lặng
`git log -S "cành"` chỉ ra commit `2b6b37f` gỡ scanner YOLO trên máy — nhưng khối chữ này **không lấy số liệu từ đó**. Nó lấy từ `features_vi` của `/api/tree_views?describe=1`, và **vẫn còn nguyên trong mã**. Nó không hiện vì hai lẽ:

1. Nó nằm ở **cuối dải ảnh cây** — phải cuộn hết ảnh mới thấy. Mô tả *cây* thì thuộc về cây, không thuộc dải ảnh.
2. Nó gác sau `treeFeatures.length > 0`. Máy chủ cũ (trước bản `b38496f`) bỏ qua tham số `describe` → mảng rỗng → **khối biến mất không một lời nào**.

Đã đưa lên ngay dưới hàng số liệu của cây, và khi cây đã có ảnh mà máy chủ vẫn chưa trả mô tả thì **nói ra một câu** thay vì biến mất lặng lẽ.

Kiểm: `tsc` sạch · **669/669 test xanh** · eslint 4 màn quả còn 3 lỗi (đều là `react-hooks/exhaustive-deps` có sẵn).

> **Còn lại:** hộp thoại `Alert.alert` trong 4 màn quả vẫn giữ chuỗi tiếng Việt — phần nhìn thấy trên màn đã 100% qua khoá, phần hộp thoại thì chưa.

## Bóng nhẹ hẳn · chỗ cắm ảnh nền · nốt ba màn còn lại

### Bóng: một công thức cho cả module, nhạt hơn nhiều
Bóng "hiện đại" không phải bóng ĐẬM mà là bóng **khó thấy**: loang rộng gấp 4–6 lần độ dời, độ đục dưới 0,07. Mắt không đọc ra "cái bóng", chỉ đọc ra "thẻ này nổi lên một chút". Thang mới trong `theme/depth.ts`:

| bậc | trước | nay |
|---|---|---|
| `card` | dời 3 · loang 12 · đục **0,08** · elev 3 | dời 2 · loang 14 · đục **0,05** · elev 1 |
| `cardStrong` | dời 8 · loang 22 · đục **0,12** · elev 7 | dời 4 · loang 20 · đục **0,07** · elev 3 |
| `sheet` | đục 0,18 · elev 12 | đục 0,10 · elev 8 |
| `modal` | đục 0,24 · elev 20 | đục 0,16 · elev 16 |

Thẻ ở trang Tổng quan đi qua đúng thang này nên nhẹ theo, không phải sửa riêng.

Quét luôn **21 chỗ bóng viết tay** rải trong module về ba bậc token — phần lớn là bóng kiểu cũ (dời 6 · đục 0,3 · loang 8) và **bóng màu xanh dưới nút Lưu**, thứ nhìn ra ngay là giao diện đời trước. Nay `grep shadowRadius` ngoài `theme/depth.ts` ra **0 dòng**: sửa bóng một chỗ là đổi khắp module.

### Ảnh nền: chỗ cắm sẵn, chưa có ảnh thì vùng xanh nhạt
Thêm `theme/backdrops.ts` — một bảng duy nhất, ba dòng `null` kèm sẵn dòng `require(...)` viết sẵn ngay cạnh. Bỏ ảnh vào `assets/images/trace/`, thay `null` bằng dòng đó là xong, **không đụng màn nào**. Chưa cắm thì `GroundBackdrop` vẽ **vùng xanh nhạt** (hai lớp ellipse chồng cho mép tan dần) — không ô trống, không khung vỡ.

Ảnh nào cắm vào cũng bị hạ độ đục xuống `PHOTO_OPACITY` (0,18) và phủ một lớp kem ở mép dưới: ảnh vườn có chỗ nắng chói và chỗ bóng gần đen nằm sát nhau, chữ đen đè lên vùng tối là **mất hẳn** khi đọc ngoài trời. Nền chỉ cần gợi ra khu vườn.

### Ba màn còn lại
`ActivityScreen` · `TreeMetadataTab` · `TreeDetailScreen` — đổi mặt nền, thẻ, ô bấm, nút, hộp thoại sang token hữu cơ; bỏ hết nhãn IN HOA cỡ nhỏ; **chữ hiện trên màn giờ 100% đi qua khoá** (kể cả câu báo lỗi và hộp thoại).

Hai thứ đáng nói tìm thấy khi làm:

- **Vạch tiến độ lúc lưu đối chiếu bằng chuỗi.** Bốn bước ("mã hoá" → "băm nhỏ" → "phát tán" → "cập nhật") được dò bằng cách xem câu trạng thái đang hiện *có chứa từ khoá đó không* — mà cả hai đầu của phép so đều nằm trong chính tệp ấy. Sửa một dấu câu là vạch tiến độ đứng yên suốt quá trình lưu, **không báo lỗi gì**. Nay đếm số bước thẳng.
- **Cấu hình chết trong `ActivityScreen`.** Bốn muc `scannerTitle` + `scannerSteps` (chữ cho màn quét từng bước) không nơi nào đọc — màn quét đó bỏ từ Build 54. Đã gỡ.

`AddFarmMode` trong `FarmDetailScreen` vẫn **cố ý giữ nguyên** như lượt trước: màn bản đồ toàn khung, kéo đỉnh ranh giới, ghi GPS theo bước chân. 71 chuỗi tiếng Việt còn lại của module nằm gần hết ở đó.

Kiểm: `tsc` sạch · **669/669 test xanh** · eslint `src/modules/trace` giữ **45**.

## Màn Dẫn đường: ba chế độ — kim vườn → mặt phẳng tìm cây → kim cây

### Tới nơi thì kim hết việc
Ở khoảng cách 0, góc phương-vị chỉ còn là nhiễu GPS — kim quay vòng vòng và **nói dối rằng nó biết hướng**. Nên khi tới vườn, màn đổi hẳn sang **mặt phẳng tìm cây** bán kính 20 m.

- **Phủ toàn màn**, không cắt thành đĩa tròn: đĩa tròn cắt mất bốn góc màn mà chẳng đổi lấy gì, trong khi cây ở góc màn vẫn là cây thật.
- **Không có tia quét.** Tia quét trong radar thật có nghĩa — nó là ăng-ten đang quay, chấm chỉ sáng khi tia đi qua. Ở đây không có gì quay cả; vẽ tia quét là bịa ra một cơ chế không tồn tại.
- **Hướng máy quay lên**: chấm bên trái màn = cây bên trái NGƯỜI. Bắc-quay-lên bắt người dùng tự xoay bản đồ trong đầu — giữa vườn, tay bẩn, nắng chói, không ai làm đúng phép xoay đó.
- **Vùng vườn**: đa-giác nối các điểm ranh giới đã ghi. Nó trả lời câu mà chấm cây không trả lời được: *"tôi đang đứng TRONG vườn hay còn ngoài bờ?"* — giữa vườn sầu riêng ranh giới không có hàng rào. Vẽ ĐỦ mọi đỉnh kể cả đỉnh ngoài tầm nhìn, vì đỉnh xa vẫn định hình cạnh đi ngang qua tầm nhìn.

### Cụm cây, không phải một danh sách phẳng
Chấm dở đúng một việc: hai cây cách nhau một mét thì hai chấm chồng lên nhau, không chọn được. Nên có thêm tấm dưới chia theo **tầm với** — không phải số tròn cho đẹp: ≤5 m là đứng đó chạm được thân, ≤12 m là còn nhìn rõ giữa tán.

### Kim cây dùng CHÍNH component của kim vườn
Góc trên bên phải, rộng đúng 1/3 màn. Chép thành hai bản là mở đường cho hai kim quay khác nhau trên cùng một màn — thứ người dùng đọc ra ngay là "cái nào đúng?".

### Một lỗi suýt lọt
Đặt tên tệp component là `Needle.tsx` cạnh `needle.ts` (phép tính). Windows và macOS **không phân biệt hoa-thường** → `import` lấy nhầm module. Đã đổi thành `CompassNeedle.tsx`.

Kiểm: `tsc` sạch · **802/802 test xanh** (+26 test phép chiếu) · eslint **0** trên toàn `features/wayfind/`.

## Màn Dẫn đường: kính mờ, kim có quán tính, neo một điểm thay vì tính liên tục

### Cái gì khoá, cái gì không
**ĐÍCH khoá**: toạ độ vườn/cây chốt một lần, không bao giờ tính lại. Kim có đúng một nhiệm vụ — luôn chỉ về cái đích đó.

**CHỖ ĐANG ĐỨNG không khoá**, vì góc từ chỗ đứng tới đích đổi theo từng bước chân. Đóng băng chỗ đứng là kim chỉ theo một góc CŨ: đi chệch mười mét là nó chỉ trượt qua đích mà nhìn màn không có gì báo.

Thứ gây giật không phải việc tính lại, mà là **nhiễu**: GPS lắc vài mét mỗi giây, ở cự ly 20 m thì vài mét đó xoay góc phương-vị hàng chục độ. Nên chỗ đứng đi qua bộ lọc (`smoothPosition`) rồi mới tính góc — kim luôn chỉ đúng đích mà thôi rung. Nhảy xa hơn 25 m thì nhận thẳng, không bò theo.

### Kim có khối lượng
`Animated.spring` ma sát thấp → kim vượt qua đích rồi lắc về hai ba nhịp, đúng dáng kim la bàn thật. Hai chỗ dễ sai tách sang `features/wayfind/needle.ts` **có bài kiểm** (20 test):
- **Vòng ngắn** — 350° → 10° phải là **+20**, không phải −340. Gán thẳng góc là kim quay ngược gần trọn vòng.
- **Lọc nhiễu theo vòng tròn** — trung bình của 350 và 10 phải ra **0**, không phải 180.

Tới nơi thì kim **thôi quay** (ở khoảng cách 0, góc phương-vị chỉ còn là nhiễu thuần tuý) và máy **rung ba nhịp ngắn**, đúng một lần mỗi lần tới.

### La bàn: nối thật, bằng chính mã la bàn đã có

Kim đứng im khi xoay máy vì app **không có đường nào lấy hướng** — `useHeading` dò không ra mô-đun nào nên luôn lùi về hướng-đi GPS, mà đứng yên thì hướng-đi là `null`.

Phần đọc cảm biến thì **đã có sẵn và đã chỉnh kỹ**: `HeadingSensorReader.kt` (Android, TYPE_ROTATION_VECTOR, α=0,15) và `HeadingCaptureManager.swift` (iOS). Nhưng chúng **bị khoá trong phiên chụp ảnh cây**: `startSession` vừa bật cảm biến vừa **mở camera**.

Nên bản này **không viết lại phép đọc cảm biến**, chỉ bọc thêm vòng đời bật/tắt độc lập với camera:
- `android/.../compass/CompassHeadingModule.kt` — dùng chính `HeadingSensorReader`
- `ios/.../Core/Compass/CompassHeadingModule.swift` — `CLLocationManager` thuần phần la bàn, lấy **trueHeading** (đã bù độ lệch từ thiên; lấy nhầm hướng từ là kim lệch đều vài độ ở mọi chỗ)

Tên module + tên sự kiện đặt **trùng `react-native-compass-heading`** — sau này thay bằng thư viện thì phía JS không đụng dòng nào.

> **Cần dựng lại app** (thêm mã native). Chưa dựng lại thì kim vẫn đứng im — không phải lỗi mã JS.

### Chỗ cắm cũ (đã thay bằng bản thật ở trên)
`package.json` không có thư viện la bàn nào; `TreeReIDBridge.getCurrentHeading` chỉ sống trong phiên chụp ảnh cây và chỉ có trên iOS. `features/wayfind/useHeading.ts` **dò mô-đun lúc chạy**: có thì dùng la bàn thật (đúng cả khi đứng yên), chưa có thì lùi về hướng-đi GPS (chỉ đúng khi đang đi). Màn **nói rõ đang dùng nguồn nào** — chỉ sai hướng giữa vườn tệ hơn nhiều so với thú nhận chưa biết.

> Cài `react-native-compass-heading` + dựng lại app là kim quay khi đứng yên. **Không phải sửa màn**, chỉ sửa `useHeading.ts`.

### Kính mờ mà không cần thư viện làm mờ
`BlurView` cần mô-đun native chưa cài. Mặt kính dựng bằng ba lớp trong suốt chồng nhau + vệt sáng lệch tâm + vành khắc 12 vạch (SVG) — nhìn gần như không khác vì nền phía sau vốn đã mờ.

### Không gian khoá thứ hai: `map.`
36 khoá `map.*` theo đúng dạng anh đặt (`map.openmap`). Bài kiểm khoá nới cho hai không gian tên và cho khoá **hai tầng** lẫn ba tầng.

Kiểm: `tsc` sạch · **771/771 test xanh** (+20 test kim) · eslint sạch trên các tệp mới · 0 chuỗi tiếng Việt còn sót trong màn.

## FarmList dựng lại trọn vẹn · FarmDetail đổi vỏ — cả hai theo Organic + khoá chữ

### `FarmListScreen` — viết lại từ đầu (722 → 330 dòng)
Thẻ vườn nay là thẻ nổi trên nền đất, **góc bo không đều**, có lá mờ ở góc, và chỉ ba con số nhà vườn thật sự hỏi: **cây · quả · rộng bao nhiêu**.

**Bốn thứ bỏ đi:**
- **Huy hiệu MAGIC** cạnh tiêu đề — số dư tiền mã hoá đặt cạnh tên vườn. Người mở màn "Trang trại" đang tìm mảnh vườn, không tìm ví.
- **Nút chuyển trang** « ‹ 1/3 › » → tự hiện thêm khi cuộn tới cuối, cùng lối với mục tin. Nông dân không đếm trang.
- **Chữ IN HOA** "TRUY XUẤT NGUỒN GỐC".
- **Tiếng Anh lẫn trong giao diện tiếng Việt**: `farm under management` · `No farms yet` · `Points`.

Sửa luôn một lỗi hoạt-ảnh: trễ hiện thẻ nhân theo vị trí (`index * 80`) nên **mục thứ 30 phải đợi 2,4 giây** mới hiện — người dùng đọc thành "màn bị treo". Nay chặn trần ở 6 mục.

### `FarmDetailScreen` — đổi vỏ, giữ ruột (3.015 dòng)
Đổi **mặt nền · thẻ cây · bảng thống kê · nút quay lại · tiêu đề mục** sang token hữu cơ (góc lệch, bóng nâu, viền đất), và chuyển các chuỗi hiện trên màn sang khoá.

**CỐ Ý không đụng `AddFarmMode`** (~600 dòng): đó là màn bản đồ toàn khung có kéo đỉnh ranh giới, ghi GPS theo bước chân, cảnh báo tự cắt. Đổi bố cục ở đó mà không chạy thử ngoài thực địa là đánh cược với dữ liệu ranh giới vườn — thứ người dùng phải đi bộ vòng quanh mới có được.

### Nếp đặt khoá nới ra, theo đúng thứ vừa dùng
Bài kiểm chặn khoá lạ nay cho **camelCase ở cả nhóm lẫn tên** (`trace.farmList.title`) và **chữ số trong tên** (`trace.label.has3d`) — hai thứ bản đầu cấm oan. Vẫn cấm chữ HOA dẫn đầu và dấu gạch: khoá là thứ đọc bằng mắt trong mã nguồn.

Kiểm: `tsc` sạch · **669/669 test xanh** · eslint `src/modules/trace` **54 → 44** (bớt 10 so với trước khi bắt đầu loạt này).

> **Còn lại:** `TreeDetail` · `Activity` · `TreeMetadataTab` mới có nền/thẻ hữu cơ, chưa dựng lại bố cục và chưa chuyển chuỗi sang khoá. `AddFarmMode` giữ nguyên như nói ở trên.

## Module Truy xuất đổi sang Organic / Nature UI · tin tự tải thêm · chữ theo KHOÁ

Ba việc trong một lượt. Hai việc đầu là thị giác, việc thứ ba đổi cách viết chuỗi trong toàn app về sau.

### 1. Phong cách Organic / Nature — `theme/depth.ts` + `components/layered/Organic.tsx`
Giữ nguyên thang chiều sâu đã dựng (L0 nền → L2 thẻ → L3 tấm trượt → L4 hộp thoại), thay thứ **trông thấy được**:

| Trước | Sau |
|---|---|
| xanh dương thương hiệu `#3B6EA8` | **lá non `#4A7C3F`** + tông đất |
| nền `#F1F4EF` phẳng | **đất phù sa `#F5F1E8`** + mảng loang & lá mờ phía sau |
| thẻ trắng tinh, bo đều 20 | **trắng ngà `#FDFCF8`**, bo **KHÔNG ĐỀU** (26/20/26/20) |
| bóng đen | bóng **ngả nâu** — bóng đen trên nền kem trông như vết bẩn |

**Vì sao bo góc lệch:** bo đều bốn góc cho ra hình do *máy* vẽ. Trong tự nhiên không có gì đối xứng tuyệt đối — lá, đá cuội, vũng nước đều lệch. Lệch 4–10 px là đủ để mắt đọc thành "mềm". Đây cũng là chỗ khác Neumorphism: Neumorphism giả **vật liệu nhựa** bằng bóng lồi/lõm, còn ở đây mượn **hình khối tự nhiên**.

**Nền vẽ bằng SVG, không dùng ảnh chụp cây cỏ.** Ảnh bitmap phủ màn có ba cái giá: nặng bản dựng (200–400 KB mỗi tỉ-lệ máy), không đổi màu theo chủ đề, và sau chữ thì luôn có chỗ tương phản không đủ — người đọc ngoài nắng mất chữ ngay chỗ tán lá đậm. Hình vẽ nhẹ vài KB, tô đúng token, và giữ được **dưới 12% độ đậm**. `<Blob>` dựng từ 4 cung bán kính lệch nhau; `<Leaf>` có gân giữa; `<GroundBackdrop>` có 3 kiểu bố cục để hai màn cạnh nhau không giống hệt nhau.

### 2. Tin tức: bỏ nút "Xem thêm" · thẻ ẢNH-TRƯỚC
Cuộn gần đáy (còn 240 px) là tin **tự hiện thêm** 4 tin một. Bắt bấm một cái nút để đọc tiếp là dựng một cánh cửa ở giữa hành lang. Chặn ở `news.length` nên tới hết là dừng hẳn, không có vòng lặp nào chạy tiếp; cuối danh sách nói thẳng *"Hết tin mới rồi"*.

Thẻ tin đổi sang **Image-first**: ảnh phủ ngang trên cùng (cao 190), rồi tiêu đề, rồi trích đoạn.
- **Tiêu đề KHÔNG cắt dòng.** Tiêu đề báo tiếng Việt hay dài, mà cắt giữa chừng thì mất đúng vế mang tin: *"Mít giá thấp vẫn cười: bóc tách tâm lý bán…"* — vế sau mới là nội dung.
- **Trích đoạn cắt 2 dòng** — nó chỉ để ướm xem có đáng đọc không.
- Ảnh cao 190 chứ không cao hơn: đủ thấy cảnh vườn trong ảnh báo, chưa tới mức mỗi tin chiếm trọn màn.

### 3. Chuỗi theo KHOÁ — `src/i18n/keys/`
`tk('trace.button.addTree')` thay cho chuỗi tiếng Việt viết thẳng trong mã. Lối cũ lấy **chính câu tiếng Việt** làm khoá từ điển: sửa một dấu phẩy là mất bản dịch của cả 3 thứ tiếng mà **không có gì báo** — người dùng nước ngoài lặng lẽ thấy tiếng Việt. Hai chỗ khác ngữ cảnh cùng viết "Đã lưu" thì buộc phải dùng chung một bản dịch. Và mã nguồn đầy tiếng Việt thì người viết phần mềm không đọc tiếng Việt không sửa được giao diện.

- **Sống chung, không thay thế.** Hơn 2.000 dòng từ điển cũ và mấy chục màn vẫn chạy theo `autoText`; rứt bỏ trong một lần là chắc chắn làm vỡ chỗ nào đó không ai để ý. Lối khoá dùng cho mã **viết mới**, bắt đầu từ module Truy xuất.
- Khoá lạ → trả **chính khoá** (`trace.button.addTree` hiện trên màn) chứ không trả chuỗi rỗng: thấy khoá thì biết ngay thiếu bản dịch, còn khoảng trống thì không ai giải thích được.
- **Tầng dịch vụ cũng thôi trả tiếng Việt**: `describeWeather` nay trả `labelKey`, `farmAdvice` → `farmAdviceKey`. Dịch vụ không được quyết định người dùng đọc thứ tiếng gì.
- 7 bài kiểm canh: đủ 4 ngôn ngữ cho **mọi** khoá, đúng nếp `trace.<nhóm>.<tên>`, không khoá rỗng.

### 5 màn còn lại của module
`FarmList` · `Activity` · `TreeDetail` · `FarmDetail` · `TreeMetadataTab` đã đổi **mặt nền, mặt thẻ và màu viền** sang token hữu cơ (nền đất, giấy ngà, viền ngả đất) — làm bằng script để không sót chỗ nào. **Chưa** dựng lại bố cục và chưa chuyển chuỗi sang khoá: đó là thay đổi thị giác lớn, phải nhìn màn thật mới làm được, và 7.400 dòng sửa mù là cách chắc chắn nhất để làm vỡ một màn đang chạy tốt.

Kiểm: `tsc` sạch · **669/669 test xanh** · eslint trong `src/modules/trace` **54 → 45 lỗi** (bớt 9, không thêm cái nào).

## Trang Tổng quan viết lại cho NHÀ VƯỜN + hệ thiết kế nhiều lớp cho module Truy xuất

### Hệ nhiều lớp — `theme/depth.ts` + `components/layered/Surface.tsx`
Mỗi màn trong module trước đây tự chọn nền, tự chọn bo góc, tự chọn đổ bóng, nên đứng cạnh nhau chúng không giống một sản phẩm. Nay có MỘT thang chiều sâu, màn hình chỉ nói "cái này nằm ở lớp mấy":

| | Lớp | Dùng cho |
|---|---|---|
| L0 | `<Ground>` | mặt đất của trang — **hơi ngả xanh**, không trắng tinh |
| L1 | `<SectionHeader>` | chữ/hàng nằm thẳng trên nền |
| L2 | `<Card>` `<CardRow>` | đơn vị chính, trắng, bóng mềm |
| L3 | `<Sheet>` | tấm trượt từ đáy |
| L4 | `<Dialog>` | hộp thoại giữa màn |

Càng lên cao thì **bo góc càng lớn và bóng càng xa** — hai tín hiệu đó nói với mắt "cái này gần bạn hơn" mà không cần một đường viền nào. Nền L0 không được trắng tinh: thẻ trắng đặt lên nền trắng thì không có lớp nào cả, và ngoài nắng thì loá.

**Chữ đặt cho người đọc ngoài ruộng**, không theo mặc định thư viện: chữ nền **16** (bản cũ 13–14), số liệu to hẳn, vùng bấm tối thiểu **56 px** (không phải 44 — tay bẩn, tay ướt, có khi đeo găng), và **bỏ nhãn IN HOA cỡ nhỏ** — in hoa xoá mất đường viền trên/dưới của chữ nên mắt phải đọc từng ký tự, chậm hẳn với người lớn tuổi.

### Trang Tổng quan còn đúng ba mục
1. **Vườn của tôi** — đếm vườn/cây/quả + một nút đi tiếp.
2. **Thời tiết** — hôm nay + 7 ngày, tra theo **tâm ranh giới vườn** người dùng đã vẽ. Thời tiết ở tỉnh và ở mảnh vườn cách nhau 30 km là hai chuyện khác nhau với người quyết định hôm nay có phun thuốc hay không.
3. **Tin nhà nông** — RSS Dân Việt (Nhà nông + Nông thôn mới).

**Đã bỏ, và vì sao:**
- Dải token **MAGIC · LAMP · CARP · ADA** — bốn chữ viết tắt tiền mã hoá ngay đầu trang một ứng dụng nhà vườn. Người trồng sầu riêng mở app buổi sáng không hỏi "ví mình còn bao nhiêu ADA". Số dư vẫn nguyên ở màn Tài khoản.
- **Bộ lọc 5 nút + danh sách trộn vườn/cây/quả/hoạt động + phân trang** — đó là bảng tra dữ liệu của người viết phần mềm.
- **Huy hiệu "Đã lưu / Đồng bộ…"** — bấm vào chỉ chạy `setTimeout(1200)` rồi tự tắt. Một cái nút **giả vờ** đồng bộ; thà bỏ còn hơn dạy người dùng tin vào tín hiệu không có thật.
- Câu `Manager 3 Farms · 12 trees` — tiếng Anh lẫn tiếng Việt trong cùng một dòng.

### Hai nguồn dữ liệu, đều KHÔNG cần khoá API
- **`weatherService`** — Open-Meteo. Chọn vì không cần khoá: khoá nhúng trong app di động coi như công khai, rồi tới ngày vượt hạn mức là cả app mất thời tiết mà không ai biết vì sao. Có thêm `farmAdvice()` — rút dự báo thành **một câu việc nhà nông** ("khả năng mưa rất cao — hoãn phun thuốc, thuốc gặp mưa là trôi hết") thay vì bắt người dùng tự suy từ con số. Không có gì đáng nói thì **im lặng**, không nhét câu vô nghĩa.
- **`agriNewsService`** — RSS công khai, tự đọc XML thay vì kéo thêm thư viện: RSS 2.0 phẳng và đã biết trước hình dạng.

**Ba cái bẫy có bài kiểm bám** (44 bài): `precipitation_probability_max` **có thể null** → để nguyên là màn hiện `NaN%`; `pubDate` của Dân Việt là `2026-08-14T09:52:00 +07:00` — **có khoảng trắng trước múi giờ**, `new Date()` không nuốt được; và `code >= 95` bắt luôn mọi mã lạ rồi báo "Dông" — bài kiểm bắt đúng lỗi này, đã chặn trần `<= 99`.

Kiểm: `tsc` sạch · **660/660 test xanh** · eslint 0 lỗi trong file mới · 11 icon mới sinh bằng `scripts/icons.js`.

> **Còn lại, chưa làm:** 5 màn khác của module (`FarmDetail` 3.012 dòng · `TreeDetail` 1.654 · `FarmList` 722 · `Activity` 672 · `TreeMetadataTab` 592) chưa chuyển sang hệ nhiều lớp. Hệ đã dựng xong và dùng được ngay; chuyển từng màn là việc kế tiếp, cần làm kèm nhìn màn thật vì đây là thay đổi thị giác.

> **Quả quay video KHÔNG vào được danh sách quả — chặn ở BACKEND, không sửa được ở app.** `fruitVideoService` ghi rõ hợp đồng của `POST /api/tree/{id}/fruit_video`: server chắt khung, **detect quả nhưng KHÔNG enroll, KHÔNG đụng gallery**, chỉ ghi MỘT sự kiện timeline `link_status="unconfirmed"`. Phản hồi `FruitVideoResult` **không có `fruit_id` nào** — chỉ `detections[]` (bbox theo khung), `video_cid`, `event_id`. Không có id thì không có gì để đưa vào danh sách quả hay sơ đồ 3D. App cũng không tự enroll thay được: `enrollFruit` cần **ảnh + vùng khoanh**, mà khung hình nằm ở server (repo không có gói nào chắt khung video — đã soi `package.json`). Cần backend: enroll quả từ keyframe rồi trả về `fruit_ids[]` trong phản hồi; app nối vào là hiện ngay ở cả hai chỗ.

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
