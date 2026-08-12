# SuperApp — Sổ bàn giao tính năng module (Module-Handoff)

> **Cho ai:** Thư (mobile/native), Tùng (frontend/UIUX), và SuperApp agent.
> **Là gì:** Danh sách SỐNG các việc cần DỰNG/CẬP NHẬT trong SuperApp — mỗi dòng 1 việc
> cụ thể (màn/wire/shape/fix), gắn với module backend đã (hoặc sắp) sẵn sàng.
> **Ai điền:** Agent của module/nền tảng ĐẨY dòng vào NGAY khi hoàn thành phần backend cần
> UI/wire ở SuperApp — KHÔNG để SuperApp đi hỏi. Format + nghĩa vụ: `Integration-Standard.md §12`.
> **Định nghĩa Done:** dev dựng xong + verify (tsc/test + đối chiếu shape thật) + merge vào develop.
> **Nguồn sự thật shape:** file canonical ở repo của CHÍNH platform — xem INDEX `Integration-Standard.md §11`
> (OriLife: `OriLifeTrace/OriLife-Integration.md` · ProofChat: `ProofChat/INTEGRATION.md` ·
> PhoenixKey: `PhoenixKeyDID/PhoenixKey-SDK/INTEGRATION.md`). Ledger CHỈ trỏ, không chép shape.
> Mô hình snapshot `Integration/<Platform>.md` ĐÃ BỎ (§10.1, anh chốt 2026-07-15).

Ký hiệu trạng thái BE: 🟢 live&deployed · 🟡 code có, chưa deploy · 🔴 chưa build · ⚫ OPS/secret chờ anh.

> ### ⚠ Đọc trước khi build máy mới — bẫy `.env`
> `.env` bị gitignore nên máy mới clone về là **RỖNG**. Khi rỗng thì mọi `import … from '@env'`
> ra `undefined`, `registerCapability()` bị bỏ qua, và cổng runtime **tắt vĩnh viễn** Work /
> ProofChat / Join — dù backend đang sống. Triệu chứng đánh lừa: app chạy, không lỗi, chỉ là
> mọi thứ rỗng, rất dễ tưởng "backend chưa xong".
> **Làm:** `cp .env.example .env` trước khi chạy lần đầu. Không cần khoá thật cho thực địa —
> toàn URL công khai.
> Đo thật **2026-08-03** (SuperApp tự curl): `api.aladin.work/api/v1/health` **502** ·
> `api.phoenixkey.me/api/v1/actuator/health` **200** · `api.proofchat.me/api/v1/health` **502** ·
> `api.orilife.io/api/health` **200**. AladinWork sập giữa 30/07 (200) và 03/08; Phoenix thì
> ngược lại — 30/07 chết, nay sống. Đúng lý do phải đo lại, đừng tin số cũ.
> Đo trước đó **2026-07-30**: `api.aladin.work/api/v1/health` 200 · `api.orilife.io/api/health` 200 ·
> `lampnet.cloud/health` 200 · `api.lampnet.cloud/health` 200 · `api.phoenixkey.me` **502 TOÀN BỘ**
> (xem H-21 — 29/07 còn 200 UP) · `api.proofchat.me` **502** (chờ Lợi sửa cổng tunnel).
> Đo trước đó 2026-07-29: Phoenix `/api/v1/actuator/health` 200 `{"status":"UP"}`.
> Quy tắc: **đo lại trước mỗi đợt thực địa**, đừng tin số đo cũ — Phoenix sập trong vòng 1 ngày.
> Biến `PHOENIXKEY_POOL_API_URL` khai ở `src/types/env.d.ts:6` nhưng **thiếu trong `.env.example`**
> — mà backend Pool cũng chưa có (`/api/v1/pools` → 404), nên chưa cần bổ sung vội.

---

## Đang mở — chờ dev SuperApp dựng

| ID | Module (agent) | Loại | Việc ở SuperApp | Ref shape | BE | Ai | Ngày đẩy |
|----|----------------|------|-----------------|-----------|----|----|----------|
| H-01 | AladinWork | Screen | Màn KHÁM PHÁ dựng từ `/templates` thật (14 job-type: label/icon/fields/giá). Hiện chỉ có chip "Ngành nghề" (taxonomy nhóm), CHƯA có màn duyệt template. **03/08: hạ 🟢→⚫ — mã backend xong, nhưng `api.aladin.work` chết (SuperApp curl 502; AladinWork đo 530/1033).** Dựng màn được bằng host cục bộ `docker compose` cổng 7040. | `Integration/AladinWork.md` · `GET /api/v1/templates` | ⚫ | Tùng | 2026-08-03 |
| H-02 | AladinWork | Screen | Phục hồi "Thợ nổi bật" — **API đã có**: `GET /taskers` (lọc `?templateKey=`, `?availableOnly=1`, xếp hạng tất định, công khai nên hiện được trước khi đăng nhập; chỉ người đã chào năng lực mới lọt danh bạ ⇒ không có thẻ trắng). **CHỜ Core PR #12 merge rồi mới dựng** — `reputation` vừa ĐỔI NGHĨA: nay là uy tín hiệu dụng thang 0..100 (Bayesian × chiết khấu chống gaming), `reputationRaw` là bộ đếm cũ ĐỪNG hiển thị. Lý do đổi: `mutualRelease` cộng +5 cho cả hai bên ⇒ hai tài khoản bắt tay tất toán qua lại là máy in thứ hạng. Đã có thêm `fromPriceVND`/`distanceKm`/`lastActiveAt`/`avatarUrl` (null khi chưa có, không phải 0). | `Integration/AladinWork.md` · `GET /api/v1/taskers` | 🟡 | Tùng | 2026-08-03 |
| H-03 | OriLife | Wire | Batch field-test #5/#6/#12: UX enroll dùng `views_kept`/`coverage_hint_vi` (#236), `features_vi` (#237), `suggest_text`/`dup_suspect.message_vi` (#235). | `OriLifeTrace/OriLife-Integration.md` · chờ payload thật | 🟡 | Thư | 2026-07-27 |
| H-04 | OriLife | Wire | #10 danh sách hoạt động từ `GET /api/species/catalog` (`activities[]`). | chờ OriLife xác nhận đường+shape | 🟡 | Thư | 2026-07-27 |
| H-05 | OriLife | Screen | #7 hiện ảnh cây từ `GET /api/tree_views?tree_id=` (Tổng-quan/Lịch-sử + loading/empty). Chờ xác nhận `views[].url` tuyệt-đối/tương-đối + header auth. | `OriLifeTrace/OriLife-Integration.md` | 🟢 | Tùng | 2026-07-27 |
| H-06 | OriLife | Fix | #9 SafeArea insets 2 màn (FruitVideoScreen nút sát mép) — client thuần. | — | 🟢 | Tùng | 2026-07-27 |
| H-07 | OriLife | Wire | Poll `POST /api/build3d/{tree_id}` + trạng thái khi model 3D chưa sẵn (viewer `/view/{code}`). | `OriLifeTrace/OriLife-Integration.md` | 🟢 | Thư/Tùng | 2026-07-27 |
| H-08 | LAMP+Core+Phoenix | Wire | Mint LAMP: cắm `buildAndSignTx` + bật `ORG_MINT_ENABLED` + shape `mint-lamp`/SSE. UI 2 bước ĐÃ dựng. **LAMP 04/08: shape CHỐT (lamp_mint 12-param; redeemer DistributionVest=Constr(0,[]) / ReserveDraw=Constr(1,[]); policy mainnet 55d3e01b…; asset 4c414d50; decimals 6). Nhưng builder phía LAMP CHƯA chạy được (deploy script apply 8/12 param; mintBuilder thiếu reference input) → GIỮ ORG_MINT_ENABLED=false tới khi LAMP báo lại.** | `LAMP/LAMP-Integration.md` (LAMP sẽ dựng ở repo mình — §10.1) · thư `LAMP-mint-shape-chot-…-2026-08-04` | 🔴 | Thư | 2026-08-04 |
| H-10 | OriLife | Wire | Gửi `heading`/`pitch` THEO TỪNG ẢNH khi enroll + identify. Native đã trả (`treeReIDNativeBridge.ts:21-24`) nhưng `TreeIdentityScreen.tsx:485` vứt sạch, `TreeEnrollScreen.tsx:318,355` không gửi gì. Mất dữ liệu quý nhất cho MCR + dựng 3D. | chờ OriLife chốt tên trường/đơn vị (đã hỏi 29/07) | 🟢 | Thư | 2026-07-29 |
| H-11 | OriLife | Wire | Gọi `POST /api/build3d/{tree_id}` — server ĐÃ có (đọc `openapi.json` 29/07), app chưa gọi ở đâu (grep 0). Hiện `TreeViewer3D` chỉ mở `/view/{code}`, hiện "đang dựng" mãi nếu server không tự dựng. | `OriLifeTrace/OriLife-Integration.md` | 🟢 | Thư | 2026-07-29 |
| H-12 | OriLife | Wire | Gọi `GET /api/tree_views?tree_id=` để xem lại ảnh cây TỪ MÁY CHỦ. Hiện `TreeDetailScreen.tsx:280-291` chỉ đọc đường dẫn `file://` trong máy (`treeImageStore.ts`) — xoá cache/đổi máy là trắng, người dùng tưởng mất dữ liệu. | chờ OriLife xác nhận url tuyệt-đối/tương-đối + auth | 🟢 | Tùng | 2026-07-29 |
| H-13 | (điều hướng) | Fix | Cổng xoè "Quét con vật" (`resolveGateItems.ts:67`) trỏ `AnimalManagement` kèm `farmId:'default'` GIẢ → màn trống bảo người dùng tự đi tìm đường khác. `AnimalIdentity`/`AnimalEnroll` chạy được nhưng **không màn nào navigate tới**. Cùng lỗi: "Quét nhãn thuốc" gửi `targetId:'default'` lên backend. | — | 🟢 | Tùng | 2026-07-29 |
| H-14 | (điều hướng) | Fix | Tab Join vừa không có ô trên thanh (`resolveVisibleTabs.ts:36` SLOT_COUNT=2 → 6 tab/5 ô, Join là tab rớt), vừa nuốt luôn thanh điều hướng khi vào (`navigation/index.tsx:867`). `PoolHome` không lối vào nào và không nút quay lại (`PoolHomeScreen.tsx:124`). | — | 🟢 | Tùng | 2026-07-29 |
| H-15 | ProofChat | Wire | Chat là MOCK toàn phần: gửi tin không chạm mạng (`proofchatSlice.ts:213-241` tự chế ciphertext + chữ ký), `ChatScreen.tsx:92-160` là pipeline giả bằng setTimeout. `chatSocket.ts` + `proofchatService.ts` viết xong nhưng KHÔNG màn nào import. Cổng tắt thì rơi về mock **không nhãn DEMO** (Work thì có nhãn). | `chatSocket.ts` · host 502 | 🔴 | Thư | 2026-07-29 |
| H-16 | AladinWork | Fix | `usePostJob.ts:39-42` khi cổng tắt **trả `true` giả vờ đăng việc thành công** — người dùng tin đã đăng, thực tế không có gì. Kèm: `PostJobScreen.tsx:21` vẫn dùng `CATEGORIES` mock kèm count giả thay vì `data/categories.ts` sạch; `WorkerProfileScreen` 100% dữ liệu giả.  **Gấp thêm từ 03/08:** máy chủ đang chết thật ⇒ cổng tắt thật ⇒ ngay lúc này bấm "Đăng việc" sẽ báo thành công trong khi KHÔNG có gì được đăng. | `Integration/AladinWork.md` | 🟢 | Tùng | 2026-08-03 |
| H-17 | (chất lượng) | Fix | Luồng chụp nhiều ảnh mất trắng khi bị ngắt: `TreeEnroll`/`AnimalEnroll`/`FruitVideo` không lưu nháp, không `beforeRemove`, không chỉ báo bước. Nông dân chụp 5 góc, có cuộc gọi tới → làm lại từ đầu. Video 80MB upload chỉ có spinner, không phần trăm. | — | 🟢 | Thư | 2026-07-29 |
| H-18 | (chất lượng) | Fix | 203 mã màu hex hardcode / 689 lần / 85 file, vi phạm `src/theme/tokens.ts:5` ("CẤM hardcode màu"). 3 sắc đỏ "lỗi", 8 sắc xanh "thành công", 6 màu nút-chính tự chế. 55 file tự vẽ header (`AppHeader` chỉ dùng 3 nơi). Dọn dần, không làm một lần. | `src/theme/tokens.ts` | 🟢 | Tùng | 2026-07-29 |
| H-19 | (ngôn ngữ) | Fix | Thuật ngữ kỹ thuật lọt giao diện nông dân: "Daemon LampNet", "Epoch", "µLAMP", "onnet", "Mint/Distribution/Claim", "DID" (6 lần ở màn Tôi), "Tasker", "Escrow", "Pool/stake", "P-256/Ed25519/BIP39". Kèm 9 khái niệm gọi nhiều tên (vườn/trang trại/nông trại/trại; 2 loại ví cùng tên "Ví"). Nhãn tab **"Kết đèn"** không ai hiểu — đề xuất "Góp máy". ~~Chờ anh Aladin chốt từ vựng.~~ **CHỐT 2026-08-12: đổi "Kết đèn" → "Góp máy"** (anh Aladin duyệt đề xuất của Tùng), 11 chỗ người dùng đọc được: `navLabels.ts:54` · `i18n/phrases/navigation.ts:19` · `screens.ts:1090-1100` · `chat.ts:133,174,195,196` · `JoinHomeScreen.tsx:131,237,282` · `ContributingScreen.tsx:120-121` · `joinService.ts:279` · `modules/index.ts:61` · `theme/tokens.ts:134`. Bản tiếng Anh cũng bỏ "Connect" → "Join"/"Device sharing" (người dùng Cardano đọc "Connect" thành *nối ví*). **Đây là nhãn TẠM** — chọn lại khi chốt trọn bộ từ vựng; ~10 thuật ngữ còn lại trong mục này VẪN MỞ. | — | 🟡 | Tùng | 2026-08-12 |
| H-21 | PhoenixKey | ⚫OPS | **`api.phoenixkey.me` trả 502 TOÀN BỘ** (đo 30/07: `/actuator/health`, `/health`, `/v3/api-docs`, `mint-lamp`, `identity/org` — tất cả 502). Ngày 29/07 chính đường đó còn 200 `{"status":"UP"}` → hồi quy trong 1 ngày. Cổng runtime tắt cả trục danh tính: đăng nhập DID, ví, OrgDID, mint. **Chặn mục tiêu 2 của đợt thực địa.** Đã inbox Phoenix. | — | 🔴 | (Phoenix/OPS) | 2026-07-30 |
| H-22 | OriLife | Shape | **`POST /api/tree/{id}/video` KHÔNG đẩy LampNet, không trả `video_cid`/`stored`** — chỉ `fruit_video` có (OriLife xác nhận 2 lần). Mục tiêu đợt là "video nông dân về LampNet gắn định danh cây", mà video nông dân quay là video CÂY. Không sửa thì đội đi cả ngày, video không có mặt trên LampNet dù app không lỗi. Đã inbox OriLife xin cho 2 route cùng đường lưu trữ. | `OriLifeTrace/OriLife-Integration.md` | 🔴 | (OriLife BE) | 2026-07-30 |
| H-23 | (native) | Fix | **Gốc quy chiếu la bàn SAI hợp đồng.** OriLife đòi Bắc THẬT. iOS `HeadingCaptureManager.swift:278` lấy `trueHeading` nhưng **âm thầm rơi về `magneticHeading`**; Android `HeadingSensorReader.kt:27` đọc `TYPE_ROTATION_VECTOR` **không cộng `GeomagneticField`** → Bắc TỪ. Hai nền tảng hai gốc, trộn vào cùng tập dữ liệu = sai KHÔNG phát hiện được về sau. App đã vá nhãn (`heading_ref`), sửa thật là việc native. | — | 🟢 | Thư | 2026-07-30 |
| H-24 | OriLife | Wire | Route tra `video_cid` theo `tree_id` **không tồn tại** (OriLife grep hết `origin/main`). App đã tự lưu sổ cục bộ, nhưng sổ nằm trong **một máy** — hỏng máy/đổi điện thoại/trả máy công ty là mất bằng chứng, và nhiều người nhiều máy thì không ai gom được. Đã xin route. | chờ OriLife | 🔴 | Thư/Tùng | 2026-07-30 |
| H-25 | OriLife | Wire | **Làn dựng 3D sẽ treo suốt buổi thực địa**: `server.py:1210` chỉ chạy 3D khi làn xuất xứ TRỐNG. Cả đội đăng ký cây liên tục nhiều giờ → làn không bao giờ trống → 3D coi như không chạy, màn "đang dựng" quay mãi. App cần mốc thời gian + đổi câu sang "đang xếp hàng". Cách xếp lịch là quyết định của OriLife (đã inbox). | `OriLifeTrace/OriLife-Integration.md` | 🟡 | Thư | 2026-07-30 |
| H-26 | (chất lượng) | Fix | Store redux **trộn 2 quy ước đơn vị**: `adaBalance` đã chia, `lampBalance`/`carpBalance` còn thô. Chính cái trộn này sinh lỗi hiện LAMP gấp triệu lần. Đã ghi đơn vị vào type + bắt mọi chỗ hiện đi qua `fmtLamp()`, nhưng CHƯA thống nhất một quy ước cho cả store (đụng 6 màn — không làm giữa đợt thực địa). | `src/utils/token.ts` | 🟢 | Tùng | 2026-07-30 |
| H-27 | MAGIC+CARP | Shape | **decimals của MAGIC và CARP chưa chốt** → app in NGUYÊN SỐ THÔ (`CARP_DECIMALS_UNKNOWN = 0`), thà hiện thô hơn hiện sai. LAMP agent nói rõ "đừng giả định 6". Cần MAGIC agent xác nhận `magic.available` có phải đơn vị thô, và CARP agent cho decimals. Chốt xong = đổi 1 hằng số. | `src/utils/token.ts` | 🔴 | (MAGIC/CARP) | 2026-07-30 |
| H-28 | AladinWork | Screen | Màn **MỚI** "Thợ chào dịch vụ": `POST /offerings` + sửa/đóng mềm. Dựng biểu mẫu động từ `template.fields[]` (sai enum → 400 BAD_INPUT). Không có màn này thì nửa CUNG của chợ trống và đặt-theo-dịch-vụ (`POST /contracts {offeringId}`) vô dụng — vì bỏ seed thì `offerings` trên máy chủ thật vĩnh viễn rỗng. | `Integration/AladinWork.md` · `POST /api/v1/offerings` | 🟡 | Tùng | 2026-08-03 |
| H-29 | AladinWork | Wire | Hiện `hard.checks` của `GET /jobs/:id/match` để nói RÕ vì sao ứng viên chưa đạt (thiếu bao nhiêu video, chứng chỉ chưa duyệt…) thay vì ẩn im lặng. `qualified:false` mà vẫn bấm thuê → `403 NOT_QUALIFIED`. | `Integration/AladinWork.md` | 🟢 | Tùng | 2026-08-03 |
| H-30 | AladinWork | Fix | **`walletAddress` đang lọt trong `candidates` của `/jobs/:id/match` — ĐỪNG hiển thị.** Máy chủ sẽ gỡ ở đợt dọn kế tiếp; ứng dụng bỏ trường này trước cho chắc. | `Integration/AladinWork.md` | 🟠 | Tùng | 2026-08-03 |
| H-31 | PhoenixKey | Shape | **`POST /identity/org/{orgDid}/mint-lamp` là GRANT UỶ QUYỀN, không phải lệnh đúc** (Database PR #119). Client `orgMint-api.ts:453` đang gửi `{orgDid, amount}` + chờ SSE `/sign/request/{id}/stream` — sai cả thân yêu cầu lẫn luồng: hợp đồng thật cần 8 trường, ký Ed25519 device-key trong Enclave, 200 trả thẳng Grant, KHÔNG có SSE. `amountLamp` là **chuỗi** big-number — ép về `number` là mất chính xác ở cỡ 2.6×10¹⁶ oildrop. **Chốt thêm cùng ngày:** hạn dùng `validTtlSeconds` (giây tương đối) chứ KHÔNG phải `validUntilSlot` — app không cần đồng hồ slot; nonce app tự sinh, TTL 10 phút, bấm hai lần thì khoá nút chứ đừng để chạm 409; **Grant là bí mật (bearer) ⇒ cất Enclave/Keychain, KHÔNG AsyncStorage**, và phải lưu BỀN qua app-kill (đường tới dist_treasury push hay pull còn chờ MagicLamp). | `Integration/PhoenixKey.md` · `POST /api/v1/identity/org/{orgDid}/mint-lamp` | 🟡 | Thư/Tùng | 2026-08-03 |
| H-32 | PhoenixKey | Wire | **Xin 2 proxy `GET /wallet/utxos` + `GET /wallet/params`.** Native đã dựng được giao dịch (`taadEnclave.buildSignedTransfer`/`buildStakeDelegation`) và `POST /wallet/tx/submit` phía backend ĐÃ có — nhưng không có UTxO/params thì không ráp được tx nào. Một endpoint mở khoá cả gửi ADA lẫn uỷ thác pool. | `Integration/PhoenixKey.md` · `src/services/cardanoTxService.ts:29-31` | 🔴 | (Long) | 2026-08-03 |
| H-33 | (chất lượng) | Fix | Module `pool` chết hai đường độc lập: `module.manifest.json` khai route `PoolHome` nhưng `instance.config.ts:69` `enabledModules` KHÔNG có `pool` ⇒ không vào được; mà vào được cũng 404 vì `poolService.ts:26` base thiếu `/api/v1`. Trong khi `stakingService.ts` đi đúng đường qua `phoenixKey-api`. Chọn một: sửa 2 lỗi, hoặc bỏ hẳn module trùng. Không phụ thuộc ai. **Đo 03/08: `api.phoenixkey.me/api/v1/pools` trả 200 kèm danh sách `pool_ids` thật** — backend sống, chỉ app đang gọi sai. | `src/modules/pool/poolService.ts:26` | 🟢 | Tùng | 2026-08-03 |
| H-34 | LampNet | 🔴MẤT DỮ LIỆU | **`stored:true` KHÔNG bảo đảm byte sống quá 30 phút.** Vòng eviction của daemon xoá bản gốc `storage/<cid>.bin` sau 1800s vì GIẢ ĐỊNH mảnh đã phân tán sang peer — mã xoá chạy vô điều kiện, kể cả khi danh sách peer RỖNG. LampNet đo trên Tiger: **22 tài liệu mất vĩnh viễn**, trong đó **có `tree-capture-3d-*`** = đúng loại video cây/quả app gửi. SuperApp đã tự kiểm lại: doc lành `ln1q_00aa8c4c4788d506_file` → 200/4714 byte; doc đã evict `ln1q_0838e482d007e60e…` → **404** sau khi tìm mạng. Đã chặn tạm bằng cấu hình trên Tiger; bản vá gốc đang viết. **Hàng đợi bền + nút "Gửi lại" KHÔNG được gỡ** — mất xảy ra SAU khi ghi thành công nên hai thứ đó là lớp chắn cuối. | `src/services/videoUploadQueue.ts:497` | 🔴 | (LampNet) | 2026-08-03 |
| H-35 | OriLife | Wire | **Đổi điều kiện "gửi xong" từ `stored==true` sang ĐỌC-LẠI-KHỚP.** Hôm nay `videoUploadQueue.ts:497` coi `res.stored !== false` là đậu — nhưng cờ đó chỉ chứng minh "node đã nhận và trả CID", chưa chứng minh byte bền (H-34 + 2 lỗ chưa vá: ghi đĩa nuốt lỗi, zero-redundancy im lặng). Điều kiện chắc: put trả CID → `GET /v1/inspect/<cid>` ra node giữ → đọc lại so đúng `size` + `sha256` → khớp mới ngừng vòng gửi lại và mới cho xoá bản gốc trên máy. **Chặn bởi:** (a) bản vá eviction merge + deploy đủ 3 SuperNode, (b) có kiểm tra đọc-lại sau ghi. | `src/services/videoUploadQueue.ts:497` | 🔴 | Thư | 2026-08-03 |
| H-36 | OriLife | Fix | **Gốc của `stored:false` nằm ở OriLife backend, không phải LampNet.** `core/server.py:2213` `stored = put is not None`; `put` = `lampnet.put_bytes(...)` với `retries=1`, `timeout=20s` (`core/lampnet.py:31`) cho clip tới 80MB qua 4G ngoài vườn; `server.py:2144-2147` **nuốt MỌI exception** thành `put=None` + một dòng `_log.warning`. Lý do thật CHỈ nằm trong dòng log đó trên máy chạy `api.orilife.io` — không có nó thì không ai truy được, kể cả LampNet (phía họ không thấy request nào). Xin OriLife trích một lần fail cụ thể kèm giờ + kích thước clip. | `OriLifeTrace/OriLife-Integration.md` | 🔴 | (OriLife) | 2026-08-03 |
| H-20 | (hạ tầng) | Fix | Suite `src/services/proofchat-api.test.ts` không chạy được: `phoenixSessionService.ts:119` ném `TypeError: Right-hand side of 'instanceof' is not an object` làm sập cả worker jest. Đã đối chiếu — hỏng sẵn trên `develop`, không do thay đổi nào gần đây. 25/26 suite còn lại pass (571 test). **ĐÃ SỬA 03/08 (PR #100):** gốc là mock thay CẢ module `phoenixKey-api` làm `PhoenixKeyApiError` thành `undefined`; thêm `...jest.requireActual` là 25 test chạy lại. Toàn bộ jest nay 679 pass / 32 suite. | `src/services/proofchat-api.test.ts` | 🟢 | Thư | 2026-08-03 |

## Đã xong (giữ lịch sử)

| ID | Việc | Merge |
|----|------|-------|
| — | Cổng runtime tự bật module khi backend sống | PR #68 (2026-07-27) |
| — | Field-test Đức #8/#11/#2/#1 (nav 3D/quả, GPS, schema) | PR #72 (2026-07-27) |
| — | AladinWork go-real: gỡ mock, empty-state thật, count thật | PR #74 (2026-07-29) |
| — | OrgDID: thêm ô MST tuỳ chọn | PR #75 (merged 2026-07-30) |
| — | Sổ bàn giao + `Integration-Standard.md §12` | PR #76 (merged 2026-07-30) |
| H-09 | ~~79 lỗi tsc ở `src/features/space3d/scene`~~ — **ĐÍNH CHÍNH 29/07: không phải lỗi code.** `node_modules` trên máy kiểm tra thiếu 9 gói (`three`, `@react-three/fiber`, `react-native-svg`, `expo*`) mà `package-lock.json` ĐÃ có sẵn. Chạy `npm install` → tsc từ 102 lỗi về **0**. Dev không phải sửa gì. | đóng (2026-07-29) |
| — | Gỡ 6 rào cản thực địa: SafeArea `FruitVideoScreen`, 5 vùng chạm <44pt, cỡ chữ nav 9→11pt + cho phóng chữ, hiện `video_cid` làm bằng chứng LampNet, chặn bấm kép 2 modal ProofChat | (chờ merge) |
| H-06 | ~~SafeArea 2 màn~~ — xong trong đợt gỡ rào cản thực địa (header notch + nút Gửi đè thanh home) | đóng (2026-07-29) |
| H-10 | ~~Gửi `heading`/`pitch` theo từng ảnh~~ — **XONG 30/07.** Backend nhận sẵn cả 4 route (`server.py:1699`, `:1941`, `:2790`, `:2881`); gửi `captures` JSON theo khuôn `regions`, áp cho identify + enroll + verify_add. Thiếu số thì bỏ khoá, không gửi `""`/`"null"`. Phần server nhận `captures` OriLife đang dựng. **Gốc quy chiếu la bàn tách thành H-23.** | đóng (2026-07-30) |
| — | Lưu `video_cid` cục bộ (`videoProofStore`) + hiện lại ở màn chi tiết cây, chạm để sao chép — ghi TRƯỚC khi vẽ vì không có route tra ngược | (chờ merge) |
| — | Sửa LAMP hiện gấp 1.000.000 lần: `utils/token.ts` dùng BigInt (tổng cung 3,6e16 oildrop vượt `Number.MAX_SAFE_INTEGER`), áp 6 chỗ hiện, 10 test kể cả ca tràn số | (chờ merge) |
| — | Xoá mã chết `src/utils/crypto.ts` (chữ ký giả + nonce `Math.random()`, 0 chỗ gọi) | (chờ merge) |

---

*Cập nhật lần cuối bởi SuperApp agent 2026-07-30 (thêm H-21…H-27 từ đợt rà soát chặn cho hai
mục tiêu thực địa mới: video cây → LampNet, và OrgDID + mint LAMP. Đóng H-06, H-10.)
Agent module: thêm dòng của mình vào bảng "Đang mở" theo §12.*

> **Hiệu lực của §12 (đo lại 30/07 sau khi fetch remote):**
> · File sổ + §12 **ĐÃ có trên `develop`** (PR #76 merged) — Thư/Tùng mở đường dẫn chuẩn là thấy. ✔
> · Nhưng nghĩa vụ "tự đẩy dòng khi xong" **vẫn chưa ràng buộc được agent module nào**:
>   `grep -rl "Module-Handoff"` trong `Agents/`, `LAMP/`, `MAGIC/`, `OriLifeTrace/`, `MobileCore/`
>   cho **0 kết quả**, và `_rules/Forall.md` không có chữ nào về sổ này.
> · §12.4 đã nói rõ nghĩa vụ hành vi chéo agent thuộc `Forall.md`, mà agent không tự sửa file rule
>   global. Đã gửi đề xuất sang Systeme
>   (`SuperApp-de-nghi-them-nghia-vu-bao-trang-thai-ve-Integration-2026-07-30.md`), chờ chủ nhân duyệt.
> · Tới lúc đó việc lan quy định vẫn làm BẰNG TAY: mỗi thư SuperApp gửi đi đều kèm câu nhắc §12.
>   Cách đó không bền — đừng coi ledger là đã đủ.
