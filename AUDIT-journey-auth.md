# AUDIT — Hành trình Xác thực / Đăng ký (orilife-mobile-app)

Ngày: 2026-05-30. Phạm vi: Onboarding → Login → SignUp (Biometric → LinkRecovery → Complete) → lõi PhoenixKey → khôi phục phiên.
Phương pháp: chỉ đọc + grep. Mỗi lỗi đã xác minh bằng file:dòng. Phân loại: **lỗi code mobile** vs **phụ thuộc backend/hạ tầng**.

Tổng kết: **5 P0 · 6 P1 · 5 P2**.

---

## P0 — Chặn người dùng

### P0-1. Onboarding bypass hoàn toàn màn Login → vào thẳng app khi chưa đăng nhập
- Bước: mở app lần đầu → Onboarding → bấm "Hoàn thành" hoặc "Bỏ qua".
- File: `src/screens/OnboardingWizard.tsx:96` (`navigation.replace('Main')`), `src/screens/OnboardingWizard.tsx:107-109`; gate ở `src/navigation/index.tsx:137-139`.
- Vì sao lỗi: `AppNavigator` chọn route đầu là `Onboarding` HOẶC `Login`. Khi là `Onboarding`, kết thúc wizard `replace('Main')` đi thẳng vào app, KHÔNG bao giờ qua `Login`. App tự nhận là "login required" (`navigation/index.tsx:123-128`) nhưng người dùng lần đầu chưa hề đăng nhập/tạo danh tính → redux `currentUser` null, không có DID, database chưa init cho user → các màn trong Main đọc `currentUser`/gọi `databaseManager.ensureReady` sẽ ném lỗi hoặc trống. Đây là lỗi logic điều hướng nghiêm trọng nhất của cả luồng.
- Loại: **lỗi code mobile**.
- Sửa đề xuất: kết thúc onboarding phải `replace('Login')`, không `replace('Main')`. (Hoặc tách: onboarding là 1 bước con TRƯỚC Login, login mới `reset` về Main.)

### P0-2. Bước 2 "Liên kết khôi phục" không có đường vào — dead screen, luồng "3 bước" thực chất chỉ 2
- Bước: tạo tài khoản; sau khi sinh khóa xong ở bước 1.
- File: `src/features/auth/screens/SignUpBiometricScreen.tsx:163-166` navigate thẳng `SignUpComplete`; không nơi nào navigate tới `SignUpLinkRecovery` (grep toàn `src/` chỉ thấy khai báo route `navigation/index.tsx:216`).
- Vì sao lỗi: `StepIndicator current={1} total={3}` (bước 1) và `current={3}` (Complete) → người dùng thấy "3 bước" nhưng nhảy 1→3, mất hẳn bước liên kết email/SĐT/OTP. Toàn bộ `SignUpLinkRecoveryScreen` (gửi OTP, verify, modal cảnh báo bỏ qua) là code chết. Đây cũng là rủi ro sản phẩm: tính năng khôi phục được quảng cáo nhưng người dùng không bao giờ thiết lập được trong luồng đăng ký.
- Loại: **lỗi code mobile**.
- Sửa đề xuất: bước 1 navigate `SignUpLinkRecovery` (truyền kèm `user`/`username`); bước 2 mới đi tiếp `SignUpComplete`. Đồng thời xử lý P0-3 vì lúc đó `user` phải được chuyển qua bước 2.

### P0-3. `SignUpComplete.enterApp` vào Main mà không đăng nhập khi thiếu `route.params.user`
- Bước: hoàn tất đăng ký → bấm "Vào ứng dụng".
- File: `src/features/auth/screens/SignUpCompleteScreen.tsx:111-117`.
- Vì sao lỗi: `enterApp` chỉ `dispatch(loginUser(user))` NẾU `route.params?.user` tồn tại, rồi luôn `reset` về Main. Hiện bước 1 có truyền `user` nên tạm ổn; nhưng `SignUpLinkRecovery` navigate `SignUpComplete` chỉ với `{ recoveryLinked }` — KHÔNG có `user` (`SignUpLinkRecoveryScreen.tsx:95,115`). Khi sửa P0-2 để nối lại bước 2, người dùng sẽ vào Main với redux rỗng (chưa login) → database chưa init → các màn Main hỏng. Lỗi tiềm ẩn đã "có sẵn" trong code.
- Loại: **lỗi code mobile**.
- Sửa đề xuất: chuyển `user` xuyên suốt 1→2→3; nếu `enterApp` không có user thì coi là lỗi, điều hướng về Login thay vì vào Main mù.

### P0-4. Login nhánh sai trên iOS: PhoenixKey unlock bị bỏ qua → tạo DID rác mỗi lần
- Bước: màn Login → bấm Khuôn mặt / Vân tay (trên iOS, hoặc bất kỳ thiết bị thiếu native module PhoenixKey).
- File: `src/screens/LoginScreen.tsx:200-211`; `src/services/phoenixKey-native.ts:87` (`isAvailable = !!NativeModules.PhoenixKeyModule`).
- Vì sao lỗi: `isPhoenixKeyAvailable()` chỉ true khi native module Android có mặt (iOS chưa wired — comment `phoenixKey-native.ts:4-6`). Nếu false, login rơi vào `authService.loginWithBiometric` → hàm này **mint một DID giả mới bằng faker** mỗi lần không tìm thấy map (`authService.ts:135-153`). Hệ quả: người dùng iOS đăng ký bằng PhoenixKey (bắt buộc native, sẽ fail trên iOS — xem P0-5) rồi đăng nhập lại được "tài khoản" khác hoàn toàn, không phải danh tính đã tạo. Hai hệ định danh (`STORAGE_USER_DID` của PhoenixKey vs `did_users`/`biometric_did_map` của authService) không khớp nhau.
- Loại: **lỗi code mobile** (logic chọn nhánh + hai nguồn danh tính song song).
- Sửa đề xuất: thống nhất một nguồn danh tính. Login nên ưu tiên `phoenixKeyAuth.unlockExistingIdentity()` khi có DID đã lưu, và chỉ fallback authService một cách CÓ kiểm soát (không tự mint DID rác). Đảm bảo iOS có native module trước khi cho phép luồng PhoenixKey, hoặc khóa luồng PhoenixKey trên iOS.

### P0-5. Đăng ký bắt buộc native PhoenixKey nhưng iOS chưa wired → không tạo được tài khoản trên iOS
- Bước: Login → "Tạo tài khoản" → bước 1, bấm "Bắt đầu xác thực".
- File: `src/features/auth/screens/SignUpBiometricScreen.tsx:151` → `registerIdentity` → `enrollKeypair`/`signRaw` → `phoenixKey-native.ts:28-43` (`moduleNotAvailable` reject trên iOS).
- Vì sao lỗi: `enrollKeypair()` gọi `nativeGenerateKeypair` — trên iOS bridge là stub reject "not available". Lỗi văng ra `startEnrollment` catch (`SignUpBiometricScreen.tsx:167-171`) → hiện thông báo chung "Không tạo được danh tính". Người dùng iOS không thể qua bước này. App `package.json`/`ios/` tồn tại nên iOS là target thực.
- Loại: **lỗi hạ tầng/native (mobile)** — thiếu implementation iOS, nhưng UI vẫn mời người dùng iOS thực hiện.
- Sửa đề xuất: phát hiện platform sớm; nếu native module không có, ẩn/khoá luồng tạo tài khoản PhoenixKey với thông báo rõ ("chưa hỗ trợ trên iOS"), thay vì để fail sâu trong pipeline.

---

## P1

### P1-1. `registerIdentity` gọi `wipeIdentity()` khi BẤT KỲ lỗi nào (kể cả mạng tạm thời) → xóa khóa phần cứng vừa sinh
- Bước: bước 1 đăng ký, mạng chập chờn / server 502 / timeout ngay khi gọi `/identity/register`.
- File: `src/services/phoenixKeyAuthService.ts:52-64`; `wipeIdentity` ở `src/sdk/phoenixKey.ts:176-184`.
- Vì sao lỗi: bất cứ exception nào từ `phoenixKeyApi.identity.register` (gồm lỗi mạng `code -1/httpStatus 0`, 502/504) đều rơi vào `catch` → `await wipeIdentity()` xóa key trong Keystore + xóa DID + xóa session token. Khóa phần cứng vừa sinh (đã qua biometric prompt) bị hủy chỉ vì mạng rớt → người dùng phải làm lại từ đầu (sinh khóa mới, biometric mới). Với nông dân băng thông kém (đúng persona dự án) đây là lỗi gặp thường xuyên.
- Loại: **lỗi code mobile**.
- Sửa đề xuất: chỉ `wipeIdentity()` cho lỗi xác định "server từ chối khóa" (vd 1403 chữ ký sai, 9800 validation). Với lỗi mạng/timeout/5xx: GIỮ khóa, cho người dùng "Thử lại" (gọi lại register với cùng publicKey + signature) thay vì hủy. Tách `isRetriableError(err)` để quyết định.

### P1-2. `friendlyRegisterError` map sai code 9800 → "App phiên bản cũ"
- Bước: bước 1 đăng ký, server trả code 9800 (theo bối cảnh đã verify: 9800 = lỗi validation payload).
- File: `src/services/phoenixKeyAuthService.ts:129-130`.
- Vì sao lỗi: hiển thị "App phiên bản cũ. Cập nhật rồi thử lại." trong khi thực tế là payload sai dạng. Người dùng đi cập nhật app vô ích, lỗi vẫn còn → kẹt. (Bối cảnh đã verify: payload sai → 500 code 9800.)
- Loại: **lỗi code mobile** (error mapping).
- Sửa đề xuất: map 9800 → thông báo trung tính "Dữ liệu gửi không hợp lệ, vui lòng thử lại / cập nhật app" hoặc log kỹ thuật riêng; không khẳng định "phiên bản cũ".

### P1-3. Username chỉ chống trùng cục bộ trên thiết bị, không kiểm tra toàn hệ sinh thái như UI hứa
- Bước: bước 1, nhập username.
- File: `src/features/auth/screens/SignUpBiometricScreen.tsx:73-75` (chỉ so với `existingUsernames` đọc từ `PHOENIX_USERS_KEY` local), text UI "không thể trùng trong toàn hệ sinh thái" (`:240`).
- Vì sao lỗi: backend CÓ endpoint `identity.resolveUsername`/`setUsername` (`phoenixKey-api.ts:222-234`) nhưng luồng đăng ký KHÔNG gọi để kiểm tra trùng/đặt username. UI khẳng định duy nhất toàn hệ thống nhưng thực tế hai máy khác nhau có thể tạo cùng username; username cũng không hề được gửi lên server (chỉ lưu local + redux `name`).
- Loại: **lỗi code mobile** (thiếu tích hợp backend đã sẵn có).
- Sửa đề xuất: gọi `resolveUsername` để kiểm tra trùng realtime (debounce) và `setUsername` sau khi có session; hoặc sửa text UI cho đúng phạm vi "trên thiết bị này" nếu chủ ý chưa nối backend.

### P1-4. Double-navigate sau đăng ký do `setTimeout` không hủy + `dispatch` không await race
- Bước: bước 1 thành công; người dùng bấm back hoặc thoát màn trong 600ms chờ.
- File: `src/features/auth/screens/SignUpBiometricScreen.tsx:161-166`.
- Vì sao lỗi: `await dispatch(loginUser(...))` rồi `setTimeout(navigate, 600)`. `setTimeout` không được clear khi unmount → nếu component unmount (back) trong 600ms, navigate vẫn chạy → cảnh báo "navigate on unmounted" / điều hướng ngoài ý muốn. Ngoài ra `stage` chuyển 'done' và nút bị disable nhưng back button header chỉ disable khi `stage!=='idle'` — ở 'done' vẫn disable, nhưng cử chỉ vuốt (gesture) màn này không bị khóa (chỉ `SignUpComplete` có `gestureEnabled:false`).
- Loại: **lỗi code mobile**.
- Sửa đề xuất: lưu id `setTimeout` vào ref và clear trong cleanup; hoặc navigate ngay sau khi `dispatch` xong, bỏ delay trang trí.

### P1-5. Email recovery OTP là giả (mock) nhưng UI báo "đã gửi/đã liên kết thành công"
- Bước: bước 2 (khi được nối lại), chọn kênh Email → gửi OTP → nhập 4+ số → xác nhận.
- File: `src/features/auth/screens/SignUpLinkRecoveryScreen.tsx:66-70, 91-95` (`await delay(...)` thay cho gọi backend), `:53` (`minOtpLen = 4` cho email).
- Vì sao lỗi: nhánh email chỉ `delay()` rồi báo "Liên kết thành công" — không có băm blind_index, không gửi server, chấp nhận bất kỳ 4 chữ số. Người dùng tin đã liên kết khôi phục nhưng thực tế KHÔNG có gì được lưu → khi mất thiết bị sẽ mất tài khoản dù "đã liên kết". UX dối. (Phone OTP qua Firebase là thật.)
- Loại: **lỗi code mobile + phụ thuộc backend** (chờ endpoint email OTP).
- Sửa đề xuất: cho tới khi có backend email OTP, vô hiệu hóa tab Email (disabled + nhãn "sắp có"), chỉ cho phép Phone. Không hiển thị "thành công" cho thao tác không thực.

### P1-6. `unlockExistingIdentity` và `loginWithBiometric` dùng hai kho danh tính khác nhau → "đổi tài khoản" ở Login không tác động nhánh PhoenixKey
- Bước: Login, có nhiều account demo, bấm "Đổi tài khoản", rồi đăng nhập.
- File: `src/screens/LoginScreen.tsx:300-316` (ghi `ACTIVE_USERNAME_KEY`) vs `unlockExistingIdentity` đọc DID từ `STORAGE_USER_DID` (`phoenixKeyAuthService.ts:77-82`, `phoenixKey.ts:70-71`).
- Vì sao lỗi: nút "Đổi tài khoản" chỉ đổi `ACTIVE_USERNAME_KEY` (dùng để hiển thị tên), nhưng khi đăng nhập qua PhoenixKey, `unlockExistingIdentity` luôn lấy `STORAGE_USER_DID` (DID đăng ký gần nhất) — không liên quan username active. Người dùng chọn account A nhưng đăng nhập vào account B (DID lưu cuối). Hai nguồn danh tính không đồng bộ (xem P0-4).
- Loại: **lỗi code mobile**.
- Sửa đề xuất: lưu DID theo username trong `PHOENIX_USERS_KEY` (đã có `did`), khi đổi account cập nhật cả `STORAGE_USER_DID = entry.did`; hoặc unlock theo did của `activeUser`.

---

## P2

### P2-1. Spinner chờ onboarding gate có thể kẹt nếu `shouldShowOnboarding` không resolve
- File: `src/navigation/index.tsx:120,137-153`. `initialRoute` để `null` cho tới khi promise resolve; nếu AsyncStorage treo (hiếm), màn spinner đứng vĩnh viễn, không timeout. Hàm đã try/catch nội bộ nên rủi ro thấp → P2. Sửa: thêm timeout fallback về 'Login'.

### P2-2. `isSensorAvailable` lỗi trên Login chỉ log, để `sensorAvailable=false` mặc định → vẫn cho bấm rồi hiện thông báo "lập danh tính tạm thời"
- File: `src/screens/LoginScreen.tsx:171-180, 195-199`. Khi sensor check throw, state giữ false; bấm biometric không prompt mà rơi vào authService mint DID rác (liên hệ P0-4). UX khó hiểu. Sửa: phân biệt "không có sensor" vs "lỗi kiểm tra".

### P2-3. `delay()` helper khai báo nhưng không dùng trong SignUpBiometricScreen (dead code)
- File: `src/features/auth/screens/SignUpBiometricScreen.tsx:348`. `const delay` không được tham chiếu. Dead code, vi phạm tiêu chuẩn "xóa logic thừa". Sửa: xóa.

### P2-4. OTP input email hiển thị placeholder "6 chữ số" và `maxLength={6}` nhưng `minOtpLen` email = 4
- File: `src/features/auth/screens/SignUpLinkRecoveryScreen.tsx:53, 210-220`. Người dùng email được nút bật khi đủ 4 số dù ô ghi "6 chữ số" → mâu thuẫn nhãn (gắn với P1-5). Sửa: đồng bộ nhãn theo kênh.

### P2-5. `RegisterResponse.userId` khai báo nhưng `registerIdentity` không đọc/không lưu
- File: `src/services/phoenixKey-api.ts:26-30` vs `phoenixKeyAuthService.ts:59`. `userId` server trả về bị bỏ; chỉ dùng `userDid`. Không gây lỗi ngay nhưng nếu sau này cần `userId` cho API khác sẽ thiếu. Loại: ghi chú/cần xác nhận nghiệp vụ. Sửa: lưu `userId` nếu backend coi là khóa chính.

---

## Ghi chú phân định mobile vs backend
- Backend `api.phoenixkey.me` đã sống và đáp nhanh (bối cảnh đã verify) → các P0/P1 ở trên đều là **logic mobile** (điều hướng, chọn nhánh, error mapping, xử lý lỗi), KHÔNG phải lỗi backend.
- Phụ thuộc hạ tầng thực sự: P0-5 (thiếu native PhoenixKey iOS) và P1-5 (thiếu endpoint email OTP).
