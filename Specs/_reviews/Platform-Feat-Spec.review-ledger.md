# Platform-Feat-Spec — Review Ledger (Faza)

> **Đối tượng**: `/Users/ductiger/Projects/SuperApp/Specs/Platform-Feat-Spec.md` v0.1
> **Reviewer**: Faza (Feat-Spec adversary) · **Vai**: adversarial reader, không co-author, không approver cuối
> **Chuẩn đối chiếu**: Feat-Spec.standard.md v1.5 · HARD-RULES.md v1.0 (11 rules) · reviewer-protocol 13 axes + 6 F-extensions
> **Bối cảnh**: PLATFORM-MASTER v0.2 · EXPANSION-ANALYSIS (GO-có-điều-kiện)
> **Scope đã verify**: **L1 Platform/Infrastructure** (Document Metadata). → §0.5 Module Boundary table KHÔNG bắt buộc (chỉ critical cho L3). Đánh giá theo cột "L1 Platform" trong bảng relevance.

---

## Round 1 — 2026-06-17

### Scope verification (F-Check 1 / axis 3)
- **Declared level**: L1 Platform — **đúng**. Spec đặc tả hạ tầng app-factory + federation, không phải một module đơn lẻ. Length, persona ecosystem-wide, full 19 sections phù hợp L1.
- **§0.5 Module Boundary**: không có bảng IN-SCOPE/INHERIT/DELEGATE/PLATFORM-LEVEL — **CHẤP NHẬN được ở L1** (bảng này bắt buộc cho L3, không cho L1). Boundary inherit được xử lý rải rác qua §7 Non-goals + §13 Cross-Spec + §6 cột Origin. **Không tính lỗi.**
- **Feature list vs scope**: FG1-FG8 ↔ SG1-SG8 nhất quán với PLATFORM-MASTER §4. Match.

### Verdict Round 1
**CONDITIONALLY_APPROVED** — 0 CRITICAL author-fixable; 0 scope error; self-review tồn tại & adequate (10 điểm, có CRITICAL-class risk, có cross-spec trace). Có 4 HIGH author-sửa-được (>3 → trần verdict = CONDITIONALLY_APPROVED). Các lỗ hổng nặng nhất về scale/business/regulatory đều là **founder-question đã được đánh dấu đúng [NEEDS-EVIDENCE]/[NEEDS-DECISION]**, KHÔNG tính là lỗi spec (author đã tuân Hard Rule 3 thay vì bịa).

> **Lưu ý gate**: Spec KHÔNG thể Gate-out sang Math ở trạng thái này (Gate-out yêu cầu "scale có con số cụ thể" + "references không TBD"). Nhưng đó là chặn-gate do **founder chưa cung cấp data**, không phải lỗi tác giả. Verdict reviewer ≠ gate-out readiness.

---

## Ledger entries

| id | severity | axis | round_raised | status | title | description | proposed_fix | loại |
|---|---|---|---|---|---|---|---|---|
| FZ-01 | HIGH | F1 business coherence / Rule 9 | 1 | open | Chuỗi suy luận O(số app)→O(module)+O(config) chưa có derivation | §2 + §0 khẳng định chi phí build hạ từ O(số app) xuống O(module)+O(config) như luận điểm nền của moat chi phí, nhưng KHÔNG có derivation (Rule 9). Cùng lúc §8 thừa nhận "chi phí app-factory KHÔNG biến mất". Hai mệnh đề căng nhau: nếu config-authoring/trust-safety/template/DAO là O(số app) ẩn thì luận điểm O(module)+O(config) bị rỗng một phần. | Thêm 1 trade-off/thành-phần-chi-phí table: tách rõ phần nào thật sự O(module)+O(config) vs phần nào vẫn O(số app) (support, moderation per-instance). Không cần số tuyệt đối (chờ TCO founder) nhưng cần **cấu trúc bậc** explicit. | author |
| FZ-02 | HIGH | F4 edge case | 1 | open | Thiếu edge case multi-device / device-loss / DID-recovery cho INV-1 | §6 FG3 AC F3.1 chỉ cover "ghi A đọc B" + "host kill runtime". Bỏ sót: (a) cùng 1 DID trên **2 thiết bị đồng thời** ghi offline → outbox merge conflict (mergePolicy F1.5 là Should, không Must — mâu thuẫn: nếu merge là điều kiện sống của INV-1 multi-device thì phải Must); (b) **mất thiết bị / khôi phục DID sinh trắc** — toàn bộ federation phụ thuộc DID nhưng không persona/feature/AC nào nói recovery; (c) DID **revocation/rotation** khi lộ khoá. P1 (nông dân, 1 máy yếu) có thể đổi/mất máy thường xuyên. | (1) Nâng F1.5 mergePolicy lên Must (hoặc justify tại sao Should đủ). (2) Thêm feature/AC recovery DID + multi-device sync conflict trong FG3. (3) Thêm edge "mất thiết bị" vào AC F3.1/F3.3. | author |
| FZ-03 | HIGH | F2 regulatory / Rule 9 | 1 | open | Cite "5% doanh thu" gắn sai phạm vi điều khoản | §15 AS4 + ngụ ý §9 gán "phạt tới 5% doanh thu" cho việc PII/sinh trắc off-chain. Verify (WebSearch 2026-06-17, mondaq/securiti/tilleke): mức **5% doanh thu năm trước** là trần riêng cho **vi phạm chuyển dữ liệu xuyên biên giới** (VND 3 tỷ → 5%); vi phạm sinh trắc/PII thường khác (tới VND 3 tỷ; mua-bán dữ liệu tới 10× lợi bất chính). Không bịa (luật + số có thật) nhưng **gán nhầm cấp điều khoản** — chính rủi ro Faza phải bắt. | Phân tách trong §9/§15: 5% = cross-border transfer cap; ghi đúng trần cho vi phạm sinh trắc/PII riêng. Đánh dấu cấp điều khoản cụ thể chờ luật sư VN (đã có [NEEDS-EVIDENCE], chỉ cần sửa attribution). | author |
| FZ-04 | HIGH | F3 stakeholder × scope conflict | 1 | open | P5 (chủ quyền/host) "decision power Cao trong jurisdiction" xung đột INV-3 controller tập trung | §11 cho P5 "Cao (trong jurisdiction họ)" + §8.3 nói identity lõi = **1 controller (Magiclamp)**. Mâu thuẫn chưa giải: nếu chủ quyền có quyền cao trong jurisdiction nhưng controller identity lõi tập trung 1 bên (nước ngoài với họ), thì khi luật chủ quyền yêu cầu data residency identity lõi / cấm controller ngoài → mô hình PULL gãy. Self-review #10 chạm rủi ro quyền lực nhưng KHÔNG nối với P5 decision-right conflict. | Làm rõ trong §11/§8.3: identity lõi tập trung có tương thích "chủ quyền giữ quyền pháp lý địa phương" không? Nêu cơ chế (per-jurisdiction controller? sub-controller?) hoặc đánh dấu là Q-founder mới (hiện Q3 VNeID chưa cover trục controller-residency). | author |
| FZ-05 | NORMAL→HIGH | F6 consumer path | 1 | open | P4 (dev) "module sống ≥3 kênh" nhưng kênh 3 là Phase 2 — lời hứa persona chưa được phục vụ ở Phase 1 | §4 P4 success + F1.4 hứa "module sống ≥3 kênh". Nhưng §12: kênh 3 = Phase 2, blocked-by-issuer-EdDSA + legal-entity. Vậy ở Phase 1 dev P4 chỉ có 2 kênh. JTBD P4 "tiếp cận user xuyên mọi instance" được phục vụ ở Phase 1; nhưng "≥3 kênh" là lời hứa **chưa kiểm chứng được** tới Phase 2. Không sai về logic nhưng persona success metric trộn 2 phase → dễ over-promise. | Tách success metric P4 theo phase: Phase 1 = sống ≥2 kênh (1+2); ≥3 kênh = Phase 2 conditional. Tránh đọc nhầm là cam kết Phase 1. | author |
| FZ-06 | NORMAL | F5 feature overlap | 1 | open | Ranh giới F2.1 (instance build-time) vs F7.1 (admin runtime config) mỏng, dễ chồng | F2.1 "config build-time" (SG2) vs F7.x "tuỳ biến experience runtime" (SG7). Cả hai đều "chọn module + cấu hình". PLATFORM-MASTER §4 phân SG2≠SG7 rõ (build-time ⟂ runtime admin) nhưng trong §6 Feat hai feature group mô tả gần trùng, người đọc Feat khó thấy đường cắt. Không phải lỗi lane (cả hai đúng WHAT) nhưng overlap mô tả. | Thêm 1 dòng phân định build-time (F2.x, đóng gói) vs runtime (F7.x, admin chỉnh sống) trong §6 intro hoặc note FG2/FG7. | author |
| FZ-07 | NORMAL | F4 edge case (null state) | 1 | open | Non-goal "canvas tự do" tốt, nhưng thiếu edge "config rỗng / instance 0 module" | §6/§7 không nói trạng thái instance lắp với **0 module** hoặc config tối thiểu/rỗng. Host player one-binary nạp config rỗng → màn gì? Liên quan F4.3 (4 trạng thái bắt buộc) nhưng ở cấp instance-composition chưa có. | Thêm edge "instance config rỗng/không module hợp lệ → fallback/reject" vào AC F2.2 hoặc F4.3. | author |
| FZ-08 | NORMAL | F1 business / Rule 9 | 1 | open | LTV:CAC ≥3 điền sẵn target nhưng CAC/LTV trống — anchor không có derivation | §8 unit economics: LTV/CAC/gross margin/payback = [NEEDS-EVIDENCE] nhưng LTV:CAC = "≥3 (lành mạnh)". Đây là template-default benchmark (đúng theo standard gợi ý) nhưng khi tử/mẫu đều trống, ghi sẵn ≥3 dễ thành anchor không cơ sở (Rule 9). | Giữ ≥3 như **ngưỡng mục tiêu chuẩn ngành** (ghi rõ là benchmark, không phải dự phóng) hoặc [NEEDS-EVIDENCE] tới khi có CAC/LTV thật. Cosmetic, ưu tiên thấp. | author |
| FZ-09 | NORMAL | lane (axis 13) | 1 | open | Vài chỗ chớm chạm Tech-lane (durable outbox, version vector, idempotency, onHide/onUnload) | §0, §6 FG3, §13 Feat→Tech nhắc "durable outbox", "version vector", "idempotency key", "outbox flush onHide/onUnload". Đây là cơ chế Tech. Ở Feat chấp nhận được khi dùng làm **ràng buộc tham chiếu / NFR pointer** (đúng vai §13 Feat→Tech), KHÔNG đặc tả cách hiện thực. Hiện chưa vượt lằn (không có schema/endpoint/code) nhưng **AC F3.1 edge "outbox flush onHide/onUnload"** là chi tiết Tech lọt vào AC Feat. | Trong AC F3.1 giữ kết quả mong đợi ("không mất dữ liệu khi host kill") ở lane Feat; đẩy "flush onHide/onUnload" xuống Tech §13 contract. Ranh giới mỏng, không CRITICAL. | author |
| FZ-10 | NORMAL | F2 regulatory completeness | 1 | open | §9 thiếu cột article-anchor cho PDPL/NĐ 356 (Rule 10 dev-traceability) | §9 ghi "Luật 91/2025/QH15" + "NĐ 356/2025" nhưng cột Articles dạng mô tả ("dữ liệu sinh trắc = nhạy cảm; quyền xoá; 72h") không trỏ điều/khoản cụ thể + URL primary có anchor (Rule 10). E3/E4 trỏ blog luật, không gazette. Author đã đánh dấu [NEEDS-EVIDENCE] điều khoản chi tiết — đúng hướng. | Khi luật sư VN xác nhận: điền điều/khoản cụ thể + URL công báo. Hiện đánh dấu đủ; chỉ nâng khi LOCK §9. | author (chờ luật sư) |
| FZ-11 | NORMAL | F6 consumer path / coherence | 1 | open | F8.3 Chat "ProofChat CHƯA có spec chính tắc" nhưng vẫn Must — rủi ro phục thuộc chưa-có-nền | §6 F8.3 + §13 đánh dấu ProofChat chưa có spec, nhưng F8.3 = Must trong Phase 1 (P1 exit criteria gồm FG8 F8.1-8.3). Inherit từ một upstream **không tồn tại spec** ⟹ "inherit" thực chất là "phải tự viết". Self-review #không nêu trực diện cái này như rủi ro lịch trình Phase 1. | Hoặc hạ F8.3 xuống Should tới khi ProofChat có spec, hoặc ghi rõ trong §12 P1 exit rằng F8.3 kéo theo việc tạo spec ProofChat (scope ẩn). | author |

---

## Founder-questions (KHÔNG tính là lỗi spec — đã đánh dấu đúng)

> Các điểm dưới là **lỗ hổng nội dung thật** nhưng tác giả đã xử lý đúng quy trình: đánh dấu [NEEDS-EVIDENCE]/[NEEDS-DECISION] + đưa vào §14 Open Questions với owner=Founder. Theo brief, **không tính là lỗi tác giả phải sửa**. Liệt kê để orchestrator thấy chúng chặn Gate-out (không chặn verdict reviewer).

| ref | trục | bản chất | đã đánh dấu? |
|---|---|---|---|
| FQ-A | F1 / scale | Toàn bộ §3 TAM/SAM/SOM trống | Có — [NEEDS-EVIDENCE] + Q9 + self-review #2. Đúng Hard Rule 3 (không bịa). |
| FQ-B | F1 / business | §5 user/data scale trống; §8 CAC/LTV/break-even trống | Có — [NEEDS-EVIDENCE] + Q9 + self-review #2,#3. |
| FQ-C | governance | Q1/Q2 pháp nhân Registry + safety-multisig chưa giải | Có — §14 Q1/Q2 owner=Founder; self-review #7. Chặn governance Phase 2. |
| FQ-D | competitive/legal | Q3 quan hệ VNeID; E6 Quyết định 940 chưa có URL primary | Có — §14 Q3 + [NEEDS-URL] E6 + self-review #8. |
| FQ-E | legal/fintech | Q10 vị trí giấy phép PSP; NĐ 52/2024 chưa có URL primary | Có — §9 + [NEEDS-URL] E9 + Q10 + self-review #9. |
| FQ-F | tokenomics | Q8 demand-sink LAMP (mục tiêu cuối: LAMP có giá trị) | Có — §8 + Q8 + self-review #5. AS7 confidence L. |
| FQ-G | vendor | AS3 issuer EdDSA/JWKS (Long, Claude KHÔNG sửa) chặn Phase 2 | Có — AS3 + §13 + Q (ngoài tầm). |
| FQ-H | market | AS5 PULL chưa kiểm chứng (rủi ro chiến lược #1) | Có — AS5 confidence L, top-3 risk + self-review #4. |

---

## Recurrence check (axis 1)
Round 1 — chưa có ledger trước. Tất cả entry mới. Mọi entry FZ-01..FZ-11 set `status=open`, re-verify ở Round 2.

## Cross-spec coherence (axis 2)
Math/Tech/Exec **chưa tồn tại** (Document Metadata: "chưa có — fan-out sau APPROVED"). Không thể đối chiếu sister-spec. §13 Feat→Math/Tech/Exec đã phát biểu contract (4 invariant, params RANGE, NFR, MoSCoW) — đủ rõ để fan-out. Coherence nội-spec: TAM/SAM/SOM↔persona↔feature↔business kiểm tra dưới đây.

### Coherence nội-spec (F1)
- **Persona ↔ Feature**: P1↔F3.3/F4.2 (offline/lowEnd) ✓; P2↔F3.1 ✓; P3↔F7.x ✓; P4↔F1.4 ✓ (lưu FZ-05); P5↔F3.4/jurisdiction ✓ (lưu FZ-04); P6↔F2.1 ✓. **6 persona đều có feature phục vụ.** Admin (P3), dev (P4), sovereign (P5), 2 cực (P1/P2) — đều ánh xạ.
- **TAM/SAM/SOM ↔ business**: trống số (FQ-A) nên chưa thể kiểm coherence định lượng — đúng trạng thái draft.
- **MoSCoW**: Must tập trung FG1-FG4 + lõi FG3 ✓ hợp lý (federation = lõi). Could (F8.5 Farm) hợp lý. **Mâu thuẫn nhỏ**: F8.3 Must nhưng upstream chưa có spec (FZ-11); F1.5 mergePolicy Should nhưng có thể là điều kiện sống INV-1 multi-device (FZ-02).
- **Non-goals**: 11 items, 3 loại (Vĩnh viễn/Out-of-scope release/ngụ ý Out-of-spec) — vượt tối thiểu 5, coherent với anti-persona A1-A4 ✓.

### Fresh-data (axis 11)
- PDPL 91/2025 hiệu lực 01/01/2026 + 5% cross-border cap: **verified** 2026-06-17 (mondaq/securiti/tilleke). → sinh FZ-03 (sai phạm vi).
- Apple 4.7 cập nhật 13/11/2025 (mini-app in scope, index+moderation+age-gate 4.7.2/4.7.5): **verified** 2026-06-17 (developer.apple.com/news, techcrunch, 9to5mac). Tách E1⟂E2 của author **chính xác**. → củng cố self-review #1 (moderation obligation chưa đặc tả — cần SG1, không phải lỗi Feat).

### Self-review evaluation (axis 8)
Self-review Banzi **adequate**: 10 điểm, có CRITICAL-class (config-RCE đã khoá INV-SEC, pháp nhân, PII cross-border), trung thực về uncertainty, có cross-spec trace (chỉ Math), liệt kê đủ [NEEDS-EVIDENCE]/[NEEDS-URL]/[NEEDS-DECISION]. Coverage ≥80% các điểm Faza sẽ bắt ở tầng founder-question. **KHÔNG reject vì self-review.**

---

## VERDICT CUỐI — Round 1

# CONDITIONALLY_APPROVED

**Lý do**:
- **0 CRITICAL** author-fixable. Ba tử huyệt (config-RCE, pháp nhân/SLA, PII cross-border) đã khoá thành invariant tham chiếu (INV-SEC/INV-3) + đưa vào Q-founder — đúng lane Feat.
- **0 scope error** — L1 đúng cấp; §0.5 không bắt buộc ở L1.
- **Self-review tồn tại + adequate** — không reject theo axis 8/§9.
- **4 HIGH author-sửa-được** (FZ-01..FZ-04) → >3 HIGH ⟹ trần verdict = CONDITIONALLY_APPROVED (không thể APPROVED tới khi clear).
- Mọi lỗ hổng nặng còn lại = **founder-question đã đánh dấu đúng** (FQ-A..FQ-H), không tính lỗi tác giả.

**Điều kiện lên APPROVED (Round 2)**: clear FZ-01..FZ-04 (HIGH). FZ-05..FZ-11 (NORMAL) không chặn nhưng nên xử.

**Cảnh báo gate (cho orchestrator, không phải lỗi tác giả)**: Spec **chưa Gate-out sang Math được** vì Gate-out checklist (standard §1) yêu cầu "scale có con số cụ thể" + "references không TBD" + "mọi [NEEDS-DECISION] có owner+deadline". Hiện scale trống (FQ-A/B) và 5 reference [NEEDS-URL]. Đây là chặn do **founder chưa cấp data**, độc lập với verdict reviewer. Reviewer APPROVE được về chất lượng tác giả; Gate-out cần founder điền data + luật sư xác nhận §9.

---

## Round 2 — 2026-06-17

> **Đối tượng**: Platform-Feat-Spec.md **v0.3** (fold KNOWLEDGE §H — giải Q1/Q2/Q8; vá FZ-10/FZ-11; sovereignty phân lớp; FZ-02 recovery INHERIT).
> **Mục tiêu Round 2**: (a) xác nhận FZ-01..FZ-09 đã đóng THẬT không vá hời hợt; (b) soi nội dung MỚI ở v0.3 (§8.1/§8.2 demand-sink, §14.1 RESOLVED, sovereignty layering, F3.7/F3.9 INHERIT); (c) bắt regression.
> **Nguồn sự thật đối chiếu**: PLATFORM-MASTER v0.2 (§2 INV-1/3) · KNOWLEDGE §H (Q8/governance/recovery/sovereign, có file:line) · HARD-RULES v1.0.

### A. Re-verify FZ Round 1 (axis 1 — recurrence)

| id | Round 1 status | Round 2 verdict | Bằng chứng đối chiếu |
|---|---|---|---|
| FZ-01 | open (HIGH) | **CLOSED — đóng thật** | Bảng "Cấu trúc bậc chi phí" §2 (dòng 53-66) tách rõ Phát-triển (O(1)+O(module)+O(config)) ⟂ Vận-hành (vẫn O(số instance)). §8 nốt cuối (dòng 389) trỏ ngược §2. Hai mệnh đề hết căng. Derivation = trade-off table (Hard Rule 9 format hợp lệ). Không vá hời hợt. |
| FZ-02 | open (HIGH) | **CLOSED — đóng thật, không tạo lỗ mới** | F3.7/F3.8/F3.9 đều Must (dòng 228-230); F1.5 mergePolicy nâng Should→Must (dòng 200); 3 khối AC Given/When/Then (dòng 239-251). Giới hạn "ghi offline chưa đồng bộ trước khi mất máy = mất" ghi trung thực (dòng 237,241). INHERIT PhoenixKey đúng (xem mục C). KHÔNG tái phát minh. |
| FZ-03 | open (HIGH) | **CLOSED — đóng thật** | §9.1 mới (dòng 436-448): trần 5% = RIÊNG cross-border transfer; mua-bán trái phép tới 10× lợi bất chính; vi phạm khác tới VND 3 tỷ. Attribution sửa ở §2 (dòng 40), §9 (dòng 428), §15 AS4 (dòng 619). Khớp WebSearch Round 1 (securiti/tilleke). Số có nguồn, không bịa. |
| FZ-04 | open (HIGH) | **CLOSED — đóng thật, khớp Master** | §11 P5 (dòng 485) + note giải xung đột (dòng 490): INV-1 nhất-quán-LOGIC, identity-core sovereign-shard, controller = chủ quyền per-tài-phán, Magiclamp = processor. KHỚP CHÍNH XÁC PLATFORM-MASTER §2 INV-1 (dòng 40) + INV-3 controller model (dòng 43). Thêm decision-right "Controller + residency per-jurisdiction" (dòng 499). Không bịa thêm so với Master. |
| FZ-05 | open (NORMAL) | **CLOSED** | P4 success tách phase (dòng 131): Phase 1 = ≥2 kênh; ≥3 kênh = Phase 2 conditional. F1.4 (dòng 199) cũng tách. Hết over-promise. |
| FZ-06 | open (NORMAL) | **CLOSED** | §6 intro note FZ-06 (dòng 191): FG2(F2.x)=build-time artifact ⟂ FG7(F7.x)=runtime admin. Khớp Master SG2≠SG7 (dòng 77,82). Đường cắt rõ. |
| FZ-07 | open (NORMAL) | **CLOSED** | AC F2.2 edge config-rỗng/0-module (dòng 217): reject lúc build (F2.4 ≥1 module) hoặc render empty-state tường minh (F4.3), KHÔNG màn trắng. |
| FZ-08 | open (NORMAL) | **CLOSED** | §8 unit-econ (dòng 385): LTV:CAC ≥3 ghi rõ "ngưỡng mục tiêu chuẩn ngành (benchmark, KHÔNG phải dự phóng)". Hết anchor không cơ sở. |
| FZ-09 | open (NORMAL) | **CLOSED** | AC F3.1 edge host-kill (dòng 236) giữ kết quả mong đợi ở lane Feat; "flush onHide/onUnload" đẩy xuống Tech §13 (dòng 577). Lane Feat sạch. |
| FZ-10 | open (chờ luật sư) | **GIỮ MỞ — đúng trạng thái** | §9 vẫn mô tả phạm vi, chưa điều/khoản gazette + URL primary. Tác giả đã đánh dấu [NEEDS-EVIDENCE] (dòng 446,448). KHÔNG bịa URL (Hard Rule 1). Đây là founder/luật-sư-question, KHÔNG phải lỗi tác giả. Không chặn verdict. |
| FZ-11 | open (NORMAL) | **CLOSED — xử đúng** | F8.3 GIỮ Must (dòng 299) + dependency tường minh (dòng 305): "Phase 1 KÉO THEO team ProofChat sản xuất spec; đã yêu cầu (draft `_team-messages/ProofChat-SpecRequest.md`)". §13 ghi ProofChat = CHƯA có spec (dòng 556). AS8 ghi (dòng 623). Hết nợ-spec-ẩn: scope ẩn → dependency tường minh. Khớp KNOWLEDGE §H dòng 130. |

**Kết luận mục A**: **9/9 FZ author-fixable đã đóng THẬT** (FZ-01..09). FZ-11 đóng đúng. FZ-10 giữ mở đúng trạng thái (chờ luật sư, không phải lỗi tác giả). **KHÔNG có vá hời hợt, KHÔNG tạo lỗ hổng mới từ việc vá.**

### B. Soi nội dung MỚI v0.3 — §8.1/§8.2 demand-sink Q8 (axis 12 reasoning + axis 13 lane)

- **Khớp KNOWLEDGE §H?** ✓. §8.2 bảng (a)(b)(c) (dòng 363-367) khớp chính xác KNOWLEDGE §H Q8 (dòng 99-103): PlatformKit + `collectToTreasury` (mỗi instance/module = 1 caller), C4 Holding lock one-LAMP-one-DID, C2 lock forward ~24 epoch. §8.1 phí 3 tầng (dòng 352-356) khớp §H (dòng 105-109): Tier1 MAGIC mạng · Tier2 app-level 7% · Tier3 `protocol_cut_bps` Treasury. Nguồn file-path ghi đúng. **Không bịa cơ chế.**
- **Lẫn lane Math (số `protocol_cut_bps`/cap)?** **KHÔNG vi phạm.** `protocol_cut_bps` + `cap C4` xuất hiện 5 lần — TẤT CẢ dùng như **tên tham số** + ghi "số cuối ở Math" (dòng 356,358,369,394,622). KHÔNG có chỗ nào điền giá trị số (vd "= 250 bps"). Đúng Hard Rule 7 (RANGE/tên tham số ở Feat, số cuối ở Math). Lane Feat giữ.
- **Reasoning chain đủ?** ✓. Chuỗi: instance/module đăng ký → caller `collectToTreasury` cắt phí vào Treasury (tier3) + C4 lock + C2 lock → "nguồn cầu LAMP tỷ lệ thuận tăng trưởng số instance/module" (dòng 369). Có derivation logic (Hard Rule 9), trỏ nguồn hợp đồng. Conservation/số cuối nhường Math — đúng lane.
- **Over-claim "LAMP có giá trị" không kèm điều kiện?** **KHÔNG over-claim.** Dòng 361 dùng ngoặc kép "làm LAMP có giá trị" + ngay sau ghi cơ chế cụ thể. AS7 (dòng 622) hạ M↑ NHƯNG ghi rõ "còn lại là **định lượng đủ-hay-không** (Math)" + risk "LAMP thành token Treasury tĩnh (rủi ro **giảm** — không phải triệt tiêu)". Self-review #5 (dòng 700) cũng giữ "rủi ro CÒN LẠI = định lượng". → Claim có điều kiện minh bạch: cơ chế tồn tại ⟂ đủ-lượng chưa chứng minh. **Trung thực, không thổi phồng.**

### C. Soi §14.1 RESOLVED (Q1/Q2/Q8) — khớp nguồn? (axis 11 fresh-data + Rule 9)

- **Q1** (dòng 606): MagicLamp Foundation (3 hội đồng) + phát hành GreenSun+Aladin pháp nhân VN + ra mắt 2026-09-27 (Genesis 2026-06-18). **KHỚP** KNOWLEDGE §H dòng 112-113 + decision-log dòng 140. Ghi "classification cuối chờ luật sư VN — KHÔNG chặn code" = trung thực, không over-resolve.
- **Q2** (dòng 607): Treasury multi-sig council + time-lock; ≥21 DID; Byzantine clamp ΣVP/21 (>4.76% cap). **KHỚP** §H dòng 114-115. Số ≥21/4.76%/ΣVP/21 là **inherit upstream** (LAMP/Governance/VotingPower/CONTRACT.md), KHÔNG phải số platform tự đặt → hợp lệ ở Feat (mô tả cơ chế governance đã chốt, không phải tham số platform mới).
- **Q8** (dòng 608): khớp §8.2 (đã verify mục B).
- **Mốc 2026-09-27 có vi phạm Hard Rule 2 (no timeline)?** **KHÔNG.** Đây là mốc ra-mắt-DAO **đã chốt từ founder/tokenomics upstream** (external fact, KNOWLEDGE §H dòng 113), không phải Q-date tác giả tự dự phóng cho công việc spec. Trích dẫn fact có nguồn = hợp lệ (Rule 2 cấm *fabricate* duration estimate cho công việc, không cấm cite mốc đã ấn định).
- **Bịa thêm?** Không phát hiện. Mọi câu §14.1 truy được về §H + decision-log.

### D. Sovereignty phân lớp (§7/§13) — INHERIT đúng chưa?

- §7 Non-goal "Tự cưỡng chế data residency / proof-of-residence" = **Vĩnh viễn** (dòng 332): "cưỡng chế placement = năng lực LampNet; SuperApp KHÔNG tự spec controller residency; chỉ cấu hình policy + tiêu thụ". **KHỚP CHÍNH XÁC** Master INV-3 dòng 44 ("Cưỡng chế residency = năng lực LampNet, DEPENDENCY, không phải SuperApp tự spec").
- §13 dependency table (dòng 558) + note dependency-risk (dòng 562): LampNet Data Sovereignty = **CHƯA CÓ** (mới có region tag/`preferred_region` hint không enforce/`pin_region` "v2"), ghi minh bạch + "đã yêu cầu team". **Dependency risk ghi trung thực**, khớp §H dòng 128. AS9 (dòng 624) = top-3 risk. Không che giấu.
- **Đánh giá**: phân lớp ĐÚNG. SuperApp không lấn spec LampNet; rủi ro LampNet-chưa-có ghi tường minh ở 3 chỗ (§7/§13/§15-AS9). Đây là **dependency ngoài-tầm**, KHÔNG phải lỗi tác giả.

### E. FZ-02 recovery (F3.7/F3.9) — INHERIT PhoenixKey?

- Note FG3 (dòng 232) + Non-goal (dòng 333) + AC F3.7/F3.9 (dòng 240,249) đều ghi **INHERIT cơ chế PhoenixKey ĐÃ CÓ** (guardian ≥2/3 + 50 ADA + timelock 7 ngày + sequence-monotonic; states Active/Recovering/Migrated/Revoked), "KHÔNG tự định nghĩa mới (Hard Rule 4)". **KHỚP CHÍNH XÁC** KNOWLEDGE §H dòng 118-123. Số 50 ADA/7 ngày/2/3 = inherit upstream, hợp lệ.
- **GAP device-revocation-list** ghi trung thực ở 4 chỗ: note FG3 (dòng 232), AC F3.9 GAP (dòng 251), AS3 (dòng 618), self-review #12 (dòng 714). "Revoke per-khoá qua sequence có; danh sách thiết bị thu hồi tường minh = thiếu → báo Long". Khớp §H dòng 120. **Trung thực, không tự vá.**
- **Đánh giá**: INHERIT đúng (không tái phát minh chữ ký), GAP ghi trung thực. DEP-2 = ngoài-tầm-sửa (Long/PhoenixKey).

### F. Regression check (axis 2 — nhất quán nội-spec §2/§4/§6/§11)

- **§2** (cost structure) ⟂ **§8** (demand-sink mới): không phá. §8.2 dùng lại "LAMP cố định 36 tỷ KHÔNG burn" nhất quán Tokenomics-intent (dòng 392) + CLAUDE.md ecosystem rule. ✓
- **§4 personas** ⟂ feature mới: P1 (dòng 105-107) đã cập-nhật pain/JTBD/success cho device-loss recovery (F3.7) từ v0.2 — nhất quán với F3.7 Must. Không có persona mới ở v0.3 phá map. ✓
- **§6 catalog** ⟂ §8.1 Tier2: F5.2 billing-hook (dòng 269) khớp Tier2 "công thức ĐÓNG, admin chọn RANGE DAO-bound" (dòng 355) + INV-SEC. F5.3 PSP (dòng 270) khớp ghi-chú "B2C off-chain qua PSP" (dòng 358). Không mâu thuẫn. ✓
- **§11 stakeholder** ⟂ §14.1 governance: P5 controller-per-jurisdiction (dòng 485,499) nhất quán Q2 governance 2 tầng (dòng 607) + Master. DAO một-người-một-phiếu (dòng 497) khớp CLAUDE.md "governance KHÔNG token-weighted". ✓
- **Không phát hiện regression.** v0.3 fold nội dung mới mà giữ nhất quán xuyên §2/§4/§6/§11/§13/§15.

### G. Finding MỚI ở v0.3

| id | severity | axis | status | title | mô tả | loại |
|---|---|---|---|---|---|---|
| FZ-12 | LOW (cosmetic) | F1 / Rule 9 | open | §8.1 Tier2 ví dụ "7%" là số minh hoạ, nên gắn nguồn rõ hơn | Dòng 355: "vd OriLife `animal_fee` 7%". Số 7% là ví dụ inherit từ OriLife (KNOWLEDGE §H dòng 107), KHÔNG phải số platform đặt — hợp lệ. Nhưng đứng cạnh các tham số RANGE khác, người đọc Math có thể nhầm là anchor. Đề xuất: ghi "(ví dụ minh hoạ từ OriLife, không phải mức platform)" inline. Không chặn — cosmetic. | author |
| FZ-13 | LOW | F6 / coherence | open | §12 P1 exit-criteria liệt FG8(F8.1-8.3) nhưng F8.3 phụ thuộc spec-chưa-có | Dòng 516: P1 exit gồm "FG8(F8.1-8.3)". F8.3 nay là dependency tường minh (FZ-11 đóng) NHƯNG bảng §12 exit-criteria chưa nhắc P1-exit kéo theo ProofChat-spec-phải-xong. Đường dẫn đã rõ ở §6/§13/AS8; chỉ là §12 chưa trỏ chéo. Nhất quán logic, thiếu cross-ref nhẹ. Đề xuất: thêm 1 nốt ở §12 P1 row trỏ F8.3 dependency. Không chặn. | author |

> **KHÔNG có finding MỚI severity HIGH/CRITICAL ở v0.3.** Hai finding mới đều LOW/cosmetic — không chặn verdict, không chặn trình founder.

### H. Founder-questions còn mở (KHÔNG tính lỗi tác giả)

- Q1/Q2/Q8 → **RESOLVED** (đã verify khớp nguồn, mục C). FQ-C/FQ-F của Round 1 nay đóng.
- Còn mở: Q3 (VNeID), Q4 (host Phase 2), Q5 (vị trí store), Q6 (trải nghiệm phân tầng), Q7 (audit whitepaper), Q9 (baseline scale), Q10 (PSP) — đều owner=Founder, đánh dấu đúng [NEEDS-EVIDENCE]/[NEEDS-DECISION]. Chặn Gate-out, KHÔNG chặn verdict reviewer.
- DEP-1 (LampNet Data Sovereignty CHƯA CÓ) + DEP-2 (PhoenixKey device-revocation-list) = **dependency ngoài-tầm-sửa SuperApp**, ghi trung thực, đã yêu cầu team. KHÔNG phải lỗi tác giả.

---

## VERDICT — Round 2

# CONDITIONALLY_APPROVED → đề xuất nâng APPROVED có-điều-kiện-gate

**Lý do**:
- **9/9 HIGH+NORMAL author-fixable Round 1 (FZ-01..09) đã đóng THẬT** — đối chiếu nguồn, không vá hời hợt, không tạo lỗ mới. FZ-11 đóng đúng. FZ-10 giữ mở đúng trạng thái (chờ luật sư).
- **Nội dung MỚI v0.3 sạch**: §8.1/§8.2 demand-sink khớp KNOWLEDGE §H, KHÔNG lẫn lane Math (tên tham số, không điền số), reasoning chain đủ, KHÔNG over-claim (claim có điều kiện minh bạch). §14.1 RESOLVED khớp nguồn, không bịa. Sovereignty phân lớp + FZ-02 INHERIT đúng (không tái phát minh), GAP ghi trung thực.
- **0 regression** xuyên §2/§4/§6/§11.
- **0 CRITICAL, 0 HIGH author-fixable mới**. Chỉ 2 finding LOW/cosmetic (FZ-12/FZ-13) — không chặn.

**Trần verdict**: theo protocol, vì còn 2 finding author-fixable mở (dù LOW) + **chưa thể Gate-out** (scale trống FQ-A/B, 5 URL [NEEDS-URL], §9 chờ luật sư) → giữ ở **CONDITIONALLY_APPROVED**. Về **chất lượng tác giả lane Feat**: spec đã đạt mức APPROVED — mọi lỗ hổng còn lại là **founder-data / luật-sư / dependency ngoài-tầm**, KHÔNG phải lỗi Banzi.

**Đủ sạch để trình founder review chưa?** **CÓ.** Spec đã sạch ở lane Feat: 4 tử huyệt khoá thành invariant, Q1/Q2/Q8 giải đúng nguồn, recovery/sovereignty INHERIT đúng ranh giới, dependency-risk ghi minh bạch. Các câu còn mở đều là **câu-chờ-founder** (Q3-Q10) + **dependency ngoài-tầm** (DEP-1 LampNet, DEP-2 PhoenixKey/Long) — chính xác là loại quyết định cần founder. Trình founder để: (a) cấp baseline scale (Q9) + duyệt §8/§14.1 RESOLVED; (b) chốt Q3-Q10; (c) xác nhận hướng dependency LampNet/PhoenixKey.

**Phân loại 3 nhóm lỗ hổng còn lại** (cho orchestrator):
- **Lỗi-author-sửa**: FZ-12, FZ-13 (đều LOW, cosmetic — sửa rẻ, không chặn trình founder).
- **Câu-chờ-founder**: Q3, Q4, Q5, Q6, Q7, Q9, Q10 + §9 luật-sư (FZ-10) + scale §3/§5.
- **Dependency-ngoài-tầm**: DEP-1 (LampNet Data Sovereignty chưa có), DEP-2 (PhoenixKey device-revocation-list), AS3 (issuer EdDSA/JWKS — Long).

### Recurrence ledger update
- FZ-01..FZ-09: `open → closed` (Round 2 verified).
- FZ-11: `open → closed` (Round 2 verified).
- FZ-10: `open` (giữ — chờ luật sư, không phải lỗi tác giả).
- FZ-12, FZ-13: `open` (mới, LOW — re-verify Round 3 nếu có).
