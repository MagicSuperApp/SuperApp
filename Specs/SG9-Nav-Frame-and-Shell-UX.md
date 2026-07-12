# SG9 — Nav Frame + Shell UX (song ngữ · persona-adaptive · cổng thống nhất)

> **Scope**: L3 (Host Shell/Navigation) · DRAFT v0.1 (2026-07-12) · chờ anh Aladin duyệt, giao Tùng thi công (Tùng phụ trách UI/frontend).
> **Thuộc**: thanh tab dưới (CurvedTabBar) + nút giữa (kế thừa SG4) + vỏ điều hướng khi vào app con.
> **Tuân**: PLATFORM-MASTER INV-2 (data ⟂ experience), INTEGRATION §7.1 (nhãn nav = experience layer, KHÔNG nhét manifest). Phạm vi = CHỈ UI/UX SuperApp; KHÔNG đụng logic module; Wakeme = Wakeme agent.
> **Nguồn hình**: 3 artifact thiết kế — IA blueprint · Nav Frame song ngữ · Mô hình điều hướng sub-app (link cuối tài liệu).

## 0. Một câu định nghĩa
Vỏ điều hướng phải khiến vào một app con (Chat, Farm, Work…) **cảm giác như một app thuần tuý**, mà đổi-app chỉ tốn **một cử chỉ trên MỘT cổng duy nhất** — không dựng hệ điều hướng thứ hai chồng lên cái đã có.

---

## 1. Frame chuẩn song ngữ — ĐÃ THI CÔNG (code kèm PR này)
Quy ước anh Aladin chốt: **tiếng Anh là CHUẨN** (dòng trên, mọi ngôn ngữ) · **ngôn ngữ quốc gia** dòng dưới (chỉ khi app đặt ngôn ngữ đó). "Chat" luôn trên; "Trò chuyện" hiện dưới nếu app = tiếng Việt.

**Kiến trúc** (nguồn DUY NHẤT, thêm dịch vụ = clone 1 dòng):
- `src/navigation/navLabels.ts` — `NAV_FRAME: Record<route, {en, national{vi}, icon, iconActive}>`. Ba map cũ (`TAB_TITLES`, `TAB_ICONS`, `TAB_META`) nay DẪN XUẤT từ đây (hết trùng lặp, hết lệch).
- `src/navigation/NavItemFrame.tsx` — component 1 ô tab, kích thước cố định để mọi tab cân nhau.

**Kích thước frame** (`NAV_FRAME_DIMS`): icon 24 · EN 11/đậm (600, focus 700) · quốc-gia 9/nhạt (opacity .9). Nằm trong `TAB_BAR_HEIGHT=64`, `allowFontScaling=false` để 2 dòng không vỡ.

**Thêm một dịch vụ** (vd Learn/Học hành, Game/Trò chơi) = thêm 1 dòng vào `NAV_FRAME`:
```ts
Learn: { en: 'Learn', national: { vi: 'Học hành' }, icon: 'school-outline', iconActive: 'school' },
```
rồi khai route trong `instance.config.tabs` như các tab khác. KHÔNG sửa navigator, KHÔNG sửa NavItemFrame.

**Nhãn đã sửa lệch**: `ProofChatHome` "Tin nhắn"→**Chat/Trò chuyện**; `Farms` giữ **Farm/Trang trại** (thêm EN); `WorkHome` **Work/Việc làm**; `JoinHome` **Join/Kết đèn**; `Home` **Home/Trang chủ**; `Account` **Account/Tài khoản**.

**Đa ngôn ngữ về sau**: `getNationalLanguage()` là SEAM duy nhất — nay trả `'vi'`; khi có cài đặt ngôn ngữ, đọc setting tại đó, mọi nhãn tự đổi. `LangCode` mở rộng `'th' | 'km' …`.

> Lưu ý tên: module thư mục `trace` (moduleId `magiclamp.trace`) route `Farms` phục vụ **quản lý trang trại** — nhãn nav đúng là **Farm**, KHÔNG phải Trace. Trace (truy xuất) là dịch vụ RIÊNG, xem §3. KHÔNG đổi tên module (ngoài phạm vi UI).

---

## 2. Tab-bar động theo persona — mẫu "NEO cố định + SLOT thích ứng"
Anh Aladin chốt: tab-bar **động theo persona** (nông dân thấy Farm nổi, shipper thấy Work nổi). Rủi ro đã nêu: rối, khó hỗ trợ, lạc khi đổi vai. Thiết kế dưới **khử** rủi ro bằng ràng buộc ổn định.

### 2.1 Cấu trúc 5 ô = 2 NEO + slot
- **NEO (cố định mọi persona)**: `Home` (ô giữa · cổng) · `Chat` (ai cũng nhắn tin) · `Account` (ẩn-nút). → luôn có mặt, luôn cùng vị trí.
- **SLOT thích ứng** (2 ô còn lại): hoán vị/đổi trong tập module đã bật `{Farm, Work, Join}` theo persona.

### 2.2 Persona = `domain(user)` — TÁI DÙNG SG4 (không thêm cơ chế mới)
Dùng đúng hàm suy miền của SG4 (`domain(user)` từ `state.farm` + loài đã đăng ký), CỘNG "nhu cầu khai báo" ở onboarding (§ dưới) làm mặc định KHI CHƯA CÓ dữ liệu:
```
tabs = NEO ∪ topN( rank( modules(domain(user)) , usage(user) ), 2 )
```
- `domain = orchard-*/poultry-*` (có vườn/đàn) → slot = **Farm** (nổi) + Work.
- `domain = worker/shipper` (không farm, có hoạt động Work) → slot = **Work** (nổi) + Join.
- `domain = ∅` (user mới) → **thứ tự chuẩn** hiện tại: Chat · Farm · [Home] · Work · Join.

### 2.3 Ràng buộc ỔN ĐỊNH (khử "rối / lạc khi đổi vai") — BẮT BUỘC
1. **Tập module BẬT không đổi** (`enabledModules` cố định) — chỉ đổi ô HIỂN THỊ + thứ tự. Mọi module vẫn tới được qua cổng/deep-link → KHÔNG có gì biến mất.
2. Tab-bar **KHÔNG đổi giữa phiên theo màn**. Chỉ tái tính khi: (a) onboarding lần đầu, (b) user tự ghim, (c) một domain vượt ngưỡng (vd tạo vườn ĐẦU TIÊN).
3. **Tối đa 1 lần đổi/phiên**, kèm toast một-lần giải thích: "Đã thêm Farm vào thanh vì bạn vừa tạo vườn." KHÔNG bao giờ đảo thầm lặng.
4. **User ghim đè tất cả** (AsyncStorage `nav_tabs_pinned_v1`) — ghim rồi thì persona không đổi nữa.

### 2.4 Thi công
- Hàm thuần `resolveVisibleTabs(farmState, usage, pinned): route[]` — cạnh `buildTabs()`, KHÔNG đụng `instance.config` (config giữ tập đầy đủ; resolver chọn subset hiển thị).
- `CurvedTabBar` render theo `resolveVisibleTabs(...)` thay vì `state.routes` thô; `cx` khuyết-tròn tính lại theo số ô hiển thị (đã có sẵn logic đếm ô).
- Nguồn dữ liệu chỉ ĐỌC (`state.farm`, AsyncStorage) — KHÔNG ghi, KHÔNG chạm logic module.

---

## 3. Trace = NÚT QUÉT NHANH (không chiếm ô tab)
Anh chốt: Trace là **hành động quét tức thời** (soi nguồn gốc BẤT KỲ sản phẩm, cross-platform, phía tiêu dùng), KHÔNG phải nơi user "ở lại" như Chat/Farm.
- Không lên tab. Vào Trace = **nút quét** (icon camera/QR) ở: (a) header Home (góc phải), (b) một mục trong toolbox nút giữa.
- Mở **full-bleed** (immersive), quét xong đóng, trả kết quả → về màn trước. Đúng bản chất "dùng-rồi-thoát".
- Kỹ thuật: route quét KHÔNG vào `tabs[]`, VẪN trong `enabledModules[]` (immersive-by-omission — xem §5.2). Cần wrapper ép nút-back + xử deep-link (quét từ platform khác → mở thẳng màn kết quả).

---

## 4. Cổng điều hướng THỐNG NHẤT — tái dùng nút giữa (KHÔNG dựng hệ thứ hai)
Đề xuất ban đầu (Home nổi + thanh Services riêng + tab kiểu trình duyệt) **trùng** với hệ đã có → hội đồng chốt gộp về MỘT cổng.
- **Cổng = nút tròn giữa đã có** (SG4): **chạm = về Trang chủ** · **kéo = xoè** (persona-adaptive: Trang chủ · các service Chat/Farm/Work/Join · Tài khoản · Trace-quét).
- BỎ "nút Home nổi" + "thanh Services" riêng — đó chính là nút giữa.
- **Nâng overlay xoè lên tầng Stack GỐC** để nổi trên cả màn immersive (hiện overlay vẽ ở gốc app qua Context — xem SG4 §"vì sao không Modal"; cần đảm bảo z-order trên route full-bleed).
- Vào app con = trải nghiệm thuần: màn full-bleed, tab dưới có thể ẩn (như JoinHome đã ẩn), quay ra chỉ qua cổng.

---

## 5. Tab tính-năng NỘI-APP (top tabs) — TÁCH khỏi cổng đổi-app
Nhầm lẫn cốt lõi trong đề xuất ban đầu: trộn "đổi app" (Services) vào hàng "tính năng trong app" (Call/Pins/Docs). Tách bạch 2 TẦNG:
- **Đổi app** = cổng giữa (§4), ở DƯỚI.
- **Tính năng trong app hiện tại** = **tab tĩnh trên ĐỈNH** (material top-tabs), ≤4 mục, chỉ hiện khi app con có nhiều khu:
  - Chat: *Trò chuyện · Gọi · Ghim · Tài liệu* (Chats/Calls/Pins/Docs).
  - Farm: *Vườn · Carbon · Cây · Chăm sóc*.
- KHÔNG dùng ẩn dụ "tab trình duyệt" (sai trên mobile — người dùng không quản lý tab như desktop).

### 5.2 Immersive-by-omission (đã xác minh)
Route non-tab tự push full-bleed; nav KHÔNG đọc `navSlot`. Để một khu thành immersive: KHÔNG cho vào `tabs[]`, CÓ trong `enabledModules[]`. Cần wrapper chung ép nút-back + chặn goBack thoát app khi vào bằng deep-link.

---

## 6. Home tối giản (chờ Tùng — chạm HomeScreen, để Tùng chủ trì)
Anh chốt: Home luôn **gọn nhẹ, ít nút**, không làm ngộp; Quick-Access dời về TỪNG service (chuẩn + thích ứng + ghim).
- **Bỏ số giả**: `src/screens/HomeScreen.tsx:453` `const workMatches = 5;` — số cứng, KHÔNG có nguồn thật → bỏ stat đó (không bịa dữ liệu) HOẶC nối nguồn Work thật nếu rẻ.
- **Bỏ khối Quick Actions Trace khỏi Home** (`HomeScreen` QuickActionSheet ~L62–L80, `handleQuickAdd*` ~L509+) — dời vào Quick-Access của Farm/Trace. Vì khối này gọi handler module (Trace/Farm), Tùng chủ trì để không hụt entry-point trước khi Quick-Access per-service sẵn sàng.
- Home còn: chào + trạng thái ví (thật) + hoạt động gần đây (thật). KHÔNG lưới hành động dày.

---

## 7. Hiệu năng — bật react-native-screens (chờ Tùng, cần test thiết bị)
`react-native-screens` CÓ trong package nhưng CHƯA bật → mọi màn giữ trong cây, tốn RAM máy yếu.
- `enableScreens(true)` + `enableFreeze(true)` ở entry (`index.js`/`App.tsx`).
- `freezeOnBlur: true` cho Tab + Stack (màn không focus ngừng render).
- **Trần tab-sống** máy yếu (LRU): giữ ≤3 tab mounted, đẩy tab cũ (gate theo `adaptive.ts` lowEnd).
- `unmountOnBlur` cho form một-lần (đăng ký cây, PostJob…).
- Gate video/nặng (Feed) theo `adaptive.ts` tier thấp.
> Là đổi HÀNH VI runtime → Tùng bật rồi test trên máy yếu thật trước khi merge.

---

## 8. Trạng thái thi công
| Hạng mục | Trạng thái | Ai |
|---|---|---|
| §1 Frame song ngữ + sửa nhãn lệch | **ĐÃ CODE** (PR này, tsc sạch) | Claude → Tùng review |
| §2 Tab-bar persona-adaptive | Spec xong · code chờ | Tùng |
| §3 Trace nút-quét | Spec xong · code chờ | Tùng |
| §4 Cổng thống nhất (nâng z-order) | Spec xong · code chờ | Tùng |
| §5 Top-tabs nội-app | Spec xong · code chờ | Tùng |
| §6 Home tối giản | Spec xong · chạm HomeScreen | Tùng chủ trì |
| §7 react-native-screens | Spec xong · cần test máy | Tùng |

**KHÔNG thuộc spec này**: logic Wakeme (Wakeme agent), logic xử lý module, mint.

## Artifact tham chiếu (nguồn hình)
- IA blueprint — https://claude.ai/code/artifact/34995120-5d93-44d5-9fd8-994968f8fb4b
- Nav Frame song ngữ — https://claude.ai/code/artifact/42a6b4d3-d04c-4154-a780-7fdfd2f36fc6
- Mô hình điều hướng sub-app — https://claude.ai/code/artifact/e0f6bb39-8760-454e-9085-bedeea90f661
