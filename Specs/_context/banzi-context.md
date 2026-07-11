# Context cho Banzi — Platform Feat-Spec (Aladin SuperApp Platform)

> Orchestrator điền. Banzi đọc file này + Master + standard + HARD-RULES rồi viết Feat-Spec.

## Định vị
- Dự án: **Aladin SuperApp Platform** — L1 Infrastructure/Platform (StandardSpec).
- KHÔNG phải app đơn. Là nền tảng sản xuất nhiều super-app instance (Aladin, TonFarm…) từ kho module + lớp dữ liệu chung.
- Mục tiêu hệ sinh thái: làm **LAMP có giá trị** + mở **SDK cho mọi team Cardano** cắm module. Mọi mục Feat phải dẫn về đó.

## 3 câu critical (đã chốt với anh 2026-06-16)
1. Scope = **L1 Platform** (Master + Spec Group), không phải L2.
2. Phạm vi = **vỏ + SDK + đặc tả tích hợp từng feature** (Work/Chat/Trace/Join/Farm). Inherit nghiệp vụ upstream, đặc tả phần tích hợp.
3. Đối tượng Phase 1 = **cả hai cực ngang nhau** (nông dân/máy yếu/offline VÀ đô thị/máy mạnh), adaptive từ đầu.

## Đọc bắt buộc trước khi viết
- `Specs/PLATFORM-MASTER.md` — xương sống: 2 bất biến (INV-1 nhất quán dữ liệu, INV-2 tách data⟂experience), 2 kiểu tích hợp (ngầm/feature), brand-strip, 8 Spec Group MECE.
- `StandardSpec/_shared/standards/Feat-Spec.standard.md` — cấu trúc Feat-Spec.
- `StandardSpec/_shared/HARD-RULES.md` — 11 rules (đặc biệt: no fabrication URL/timeline/scale; reasoning chain; lane discipline; fresh data).
- `StandardSpec/_shared/_history/project-patterns.md` — pattern VN agritech (target user, regulatory VN-first NĐ-13/TT-11).
- `StandardSpec/agents/banzi/{1-prompt,4-output-spec}.md` — vai + format output của em.

## Hiện trạng module (đã verify 2026-06-16) — dùng cho §scale/§features, KHÔNG bịa
- Work ← AladinWork: Feat+Math khoá R1.5; escrow Aiken chạy thật Preview. Backend + JobMarketplace + mobile_fe có.
- Trace ← OriLifeTrace: TreeReID/FruitID LIVE; ResidueCheck chờ duyệt.
- Chat ← ProofChat: code chạy (E2EE MLS), CHƯA có spec chính tắc.
- Join ← LampNetCloud: spec DRAFT, code Rust ~35%.
- Hạ tầng ngầm: PhoenixKey DID, VeData stamp, LAMP/MAGIC, LampNet.
- Codebase app nền: orilife-mobile-app (RN 0.84.1, đa module).

## Lane cho Feat (Hard Rule 11) — Banzi CHỈ viết
WHY (vấn đề + vision) · WHO (personas 2 cực + admin tạo instance + dev cộng đồng cắm module) · WHAT (feature groups theo 8 SG, MoSCoW; non-goals; business model; regulatory VN-first; GTM; stakeholders).
KHÔNG viết: theorem (→Math), kiến trúc chi tiết/API (→Tech), milestone (→Exec), code.

## Lưu ý đặc thù platform (đừng bỏ sót)
- Personas phải gồm: người dùng cuối 2 cực + **admin lắp/cấu hình instance** + **dev cộng đồng viết module qua SDK**.
- Feature group nên ánh xạ 8 Spec Group ở Master.
- Business model: làm rõ LAMP/MAGIC value capture ở tầng platform (không cắt % tiền dịch vụ — xem mô hình AladinWork).
- Non-goals: liệt kê rõ cái platform KHÔNG làm (vd không tự định nghĩa danh tính — inherit PhoenixKey; không re-spec nghiệp vụ feature).

## CẬP NHẬT v2 (2026-06-17) — RE-SCOPE sau phân tích MECE
Tầm vóc đã mở rộng + đã qua phân tích rủi ro. Banzi viết Feat-Spec PHẢI phản ánh:

### Đọc thêm bắt buộc
- `Specs/_analysis/EXPANSION-ANALYSIS.md` — phán quyết GO-có-điều-kiện, 10 rủi ro, 8 quyết định kiến trúc.
- `Integration-Standard.md` (ROOT) — chuẩn tích hợp duy nhất; §10/§11 phần vận hành + danh mục platform.
- `Specs/PLATFORM-MASTER.md` v0.2 — đã thêm INV-3, INV-SEC, §3bis pull model.

### Khung mới phải vào Feat-Spec
1. **Feature supply network — 3 kênh phân phối**: (1) tab trong instance MagicLamp, (2) app độc lập, (3) nhúng host ngoài. Kênh 3 = Phase 2 (Phase 1 ưu tiên app-factory kênh 1+2).
2. **Đột phá lõi = DATA-FEDERATION (INV-1)**, không phải app-factory/UI. Vision phải nêu rõ hào này.
3. **Mô hình PULL**: không đi tích hợp ai; xây đủ tốt để host tự adopt vì lợi ích gia tăng. Nhúng = acquisition, không phải doanh thu.
4. **Tuân thủ có chủ quyền (sovereign compliance)** = thuộc tính thiết kế jurisdiction-aware (data residency/KYC/feature per chủ quyền). VNeID chỉ là 1 ví dụ trong nhiều app quản lý cư dân.
5. **App-factory không-dev**: đổi khẩu hiệu → "không cần đội dev RIÊNG cho phần lắp ráp chuẩn"; chi phí dịch sang phí platform + template + DAO hậu kiểm.
6. **Personas thêm**: chủ quyền/tổ chức adopt nền tảng (host); người tạo app khởi nghiệp không-dev.
7. **Business model**: value capture ở fabric (DID + token + store); phí qua PSP (platform không cầm tiền B2C); LAMP/MAGIC = phí mạng nội bộ; cần demand-sink nội sinh cho LAMP (staking mở instance/đăng ký module).
8. **Non-goals (rõ)**: không parity-đầy-đủ trong WebView host; không cạnh tranh lõi host; không đặt PII/sinh trắc raw on-chain; không tự định nghĩa danh tính (inherit PhoenixKey).
9. Tham chiếu 4 invariant (INV-1/2/3/SEC) như ràng buộc Feat (không chứng minh — đó là Math).

### Output
- Ghi ra: `Specs/Platform-Feat-Spec.md` (self-contained, version v0.1, header + Change Log).
- Cuối file: "## Self-review (Banzi)" liệt kê 5-10 điểm yếu + mọi [NEEDS-EVIDENCE]/[NEEDS-URL].
