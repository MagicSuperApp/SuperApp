# Aladin SuperApp Platform — Master Spec

> **Scope level**: L1 Infrastructure / Platform (StandardSpec — Master + Spec Groups)
> **Status**: DRAFT v0.1 — 2026-06-16
> **Owner**: Aladin (founder) · Orchestrator giữ interface contract
> **Tuân thủ**: StandardSpec `_shared/HARD-RULES.md` (11 rules), 4-spec/Spec-Group, lane discipline.

---

## 0. Một câu định nghĩa

Aladin SuperApp Platform là **nền tảng sản xuất super-app**: từ một kho module + một lớp dữ liệu người dùng nhất quán, sinh ra nhiều app instance có thương hiệu riêng (Aladin, TonFarm, …), mỗi app chọn một tập module và một cấu hình trải nghiệm — trong khi dữ liệu người dùng luôn thống nhất xuyên mọi app.

KHÔNG phải một ứng dụng. Là hạ tầng để lắp ráp nhiều ứng dụng.

---

## 1. Vị trí trong hệ sinh thái (L0 → L1 → module)

```
L0  MagicLamp (vision)
      │
L1  ALADIN SUPERAPP PLATFORM  ◀── tài liệu này
      │  cung cấp: kho module · SDK · lớp dữ liệu chung · ví · dàn nhạc nâng cấp
      │
      ├── Instance: Aladin   = Chat + Trace + Work  (+ hạ tầng ngầm)
      ├── Instance: TonFarm  = Chat + Trace + Farm  (+ hạ tầng ngầm)
      └── Instance: … (clone khác)
      │
Module (platform cắm vào):
   • Ngầm:    PhoenixKey (DID) · VeData · LAMP/MAGIC · LampNet
   • Feature: ProofChat→Chat · OriLife→Trace · AladinWork→Work · LampNetCloud→Join · Farm · Wish · Feed · Voice · Shop
```

---

## 2. Bất biến nền tảng (normative — khoá vào Math-Spec)

- **INV-1 — Nhất quán dữ liệu (invariant của STORE).** Store DID là single source of truth duy nhất. MỌI host — kể cả app native của ta, kể cả app ngoài nhúng — là *thin client* ghi qua API versioned (idempotency key + version vector + durable outbox), KHÔNG phải bản sao có quyền uy. Một người dùng = một PhoenixKey DID = một nguồn dữ liệu xuyên mọi instance/host. Host kill runtime cũng không vỡ (outbox flush onHide/onUnload).
  - **Nhất quán LOGIC, không tập trung VẬT LÝ.** "Single source of truth" nghĩa là một *view dữ liệu nhất quán* per DID, KHÔNG bắt buộc một kho PII toàn cầu duy nhất. Identity-core có thể **sovereign-shard**: dữ liệu cư dân của một chủ quyền lưu trong-tài-phán đó, federate qua protocol. Magiclamp vận hành protocol federation (neutral), KHÔNG phải controller toàn cục. (Giải xung đột FZ-04: residency chủ quyền vs central controller.)
- **INV-2 — Tách data ⟂ experience.** Cái khác nhau giữa các instance chỉ ở *lớp trải nghiệm* (module nào hiện, bố cục, brand, ngôn ngữ, cấu hình admin). *Lớp dữ liệu* không đổi theo app.
- **INV-3 — Mọi PII erasable + chủ quyền dữ liệu.** On-chain CHỈ chứa hash/commitment/pointer — KHÔNG BAO GIỜ PII hay sinh trắc raw. PII + sinh trắc off-chain, với **vị trí lưu trữ + thời hạn + mức KYC + quyền truy cập cấu hình được PER CHỦ QUYỀN** (mỗi quốc gia/tổ chức adopt đặt theo luật của họ). DID = pseudonymous. Consent per-host tường minh, không kế thừa ngang.
  - **Controller model.** Identity-core của cư dân một chủ quyền = controller trong-tài-phán đó (residency thật); Magiclamp = data processor / protocol operator, KHÔNG phải controller toàn cục. Khi chủ quyền đòi residency → đặt shard trong tài phán, mô hình PULL không gãy.
  - **Cưỡng chế residency = năng lực của LampNet (DEPENDENCY, không phải SuperApp tự spec).** LampNet fabric sở hữu đặt shard theo vùng (Mirage placement + Splash dispatch + governance residency). SuperApp chỉ *cấu hình policy*; LampNet *thực thi + chứng minh* (proof-of-residence). HIỆN TRẠNG: LampNet mới có móng (region tag, preferred_region hint) — CHƯA có Sovereignty Controller/policy engine/enforcement → **dependency risk**: cần yêu cầu team LampNet spec "Data Sovereignty" module (Mirage-Math invariant + Splash placement constraint + governance). SuperApp SG3 chỉ đặc tả mặt *tiêu thụ* (consume) năng lực này.
- **INV-SEC — Config declarative thuần.** Config (instance/theme/billing) KHÔNG BAO GIỜ Turing-complete: không eval, không script, không template-engine truy cập code; billing hook = công thức đóng do platform định nghĩa. Nhu cầu "logic riêng" phải thành MODULE qua registry (chịu gate bảo mật), KHÔNG lẻn vào config. ← bịt tử huyệt RCE xuyên mọi instance.

> 3 tử huyệt từ phân tích (config-RCE · pháp nhân/SLA takedown · PII on-chain cross-border) được khoá ở INV-SEC + §governance + INV-3. Math-Spec phải chứng minh các invariant này TRƯỚC khi viết bất kỳ Spec Group nào.

---

## 3. Hai kiểu tích hợp module

| Kiểu | Hiện diện | Ví dụ | Hợp đồng |
|---|---|---|---|
| **Ngầm (silent)** | Không lộ mặt người dùng; chạy dưới nền | PhoenixKey (danh tính), VeData (stamp), LAMP/MAGIC (token), LampNet (lưu trữ) | Cung cấp service API cho các module khác; không chiếm UI |
| **Feature** | Hiện thành tab/màn trong vỏ | ProofChat→Chat, OriLife→Trace, AladinWork→Work, Join, Farm | Khai báo entrypoint UI, route, icon, quyền; tuân design system vỏ |

**Brand theo kênh (Hard rule — sửa từ v0.1):**
- *Kênh 1+2 (instance ta sở hữu — Aladin/TonFarm):* **brand-strip** — ẩn toàn bộ thương hiệu/hình ảnh gốc của module, chỉ còn nhận diện app chủ.
- *Kênh 3 (nhúng host ngoài — Zalo/Shopee/app cư dân):* **KHÔNG strip** — tuân chrome host, nhận diện ta khiêm tốn, NHƯNG bắt buộc co-brand "powered by MagicLamp" tối thiểu (để user nhận ra, theo được khi rời host, chống giả mạo).

> Cam kết nhất quán xuyên kênh = nhất quán DỮ LIỆU + MÔ HÌNH TƯƠNG TÁC, KHÔNG phải nhất-quán-pixel.

## 3bis. Mô hình PULL + tuân thủ có chủ quyền

- **Pull, không push.** Ta KHÔNG chủ động đi tích hợp vào app ngoài. Ta xây nền tảng đủ tốt để host TỰ tìm đến vì lợi ích gia tăng cho user của họ (thêm tính năng/trải nghiệm, họ không mất gì). Ví dụ: user Facebook gọi được thợ sửa nhà uy tín–giá rẻ–đảm bảo mà không rời Facebook; host không adopt = chấp nhận user rời đi. Nhúng host = kênh **acquisition**, value luôn ở lại tầng fabric.
- **Tuân thủ có chủ quyền là THUỘC TÍNH THIẾT KẾ.** Platform jurisdiction-aware: data residency, retention, mức KYC, tính năng cho phép — cấu hình PER chủ quyền (VNeID chỉ là một ví dụ; bất kỳ app quản lý cư dân của quốc gia/tổ chức nào cũng vậy). Chủ quyền adopt thì *họ* giữ trách nhiệm pháp lý địa phương; MagicLamp cung cấp substrate có-khả-năng-tuân-thủ. Gánh nặng pháp lý phân tán sang adopter, không dồn lên Treasury.
- **Ngoại lệ — Registry magiclamp.network do pháp nhân của ta vận hành.** Phần này pull model KHÔNG xoá được trách nhiệm pháp lý (đăng ký tự do + DAO hậu kiểm + safety-multisig takedown). Còn chờ founder quyết pháp nhân + nơi giữ safety-multisig.

---

## 4. Phân rã Spec Group (MECE — interface contract)

| SG | Tên | Lane sở hữu | KHÔNG đụng (thuộc SG khác) |
|---|---|---|---|
| **SG1** | Module SDK & Integration Contract | Manifest, vòng đời, 2 kiểu tích hợp, brand-strip, bề mặt SDK công khai cho cộng đồng | Cách 1 module cụ thể hiện thực (→SG8); dữ liệu (→SG3) |
| **SG2** | App Composition & White-label | Định nghĩa instance = (module set + branding + config build-time); lắp ráp/đóng gói app | Tuỳ biến runtime của admin (→SG7) |
| **SG3** | Identity & Shared Data Layer | PhoenixKey DID; schema dữ liệu user dùng chung; INV-1; đồng bộ offline-first | UI hiển thị dữ liệu (→SG4); ví (→SG5) |
| **SG4** | Host Shell, Navigation & Design System | Vỏ app, framework điều hướng, design system adaptive, progressive disclosure, theming hooks | Nội dung từng feature (→SG8); cấu hình admin (→SG7) |
| **SG5** | Wallet & Token Services | Ví LAMP/MAGIC dùng chung, số dư, phí, chữ ký giao dịch | Logic nghiệp vụ token của từng module (→SG8) |
| **SG6** | Upgrade & Versioning Orchestration | Module versioning, contract compatibility, lan truyền nâng cấp tới instance, migration dữ liệu | Định nghĩa instance tĩnh (→SG2) |
| **SG7** | Admin Config & Experience Customization | INV-2; bảng điều khiển admin; cái gì được tuỳ biến (experience) | Bất cứ gì chạm data layer (→SG3, cấm) |
| **SG8** | Feature Integration Specs | Work / Chat / Trace / Join / Farm: mỗi module hiện thực hợp đồng SG1 + inherit spec nghiệp vụ upstream | Hợp đồng SDK trừu tượng (→SG1) |

**Quy tắc lane:** nội dung cross-group đi qua §Cross-spec contracts, không duplicate (Hard Rule 11).

**Inherit upstream (Hard Rule 4 — boundary):**
- Work nghiệp vụ → `AladinWork/Specs` (Task/Jem/Flow/Eye, Feat+Math khoá R1.5). SG8 chỉ đặc tả TÍCH HỢP.
- Trace nghiệp vụ → `OriLifeTrace/OriLife-Specs`. SG8 đặc tả tích hợp.
- Join nghiệp vụ → `LampNetCloud/Join`. SG8 đặc tả tích hợp.
- **Chat (ProofChat) CHƯA có spec chính tắc** → SG8 cần đặc tả tích hợp dày hơn (có thể kéo lên L3 module spec riêng nếu cần).
- Danh tính → PhoenixKey (inherit, không redefine).

---

## 5. Đối tượng & ràng buộc thiết kế (Phase 1)

- **Hai cực ngang nhau, adaptive từ đầu**: (a) nông dân/máy Android đời thấp/3G chập chờn/ít quen công nghệ; (b) đô thị/máy mạnh/quen app. Không tối ưu một cực rồi vá.
- Codebase nền: `OriLifeTrace/orilife-mobile-app` (RN 0.84.1, đa module sẵn, offline-first). Hút design system từ `Aladin_mobile`, sync pattern từ `aladin_mobile_fe`.

---

## 6. Thứ tự triển khai spec

1. **Platform Feat-Spec** (tài liệu nền, do Banzi) → anh review 3 vòng.
2. APPROVED → fan-out: mỗi SG một bộ 4-spec (author↔reviewer), Math trước cho SG3 (INV-1) + SG1.
3. Agent Council phản biện song song (audit∥verify∥fix) trước khi LOCK.

---

## 7. Change Log
- v0.2 (2026-06-17): Sau phân tích MECE 8 trục (`_analysis/EXPANSION-ANALYSIS.md`). Khoá 3 tử huyệt: thêm INV-3 (PII erasable + chủ quyền dữ liệu) + INV-SEC (config declarative thuần); restate INV-1 (invariant của store, host = thin client). Brand theo kênh (kênh 3 co-brand, không strip). Thêm §3bis pull model + sovereign compliance. Embedding host = Phase 2 (Phase 1 ưu tiên app-factory).
- v0.1 (2026-06-16): Master khởi tạo. Chốt L1 Platform app-factory, 2 bất biến, 2 kiểu tích hợp, 8 Spec Group MECE.
