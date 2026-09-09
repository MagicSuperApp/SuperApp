# `src/aladin/` — nguồn riêng của bản Aladin

Gradle đọc thư mục này cho flavor `aladin` (`android/app/build.gradle`, khối
`productFlavors`). Tệp nào không có ở đây thì lấy của `src/main/`.

## ⚠ `google-services.json` ở đây đã bị SỬA TAY — đọc trước khi tải lại

Tệp này do Firebase console sinh ra, nhưng bản trong kho **không còn giống bản
tải về**. Ngày 04/09/2026 đã gỡ khỏi nó một khối:

```
services.appinvite_service.other_platform_oauth_client[1]
  client_type: 2
  ios_info.bundle_id: <mã gói nháp do dev tạo>
```

Vì sao gỡ: mã gói ấy là **bản nháp một dev tạo lúc dựng thử**, không phải mã của
app nào đang sống. Chủ nhân chốt 04/09/2026 chỉ còn hai app —
`com.aladincontract.company` (Aladin, Android) và `com.checkfarm.app` (CheckFarm)
— cộng `vn.aladinapp` cho Aladin bản iOS, đã lên App Store từ v1.0 nên không đổi
được.

Khối bị gỡ là OAuth client của **iOS**, `client_type: 2`. Plugin
`com.google.gms.google-services` chỉ lấy client `client_type: 3` để dựng
`default_web_client_id`, nên gỡ khối này **không đổi gì ở bản dựng Android**.

### 🔴 Chỗ thật sự phải dọn nằm ở Firebase console, không nằm trong kho

Dự án `aladin-3599c` vẫn đang **đăng ký một ứng dụng iOS mang mã gói nháp đó**.
Chừng nào ứng dụng ấy còn trong console thì mỗi lượt tải `google-services.json`
mới về sẽ mang khối vừa gỡ trở lại.

Việc của chủ nhân, một lần:

1. Firebase console → dự án `aladin-3599c` → Project settings → Your apps.
2. Xoá ứng dụng iOS mang mã gói nháp.
3. Ngày Aladin iOS cần Firebase: đăng ký ứng dụng iOS mới mang **`vn.aladinapp`**,
   tải `GoogleService-Info.plist` về, đặt vào mục tiêu Xcode của app đó.
4. Tải lại `google-services.json` cho Android, thay tệp trong thư mục này.

Có cổng canh: `src/config/nativeIdentityParity.test.ts`, mục *"mã gói nháp không
được quay lại kho"*, quét toàn kho. Nó đỏ đúng lúc tệp mới mang mã nháp trở lại —
và câu trả lời khi ấy là làm bước 2 ở trên, **không phải** sửa tay tệp lần nữa.

## Firebase iOS của Aladin đang TẮT — và đó không phải hỏng

Đo 04/09/2026: `GoogleService-Info.plist` trong kho khai mã gói nháp, còn app
iOS chạy bằng `vn.aladinapp`. `configureFirebaseIfOwned`
(`ios/SuperApp/AppDelegate.swift`) so hai chuỗi ấy rồi dừng — nên Firebase iOS
**chưa từng khởi** ở bản Aladin, kể cả trước khi gỡ tệp.

Vì vậy việc gỡ tệp plist không đổi hành vi: trước gỡ dừng ở phép so mã gói, sau
gỡ dừng ở phép kiểm "không có tệp trong gói". Cái mất là **không có**; cái được
là tệp của một pháp nhân thôi nằm trong gói của mọi pháp nhân khác.
