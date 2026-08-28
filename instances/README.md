# `instances/` — mỗi app một thư mục

Kho này dựng ra **nhiều app** từ **một nền mã**. Aladin và CheckFarm dùng chung
100% màn hình, module và logic; khác nhau ở lớp trình bày và ở danh tính native.

Thư mục này là nơi khai **danh tính native**: tên app, mã gói, biểu tượng.

## Thêm một app mới — ba bước, không sửa gradle, không sửa Xcode

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
| `android.applicationId` | mã gói trên Google Play | **KHÔNG BAO GIỜ** |
| `android.iconBackground` | màu lớp nền của biểu tượng thích ứng | được |
| `ios.bundleId` | mã gói trên App Store | **KHÔNG BAO GIỜ** |

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

Ranh giới: **thư mục này = app đó LÀ AI với hệ điều hành và cửa hàng.**
`instance.config.ts` = **app đó TRÔNG NHƯ THẾ NÀO với người dùng.**

`src/config/nativeIdentityParity.test.ts` canh hai bên khớp nhau — thư mục có mà
bảng TS không có (hoặc ngược lại) là **đỏ**.

## iOS

Chưa tự động. `ios.bundleId` đã được `codemagic.yaml` dùng để chốt
`PRODUCT_BUNDLE_IDENTIFIER` lúc dựng, nhưng bộ biểu tượng iOS
(`Images.xcassets/AppIcon.appiconset`) vẫn còn một bộ duy nhất của Aladin. Đó là
việc còn lại, không phải việc đã xong.
