# `instances/` — mỗi app một thư mục

Kho này dựng ra **nhiều app** từ **một nền mã**. Aladin và CheckFarm dùng chung
100% màn hình, module và logic; khác nhau ở lớp trình bày và ở danh tính native.

Thư mục này là nơi khai **danh tính** của một app: tên, mã gói, biểu tượng — và
nó tuân luật nào của SuperApp.

Hai tệp, hai vai:

| tệp | vai |
|---|---|
| [`LUAT-SUPERAPP.md`](LUAT-SUPERAPP.md) | luật chung mọi app phải tuân, và chỗ nào có cổng cưỡng chế thật |
| `<mã>/instance.json` | app đó là ai, và nó ký nhận phiên bản luật nào |

## Thêm một app mới — bốn bước, không sửa gradle, không sửa Xcode

```
1.  mkdir -p instances/<mã>/brand
2.  đặt ảnh vuông ≥1024px vào  instances/<mã>/brand/icon-1024.png
3.  viết  instances/<mã>/instance.json   (mẫu bên dưới)
4.  python3 scripts/sinh-bieu-tuong.py <mã>
```

Rồi dựng:

```bash
cd android && ./gradlew assemble<Mã>Debug
```

`android/app/build.gradle` **đọc thư mục này** — nó không có danh sách app viết
tay. Thêm thư mục là có flavor.

### `instance.json`

```json
{
  "id": "checkfarm",
  "displayName": "CheckFarm",
  "superapp": {
    "rulesVersion": 1,
    "phoenixDid": "did:phoenix:1:<64 ký tự hex>"
  },
  "android": {
    "applicationId": "com.checkfarm.app",
    "iconBackground": "#1F6B3A"
  },
  "ios": {
    "bundleId": "com.checkfarm.app"
  }
}
```

| trường | ý nghĩa | đổi được sau khi phát hành? |
|---|---|---|
| `id` | mã nội bộ. Phải **trùng tên thư mục**, chữ thường + số | không (là tên flavor) |
| `displayName` | chữ hiện dưới biểu tượng trên máy người dùng | được |
| `superapp.rulesVersion` | phiên bản `LUAT-SUPERAPP.md` mà app này ký nhận | phải nâng khi luật đổi |
| `superapp.phoenixDid` | danh tính PhoenixKey **của chính app này** | không nên |
| `android.applicationId` | mã gói trên Google Play | **KHÔNG BAO GIỜ** |
| `android.iconBackground` | màu lớp nền của biểu tượng thích ứng | được |
| `ios.bundleId` | mã gói trên App Store | **KHÔNG BAO GIỜ** |

**Khối `superapp` là bắt buộc, và nó là chỗ app ký nhận luật.** Đọc
[`LUAT-SUPERAPP.md`](LUAT-SUPERAPP.md) trước khi điền — `rulesVersion` khai sai
số là gradle nổ, và nó cố ý nổ: luật không tự lan sang app đã có, người phải xác
nhận.

`phoenixDid` **không được bỏ trống** với app thêm mới. Hai app hiện có (`aladin`,
`checkfarm`) đang để `null` vì chưa có đường cấp danh tính cho một *instance* —
tên chúng ghi thẳng trong cổng ở `android/app/build.gradle` như một món **nợ**,
không phải một mặc định. Danh sách đó chỉ được rút ngắn.

Sai ở đây thì gradle **nổ ngay** kèm câu nói rõ sai chỗ nào — cố ý. Một
`applicationId` rỗng lọt xuống dưới là dựng ra gói mang mã app khác, và không có
triệu chứng nào cho tới lúc nộp cửa hàng.

## Biểu tượng

`scripts/sinh-bieu-tuong.py` nhận **một** ảnh vuông và sinh đủ:

```
android/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/
    ic_launcher.png          biểu tượng đời cũ (Android < 8)
    ic_launcher_round.png    bản tròn
    ic_launcher_foreground.png   lớp trước của biểu tượng thích ứng (≥ 8)
android/res/mipmap-anydpi-v26/   hai tệp XML ghép lớp
android/res/values/ic_launcher_background.xml   màu lớp nền
```

Kết quả **được commit**. Cố ý: đường dựng không phụ thuộc vào việc máy CI có cài
Pillow hay không. Bộ sinh là tiện ích cho người thêm app, không phải một bước
trong bản dựng.

**Lớp trước chừa lề 66/108.** Hệ điều hành cắt nó theo mặt nạ của từng hãng máy —
tròn, vuông bo, giọt nước — và chỉ phần giữa là chắc chắn nhìn thấy. Vẽ tràn viền
thì Samsung cắt mất một góc mà máy khác thì không.

**Không có bộ biểu tượng dùng chung.** `src/main/res` cố ý **không** còn
`ic_launcher` nào. App mới quên biểu tượng thì bản dựng **đỏ ngay**
(`resource mipmap/ic_launcher not found`), thay vì lặng lẽ mượn biểu tượng của
app đứng trước rồi đi thẳng lên cửa hàng.

## Khoá ký — mỗi app một bộ, KHÔNG dùng chung

Đây là chỗ sai một lần không sửa được, nên đọc hết trước khi dựng bản phát hành.

Khoá tải lên (upload key) gắn **vĩnh viễn** với mục ứng dụng trên Google Play kể từ
bản đầu tiên được tải lên. Hệ quả:

- Ký app của pháp nhân A bằng khoá của pháp nhân B ⇒ mục ứng dụng đó **không bao giờ
  chuyển giao được** cho A nữa, và A không nộp bản cập nhật lên đó được.
- Mất khoá ⇒ mất quyền cập nhật ứng dụng đã phát hành.
- Cả hai ca chỉ lộ ở cửa Play Console, **sau** khi người ta đã tải lên. Máy dựng không
  báo gì.

### Tên biến suy từ mã app

Gradle lấy mã app viết hoa rồi ghép `_UPLOAD_`. Không có bảng tra, không ai phải nhớ:

| app | biến cần có |
|---|---|
| `aladin` | `ALADIN_UPLOAD_STORE_FILE` · `_STORE_PASSWORD` · `_KEY_ALIAS` · `_KEY_PASSWORD` |
| `checkfarm` | `CHECKFARM_UPLOAD_STORE_FILE` · `_STORE_PASSWORD` · `_KEY_ALIAS` · `_KEY_PASSWORD` |
| app mới `<mã>` | `<MÃ>_UPLOAD_...` |

Đặt trong `android/gradle.properties` (đã bị `.gitignore` chặn) hoặc truyền `-P` từ CI.

### Sinh khoá

```
bash scripts/tao-khoa-ky.sh <mã-app>
```

Script hỏi mật khẩu qua `keytool` và **không** ghi mật khẩu ra đâu cả. Nó từ chối ghi đè
một kho khoá đã có — ghi đè là mất khoá cũ, và mất khoá cũ là mất app.

Mục **CN** lúc `keytool` hỏi: điền tên pháp nhân **SỞ HỮU** app, không phải tên bên dựng
hộ. CheckFarm thuộc Công ty Cổ phần CheckFarm; Aladin Contract dựng theo đơn đặt hàng và
không giữ quyền kiểm soát — nên khoá CheckFarm do phía CheckFarm giữ.

### Thiếu khoá thì bản phát hành NỔ

`gradle.taskGraph.whenReady` ở cuối `android/app/build.gradle` chặn mọi
`assemble<Mã>Release` / `bundle<Mã>Release` khi app đó không có bộ khoá của chính nó.
Không có cổng này, bản dựng vẫn chạy tới cùng và ra một gói **không ký** — không lỗi ở
máy dựng, chỉ lỗi ở cửa Play Console.

Bản `Debug` không đụng cổng này: nó ký bằng `debug.keystore` dùng chung, và bản debug
không lên cửa hàng được.
## Firebase — hai nền tảng, hai cơ chế, cùng một luật

**Luật:** app chỉ khởi Firebase bằng cấu hình của **chính pháp nhân sở hữu app đó**.
Không app nào mượn dự án Firebase của app khác. Mượn là đẩy thông báo đẩy, số liệu và
Crashlytics của một pháp nhân vào console của pháp nhân khác — và hỏng đó **không có
triệu chứng**: mọi thứ chạy, chỉ là chạy vào nhà người ta.

| | Android | iOS |
|---|---|---|
| tệp cấu hình đặt ở | `android/app/src/<mã>/google-services.json` | trong gói ứng dụng |
| thiếu tệp riêng thì | gradle **tắt** bước Firebase cho flavor đó | không khởi Firebase, app chạy bình thường |
| cơ chế | theo flavor, lúc **dựng** | so mã gói, lúc **chạy** |

Vì sao iOS khác: `ios/LocalPods/ScannerModule/ScannerModule.podspec` khai
`GoogleService-Info.plist` trong `s.resources`, và `s.resources` chép vào gói của **mọi**
bản dựng — podspec không có nhánh theo app, iOS không có cơ chế theo flavor tương đương.
Nên cổng nằm ở `ios/aladin_mobile_fe/AppDelegate.swift` → `configureFirebaseIfOwned()`:
nó so `BUNDLE_ID` trong tệp cấu hình với mã gói **thật** đang chạy, lệch thì không khởi.

Cách đó bịt **mọi** đường tệp lọt vào gói, kể cả đường chưa ai nghĩ ra, vì nó đo thứ
quyết định hành vi chứ không đo cách dựng.

### Ngày app của bạn cần Firebase

- **Android:** bỏ `google-services.json` của dự án đứng tên pháp nhân bạn vào
  `android/app/src/<mã>/`. Plugin tự bật lại.
- **iOS:** bỏ `GoogleService-Info.plist` của dự án đó vào gói, `BUNDLE_ID` phải khớp
  `ios.bundleId` trong `instance.json`. Cổng tự nhận và khởi.

Không sửa dòng mã nào ở cả hai nền tảng.

⛔ **Đừng "tạm dùng" tệp của app khác cho Firebase chạy được.** Đó là mở lại đúng lỗ vừa
vá, và lần này có một hàm tên `configureFirebaseIfOwned` đứng cạnh làm bằng chứng giả
rằng đã canh.

### Việc còn lại, nói thẳng

Cổng chặn Firebase **khởi**, nhưng tệp cấu hình của Aladin vẫn **nằm trong gói** của mọi
app iOS, vì `s.resources` chép vô điều kiện. Gỡ nó khỏi podspec là việc đúng tiếp theo,
nhưng phải kèm một bản dựng iOS xanh mới giao được — chưa làm trong đợt này.

## Hai chỗ vẫn nằm ngoài thư mục này — nói rõ để không ai mất công tìm

**1. Firebase.** Plugin `com.google.gms.google-services` chỉ tìm ở các vị trí cố
định của nó, không đọc được thư mục này. Nên tệp cấu hình vẫn đặt ở:

```
android/app/src/<mã>/google-services.json
```

App **không** có tệp đó thì gradle tự tắt bước Firebase cho app đó — dựng bình
thường, chỉ là không nhận tin đẩy khi app tắt. Xem
`android/app/src/checkfarm/README.md`.

**2. Cách app trông và sắp xếp.** Thứ tự ô trên thanh dưới, chủ đề màu, tên
thương hiệu trong app — những thứ đó là **hành vi**, không phải danh tính, và
chúng nằm ở `src/config/instance.config.ts`. Thêm một app cần một entry ở đó nữa.

Ranh giới: **thư mục này = app đó LÀ AI với hệ điều hành, cửa hàng, và hệ sinh
thái.** `instance.config.ts` = **app đó TRÔNG NHƯ THẾ NÀO với người dùng.**

`src/config/nativeIdentityParity.test.ts` canh hai bên khớp nhau — thư mục có mà
bảng TS không có (hoặc ngược lại) là **đỏ**.

## iOS

Chưa tự động. `ios.bundleId` đã được `codemagic.yaml` dùng để chốt
`PRODUCT_BUNDLE_IDENTIFIER` lúc dựng, nhưng bộ biểu tượng iOS
(`Images.xcassets/AppIcon.appiconset`) vẫn còn một bộ duy nhất của Aladin. Đó là
việc còn lại, không phải việc đã xong.
