# Hiện trạng SuperApp — 2026-08-05

Rà 22 tính năng chủ dự án hỏi, cộng 3 việc đang chặn khâu build.
Mục tiêu: **phát hành chính thức app v2.0.0**; tính năng nào hoàn thiện sau thì lên bản kế tiếp.

Mỗi khẳng định trong cột **Requirement** kèm `file:dòng` hoặc số đo thô. Chỗ nào chưa đo được thì
ghi thẳng là chưa đo — không suy đoán.

> ⚠ **Đã rà lại lượt hai (05/08) — ba mục Mosaic, Spectra, Strata đều bị chấm SAI ở lượt một.**
> Cả ba đều có mã thật, đã build, đã test xanh. Nguyên nhân trượt: lượt một chỉ quét LAMP / MAGIC /
> OriLifeTrace / SuperApp / PhoenixKeyDID, trong khi Mosaic nằm ở repo **VeDataIO** và
> Spectra/Strata nằm ở **LampNetCloud** — ba repo chưa từng được mở. Nội dung ba mục dưới đây đã
> được viết lại kèm bằng chứng mới; các mục còn lại giữ nguyên kết luận lượt một.

> 📬 **Cập nhật 05/08 chiều — thư LampNet trả lời.** LampNet đối chiếu ba mục thuộc bên họ (§3
> Strata, §20 mảnh đọc được, §22 sổ thưởng rỗng) và xác nhận **cả ba đúng**, trong đó §20 và §22
> **nặng hơn** những gì ghi ở đây. Nội dung mới đã được nhập vào đúng ba mục đó. Không mục nào đổi
> màu, nhưng §20 và §22 nay có bằng chứng cụ thể hơn.

> 🎪 **Không có tính năng riêng cho sự kiện.** Chủ dự án chốt: gian hàng chỉ là chỗ công ty trưng
> bày và trò chuyện với khách — **trên app không có gì khác biệt**, khách tham quan dùng đúng app
> như một người dùng bình thường. Câu hỏi treo cũ "có dựng màn khách-quét không" **đã đóng: không
> dựng**. Đối chiếu: `grep -rni booth src/` = **0 kết quả** ⇒ chưa có dòng mã nào cần gỡ.

> 🔑 **Không có mật khẩu ở bất cứ đâu.** Đường vào duy nhất là PhoenixKey — vân tay hoặc khuôn mặt.
> Đối chiếu: `grep -rn secureTextEntry src/` = **0 kết quả**; `LoginScreen.tsx:318` đã ghi đúng câu
> "không mật khẩu, không OTP"; `orilifeDidAuth.ts:6` ghi rõ app KHÔNG có username/password, đăng
> nhập máy chủ bằng cách ký challenge P-256 từ Secure Enclave/Keystore. Các chuỗi `password` còn
> lại trong mã đều nằm ở `analytics/config.ts:47-52` — đó là **danh sách chặn ghi log**, giữ nguyên.

## Tóm tắt

| # | Tasktodo | Donestatus |
|---|---|---|
| 1 | Nhận diện cây sầu riêng | 🟢 Chạy thật |
| 2 | Nhận diện quả sầu riêng | 🟢 Chạy thật |
| 3 | Ảnh/video về LampNet + mã Strata | 🟡 LampNet: quả 🟢, cây vừa vá · Strata ⚠ chạy trên nhị phân cũ |
| 4 | Neo dữ liệu L1 qua Mosaic | 🟠 Đã dựng xong + lên chuỗi thật, chưa deploy dịch vụ |
| 5 | Phân tích bằng Spectra | 🟠 Lõi xong, 248 test xanh, chưa ai triển khai |
| 6 | Mô tả đặc trưng dễ hiểu cho nông dân | 🟡 Đã vá phần vẽ, chờ đối chiếu dữ liệu thật |
| 7 | Timeline cho từng cây/quả | 🟡 Máy chủ có, app chưa nối |
| 8 | Mô hình 3D cho cây | 🟡 Nối rồi, sẽ treo nếu không dựng sẵn |
| 9 | Gắn ảnh quả vào mô hình 3D | 🟠 Có khung, cây 3D là mẫu — nói sai là mất uy tín |
| 10 | Nút Wakeme cho nông dân | 🟡 Mã chết, máy chủ 501 — nút chưa tồn tại |
| 11 | LAMP về Vault | 🔴 Chưa chạy (cả hai đường) |
| 12 | MAGIC: InstantGen + ScheduleGen | 🔴 Chưa build — chờ chốt đường gọi |
| 13 | User tạo OrgDID | 🟡 Nối thật, chưa verify chạy — nên đo sớm |
| 14 | OrgDID mint LAMP | ⚫ Chờ LAMP + PhoenixKey — giữ cờ tắt |
| 15 | User tạo 1 pool | 🔴 Tạo pool chưa build · 🟡 chọn pool = mã chết trùng lặp |
| 16 | 2 user chat với nhau | 🟠 Nối thật, chặn bởi máy chủ 502 + 3 lỗi dữ liệu |
| 17 | User tạo nhóm chat | 🟠 Mã đủ, chặn cùng chỗ với chat 1-1 |
| 18 | Aladin đặt 1 công việc | 🟠 Khung thật, chưa đăng được việc nào |
| 19 | Genie nhận 1 công việc | 🟡 Vừa gỡ chặn cứng, chờ dữ liệu thật để chạy trọn vòng |
| 20 | Chia sẻ 1 GB + 10 MB RAM | 🔴 Chưa build — và chưa được phép build |
| 21 | Bấm Join để tính thưởng | 🟠 Hết hỏng im lặng, chờ đóng gói SDK native |
| 22 | Hệ đo lường & tính thưởng | 🟠 Mạch đo sống nhưng rỗng, app vừa nối đúng đường |
| B1 | ⚠ CHẶN BUILD: CI đỏ 10/10 | 🟢 Đã vá (chờ đẩy + chạy lại CI) |
| B2 | ⚠ CHẶN BUILD: cấu hình build thiếu | 🟢 Đã vá (chờ đẩy) |
| B3 | ⚠ CHẶN BUILD: APK thiếu 2 thư viện Rust | ⚫ Chờ chủ dự án chọn đường build |

**Đếm sau lượt hai:** 🟢 4 · 🟡 7 · 🟠 8 · 🔴 4 · ⚫ 2 — tổng 25 dòng.
*(Lượt một chấm 🔴 6 · 🟠 6; Mosaic và Spectra đã chuyển 🔴 → 🟠 sau khi tìm ra mã thật.)*

**Nghĩa các nhãn:** 🟢 chạy thật, có bằng chứng · 🟡 nối rồi nhưng chưa xác nhận chạy trọn vòng ·
🟠 mã đủ nhưng bị chặn bởi chỗ khác · 🔴 chưa build · ⚫ chờ quyết định hoặc chờ bên khác.

---

## 1. Nhận diện cây sầu riêng — 🟢 Chạy thật

**Người dùng được gì.** Nông dân giơ máy quét thân cây, app nói ngay đây là cây nào trong vườn.
Cây không có nhãn vật lý, không gắn thẻ, không sơn số — máy nhận ra bằng chính vỏ thân và tán lá.
Đây là nền của mọi thứ còn lại: không định danh được cây thì không có hồ sơ, không có dòng thời
gian, không có truy xuất.

**Kỹ thuật.** ĐÃ ĐỦ. `TreeIdentityScreen` → `identifyTree()` → `POST /api/identify`; `NO_MATCH` →
`TreeEnroll` → `POST /api/enroll`; bổ sung góc → `/api/verify_add`. Toàn bộ việc so khớp chạy ở máy
chủ (`visual_reid.py:1314` `Gallery.identify`, rerank vỏ-thân `:1187`, 3 bộ so khớp). `heading`/`pitch`
từng ảnh đã gửi (`TreeEnrollScreen.tsx:339`).

**Còn nợ.** Chưa có cổng chất lượng ảnh phía máy chủ — `BLUR_DETECTION_THRESHOLD` ở
`constants/verification.ts:26` là hằng số chết, nông dân chỉ biết ảnh mờ SAU khi tải xong. Gốc la
bàn còn lệch giữa hai nền tảng (H-23).

## 2. Nhận diện quả sầu riêng — 🟢 Chạy thật

**Người dùng được gì.** Chụp từng quả trên cây, app phân biệt quả này với quả kia và gom ảnh vào
đúng hồ sơ quả. Đây là thứ tạo ra định danh cấp QUẢ — mỗi trái sầu riêng có lý lịch riêng, là điều
chưa ai trên thị trường làm được và là tâm điểm của đợt trình diễn.

**Kỹ thuật.** ĐÃ ĐỦ đường chính. `fruitReIDService.ts:249` candidates · `:262` `/api/fruit/enroll` ·
`:274` `/api/fruit/add_view`.

**Đã vá 05/08.** Nút *Quét quả* ở cổng xoè mở ra màn trống vì `actionRegistry` chỉ trỏ route
`FruitList` không kèm `treeId` — nay có màn chọn cây.

**Còn nợ.** `POST /api/fruit/identify` chưa gọi ở đâu (grep 0) nên chưa có luồng soi một quả lạ ra
tên. **Rủi ro cao nhất:** ranh giới quả — mỗi mục hàng đợi PHẢI mang `fruit_id` của riêng nó; đọc
quả-đang-chọn lúc gửi là ảnh chảy nhầm hồ sơ, im lặng, không hồi phục.

## 3. Ảnh/video về LampNet + mã Strata — 🟡 / 🔴

**Người dùng được gì.** Mọi ảnh và clip nông dân quay ngoài vườn phải nằm trên mạng lưu trữ phân
tán, có mã tra cứu để sau này đối chiếu. Đây là **ưu tiên số 1**: không có dữ liệu về kho thì không
có gì để xử lý tiếp, và công đi thực địa cả ngày thành số không.

**Đã vá 05/08 — chỗ hở nặng nhất.** Video CÂY trả `video_cid` mà app vứt đi. Nay ghi
`appendVideoProof(kind:'tree')` NGAY khi nhận phản hồi, và hiện mã chạm-để-chép.

**Còn chặn.**
- (a) ~~Bản đang chạy của OriLife không có trong `origin/main`~~ — **cảnh báo này SAI, đã rút.**
  Đúng là commit `79bc76a` chỉ nằm trên nhánh `claude/vet-loi-sau-268`, nhưng **bản squash của chính
  nó đã vào main qua PR #269**. Đối chiếu blob: `git diff --stat 79bc76a origin/main` = **2 file, đều
  không phải mã** (`.github/workflows/actionlint.yaml` và một file tài liệu). Toàn bộ `server.py`,
  `lampnet.py`, `video_ingest.py`, `video_encode.py`, `video_hash.py`, `video_select.py`,
  `redrive_lampnet.py`, `booth.py`, `static/scan.html` **giống hệt nhau**. Deploy từ main **không gỡ
  mất gì**. Bài học: "commit không có trong main" chưa đủ để kết luận — phải đối chiếu blob, vì
  squash-merge luôn sinh ra hash khác.
- (b) `LAMPNET_ENABLED=0` làm `lampnet.py:84-94` trả CID GIẢ `local_…` mà app vẫn báo đã lưu.
- (c) Video cây chưa qua hàng đợi bền — mất sóng là mất clip.
- (d) Strata: grep trong SuperApp = 0 — app không gọi Strata, và không cần gọi.

> **Đính chính lượt một về Strata — và một quả mìn hẹn giờ.**
>
> Kết luận cũ ("`/v1/strata/*` không được biên dịch vào node đang chạy") **đúng nửa đầu, sai nửa
> sau**, và nửa sai mới là chỗ nguy hiểm.
>
> **Strata có service chạy được, test xanh.** `LampNetCloud/Strata`, crate `lampnet-strata v0.10.0`.
> `Strata/node/src/routes.rs:54-62` đăng ký đủ 7 route; binary `strata-node`. Chạy thật lượt hai:
> `cargo test --workspace --offline` → **167 pass, 0 fail**, trong đó 16 test HTTP.
>
> **Mã hiện tại đúng là không sinh ra route** — bản thứ hai ở
> `lampnet-hivemind/lampnet-mirage/src/strata_routes.rs` (1.656 dòng) nằm sau `#[cfg(feature =
> "strata")]`, mà commit `c80f128` (04/08) đã comment out cả dependency lẫn khối `[features]` vì CI
> Docker không xác thực được vào repo riêng tư. Cfg luôn false ⇒ mã chết.
>
> **Nhưng máy chủ VẪN đang phục vụ route đó:**
> `curl 'https://api.lampnet.cloud/v1/strata/resolve?ref_id=x'` → **400** (thiếu tham số), **không
> phải 404** ⇒ route có thật. `/health` báo `uptime_secs: 188110` ≈ 2,2 ngày ⇒ nhị phân đang chạy có
> TRƯỚC `c80f128`.
>
> ⚠ **Mã và máy đang lệch nhau. Lần dựng lại kế tiếp biến mọi `/v1/strata/*` thành 404 im lặng.**
> Đây là quả mìn thứ hai cùng dạng với quả ở OriLife (mục 3a) — cả hai đều là "bản đang chạy không
> có trong mã nguồn". Chặn thật là quyền truy cập repo riêng tư `LampNetCloud/Strata`: hoặc chuyển
> repo sang công khai, hoặc cấp token đọc cho CI. **Đây là quyết định của chủ dự án.**
>
> 📬 **LampNet xác nhận 05/08: "đúng từng chữ"**, đo lại `resolve?ref_id=x` → 400, `uptime_secs`
> 188110. Và bổ sung một dữ kiện chưa có ở đây: Strata còn phụ thuộc một git riêng tư **thứ hai**
> (`Anchor.git`) ⇒ **mở mỗi `Strata` là chưa đủ**. Quyết định của chủ dự án phải gồm cả hai repo.

**📬 Tin tốt từ LampNet (05/08) — vòng dọn 1800 giây KHÔNG chạm ảnh của mình.**

Vòng dọn chỉ chạy khi chế độ là `symmetric` (`lampnet-mirage/src/eviction/mod.rs:20-22` — khác
`symmetric` là `Skip` ngay dòng đầu), mà chế độ chỉ thành `symmetric` khi bên gọi **tự thêm**
`?mode=symmetric` vào URL tải lên (`lampnet-node.rs:1631`). Mặc định là Hybrid.

Đã tự kiểm theo yêu cầu của LampNet: `grep -rn "symmetric" src/` trong SuperApp = **0 kết quả**;
grep toàn `OriLife-Core` cũng không có chuỗi `mode=symmetric` nào (mọi kết quả đều là
`asymmetric` của thư viện mật mã, hoặc tên hàm kiểm thử). ⟹ **Byte của mình đi đường Hybrid, không
nằm trong vòng dọn.** 45 tài liệu mất ngày 03/08 đều là `symmetric`.

⚠ **Nhưng Hybrid không đồng nghĩa với bền.** LampNet nói thẳng: chế độ mặc định giữ toàn bộ k mảnh
nguồn **trên đúng máy đã tải lên** (`lampnet-node.rs:1801-1804`), nên con số "dư thừa 2,5×" mua
đúng **0 độ bền** cho tới khi máy đó chết — và khi nó chết thì mất cả bản gốc lẫn mảnh. Vòng sửa
chữa **không tái sinh mảnh đã mất**, chỉ chép mảnh còn sống (`lampnet-node.rs:5357-5370`).

⟹ **Việc phải làm ở app: đừng để LampNet là bản duy nhất của clip nông dân.** Đo tại chỗ, tình
trạng hôm nay còn xấu hơn: **cả 8 chỗ quay/chụp đều đặt `saveToPhotos: false`** —
`TreeVideoScreen.tsx:39`, `FruitVideoScreen.tsx:56`, `AnimalEnrollScreen.tsx:61`,
`AnimalIdentityScreen.tsx:81`, `CareScanScreen.tsx:51`, `TreeIdentityScreen.tsx:513`,
`FruitListScreen.tsx:132`, `ActivityScreen.tsx:39` — nghĩa là clip **không bao giờ vào cuộn ảnh
máy**; nó chỉ là tệp tạm. Rồi `videoUploadQueue.ts:613` xoá bản tạm đó ngay khi tải lên xong.

⟹ Ghép hai đầu lại: **tải lên thành công = nông dân không còn bản nào cả**, trong khi phía kho độ
bền thật là "sống tới khi cái máy đã nhận nó chết". Đây là đường mất dữ liệu thật, chưa vá, và
không phải chỗ nào của LampNet — nó nằm trong 8 dòng ở app. **Đề xuất cho v2.0.0: đổi
`saveToPhotos: true` cho các màn quay video bằng chứng.** Xin chủ dự án gật vì nó động vào quyền
ghi thư viện ảnh (Android cần `WRITE_EXTERNAL_STORAGE`/scoped storage, iOS cần
`NSPhotoLibraryAddUsageDescription`) — chưa tự sửa.

## 4. Neo dữ liệu L1 qua Mosaic — 🟠 Đã dựng xong, chưa có đường cho app gọi

> **Đính chính lượt một.** Kết luận cũ ("Mosaic là spec chưa viết code") **SAI**. Nguyên nhân: Mosaic
> không nằm trong LAMP / MAGIC / OriLifeTrace / SuperApp / PhoenixKeyDID mà nằm ở repo
> **`VeDataIO`** — repo chưa từng được quét ở lượt một.

**Người dùng được gì.** Đóng dấu thời gian và nội dung lên chuỗi Cardano để bằng chứng không sửa
được về sau. Với người mua sầu riêng, đây là khác biệt giữa lời hứa của người bán và một bản ghi
công khai không ai xoá được.

**Mosaic là gì.** Module L3 neo dữ liệu lên Cardano L1 của VeData — validator on-chain (Aiken,
Plutus V3) + 5 package off-chain TypeScript. `VeDataIO/Specs/Mosaic-Exec-Spec.md:16`; spec
`Mosaic-Math.md` v2.4.0.

**Đã build và test thật.**
- On-chain: `VeDataIO/Code/mosaic/aiken/` — `mosaic.ak`, `mosaic_anchor.ak`, `mosaic_genesis.ak`,
  `mosaic_hydra_fanout.ak`, `strata_anchor.ak`. `aiken/plutus.json` 67.323 B **đã sinh** ⇒ `aiken build`
  chạy thật (Aiken v1.1.21).
- Off-chain: 5 npm package (`mosaic/ts`, `merkle-builder`, `proof-server`, `cid-subscription-api`,
  `tx-builder`).
- Test: `VEDATA-ROADMAP.md:46-47` — `mosaic/ts` 10 suite / 94 test pass; `aiken check` 41 pass +
  `aiken build` OK. `:88` Mosaic đầy đủ **164 test pass, tsc sạch**. `:93` `aiken check` **174 pass /
  0 fail**. CI thật: `Code/.github/workflows/mosaic-ci.yml`.
- Milestone M1–M4, M6, M7, M8, M15 = CODE-COMPLETE.

**Đã lên chuỗi thật.** Preprod: mint `8d633401…`, update `8bd49960…` tại block 4.908.885,
`valid_contract: True` (`VEDATA-MOSAIC-M15-REPORT.md:245-246`). Preview: Hydra L2 settle thật, snapshot
2 và 4 (`M6-REPORT §7.4`). **Chưa mainnet.**

**Vì sao vẫn 🟠 với ứng dụng này.** Hai chặn, cả hai đều nằm ngoài SuperApp:
1. **Chưa có dịch vụ nào được deploy.** Không có Dockerfile / compose / systemd cho mosaic;
   `api.vedata.io` chỉ tồn tại trong spec, không config triển khai nào trỏ tới. Node từng chạy là
   local trên máy chủ dự án, thư mục đó nay không còn.
2. **App di động không được phép gọi thẳng.** `Mosaic-Tech.md:796` chốt `source_module:
   z.literal("stamp")`, và `:1106` đặt quyền theo danh tính module Stamp. Đường duy nhất là
   **app → Stamp → Mosaic**. Trong SuperApp, Mosaic mới xuất hiện dạng phụ thuộc tương lai
   (`Specs/SG8-Work-Integration.md:147`).

**Neo L1 đang chạy thật cho nông sản đi đường khác:** OriLife tự neo Cardano metadata label 1455
(`core/anchor.py:149`, `timeline_anchor.py:97`, route `server.py:3100`). App chỉ hiển thị trạng thái
neo, không dựng/gửi gì. **Bản phát hành v2.0.0 dùng đường này.**

**Việc.** Hỏi VeData: khi nào có dịch vụ Mosaic được deploy, và Stamp có nhận nguồn từ OriLife không —
đó là hai thứ quyết định bao giờ app nối được.

## 5. Phân tích bằng Spectra — 🟠 Lõi xong và xanh, chưa ai triển khai

> **Đính chính lượt một.** Kết luận cũ ("phần ML là trait rỗng") **mô tả sai tỉ lệ**. `stubs.rs` chỉ
> **44 dòng / 8.710 dòng** toàn crate. Hợp đồng ML thật là `src/workload.rs` (274 dòng, đã trên
> `main`) với `DetOut`/`SegOut`/`EmbOut`/`CutOut` và mã lượng-tử-hoá chạy được (`workload.rs:40-46`).
> Việc **không nhúng model là chủ ý kiến trúc**, không phải nợ: `stubs.rs:1-13` ghi rõ ML chạy như
> workload riêng để giữ giấy phép sạch.

**Người dùng được gì.** Tầng chọn khung hình từ video: lọc khung nét, ghép phơi sáng, bỏ khung rung
— để phần nhận diện chỉ phải làm việc với ảnh tốt. Nông dân quay một vòng quanh cây bằng điện thoại
rung tay là đủ, máy tự chọn khung đẹp.

**Vị trí.** `LampNetCloud/Spectra` — repo git riêng. Mô hình 3 trục + 2 kênh (`src/lib.rs:1-24`).

**Test — chạy thật lượt hai:** `cargo test --offline` → **248 passed, 0 failed** (gồm
`workload::tests::*`, `integration_tests::score_frame_deterministic`).

**Chặn thật.** Có hợp đồng ML kèm test, **chưa có ai thực thi hợp đồng đó**: `LampNetCloud/Splash`
mới chỉ có tài liệu — `ls` toàn `.md` + `prototype/`, `git log` 3 commit đều là `docs(...)`. Và Spectra
**không chạy ở đâu**: không compose/service/Dockerfile nào tham chiếu; binary `vingest` cần
`required-features = ["daemon"]` (`Spectra/Cargo.toml:49-51`).

**Không có bản mới hơn ở nhánh khác.** `main == origin/main == 72191e7`. Nhánh
`spectra/ml-output-contract` **cũ hơn main 9.110 dòng** — nên xoá.

**Việc cho v2.0.0.** Không làm gì ở phía app. Muốn nói về "phân tích" thì dùng cái chạy thật: số
khung giữ / khung loại của OriLife (`_select_frames()`, `server.py:776`).

## 6. Mô tả đặc trưng dễ hiểu cho nông dân — 🟡

**Người dùng được gì.** Máy chỉ ra bằng tiếng Việt vì sao nó nhận ra cây này — vết sẹo thân, thế
cành, kiểu vỏ — và nói cho nông dân biết còn thiếu góc chụp nào. Không có phần này thì việc nhận
diện là hộp đen: nông dân chụp mò và không tin kết quả.

**Kỹ thuật.** Máy chủ trả đủ từ lâu, app bỏ phí gần hết. **Đã vá 05/08:** hiện `views_kept` /
`views_dropped_dup`, `coverage_hint_vi` (câu "còn thiếu góc nào" — thứ nông dân cần nhất),
`quality_warnings`, `region_warnings`, `farm_dropped` (trước đây bị nuốt: cây rơi khỏi vườn mà không
ai được báo). `TreeDetailScreen` nay truyền `describe:true` để lấy `features_vi`, hiện khối "Máy nhận
ra cây này nhờ".

**Còn lại.** Chờ dữ liệu thật từ bản đang chạy để đối chiếu chữ hiện lên có đọc được không.

## 7. Timeline cho từng cây/quả — 🟡 Máy chủ có, app chưa nối

**Người dùng được gì.** Dòng thời gian mọi việc đã xảy ra với một cây hoặc một quả: ngày đăng ký,
các lần bổ sung ảnh, video, chăm sóc, thu hoạch. Đây là thứ người mua nhìn vào để tin, và là thứ
biến hồ sơ tĩnh thành lịch sử sống.

**Kỹ thuật.** Máy chủ có, app chưa gọi bao giờ. Đường tổng quát:
`GET /api/{entity_type}/{entity_id}/timeline` (`timeline_router.py:164`), proof `:178`, anchor `:221`;
`VALID_ENTITY_TYPES` gồm cả `tree` và `fruit` (`:57`) nên cả hai đều phân giải, và có trong
`openapi.json` của bản đang chạy. App: grep `'/timeline'` trong `src` = **0**. Tab "Lịch sử" hiện chỉ
xếp lại danh sách quả (`TreeDetailScreen.tsx:60,844`).

**Cảnh báo.** Router nạp CÓ ĐIỀU KIỆN (`server.py:1072,1124-1129`) nên có thể vắng trên bản đang
chạy mà không ai biết — phải `curl` xác nhận trước khi vẽ màn.

## 8. Mô hình 3D cho cây — 🟡 Nối rồi, sẽ treo nếu không dựng sẵn

**Người dùng được gì.** Dựng lại cây thành mô hình ba chiều từ chính các ảnh nông dân chụp, xoay xem
được mọi phía. Ở quầy, đây là thứ khách dừng chân lại để xem — bằng chứng trực quan rằng cây này có
thật và đã được ghi nhận đầy đủ.

**Kỹ thuật.** Đã nối (H-11 gỡ): `TreeViewer3DScreen` → `buildTree3D` → `POST /api/build3d/{tree_id}`;
viewer WebView `/view/{code}`.

**Chặn — gần như chắc chắn treo trong buổi trình diễn.** `server.py:1204-1213`: vòng thợ lấy làn xuất
xứ (`_PROVQ`) trước, CHỈ khi làn đó rỗng mới lấy làn dựng 3D (`_RECONQ`). Mỗi lần `/api/enroll` đẩy
vào làn xuất xứ, nên hễ đội đang đăng ký cây liên tục thì 3D không bao giờ tới lượt; và chỉ có một
luồng thợ (`:1267`). Thêm nữa: app KHÔNG poll (grep `setInterval` = 0), chỉ có nút Thử lại bấm tay.

**Việc.** Thêm poll 20–30 s, và **dựng sẵn 3–5 cây mẫu trước buổi**, đừng dựng tại chỗ.

## 9. Gắn ảnh quả vào mô hình 3D — 🟠 Nói sai là mất uy tín

**Người dùng được gì.** Chạm vào một quả trên cây 3D là mở ra ảnh thật của chính quả đó. Đây là chỗ
hai lớp dữ liệu — hình dạng cây và lý lịch từng quả — gặp nhau thành một thứ khách hàng hiểu ngay mà
không cần giải thích.

**Kỹ thuật.** Có khung, nhưng **cây 3D đang hiển thị là mô hình mẫu dựng sẵn trong app, không phải
cây thật**: `treeModels.ts:42-59` `require('assets/models/tree1.glb')`; chính chú thích trong mã ghi
"cây NÀO cũng xem được". Toạ độ quả đặt tay chỉ nằm trong máy (`positionStore.ts:2-11`) — máy chủ chỉ
có `zone`/`pos_x`/`pos_h`, **trục Z mất khi đổi máy**. Hai hệ 3D song song không nói chuyện với nhau:
`TreeViewer3D` (tái dựng thật, không có lớp quả) và `Space3D` (có quả + ảnh, dùng model mẫu).

**Việc.** Ghi nhãn trung thực "hình minh hoạ vị trí quả", tách khỏi nút xem mô hình dựng thật; xin
OriLife bổ sung trường `pos_z`.

## 10. Nút Wakeme cho nông dân — 🟡 Nút chưa tồn tại

**Người dùng được gì.** Nông dân bấm một nút để được ứng trước LAMP dùng dịch vụ, trả dần bằng chính
hoạt động hằng ngày. Đây là cửa vào kinh tế của hệ: người không có vốn vẫn bắt đầu được, thay vì phải
mua token trước mới dùng được gì.

**Kỹ thuật.** Mã chết + máy chủ stub. Client đủ 4 đường (`phoenixKey-api.ts:696-712`
build/submit/vaultStatus/pot; `getlampService.ts:19-47`) nhưng grep `getlampService` = **0 nơi
import**. **Nút Wakeme không tồn tại trong app.** Máy chủ tự khai là stub hoặc 501. Validator
`activation_vault.ak` chưa deploy.

**Nguy hiểm.** Thứ gần nhất là `ActivationScreen` và nó **giả hoàn toàn**: `:189-198` `setTimeout`
3000 ms rồi hiện tích xanh "Hoàn tất"; con số 1.001 LAMP ở `:277` là chữ tĩnh.

**Việc.** Dựng màn từ 2 đường CHỈ ĐỌC `pot()` / `vaultStatus()` trước (không cần ký), và gắn nhãn
hoặc gỡ `ActivationScreen`.

## 11. LAMP về Vault — 🔴 Chưa chạy (cả hai đường)

**Người dùng được gì.** Token chảy vào kho có khoá thay vì vào ví tự do — để phần thưởng và phần cam
kết tách bạch, không ai rút sạch một lúc. Người dùng nhìn thấy tài sản của mình đang được giữ đúng
cam kết.

**Kỹ thuật.** Hai nghĩa "vault", cả hai đều đứt:
- **(A) Vault kích hoạt của Wakeme** — vault của **nông dân**, theo từng danh tính: mã chết + máy chủ
  stub (xem mục 10).
- **(B) Kho Distribution của OrgMint** — vault của **tổ chức**: UI 2 bước đã dựng
  (`OrgMintScreen.tsx:114-152`) nhưng bước ký là stub luôn ném lỗi (`:61-65`), và bước 2 claim-release
  về ví cũng luôn ném (`orgMintService.ts:361-367`, endpoint chưa có). Kho on-chain hiện có
  `authority` = 1 khoá — **một chữ ký rút sạch** (`dist_treasury.ak:14-22`), phải thay bằng kho vesting
  trước khi có giá trị thật.

**Việc.** Ưu tiên đường (A) — đó mới là vault của nông dân.

## 12. MAGIC: InstantGen + ScheduleGen — 🔴 Chờ chốt đường gọi

**Người dùng được gì.** Hai nút sinh MAGIC — tức thời hoặc theo lịch — để người dùng tự tạo tín dụng
dùng dịch vụ trong hệ. Đây là cơ chế biến cam kết dài hạn thành khả năng chi tiêu hằng ngày.

**Kỹ thuật.** Đây là **lỗ hợp đồng, không phải lỗ code**. SuperApp grep `instantgen|schedulegen` = 0.
Nút "Nạp tín dụng MAGIC" (`AccountScreen.tsx:803-812`) là `TouchableOpacity` **không có `onPress`** —
bấm không làm gì, không báo gì. Phía MAGIC: builder chỉ ở package offchain nội bộ,
`MagicSDK/src/index.ts:7-39` không export builder nào cho gen, không có REST/HTTP. Kiến trúc MAGIC
chốt: "Apps không biết gì về MAGIC — chỉ gọi PhoenixKey SDK" — mà PhoenixKey chưa cấp đường gen.

**Kết luận.** Hôm nay không ai ở vị trí dựng được nút này. Đã gửi thư hỏi MAGIC + PhoenixKey chọn 1
trong 3 đường.

## 13. User tạo OrgDID — 🟡 Nối thật, nên đo sớm

**Người dùng được gì.** Hợp tác xã, doanh nghiệp, tổ hội tự tạo danh tính tổ chức trên chuỗi, có
nhiều người cùng giữ quyền. Đây là cửa để một tập thể — không chỉ cá nhân — đứng tên bảo chứng cho
nông sản.

**Kỹ thuật.** Điểm sáng nhất của trục danh tính: nối thật, **không bị cờ `ORG_MINT_ENABLED` chặn**
(service không gọi `ensureEnabled`). Hai lối vào thật (`AccountScreen.tsx:712`,
`PhoenixWalletScreen.tsx:289`) → `OrgDidScreen:139-175` → `POST /identity/org/create`. Chuỗi thử thách
dựng đúng dạng máy chủ kiểm. m-of-n cũng có màn thật (`OrgAuthorityScreen.tsx:95-112`).

**Chưa nâng lên xanh** vì chưa có một lần gọi thành công nào làm bằng chứng.

**Rủi ro.** Danh sách tổ chức chỉ nằm TRONG MỘT MÁY (`OrgDidScreen.tsx:100,115`) vì `GET /identity/org`
chưa có — đổi điện thoại là mất dấu tổ chức vừa tạo. Máy chủ đã sống lại (đo 200 hôm nay).

## 14. OrgDID mint LAMP — ⚫ Giữ cờ tắt

**Người dùng được gì.** Tổ chức đã có danh tính thì xin đúc LAMP theo hạn mức. Đây là chỗ giá trị
thật được tạo ra và phân phối, nên cũng là chỗ sai một bước là mất tiền không lấy lại được.

**Kỹ thuật.** Bốn tầng chặn độc lập, người dùng không bao giờ chạm được:
1. Cờ `ORG_MINT_ENABLED=false` → nút xám vĩnh viễn; và `codemagic.yaml` **không đặt biến này ở đâu
   cả**, nên bật từ giao diện Codemagic cũng vô tác dụng.
2. Bước ký là stub ném lỗi (`OrgMintScreen.tsx:61-65`).
3. **Sai dạng dữ liệu:** app gửi `{orgDid, amount}` + chờ SSE, nhưng `mint-lamp` là **Grant uỷ quyền**
   — 8 trường, ký Ed25519 khoá thiết bị, 200 trả thẳng Grant, **không SSE**; và `mint-lamp/submit-tx`
   sẽ không bao giờ tồn tại mà app vẫn gọi.
4. Builder LAMP chưa chạy: script deploy áp 8/12 tham số, `mintBuilder.ts:111` thiếu `.readFrom`.

**Thêm.** Ô nhập ghi "Số lượng LAMP" nhưng dây dẫn xuống là đơn vị nhỏ nhất — nhập `1000` ra
**0,001 LAMP**, sai 10⁶ lần ở CHIỀU GHI, và sai theo chiều ít hơn nên sẽ không ai kêu.

## 15. User tạo 1 pool — 🔴 / 🟡

**Người dùng được gì.** Người dùng lập hoặc chọn nhóm góp vốn/uỷ thác để cùng hưởng phần thưởng mạng
lưới. Với nông dân đơn lẻ, đây là cách góp sức nhỏ vào một khối đủ lớn để có tiếng nói.

**Phải tách hai nghĩa.**
- **Tạo pool (SPO):** SuperApp không có gì, chưa có spec — phải hỏi chủ dự án trước khi dựng.
- **Chọn / uỷ quyền pool:** module `pool` **chết bốn đường** — (a) `instance.config.ts:69`
  `enabledModules` không có `'pool'` dù manifest khai route; (b) grep `navigate('PoolHome')` = 0,
  không lối vào; (c) `poolService.ts:25-26` ghép base + path ra `/v1/pools` trong khi thật là
  `/api/v1/pools`, đặt biến môi trường vào thì thành `/api/v1/v1/pools` — sai cả hai cách;
  (d) `PHOENIXKEY_POOL_API_URL` thiếu trong cấu hình nên `isPoolBackendEnabled()` luôn false.

**Đáng nói.** Máy chủ đã sống (đo 03/08: `/api/v1/pools` trả 200 kèm danh sách thật). Và **bản trùng**
`stakingService.ts` đi ĐÚNG đường và CÓ lối vào.

**Việc.** Bỏ hẳn module `pool`, giữ `stakingService`.

## 16. Hai user chat với nhau — 🟠 Chặn bởi máy chủ

**Người dùng được gì.** Hai người nhắn tin riêng, mã hoá đầu-cuối, máy chủ không đọc được nội dung.
Nông dân thương lượng giá với thương lái ngay trong app, và nội dung đó là bằng chứng nếu về sau có
tranh chấp.

**Kỹ thuật.** Mã đã nối thật (H-15 gỡ đúng, commit `853d10c`) — không còn giả ở đường gửi/nhận, phần
mã hoá là Rust thật, CI build cả 2 nền tảng. **Nhưng chưa ai chat được**, vì:
1. ⚫ `api.proofchat.me` **502 toàn bộ** — tunnel đã đăng ký, Cloudflare tới được, **máy gốc im**;
   ProofChat và Phoenix đều không có SSH, đã leo thang từ 03/08.
2. 🔴 `users.search` **vỡ dạng dữ liệu**: app chờ `{userDid,...}`, máy chủ trả `{id, did}` →
   `CreateConversationModal.tsx:243` gọi `.slice` trên `undefined` → **sập màn**, không chọn nổi người.
3. 🟠 Lịch sử tin còn dữ liệu giả **không nhãn DEMO**: `ChatScreen.tsx:173-178` `setTimeout` trả chuỗi
   bịa "Tin nhắn đã giải mã thành công".
4. `meId` cố định `'me'` nên "tin của tôi" ở mọi tin lịch sử đều sai.

**Đã vá 05/08.** Thêm 4 biến `PROOFCHAT_*` vào cấu hình build (trước thiếu hoàn toàn) — máy chủ sống
lại là bản build tự bật, không phải chờ thêm một vòng phát hành.

## 17. User tạo nhóm chat — 🟠 Mã đủ, chặn cùng chỗ

**Người dùng được gì.** Lập nhóm nhiều người cùng trao đổi, vẫn mã hoá đầu-cuối. Hợp tác xã họp bàn
giá, tổ kỹ thuật hướng dẫn nhau — không phải rời app sang nền tảng khác.

**Kỹ thuật.** Đây là phần mã cẩn thận nhất trong cả bốn mục thuộc trục chat: truyền đúng loại người
dùng chọn, có hàng chờ khi rớt mạng cất bằng kho an toàn, UI nói thật "Đã tạo nhóm — chưa mời được
ai", và hàm đồng bộ không tin nhãn do máy chủ gắn mà quyết theo trạng thái nhóm cục bộ.

**Nhưng.** Kế thừa toàn bộ chặn của chat 1-1 (502 + `users.search` vỡ ⇒ **không chọn nổi thành viên**).
Thêm 🔴 loại `THREAD` không tồn tại ở máy chủ — UI chào 4 loại, máy chủ chỉ có 3 → chọn `THREAD` là
400. Và cảnh báo "nhóm chưa mời được ai" chỉ hiện **một lần rồi biến mất**:
`getPendingEpochCount`/`flushPendingEpochs` không màn nào gọi.

## 18. Aladin đặt 1 công việc — 🟠 Chưa đăng được việc nào

**Người dùng được gì.** Chủ vườn đăng một việc cần thuê — tỉa cành, phun thuốc, thu hoạch — kèm giá
và thời điểm. Đây là nửa CẦU của chợ việc làm nông nghiệp trong app.

**Kỹ thuật.** H-16 đã hết: `usePostJob` không còn trả TRUE giả khi cổng tắt, nay trả false +
`BACKEND_DISABLED` và UI báo trung thực. Ký thật qua PhoenixKey đã nối.

**Đã vá 05/08.** `codemagic.yaml` không ghi `WORK_API_URL` (grep 0/1001 dòng) → biến undefined → cổng
runtime xoá URL kiểm tra sức khoẻ → phép thử không bao giờ chạy → **module rơi rỗng vĩnh viễn** dù
`api.aladin.work` đo 200 hôm nay.

**Còn nợ.** 🔴 `templateKey` sai — `PostJobScreen.tsx:49` gửi `category` từ dữ liệu giả, khoá thật là
`video_short`/`motion`/`tutoring`/`tree_id`… chỉ 1/10 trùng → 404 `NO_TEMPLATE`. Và `location`/`urgent`
thu ở form nhưng không có trong body gửi đi → mất dữ liệu người dùng vừa nhập.

## 19. Genie nhận 1 công việc — 🟡 Vừa gỡ chặn cứng

**Người dùng được gì.** Người thợ nhận việc được giao, khoá cam kết, làm xong thì tất toán. Đây là
nửa CUNG của chợ — và là chỗ tiền thật đổi tay, nên cũng là chỗ đáng tin nhất phải đúng.

**Đã vá 05/08 — chỗ làm cả chợ đứng im.** `getJobMatch` gọi `/jobs/:id/match` **không gắn Bearer** →
đo thật 401 `UNAUTH` → màn Ghép việc luôn hiện lỗi → người đăng **không bao giờ thấy ứng viên** → thợ
không bao giờ nhận được việc. Một dòng.

**Còn lại.** Dữ liệu thật rỗng (`/taskers` total 0, `/jobs` `[]`, accounts 0) nên chưa chạy trọn vòng
được; `WorkerProfileScreen` 100% giả **không nhãn DEMO** và luôn hỏng (dùng id giả `w-001` trong khi
`TaskersScreen` truyền `did:phoenix:…`); thiếu phân trang `/jobs` (trần 50/trang, danh sách cụt lặng
lẽ); thiếu 3 mã lỗi mới `OFFER_CLOSED`/`NO_ACCOUNT`/`RICE_RECONCILE`; điểm uy tín đổi nghĩa (thang
0..100) mà app còn in số trần.

## 20. Chia sẻ 1 GB + 10 MB RAM — 🔴 Chưa được phép build

**Người dùng được gì.** Máy điện thoại nông dân tự động góp một phần đĩa và bộ nhớ để giữ mảnh dữ
liệu mã hoá của người khác. Cả mạng lưới trở thành kho chung, không ai phải trả tiền máy chủ, và
người góp được thưởng.

**Kỹ thuật.** Chưa có gì — chưa cả ô chọn, chứ chưa nói chạy nền. Không có trường ổ cứng
(`contributionLevels.ts:8-21` chỉ có `cpuPct`/`ramMb`/`bandwidthMbps`, và ba số `ramMb` là **nhãn hiển
thị** không nối cơ chế cưỡng chế nào). Mức người dùng chọn **không được gửi đi đâu**. Không có chạy
nền (Manifest không có `FOREGROUND_SERVICE`/`WAKE_LOCK`/service; `package.json` không có thư viện nền).
Không có màn đồng ý.

**Chặn cứng.** `Join-Integration.md §6.5` có 9 điều kiện, **cả 9 đều chưa đạt** — nặng nhất là node
giữ mảnh **vẫn đọc được nội dung** (mảnh chỉ bị XOR bằng mặt nạ sinh từ hằng số công khai) và tên tệp
gốc lộ nguyên văn. Join nói rõ: **chưa được phép viết mã** cho §6. Ô đồng ý để trống chờ bản pháp lý.

**📬 LampNet xác nhận 05/08 — và nói mục này còn viết NHẸ hơn thực tế.** Không cần gom đủ k mảnh
mới đọc được nội dung: `/internal/fetch/:cid` **không có xác thực** (`lampnet-node.rs:1511, 3091`)
⇒ hỏi thẳng node là có byte. LampNet đã thêm 4 điều kiện chặn mới (10–13) vào `Join-Integration.md
§6.5`, nâng tổng lên **13 điều kiện, vẫn chưa đạt điều nào**. Giữ nguyên 🔴 và giữ nguyên lệnh
chưa-được-phép-build.

## 21. Bấm Join để tính thưởng — 🟠 Hết hỏng im lặng

**Người dùng được gì.** Nông dân bấm "Kết đèn" là máy mình gia nhập mạng lưới và bắt đầu tích thưởng.
Một nút, không cấu hình, không phải hiểu kỹ thuật — đó là toàn bộ trải nghiệm cần có.

**Đã vá 6 lỗi 05/08** (Join báo P0: không đăng ký được và hỏng im lặng):
1. `request()` nuốt lỗi phân tích thành `{}` — `/v1/peer_id` trả `text/plain` nên `bootstrap_did` thành
   `undefined` và màn không hiện gì.
2. Chuyển sang `GET /v1/network_info` → `bootstrap_peer_id`.
3. Bỏ đường lui REST — daemon đòi 22 trường + 2 chữ ký Ed25519, app gửi 4 → luôn 422.
4. Phân loại lỗi: chỉ 401/403 mới là lỗi quyền; trước đây 405/422 hiện thành "chưa đủ bậc tham gia" =
   **đổ lỗi cho người dùng**, đúng cách để không ai tìm ra lỗi.
5. `settlement` POST → GET.
6. Thêm `isNativeJoinAvailable()` để trả lời ngay, không tốn một vòng mạng.

**Còn chặn.** Cầu native chưa có. Hàm Rust `join_and_contribute` **đã có sẵn** (`join.rs:166`, dựng đủ
22 trường + đo hiệu năng) — thiếu đúng khâu đóng gói thành thư viện cho Android/iOS. Thêm:
`signaling_url` trả `ws://` (iOS chặn).

## 22. Hệ đo lường & tính thưởng — 🟠 Mạch sống nhưng rỗng

**Người dùng được gì.** Đo thời gian máy trực tuyến và khối lượng dữ liệu đã giữ, quy ra điểm, quy ra
thưởng. Không có phần này thì lời mời góp máy là lời hứa suông, và không ai góp lần thứ hai.

**Kỹ thuật.** Daemon có mạch đo đang chạy nhưng **rỗng hoàn toàn**, và app nối sai hết đường. Đo thật:
`/v1/mobile/settlement` trả `entry_count` 0, `total_ulamp` 0 ⇒ **chưa từng có thiết bị nào báo cáo**.

**Đã vá 05/08.** Bỏ `/v1/reward/epoch` khỏi màn Đang đóng góp — đó là đường POST phía **vận hành**
(nhận đóng góp của TẤT CẢ node + đòi chữ ký hệ thống), gọi bằng GET trả 405, và 405 bị xếp nhầm vào
lỗi quyền ⇒ **màn này chưa bao giờ hiện được một con số nào**. Thêm `getDeviceRewards()` trỏ
`GET /v1/mobile/rewards/{device_pubkey}`.

**Còn chặn.** Chưa có khoá thiết bị (cần SDK native); sổ `mobile_rewards` **nằm trong bộ nhớ**, mất khi
daemon khởi động lại; đơn vị thưởng chốt là CARP nhưng lõi đang trả µLAMP; Registry chưa deploy lên
mạng nào.

**📬 LampNet xác nhận 05/08 — nặng hơn ba bậc so với những gì viết ở trên.** Ngoài "khởi động lại là
mất", còn ba đường nữa, **không cần khởi động lại, ai cũng làm được** (chi tiết ở
[issue #50](https://github.com/LampNetCloud/lampnet-hivemind/issues/50)):

- **(a) Hai request ẩn danh xoá sổ thưởng toàn mạng.** `GET /v1/signaling_config` là route công
  khai không xác thực (`lampnet-node.rs:1489`) và **trả thẳng `api_token`** (`:6965`); token đó
  chính là thứ `require_bearer_auth` so sánh, nên `POST /v1/mobile/settlement/drain` (`:3618`)
  chạy `rewards.clear()` (`:8006`). Công của mọi người trả về trong phản hồi HTTP của người gọi
  rồi biến mất — không ghi đĩa, không neo.
- **(b) Mọi route "có bearer" của daemon đều mở**, cùng một lý do.
- **(c) Phát thưởng lặp vô hạn.** `lease_id` tất định theo `(device, ts)` (`mobile_settle.rs:226`),
  lease mới luôn `claimed: false` (`:269`), `leases.insert` ghi đè không kiểm
  (`lampnet-node.rs:7815`) ⇒ xin lại lease với đúng `ts` cũ là `claimed` reset, nộp lại y nguyên
  đáp án cũ, cộng thưởng lần nữa.
- **(d) Sổ khoá theo `device_pubkey_hex`, không neo DID** ⇒ sinh khoá mới tốn 32 byte. Rào "người
  thật" dừng ở cửa ứng dụng, không đi vào tầng thưởng.

**LampNet đề nghị cho v2.0.0:** gỡ màn "Đang đóng góp" hoặc dán nhãn "tạm tính, chưa ghi nhận".
**Đã đối chiếu mã — đề nghị này hôm nay chưa cần thi hành:** `ContributingScreen.tsx:60` đặt cứng
`setReward(null)`, nên ô "Thưởng tích luỹ" **luôn hiện dấu `—`**, kèm đúng câu "Chưa đo được thưởng
của máy này… không phải bạn chưa được ghi nhận" (`:188`). Nhánh vừa rồi chỉ thêm **hàm dịch vụ**
`getDeviceRewards()`, **không** nối vào màn. ⟹ Không có con số nào hiện cho người thật trong bản
này. **Chốt kỹ thuật: giữ nguyên `setReward(null)` cho tới khi LampNet ghi bền được sổ VÀ sửa đơn
vị sang CARP.** Ai nối `getDeviceRewards` vào màn trước mốc đó là làm hiện một con số vừa sai đơn
vị vừa ai cũng xoá được — đã ghi cảnh báo tại chỗ trong mã.

---

## B1. ⚠ CHẶN BUILD: CI đỏ 10/10 — 🟢 Đã vá

Không phải tính năng — đây là lý do **không ra được file APK nào từ 26/07**.

**Nguyên nhân gốc.** Không ai đặt `expo.enableWorkletsIntegration` → expo-modules-core bật
`-DWORKLETS_ENABLED=1` → `WorkletRuntimeInstaller.cpp:6` đòi `<worklets/Compat/StableApi.h>`, header
chỉ có từ react-native-worklets 0.8.0 mà dự án ghim 0.7.4 (peerDeps của Expo khai sai).

**Chỗ đau.** Dự án **đã có** bản vá mở đúng công tắc đó từ chính commit gây ra lỗi, và `AI_LOG.md:227`
dặn đặt vào `android/gradle.properties` — nhưng file đó bị gitignore và bị workflow **ghi đè** bằng
heredoc không có công tắc. Vá được áp, công tắc không bật, vô tác dụng 10 ngày.

**Đã làm.** Thêm dòng đó vào cả 4 heredoc.

⚠ **Không hứa "một dòng là xong"** — job chưa bao giờ đi quá bước biên dịch C++ nên các bước sau chưa
được kiểm chứng lần nào.

## B2. ⚠ CHẶN BUILD: cấu hình build thiếu — 🟢 Đã vá

Không phải tính năng — đây là lý do vì sao nhiều module "trông như chưa xong" trong khi máy chủ của
chúng đang sống. Ảnh hưởng trực tiếp tới việc đánh giá đúng hiện trạng.

`codemagic.yaml` (1001 dòng, 4 workflow) không ghi `WORK_API_URL` (grep 0) và không ghi bất kỳ biến
`PROOFCHAT_*` nào. Chuỗi hệ quả: biến vắng → `@env` undefined → `registerCapability(cap, undefined)` →
cổng runtime xoá URL kiểm tra → phép thử không bao giờ chạy → **module rơi rỗng vĩnh viễn**. Nghĩa là
mọi báo cáo cũ kiểu "module Việc-làm trống" đều **không nói lên điều gì** về máy chủ.

Cũng đã để trống `ANALYTICS_API_URL`: `analytics.orilife.io` là DNS NXDOMAIN — **bản ghi không tồn
tại** — mà đang được nướng cứng vào cả 4 workflow.

**Còn nợ.** `PHOENIXKEY_POOL_API_URL` vẫn thiếu (nhưng module `pool` nên bỏ hẳn, xem mục 15).

## B3. ⚠ CHẶN BUILD: APK thiếu 2 thư viện Rust — ⚫ Chờ chọn đường

Không phải tính năng — đây là lý do bản APK build từ GitHub Actions sẽ chạy được nhưng ví PhoenixKey
và chat mã hoá báo "không khả dụng".

`codemagic.yaml` có hai bước build Rust sinh `libtaad_enclave_core.so` + `libchat_mls.so` vào
`jniLibs`; `.github/workflows/debug-apk.yml` **không có** bước tương ứng, và `git ls-files` cho thấy
hai file đó không được commit. App sẽ **không sập** (cả hai module đều bọc try/catch quanh
`System.loadLibrary` và đặt `libLoaded=false`) nhưng hai tính năng đó báo không khả dụng.

**Lựa chọn.** (a) Build qua Codemagic — nhanh hơn. (b) Thêm bước build Rust vào `debug-apk.yml` — bền
hơn. Cần chủ dự án chọn.
