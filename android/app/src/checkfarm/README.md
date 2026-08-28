# `src/checkfarm/` — nguồn riêng của bản CheckFarm

Thư mục này là chỗ Gradle đọc tài nguyên riêng của flavor `checkfarm`
(`android/app/build.gradle`, khối `productFlavors`). Tệp nào không có ở đây thì
lấy của `src/main/`.

## ⛔ CÒN THIẾU — chặn bản dựng CheckFarm

### 1. `google-services.json`

`android/app/build.gradle:252` áp `com.google.gms.google-services`, và
`android/app/google-services.json` hiện chỉ khai **một** gói:

```
"package_name": "com.aladincontract.company"
```

Nên `./gradlew assembleCheckfarmDebug` hôm nay dừng ở:

```
No matching client found for package name 'com.checkfarm.app'
```

Đây **không phải việc sửa được bằng mã**. Nó cần một dự án Firebase đứng tên
**Công ty Cổ phần CheckFarm**, đăng ký ứng dụng Android `com.checkfarm.app`, rồi
tải `google-services.json` của dự án đó về đặt vào **đúng thư mục này**.

Cố ý KHÔNG chép tệp của Aladin sang: chép là trỏ thông báo đẩy, số liệu và
Crashlytics của CheckFarm về dự án Firebase của một pháp nhân khác. Hỏng đó
không có triệu chứng — mọi thứ chạy, chỉ là chạy vào nhà người ta.

### 2. Biểu tượng và ảnh khởi động

`res/mipmap-*/ic_launcher*` chưa có ở đây, nên bản CheckFarm hiện dùng biểu
tượng của Aladin. Dựng được, nhưng **không nộp cửa hàng được**.

Đặt bộ biểu tượng riêng vào `src/checkfarm/res/mipmap-*/`.

## Vì sao mọi lệnh dựng nay phải gọi flavor tường minh

Có flavor rồi thì `./gradlew assembleDebug` dựng **cả hai** app, và
`assembleCheckfarmDebug` sẽ đỏ vì mục 1 ở trên — tức thêm flavor mà giữ lệnh cũ
là làm đỏ đường dựng Aladin đang chạy tốt.

Nên mọi chỗ dựng đã đổi sang tên có flavor (`assembleAladinDebug`,
`bundleAladinRelease`, …). Đường dẫn tệp ra cũng đổi theo:

```
trước:  app/build/outputs/apk/debug/         app/build/outputs/bundle/release/
sau:    app/build/outputs/apk/aladin/debug/  app/build/outputs/bundle/aladinRelease/
```

Bốn chỗ dò tệp bằng `find` theo đường dẫn cũ đã được sửa cùng lượt. Không sửa
thì `find` trả rỗng (bản AAB) hoặc trả **gói của app kia** (bản APK, vì
`head -1` lấy theo thứ tự chữ cái).
