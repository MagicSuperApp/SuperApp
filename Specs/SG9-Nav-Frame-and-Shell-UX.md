# SG9 — Nav Frame + Shell UX (song ngữ · persona-adaptive · cổng thống nhất)

> **Scope**: L3 (Host Shell/Navigation) · DRAFT v0.1 (2026-07-12) · chờ anh Aladin duyệt, giao Tùng thi công (Tùng phụ trách UI/frontend).
> **Thuộc**: thanh tab dưới (CurvedTabBar) + nút giữa (kế thừa SG4) + vỏ điều hướng khi vào app con.
> **Tuân**: PLATFORM-MASTER INV-2 (data ⟂ experience), INTEGRATION §7.1 (nhãn nav = experience layer, KHÔNG nhét manifest). Phạm vi = CHỈ UI/UX SuperApp; KHÔNG đụng logic module; Wakeme = Wakeme agent.
> **Nguồn hình**: `Specs/_mockups/nav-shell-ux.html` — mô phỏng tương tác (persona · ánh sáng · SubHome · nút xoè). Xem cuối tài liệu.

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

**Nhãn đã sửa lệch**: `ProofChatHome` "Tin nhắn"→**Chat/Trò chuyện**; `Farms` giữ **Farm/Trang trại** (thêm EN); `WorkHome` **Work/Việc làm**; `JoinHome` **Join/Kết đèn**; `Home` **Home/Trang chủ**; `Account` "Tài khoản"→**Me/Tôi**.

**Tab "Me/Tôi" = AVATAR user** (anh chốt): thay icon đơn điệu bằng ảnh đại diện tròn. `NavItemFrame` nhận `avatarUri` (ảnh) hoặc `initials` (chữ viết tắt tên, fallback khi chưa có ảnh — app hiện dùng initials từ `user.name`, xem `AccountScreen`); không có nốt thì về icon mặc định. Viền avatar sáng khi focus. → Tùng nối `avatarUri` từ hồ sơ user khi có ảnh; trước mắt dùng `initials`.

**Đa ngôn ngữ về sau**: `getNationalLanguage()` là SEAM duy nhất — nay trả `'vi'`; khi có cài đặt ngôn ngữ, đọc setting tại đó, mọi nhãn tự đổi. `LangCode` mở rộng `'th' | 'km' …`.

> Lưu ý tên: module thư mục `trace` (moduleId `magiclamp.trace`) route `Farms` phục vụ **quản lý trang trại** — nhãn nav đúng là **Farm**, KHÔNG phải Trace. Trace (truy xuất) là dịch vụ RIÊNG, xem §3. KHÔNG đổi tên module (ngoài phạm vi UI).

---

## 2. Tab-bar động theo persona — mẫu "NEO cố định + SLOT thích ứng"
Anh Aladin chốt: tab-bar **động theo persona** (nông dân thấy Farm nổi, shipper thấy Work nổi). Rủi ro đã nêu: rối, khó hỗ trợ, lạc khi đổi vai. Thiết kế dưới **khử** rủi ro bằng ràng buộc ổn định.

### 2.1 Cấu trúc 5 ô = 3 NEO + 2 slot
Bố cục: `Chat · [slot] · (Home) · [slot] · Me`.
- **NEO (cố định mọi persona)**: `Home` (ô giữa · cổng) · `Chat` (đầu trái — ai cũng nhắn tin) · **`Me`** (đầu phải — **AVATAR** user, anh chốt; thay ô "Tài khoản ẩn" cũ thành neo HIỂN THỊ). → luôn có mặt, luôn cùng vị trí.
- **SLOT thích ứng** (2 ô trong): hoán vị/đổi trong tập module đã bật `{Farm, Work, Join}` theo persona; module dôi ra (thứ 3) nằm trong **cổng xoè** (§4), KHÔNG biến mất.
> Ghi chú thi công cho Tùng: hiện code giữ `Account` là tab ẩn-nút (notch `cx` tính theo số ô hiển thị). Đưa `Me` thành ô hiển thị = bỏ `Account` khỏi danh sách ẩn + tính lại `cx` cho 5 ô (2 trái + giữa + 2 phải). Frame + avatar đã sẵn (`NavItemFrame` nhận `initials`/`avatarUri`).

### 2.2 Persona = `domain(user)` — TÁI DÙNG SG4 (không thêm cơ chế mới)
Dùng đúng hàm suy miền của SG4 (`domain(user)` từ `state.farm` + loài đã đăng ký), CỘNG "nhu cầu khai báo" ở onboarding (§ dưới) làm mặc định KHI CHƯA CÓ dữ liệu:
```
tabs = NEO ∪ topN( rank( modules(domain(user)) , usage(user) ), 2 )
```
- `domain = orchard-*/poultry-*` (có vườn/đàn) → `Chat · Farm · (Home) · Work · Me` (Farm nổi; Join trong cổng).
- `domain = worker/shipper` (không farm, có hoạt động Work) → `Chat · Work · (Home) · Join · Me` (Work nổi; Farm trong cổng).
- `domain = ∅` (user mới) → **chuẩn**: `Chat · Farm · (Home) · Work · Me` (Join trong cổng).

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

**Đã thi công**:
- Màn `screens/TraceScanScreen.tsx` — full-bleed, tái dùng camera `react-native-camera-kit` (như WebLoginScan). Nhận diện được → **REPLACE** bằng màn CHI TIẾT đã có (TreeDetail/FarmDetail/AnimalDetail) nên back về thẳng nơi khởi động; không nhận diện → báo + quét lại. Nút-back an toàn (`canGoBack` → về `Main` nếu mở bằng deep-link, không thoát app).
- Phân giải mã: `navigation/traceScan.ts` — hàm thuần `parseTraceCode` (chỉ nhận `magiclamp://…`, whitelist đích, tách params). Route quét host stack `TraceScan` (`headerShown:false`, KHÔNG vào tabs).
- Entry points: (a) nút **qrcode-scan** ở AppHeader — CHỈ hiện ở Trang chủ; (b) mục **Trace-quét** trong cổng §4 (`TRACE_SCAN_ROUTE` đã bật).
- Deep-link: `magiclamp://trace-scan` mở màn quét; màn CHI TIẾT sản phẩm Aladin đã deep-link-được sẵn (buildLinking map route module) → quét NGOÀI app mở thẳng màn kết quả.
- ⏳ Còn: luồng truy xuất sản phẩm NGOÀI hệ Aladin (mã không phải `magiclamp://`) cần backend provenance — để mở khi có API; hiện hiện trạng thái "chưa nhận diện". Test camera trên máy thật.

---

## 4. Cổng điều hướng THỐNG NHẤT — tái dùng nút xoè của Tùng (KHÔNG dựng hệ thứ hai)
Đề xuất ban đầu (Home nổi + thanh Services riêng + tab kiểu trình duyệt) **trùng** với hệ đã có → hội đồng chốt gộp về MỘT cổng.
- **Cổng = nút tròn giữa đã có** (SG4): **chạm = về Trang chủ** · **kéo = xoè** (persona-adaptive: Trang chủ · các service Chat/Farm/Work/Join · Me · Trace-quét).
- **TÁI DÙNG nút xoè arc của Tùng** (SG4 `HomeRadialOverlay` — cung tròn lấy nút giữa làm tâm, đường nối trắng, giữ-1s để ghim; anh Aladin khen đẹp). ĐÚNG cái Tùng đã làm để phóng hành động quét/định danh — nay dùng chung cho ĐỔI-SERVICE. Không vẽ menu mới; chỉ nạp thêm mục service vào cùng cung.
- BỎ "nút Home nổi" + "thanh Services" riêng — đó chính là nút giữa.
- **Nâng overlay xoè lên tầng Stack GỐC** để nổi trên cả màn immersive (hiện overlay vẽ ở gốc app qua Context — xem SG4 §"vì sao không Modal"; cần đảm bảo z-order trên route full-bleed).
- Vào app con = trải nghiệm thuần: màn full-bleed, tab dưới có thể ẩn (như JoinHome đã ẩn), quay ra chỉ qua cổng.

**Điều chỉnh menu arc (anh Aladin chốt, đã code)**:
- **Trace-quét = mục NỔI BẬT nằm CHÍNH GIỮA cung** (icon to hơn + vành sáng). **BỎ "Me/Tôi" khỏi cung** (Me tới qua ô tab dưới).
- **Menu NHIỀU TẦNG**: **GIỮ 0.5s** trên 1 module có hành-động-nhanh (Chat/Farm) → **tự mở arc con tầng-2** + **GHIM** đường nối gấp khúc. Kéo về gần tâm → thu. **Thả trúng mục con = CHẠY NGAY tính năng** (điều hướng thẳng route đích, KHÔNG mở lại màn module); thả không trúng → huỷ.
- **Nội dung arc con = HÀNH ĐỘNG NHANH** (`SUB_ACTIONS` trong `resolveGateItems.ts`), route đích THẬT: Farm → *Quét cây (TreeIdentity) · Quét con vật (AnimalManagement) · Quét nhãn thuốc (CareScan) · Thêm vườn (FarmDetail)*; Chat → *Mở ví (ProofChatWallet) · Thông báo (Notifications)*. Thêm hành động = thêm 1 dòng.
- **Arc con = CUNG ĐỒNG TÂM (cùng nút giữa) bán kính LỚN HƠN, ÔM TRỌN arc chính** (không phải cung nhỏ quanh mục); có **nền dải cung như arc chính** (`bandSub`, hơi nhạt hơn để phân lớp).
- **Đường nối trắng GẤP KHÚC + GHIM** tại mục cha: nút giữa → mục cha (khuỷu) → ngón (ra cung ngoài).
- **Tăng giữ-đặt-mặc-định lên 2 giây** (`DWELL_MS`); mục có SubHome dùng 0.5s mở-arc-con thay cho đặt-mặc-định.
- Nguồn: `resolveGateItems.ts` (thứ tự + prominent + subApp) + `index.tsx` (gesture 2 tầng + overlay bent-connector/sub-arc). Tầng-2 CHỈ áp dụng cử chỉ KÉO (chế độ dính giữ 1 tầng). ⏳ Cần **test trên máy thật** (cử chỉ/hình học) + wire `subTab` vào màn app con khi §5 lên.

**Chốt thi công (Q&A với anh Aladin)**:
- **Cung = SERVICE THUẦN** (thay hẳn menu hành động SG4). Nguồn: `navigation/resolveGateItems.ts` — persona-adaptive: `Home · Chat · [Farm/Work/Join theo persona]` (+ Trace giữa). Màu mục = brand token mỗi service (không hardcode hex). Wire vào `CurvedTabBar` (thay `resolveActions`); overlay/cử chỉ/ghim-mặc-định của Tùng GIỮ NGUYÊN, chỉ đổi nguồn mục + thêm tầng-2.
- **Trace-quét**: `TRACE_SCAN_ROUTE = null` (màn quét tiêu dùng thuộc §3, chưa dựng) → item tự ẩn; khi §3 có route, gán 1 dòng là item hiện trong cổng.
- **JoinHome giữ ẩn navbar** (immersive): KHÔNG đổi — Join có nút back riêng ở header (`navigation.goBack()`) nên không thành ngõ cụt.
- **z-order**: overlay đã vẽ ở ROOT (`AppNavigator`, sibling sau `Stack.Navigator`, zIndex/elevation 9999) → đã nổi trên full-bleed; là verify-item, không cần đổi code.

---

## 5. Tab tính-năng NỘI-APP (SubHome) — KHUNG THU GỌN, không choán màn
Nhầm lẫn cốt lõi trong đề xuất ban đầu: trộn "đổi app" (Services) vào hàng "tính năng trong app". Tách bạch 2 TẦNG:
- **Đổi app** = cổng giữa (§4), ở DƯỚI.
- **Tính năng trong app hiện tại** = **SubHome trên ĐỈNH**, thu gọn.

### 5.1 Khung SubHome thu gọn (anh chốt: đừng để tab choán hết màn)
- Mặc định hiện **3 tab quen thuộc** (top-3 theo tần suất dùng của user trong app đó) + **1 nút RẤT NHỎ** (chevron ⌄) ở mép phải.
- Chạm chevron → **sổ ra dropdown** các tab con còn lại NGAY DƯỚI khung (overlay mỏng, KHÔNG đẩy nội dung, KHÔNG toàn màn). Chọn xong tự thu.
- Chiều cao khung ~40dp, dính đỉnh, nền theo brand-color của app con (mờ), chữ theo frame chuẩn.
- Ví dụ Chat (Chats/Calls/Pins/Docs): hiện *Trò chuyện · Gọi · Ghim* + ⌄(Tài liệu…). Farm (Vườn/Carbon/Cây/Chăm sóc): hiện *Vườn · Cây · Chăm sóc* + ⌄(Carbon…).
- KHÔNG ẩn dụ "tab trình duyệt" (sai trên mobile).

### 5.2 SubHome frame CHUẨN (song song NavItemFrame)
Như tab dưới có `NavItemFrame`, SubHome có **`SubHomeFrame`** — nguồn duy nhất cho tab con:
- `src/navigation/subHomeLabels.ts` — `SUBHOME_FRAME: Record<appRoute, SubTab[]>`, mỗi `SubTab = {en, national{vi}, icon}` (cùng quy ước song ngữ, nhưng SubHome 1 dòng gọn: EN chuẩn, quốc gia là tooltip/ngữ cảnh — tiết kiệm cao).
- `src/navigation/SubHomeFrame.tsx` — render khung thu gọn + chevron + dropdown. Thêm khu cho app con = clone 1 dòng `SubHomeFrame` cho route đó.
- Top-3 hiển thị = `rank(subtabs, usage)`; phần dư vào dropdown. Ghim được (AsyncStorage `subhome_pinned_<app>`).

### 5.3 Immersive-by-omission (đã xác minh)
Route non-tab tự push full-bleed; nav KHÔNG đọc `navSlot`. Để một khu thành immersive: KHÔNG cho vào `tabs[]`, CÓ trong `enabledModules[]`. Cần wrapper chung ép nút-back + chặn goBack thoát app khi vào bằng deep-link.

---

## 5B. Vòng dịch vụ QUAY ĐƯỢC (rotary ring) — chứa hàng trăm, không ngộp
Anh Aladin chốt hướng: cổng xoè + nav tầng-2 phải chứa được **rất nhiều** mục (một service có nhiều thứ) mà **màn hình vẫn chỉ hiện số ít, không rối mắt**.

### 5B.1 Nguyên lý
Cung xoè (§4) nâng cấp thành **vòng quay** (radial carousel / mặt số xoay):
- **Chỉ một CỬA SỔ cố định** (đề xuất 5–7 mục) hiện trong cung tại một thời điểm → không bao giờ ngộp, dù danh sách đầy đủ có hàng trăm.
- **Xoay THEO chiều kim đồng hồ** (kéo tiếp tuyến CW) → cuộn tới → lộ dần các dịch vụ ÍT dùng ("hàng trăm bên dưới"). **Xoay NGƯỢC** → quay về nhóm **thường dùng** (trạng thái nghỉ).
- **Trạng thái nghỉ = mục thường dùng + ghim** (xếp theo `usage`), để cơ-bắp nhớ vị trí; đuôi dài nằm sâu trong vòng, xoay mới thấy. Hai đầu cung **mờ dần** (mục vào/ra êm).
- **Chọn** = kéo RA XA rồi thả trúng mục (giữ đúng cử chỉ Tùng đã có). **Về Home ngay** = **chạm nút TÂM** bất cứ lúc nào.

### 5B.2 Phân tầng — vòng lồng vòng (nav tầng-2 CŨNG THẾ)
Cùng một tương tác cho mọi tầng; nút tâm = về Home (chạm) / lùi 1 tầng (giữ):
- **L1** (cổng): service — Chat · Farm · Work · Join · **Wallet · SPO** · … (đuôi dài = dịch vụ cộng đồng).
- **L2** (trong 1 service): ví dụ **Wallet → Phoenix · Standard**; **SPO → Wallet · Pool · Fund · Voting** (+ cntools mở rộng, xem 5B.4).
- **L3** (trong 1 ví): **Send · Receive · Staking · Voting**.

### 5B.3 Khi nào bật vòng quay (đừng dùng quá tay)
- Danh sách **≤ cửa sổ** (vd ≤7 service lõi) → cung tĩnh như hiện tại, KHÔNG cần xoay.
- Danh sách **> cửa sổ** (Wallet-tools, SPO, hàng trăm dịch vụ) → bật rotary. Tự động theo số mục, không phải hai component khác nhau.

### 5B.4 Tab SPO — bám cntools (Guild Operators) để chuẩn hoá
Anh liệt kê SPO: Wallet · Pool · Fund · Voting — đây đúng 4 nhóm chính của **cntools**. Bộ đầy đủ (để PhoenixKey map khi build):

| Nhóm cntools | Ý nghĩa | Tab con gợi ý (L3) |
|---|---|---|
| **Wallet** | quản lý ví node | New/Import · List · Show · Delegate · Encrypt/Decrypt |
| **Funds** | dòng tiền | Send · Delegate · Withdraw Rewards |
| **Pool** | vận hành pool | New · Register · Modify · Retire · Show · Rotate KES |
| **Vote** | quản trị on-chain (Conway/CIP-1694, thêm mới — dời khỏi menu Pool) | Governance actions · DRep (uỷ/đăng ký) |
| Transaction | ký/gửi giao dịch (hybrid/offline) | Sign · Submit |
| Blocks | lịch leader + thống kê block đúc | — |
| Backup | sao lưu/khôi phục ví·pool·config | — |
| Advanced | metadata · multi-asset (mint token) | — |

→ Nguồn: cntools main menu = Wallet · Funds · Pool · Transaction · Blocks · **Vote** · Backup · Advanced (docs Guild Operators + changelog, verify 2026-07-13). 4 nhóm anh nêu (Wallet/Pool/Fund/Vote) là **cửa sổ nghỉ** của vòng SPO; Transaction/Blocks/Backup/Advanced nằm phần **xoay tới**. Lưu ý: cntools Vote = quản trị CIP-1694 (DRep/governance action), KHÔNG phải Project Catalyst (app bỏ phiếu quỹ riêng). Nội dung công cụ SPO/ví là **PhoenixKey build** — SG9 chỉ thiết kế VỎ chứa (vòng quay + tầng), không đụng logic ví/pool.

### 5B.5 Khả thi + rủi ro (thật)
- **Khả thi RN**: `HomeRadialOverlay` đã có geometry cung + PanResponder. Thêm: kéo **tiếp tuyến** → góc xoay danh sách; kéo **hướng tâm-ra** → chọn (đã có). Cần ngưỡng phân biệt 2 cử chỉ (trục nào trội).
- **Rủi ro & giảm thiểu**: (a) *lẫn cử chỉ* xoay↔chọn → ngưỡng góc/bán kính + snap-to-mục; (b) *khó phát hiện đuôi dài* → chấm/khía quanh vòng báo "còn nữa" + quán tính vẩy; (c) *độ chính xác màn nhỏ* → giới hạn cửa sổ + hit-target to; (d) *tiếp cận* → fallback danh sách phẳng cho screen-reader; (e) *hiệu năng* → ảo hoá, chỉ render cửa sổ + lân cận.
- **Trạng thái**: THIẾT KẾ (spec) — giao Tùng dựng khi §4 cổng đã ổn trên máy thật. Không chặn merge PR hiện tại.

---

## 6. Home tối giản — LÀM NGAY (PR follow-up, Tùng chủ trì)
Anh chốt: Home luôn **gọn nhẹ, ít nút**, không làm ngộp. **KHÔNG hoãn tới khi có Quick-Access hoàn chỉnh** — rà lại thấy phần lớn Home-trim KHÔNG bị chặn (cổng xoè §4 đã gánh gần hết hành động).

**Đã làm ✅:** bỏ số giả — xoá stat "Việc làm phù hợp" (`workMatches` cứng); ProofChat nối tin-chưa-đọc THẬT; hàng "Ví của tôi" số dư THẬT (`selectChainWallet` → "Chưa đồng bộ" nếu chưa có).

**Làm NGAY ở PR kế (không chặn — cổng đã có lối):**
1. **Gỡ carousel + lưới "Dịch vụ" dày** (`HomeScreen.tsx:791` BannerCarousel, `:878–898` moduleGrid + LayoutToggle) — thuần nội dung Home, KHÔNG phụ thuộc gì. Đổi-service đã có ở thanh tab + cổng xoè.
2. **Gỡ hàng quick-action Tree/Fruit/Animal/Farm** (`:798–877`) — 3/4 hành động ĐÃ nằm trong cổng tier-2 (`resolveGateItems.ts:66–69`: Quét cây·con vật·nhãn thuốc·Thêm vườn). **Chỉ cần thêm 1 dòng "Quét quả → Fruit" vào `SUB_ACTIONS.Farms`** để không mất chức năng, rồi gỡ hàng khỏi Home.
3. **Home còn lại (mục tiêu):** chào + trạng thái ví (thật) + hoạt động gần đây (thật) + tối đa 1 lối vào nhẹ. Hết ngộp.

> Vì các nút gọi handler module (Trace/Farm) nên **Tùng chủ trì** thi công; SG9 lo phần cổng (thêm "Quả"). Quick-Access per-service (bản thích ứng+ghim đầy đủ) vẫn là đợt sau — nhưng Home-gọn KHÔNG chờ nó.

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

## 8. Màu TƯƠI + thích ứng ánh sáng (bảo vệ mắt) — anh chốt
Anh chốt: màu phải **tươi tắn, hấp dẫn**; độ sáng/màu **thích ứng theo dòng máy + điều kiện ánh sáng**, bảo vệ mắt, cảm giác hài hoà.

### 8.1 Palette tươi (giữ ADN xanh–coral, nâng độ sống)
Kế thừa token hiện có (navbar `#264E7E`, accent `#3B6EA8`, hero coral `#E5674E`, brand xanh-lá `#2B7A39`, vàng `#D9A227`), nâng "độ tươi" bằng cặp accent sáng cho trạng thái mở/nổi (KHÔNG đổi token nền hệ thống):
- Chat → xanh ngọc tươi · Farm → xanh lá tươi · Work → hổ phách · Join → tím-lam điện. Mỗi service một "màu sống" riêng để tab focus + SubHome bắt mắt mà tổng thể vẫn hài hoà (một tông xanh chủ đạo + điểm ấm).
- Tab focus: icon + nhãn dùng màu sống của service; nghỉ: trắng mờ. → thanh nav "có sức sống", không đơn sắc.

### 8.2 Thích ứng luminance 3 chế độ (seam ở theme)
Thêm trục `luminance: 'day' | 'dim' | 'night'` cạnh `adaptive.ts` (đang lo device-tier). Bảo vệ mắt:
- **day**: nền sáng, tương phản cao (đọc ngoài nắng).
- **dim/night**: nền tối + **giảm nhiệt độ màu** (warm-shift, bớt xanh lam) + hạ độ chói → đỡ mỏi mắt ban đêm.
- Nguồn quyết định (ưu tiên rẻ, không xin quyền thừa): `Appearance` (light/dark hệ điều hành) → khung giờ → (tuỳ chọn) cảm biến sáng nếu máy có. User override được.
- Kỹ thuật: định nghĩa token theo `luminance` trong theme (như đã có light/dark), wire qua `setActiveThemeConfig()`. Frame/SubHome đọc token → tự đổi. **KHÔNG hardcode hex** trong component (NavItemFrame đã nhận màu qua prop).
> "Thích ứng dòng máy" = `adaptive.ts` (tier) + `luminance` (ánh sáng). Máy yếu: bỏ chuyển màu mượt, vẫn đổi token tĩnh.

## 9. Trạng thái thi công
| Hạng mục | Trạng thái | Ai |
|---|---|---|
| §1 Frame song ngữ + sửa nhãn lệch (gồm Me/Tôi + avatar) | **ĐÃ CODE** (PR này, tsc sạch) | Claude → Tùng review |
| §2 Tab-bar persona-adaptive | **KHUNG ĐÃ CODE** (tsc sạch · 12 unit-test xanh) · ⚠ thích ứng runtime hiện **NO-OP** — `usage` chưa nối nguồn Work → mọi user thấy thanh TĨNH `Chat·Farm·Home·Work·Me` (`'farmer'`=`'new'` layout); ràng buộc "1 đổi/phiên + toast" là **seam ngủ** tới khi có slice usage | Tùng |
| §3 Trace nút-quét | **ĐÃ CODE** (màn quét + nút Home header + mục cổng §4 + deep-link · tsc sạch · 7 unit-test xanh) · chờ test camera máy thật | Tùng |
| §4 Cổng thống nhất (tái nút xoè Tùng, nâng z-order) | **ĐÃ CODE** cung = service thuần + **arc con 2 tầng (hành động nhanh)** + Trace nổi bật giữa · z-order ở root (tsc sạch · 8 unit-test xanh) · chờ test cử chỉ máy | Tùng |
| §5 SubHome thu gọn + SubHomeFrame | **ĐÃ CODE** khung (tsc sạch · 10 unit-test xanh) · chờ wire vào màn app con | Tùng |
| §6 Home tối giản | **BỎ số bịa xong** + ví/ProofChat THẬT · **LÀM NGAY PR kế** (không hoãn): gỡ carousel + lưới + hàng quick-action (cổng đã gánh; thêm "Quả" vào cổng) | Tùng chủ trì |
| §7 react-native-screens | Spec xong · cần test máy | Tùng |
| §8 Màu tươi + luminance | Spec xong · code chờ | Tùng |
| Mô phỏng HTML (`_mockups/nav-shell-ux.html`) | **ĐÃ CÓ** | Claude |

**KHÔNG thuộc spec này**: logic Wakeme (Wakeme agent), logic xử lý module, mint.

## 10. Ghi chú triển khai & tinh chỉnh — giữ CHUẨN UI/UX navbar
Mục này chốt CÁCH thi công (đã code) sao cho vừa bám spec vừa giữ navbar chuyên nghiệp, để review + mở rộng về sau không lệch.

### 10.1 Nguyên tắc UI/UX chuyên nghiệp (bất biến khi sửa)
1. **Một nguồn sự thật / thêm = 1 dòng**: nhãn+icon nav (`navLabels.NAV_FRAME`), tab con (`subHomeLabels.SUBHOME_FRAME`), mục cổng + hành động nhanh (`resolveGateItems`: `SERVICE_TINT`/`SUB_ACTIONS`). Thêm dịch vụ/hành động KHÔNG sửa navigator, KHÔNG sửa component vẽ.
2. **Tách LOGIC THUẦN khỏi VẼ**: mọi quyết định (persona → ô hiển thị, xếp hạng tab con, nội dung cổng, phân giải mã quét) là hàm thuần, **có unit-test** (`resolveVisibleTabs` · `subHomeLabels` · `resolveGateItems` · `traceScan` — 37 test). Component chỉ nhận kết quả rồi vẽ → dễ đổi hình mà không sợ vỡ logic.
3. **KHÔNG hardcode màu**: mọi màu qua **brand token** (`*_THEME`, `COLORS`, `withAlpha`) — sẵn sàng cho §8 (màu tươi + luminance) đổi token là navbar tự đổi. Ngoại lệ còn lại (trắng/đen trong overlay xoè, màn quét) là kế thừa mẫu cũ, gom về token khi làm §8.
4. **Ổn định > "thông minh"**: thanh persona **đóng băng theo phiên**, tối đa 1 đổi/phiên + toast (khử "rối/lạc khi đổi vai", §2.3). User **ghim đè** tất cả.
5. **Cân đối hình học**: nút Home luôn rơi đúng khuyết-tròn (`cx` tính theo số ô resolver trả). Frame cố định kích thước (`NAV_FRAME_DIMS`) để mọi ô cân nhau; `allowFontScaling=false` cho nhãn 2 dòng khỏi vỡ.
6. **Immersive & một cổng ra**: vào app con = full-bleed; đổi-app chỉ qua MỘT cổng (nút giữa). Overlay xoè vẽ ở **Stack GỐC** (z-order trên mọi màn). Màn "dùng-rồi-thoát" (quét) `replace` để back về thẳng nơi khởi động.
7. **Tái dùng, KHÔNG dựng hệ thứ hai**: cổng = nút xoè SG4 của Tùng, chỉ đổi NGUỒN mục; màn quét tái dùng camera `WebLoginScan`; kết quả quét tái dùng màn chi tiết sẵn có.
8. **Accessibility + suy biến mượt**: `accessibilityLabel`/`accessibilityRole` cho nút quét/tab con; instance bật ít module hơn thì resolver tự bỏ ô thiếu (thanh vẫn cân); nguồn dữ liệu chưa có (usage, provenance ngoài Aladin) → suy biến an toàn, KHÔNG bịa.

### 10.2 Cổng nút giữa — cử chỉ 2 tầng (đã tinh chỉnh theo anh Aladin)
Giữ đúng "linh hồn" nút xoè cũ (kéo=xoè · giữ=ghim · đường nối trắng), NÂNG lên 2 tầng cho chuyên nghiệp mà không rối:
- **Tầng 1 = ĐỔI-APP** (service thuần, persona-adaptive). **Trace-quét NỔI BẬT ở giữa** (icon to + vành sáng). BỎ "Me" khỏi cung (Me ở ô tab dưới).
- **Tầng 2 = HÀNH ĐỘNG NHANH của module**: GIỮ **0.5s** trên module (Chat/Farm) → arc con **đồng tâm, ôm ngoài** arc chính (nền dải cung như arc chính) tự bung + **ghim** đường nối **gấp khúc** tại module. Thả trúng = **chạy ngay** tính năng (route đích thật: Quét cây/Con vật/Nhãn thuốc/Thêm vườn · Mở ví/Thông báo); thả trượt = huỷ (không mở nhầm màn).
- **Giữ 2s** đặt mặc-định cho mục KHÔNG có hành-động-nhanh (tap nút giữa = chạy nhanh). Ở tầng 2, mục cha sáng, mục khác mờ để tập trung.
- Số hình học (`RADIAL_*`, `DWELL_*`, `SUB_ITEMS_SPREAD`) gom 1 chỗ đầu file → tinh chỉnh cảm giác trên máy chỉ đổi hằng số, không đụng cử chỉ.
> **Cần test máy thật**: cảm giác ngưỡng giữ-0.5s, bán kính với-tới cung ngoài, mục con ở rìa với màn hẹp. Đây là các HẰNG SỐ tinh chỉnh, không phải kiến trúc.

### 10.3 Bản đồ nguồn (đã code)
| Vùng | File | Vai trò |
|---|---|---|
| Frame nav | `navigation/navLabels.ts` · `NavItemFrame.tsx` | nhãn/icon song ngữ + 1 ô tab |
| Thanh persona | `navigation/resolveVisibleTabs.ts` · `useVisibleTabs.ts` | chọn ô hiển thị + đóng băng phiên |
| Cổng xoè | `navigation/resolveGateItems.ts` · `index.tsx`(CurvedTabBar/Overlay) | mục cổng + arc con 2 tầng |
| Quét truy xuất | `navigation/traceScan.ts` · `screens/TraceScanScreen.tsx` | phân giải mã + màn quét |
| SubHome | `navigation/subHomeLabels.ts` · `SubHomeFrame.tsx` | khung tab-con thu gọn |
| Home | `screens/HomeScreen.tsx` | bỏ số bịa, nối ví/chat thật |

> Quy ước review: sửa HÌNH → chạm component vẽ; sửa HÀNH VI/NỘI DUNG → chạm hàm thuần + cập-nhật test. Không trộn 2 việc trong 1 chỗ.

## Mô phỏng (nguồn hình)
- **`Specs/_mockups/nav-shell-ux.html`** — thanh tab song ngữ (Me/Tôi + avatar), 3 biến thể persona, SubHome thu gọn + dropdown, nút xoè cổng (tái SG4), 3 chế độ ánh sáng (day/dim/night), palette tươi. Tương tác được.
