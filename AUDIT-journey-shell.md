# AUDIT — Cụm Shell + Tài khoản + Ví (orilife-mobile-app)

Ngày: 2026-05-30. Phạm vi: hành trình người dùng sau đăng nhập (MainTabs → Home → Account → BiometricSettings → Ví → Activation/OTP → Đăng xuất).
Phương pháp: CHỈ ĐỌC + grep. Mỗi claim đã xác minh bằng file:dòng.

Lưu ý nền: app KHÔNG persist redux (không có redux-persist; `store/index.ts` chỉ combine reducer). Mở lại app → `currentUser/wallet/phoenixKey` = null. Đây là tiền đề cho nhiều lỗi state-null dưới đây.

---

## P0 — Chặn luồng / sai nghiêm trọng

### P0-1. Đăng xuất KHÔNG reset navigation → quay lại bị kẹt + rò màn cũ
- Bước: Account → "Đăng xuất" → xác nhận.
- File: `src/screens/AccountScreen.tsx:209-211`
  ```
  dispatch(logout());
  navigation.navigate("Login");
  ```
- Lý do: dùng `navigate("Login")` chỉ PUSH màn Login lên trên stack, KHÔNG reset. MainTabs (Home/Account...) vẫn còn mounted phía dưới. Người dùng bấm back (Android hardware back / gesture) sẽ quay lại Account của tài khoản vừa thoát. Vì redux đã `logout()` (currentUser=null) nhưng các tab vẫn sống → hiện UI rỗng/rác. So sánh: LoginScreen sau khi đăng nhập dùng đúng `navigation.reset({ index:0, routes:[{name:'Main'}] })` (`LoginScreen.tsx:206`); logout phải đối xứng dùng `reset` về Login. Cùng mẫu lỗi BiometricSettings ĐÃ dùng `navigation.reset` đúng (`BiometricSettings.tsx:132`).
- Đề xuất: `navigation.reset({ index: 0, routes: [{ name: 'Login' }] })`.
- Phân loại: lỗi code.

### P0-2. Đăng xuất KHÔNG xoá AsyncStorage → rò dữ liệu sang tài khoản khác
- Bước: User A đăng xuất → User B đăng nhập trên cùng máy.
- File: `src/store/userSlice.ts:74-84` (`logoutUser` chỉ `closeDatabase`), reducer `logout` (`:130-135`) chỉ xoá state redux. AccountScreen gọi `logout()` (reducer đồng bộ), KHÔNG gọi cả thunk `logoutUser` → DB của A thậm chí không được đóng.
- Xác minh: grep toàn repo `AsyncStorage.clear|removeItem` trong store/authService/Login → KHÔNG có chỗ nào xoá khi đăng xuất. Các key tồn dư: `biometric_did_map` (`authService.ts:17`, map face/fingerprint → DID của A), `farm_prompt_dismissed` (`HomeScreen.tsx:697`), flag onboarding.
- Lý do: `biometric_did_map` còn trỏ tới DID của A → mở khoá sinh trắc của B có thể map nhầm; `farm_prompt_dismissed` của A che modal tạo vườn của B. Đây là rò dữ liệu giữa người dùng + sai nghiệp vụ.
- Đề xuất: handleLogout phải `await dispatch(logoutUser())` (đóng DB) + xoá các key theo-người-dùng trong AsyncStorage (hoặc namespace theo DID), rồi mới `reset` về Login.
- Phân loại: lỗi code (thiết kế vòng đời phiên).

---

## P1 — Hỏng trải nghiệm rõ rệt / hiển thị rác

### P1-1. Header thừa "BiometricSettings" (thiếu headerShown:false)
- Bước: Account → "Sinh trắc học".
- File: `src/navigation/index.tsx:177` — `<Stack.Screen name="BiometricSettings" .../>` KHÔNG có `options={{ headerShown:false }}`. Navigator có `screenOptions` đặt headerStyle/headerTint nhưng KHÔNG tắt header (`:158-165`).
- Lý do: màn tự vẽ back button + tiêu đề riêng (`BiometricSettings.tsx:197-210`). Kết quả: hiện 2 header — header native mặc định (tiêu đề "BiometricSettings", tên route thô) chồng lên header tự thiết kế. Xác nhận đúng như mô tả task.
- Đề xuất: thêm `options={{ headerShown:false }}`.

### P1-2. Cùng lỗi header thừa: Activation và Activity
- File:
  - `src/navigation/index.tsx:172` `<Stack.Screen name="Activation" .../>` — không headerShown:false, mà `ActivationScreen.tsx:218` tự vẽ back + tiêu đề "Kích hoạt". → 2 header.
  - `src/navigation/index.tsx:188` `<Stack.Screen name="Activity" .../>` — không tắt header (ActivityScreen là màn ghi hoạt động, có UI riêng).
- Lý do/đề xuất: như P1-1, thêm `headerShown:false` cho cả hai để đồng nhất với mọi màn khác (tất cả màn còn lại đều đã đặt `headerShown:false`).
- Phân loại: lỗi code (cấu hình navigation).

### P1-3. Thiếu loading/empty/error state khi tải số dư & hồ sơ
- Bước: mở lại app rồi vào Account khi redux rỗng (chưa kịp/không login lại).
- File: `src/screens/AccountScreen.tsx:296,305,314` — số dư fallback `?? 0`; `:328,334` địa chỉ ví / DID fallback `''`. Không có trạng thái "đang tải".
- Lý do: khi `wallet`/`user` null, màn hiển thị "0 ADA / 0 LAMP / 0 MAGIC" và badge "DID đã xác minh" (`:281`) là HARDCODE — luôn hiện dù chưa có DID. Người dùng thấy số dư 0 giả + "đã xác minh" sai → hiểu nhầm mất tiền / nhầm trạng thái. Không phân biệt "đang tải" vs "thật sự = 0".
- Đề xuất: thêm cờ loading (đã có `state.user.isLoading`) để hiện skeleton; badge "DID đã xác minh" chỉ hiện khi thực có `phoenixKey?.did`/`user?.did`; khi rỗng hiện empty state "Chưa đăng nhập".
- Phân loại: lỗi code (UX/logic hiển thị).

### P1-4. Badge "DID đã xác minh" hardcode, không phản ánh trạng thái thật
- File: `src/screens/AccountScreen.tsx:279-282`. Luôn render bất kể có DID hay không. Mâu thuẫn với dòng `:266` đã phòng thủ "Chưa có DID".
- Đề xuất: bọc điều kiện `{(phoenixKey?.did ?? user?.did) && (...)}`.
- Phân loại: lỗi code.

---

## P2 — Nhỏ / phòng ngừa / phụ thuộc backend

### P2-1. JSON.parse AsyncStorage có try/catch nhưng "nuốt" lỗi im lặng
- File: `src/screens/BiometricSettings.tsx:84, 98, 112` (`JSON.parse(mapStr)` / `JSON.parse(existingStr)`).
- Đánh giá: ĐÃ bọc try/catch (`:79-92`, `:94-106`, `:108-122`) → KHÔNG crash khi dữ liệu hỏng (khác 23 chỗ rủi ro ở repo). Tồn dư: khi map hỏng, `enable/disable` chỉ `showError('Không thể lưu cài đặt')` mà không tự sửa/dọn key hỏng → người dùng kẹt không bật được sinh trắc cho tới khi xoá app. Khuyến nghị: khi parse fail, ghi đè map = `{}` rồi tiếp tục.
- Phân loại: lỗi code (mức thấp).

### P2-2. updateCredits có thể đẩy số dư âm nếu gọi từ nơi khác không kiểm tra
- File: `src/store/userSlice.ts:143-154` — cộng thẳng, KHÔNG kẹp `>= 0`.
- Đánh giá: caller hiện tại `ActivityScreen.tsx:249-251` ĐÃ kiểm tra `user.magicCredits < credits` trước khi trừ (an toàn). Nhưng reducer không tự bảo vệ; caller tương lai quên kiểm tra sẽ tạo số dư âm hiển thị ra Account. Khuyến nghị: kẹp `Math.max(0, ...)` trong reducer hoặc thêm guard. Mức thấp vì hiện chưa có đường rò.
- Phân loại: phòng ngừa (lỗi tiềm ẩn).

### P2-3. Activation/Topup là mock — chưa nối backend
- File: `ActivationScreen.tsx:185-194` (`handleScan` mô phỏng 3s rồi "thành công"), nút "Nạp tín dụng MAGIC" `AccountScreen.tsx:429` không có `onPress`. "Bỏ qua"/"Tiếp tục" đều `navigate('Main')`.
- Đánh giá: phụ thuộc backend chưa có; không phải lỗi code. Ghi nhận để tránh hiểu nhầm là tính năng thật.
- Phân loại: phụ thuộc backend.

### P2-4. Nút Topup không phản hồi khi bấm
- File: `src/screens/AccountScreen.tsx:429-437` — `TouchableOpacity` thiếu `onPress`. Người dùng bấm không có gì xảy ra (vi phạm "feedback ngay khi thao tác").
- Đề xuất: ít nhất `showInfo('Sắp ra mắt', ...)` như nút "Tái sinh danh tính".
- Phân loại: lỗi code (UX nhỏ).

---

## Tổng kết
- P0: 2 — P0-1 (logout không reset → kẹt back + rò màn), P0-2 (logout không xoá AsyncStorage/đóng DB → rò dữ liệu giữa user).
- P1: 4 — P1-1 (header thừa BiometricSettings), P1-2 (header thừa Activation + Activity), P1-3 (thiếu loading/empty/error số dư & hồ sơ), P1-4 (badge "DID đã xác minh" hardcode).
- P2: 4 — JSON.parse nuốt lỗi, updateCredits không kẹp âm, Activation/Topup mock, nút Topup không onPress.
