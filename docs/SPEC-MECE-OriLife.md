# SPEC-MECE — Bản đồ tính năng OriLife (MECE Framework)

**Phiên bản**: 2026-06-10 rev2 (Audit bổ sung — Input/Labor/Finance/Population Paradigm/Compliance)
**Phạm vi**: Toàn hệ OriLife — backend + mobile + contracts + infra
**Phương pháp**: MECE (Mutually Exclusive, Collectively Exhaustive)
**Nguồn dữ liệu**: codebase thực tế — `orilife-core/MassTreeIdentify/core/`, `orilife-mobile-app/src/`, `OriLife-Specs/`, session-state files
**Lưu ý tham số**: Mọi ngưỡng (τ, weights) ghi là Working Hypothesis — cần calibrate từ field data Phase 0 (≥50 cá thể/loài, 5 ảnh/con).

---

## Quy ước Status & Priority

| Status | Nghĩa |
|---|---|
| `working` | Đã code + test pass, chạy được trên Tiger/staging |
| `partial` | Code có nhưng chưa đủ — thiếu wiring / thiếu mobile / thiếu test |
| `coded_bugs` | Code đã viết nhưng có lỗi đã xác nhận chưa sửa |
| `spec_exists` | Spec đầy đủ nhưng chưa code |
| `not_started` | Chưa có spec lẫn code |

| Priority | Nghĩa |
|---|---|
| `critical` | Chặn launch / cốt lõi giá trị sản phẩm |
| `high` | Cần có trước market fit |
| `medium` | Cải thiện đáng kể trải nghiệm / doanh thu |
| `low` | Nice-to-have, defer được sang sau v1 |

---

## A. Định danh thực thể (Identity)

> Phạm vi: nhận diện cá thể không cần phần cứng vật lý (không tem, không QR, không RFID). Đây là lõi giá trị khác biệt tuyệt đối của OriLife.

| # | Tính năng | Mô tả | Status | Priority | Sprint (tuần) | Owner |
|---|---|---|---|---|---|---|
| A1 | Tree ReID — DINOv2 4 kênh | Nhận diện cây từ ảnh: CTX + PLANT + BASE + LEAF; `bark_verify` xác nhận vỏ cây; 5 quyết định (MATCH/CONFIDENT/UNCERTAIN/WEAK/NO_MATCH); factor breakdown hiển thị 4 tín hiệu | `working` | `critical` | — | Lợi/Hệ thống |
| A2 | Tree ReID — iOS native camera bridge | `NativeCameraPreview` 2-round capture; heading/pitch/GPS gắn vào request; iOS-only, Android fallback image picker | `working` | `critical` | — | Thư |
| A3 | Tree enroll — đăng ký cây mới | Flow sau NO_MATCH: chụp ≥3 ảnh góc khác nhau + GPS + heading; gán tree_id; lưu gallery; tạo presence attestation | `working` | `critical` | — | Lợi/Thư |
| A4 | Animal ReID — DINOv2 4 kênh BODY/FACE/MARK/BIO | Nhận diện cá thể vật nuôi (bò/heo/dê/vịt/gà/chó); per-species weights + threshold; ẩn nội tạng (không trả similarity/margin/factors về client) | `partial` | `critical` | 2 | Lợi |
| A5 | Animal enroll — đăng ký cá thể mới | Chụp ≥3 ảnh góc khác; gán AnimalDID; lưu gallery; min 3 view trước khi accept | `partial` | `critical` | 2 | Thư |
| A6 | Animal mobile UI — màn nhận diện + quản lý | `AnimalIdentityScreen`, `AnimalEnrollScreen`, `AnimalManagementScreen` — các màn đã có nhưng chưa kết nối fee engine + DID flow | `partial` | `critical` | 2 | Thư |
| A7 | Fruit ReID — nhận diện từng quả | `fruit_reid.py` 80/80 test pass; gallery theo tree_id; anchor fruit→tree; chưa wired vào server identify endpoint | `partial` | `high` | 3 | Lợi |
| A8 | Fruit 3D detection | `fruit3d.py` + SAM crop; multiview triangulation; bounding box 3D quả trên point cloud cây. **[Audit: hạ từ `high` xuống `low` giai đoạn v1 — compute nặng, chạy chậm trên 3G, giá trị thực tế thấp hơn A11; freeze sau Sprint 3]** | `partial` | `low` | post-v1 | Lợi |
| A9 | Neighbor graph — tránh nhầm cùng loài | `neighbor_graph.py` đồ thị hàng xóm địa lý; lọc false-positive cùng trang trại; đã test + deploy Tiger | `working` | `high` | — | Hệ thống |
| A10 | Temporal drift tracking — vật nuôi | `animal_drift.py`; EMA decay theo half-life per loài; MAX_VIEW_AGE_DAYS = 180; loại view quá cũ khỏi gallery | `working` | `high` | — | Hệ thống |
| A11 | Batch/lot tracking — nhiều quả trộn lẫn | Khi thu hoạch, nhiều quả từ 1 cây → 1 lot_id (không track cá thể từng quả); lot→tree anchor; QR lot cho logistics | `not_started` | `high` | 4 | Tùng |
| A12 | Breeding record — bố/mẹ → con | Khi đăng ký cá thể mới, gắn parent_animal_did (bố + mẹ nếu biết); suy ra pedigree tối 3 thế hệ. **[Audit: đẩy sau khi Animal ReID stable — Sprint 8]** | `not_started` | `medium` | 8 | Lợi |

**Narrative A**: Trục A là lõi kỹ thuật duy nhất của OriLife — định danh không phần cứng. TreeReID đã working; AnimalReID backend working nhưng mobile còn partial (chưa wired fee + DID). A8 (Fruit 3D) hạ priority xuống `low` post-v1 vì compute quá nặng cho điều kiện thực địa VN. Gap quan trọng nhất: **Batch/lot tracking** (A11) — khi thu hoạch hàng tấn sầu riêng, không thể track từng quả mà cần lot_id để duy trì chain. Breeding record (A12) mở khả năng xuất khẩu chuẩn EU (yêu cầu 3 thế hệ truy xuất cho bò sữa).

---

## B. Vòng đời thực thể (Lifecycle)

> Phạm vi: toàn bộ sự kiện xảy ra với một cá thể từ khi đăng ký đến khi ngừng hoạt động.

| # | Tính năng | Mô tả | Status | Priority | Sprint (tuần) | Owner |
|---|---|---|---|---|---|---|
| B1 | Tree lifecycle events | Ghi sự kiện: đăng ký / bón phân / phun thuốc / thu hoạch / chặt bỏ — gắn tree_id + timestamp + GPS | `partial` | `critical` | 2 | Thư/Lợi |
| B2 | Animal lifecycle events | Ghi: đăng ký / tiêm phòng / điều trị / xuất chuồng / chết — gắn AnimalDID + timestamp | `partial` | `critical` | 2 | Thư |
| B3 | Ownership transfer — cây/quả | Chuyển nhượng cây giữa nông dân; đổi owner_did; ghi on-chain; chặn chuyển khi đang có tranh chấp | `spec_exists` | `high` | 4 | Tùng |
| B4 | Ownership transfer — vật nuôi | Chuyển bò/heo khi bán; lịch sử chủ sở hữu trên chain; cần seller + buyer ký | `spec_exists` | `high` | 4 | Tùng |
| B5 | Retirement / soft-delete thực thể | Đánh dấu cây ngừng theo dõi hoặc cá thể chết — KHÔNG xóa data; đánh flag; giữ audit trail | `coded_bugs` | `high` | 1 | Lợi |
| B6 | Feed / nutrition logging — vật nuôi | Ghi khẩu phần ăn hàng ngày (loại thức ăn, khối lượng, nguồn gốc); tích hợp cảnh báo khi dùng cám có chất cấm. **[Audit: nâng từ `high` Sprint 5 lên `critical` Sprint 2 — thức ăn chiếm 65-70% giá thành gà; bắt buộc để xuất khẩu; blocking cho B7 và E7]** | `not_started` | `critical` | 2 | Lành |
| B7 | Slaughter chain — từ chuồng đến lò | Xuất chuồng → giấy kiểm dịch → lò giết mổ → mã thân thịt; duy trì chain AnimalDID→CarcassID | `not_started` | `medium` | 6 | Tùng |
| B8 | Fruit harvest event | Ghi sự kiện thu hoạch cụ thể: ngày, khối lượng, độ chín, lot_id → tạo batch (liên kết A11) | `not_started` | `high` | 4 | Lành |
| B9 | Seasonal baseline per entity | Mỗi cây/vật nuôi lưu baseline theo mùa (phenology) để anomaly detection không báo nhầm khi thay lá/thay lông theo mùa | `not_started` | `medium` | 6 | Lợi |

**Narrative B**: Lifecycle là "xương sống" dữ liệu — không có B thì A chỉ là nhận diện đơn lẻ, không phải truy xuất. B5 (soft-delete) đã coded nhưng có bugs đã ghi nhận trong audit GAP-1. B6 (Feed logging) nâng lên `critical` Sprint 2 theo audit — feed records là điều kiện EU bắt buộc cho bò sữa, đồng thời là input trực tiếp cho FCR tracking (G8). B9 (Seasonal baseline) cần để tránh false alarm khi vịt thay lông theo mùa.

---

## C. Sức khỏe & Điều trị (Health)

> Phạm vi: ghi nhận, cảnh báo, và lịch sử điều trị — kết nối nông dân ↔ thú y ↔ cơ quan kiểm dịch.

| # | Tính năng | Mô tả | Status | Priority | Sprint (tuần) | Owner |
|---|---|---|---|---|---|---|
| C1 | Care KB — 8,104 loài vet + PHI | Kho tri thức sản phẩm thú y/BVTV: hoạt chất, nhóm kháng sinh, thời gian cách ly (PHI/WDT), cờ cấm EU, cờ AMR; seed từ 5 tài liệu Bộ NN | `partial` | `critical` | 1 | Lành |
| C2 | Care event — ghi nhật ký chăm sóc | Chụp bao thuốc/lọ vaccine → OCR nhận diện sản phẩm → tự điền tên/hoạt chất/PHI; gắn vào tree_id / AnimalDID / farm_id; **khi ghi C2, trừ tồn kho K1 tự động** | `partial` | `critical` | 1 | Lành |
| C3 | PHI withdrawal alert | Cảnh báo THỜI GIAN CÁCH LY: chặn "cho phép thu hoạch/xuất chuồng" khi còn tồn dư; icon đỏ rõ ràng; tính toán ngày an toàn | `coded_bugs` | `critical` | 1 | Lành |
| C4 | Vaccination schedule | Lịch tiêm phòng theo loài (gà Newcastle 3 tuần/lần, bò LMLM 6 tháng/lần...); push notification nhắc trước 3 ngày; ghi kết quả sau tiêm. **[Audit: nâng từ `high` Sprint 4 lên `critical` Sprint 2 — Thông tư 07/2016/TT-BNNPTNT bắt buộc; bỏ lỡ 1 mũi Newcastle có thể xóa sổ đàn gà 10.000 con trong 3 ngày]** | `not_started` | `critical` | 2 | Lành |
| C5 | Vet visit record | Thú y quét AnimalDID → xem lịch sử → ghi chẩn đoán + đơn thuốc; cần VetDID xác thực; gắn onto AnimalDID chain | `not_started` | `high` | 5 | Lành/Tùng |
| C6 | Cross-farm outbreak alert | Khi 1 trang trại có dịch (ASF, cúm gia cầm...) → cảnh báo trang trại trong bán kính N km (dùng neighbor_graph địa lý); push notification + khuyến nghị cách ly | `not_started` | `critical` | 3 | Lợi/TigerAgent |
| C7 | AMR / kháng kháng sinh tracking | Cờ WARN_AMR khi dùng kháng sinh lặp lại trong cùng đàn; gợi ý luân phiên hoạt chất; ghi để báo cáo kháng thuốc | `partial` | `medium` | 3 | Lành |
| C8 | Water/irrigation management | Ghi lịch tưới (ngày, lượng, nguồn nước, pH nếu có sensor); cảnh báo khi thiếu nước hoặc tưới sai giai đoạn | `not_started` | `medium` | 6 | Lành |
| C9 | Water quality testing record | Ghi kết quả xét nghiệm nguồn nước tưới định kỳ (vi sinh, kim loại nặng, pH); lưu vào provenance chain. **[Audit mới — yêu cầu VietGAP; thiếu trong spec gốc]** | `not_started` | `high` | 5 | Lành |

**Narrative C**: Module Care đang ở trạng thái "coded_bugs" cho C3 — đây là tính năng giá trị nhất (an toàn thực phẩm = cửa vào thị trường xuất khẩu). C4 (Vaccination schedule) nâng lên `critical` Sprint 2 vì rủi ro pháp lý cao. C6 (Cross-farm outbreak) là tính năng không tìm thấy ở bất kỳ đối thủ nào tại VN — cần neighbor_graph (đã xây A9) làm nền. C9 (Water quality) thêm mới theo yêu cầu VietGAP.

---

## D. Kiến thức & Tư vấn (Knowledge)

> Phạm vi: AI tư vấn thông minh dựa trên dữ liệu thực thể + kho tri thức nông nghiệp.

| # | Tính năng | Mô tả | Status | Priority | Sprint (tuần) | Owner |
|---|---|---|---|---|---|---|
| D1 | TigerAgent — OCR bao thuốc | Chụp nhãn thuốc/phân bón → OCR trích xuất tên sản phẩm, hoạt chất, hướng dẫn pha; phase 1 đã coded một phần | `partial` | `critical` | 1 | TigerAgent |
| D2 | Care KB query — tra cứu sản phẩm | Nhập tên/hoạt chất → tra PHI, nhóm kháng sinh, cảnh báo cấm EU, liều dùng, đối tượng áp dụng | `partial` | `critical` | 1 | TigerAgent/Lành |
| D3 | Agro advisory chatbot | Chat với TigerAgent về vấn đề cây trồng/vật nuôi; câu trả lời dựa trên Care KB + lịch sử sự kiện của thực thể đang xem | `not_started` | `high` | 5 | TigerAgent |
| D4 | Disease diagnosis từ ảnh | Upload ảnh triệu chứng (lá úa, vết lở...) → phân loại bệnh → gợi ý thuốc từ Care KB; confidence score rõ ràng | `not_started` | `high` | 6 | TigerAgent/Lợi |
| D5 | Nutrient deficiency detection | Phân tích màu sắc lá qua ảnh → phát hiện thiếu đạm/kali/sắt; gợi ý loại phân bổ sung. **[Audit: giữ `medium` Sprint 9 — độ chính xác thấp ở nắng gắt VN; cần ≥500 mẫu calibrate trước khi triển khai]** | `not_started` | `medium` | 9 | TigerAgent |
| D6 | Market price integration | Kéo giá heo/bò/sầu riêng từ API sàn (AgroViet, giá thị trường Đồng Nai) → hiện ngay trên profile cá thể/cây | `not_started` | `medium` | 6 | TigerAgent |
| D7 | Best-practice library per crop/species | Thư viện quy trình VietGAP / GlobalGAP / tiêu chuẩn EU theo cây/vật nuôi; filter theo vùng địa lý (ĐBSCL vs Tây Nguyên) | `not_started` | `medium` | 7 | Lành |

**Narrative D**: TigerAgent là "bộ não" tư vấn — hiện chỉ có OCR phase 1 chưa hoàn chỉnh. D3 (chatbot) và D4 (diagnosis từ ảnh) là tính năng có thể giữ chân nông dân dài hạn vì cung cấp giá trị ngay lập tức mà không cần onboard phức tạp. D5 hạ về Sprint 9 và giữ `medium` vì cần calibration data thực địa trước. D6 (market price) nhỏ về kỹ thuật nhưng rất cao về adoption vì nông dân tra giá hàng ngày.

---

## E. Xác thực & Chứng nhận (Certification)

> Phạm vi: tạo và xác minh chứng nhận có giá trị pháp lý — từ on-chain đến giấy tờ export.

| # | Tính năng | Mô tả | Status | Priority | Sprint (tuần) | Owner |
|---|---|---|---|---|---|---|
| E1 | Cardano on-chain anchor — cây | Neo BLAKE3 root + CID + tree_code lên Cardano (metadata label 1454); `anchor.py` + `anchor_worker.py`; Preview testnet đang hoạt động | `working` | `critical` | — | Hệ thống |
| E2 | Cardano on-chain anchor — vật nuôi | Tương tự E1 cho AnimalDID; chưa wired vào animal_identity enroll flow | `partial` | `critical` | 2 | Tùng |
| E3 | PhoenixKey DID — cây/quả | `did_adapter.py`; sinh did:phoenix loại "asset" cho từng cây; presence attestation (GPS ký + nonce + slot); first-claim-wins; bridge.ts mobile | `partial` | `critical` | 2 | Tùng |
| E4 | PhoenixKey DID — vật nuôi | Tương tự E3 cho AnimalDID; chưa bắt đầu phần did_adapter cho animal entity_type | `not_started` | `critical` | 3 | Tùng |
| E5 | Consumer QR verification | Người tiêu dùng quét QR trên bao bì → xem lịch sử đầy đủ của lot/cây/cá thể; không cần app, chỉ browser; verify on-chain | `not_started` | `high` | 4 | Tùng/Thư |
| E6 | Quarantine certificate — xuất chuồng | Tạo giấy kiểm dịch điện tử có chữ ký VetDID + AnimalDID; format PDF chuẩn Bộ NN (Thông tư 07/2016); hash lên Cardano | `not_started` | `high` | 6 | Tùng |
| E7 | Export compliance — EU/US | Kiểm tra tự động: PHI > 0 ngày → chặn; chất cấm EU (WARN_BANNED_EU) → cảnh báo; truy xuất 3 đời (E3+A12); tạo export document package | `not_started` | `high` | 7 | Lành/Tùng |
| E8 | VietGAP / GlobalGAP checklist | Checklist tự đánh giá tích hợp trực tiếp trong app; mỗi hành động ghi đúng tạo tick tự động; xuất PDF chứng minh compliance. **[Audit: nâng từ `medium` Sprint 7 lên `high` Sprint 4 — siêu thị nội địa (Co.opmart, Winmart) YÊU CẦU VietGAP; ưu tiên VietGAP trước GlobalGAP vì thị trường nội địa đến trước; checklist chỉ đủ khi có K1+K2+L1 audit trail]** | `not_started` | `high` | 4 | Lành |
| E9 | MRL test result logging | Chụp phiếu kết quả kiểm nghiệm dư lượng từ phòng lab → OCR → gắn vào lot_id → hash lên chain. **[Audit mới — yêu cầu bắt buộc EU Regulation 2019/1793 cho sầu riêng/xoài xuất khẩu; không có E9 thì E7 không hoàn chỉnh]** | `not_started` | `high` | 6 | Lành/Tùng |

**Narrative E**: E1 đang working cho cây trên Preview testnet. E3 partial — presence attestation đã thiết kế bảo mật tốt (vá A1-A7). E5 (Consumer QR) là tính năng B2C quan trọng nhất để chứng minh giá trị toàn chain với người tiêu dùng cuối. E8 nâng lên Sprint 4 vì đây là cửa vào siêu thị nội địa — thị trường tiếp cận được sớm hơn EU. E9 thêm mới theo yêu cầu kiểm nghiệm dư lượng cho xuất khẩu.

---

## F. Kinh tế & Phần thưởng (Economics)

> Phạm vi: cơ chế phí, thanh toán LAMP, khuyến khích nông dân đóng góp dữ liệu.

| # | Tính năng | Mô tả | Status | Priority | Sprint (tuần) | Owner |
|---|---|---|---|---|---|---|
| F1 | Fee engine — cây/quả | `feeEngine.ts`: tính phí LAMP per tác vụ; phân rã 4 tài nguyên (storage/compute/bandwidth/anchor); demand factor; trần ≤ 50% traditional | `partial` | `critical` | 2 | Tùng |
| F2 | Fee engine — vật nuôi | `animal_fee.py`: base fee + value-based + demand; species floor value (chống khai thấp); LAMP oil conversion | `partial` | `critical` | 2 | Tùng |
| F3 | Fee display mobile | Hiển thị ước tính phí LAMP trước khi nông dân xác nhận tác vụ; so sánh với "chi phí truyền thống" để minh bạch lợi ích | `not_started` | `critical` | 2 | Thư |
| F4 | LAMP wallet integration mobile | Kiểm tra số dư LAMP; top-up flow; transaction history; liên kết ví Cardano của nông dân | `not_started` | `critical` | 3 | Thư/Tùng |
| F5 | Treasury routing — 3 bucket | Phí phân rã đúng 3 bucket treasury (storage providers / compute nodes / anchor reserve); KHÔNG self-custody | `partial` | `high` | 3 | Tùng |
| F6 | Data contributor rewards | Nông dân đóng góp ảnh calibrate / field test data được thưởng LAMP; vesting schedule đơn giản | `not_started` | `medium` | 7 | Lành/Tùng |
| F7 | DAO fee parameter governance | Nông dân MAGIC holder bỏ phiếu cập nhật fee params mỗi mùa vụ; hiện là hằng số hardcoded | `not_started` | `low` | 10 | Tùng |

**Narrative F**: F1 và F2 đã built nhưng chưa wired vào enroll/identify flow. F3 và F4 hoàn toàn not_started trên mobile — đây là blocking cho production launch vì nông dân cần biết mình trả bao nhiêu trước khi xác nhận. F7 (DAO governance) là long-term — nông dân không quan tâm DAO voting, defer an toàn sang năm 2.

---

## G. Giám sát quần thể (Population)

> Phạm vi: phân tích toàn đàn / toàn vườn — không chỉ từng cá thể.
>
> **Lưu ý paradigm**: Module G phục vụ cả individual tracking (bò/heo/dê) lẫn zone-based tracking (gà/vịt công nghiệp). Xem section **"Population Monitoring Paradigm"** cuối file để hiểu ranh giới thiết kế.

| # | Tính năng | Mô tả | Status | Priority | Sprint (tuần) | Owner |
|---|---|---|---|---|---|---|
| G1 | Farm dashboard — tổng quan trang trại | Tổng số cây/vật nuôi đăng ký; % có DID; cảnh báo PHI đang hiệu lực; sự kiện gần đây | `not_started` | `critical` | 3 | Thư |
| G2 | Herd health summary | Thống kê sức khỏe đàn: % đã tiêm phòng / % đang điều trị / % gần xuất chuồng; trend 30 ngày | `not_started` | `high` | 4 | Lành/Thư |
| G3 | Anomaly detection — drift cá thể | Khi embedding drift vượt ngưỡng bất thường (cây bệnh nặng, vật nuôi sụt cân nhanh) → alert nông dân kiểm tra | `partial` | `high` | 4 | Lợi |
| G4 | Cross-farm outbreak radar | Map tương tác hiển thị trang trại xung quanh có báo cáo dịch; heat map mức độ nguy cơ theo bán kính; cập nhật real-time | `not_started` | `critical` | 3 | Lợi/TigerAgent |
| G5 | Inventory reconciliation | So sánh số đàn thực tế với sổ sách nông dân; phát hiện mất trộm / chết không báo. **[Audit: nâng từ `high` Sprint 5 lên `critical` Sprint 3 — trộm gia súc thiệt hại ước 2.000-3.000 tỷ/năm (Bộ NN 2023); pain point số 1 chủ trang trại lớn. Lưu ý: đối với gà công nghiệp, dùng zone headcount (G10) thay vì ReID từng con]** | `not_started` | `critical` | 3 | Lợi/Thư |
| G6 | Seasonal baseline analytics | Phân tích sự biến thiên tự nhiên theo mùa để điều chỉnh ngưỡng anomaly; tránh báo động mùa thay lá/thay lông | `not_started` | `medium` | 6 | Lợi |
| G7 | Multi-farm portfolio view | Nông dân có >1 trang trại; dashboard tổng hợp; phân quyền xem theo từng nhân viên | `not_started` | `medium` | 7 | Thư/Tùng |
| G8 | Daily mortality log per zone | Ghi số con chết hàng ngày theo khu/ô chuồng (zone_id); input đơn giản — 1 tap + nhập số; tự tính mortality rate; cảnh báo khi >0.5%/ngày (ngưỡng dịch theo quy định thú y). **[Audit mới — workflow hàng ngày 5:30 sáng của nông dân gà công nghiệp; critical cho gia cầm số lượng lớn]** | `not_started` | `critical` | 3 | Lành/Thư |
| G9 | Zone/pen management | Tạo và quản lý zone trong chuồng (A, B, C, D...); gắn sự kiện chăm sóc vào zone_id thay vì AnimalDID; chuyển đàn giữa zone; mỗi zone có headcount hiện tại. **[Audit mới — paradigm đúng cho gia cầm/thủy sản số lượng lớn; thiết kế song song với individual tracking, không thay thế]** | `not_started` | `critical` | 3 | Thư/Lợi |
| G10 | AI headcount — camera đếm đàn | Camera cố định hoặc điện thoại quét qua chuồng → AI đếm số lượng đàn; so sánh với ghi sổ; phát hiện sai lệch bất thường. **[Audit mới — phục vụ G5 cho gia cầm; không dùng ReID cá thể cho gà công nghiệp]** | `not_started` | `high` | 5 | Lợi |
| G11 | Statistical sampling flow | Chọn ngẫu nhiên N con (sample) → cân/đo/ghi → suy ra FCR, ADG toàn đàn; xuất báo cáo thú y chuẩn kiểm dịch nhà nước. **[Audit mới — phương pháp kiểm dịch chuẩn; phục vụ E6 và báo cáo cơ quan quản lý]** | `not_started` | `high` | 6 | Lành/Lợi |

**Narrative G**: Toàn bộ trục G chưa bắt đầu trên mobile UI (G3 có backend partial). G1 là màn dashboard cơ bản — thiếu nó app trông như "tập hợp tính năng rời rạc" thay vì sản phẩm. G4 (outbreak radar) sử dụng neighbor_graph đã có (A9) — chi phí thấp nhưng tác động cao. G5 nâng lên `critical` Sprint 3. G8 và G9 thêm mới để phục vụ paradigm gia cầm công nghiệp — đây là gap lớn nhất của spec gốc so với workflow thực tế.

---

## H. Trải nghiệm người dùng (UX)

> Phạm vi: luồng người dùng, onboarding, offline, accessibility.

| # | Tính năng | Mô tả | Status | Priority | Sprint (tuần) | Owner |
|---|---|---|---|---|---|---|
| H1 | Onboarding wizard — nông dân mới | Dẫn tay từ tạo tài khoản (PhoenixKey biometric) → đăng ký trang trại → đăng ký cây/vật nuôi đầu tiên; ≤5 màn | `partial` | `critical` | 2 | Thư |
| H2 | Offline-first capture | Chụp + ghi sự kiện khi không có mạng; queue local → sync khi có mạng; không mất dữ liệu; storage queue đã có `storageQueue.ts` | `partial` | `critical` | 2 | Thư |
| H3 | Smart capture screen | Hướng dẫn góc chụp real-time (overlay guide); phát hiện khi ảnh mờ/tối; tự động retry; progress bar multi-round | `partial` | `critical` | 2 | Thư |
| H4 | Push notifications | Nhắc PHI sắp hết / lịch tiêm / cảnh báo dịch / kết quả identify; phân loại mức độ (khẩn / thông thường) | `not_started` | `high` | 3 | Thư |
| H5 | Multilingual — tiếng dân tộc | Tiếng Kinh làm gốc; chuẩn bị i18n framework; ưu tiên Ê Đê / Tày / Thái cho vùng Tây Nguyên / Tây Bắc. **[Audit: nâng từ `medium` Sprint 8 lên `high` Sprint 5 — Tây Nguyên chiếm 60% kim ngạch xuất khẩu nông sản cao cấp; retrofit i18n sau khi ra mắt tốn kém gấp 3-4 lần]** | `not_started` | `high` | 5 | Lành |
| H6 | Low-bandwidth mode | Nén ảnh xuống ≤300KB trước upload; hiển thị ảnh thumbnail WebP; retry tự động với backoff | `partial` | `critical` | 1 | Thư |
| H7 | Accessibility — người ít học | Hướng dẫn bằng hình ảnh/audio thay text; icon rõ ràng; font size lớn mặc định; không jargon kỹ thuật trong UI | `not_started` | `high` | 5 | Thư/Lành |

**Narrative H**: H2 (offline-first) đã có `storageQueue.ts` nhưng chưa đầy đủ test + sync logic. H6 (low-bandwidth) là điều kiện tiên quyết vì phần lớn nông dân dùng 3G/4G chậm ở vùng sâu. H5 nâng lên `high` Sprint 5 vì Tây Nguyên là thị trường xuất khẩu cao cấp, người Ê Đê/K'Ho chiếm tỷ lệ lớn. H7 (accessibility) thường bị bỏ qua nhưng là yếu tố quyết định adoption ở nông thôn VN.

---

## I. Tích hợp bên ngoài (Integration)

> Phạm vi: kết nối với hệ thống bên ngoài OriLife — nhà nước, logistics, thị trường.

| # | Tính năng | Mô tả | Status | Priority | Sprint (tuần) | Owner |
|---|---|---|---|---|---|---|
| I1 | LampNet storage integration | `lampnet.py` đẩy ảnh/data lên Cave/Carpet; nhận CID; gắn vào provenance; KHÔNG dùng IPFS public | `working` | `critical` | — | Hệ thống |
| I2 | Blockfrost / Cardano submit | Submit tx đã ký qua Blockfrost Preview API; đang hoạt động cho cây; cần extend sang animal + fruit | `working` | `critical` | — | Hệ thống |
| I3 | PhoenixKey DID API bridge | `bridge.ts` + `phoenixKey-api.ts` gọi PhoenixKey backend để mint DID; cần idempotent register + pubkey→DID endpoint | `partial` | `critical` | 2 | Tùng |
| I4 | Cold chain sensor integration | Nhận dữ liệu nhiệt độ từ sensor IoT (≤ble hoặc NFC) gắn hộp vận chuyển; ghi vào lot_id provenance; alert khi vượt ngưỡng nhiệt | `not_started` | `medium` | 8 | Lợi |
| I5 | Market price API feed | Kết nối AgroViet / VietGAP price API; crawl giá thị trường tỉnh theo loài/loại quả; cache 4 giờ | `not_started` | `medium` | 6 | TigerAgent |
| I6 | Government registry sync | Đồng bộ với cơ sở dữ liệu Kiểm dịch Bộ NN (khi API mở); tự động xác nhận giấy chứng nhận OriLife. **[Audit: nâng từ `low` Sprint 10 lên `medium` Sprint 6 — Thông tư 38/2018/TT-BNNPTNT yêu cầu mã số cơ sở nuôi được cơ quan nhà nước xác nhận; điều kiện pháp lý xuất khẩu chính ngạch]** | `not_started` | `medium` | 6 | Tùng |
| I7 | Supermarket traceability portal | Dashboard cho siêu thị / nhà nhập khẩu tra cứu lot; export CSV/PDF chuẩn GS1; không cần tài khoản OriLife | `not_started` | `medium` | 7 | Tùng/Thư |
| I8 | ERP / farm management sync | Webhook push sự kiện sang Agribank FarmerConnect / VinEco ERP khi nông dân chọn kết nối | `not_started` | `low` | 10 | Tùng |

**Narrative I**: I1 và I2 là working — đây là lợi thế cạnh tranh (không cần internet để ghi, sync khi có). I4 (Cold chain) mở cơ hội xuất khẩu tươi (sầu riêng, xoài) — hiện không có đối thủ nào tại VN làm điều này. I6 nâng lên `medium` Sprint 6 vì đây là điều kiện pháp lý xuất khẩu, không phải nice-to-have. I7 (Supermarket portal) tạo pull-demand: siêu thị yêu cầu nhà cung cấp dùng OriLife → nông dân tự tìm đến. I8 (ERP sync) defer — Agribank FarmerConnect và VinEco ERP chưa có API chuẩn công khai.

---

## J. Phân tích & Dự báo (Analytics)

> Phạm vi: biến dữ liệu thô thành thông tin hành động được — cho nông dân và hệ sinh thái.

| # | Tính năng | Mô tả | Status | Priority | Sprint (tuần) | Owner |
|---|---|---|---|---|---|---|
| J1 | ReID confidence analytics | Theo dõi tỉ lệ MATCH/UNCERTAIN/NO_MATCH theo thời gian; phát hiện loài có độ chính xác thấp cần thêm data | `partial` | `high` | 3 | Lợi/TigerAgent |
| J2 | Gallery quality audit | `gallery_audit` quét gallery phát hiện ảnh chất lượng thấp / embedding drift bất thường; đề xuất re-enroll | `partial` | `high` | 3 | Lợi |
| J3 | Harvest yield prediction | Dự báo sản lượng thu hoạch: nông dân nhập ước tính + hệ thống học từ lịch sử → dự báo ±15%. **[Audit: hạ từ `medium` Sprint 8 xuống `low` post-v1 — không phụ thuộc fruit3D scan nữa; phương pháp manual input đơn giản hơn đủ dùng cho v1]** | `not_started` | `low` | post-v1 | Lợi/TigerAgent |
| J4 | Disease risk forecast | Dựa trên thời tiết + lịch sử dịch vùng + care events → tính xác suất bùng dịch trong 14 ngày tới | `not_started` | `high` | 7 | TigerAgent/Lợi |
| J5 | Feed efficiency analysis | Correlation giữa khẩu phần ăn (B6) và tăng trưởng; đề xuất tối ưu khẩu phần để giảm chi phí; tính FCR cuối tuần từ G8 | `not_started` | `medium` | 9 | TigerAgent |
| J6 | Carbon / sustainability metrics | Tính carbon footprint per kg sản phẩm dựa trên feed, thuốc, vận chuyển; chuẩn bị cho EU carbon border tax | `not_started` | `low` | 11 | Lành/TigerAgent |
| J7 | Platform-wide anomaly detection | Phát hiện bất thường trên toàn hệ (nhiều enroll cùng GPS → gian lận; embedding cluster bất thường) | `not_started` | `high` | 6 | Lợi/Hệ thống |

**Narrative J**: J1 và J2 partial — cần để đo chất lượng gallery đang có trên Tiger trước field test đợt 2. J3 hạ xuống `low` post-v1, không dùng fruit3D nữa — phương pháp đơn giản hơn đủ dùng. J4 (Disease risk forecast) là "killer feature" phân tầng cao nhất nhưng cần data lịch sử ≥6 tháng để train. J5 liên kết với G8 (daily mortality + FCR tracking). J6 (Carbon metrics) là tầm nhìn dài hạn nhưng là vé vào thị trường EU tương lai.

---

## K. Quản lý vật tư đầu vào (Input Management)

> **[Module mới — audit bổ sung]**
> Phạm vi: quản lý kho vật tư (thuốc BVTV, phân bón, vaccine, con giống) tại trang trại. Nông dân VN chi 40-60% chi phí sản xuất cho vật tư — đây là trục dữ liệu quan trọng nhất về chi phí. Kết nối với C2 (care event trừ tồn kho) và E8 (VietGAP compliance).

| # | Tính năng | Mô tả | Status | Priority | Sprint (tuần) | Owner |
|---|---|---|---|---|---|---|
| K1 | Input inventory — kho vật tư | Theo dõi tồn kho thuốc BVTV, phân bón, vaccine tại trang trại. Khi ghi care event (C2), trừ tồn kho tự động. Cảnh báo khi sắp hết trước mùa vụ. Phân loại theo: thuốc/phân/vaccine/con giống | `not_started` | `critical` | 3 | Lành/Thư |
| K2 | Purchase receipt — hóa đơn vật tư | Chụp hóa đơn mua thuốc/phân → OCR → ghi nguồn gốc vật tư vào provenance chain. Yêu cầu bắt buộc VietGAP mục 5.2 (lưu hóa đơn 2 năm) và GlobalGAP AF 7.1. Liên kết với K1 để cập nhật nhập kho | `not_started` | `high` | 4 | Lành/TigerAgent |
| K3 | Supplier registry — nhà cung cấp vật tư | Lưu thông tin nhà phân phối thuốc/phân bón gắn vào mỗi lô vật tư. Khi phát hiện thuốc giả/kém chất lượng trên thị trường, có thể truy ngược đến lô mua và nông dân liên quan | `not_started` | `high` | 5 | Lành |

**Narrative K**: Module K là "mặt sau" của module C — C2 ghi việc dùng thuốc, K1 theo dõi tồn kho còn bao nhiêu. Không có K thì C2 chỉ là ghi log một chiều, không giúp nông dân quản lý chi phí. K2 là điều kiện bắt buộc để E8 (VietGAP checklist) có audit trail thực sự — checklist tự đánh giá không đủ nếu không có chứng từ mua vật tư.

---

## L. Quản lý lao động & lô đất (Labor & Land)

> **[Module mới — audit bổ sung]**
> Phạm vi: nhật ký đồng ruộng hàng ngày, quản lý thửa đất, phân công lao động. Đây là dữ liệu nền tảng VietGAP yêu cầu lưu 2 năm — hiện hoàn toàn chưa có trong OriLife.

| # | Tính năng | Mô tả | Status | Priority | Sprint (tuần) | Owner |
|---|---|---|---|---|---|---|
| L1 | Field diary — nhật ký đồng ruộng | Ghi công việc hàng ngày theo lô/ô (không phải theo cá thể): ngày tháng, loại công việc, số công lao động, thời tiết, bất thường. VietGAP bắt buộc lưu nhật ký 2 năm. Ví dụ: "Ngày 10/6: phun thuốc Ô 3A, 2 công lao động, thời tiết 32°C". Đây là workflow nông dân làm HÀNG NGÀY — app cần nhanh hơn ghi sổ tay | `not_started` | `critical` | 2 | Lành/Thư |
| L2 | Plot/parcel management — quản lý lô thửa | Vẽ ranh giới thửa đất bằng GPS trace khi đi bộ quanh bờ; tính diện tích tự động; gắn cây/vật nuôi/zone vào thửa; lưu thửa_id. Yêu cầu EU Regulation 2019/1793 (truy xuất đến parcel level) — E7 không đầy đủ nếu không có L2 | `not_started` | `high` | 4 | Thư/Lợi |
| L3 | Labor assignment — phân công lao động | Trang trại ≥3 nhân công: tạo task hôm nay → phân công cho lao động → lao động nhận task trên app → xác nhận hoàn thành. Checklist đơn giản, không cần workflow phức tạp | `not_started` | `medium` | 7 | Thư |

**Narrative L**: L1 (field diary) là tính năng bị thiếu nghiêm trọng nhất — đây là thứ nông dân làm MỖI NGÀY nhưng app hiện tại không có chỗ ghi. Nếu OriLife không nhanh hơn/tiện hơn sổ tay giấy cho tác vụ này thì nông dân không có lý do dùng app hàng ngày. L2 là nền cho E7 (export EU) vì EU yêu cầu truy xuất đến parcel level. L3 cho trang trại có nhân công — không cần phức tạp ở v1.

---

## M. Tài chính trang trại (Farm Finance)

> **[Module mới — audit bổ sung]**
> Phạm vi: theo dõi chi phí sản xuất và dự báo dòng tiền theo cá thể/lô/mùa vụ. Đây là tính năng giữ chân nông dân mạnh nhất sau adoption ban đầu — nông dân biết rõ "con bò này tôi đầu tư bao nhiêu" thì không bỏ app.

| # | Tính năng | Mô tả | Status | Priority | Sprint (tuần) | Owner |
|---|---|---|---|---|---|---|
| M1 | Production cost per entity | Tổng chi phí từ đăng ký đến xuất bán: vật tư (K1) + lao động (L1) + phí OriLife (F1/F2). Hiện trên profile mỗi cá thể/cây: "Đã đầu tư: X triệu — Cần bán ≥ Y triệu để có lãi". Nông dân quyết định bán giá nào dựa trên con số thực | `not_started` | `high` | 5 | Lành/Thư |
| M2 | Cash flow forecast per season | Dựa trên lịch thu hoạch dự kiến + giá thị trường (D6/I5) → ước tính thu nhập tháng tới. Giúp nông dân quyết định vay vốn hay không. Kết nối với Agribank FarmerConnect (I8) khi có | `not_started` | `medium` | 8 | TigerAgent/Lành |

**Narrative M**: M1 là tính năng retention mạnh nhất sau adoption — nông dân đã dùng app để ghi vật tư (K1) và chăm sóc (C2) thì tự nhiên muốn xem đã đầu tư bao nhiêu. Chi phí implement thấp vì chỉ tổng hợp dữ liệu đã có. M2 (cash flow forecast) cần D6/I5 làm nền, xếp Sprint 8.

---

## Population Monitoring Paradigm

> **[Section mới — audit bổ sung]**
> Phân định rõ 3 paradigm theo dõi quần thể để tránh thiết kế sai cho từng loài.

### Tại sao cần phân biệt paradigm

MECE phiên bản gốc thiết kế theo mô hình **individual tracking** (AnimalDID cho từng con). Đây là paradigm đúng cho bò, heo, dê — loài có giá trị cao, số lượng ít. Nhưng khi áp dụng cho gà công nghiệp 10.000 con thì sai hoàn toàn: không ai có thể enroll 10.000 ảnh, và gà công nghiệp trông gần giống nhau nên ReID cá thể không khả thi.

### Ba paradigm song song trong OriLife

**Paradigm 1 — Individual tracking** (AnimalDID cho từng con)
- Áp dụng: bò, heo thịt, heo nái, dê, chó giống, gà thả vườn đặc sản
- Số lượng phù hợp: ≤500 con/trang trại
- Cơ chế: mỗi con có AnimalDID; mọi sự kiện gắn vào AnimalDID; ReID visual xác minh danh tính
- Module chính: A4, A5, B2, C4, C5, G3

**Paradigm 2 — Zone-based tracking** (quản lý theo ô chuồng)
- Áp dụng: gà công nghiệp, vịt, cá tra trong ao, tôm ao
- Số lượng phù hợp: >500 con/trang trại
- Cơ chế: chuồng chia zone (zone_id); sự kiện gắn vào zone ("Zone B tiêm Newcastle ngày 10/6, 2.500 con"); nhận diện bằng AI đếm đầu (headcount), không nhận diện cá thể
- Module chính: G8, G9, G10, G11; C4 gắn vào zone_id thay vì AnimalDID

**Paradigm 3 — Statistical sampling** (lấy mẫu định kỳ)
- Áp dụng: kiểm dịch định kỳ, báo cáo xuất khẩu, chứng nhận thú y
- Cơ chế: chọn ngẫu nhiên N con → cân/đo/kiểm tra sức khỏe → suy ra tình trạng cả đàn; đây là phương pháp kiểm dịch chuẩn của thú y nhà nước
- Module chính: G11, E6

### Ranh giới thiết kế

| Đặc điểm | Paradigm 1 | Paradigm 2 | Paradigm 3 |
|---|---|---|---|
| Đơn vị dữ liệu | AnimalDID | zone_id | sample_batch_id |
| Sự kiện chăm sóc | gắn AnimalDID | gắn zone_id | gắn sample_batch_id |
| Kiểm đếm | ReID visual | AI headcount (G10) | Đếm mẫu N con |
| Phát hiện trộm | ReID không khớp | headcount lệch sổ sách | Không áp dụng |
| Phù hợp cho | Bò, heo, dê | Gà, vịt, cá | Kiểm dịch, xuất khẩu |

### Lưu ý cho team phát triển

- G5 (inventory reconciliation): với Paradigm 1 dùng ReID match; với Paradigm 2 dùng G10 headcount — KHÔNG dùng ReID cho gà công nghiệp
- C4 (vaccination schedule): cần field `target_type` = "animal_did" | "zone_id" để phân biệt
- G8 (daily mortality log): chỉ áp dụng Paradigm 2 — Paradigm 1 dùng B2 (lifecycle event "chết")
- Khi nông dân đăng ký trang trại, bước onboarding hỏi: "loài nuôi + số lượng" → tự động đề xuất paradigm phù hợp

---

## VietGAP & Export Compliance

> **[Section mới — audit bổ sung]**
> Mapping yêu cầu pháp lý vào tính năng OriLife — để biết tính năng nào là pháp lý bắt buộc, không phải nice-to-have.

### VietGAP — 6 yêu cầu chính và trạng thái coverage

| Yêu cầu VietGAP | Điều khoản | Tính năng OriLife | Trạng thái |
|---|---|---|---|
| Nhật ký đồng ruộng lưu 2 năm | VietGAP Chương 4 | L1 (Field diary) | `not_started` — **gap nghiêm trọng** |
| Lưu hóa đơn vật tư 2 năm | VietGAP mục 5.2 | K2 (Purchase receipt) | `not_started` — gap |
| Nguồn gốc giống và vật tư | VietGAP mục 4.1 | K3 (Supplier registry) | `not_started` — gap |
| Kiểm tra nguồn nước tưới định kỳ | VietGAP mục 6.1 | C9 (Water quality testing) | `not_started` — gap |
| Tập huấn GAP cho nhân công | VietGAP mục 9.1 | Chưa có module — cần L3 mở rộng hoặc module riêng | gap |
| Thời gian cách ly sau thuốc | VietGAP mục 7.3 | C3 (PHI alert) | `coded_bugs` — cần fix Sprint 1 |

**Kết luận**: E8 (VietGAP checklist) chỉ có thể tạo audit trail thực sự khi K1, K2, L1, C9 đã hoạt động. Nếu chỉ có E8 standalone thì chỉ là "checklist tự khai" — không đủ để cấp chứng nhận VietGAP.

### Kiểm dịch thực vật xuất khẩu EU (Regulation EU 2019/1793)

| Yêu cầu EU | Tính năng OriLife | Trạng thái |
|---|---|---|
| Truy xuất đến parcel (thửa đất) level | L2 (Plot management) | `not_started` — gap; A11 lot_id chưa map xuống thửa |
| MRL (dư lượng thuốc) test result gắn vào lô hàng | E9 (MRL test result logging) | `not_started` — gap mới bổ sung |
| Mã số cơ sở nuôi xác nhận bởi cơ quan nhà nước | I6 (Government registry sync) | `not_started` — nâng lên `medium` Sprint 6 |
| Lịch sử chăm sóc đầy đủ ≥2 năm | B1/B2 + L1 + K2 | B1/B2 `partial`; L1/K2 chưa có |

### Thông tư 38/2018/TT-BNNPTNT (truy xuất nguồn gốc thủy sản + gia súc)

Yêu cầu mã số cơ sở nuôi được xác nhận bởi cơ quan nhà nước → điều kiện pháp lý để xuất khẩu chính ngạch. I6 (Government registry sync) nâng từ `low` Sprint 10 lên `medium` Sprint 6.

### Thông tư 07/2016/TT-BNNPTNT (kiểm dịch động vật)

Giấy kiểm dịch bắt buộc khi xuất chuồng → E6 (Quarantine certificate) + C4 (Vaccination schedule với lịch tiêm đầy đủ). C4 nâng lên `critical` Sprint 2.

---

## MECE Gap Analysis

### Tính năng quan trọng đã bổ sung vào bản đồ (so với danh sách gốc)

| Gap ban đầu | Đã vào category | Tính năng |
|---|---|---|
| Batch/lot tracking | A11 | Nhiều quả thu hoạch → lot_id, không mất chain |
| Cold chain | I4 | Sensor IoT nhiệt độ vận chuyển |
| Consumer QR verification | E5 | Người tiêu dùng quét bao bì |
| Cross-farm outbreak alert | C6 + G4 | Cảnh báo dịch bệnh lân cận (2 lớp: per-farm và map) |
| Feed/nutrition logging | B6 | Khẩu phần ăn hàng ngày |
| Breeding record | A12 | Pedigree bố/mẹ → con |
| Seasonal baseline | B9 + G6 | Baseline mùa vụ để anomaly detection đúng |
| Market price integration | D6 + I5 | Giá thị trường realtime |
| Export compliance EU/US | E7 | Package kiểm tra + tạo document |
| Water/irrigation management | C8 | Lịch tưới + cảnh báo thiếu nước |

### Gap bổ sung từ audit lần 2 (2026-06-10)

| # | Gap | Category | Lý do |
|---|---|---|---|
| K1 | Input inventory — kho vật tư | K mới | Chi phí lớn nhất nông dân; VietGAP bắt buộc; C2 cần K1 để trừ tồn kho |
| K2 | Purchase receipt — hóa đơn vật tư | K mới | VietGAP mục 5.2 + GlobalGAP AF 7.1 bắt buộc lưu 2 năm |
| K3 | Supplier registry | K mới | Truy nguồn gốc khi phát hiện thuốc giả |
| L1 | Field diary — nhật ký đồng ruộng | L mới | VietGAP bắt buộc; workflow hàng ngày; gap lớn nhất về UX |
| L2 | Plot/parcel management | L mới | EU 2019/1793 yêu cầu truy xuất đến parcel level |
| L3 | Labor assignment | L mới | Trang trại ≥3 nhân công |
| M1 | Production cost per entity | M mới | Tính năng retention mạnh nhất sau adoption |
| M2 | Cash flow forecast | M mới | Hỗ trợ quyết định vay vốn |
| G8 | Daily mortality log per zone | G | Workflow hàng ngày gà/vịt công nghiệp |
| G9 | Zone/pen management | G | Paradigm đúng cho gia cầm số lượng lớn |
| G10 | AI headcount | G | Phát hiện trộm/chết không báo cho gà |
| G11 | Statistical sampling flow | G | Tiêu chuẩn kiểm dịch thú y nhà nước |
| E9 | MRL test result logging | E | Điều kiện EU bắt buộc cho sầu riêng/xoài xuất khẩu |
| C9 | Water quality testing record | C | VietGAP mục 6.1 — kiểm tra nguồn nước tưới |

### Điều chỉnh priority từ audit

**Nâng priority:**

| Tính năng | Priority gốc | Priority mới | Lý do |
|---|---|---|---|
| B6 Feed logging | `high` Sprint 5 | `critical` Sprint 2 | 65-70% giá thành gà; blocking xuất khẩu |
| C4 Vaccination schedule | `high` Sprint 4 | `critical` Sprint 2 | Pháp lý bắt buộc TT07/2016; rủi ro mất đàn |
| E8 VietGAP checklist | `medium` Sprint 7 | `high` Sprint 4 | Cửa vào siêu thị nội địa (Co.opmart, Winmart) |
| G5 Inventory reconciliation | `high` Sprint 5 | `critical` Sprint 3 | Trộm gia súc 2.000-3.000 tỷ/năm |
| H5 Multilingual | `medium` Sprint 8 | `high` Sprint 5 | Tây Nguyên = 60% xuất khẩu cao cấp |
| I6 Government registry sync | `low` Sprint 10 | `medium` Sprint 6 | Điều kiện pháp lý xuất khẩu chính ngạch |

**Hạ priority:**

| Tính năng | Priority gốc | Priority mới | Lý do |
|---|---|---|---|
| A8 Fruit 3D detection | `high` Sprint 3 | `low` post-v1 | Compute nặng; chậm trên 3G; giá trị thực tế thấp v1 |
| J3 Yield prediction | `medium` Sprint 8 | `low` post-v1 | Phụ thuộc A8; thay bằng manual input đơn giản hơn |
| D5 Nutrient deficiency | `medium` Sprint 7 | `medium` Sprint 9 | Cần ≥500 mẫu calibrate; độ chính xác thấp nắng gắt VN |
| A12 Breeding record | `medium` Sprint 5 | `medium` Sprint 8 | Sau khi Animal ReID stable |

### Kiểm tra MECE — chồng lấn cần chú ý

| Cặp tính năng | Ranh giới rõ |
|---|---|
| C2 (care event) vs B1/B2 (lifecycle events) | C2 = sự kiện CHO THUỐC/PHÂN (có sản phẩm cụ thể); B1/B2 = sự kiện vòng đời rộng hơn (thu hoạch, xuất chuồng) |
| A10 (animal drift) vs G3 (anomaly detection) | A10 = drift embedding kỹ thuật (ReID); G3 = anomaly về mặt sức khỏe/hành vi (cho nông dân thấy) |
| C6 (outbreak alert per-farm) vs G4 (outbreak radar map) | C6 = push notification đến nông dân bị ảnh hưởng; G4 = map tổng quan toàn vùng cho tất cả |
| E7 (export compliance) vs C3 (PHI alert) | C3 = cảnh báo realtime khi đang dùng thuốc; E7 = đóng gói hồ sơ xuất khẩu hoàn chỉnh |
| K1 (kho vật tư) vs C2 (care event) | K1 = tồn kho còn bao nhiêu; C2 = sự kiện dùng bao nhiêu → C2 gọi K1 để trừ tồn kho |
| L1 (field diary) vs B1/B2 (lifecycle event) | L1 = nhật ký theo lô/ngày (không gắn cá thể); B1/B2 = sự kiện gắn vào cá thể cụ thể |
| G8 (mortality log per zone) vs B2 (lifecycle chết) | G8 = Paradigm 2 (gà công nghiệp, ghi số chết theo zone); B2 = Paradigm 1 (bò/heo, ghi sự kiện chết từng con) |

---

## Tổng hợp theo Status

| Status | Số tính năng | Danh sách key |
|---|---|---|
| `working` | 6 | A1, A2, A3, A9, A10, E1, I1, I2 |
| `partial` | 16 | A4, A5, A6, A7, A8, B1, B2, C1, C2, D1, D2, E2, E3, F1, F2, F5, G3, H1, H2, H3, H6, I3, J1, J2 |
| `coded_bugs` | 2 | B5, C3 |
| `spec_exists` | 2 | B3, B4 |
| `not_started` | 42 | Còn lại (tăng từ 28 do bổ sung 14 tính năng mới) |

---

## Roadmap 3 Sprint Ưu Tiên Cao Nhất

### Sprint 1 (2 tuần) — Ổn định lõi + unblock launch

**Mục tiêu**: Sửa bugs critical, hàn gắn kết nối fee + DID, unblock field test.

| Tính năng | Việc cụ thể | Owner |
|---|---|---|
| B5 — soft-delete cây/vật nuôi | Fix bugs GAP-1 audit trail đã xác nhận | Lợi |
| C3 — PHI withdrawal alert | Fix logic tính ngày; test edge case PHI=0 / PHI_UNKNOWN | Lành |
| C1 + C2 — Care KB + care event | Merge pending branch; test 8,104 loài; wiring OCR D1 | Lành/TigerAgent |
| H6 — low-bandwidth mode | Compress ảnh ≤300KB trước upload; WebP thumbnail | Thư |
| F1 + F2 — wire fee engine | Gọi feeEngine trước enroll/identify; trả estimated_fee về mobile | Tùng |

**Definition of Done Sprint 1**: PHI alert đỏ khi tồn dư > 0 ngày; fee estimate hiện trước mỗi tác vụ; Care KB query trả đúng PHI cho ≥50 sản phẩm test.

---

### Sprint 2 (2 tuần) — Animal ReID + DID + Daily workflow foundation

**Mục tiêu**: Animal ReID chạy end-to-end; bắt đầu daily workflow (feed log, vaccination, field diary).

| Tính năng | Việc cụ thể | Owner |
|---|---|---|
| A4 + A5 + A6 — Animal ReID mobile | Wiring AnimalReIDService → backend; enroll flow 3 ảnh; fee confirm dialog | Thư/Lợi |
| E2 — on-chain anchor vật nuôi | Extend anchor_worker cho AnimalDID entity_type | Tùng |
| E3 / I3 — PhoenixKey DID | Fix idempotent register; thêm pubkey→DID endpoint; test bridge.ts | Tùng |
| F3 — fee display mobile | Component FeeEstimateCard; hiện trước mỗi tác vụ | Thư |
| H1 — onboarding wizard | 5 màn: biometric → farm → loài/số lượng → paradigm phù hợp → đăng ký cá thể đầu tiên | Thư |
| G1 — farm dashboard | Màn tổng quan: số cây/vật nuôi, PHI đang hiệu lực, sự kiện hôm nay | Thư |
| B6 — feed logging | Ghi khẩu phần ăn hàng ngày; liên kết K1 tồn kho | Lành |
| C4 — vaccination schedule | Lịch tiêm theo loài; push notification 3 ngày trước; ghi kết quả | Lành |
| L1 — field diary | Màn ghi nhật ký đồng ruộng hàng ngày; input nhanh ≤30 giây | Lành/Thư |

**Definition of Done Sprint 2**: Nông dân enroll bò end-to-end + ghi feed log hôm nay + ghi nhật ký đồng ruộng — tất cả trong 1 buổi sáng không bị chặn.

---

### Sprint 3 (2 tuần) — Quần thể + Zone + Consumer verification

**Mục tiêu**: Zone-based tracking cho gia cầm; inventory reconciliation; consumer QR.

| Tính năng | Việc cụ thể | Owner |
|---|---|---|
| G9 — zone/pen management | Tạo zone trong chuồng; gắn sự kiện vào zone_id | Thư/Lợi |
| G8 — daily mortality log | Màn ghi số chết per zone; tính mortality rate; cảnh báo >0.5%/ngày | Lành/Thư |
| G5 — inventory reconciliation | So sánh headcount thực vs sổ sách; dùng G10 cho gia cầm, ReID cho bò | Lợi/Thư |
| C6 — cross-farm outbreak alert | Dùng neighbor_graph; push notification bán kính 10km; threshold 3 báo cáo | Lợi/TigerAgent |
| G4 — outbreak radar map | Map React Native + cluster marker; data từ C6 | Lợi/Thư |
| E5 — consumer QR | Trang web tĩnh quét QR lot → hiện lịch sử; verify tx Cardano onchain | Tùng/Thư |
| A11 — batch/lot tracking | Khi harvest: gom lot_id; QR lot; link lot → L2 thửa đất | Tùng |
| K1 — input inventory | Màn quản lý kho vật tư; tự trừ khi ghi C2 | Lành/Thư |
| F4 — LAMP wallet | Kiểm tra số dư; hiện lịch sử transaction; top-up deeplink | Thư/Tùng |

**Definition of Done Sprint 3**: Người tiêu dùng quét QR trên 1 hộp sầu riêng và thấy cây + trang trại + care events. Chủ trang trại gà 1.000 con đăng ký zone, ghi mortality sáng, nhận cảnh báo khi mortality >0.5%.

---

## Tổng số tính năng: 93

| Category | Số tính năng | Thay đổi so với v1 |
|---|---|---|
| A — Identity | 12 | — |
| B — Lifecycle | 9 | — |
| C — Health | 9 | +1 (C9) |
| D — Knowledge | 7 | — |
| E — Certification | 9 | +1 (E9) |
| F — Economics | 7 | — |
| G — Population | 11 | +4 (G8, G9, G10, G11) |
| H — UX | 7 | — |
| I — Integration | 8 | — |
| J — Analytics | 7 | — |
| K — Input Management | 3 | **Module mới** |
| L — Labor & Land | 3 | **Module mới** |
| M — Farm Finance | 2 | **Module mới** |
| **Tổng** | **93** | **+14 tính năng, +3 module** |

---

*Cập nhật lần tiếp: sau Sprint 1 kết thúc — cập nhật status working/partial/coded_bugs theo kết quả thực tế.*
*Audit lần 2: 2026-06-10 — bổ sung module K/L/M, G8-G11, E9, C9; điều chỉnh priority theo domain expert nông nghiệp VN; thêm section Population Paradigm và VietGAP/Export Compliance.*
