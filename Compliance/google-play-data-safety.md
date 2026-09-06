# Google Play Data Safety — bản nháp đo từ mã nguồn

> Đo ngày 2026-08-18 bởi SuperApp agent, theo yêu cầu chủ nhân. File này KHÔNG phải bản đã điền
> vào Play Console — đây là dữ liệu thô để chủ sở hữu điền form Data Safety thật. Mỗi dòng bắt
> buộc truy được về `file:line`; dòng nào không truy được thì ghi thẳng **CHƯA ĐO ĐƯỢC**, không
> đoán.
>
> Form Data Safety của Google hỏi 4 cột cho mỗi loại dữ liệu: **Thu thập hay không** · **Chia
> sẻ với bên thứ ba hay không** · **Bắt buộc hay tuỳ chọn** · **Mục đích**. Bảng dưới gộp thêm
> hai cột đo được từ mã: mã hoá khi truyền, và người dùng xoá được không.

## Vị trí (Location)

| Trường | Mục đích | Chia sẻ bên thứ 3 | Mã hoá khi truyền | Xoá được | Nguồn |
|---|---|---|---|---|---|
| Toạ độ GPS chính xác (precise) | Gắn vào điểm đo cây/ranh giới nông trại | CHƯA ĐO ĐƯỢC (backend đích là OriLife, xem mục "Chia sẻ" bên dưới) | Có — release build chặn HTTP trần (`android/app/build.gradle:159-162`), toàn bộ base URL quan sát được đều `https://` | CHƯA ĐO ĐƯỢC (không tìm thấy API xoá theo điểm đo) | Thu thập: `src/screens/TreeIdentityScreen.tsx:246,254` (`Geolocation.getCurrentPosition`/`watchPosition`), `src/screens/WayfindScreen.tsx:135,209`, `src/modules/trace/screens/FarmDetailScreen.tsx:535,1451,1618`. Quyền: `android/app/src/main/AndroidManifest.xml:19-20` (`ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`). |

## Thông tin cá nhân (Personal info)

| Trường | Mục đích | Chia sẻ bên thứ 3 | Mã hoá khi truyền | Xoá được | Nguồn |
|---|---|---|---|---|---|
| Tên | Hồ sơ tài khoản | CHƯA ĐO ĐƯỢC | Có (https, như trên) | Có (xoá cục bộ máy thật ngay; xoá phía máy chủ **đang PENDING** — xem `src/services/accountDeletionService.ts:9-13,28-29`) | `src/services/phoenixKey-api.ts:582` (trường `name` trong DTO tài khoản) |
| Địa chỉ email | Hồ sơ tài khoản, liên hệ | CHƯA ĐO ĐƯỢC | Có | Như trên (pending phía máy chủ) | Hiển thị hồ sơ: `src/screens/AccountScreen.tsx:555-558`. Khai trong `PrivacyInfo.xcprivacy` (`NSPrivacyCollectedDataTypeEmailAddress`). |
| User ID / DID | Định danh tài khoản, xác thực chữ ký | Có — công khai theo thiết kế: DID + public key được "gửi lên danh bạ PhoenixKey" để người khác xác minh chữ ký (`src/legal/policyContent.ts:100`) | Có | Không — DID là định danh cố định của kiến trúc non-custodial, không có API xoá DID khỏi danh bạ PhoenixKey trong repo này | `src/services/phoenixKeyAuthService.ts` (AuthUser.id/.did), `src/sdk/phoenixKey` (currentUserDid) |

## Tài chính (Financial info)

| Trường | Mục đích | Chia sẻ bên thứ 3 | Mã hoá khi truyền | Xoá được | Nguồn |
|---|---|---|---|---|---|
| Địa chỉ ví Cardano (walletAddress) | Đăng ký ví, nhận/gửi ADA + token LAMP | Có khả năng — `cardanoTxService.ts:19-21` ghi rõ backend proxy UTXO tới Blockfrost (dịch vụ Cardano bên thứ 3); mức độ địa chỉ có lộ ra Blockfrost hay không **CHƯA ĐO ĐƯỢC** (việc đó nằm ở backend, ngoài kho này) | Có | CHƯA ĐO ĐƯỢC (không thấy API huỷ đăng ký ví) | Đăng ký: `src/services/phoenixKey-api.ts:486` (`register: (walletAddress)`); gửi khi tham gia việc làm: `src/modules/join/screens/JoinHomeScreen.tsx:96` (`cardano_address: walletAddress`) |
| UTXO / số dư / mã giao dịch (tx hash, lovelace, native assets) | Dựng và gửi giao dịch Cardano/LAMP | CHƯA ĐO ĐƯỢC (đi qua backend PhoenixKey, không rõ backend forward tiếp cho ai) | Có | Không — đây là dữ liệu on-chain một khi đã submit, không xoá được theo bản chất blockchain | `src/services/cardanoTxService.ts:58,60,109-132,234-268` |
| Khoá riêng ví (private key / master KEK) | Ký giao dịch | **Không rời THIẾT BỊ. Nhưng có rời vùng native** — xem ô "Nguồn". Không gửi lên máy chủ nào. | N/A — không truyền đi | N/A | Không "thu thập" theo định nghĩa Google (không rời thiết bị) ⇒ không phải khai ở Data Safety. **Nhưng đừng đọc dòng này thành "khoá không bao giờ ra khỏi Keystore".** `masterKekStore.ts` (`getOrCreateMasterKek`) nhận KEK về dưới dạng **chuỗi JS** qua cầu React Native, và `SeedExportScreen` giữ cả 24 từ trong state của React. Heap JS là vùng dùng chung với mọi gói npm trong bản dựng. |

> ⚠️ **ĐÍNH CHÍNH — dòng "khoá riêng ví" ở trên từng khai SAI, đọc trước khi chép bản này vào
> Play Console.** Bản trước ghi *"Không thu thập / không rời máy"* và dẫn chứng bằng **một dòng
> chú thích** (`cardanoTxService.ts:10`, "seed KHÔNG rời native").
>
> Chú thích đó đúng với tầng nó nói — đường KÝ GIAO DỊCH. Nó **không** đúng với KEK: `secureLoad`
> trả một chuỗi qua cầu React Native, `getOrCreateMasterKek` giữ chuỗi đó trong JS, và màn xuất
> cụm từ giữ cả 24 từ trong state React.
>
> Kết luận với Play **không đổi** — khoá vẫn không rời thiết bị, nên vẫn không phải khai. Cái sai
> là **cơ sở** của kết luận, và cái sai đó đắt theo kiểu riêng: một bản khai với cửa hàng lấy chú
> thích làm bằng chứng thì nó đúng đúng bằng lúc chú thích được viết, và không có gì báo khi mã
> đi tiếp mà chú thích đứng lại. Bằng chứng cho một dòng khai phải là **cơ chế**, không phải lời
> tự thuật của mã về chính nó.

> ⚠️ Mục này **KHÔNG có bản khai tương ứng trước đây** ở bất kỳ đâu trong kho (không tìm thấy
> `NSPrivacyCollectedDataTypeOtherFinancialInfo` hay tương đương trước bản sửa hôm nay ở
> `PrivacyInfo.xcprivacy`, và §5 "Dữ liệu đi đâu" của `src/legal/policyContent.ts:106-114` /
> `:185-191` không nhắc tới ví/giao dịch Cardano dù mã gửi dữ liệu này lên backend thật). Đây là
> điểm lệch giữa mã và tài liệu công bố — cần chủ sở hữu quyết có bổ sung vào chính sách công khai
> (mục 4 của yêu cầu này, KHÔNG tự viết) hay không.

## Ảnh và video (Photos and videos)

| Trường | Mục đích | Chia sẻ bên thứ 3 | Mã hoá khi truyền | Xoá được | Nguồn |
|---|---|---|---|---|---|
| Ảnh/video cây, quả, vật nuôi, nông trại | Định danh lại (Re-ID) cây/quả/vật nuôi, bằng chứng truy xuất nguồn gốc | Không tự ý bán/quảng cáo theo tuyên bố `policyContent.ts:191`; lưu trên "mạng lưu trữ phân tán LampNet" — CHƯA ĐO ĐƯỢC bản chất pháp lý của LampNet có phải "bên thứ 3" theo định nghĩa Google hay là hạ tầng riêng | Có (multipart qua HTTPS) | CHƯA ĐO ĐƯỢC phía máy chủ; ảnh/video lưu cục bộ trong thư viện máy thì người dùng tự xoá được (`policyContent.ts:120,199`) | Upload: `src/services/treeVideoService.ts:5,100,126`, `src/services/fruitVideoService.ts:5,114,144` |

## Âm thanh (Audio files — voice/sound recordings)

| Trường | Mục đích | Chia sẻ bên thứ 3 | Mã hoá khi truyền | Xoá được | Nguồn |
|---|---|---|---|---|---|
| Ghi âm 30 giây quanh cây khi quay video định danh | "Ghi lại điều kiện lúc chụp" (`policyContent.ts:77`) | CHƯA ĐO ĐƯỢC đường đi cụ thể của file ghi âm sau khi native module trả về (`VoiceMemoButton.tsx` chỉ gọi native `startRecording/stopRecording`, không thấy đoạn upload trong `src/`) | CHƯA ĐO ĐƯỢC (chưa xác định endpoint nhận file ghi âm) | Có — `deleteRecording(treeId)` tồn tại ở tầng native bridge | `src/modules/trace/components/VoiceMemoButton.tsx:29-37` (interface `VoiceMemoNative`), quyền: `android/app/src/main/AndroidManifest.xml:6-7` |

## Định danh thiết bị (Device or other IDs)

| Trường | Mục đích | Chia sẻ bên thứ 3 | Mã hoá khi truyền | Xoá được | Nguồn |
|---|---|---|---|---|---|
| Device ID (Firebase Analytics) | Đo lường sản phẩm, phân tích | **Có — Google/Firebase** là bên thứ 3 xác nhận được: `Firebase/Analytics` nhúng native cả hai nền tảng | Có (SDK Google tự quản lý kênh truyền) | CHƯA ĐO ĐƯỢC (không có UI trong app điều khiển Firebase, phụ thuộc cơ chế opt-out chuẩn của Google) | iOS: `ios/Podfile:79-80` (`pod 'Firebase/Analytics'`). Android: `android/app/build.gradle:216-217` (`firebase-analytics-ktx`) + `:220` (`apply plugin: 'com.google.gms.google-services'`). Đã khai `NSPrivacyCollectedDataTypeDeviceID` (unlinked) trong `PrivacyInfo.xcprivacy`. |

## Hoạt động trong ứng dụng (App activity)

| Trường | Mục đích | Chia sẻ bên thứ 3 | Mã hoá khi truyền | Xoá được | Nguồn |
|---|---|---|---|---|---|
| Sự kiện thao tác (mở màn, bấm nút, độ trễ) | "Tìm chỗ ứng dụng chạy sai hoặc chạy chậm" (`policyContent.ts:111`) | Không — gửi về "máy chủ đo lường của chúng tôi" (first-party theo tuyên bố chính sách), tắt hẳn khi build không cấu hình | Có (HTTPS, cùng hạ tầng backend) | CHƯA ĐO ĐƯỢC (không thấy API xoá hàng đợi phân tích đã gửi) | `src/services/analytics/analyticsService.ts:1-13`, cấu hình bật/tắt: `src/services/analytics/config.ts:10`. Trường nhạy cảm (password/pin/otp/seed/mnemonic/private/token) bị lọc trước khi gửi: `src/services/analytics/config.ts:44-56`. |

## Chẩn đoán (App info and performance)

| Trường | Mục đích | Chia sẻ bên thứ 3 | Mã hoá khi truyền | Xoá được | Nguồn |
|---|---|---|---|---|---|
| Crash data / Performance data | Đã khai trong `PrivacyInfo.xcprivacy` (dòng gốc trước khi đo lại) | CHƯA ĐO ĐƯỢC — không tìm thấy Crashlytics hay Sentry được khởi tạo trong `src/`, `ios/`, `android/` (chỉ có `Firebase/Analytics`, KHÔNG có `firebase-crashlytics`/`FirebaseCrashlytics` ở `ios/Podfile` hay `android/app/build.gradle`). Nguồn thật của hai loại dữ liệu này **chưa xác định được** — có thể là báo cáo sự cố mặc định của Apple/Google (App Store Connect / Play Console), không phải SDK bên thứ 3 do app tự nhúng. | CHƯA ĐO ĐƯỢC | CHƯA ĐO ĐƯỢC | Khai báo cũ: `ios/SuperApp/PrivacyInfo.xcprivacy` (mục `NSPrivacyCollectedDataTypeCrashData`/`PerformanceData`). Đã grep toàn kho `sentry\|crashlytics\|bugsnag` — không có kết quả nào ngoài chuỗi trùng tên biến trong `errorHandler.ts`/`fruitReIDService.ts` (không phải SDK báo lỗi). |

## Ghi chú chung

- **Mã hoá khi truyền**: xác nhận được ở mức build config — `android/app/build.gradle:159-162`
  khoá `usesCleartextTraffic=false` cho bản release; mọi base URL API quan sát được trong
  `src/services/*.ts` đều `https://` (`api.orilife.io`, `api.phoenixkey.me`, `api.lampnet.cloud`).
  KHÔNG kiểm tra pinning/TLS version — ngoài phạm vi đo từ mã nguồn tĩnh.
- **Xoá dữ liệu phía máy chủ**: `src/services/accountDeletionService.ts:9-13,28-29` xác nhận
  rõ ràng bằng comment của chính nhà phát triển — backend (PhoenixKey/OriLife/AladinWork/
  ProofChat) **CHƯA có cửa xoá theo DID** tính tới 12/08/2026, cờ `REMOTE_DELETE_ENABLED = false`.
  Đây là khoảng trống thật, không phải suy đoán.
- **Bên thứ ba xác nhận được duy nhất**: Google/Firebase (Firebase Analytics, cả hai nền tảng).
  Các "backend" khác (OriLife, ProofChat, AladinWork, PhoenixKey, LampNet) theo tuyên bố trong
  `src/legal/policyContent.ts` đều là dịch vụ vận hành bởi cùng hệ sinh thái — CHƯA ĐO ĐƯỢC liệu
  Google Play tính các dịch vụ này là "bên thứ 3" hay là hạ tầng của chính nhà phát triển (đây là
  câu hỏi định nghĩa pháp lý, không phải câu hỏi đo được từ mã).
