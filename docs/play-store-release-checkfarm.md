# CheckFarm trên Google Play — cấu hình mục và dựng bản phát hành

> Đo 2026-09-16 trên nhánh `develop`. Tài liệu này có **hai phần cho hai vai**:
> phần A là việc điền trong Play Console (chủ sở hữu mục làm), phần B là việc dựng
> gói (dev làm). Đọc phần của mình là đủ, không phải đọc cả hai.
>
> **Quy ước của tài liệu này:** mỗi con số và mỗi đường dẫn đều kèm chỗ đo ra nó.
> Dòng nào chưa đo được thì ghi thẳng **CHƯA ĐO ĐƯỢC** — đừng điền nó vào Console
> bằng cách đoán, vì một dòng khai sai với cửa hàng không tự báo sai.

---

## 0. App này là ai — dữ kiện dùng chung cho cả hai phần

| Mục | Giá trị | Đo ở |
|---|---|---|
| Tên hiển thị | `CheckFarm` | `instances/checkfarm/instance.json` ▸ `displayName` |
| Mã gói Android | `com.checkfarm.app` | cùng tệp ▸ `android.applicationId` |
| `versionCode` / `versionName` hiện tại | `101` / `2.0` | `android/app/build.gradle:373-374`, và đối chiếu lại trên chính gói: `bundletool dump manifest` |
| Activity khởi | `com.checkfarm.app/com.aladincontract.company.MainActivity` | `adb shell cmd package resolve-activity --brief -c android.intent.category.LAUNCHER com.checkfarm.app` |
| Pháp nhân vận hành | Aladin, chuyển giao cho **Công ty Cổ phần CheckFarm** từ 2026-09-10 | `instance.json` ▸ `operator.transferTo` |
| Liên hệ | `aladincontract@gmail.com` | `instance.json` ▸ `operator.contact` |
| Địa chỉ | có sẵn cả bản tiếng Việt lẫn tiếng Anh | `instance.json` ▸ `operator.address` / `addressEn` |

> ⚠ `com.aladincontract.company` là **package Java của mã native**, KHÔNG phải
> `applicationId`. Hai thứ này lệch nhau là bình thường ở kho này. Đừng gõ nó vào
> bất cứ ô nào của Play Console.

---

## A. Cấu hình mục trên Play Console

### A.1 Tài sản đã có sẵn, không phải làm lại

Gói nộp và ảnh chụp màn hình nằm ở `~/Downloads/CheckFarm-AAB-2026-09-16/` — đó là
thư mục của MỘT máy, không phải một nơi giữ. Hai tệp ảnh cửa hàng thì có nơi giữ
thật: kho nhận diện `CheckFarm/Docs` ▸ `Logo/play-store/`, nằm cạnh bộ sinh ra
chúng, nên mất thì dựng lại được chứ không phải vẽ lại.

| Ô trong Console | Tệp | Kích thước đã kiểm |
|---|---|---|
| App icon | `play-icon-512.png` | 512×512, `hasAlpha: no` (đo bằng `sips`) — icon cửa hàng phải là hình ĐẶC, không trong suốt |
| Feature graphic | `feature-graphic-1024x500.png` | 1024×500 |
| Phone screenshots | `screenshots/01…05` | 1080×1920 (tỉ lệ 1:1,78 — Play từ chối cạnh dài quá gấp đôi cạnh ngắn) |
| Gói nộp | `dist/checkfarm-release.aab` (+ `.sha256`) | — |

Icon 512 thu từ `instances/checkfarm/ios/AppIcon.appiconset/icon-1024.png` — bản
đặc, đúng hình đang dùng trên iOS. **Đừng** dùng `instances/checkfarm/brand/icon-1024.png`
cho ô này: tệp đó là lớp nét trắng trong suốt dành cho biểu tượng thích ứng của
Android, dán vào Console sẽ ra một hình gần như vô hình.

Năm ảnh chụp đều là màn **trước đăng nhập**. Play chấp nhận (tối thiểu 2 ảnh), nhưng
mục sẽ không cho người xem thấy phần nông trại thật. Xem §A.5.

### A.2 Ô chữ — nguồn có sẵn trong mã, không tự chế

- **Tên app (30 ký tự):** `CheckFarm`
- **Mô tả ngắn (80 ký tự):** câu khẩu hiệu đang hiện trong app là
  *"Truy xuất từ nguồn"* — `src/config/instance.config.ts` ▸ `slogan.vi` của
  instance `checkfarm`. Câu dài hơn dùng cho ảnh bìa là *"Truy xuất nguồn gốc -
  Nâng tầm nông sản"* (chủ sở hữu chốt 2026-09-16).
  ⚠ **Ba câu, một sản phẩm — và câu thứ ba KHÔNG có trong mã.** `instance.config.ts`
  ▸ `CHECKFARM_INSTANCE.tagline.vi` là *"Truy xuất từ nguồn — Nâng tầm nông sản"*,
  còn câu trên ảnh bìa là *"Truy xuất nguồn gốc - Nâng tầm nông sản"*: khác ở
  *từ nguồn* ↔ *nguồn gốc*, và gạch ngang ↔ gạch nối. Mục này có tiêu đề "nguồn có
  sẵn trong mã", nên chỗ lệch phải nói ra: câu ảnh bìa đang sống ngoài nguồn. Chọn
  một câu rồi sửa bên còn lại — đừng để cửa hàng và app nói hai câu.
- **Mô tả đầy đủ (4000 ký tự):** **CHƯA ĐO ĐƯỢC** — trong kho không có bản mô tả
  cửa hàng nào. Phải viết mới; đây là nội dung đối ngoại nên chủ sở hữu duyệt câu
  chữ trước khi đăng.
- **Bản dịch:** app chạy 4 thứ tiếng (vi/en/zh/ja — `src/i18n/`). Play cho khai
  nhiều ngôn ngữ cho một mục; khai thêm là tuỳ chọn, không phải điều kiện nộp.

### A.3 Data Safety — đã có bản đo sẵn từ mã nguồn

Điền theo `Compliance/google-play-data-safety.md`. Tệp đó liệt kê từng loại dữ liệu
kèm `file:dòng`, và **cố ý** để lại các ô `CHƯA ĐO ĐƯỢC` thay vì đoán.

Ba chỗ trong tệp đó sẽ chặn lại lúc điền, vì chúng là câu hỏi pháp lý chứ không
phải câu hỏi đo được từ mã:

1. OriLife / ProofChat / AladinWork / PhoenixKey / LampNet có tính là **bên thứ ba**
   theo định nghĩa của Google, hay là hạ tầng của chính nhà phát triển.
2. Firebase Analytics — **CHƯA ĐO ĐƯỢC cho bản CheckFarm**, đừng khai vội theo
   hướng nào. Thư viện có mặt (`android/app/build.gradle` ▸ khối `dependencies`,
   `firebase-bom` + `firebase-analytics-ktx`), nhưng bước gắn cấu hình bị **tắt**
   cho flavor nào không có tệp `google-services.json` của chính nó — xem nhánh in
   `[firebase] ${flavor}: không có google-services.json → tắt ${taskName}` trong
   cùng tệp. Liệt kê đóng: `ls android/app/src/*/google-services.json` trả về
   **đúng một** tệp, của `aladin`. Tức bản CheckFarm có thư viện mà không có cấu
   hình để khởi. Khai "có chia sẻ" lẫn khai "không chia sẻ" đều là đoán cho tới
   khi chạy phép đo: dựng `bundleCheckfarmRelease` rồi tìm `google_app_id` trong
   gói, hoặc mở bản CheckFarm và đọc `adb logcat | grep -i firebase`.
3. Play hỏi "người dùng yêu cầu xoá dữ liệu được không". `src/services/accountDeletionService.ts`
   ▸ hằng `REMOTE_DELETE_ENABLED` đang là `false`, backend **chưa** có cửa xoá theo DID.
   Khai "có" ở ô này là khai sai.

### A.4 Ba thứ Play đòi mà chưa có

Đây là phần thật sự chặn nộp, không phải phần tô điểm:

| Thứ | Trạng thái đo được | Ai gỡ |
|---|---|---|
| **Account deletion URL** | Cùng gốc với mục A.3 §3: chưa có cửa xoá phía máy chủ thì cũng chưa có trang để khai | chủ sở hữu + backend |
| **Khai đối tượng người dùng / nội dung** | bảng câu hỏi trong Console, không có dữ kiện nào trong kho trả lời hộ | chủ sở hữu |
| **Bản mô tả đầy đủ** | §A.2 | chủ sở hữu |

**Chính sách quyền riêng tư thì ĐÃ CÓ — dán `https://checkfarm.com/privacy.html`.**

Chỗ này đáng kể lại, vì nó là một cách đo sai dễ lặp. Bản đầu của tài liệu xếp nó vào
hàng chặn, với lý do *"quét kho không ra một URL http nào"*. Câu ấy đúng — nhưng nó là
phát biểu về **kho mã**, không phải về sản phẩm. Trang web nằm ở một kho khác của cùng tổ
chức, và tên miền đã trỏ về nó từ 25/08/2026.

Đo lại 2026-09-16:

```
$ curl -s -o /dev/null -w '%{http_code} %{size_download}\n' https://checkfarm.com/privacy.html
200 30975
$ curl -s -o /dev/null -w '%{http_code}\n' https://www.checkfarm.com/privacy.html
200
```

⟹ Trước khi khai một thứ là "chưa có", hỏi *tổ chức này có mấy kho?* — không chỉ *kho này
có gì?*

### A.5 Ảnh sau đăng nhập — vì sao chưa có, và điều kiện để có

Mọi màn có nội dung nông trại (vườn, cây, truy xuất, công việc) nằm sau cửa danh
tính. Mở cửa đó đòi **đăng ký một danh tính thật trên máy chủ đang chạy**.

`scripts/dev-identity/create-test-identity.sh` giải đúng bài toán này nhưng chỉ
chạy cho **máy ảo iOS** và cần bản debug + Metro (nó vá `index.js` rồi gỡ ra) —
bản phát hành trên máy ảo Android không nạp được phép vá đó.

Nên: nộp trước với 5 ảnh hiện có, bổ sung ảnh sau đăng nhập ở lần cập nhật mục
sau (đổi ảnh KHÔNG cần nộp gói mới).

---

## B. Dựng một bản phát hành

### B.1 Chuẩn bị máy

```bash
bash scripts/build-android.sh            # chỉ KIỂM, không đụng gì
bash scripts/build-android.sh --cai      # kiểm, rồi cài phần còn thiếu
```

Script đọc phiên bản JDK/NDK/build-tools **thẳng từ `android/build.gradle`** chứ
không gõ cứng, nên nó không lệch với thứ Gradle thật sự đòi. Chạy nó trước khi kết
luận "máy tôi thiếu Java" — trên máy đã dựng được app, `java -version` vẫn báo
*Unable to locate a Java Runtime* vì JDK không nằm trên `PATH` mặc định của macOS.

### B.2 Khoá ký — MỖI APP MỘT KHOÁ, không dùng chung

Gradle suy tên biến từ mã app: `checkfarm` → bốn biến `CHECKFARM_UPLOAD_*`
(`STORE_FILE`, `STORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) —
`android/app/build.gradle:229-252`. Đặt trong `android/gradle.properties`, hoặc
truyền `-P`, hoặc trên CI thì thêm secret cùng tên rồi ánh xạ vào bước dựng.

Ba điều đã trả giá để biết, đừng phát hiện lại:

1. **Ký CheckFarm bằng khoá của Aladin là hỏng đắt.** Mục CheckFarm trót nhận một
   bản ký bằng khoá Aladin thì phải xin Google đặt lại khoá tải lên mới nộp tiếp
   được — làm được, nhưng đi qua bộ phận hỗ trợ và không nhanh. Nặng hơn: chừng nào
   chưa đặt lại, Aladin vẫn ký được bản cập nhật cho app của pháp nhân khác.
2. **Nạp thiếu một trong bốn biến** thì Gradle nay dừng với một câu nêu đủ tên biến
   còn thiếu và chỗ đặt (`build.gradle:237-246`). Trước bản đó nó nổ bằng
   `Could not get unknown property '…'` — một tên, không nói còn thiếu gì nữa.
3. **Secret đặt rồi nhưng RỖNG đi tới cùng chỗ với secret chưa đặt.** Danh sách
   secret chỉ chứng minh biến TỒN TẠI; chỉ log lượt chạy mới chứng minh nó có giá
   trị.

### B.3 Dựng

```bash
bash scripts/build-android.sh --dung checkfarm-aab
```

Tên task Gradle phía dưới là `bundleCheckfarmRelease` — mỗi app là một *flavor*,
và `build.gradle:169-171` chặn cứng hai app dùng chung `applicationId` (cửa hàng
coi đó là MỘT app, bản sau đè bản trước).

### B.4 ⛔ Cổng bắt buộc trước khi nộp

```bash
bash scripts/soi-aab.sh <đường dẫn>/checkfarm-release.aab
```

`FAIL=0` mới được nộp. Cổng soi gói ĐẦU RA nằm ở `.github/workflows/android-aab.yml`,
và nó **đang chạy** — kho đã công khai từ 2026-09-10 nên Actions không còn phụ thuộc
thanh toán; đo bằng `gh pr checks <số PR>`, đọc ở cột trạng thái của `Verify (tsc +
jest)`, ngày 2026-09-17 ra `pass` trên cả ba PR đang mở. Danh sách flavor của lượt
dựng có cả `checkfarm` (`grep -n checkfarm .github/workflows/android-aab.yml`).

Đường dựng Codemagic (`codemagic.yaml`) soi `jniLibs` — tức đầu VÀO của Gradle, không
phải gói ra — nhưng soi **cả ba** lát kiến trúc: `grep -n 'for ABI in' codemagic.yaml`
ra bốn vòng lặp, đều `arm64-v8a armeabi-v7a x86_64`.

Chuyện đã xảy ra một lần: bản `versionCode 87` có chữ ký đúng, 25 tệp `.so`, cài
chạy bình thường — nhưng **thiếu** `libtaad_enclave_core.so` và `libchat_mls.so` ở
cả bốn lát ABI. Người cài mới vẫn đăng ký được, vẫn dùng vườn/cây/quả, nhưng không
có ví và không có cụm 24 từ sao lưu. Lỗi bị nuốt nên app không báo một câu nào.
Mất máy là mất danh tính vĩnh viễn.

### B.5 Đối chiếu gói trước khi tải lên

```bash
bundletool dump manifest --bundle=checkfarm-release.aab | grep -E 'versionCode|versionName|package'
```

Ba tầng phải khớp nhau: `bundletool dump manifest` · `adb shell dumpsys package
com.checkfarm.app` sau khi cài · và dòng phiên bản in ở chân màn đăng nhập. Đo
2026-09-16 trên bản hiện có: `versionCode=101`, `versionName=2.0`,
`package=com.checkfarm.app`, và màn app in `v2.0 (101)`.

**`versionCode` trùng một bản đã nộp thì Play báo ngay lúc tải lên.** Chưa kiểm
được từ máy này là mục đã có bản `101` chưa — chỉ Console trả lời được.

### B.6 Đặt gói lên máy để xem trước

```bash
bundletool build-apks --bundle=checkfarm-release.aab --mode=universal \
  --ks=android/app/debug.keystore --ks-key-alias=androiddebugkey ...
bundletool install-apks --apks=checkfarm.apks
```

Khoá debug ở đây **chỉ để máy ảo chịu cài**; nội dung gói vẫn đúng là nội dung sẽ
lên cửa hàng. Máy ảo phải đặt màn 1080×1920 hoặc tỉ lệ tương đương — AVD mặc định
ra 1080×2400 (1:2,22) và Play từ chối ảnh chụp ở tỉ lệ đó.

---

## C. Việc còn treo, đọc trước khi hứa ngày phát hành

- Ba ô ở **§A.4** là điều kiện nộp, không phải việc dev — gói sẵn sàng không thay
  được một ô Console còn trống. (URL chính sách quyền riêng tư KHÔNG còn nằm trong
  ba ô đó: `https://checkfarm.com/privacy.html` đã sống, xem §A.4.)
- Ảnh sau đăng nhập (**§A.5**) bổ sung được sau, không chặn lần nộp đầu.
- `versionCode 101` chưa đối chiếu được với những gì mục đã nhận (**§B.5**).
