# `src/checkfarm/` — nguồn riêng của bản CheckFarm

Thư mục này là chỗ Gradle đọc tài nguyên riêng của flavor `checkfarm`
(`android/app/build.gradle`, khối `productFlavors`). Tệp nào không có ở đây thì
lấy của `src/main/`.

## ✅ Firebase — KHÔNG còn chặn bản dựng

Bản trước ghi ở đây rằng CheckFarm chưa dựng được vì thiếu `google-services.json`,
và rằng chỗ chặn đó "không sửa được bằng mã". Nửa sau **sai**, và đây là đính chính.

Đo lại toàn bộ mặt tiếp xúc với Firebase trong kho:

| chỗ | dùng gì | vắng Firebase thì sao |
|---|---|---|
| `src/services/pushHandler.ts` | `await import('@react-native-firebase/messaging')` trong `try` | trả `null`, mọi hàm thoát sớm — **không cần sửa dòng nào** |
| `ios/.../AppDelegate.swift` | `FirebaseCore` + `FirebaseAnalytics` | đã tự kiểm `GoogleService-Info.plist` có trong gói không |
| `android/app/build.gradle` | plugin `com.google.gms.google-services` | **chỗ duy nhất đỏ cứng** |

Nghĩa là toàn bộ chỗ chặn nằm ở một dòng `apply plugin`, không nằm ở mã ứng dụng.

Đã sửa theo hướng đó:

1. `google-services.json` của Aladin chuyển từ gốc `app/` vào `src/aladin/`. Gốc
   `app/` nằm trong đường tìm của **mọi** variant, nên để tệp ở đó thì dựng
   CheckFarm sẽ nhặt đúng tệp của Aladin rồi đỏ vì sai gói.
2. `build.gradle` tắt bước xử lý Firebase cho flavor không có tệp cấu hình của
   **chính nó**.
3. `AndroidManifest.xml` trong thư mục này gỡ `FirebaseInitProvider`, nên không có
   gì tự khởi Firebase lúc mở app.

Cái mất, nói thẳng: **bản CheckFarm không nhận được tin đẩy khi app đang tắt.** Hai
loại tin duy nhất app dùng là `sign_request` và `activation` — cả hai đều là luồng
danh tính PhoenixKey, và cả hai vẫn chạy bình thường khi người dùng mở app.

### Ngày CheckFarm cần đẩy tin nền

Dựng một dự án Firebase **đứng tên Công ty Cổ phần CheckFarm**, đăng ký ứng dụng
Android `com.checkfarm.app`, tải `google-services.json` về đặt vào **đúng thư mục
này**, rồi **xoá `AndroidManifest.xml` trong thư mục này**. Plugin tự bật lại.

⚠ Hai việc đó phải làm **cùng lúc**. Bỏ tệp cấu hình vào mà quên xoá manifest thì
Firebase im lặng không chạy: dựng xanh, cài được, tin đẩy không bao giờ tới. Có một
bài kiểm canh đúng cặp này (`src/config/nativeIdentityParity.test.ts`).

⚠ Và tuyệt đối không chép tệp của Aladin sang: chép là trỏ thông báo đẩy, số liệu
và Crashlytics của CheckFarm về dự án Firebase của một pháp nhân khác. Hỏng đó không
có triệu chứng — mọi thứ chạy, chỉ là chạy vào nhà người ta. Cũng có bài kiểm canh.

## ⛔ CÒN THIẾU — chặn việc NỘP CỬA HÀNG (không chặn bản dựng)

### Biểu tượng và ảnh khởi động

`res/mipmap-*/ic_launcher*` chưa có ở đây, nên bản CheckFarm hiện dùng biểu
tượng của Aladin. Dựng được, nhưng **không nộp cửa hàng được**.

Đặt bộ biểu tượng riêng vào `src/checkfarm/res/mipmap-*/`.

## Vì sao mọi lệnh dựng nay phải gọi flavor tường minh

Có flavor rồi thì `./gradlew assembleDebug` dựng **cả hai** app và đổ gói vào hai
thư mục khác nhau, trong khi mọi bước dò tệp ra chỉ lấy một.

Nên mọi chỗ dựng đã đổi sang tên có flavor (`assembleAladinDebug`,
`bundleAladinRelease`, …). Đường dẫn tệp ra cũng đổi theo:

```
trước:  app/build/outputs/apk/debug/         app/build/outputs/bundle/release/
sau:    app/build/outputs/apk/aladin/debug/  app/build/outputs/bundle/aladinRelease/
```

Bốn chỗ dò tệp bằng `find` theo đường dẫn cũ đã được sửa cùng lượt. Không sửa
thì `find` trả rỗng (bản AAB) hoặc trả **gói của app kia** (bản APK, vì
`head -1` lấy theo thứ tự chữ cái).
