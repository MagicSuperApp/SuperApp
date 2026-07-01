# Aladin SuperApp Platform

## Feature Specification

**Phiên bản**: v0.3
**Cập nhật**: 2026-06-17

---

## §0. Executive TL;DR

**WHAT** — Aladin SuperApp Platform (L1) là **nền tảng sản xuất super-app**: từ một kho module + một lớp dữ liệu người dùng nhất quán, sinh ra nhiều app instance có thương hiệu riêng (Aladin, TonFarm, …). Mỗi instance chọn một tập module (Work/Chat/Trace/Join/Farm) + một cấu hình trải nghiệm; dữ liệu người dùng luôn thống nhất xuyên mọi app và mọi kênh phân phối. Lõi khác biệt KHÔNG phải app-factory hay UI — mà là **DATA-FEDERATION**: một PhoenixKey DID = một nguồn dữ liệu xuyên mọi host (INV-1). Đây là thứ host walled-garden không thể clone mà không tự phá moat của họ.

**WHO** — Bốn lớp đối tượng: (1) người dùng cuối hai cực ngang nhau (nông dân/máy yếu/3G/offline + đô thị/máy mạnh); (2) admin lắp/cấu hình instance; (3) dev cộng đồng viết module qua SDK; (4) chủ quyền/tổ chức adopt nền tảng (host) + người khởi nghiệp tạo app không cần đội dev riêng cho phần lắp ráp chuẩn.

**WHY NOW** — Module nghiệp vụ đã chạy thật trên Preview (escrow Work, TreeReID/FruitID Trace LIVE, Chat E2EE MLS). Apple Guideline 4.2.6 + 4.7 (bản cập nhật 11/2025) cho phép tường minh mô hình one-binary aggregated/picker + registry mini-app [E1][E2]. Hành lang dữ liệu VN vừa đóng băng (PDPL 91/2025 + NĐ 356/2025 hiệu lực 01/01/2026) — buộc thiết kế jurisdiction-aware ngay từ đầu thay vì vá sau [E3][E4]. Nền RN 0.84.1 đa-module sẵn sàng. Cửa sổ để dựng lớp federation trung lập TRƯỚC khi một host walled-garden tự dựng đang mở.

**CURRENT STATUS** — DRAFT v0.3 (fold lời giải thật từ code/spec hệ sinh thái — KNOWLEDGE §H). Đây là tài liệu nền (Feat-Spec) trong chuỗi 4-spec; đã qua Round 1 review (CONDITIONALLY_APPROVED), vá v0.2 (FZ-01..FZ-04 HIGH). Lane Feat: chỉ WHY/WHO/WHAT. 4 bất biến (INV-1/2/3/SEC) là ràng buộc tham chiếu — chứng minh thuộc Math-Spec. **v0.3 giải 3 Open Question**: Q1 (pháp nhân = MagicLamp Foundation, phát hành GreenSun+Aladin pháp nhân VN, ra mắt 2026-09-27), Q2 (safety-multisig = Treasury multi-sig council + time-lock), Q8 (demand-sink LAMP = PlatformKit `collectToTreasury` + C4 Holding lock + C2 lock forward). Phụ thuộc cứng còn lại: issuer-side PhoenixKey EdDSA/JWKS (Long, ngoài tầm sửa của ta — Phase 2); **cưỡng chế residency = năng lực LampNet** (LampNet hiện CHƯA có Sovereignty Controller → dependency risk, đã yêu cầu team). Recovery DID INHERIT cơ chế PhoenixKey (guardian 2/3 + 50 ADA + timelock 7 ngày). Embedding host ngoài (kênh 3) = Phase 2; Phase 1 ưu tiên app-factory kênh 1+2.

---

## §1. Vision

Trong 5–10 năm, một người dùng — dù là nông dân Đắk Lắk dùng Android đời thấp hay cư dân đô thị — chỉ cần **một danh tính** để truy cập mọi dịch vụ trong hệ sinh thái, qua bất kỳ app nào (Aladin, TonFarm, hay một mini-app nhúng trong Zalo/Facebook), mà dữ liệu của họ vẫn là một dòng liền mạch không phân mảnh giữa các tường-cao-cổng-kín. Một người khởi nghiệp dựng được super-app có thương hiệu riêng mà không cần đội kỹ sư riêng cho phần lắp ráp chuẩn; một quốc gia hay tổ chức adopt được nền tảng theo luật chủ quyền của họ. Giá trị bền vững nằm ở lớp federation trung lập — không ở pixel hay khẩu hiệu.

---

## §2. Problem Statement

### Vấn đề
Hệ sinh thái phần mềm tiêu dùng Việt Nam (và phần lớn thị trường mới nổi) bị phân mảnh thành các **walled-garden** không liên thông: danh tính, dữ liệu hành vi, và tài sản số của một người bị giam trong từng app riêng lẻ. Mỗi đội muốn ra một super-app mới phải tái dựng từ đầu danh tính, ví, đồng bộ offline, design system — chi phí phát triển tỷ lệ O(số app). Đồng thời, mỗi feature dọc (truy xuất nông sản, chứng cứ lao động) bị khoá trong một app, không vươn tới người dùng nơi họ đang ở (host ngoài). Kết quả: dữ liệu người dùng vừa bị nhân bản mâu thuẫn, vừa không di động được; team nhỏ không đủ lực ra sản phẩm; người dùng cuối ở cực yếu (máy thấp, 3G chập chờn) bị loại khỏi sản phẩm vì thiết kế tối ưu cho cực mạnh rồi vá.

### Ai chịu vấn đề
P1 (nông dân/máy yếu), P2 (đô thị), P3 (admin instance), P4 (dev cộng đồng), P5 (chủ quyền/tổ chức host), P6 (người khởi nghiệp non-dev) — xem §4.

### Mức độ đau
- **Chi phí build lặp**: mỗi super-app mới tái dựng danh tính + ví + sync + design = chi phí PHÁT TRIỂN O(số app) thay vì O(số module)+O(config). Đây là luận điểm nền của moat chi phí — derivation + phân tách bậc ở mục "Cấu trúc bậc chi phí" ngay dưới. [NEEDS-EVIDENCE: con số TCO thực tế per app trong ecosystem]
- **Phân mảnh dữ liệu**: một người = N hồ sơ rời ở N app, không nguồn-sự-thật-duy-nhất. Đau định tính rõ; chưa đo định lượng. [NEEDS-EVIDENCE]
- **Loại trừ cực yếu**: tỷ lệ thiết bị Android đời thấp + vùng 3G trong tập người dùng nông nghiệp mục tiêu. [NEEDS-EVIDENCE: khảo sát thiết bị/mạng HTX]
- **Rủi ro tuân thủ**: PDPL 91/2025 xếp sinh trắc/vị trí = dữ liệu nhạy cảm (Art. 31) với nghĩa vụ bảo vệ cao; riêng vi phạm **chuyển dữ liệu xuyên biên giới** chịu trần phạt tới **5% doanh thu năm trước** (§9.1) — rủi ro thật nếu store/PII đặt ngoài VN [E3][E4].

### Giải pháp hiện tại
| Giải pháp | Limitation | Nguồn |
|---|---|---|
| Mỗi team tự build super-app riêng | Chi phí O(số app); không liên thông danh tính/dữ liệu | [NEEDS-EVIDENCE] |
| Zalo Mini App (host walled-garden) | Dữ liệu giam trong Zalo; danh tính không di động xuyên host; phụ thuộc điều khoản host | [E5] |
| VNeID super-app + Mini App nhà nước | eID công dân do nhà nước kiểm soát; không trung lập xuyên host tư nhân | [E6] (Quyết định 940 — [NEEDS-URL]) |
| SDUI nội bộ (Airbnb/Lyft) | Giảm chi phí UI nhưng không giải bài toán federation danh tính trung lập | [E7][E8] |

### Why now
Ba driver hội tụ 2026: (1) **Pháp lý** — PDPL 91/2025 + NĐ 356/2025 hiệu lực 01/01/2026 đóng băng hành lang dữ liệu, buộc thiết kế jurisdiction-aware ngay [E3][E4]. (2) **Nền tảng phân phối** — Apple 4.2.6 cho phép one-binary aggregated/picker; 4.7 (cập nhật 11/2025) cho phép registry mini-app với điều kiện index + moderation [E1][E2]. (3) **Module đã chín** — Work/Trace/Chat chạy thật, không còn là giả định kỹ thuật (§5).

### Cấu trúc bậc chi phí (derivation — Hard Rule 9)

> Luận điểm moat chi phí ("O(số app) → O(số module)+O(config)") chỉ áp cho **chi phí PHÁT TRIỂN một lần** (one-time build). Nó KHÔNG xoá chi phí VẬN HÀNH lặp lại per-instance (§8 thừa nhận "chi phí app-factory không biến mất"). Phân tách bậc để hai mệnh đề không căng nhau:

| Thành phần chi phí | Bậc trên mô hình cũ (mỗi team tự build) | Bậc trên platform | Loại | Ghi chú |
|---|---|---|---|---|
| Danh tính + ví + sync offline + design system | O(số app) — mỗi app tái dựng | **O(1)** dùng chung fabric | Phát triển (build) | Nguồn moat chính: viết một lần, mọi instance hưởng |
| Viết một module nghiệp vụ mới | O(số app) nếu mỗi app tự viết | **O(số module)** — viết một lần, cắm N instance | Phát triển (build) | Dev cộng đồng (P4) khuếch đại |
| Lắp + cấu hình một instance | O(số app) — dựng app từ đầu | **O(config)** — declarative, không code | Phát triển nhẹ (assembly) | Đây là phần "không-dev" của P6 |
| Trust-safety / moderation per-instance | O(số app) | **vẫn O(số instance)** | Vận hành | KHÔNG giảm bởi factory — Apple 4.7 buộc moderation per registry |
| Hỗ trợ / vận hành / DAO hậu kiểm per-instance | O(số app) | **vẫn O(số instance)** | Vận hành | Dịch sang phí platform/template (§8), không biến mất |
| Pháp lý per-jurisdiction | O(số jurisdiction) | **O(số jurisdiction)** — phân tán sang adopter | Vận hành | Chủ quyền adopt gánh (§3bis Master) |

**Kết luận**: chi phí **xây nền** rơi từ O(số app) xuống O(1)+O(số module)+O(config) — đây là moat. Chi phí **vận hành/dịch chuyển** (support, moderation, pháp lý) vẫn O(số instance)/O(số jurisdiction), chỉ **dịch chỗ** (sang phí platform + template/agency + adopter), KHÔNG biến mất. Cần TCO thật của founder để định lượng điểm hoà vốn của hai bậc này. [NEEDS-EVIDENCE: TCO build vs TCO vận hành per-instance]

---

## §3. Market Thesis

### TAM / SAM / SOM
| Mức | Định nghĩa | Cách tính | Nguồn |
|---|---|---|---|
| **TAM** | Người dùng số VN + thị trường mới nổi cần dịch vụ liên thông danh tính | [NEEDS-EVIDENCE: số liệu dân số số VN/khu vực] | [NEEDS-URL] |
| **SAM** | Người dùng trong các dọc đã có module chạy thật (nông nghiệp/lao động/truy xuất) + team muốn ra super-app | [NEEDS-EVIDENCE] | [NEEDS-URL] |
| **SOM** | Người dùng instance Phase 1 (Aladin + TonFarm) + dev cộng đồng đầu tiên | Internal estimate, **low confidence** — chưa có baseline launch | [NEEDS-EVIDENCE] |

> Hard Rule 3: KHÔNG bịa con số thị trường. Mọi ô TAM/SAM/SOM chờ data thật từ founder/khảo sát.

### Competitive landscape (MECE)
| Đối thủ | Phân khúc | Mạnh | Yếu | Khoảng cách của ta |
|---|---|---|---|---|
| **Zalo (Mini App)** | Host messaging walled-garden | 70M+ user VN [E5]; phân phối khổng lồ | Dữ liệu giam trong Zalo; không federation xuyên host | Federation trung lập; module sống đa kênh (≥2 Phase 1, ≥3 khi mở kênh 3 Phase 2) |
| **VNeID** | eID công dân + super-app nhà nước | Root-of-trust pháp lý; bắt buộc | Không trung lập xuyên host tư nhân; nhà nước kiểm soát | Federate VỚI VNeID làm root-of-trust, KHÔNG cạnh tranh eID [E6] |
| **Shopee/Grab (super-app TM)** | Thương mại/di chuyển | Quy mô, dòng tiền | Dữ liệu giam; cạnh tranh lõi nếu nhúng | Chỉ nhúng dọc host thiếu, không cạnh tranh ngang |
| **SDUI nội bộ (Airbnb/Lyft)** | Server-driven UI | Giảm chi phí UI có tiền lệ production [E7][E8] | Không phải nền tảng mở; không federation danh tính | App-factory mở + SDK cộng đồng + federation |
| **Nền tảng no-code/app-builder** | Tạo app không-dev | Hạ rào kỹ thuật | Không có lớp dữ liệu chung; không token/DID | Lớp fabric (DID + token + store) + chuẩn tích hợp |

> Hard Rule 8: cần WebSearch verify thêm đối thủ gián tiếp (super-app khu vực: Gojek, Line) trước khi LOCK. [NEEDS-EVIDENCE]

### Differentiation thesis (moat)
Moat **không** ở app-factory (lợi thế tốc độ, không phải hào) và **không** ở UI. Moat ở **DATA-FEDERATION (INV-1)**: một PhoenixKey DID = một nguồn dữ liệu xuyên mọi host. Một host có thể clone một feature trong một quý; không host walled-garden nào tạo được mạng danh tính trung lập xuyên-host vì làm vậy = tự bỏ moat walled-garden của chính họ. Nhúng host ngoài (kênh 3) = kênh **acquisition**, value luôn ở lại tầng fabric.

### Market timing
Đúng thời điểm: pháp lý vừa đóng băng (buộc jurisdiction-aware), nền tảng phân phối vừa mở cửa (Apple 4.2.6/4.7), module vừa chín. Không quá sớm (công nghệ đã chạy thật), không quá muộn (chưa host walled-garden nào dựng lớp federation trung lập).

---

## §4. Personas & JTBD

#### P1 — Năm, nông dân trồng sầu riêng (cực yếu)
- **Demo**: ~45 tuổi, Đắk Lắk, thu nhập theo mùa vụ, hộ gia đình.
- **Device/Context**: Android đời thấp, 3G chập chờn, ít quen công nghệ, dùng app dưới nắng/ngoài vườn.
- **Pain**: app nặng treo máy; mất dữ liệu khi mạng rớt; quy trình nhiều bước; **hay mất/đổi/hỏng máy đời thấp** → sợ mất danh tính + lịch sử dữ liệu.
- **JTBD**: *"Khi ghi nhận một lứa trái vừa thu, tôi muốn lưu được ngay cả khi mất sóng, vì tôi không thể đứng chờ mạng giữa vườn."* + *"Khi đổi sang máy mới, tôi muốn lấy lại được danh tính và toàn bộ dữ liệu cũ, vì máy cũ tôi hay hỏng/mất."*
- **Success metric**: thao tác ghi không mất dữ liệu khi offline (durable outbox); app chạy mượt trên thiết bị đời thấp; **khôi phục được DID + dữ liệu store trên máy mới qua sinh trắc gốc (F3.7) khi mất máy**.
- **Friction tolerance**: rất thấp cho thao tác ghi; chấp nhận đồng bộ trễ.

#### P2 — Linh, người dùng đô thị (cực mạnh)
- **Demo**: ~30 tuổi, TP.HCM, thu nhập ổn định, quen app.
- **Device/Context**: máy mạnh, 4G/5G/WiFi, kỳ vọng trải nghiệm đầy đủ.
- **Pain**: phải cài N app cho N dịch vụ; danh tính/dữ liệu rời rạc.
- **JTBD**: *"Khi cần một dịch vụ mới, tôi muốn dùng ngay trong app quen mà không tạo lại tài khoản, vì tôi không muốn quản lý N danh tính."*
- **Success metric**: một danh tính xuyên mọi module/instance; trải nghiệm rich đầy đủ.
- **Friction tolerance**: thấp cho onboarding lặp; cao cho tính năng nâng cao.

#### P3 — Hùng, admin cấu hình instance
- **Demo**: vận hành kỹ thuật/sản phẩm của một instance (vd TonFarm).
- **Context**: lắp app từ tập module + cấu hình experience (brand, ngôn ngữ, bố cục, profile thiết bị).
- **Pain**: muốn tuỳ biến trải nghiệm mà KHÔNG đụng data layer, KHÔNG viết code.
- **JTBD**: *"Khi ra mắt một instance, tôi muốn chọn module + chỉnh theme/bố cục qua bảng điều khiển, vì tôi không có đội kỹ sư riêng cho phần lắp ráp chuẩn."*
- **Success metric**: lắp + cấu hình instance qua config declarative; mọi tuỳ biến chỉ chạm experience (INV-2).
- **Friction tolerance**: thấp cho cấu hình; chấp nhận guard-rail (không canvas tự do).

#### P4 — Trang, dev cộng đồng viết module
- **Demo**: kỹ sư của một team Cardano khác muốn cắm module vào ecosystem.
- **Context**: viết module qua SDK, đăng ký Registry, tuân manifest + capability + design token.
- **Pain**: cần bề mặt SDK ổn định, versioned; muốn module sống được nhiều kênh.
- **JTBD**: *"Khi tôi xây một module mới, tôi muốn cắm vào nền tảng qua một hợp đồng rõ ràng, vì tôi muốn tiếp cận user xuyên mọi instance mà không tự dựng hạ tầng."*
- **Success metric** (tách theo phase — FZ-05): **Phase 1** = module pass gate Registry + chạy trong sandbox + sống **≥2 kênh** (kênh 1 tab + kênh 2 app độc lập); nâng trust-tier qua hậu kiểm. **≥3 kênh** (thêm kênh 3 nhúng host) = **Phase 2 conditional** (phụ thuộc issuer EdDSA/JWKS + legal-entity, §12). Tránh đọc "≥3 kênh" như cam kết Phase 1.
- **Friction tolerance**: chấp nhận gate bảo mật + stake; thấp cho hợp đồng SDK mơ hồ.

#### P5 — Tổ chức/chủ quyền adopt nền tảng (host)
- **Demo**: cơ quan/tổ chức quản lý cư dân của một quốc gia/khu vực.
- **Context**: adopt nền tảng để thêm dịch vụ cho cư dân, theo luật chủ quyền của họ (data residency, KYC, retention cấu hình per chủ quyền). VNeID chỉ là một ví dụ trong nhiều app quản lý cư dân.
- **Pain**: cần substrate có-khả-năng-tuân-thủ; không muốn gánh nặng pháp lý dồn lên bên thứ ba.
- **JTBD**: *"Khi tôi adopt nền tảng cho cư dân của mình, tôi muốn cấu hình tuân thủ theo luật của tôi, vì trách nhiệm pháp lý địa phương là của tôi."*
- **Success metric**: cấu hình jurisdiction-aware; host tự adopt theo mô hình PULL (lợi ích gia tăng cho user của họ).
- **Friction tolerance**: thấp cho rủi ro pháp lý; cao cho tích hợp kỹ thuật.

#### P6 — Sơn, người khởi nghiệp tạo app không-dev
- **Demo**: founder ý tưởng, không có đội kỹ sư.
- **Context**: dùng template + theme tokens + chọn module để ra một super-app có thương hiệu.
- **Pain**: chi phí dev cao; không tự dựng được hạ tầng.
- **JTBD**: *"Khi tôi có một ý tưởng super-app, tôi muốn lắp ráp từ template + module có sẵn, vì tôi không cần đội dev riêng cho phần lắp ráp chuẩn."*
- **Success metric**: ra instance từ template đã kiểm định adaptive 2 cực; chi phí dịch sang phí platform + template, không biến mất.
- **Friction tolerance**: chấp nhận guard-rail mạnh (không free-form); thấp cho chi phí ẩn.

#### Anti-persona — KHÔNG thiết kế cho
- **A1 — Bên muốn nhúng tính năng NGANG cạnh tranh lõi host** (vd dựng marketplace cạnh tranh Shopee bên trong Shopee). Lý do: vi phạm điều kiện "chỉ nhúng dọc host thiếu"; chắc chắn bị host cắt API.
- **A2 — Bên muốn parity native-đầy-đủ trong WebView host ngoài**. Lý do: NO-GO cục bộ; thao tác nặng (ML/offline/sinh trắc) handoff sang native.
- **A3 — Bên muốn dùng PhoenixKey DID thay thế eID nhà nước**. Lý do: rủi ro pháp lý thật; ta federate VỚI eID, không cạnh tranh.
- **A4 — Bên muốn "logic riêng" qua config/theme/billing**. Lý do: vi phạm INV-SEC (config declarative thuần); logic riêng phải thành MODULE qua Registry.

---

## §5. Scale & Geography

### User scale targets
| Phase | Active users (target) | Peak concurrent | Geo | Source/Evidence |
|---|---|---|---|---|
| Phase 1 (app-factory kênh 1+2) | [NEEDS-EVIDENCE] | [NEEDS-EVIDENCE] | VN | Chưa có baseline launch; KHÔNG bịa |
| Phase 2 (nhúng host kênh 3) | [NEEDS-EVIDENCE] | [NEEDS-EVIDENCE] | VN + host được chọn | Phụ thuộc host Phase 1 |

> Hard Rule 3: KHÔNG dùng template defaults. Founder cung cấp baseline thật trước Gate-out sang Math.

### Geography rollout
| Phase | Countries | Languages | Local hosting | Trigger to advance |
|---|---|---|---|---|
| Phase 1 | VN | vi (en optional) | Store/PII tại VN (data localization) [E3][E4] | App-factory kênh 1+2 ổn định + ≥2 instance live |
| Phase 2 | VN (mở rộng theo chủ quyền adopt) | per chủ quyền | per chủ quyền (jurisdiction-aware) | Issuer-side EdDSA/JWKS sẵn (Long) + ≥1 host đối tác đồng ý notice-period |

> Mở rộng quốc gia = theo chủ quyền adopt (PULL), KHÔNG cam kết roadmap quốc gia cứng. [NEEDS-EVIDENCE: vị trí pháp lý store/validator — luật sư VN xác nhận]

### Data scale
| Object | Per user/day | Total @ target scale | Retention |
|---|---|---|---|
| Bản ghi feature (trace/work/chat) | [NEEDS-EVIDENCE] | [NEEDS-EVIDENCE] | Per chủ quyền (erasable, INV-3) |
| On-chain commitment (hash/pointer) | [NEEDS-EVIDENCE] | [NEEDS-EVIDENCE] | Bất biến (KHÔNG PII — INV-3) |

### Đặc tả thiết bị/mạng (ràng buộc, không phải throughput)
Hai cực ngang nhau, adaptive từ đầu (INV-2/experience): cực yếu = Android đời thấp + 3G + offline-first; cực mạnh = đầy đủ. CI ma trận thiết bị thấp/3G + accessibility là gate phát hành. [NEEDS-EVIDENCE: ma trận thiết bị mục tiêu cụ thể]

---

## §6. Feature Catalog

> Feature groups ánh xạ 8 Spec Group (SG1..SG8) trong PLATFORM-MASTER §4. Lane Feat: mô tả WHAT + user benefit + Origin + MoSCoW. Kiến trúc/API → Tech; chứng minh → Math.
>
> **Phân định build-time ⟂ runtime (FZ-06)**: **FG2 (F2.x) = build-time** — định nghĩa + đóng gói instance lúc lắp ráp (module set + branding + config build-time), kết quả là một artifact phát hành. **FG7 (F7.x) = runtime admin** — admin chỉnh experience trên instance đang chạy qua bảng điều khiển (theme/bố cục live), KHÔNG đóng gói lại. Cả hai đều "chọn module + cấu hình" nhưng khác thời điểm và khác output; cùng tuân INV-2 (chỉ chạm experience) + INV-SEC (declarative thuần).

### FG1 — Module SDK & Integration Contract (↔ SG1)
| ID | Feature | User benefit | Origin | Priority | Dependency |
|---|---|---|---|---|---|
| F1.1 | Module manifest declarative (`module.manifest.json`) | Dev cắm module qua một hợp đồng rõ; Registry validate trước khi nạp | NEW | Must | INTEGRATION-STANDARD §1 |
| F1.2 | Hai kiểu tích hợp: silent ⟂ feature | Module ngầm cung service; module feature hiện tab — ranh giới rõ | ADAPTED from PLATFORM-MASTER §3 | Must | F1.1 |
| F1.3 | Capability model (default-deny, scope hẹp) | User được bảo vệ: module không xin `*`, không chạm data/wallet/biometric tuỳ tiện | NEW | Must | INV-SEC |
| F1.4 | Bề mặt SDK công khai versioned cho cộng đồng | Dev cộng đồng (P4) build module sống ≥2 kênh (Phase 1) → ≥3 kênh khi kênh 3 mở (Phase 2) | NEW | Must | F1.1, F1.2 |
| F1.5 | `mergePolicy` khai báo trong manifest | Dữ liệu offline merge đúng (lww/CRDT/on-chain-total-order) — điều kiện sống của INV-1 khi cùng 1 DID ghi từ ≥2 thiết bị | NEW | **Must** (nâng từ Should — FZ-02: multi-device là kịch bản thật, không có mergePolicy thì INV-1 nhất-quán gãy khi 2 thiết bị ghi offline) | F1.1 |

**Acceptance (F1.1, Must)**:
- **Given** một module mới với `module.manifest.json`; **When** đăng ký Registry; **Then** manifest pass JSON-Schema, không trường cấm (template/eval/executable path), `mergePolicy` khai rõ — nếu không, reject.
- **Edge**: manifest xin `capabilities: "*"` → reject; thiếu `mergePolicy` → reject.

### FG2 — App Composition & White-label (↔ SG2)
| ID | Feature | User benefit | Origin | Priority | Dependency |
|---|---|---|---|---|---|
| F2.1 | Instance = (module set + branding + config build-time) | P6 lắp super-app có thương hiệu riêng không cần đội dev riêng phần lắp ráp | NEW | Must | F1.x |
| F2.2 | Host player one-binary config-driven | Một binary, N config — chi phí O(module)+O(config) | ADAPTED from SDUI (Airbnb/Lyft [E7][E8]) | Must | INV-SEC |
| F2.3 | Brand-strip kênh 1+2 (về app chủ) | User chỉ thấy nhận diện app chủ trong instance ta sở hữu | NEW | Must | F2.1 |
| F2.4 | Đóng gói/phát hành instance | Ra app store qua mô hình aggregated/picker (Apple 4.2.6 [E1]) | NEW | Must | F2.2 |

**Acceptance (F2.2, Must)**:
- **Given** host player binary + một config instance; **When** nạp config lúc chạy; **Then** config validate declarative thuần (JSON-Schema, không eval/script/template-engine-có-code) trước khi nạp — config KHÔNG BAO GIỜ nạp executable code (Apple 2.5.2 [E2]; INV-SEC).
- **Edge**: config chứa expression/template → reject; config chạm data layer → reject (INV-2).
- **Edge (config rỗng / 0 module hợp lệ — FZ-07)**: instance config không khai module feature hợp lệ nào → host player KHÔNG render màn trống/spinner vô định; hoặc **reject lúc đóng gói** (build-time, F2.4: instance phải có ≥1 module feature), hoặc render **trạng thái empty tường minh** (F4.3) nếu lọt tới runtime. KHÔNG bao giờ màn trắng.

### FG3 — Identity & Shared Data Layer (↔ SG3) — LÕI ĐỘT PHÁ
| ID | Feature | User benefit | Origin | Priority | Dependency |
|---|---|---|---|---|---|
| F3.1 | Một PhoenixKey DID = một nguồn dữ liệu xuyên mọi host (INV-1) | User: một danh tính, dữ liệu liền mạch xuyên app/kênh | REUSED from PhoenixKey (identity) + NEW (federation layer) | Must | PhoenixKey |
| F3.2 | Store DID = single source of truth; host = thin client ghi qua API versioned | Dữ liệu không phân mảnh/mâu thuẫn; host kill runtime không vỡ | NEW | Must | F3.1, durable outbox |
| F3.3 | Đồng bộ offline-first + durable outbox | P1 (nông dân) ghi được khi mất sóng, không mất dữ liệu | ADAPTED from orilife-mobile-app | Must | F3.2 |
| F3.4 | Hai tầng dữ liệu pháp lý (on-chain hash/commitment; PII off-chain erasable) | User: PII xoá được thật; tuân INV-3 | NEW | Must | INV-3 |
| F3.5 | Federation token audience-bound (host ngoài) | Credential/biometric/DID gốc KHÔNG vào WebView host | NEW | Should (Phase 2) | F3.1, issuer EdDSA/JWKS (Long) |
| F3.6 | LoA (Level of Assurance) phân hạng | Chỉ DID sinh trắc gốc có quyền governance/thu phí | NEW | Should | F3.1 |
| F3.7 | Khôi phục DID qua sinh trắc gốc (device-loss recovery) | P1 (nông dân hay mất/đổi máy) lấy lại danh tính + dữ liệu trên máy mới, không mất lịch sử | NEW | **Must** (điều kiện sống INV-1 multi-device — FZ-02) | F3.1, PhoenixKey (issuer) |
| F3.8 | Multi-device đồng thời: cùng 1 DID ghi offline từ ≥2 thiết bị → outbox merge theo `mergePolicy` | User dùng nhiều máy không tạo nhánh dữ liệu mâu thuẫn; store hội tụ một view nhất quán | NEW | **Must** (INV-1 nhất-quán-logic — FZ-02) | F3.2, F1.5 |
| F3.9 | DID rotation / revocation khi lộ khoá thiết bị | Lộ khoá một máy không lộ toàn bộ danh tính; thu hồi + cấp lại không mất dữ liệu store | NEW | **Must** (an toàn danh tính — FZ-02) | F3.1, PhoenixKey (issuer) |

> **Lưu ý lane + INHERIT (FZ-02, fold KNOWLEDGE §H)**: recovery/rotation về **cơ chế chữ ký** (key derivation, social/biometric recovery) là issuer-side PhoenixKey (Long, ngoài tầm sửa của ta) — Feat chỉ đặc tả WHAT (phải khôi phục được, phải hội tụ, phải thu hồi được) + ràng buộc INV-1; cách hiện thực ở Tech §13 + upstream PhoenixKey. F3.7/F3.9 phụ thuộc issuer EdDSA/JWKS (AS3) như F3.5. **F3.7/F3.9 INHERIT cơ chế recovery PhoenixKey ĐÃ CÓ (Hard Rule 4 — KHÔNG tự định nghĩa mới)**: guardian ≥2/3 ký + 50 ADA collateral + timelock 7 ngày (preprod 1h); states Active/Recovering/Migrated/Revoked; rotate khoá; **sequence-monotonic** chống hacker dùng khoá cũ; multi-device qua `linked_device_token` cache 30 ngày, mất máy → recovery flow. DID = `did:phoenix:<slot>:<hash>`, on-chain chỉ hash/pubkey, biometric chỉ hash off-chain. Nguồn: `PhoenixKeyDID/TESTNET-PLAN.md §A`, `PhoenixKey-SDK/method.md §5` (Security: sequence-monotonic/replay) + `§6` (Privacy: biometric hash). **GAP đã biết**: PhoenixKey CHƯA có device-revocation-list chi tiết → F3.9 phụ thuộc PhoenixKey bổ sung (báo Long, không tự định nghĩa).

**Acceptance (F3.1, Must)**:
- **Given** một user với một PhoenixKey DID dùng ≥2 instance/host; **When** ghi dữ liệu ở instance A rồi đọc ở instance B; **Then** dữ liệu nhất quán (store là nguồn-sự-thật-duy-nhất), không phụ thuộc host nào ghi trước.
- **Edge (host kill)**: host kill runtime giữa chừng → outbox không mất dữ liệu khi flush; ghi offline đã nhận được đồng bộ khi mạng trở lại (INV-1). [Cơ chế flush onHide/onUnload → Tech §13.]
- **Edge (mất thiết bị)**: P1 mất/hỏng máy → trên máy mới, khôi phục DID qua sinh trắc gốc (F3.7) → đọc lại được toàn bộ dữ liệu store (store là nguồn-sự-thật, không nằm ở thiết bị); dữ liệu offline chưa kịp đồng bộ trước khi mất máy = mất (giới hạn đã biết, nêu rõ cho user — không che).

**Acceptance (F3.7 recovery, Must — INHERIT cơ chế PhoenixKey)**:
- **Given** một user có DID sinh trắc gốc, mất/đổi sang thiết bị mới (không còn khoá thiết bị cũ); **When** chạy recovery flow PhoenixKey trên máy mới (guardian ≥2/3 ký + 50 ADA collateral + timelock 7 ngày, sequence-monotonic — INHERIT, không tự định nghĩa); **Then** DID chuyển Recovering→Migrated, liên kết lại với thiết bị mới + truy cập được toàn bộ dữ liệu store của DID đó (store-as-truth, INV-1), KHÔNG cần thiết bị cũ; khoá cũ mất hiệu lực qua sequence-monotonic.
- **Edge (P1 nông dân)**: thiết bị đời thấp, không backup cloud → recovery vẫn chạy được vì nguồn-sự-thật ở store, không ở máy; chỉ ghi offline chưa đồng bộ mới mất.
- **Edge (timelock)**: recovery có timelock 7 ngày (PhoenixKey) → user cần lường thời gian chờ; KHÔNG bypass timelock (chống chiếm DID nhanh).
- **Edge (sinh trắc fail/đổi sinh trắc)**: nếu sinh trắc gốc không khôi phục được → fallback = đường guardian (≥2/3) do PhoenixKey định nghĩa — INHERIT, không tự spec.

**Acceptance (F3.8 multi-device, Must)**:
- **Given** cùng 1 DID đăng nhập trên thiết bị D1 và D2, cả hai ghi offline cùng một đối tượng dữ liệu; **When** cả hai outbox đồng bộ lên store; **Then** store hội tụ về một trạng thái nhất quán theo `mergePolicy` khai trong manifest (lww/CRDT/on-chain-total-order) — KHÔNG tạo hai bản ghi mâu thuẫn song song, KHÔNG mất ghi (INV-1).
- **Edge**: module không khai `mergePolicy` → reject ở Registry (F1.1); xung đột không giải được tự động theo policy → đánh dấu conflict cho user/admin xử, KHÔNG ghi đè im lặng.

**Acceptance (F3.9 rotation, Must — INHERIT cơ chế PhoenixKey)**:
- **Given** khoá một thiết bị bị lộ; **When** user (qua sinh trắc gốc / guardian) yêu cầu thu hồi + xoay khoá (rotate PhoenixKey, sequence-monotonic); **Then** khoá thiết bị cũ bị revoke (mất quyền ghi store qua sequence cũ), DID gốc giữ nguyên, dữ liệu store không mất; thiết bị bị thu hồi không ghi được nữa kể từ thời điểm revoke.
- **GAP (ghi trung thực)**: PhoenixKey hiện CHƯA có device-revocation-list chi tiết (KNOWLEDGE §H). Revoke per-khoá qua sequence-monotonic có; danh sách thiết bị bị thu hồi tường minh = cần PhoenixKey bổ sung (báo Long). F3.9 phụ thuộc năng lực này.

### FG4 — Host Shell, Navigation & Design System (↔ SG4)
| ID | Feature | User benefit | Origin | Priority | Dependency |
|---|---|---|---|---|---|
| F4.1 | Vỏ app + framework điều hướng chung (navigation grammar) | Trải nghiệm điều hướng nhất quán xuyên instance/kênh | NEW | Must | F2.2 |
| F4.2 | Design system adaptive 2 cực (token-driven, profile lowEnd/rich) | P1 máy yếu + P2 máy mạnh đều được phục vụ, không vá | NEW | Must | F4.1 |
| F4.3 | Bốn trạng thái bắt buộc mọi màn (loading/empty/offline/error) | User không gặp màn trống/spinner vô định; offline báo rõ | NEW | Must | F4.2 |
| F4.4 | Theming hooks (override giá trị token, KHÔNG thêm token inject) | Admin tuỳ biến brand mà không mở lỗ hổng (INV-SEC) | NEW | Must | F4.2 |
| F4.5 | Progressive disclosure | Giảm tải nhận thức cho P1 ít quen công nghệ | NEW | Should | F4.2 |

**Acceptance (F4.2, Must)**:
- **Given** thiết bị đời thấp + mạng 3G; **When** mở một màn feature; **Then** tự động (hoặc override admin/user) chọn profile `lowEnd`: nhẹ asset, ít animation, ưu tiên offline — CI ma trận thiết bị thấp/3G + accessibility xanh TRƯỚC phát hành.

### FG5 — Wallet & Token Services (↔ SG5)
| ID | Feature | User benefit | Origin | Priority | Dependency |
|---|---|---|---|---|---|
| F5.1 | Ví LAMP/MAGIC dùng chung (số dư, chữ ký giao dịch) | User: một ví xuyên mọi module/instance | REUSED from LAMP/MAGIC | Must | LAMP/MAGIC |
| F5.2 | Billing hook = công thức ĐÓNG do platform định nghĩa | Admin chọn mức phí trong khoảng DAO-bound, không viết công thức (INV-SEC) | NEW | Must | F5.1 |
| F5.3 | Ranh giới dòng tiền: phí B2C qua PSP, platform không cầm tiền | Tuân khung trung gian thanh toán; LAMP/MAGIC chỉ phí mạng nội bộ | NEW | Must | F5.2 [E9] |
| F5.4 | Sàn phí mạng MAGIC không-thể-zero | Chống race-to-zero + phủ chi phí biên per-DID | NEW | Should | F5.2 |

**Acceptance (F5.3, Must)**:
- **Given** một giao dịch dịch vụ thương mại B2C; **When** thu phí; **Then** phí đi qua PSP có giấy phép, settlement PSP→founder; platform KHÔNG tự cầm/chia tiền; LAMP/MAGIC KHÔNG dùng định giá-thanh toán dịch vụ B2C.
- **Edge**: cần tư vấn luật sư fintech VN trước khi bật billing per-feature [E9]. [NEEDS-EVIDENCE: vị trí giấy phép PSP cụ thể]

### FG6 — Upgrade & Versioning Orchestration (↔ SG6)
| ID | Feature | User benefit | Origin | Priority | Dependency |
|---|---|---|---|---|---|
| F6.1 | Module versioning (semver) + contract compatibility | Dev nâng cấp module không phá instance đang chạy | NEW | Must | F1.1 |
| F6.2 | Lan truyền nâng cấp tới instance | Admin nhận nâng cấp có kiểm soát | NEW | Should | F6.1 |
| F6.3 | Migration dữ liệu theo version | User không mất dữ liệu khi module nâng cấp | NEW | Should | F6.1, F3.2 |

### FG7 — Admin Config & Experience Customization (↔ SG7)
| ID | Feature | User benefit | Origin | Priority | Dependency |
|---|---|---|---|---|---|
| F7.1 | Bảng điều khiển admin (tuỳ biến experience) | P3 cấu hình instance không-code | NEW | Must | INV-2 |
| F7.2 | Config schema declarative (whitelist kiểu, `additionalProperties:false`) | Tuỳ biến an toàn; không lẻn logic (INV-SEC) | NEW | Must | F2.2 |
| F7.3 | Ranh giới cứng: config KHÔNG chạm data layer | Bảo toàn INV-2; tuỳ biến chỉ tác động experience | NEW | Must | INV-2 |

**Acceptance (F7.3, Must)**:
- **Given** một config admin; **When** validate; **Then** mọi giá trị chỉ tác động experience layer — bất kỳ config chạm data layer = reject (INV-2). Logic riêng phải thành MODULE qua Registry, KHÔNG vào config (INV-SEC).

### FG8 — Feature Integration Specs (↔ SG8)
| ID | Feature | User benefit | Origin | Priority | Dependency |
|---|---|---|---|---|---|
| F8.1 | Tích hợp Work (escrow, JobMarketplace) | User tiếp cận lao động có chứng cứ; inherit nghiệp vụ AladinWork (R1.5) | REUSED from AladinWork | Must | AladinWork Specs |
| F8.2 | Tích hợp Trace (TreeReID/FruitID) | User truy xuất nông sản; inherit OriLifeTrace | REUSED from OriLifeTrace | Must | OriLifeTrace Specs |
| F8.3 | Tích hợp Chat (E2EE MLS) | User nhắn tin riêng tư; ProofChat CHƯA có spec chính tắc → đặc tả tích hợp dày hơn | ADAPTED from ProofChat | Must | ProofChat spec (Phase 1 kéo theo — team ProofChat ĐÃ được yêu cầu sản xuất spec) |
| F8.4 | Tích hợp Join | User góp compute vào LampNet, được verify + tích thưởng; inherit LampNetCloud | REUSED from LampNetCloud | Should | LampNetCloud (DRAFT) → spec tích hợp: `Specs/SG8-Join-Integration.md`; bản compute-contribution test được NGAY |
| F8.5 | Tích hợp Farm | User canh tác | NEW | Could | — |

> SG8 chỉ đặc tả TÍCH HỢP; nghiệp vụ inherit upstream (Hard Rule 4 boundary).
>
> **Dependency tường minh F8.3 (hết nợ-spec-ẩn — giải FZ-11)**: F8.3 GIỮ **Must**. ProofChat hiện CHƯA có spec chính tắc (doc nhúng trong code) → **Phase 1 KÉO THEO việc team ProofChat sản xuất ProofChat spec** (Feat Chat + tích hợp SG8 theo INTEGRATION-STANDARD). Đây KHÔNG còn là scope ẩn: yêu cầu spec đã được phát tới team ProofChat (draft `_team-messages/ProofChat-SpecRequest.md`). F8.3 là dependency tường minh, KHÔNG phải nợ ngầm trong lane Feat. Trạng thái: ProofChat spec = **outbound dependency, đã yêu cầu**.

### §6.X UX Flow & Design Reference
| Asset | Location |
|---|---|
| Wireframes & mockups | [NEEDS-URL: Figma file] |
| Design system | [NEEDS-URL: token library/Storybook] |
| Design tokens | JSON in repo [NEEDS-URL: repo path] |
| Prototype | [NEEDS-URL: Figma prototype] |
| Codebase nền | `OriLifeTrace/orilife-mobile-app` (RN 0.84.1) — [NEEDS-URL: repo] |

**Accessibility commitment**: WCAG 2.1 AA mặc định; touch target ≥44pt; contrast ≥4.5:1; CI accessibility + ma trận thiết bị thấp/3G xanh TRƯỚC phát hành (gate cho P1).

**Brand theo kênh** (Hard rule platform): kênh 1+2 = brand-strip về app chủ; kênh 3 = co-brand "powered by MagicLamp" bắt buộc (chống impersonation + giữ đường rút). Cam kết nhất quán xuyên kênh = nhất quán DỮ LIỆU + MÔ HÌNH TƯƠNG TÁC, KHÔNG nhất-quán-pixel.

---

## §7. Non-goals

| Item | Loại | Lý do | Kế hoạch |
|---|---|---|---|
| Parity native-đầy-đủ trong WebView host ngoài | Vĩnh viễn | NO-GO cục bộ; WebView không kham ML/offline/sinh trắc nặng | Thin-funnel + deep-link sang native |
| Cạnh tranh tính năng NGANG lõi host | Vĩnh viễn | Chắc chắn bị host cắt API; phá quan hệ PULL | Chỉ nhúng dọc host thiếu |
| PhoenixKey DID thay thế eID nhà nước | Vĩnh viễn | Rủi ro pháp lý thật | Federate VỚI VNeID làm root-of-trust [E6] |
| Đặt PII/sinh trắc raw on-chain | Vĩnh viễn | Vi phạm INV-3 + PDPL (sinh trắc nhạy cảm, quyền xoá) [E3] | On-chain chỉ hash/commitment/pointer |
| "Logic riêng" qua config/theme/billing | Vĩnh viễn | Vi phạm INV-SEC (config Turing-complete = RCE xuyên instance) | Logic riêng = MODULE qua Registry (chịu gate) |
| Tự định nghĩa danh tính | Vĩnh viễn | Inherit PhoenixKey; không redefine | Tiêu thụ qua service API PhoenixKey |
| Tự cưỡng chế data residency / proof-of-residence | Vĩnh viễn | Cưỡng chế placement = năng lực **LampNet** (Mirage placement + Splash dispatch + governance residency); SuperApp KHÔNG tự spec controller residency | SuperApp chỉ *cấu hình policy* + *tiêu thụ*; LampNet *thực thi + chứng minh* (dependency, §13) |
| Tự định nghĩa cơ chế recovery/rotation chữ ký | Vĩnh viễn | Inherit PhoenixKey (guardian 2/3 + 50 ADA + timelock 7 ngày, sequence-monotonic); không tái phát minh | Feat đặc tả WHAT; cơ chế chữ ký = issuer-side PhoenixKey (Long) |
| Re-spec nghiệp vụ feature (Work/Trace/Join) | Vĩnh viễn | Inherit upstream (Hard Rule 4); SG8 chỉ đặc tả tích hợp | Tham chiếu spec upstream |
| Platform tự cầm/chia tiền B2C | Vĩnh viễn | Né khung trung gian thanh toán [E9] | Dòng tiền qua PSP; platform chỉ phí nền tảng |
| Embedding host ngoài (kênh 3) đầy đủ | Out-of-scope release Phase 1 | Ưu tiên app-factory kênh 1+2 trước | Phase 2, sau khi issuer EdDSA/JWKS sẵn |
| Canvas thiết kế tự do cho non-dev | Vĩnh viễn | UI tệ + lỗ hổng; đẩy cực yếu ra khỏi sản phẩm | Chỉ theme tokens + template đã kiểm định adaptive |

---

## §8. Business Model

### Revenue model
**Hybrid, value capture ở tầng FABRIC** (DID + token + store), KHÔNG cắt % tiền dịch vụ B2C (theo mô hình AladinWork). Ba dòng giá trị:
1. **Phí nền tảng** — phí lắp/vận hành instance, phí đăng ký/nâng trust-tier module (platform thu trực tiếp).
2. **Phí mạng nội bộ (LAMP/MAGIC)** — chi cho tài nguyên mạng (gas/storage/compute); sàn không-thể-zero.
3. **Phí dịch vụ B2C** — đi qua PSP có giấy phép, settlement PSP→founder; **platform KHÔNG cầm/chia tiền** [E9].

### §8.1 Cấu trúc phí — HAI cơ chế on-chain tách biệt + tiền dịch vụ off-chain (chuẩn LAMP/MAGIC team, §7B + PlatformKit)

> Cảnh báo (LAMP/MAGIC team xác nhận): KHÔNG nhầm "phí marketplace LAMP" với "phí mạng MAGIC". Một thao tác (vd `task.complete`) chạm CẢ HAI nhưng chúng độc lập.

**① Phí marketplace/app (LAMP — qua `collectToTreasury`)**: PriceFn tính `fee = (base[event] + giá_trị×bps) × demand × anchor_tier_mult`, **cap "rẻ hơn truyền thống ≥ ½"** + floor chống khai thấp. Thu bằng LAMP rồi **chia**: `protocol_cut_bps` → Treasury bucket (LAMP **HÚT** khỏi lưu hành, value bảo toàn, KHÔNG burn); residual → provider/quỹ dispute. Nguồn: `LAMP/PlatformKit/examples/*.ts` + `LAMP/Treasury/CONTRACT.md`.

**② Phí mạng (MAGIC — ĐỐT)**: khi gọi thao tác on-chain (vd escrow redeemer MutualRelease/Forfeit/PartialSettle). Tầng RIÊNG, cộng thêm, KHÔNG qua PriceFn/Collect. MAGIC bị đốt (≠ LAMP cố định không burn). Nguồn: `MAGIC/README.md`.

**Tiền dịch vụ B2C** (công thợ…) = fiat off-chain qua PSP — KHÔNG phải LAMP/MAGIC; platform KHÔNG cầm/chia (F5.3 [E9]).

> Tham số (base / value-bps / floor mỗi event + `protocol_cut_bps`) = RANGE config DAO-bound; số cuối Aladin/DAO chốt (Hard Rule 7) → Math [PARAM]. Ví dụ ứng viên do team đề xuất (Work, stub): commission `task.complete` 3% (cap 7.5% = ½ môi giới ~15%); `protocol_cut_bps` = 1000 (10%, cao hơn OriLife 700 / PhoenixKey 500 vì marketplace cấp nhiều dịch vụ hơn).

### §8.2 Demand-sink LAMP — LAMP bị HÚT khỏi lưu hành, KHÔNG burn (fold Q8, KNOWLEDGE §H)
**Đây là cơ chế chạm mục tiêu cuối "làm LAMP có giá trị".** LAMP cố định 36 tỷ, KHÔNG đốt — giảm lưu hành = **chuyển trạng thái** (vào Treasury hoặc khoá trong UTxO), không mất nguồn cung. SuperApp sinh cầu LAMP nội sinh qua 3 đường, KHỚP thẳng với hợp đồng đã có:

| # | Cơ chế hút LAMP | SuperApp khớp thế nào | Nguồn (KNOWLEDGE §H) |
|---|---|---|---|
| (a) | **PlatformKit + `collectToTreasury(asset,amount,app_id,category)`** | Mỗi instance/module đăng ký Registry = **1 caller `collectToTreasury`** cắt `protocol_cut_bps` vào Treasury → **mỗi instance/module = 1 nguồn cầu LAMP mới**. App-factory + Registry của SuperApp trực tiếp sinh cầu. | `LAMP/PlatformKit/CONTRACT.md`; `LAMP/Treasury/CONTRACT.md` |
| (b) | **C4 Holding Registry** (lock LAMP trong UTxO, one-LAMP-one-DID) | DID khoá LAMP để tính voting power → governance khoá LAMP khỏi lưu hành (có cap chống tập trung). | `LAMP/Governance/VotingPower/CONTRACT.md` |
| (c) | **C2 ScheduleGen** (lock LAMP forward ~24 epoch) | Cam kết LAMP forward → khoá tạm thời. | `LAMP/Governance` (C2) |

> Phạt stake (module/instance vi phạm) → **chuyển Treasury (kế toán), KHÔNG đốt** (LAMP cố định 36 tỷ). Reserve nhả linear vào Treasury, không ra thẳng thị trường. → Vòng giá trị: instance/module đăng ký → phí qua `collectToTreasury` (LAMP vào Treasury, tier 3) + C4 lock LAMP cho governance + C2 lock forward. **Nguồn cầu LAMP tỷ lệ thuận tăng trưởng số instance/module** — đây là lời giải cho AS7 (LAMP không thành token Treasury tĩnh). Conservation/số cuối → Math chứng minh (Feat nêu cơ chế + intent).

### Pricing structure
| Tier | Target user | Pricing logic | Capability |
|---|---|---|---|
| Instance lắp ráp | P6/P3 | Phí platform (RANGE — số cuối ở Math/founder); tích hợp = caller `collectToTreasury` (tier 3) | Lắp từ template + module |
| Module publish | P4 | Stake LAMP bond cho quyền nhạy cảm; đăng ký = caller `collectToTreasury` | Đăng ký Registry + nâng trust-tier |
| Host adopt | P5 | Cấu hình jurisdiction-aware | Substrate có-khả-năng-tuân-thủ |

> Hard Rule 7: số tham số cụ thể (phí, bond) = RANGE only; số cuối ở Math/founder.

### Unit economics (target)
| Metric | Target |
|---|---|
| CAC | [NEEDS-EVIDENCE] |
| LTV | [NEEDS-EVIDENCE] |
| LTV:CAC | ≥3 — **ngưỡng mục tiêu chuẩn ngành (benchmark, KHÔNG phải dự phóng)**; chỉ kiểm chứng được khi có CAC/LTV thật (FZ-08) |
| Gross margin | [NEEDS-EVIDENCE] |
| Payback period | [NEEDS-EVIDENCE] |

> Chi phí app-factory KHÔNG biến mất — đây là chi phí **VẬN HÀNH** per-instance (support + trust-safety + moderation + DAO hậu kiểm), dịch sang phí platform + template/agency, vẫn O(số instance) theo bảng "Cấu trúc bậc chi phí" §2. Moat chi phí chỉ áp cho chi phí **PHÁT TRIỂN/xây nền** (rơi xuống O(1)+O(module)+O(config)). Hai bậc độc lập, không mâu thuẫn. Cần mô hình hoá TCO thật cả hai bậc trước Gate-out. [NEEDS-EVIDENCE]

### Tokenomics intent
- **LAMP**: cố định 36 tỷ, KHÔNG burn; stake bị phạt → chuyển Treasury (kế toán), không đốt. **Demand-sink nội sinh ĐÃ CÓ CƠ CHẾ** (§8.2, fold Q8): (a) PlatformKit + `collectToTreasury` — mỗi instance/module đăng ký = 1 caller cắt phí vào Treasury = nguồn cầu LAMP mới; (b) C4 Holding Registry lock LAMP cho voting power; (c) C2 lock forward. → LAMP bắt giá trị từ tăng trưởng platform, KHÔNG thành token Treasury tĩnh (giải AS7).
- **MAGIC**: phí mạng nội bộ; sàn không-thể-zero; calibrate theo tài nguyên thực (Tier 1, §8.1).
- Conservation goals + số cuối (`protocol_cut_bps`, cap C4) → Math chứng minh (Feat nêu cơ chế + intent).

### Cost structure (target)
| Item | Variable/Fixed | Per-user cost target |
|---|---|---|
| Hạ tầng store/compute (VN localization) | Variable | [NEEDS-EVIDENCE] |
| Trust-safety + DAO hậu kiểm | Fixed/Variable | [NEEDS-EVIDENCE] |
| Pháp lý (per chủ quyền) | Phân tán sang adopter | — |

### Break-even
[NEEDS-EVIDENCE: số instance/user cần để break-even — phụ thuộc baseline founder]

### §8.3 Data Ownership Policy
| # | Câu hỏi | Trả lời |
|---|---|---|
| 1 | Ai là data owner? | User (qua PhoenixKey DID pseudonymous). **Controller model (PLATFORM-MASTER INV-1/INV-3)**: identity-core của cư dân một chủ quyền = **controller trong-tài-phán đó** (residency thật, sovereign-shard); Magiclamp = **data processor / protocol operator** vận hành federation trung lập, KHÔNG phải controller toàn cục. Dữ liệu hành vi mỗi instance có controller riêng. |
| 2 | Platform license scope? | Revocable, per-purpose; KHÔNG chảy ngang trừ consent per-host tường minh |
| 3 | Data portability? | Một DID = một nguồn dữ liệu xuyên host (INV-1); export [NEEDS-EVIDENCE: format] |
| 4 | Deletion procedure? | PII off-chain erasable thật; on-chain chỉ hash/commitment (crypto-shred pointer) — INV-3 |
| 5 | Third-party sale/sharing? | KHÔNG bán; chia sẻ chỉ qua consent per-purpose; host ngoài không kế thừa consent |

### §8.4 Ethics & Social Impact
- **Digital divide**: thiết kế cực-yếu ngang cực-mạnh từ đầu (P1) — chống loại trừ nông dân/máy yếu; gate accessibility + thiết bị thấp.
- **Chủ quyền dữ liệu**: jurisdiction-aware đặt quyền + trách nhiệm pháp lý vào tay chủ quyền adopt, không dồn lên một bên.
- **Bias risk**: federation trung lập không thiên vị host nào. Identity-core KHÔNG tập trung vào 1 controller toàn cục: theo INV-1/INV-3 (Master), identity-core **sovereign-shardable** — controller là chủ quyền trong-tài-phán, Magiclamp chỉ là processor/protocol operator. Rủi ro quyền lực còn lại = ai vận hành protocol federation; mitigation = governance 2 tầng + protocol mở/trung lập (không nắm controller toàn cục).
- **Bền vững**: chi phí biên per-DID phủ bởi sàn phí mạng; tránh race-to-zero làm xói hạ tầng.

---

## §9. Regulatory Matrix

| Jurisdiction | Regulation | Articles/Phạm vi | Impact | Required action | Owner | Source |
|---|---|---|---|---|---|---|
| VN (Phase 1) | PDPL — Luật 91/2025/QH15 (hiệu lực 01/01/2026) | Dữ liệu sinh trắc/vị trí = nhạy cảm (Art. 31); quyền xoá; thông báo vi phạm 72h | PII/sinh trắc off-chain VN, erasable; on-chain chỉ hash | Founder (luật sư VN) + SG3 | [E3] |
| VN (Phase 1) | NĐ 356/2025/NĐ-CP (thay NĐ 13/2023, hiệu lực 01/01/2026) | Hướng dẫn PDPL; **chuyển dữ liệu xuyên biên giới (cross-border transfer)** | Xác định vị trí store/validator (trong/ngoài VN) — nếu PII/sinh trắc rời VN = kích hoạt trần phạt cross-border (xem §9.1) | Founder (luật sư VN) | [E4] |
| VN (Phase 1) | Khung trung gian thanh toán (NĐ 52/2024) + cấm crypto-làm-payment | Phí B2C, token | Phí B2C qua PSP; LAMP/MAGIC chỉ phí mạng nội bộ | Founder (luật sư fintech) + SG5 | [E9] [NEEDS-URL: NĐ 52/2024] |
| VN (Phase 2) | Luật trung gian/SLA takedown (Decree 147) | Registry permissionless; gỡ nội dung | Safety-multisig takedown tách khỏi DAO; pháp nhân vận hành rõ | Founder | [NEEDS-URL: Decree 147] |
| Apple (phân phối) | App Store Review Guideline 4.2.6 + 4.7 + 2.5.2 | One-binary aggregated/picker; registry mini-app; cấm tải code | Config KHÔNG nạp executable code; index + moderation cho mini-app | SG1/SG2 | [E1][E2] |
| Sandbox | NQ 05/2025 (sandbox fintech) | Thử nghiệm có kiểm soát | Tận dụng trước khi bật billing per-feature | Founder | [NEEDS-URL: NQ 05/2025] |

**Compliance scope freeze**: Math/Tech chỉ implement cho jurisdiction CÓ trong bảng. VNeID/Quyết định 940 = case đặc biệt, KHÔNG permissionless. Phát hiện thiếu → escalate Feat.

### §9.1 Cấu trúc phạt PDPL — đính chính phạm vi (FZ-03)

> **Đính chính**: trần "tới 5% doanh thu năm trước" của PDPL 91/2025 là trần **RIÊNG cho vi phạm chuyển dữ liệu xuyên biên giới (cross-border transfer)**, KHÔNG phải trần chung cho mọi vi phạm PII/sinh trắc. Gán nhầm cấp điều khoản là rủi ro thật — sửa attribution ở đây và §15 AS4.

| Loại vi phạm | Trần phạt hành chính | Liên quan thiết kế ta |
|---|---|---|
| **Chuyển dữ liệu xuyên biên giới trái phép** | từ VND 3 tỷ **đến 5% doanh thu năm trước** | Đây là lý do giữ PII/sinh trắc **trong VN**: nếu store/validator đặt ngoài VN → kích hoạt trần 5%. Vị trí store = quyết định Q5. |
| **Mua-bán dữ liệu cá nhân trái phép** | tới **10× lợi bất chính thu được** | Củng cố "KHÔNG bán dữ liệu" (§8.3 #5) |
| **Vi phạm khác (gồm xử lý sai PII/sinh trắc nhạy cảm)** | tối đa **VND 3 tỷ** | Off-chain erasable + capability default-deny giảm bề mặt vi phạm |

> Mức cụ thể theo cấp độ tổ chức/cá nhân + tình tiết — luật sư VN xác nhận trước LOCK §9. Số trần lấy từ [E3] (Art. 8 cấu trúc phạt đa-tầng) + verify WebSearch 2026-06-17 (securiti/conventus/tilleke). [NEEDS-EVIDENCE: điều/khoản gazette chính xác]

> Hard Rule 8: text luật hiện hành đã verify qua WebSearch 2026; điều khoản chi tiết (data localization sinh trắc cụ thể, cấp phạt từng hành vi) cần luật sư VN xác nhận [NEEDS-EVIDENCE].

---

## §10. IP Strategy

| Asset | Posture | Lý do | Risk if leaked |
|---|---|---|---|
| Lớp federation (INV-1) + data fabric | Trade secret + defensive publication | Là moat thật; nhưng cần prior art chống bị patent chặn | Mất lợi thế first-mover |
| SDK + Integration Standard | **Open** (SDK cho mọi team Cardano) | Mục tiêu hệ sinh thái: mở để team cắm module | Thấp — mở là chủ đích |
| Module manifest schema + capability model | Open standard | Khuyến khích adoption; chuẩn hoá an toàn | Thấp |
| Design token set | Open/shared | Module chỉ tiêu thụ token | Thấp |
| Brand "MagicLamp"/"Aladin" | Trademark | Chống impersonation (co-brand kênh 3) | Giả mạo |

### Defensive publication
Cân nhắc công bố lớp federation (INV-1 + thin-client/outbox pattern) làm prior art (W3C DID / IETF) để chống bị patent chặn. [NEEDS-EVIDENCE: kênh công bố cụ thể]

### License compatibility check
| Dependency | License | Conflict? | Action |
|---|---|---|---|
| RN 0.84.1 | MIT | No | — |
| PhoenixKey / LAMP / MAGIC | [NEEDS-EVIDENCE] | [NEEDS-EVIDENCE] | Verify trước LOCK |
| Aiken (escrow Work) | [NEEDS-EVIDENCE] | [NEEDS-EVIDENCE] | Verify |

> Audit whitepaper LAMP/MAGIC: kiểm marketing có ngụ ý kỳ vọng tăng giá/đầu tư không (bảo toàn lập luận utility-token). [NEEDS-EVIDENCE]

---

## §11. Stakeholder Map

### MECE list
| Stakeholder | Role | Value cho ta | Value từ ta | Decision power |
|---|---|---|---|---|
| Founder (Aladin) | Owner + quyết chiến lược | Vision, vốn, quan hệ | — | Cao nhất |
| User cuối (P1/P2) | Tiêu thụ | Adoption, dữ liệu (consent) | Dịch vụ liên thông, một danh tính | Bỏ phiếu chân |
| Admin instance (P3) | Lắp/vận hành | Instance live | Bảng cấu hình không-code | Trung bình (experience only) |
| Dev cộng đồng (P4) | Cung module | Module mới, mở rộng | SDK + tiếp cận user xuyên instance | Trung bình (qua DAO) |
| Chủ quyền/tổ chức (P5) | Host adopt | Phân phối + tính pháp lý | Substrate tuân thủ | Cao trong jurisdiction họ — **là controller identity-core của cư dân mình** (sovereign-shard, INV-1/3); không xung đột với Magiclamp vì Magiclamp = processor/protocol operator, KHÔNG controller toàn cục |
| PhoenixKey/Long (backend) | Cung identity issuer | EdDSA/JWKS, DID | Consumer integration | Cao (blocker Phase 2) |
| DAO + safety-multisig | Governance | Hậu kiểm + takedown | Kill-switch, trust-tier | 2 tầng (kỹ thuật ⟂ giá trị) |
| PSP | Xử lý dòng tiền B2C | Tuân khung thanh toán | Volume giao dịch | Trung bình |

> **Giải xung đột chủ-quyền vs controller (FZ-04, theo PLATFORM-MASTER INV-1/INV-3 v0.2)**: trước đây §8.3 ghi "identity lõi = 1 controller (Magiclamp)" — căng với "P5 quyền cao trong jurisdiction". Lời giải chính thức từ Master: **INV-1 là nhất-quán LOGIC, không tập trung VẬT LÝ**. "Single source of truth" = một *view dữ liệu nhất quán per DID*, KHÔNG bắt buộc một kho PII toàn cầu. Identity-core **sovereign-shard**: dữ liệu cư dân một chủ quyền lưu trong-tài-phán đó, federate qua protocol. Khi luật chủ quyền đòi data residency identity-core / cấm controller ngoài → đặt shard trong tài phán, **controller = chủ quyền đó**, Magiclamp vận hành protocol federation (neutral processor). Mô hình PULL KHÔNG gãy. → trục controller-residency đã có lời giải kiến trúc (sovereign-shard), không còn là Q-founder mở; Q5 (vị trí store) vẫn cần luật sư xác nhận triển khai cụ thể per-jurisdiction.

### Decision Rights
| Decision area | Decides | Consults | Informs |
|---|---|---|---|
| Pháp nhân Registry + safety-multisig | Founder | Luật sư VN | DAO |
| Gỡ module vì lỗ hổng (kỹ thuật) | Ủy ban DID-gate | Reputation system | Cộng đồng |
| Chính sách (giá trị) | DAO một-người-một-phiếu | — | Founder |
| Vị trí store/validator | Founder | Luật sư VN | SG3 |
| Controller + residency identity-core per-jurisdiction | Chủ quyền adopt (P5) trong tài phán họ | Founder + luật sư địa phương | Magiclamp (protocol operator) |

### Value flow
```
User (DID + consent) ──► Fabric (store/token) ──► Instance/Host (thin client)
        ▲                       │                         │
        └──── dịch vụ liên thông ┘   phí nền tảng/mạng ────┘
PSP ──► founder (settlement B2C, platform không cầm tiền)
```

---

## §12. GTM Phasing

### Phase plan (dependency-driven, NOT calendar-driven)
| Phase | Name | Goal | Feature subset | Exit criteria (trigger) | Status |
|---|---|---|---|---|---|
| P1 | App-factory (kênh 1+2) | Sản xuất instance ta sở hữu | FG1-FG4, FG5(F5.1-5.3), FG7, FG8(F8.1-8.3) | ≥2 instance live (Aladin+TonFarm); INV-1/SEC pass Math; CI thiết bị thấp/3G + accessibility xanh; **F8.3 cần ProofChat spec sẵn (outbound dependency — §6/§13/AS8)** | not_started |
| P2 | Embedding host (kênh 3) | Acquisition qua host ngoài | F3.5, F3.6, Embed-SDK, F8 trên ≥3 kênh | issuer EdDSA/JWKS sẵn (Long); ≥1 host đối tác notice-period; safety-multisig + pháp nhân rõ | blocked-by-issuer-EdDSA + blocked-by-legal-entity |

> Hard Rule 2: KHÔNG Q-dates. Phase advance qua trigger.

### Channel strategy
| Phase | Channel | Mô hình |
|---|---|---|
| P1 | Kênh 1 (tab trong instance MagicLamp) + Kênh 2 (app độc lập) | App-factory; brand-strip về app chủ |
| P2 | Kênh 3 (nhúng host: Zalo/VNeID/…) | PULL — host tự adopt; co-brand bắt buộc |

### KPI per phase
| Phase | North star | Guard rails |
|---|---|---|
| P1 | Số instance live + DID active xuyên ≥2 instance | KHÔNG vi phạm INV-1/2/SEC; không mất dữ liệu offline (P1) |
| P2 | Số DID acquire qua host ngoài | Credential/biometric KHÔNG vào WebView; value ở fabric |

### §12.3 Phase 0 Hard Gates (novel-tech)
- **[Gate A] — Config declarative đủ biểu đạt instance thật mà KHÔNG cần Turing-complete.** Pass: lắp được ≥2 instance khác nhau chỉ bằng config+module, không config nào cần eval/script. Fail → re-scope app-factory (nhiều thứ phải thành module hơn dự kiến).
- **[Gate B] — INV-1 enforce được qua thin-client + durable outbox trên thiết bị yếu/offline.** Pass: ghi offline ở P1 không mất dữ liệu sau host kill runtime. Fail → pivot sync model.
- **[Gate C] — Dòng tiền B2C qua PSP hợp pháp + LAMP/MAGIC chỉ phí mạng.** Pass: luật sư fintech VN xác nhận + sandbox NQ 05/2025. Fail → hoãn billing per-feature. [NEEDS-EVIDENCE]

### §12.4 Exit / Pivot Criteria
| Trigger | Condition | Action | Reversal? |
|---|---|---|---|
| Config cần Turing-complete để dùng được | Gate A fail | Pivot: dịch logic sang module | Có |
| Host đối tác từ chối co-brand/notice-period | Không host nào đồng ý | Scope-cut: hoãn kênh 3, dồn app-factory | Có |
| Luật sư VN xác định cross-border transfer kích hoạt rủi ro cao | Vị trí store/validator | Pivot-tech: localize hạ tầng VN | Có |
| Issuer EdDSA/JWKS không sẵn (Long) | Blocker Phase 2 | Block P2, tiếp tục P1 | Có (khi sẵn) |

---

## §13. Cross-Spec Contracts

### Upstream Module Dependencies (what we INHERIT)
| Upstream | Provides | Used in | Version compat |
|---|---|---|---|
| PhoenixKey | PersonDID, signatures, issuer EdDSA/JWKS | F3.x, F5.1, federation | issuer-side EdDSA/JWKS [NEEDS-EVIDENCE: version] |
| AladinWork | Task/Jem/Flow/Eye, escrow | F8.1 | Feat+Math R1.5 |
| OriLifeTrace | TreeReID/FruitID | F8.2 | LIVE |
| ProofChat | E2EE MLS | F8.3 | CHƯA có spec chính tắc |
| LampNetCloud | Join nghiệp vụ | F8.4 | DRAFT (~35%) |
| **LampNet Data Sovereignty** | Cưỡng chế data residency: shard placement theo vùng (Mirage) + dispatch (Splash) + governance residency + **proof-of-residence** | INV-3 residency, §8.3, §11 (controller per-jurisdiction) | **CHƯA CÓ — dependency risk** (xem dưới) |
| LAMP/MAGIC | Token, ví, phí mạng + Treasury `collectToTreasury` + C2/C4 lock (demand-sink §8.2) | F5.x, §8.2 | Distribution live Preview |
| orilife-mobile-app | Nền RN đa-module, offline-first | F2.2, F3.3, F4.x | RN 0.84.1 |

> **Dependency risk — LampNet Data Sovereignty (phân lớp cứng)**: Cưỡng chế data residency (đặt PII/identity-core shard trong tài phán + chứng minh proof-of-residence) **KHÔNG phải SuperApp tự spec** — đây là năng lực của **LampNet fabric** (Mirage placement + Splash dispatch + governance residency). SuperApp SG3 chỉ đặc tả mặt **TIÊU THỤ** (configure policy + consume). HIỆN TRẠNG: LampNet mới có **móng** (region tag, `preferred_region` *hint* không enforce, `pin_region` đánh dấu "v2") — CHƯA có policy engine / enforcement / governance residency / proof-of-residence (`Splash-Feat.md`, `Mirage-Feat.md`, `Onboarding.md`). → **Dependency risk thật**: nếu LampNet không bổ sung "Data Sovereignty" module thì INV-3 residency không cưỡng chế được ở tầng fabric, chỉ còn cấu hình mềm. Đã yêu cầu team LampNet spec module này (draft `_team-messages/LampNetCloud-DataSovereignty.md`). Trạng thái: **outbound dependency, đã yêu cầu**.

### Downstream Consumers (what we PROVIDE)
| Downstream | What we provide | Format |
|---|---|---|
| Module cộng đồng (P4) | SDK + manifest contract + capability broker | SDK/library + JSON-Schema |
| Instance (P3/P6) | Host player + config schema + design token | Binary + JSON config |
| Host ngoài (P5, Phase 2) | Embed-SDK + federation token | Library + token audience-bound |

### Feat → Math (params + properties)
- Chứng minh 4 invariant: INV-1 (**nhất quán LOGIC per-DID, KHÔNG tập trung vật lý — identity-core sovereign-shardable**), INV-2 (data⟂experience), INV-3 (PII erasable + chủ quyền; controller = chủ quyền per-tài-phán, Magiclamp = processor/protocol operator; **cưỡng chế residency = năng lực LampNet, SuperApp chỉ tiêu thụ**), INV-SEC (config declarative thuần) — **TRƯỚC khi viết bất kỳ SG nào**. Math phải chứng minh INV-1 hội tụ trên mô hình sharded (federate qua protocol) + dưới multi-device merge (FZ-02: F1.5/F3.8). Residency placement/proof KHÔNG chứng minh trong Math SuperApp — thuộc LampNet (dependency).
- Params (RANGE từ Feat, số cuối ở Math): phí platform, stake bond LAMP, sàn phí mạng MAGIC, ngưỡng trust-tier.
- Threat model: host hostile-by-default; config-RCE; confused-deputy xuyên host; Sybil DID.

### Feat → Tech (NFR + integration)
- NFR derive từ §5: offline-first + 3G + thiết bị thấp; durable outbox; idempotency + version vector.
- Data residency từ §9: store/PII tại VN; on-chain chỉ hash.
- Integration: API versioned (thin client), Embed-SDK adapter per-host, runtime broker capability default-deny.
- License compat từ §10.

### Feat → Exec (delivery)
- Priority MoSCoW (§6); Phase plan dependency-driven (§12).
- External hard constraints (evidence-based): PDPL/NĐ 356 hiệu lực 01/01/2026 [E3][E4]; Apple 4.2.6/4.7/2.5.2 [E1][E2]; blocker issuer EdDSA (Long).
- Parallel: 8 SG fan-out song song; Math SG3(INV-1)+SG1 trước.

---

## §14. Open Questions

| ID | Question | Owner | Deadline | Blocker for | Status |
|---|---|---|---|---|---|
| Q1 | Pháp nhân vận hành magiclamp.network Registry là ai (ký, chịu SLA takedown, liên kết Treasury)? | Founder | Trước thiết kế governance | SG governance, Phase 2 | **RESOLVED** |
| Q2 | Safety-multisig đặt quyền vào tay ai; cơ chế chống lạm dụng? | Founder | Trước Registry live | SG governance | **RESOLVED** |
| Q3 | Quan hệ VNeID: federation hay cạnh tranh; PhoenixKey đứng ở đâu? | Founder | Trước nhánh B-VNeID | F3.x, Phase 2 | Open |
| Q4 | Phase 1 nhúng host nào trước (đối-tác-được, không host thù địch cấu trúc)? | Founder | Trước Phase 2 | Phase 2 channel | Open |
| Q5 | Vị trí pháp lý store/validator (trong/ngoài VN)? | Founder + luật sư VN | Trước chọn hạ tầng | SG3, §9 | Open |
| Q6 | Chấp nhận trải nghiệm phân tầng theo kênh (mini-app = phễu, không parity)? | Founder | Trước Embed-SDK | Phase 2 | Open |
| Q7 | Audit whitepaper LAMP/MAGIC — có marketing ngụ ý đầu tư? | Founder | Trước public | §8 tokenomics, §10 | Open |
| Q8 | Demand-sink nội sinh cho LAMP (staking/escrow)? | Founder | Trước LOCK §8 | §8 tokenomics | **RESOLVED** |
| Q9 | Baseline scale thật (user/instance Phase 1)? | Founder | Trước Gate-out Math | §3, §5 | Open |
| Q10 | Vị trí giấy phép PSP cụ thể cho dòng tiền B2C? | Founder + luật sư fintech | Trước billing per-feature | F5.3, §9 | Open |

### §14.1 Câu trả lời các Q đã RESOLVED (fold KNOWLEDGE §H — nguồn LAMP/PhoenixKey)

- **Q1 — RESOLVED**: Pháp nhân vận hành = **MagicLamp Foundation** (3 hội đồng: Điều hành / Thành viên / Hiến pháp, bầu cộng đồng). Token phát hành bởi **GreenSun + Aladin — pháp nhân VN, KHÔNG offshore**. Ra mắt đầy đủ + DAO dự kiến **2026-09-27** (Genesis 2026-06-18). Nguồn: `LAMP/Tokenomics/SPEC.md`. LAMP = utility/governance token (classification cuối chờ luật sư VN — KHÔNG chặn code/spec).
- **Q2 — RESOLVED**: Safety-multisig = **Treasury multi-sig council + time-lock**. Tách khỏi DAO chính sách (governance 2 tầng: kỹ thuật ⟂ giá trị). Quyết trọng yếu cần ≥21 DID; sàn Byzantine clamp ΣVP/21 (không DID nào >4.76% voting power). Nguồn: `LAMP/Governance/VotingPower/CONTRACT.md`. Cơ chế chống lạm dụng = time-lock + ngưỡng multi-sig + tách tầng.
- **Q8 — RESOLVED**: Demand-sink nội sinh = (a) PlatformKit + `collectToTreasury` (mỗi instance/module = 1 caller cắt phí vào Treasury), (b) C4 Holding Registry lock LAMP cho voting power, (c) C2 lock forward. Chi tiết cơ chế ở §8.2. LAMP bị hút khỏi lưu hành (chuyển trạng thái, KHÔNG burn) tỷ lệ thuận tăng trưởng platform.

---

## §15. Assumptions Register

| ID | Assumption | Basis (confidence) | Risk if false | Validate when |
|---|---|---|---|---|
| AS1 | Apple 4.2.6/4.7 cho phép one-binary aggregated/picker + registry mini-app với config declarative | H — verified guidelines 2026 [E1][E2] | App bị reject; sập kênh phân phối | Trước submit |
| AS2 | Config declarative đủ biểu đạt instance thật mà không cần Turing-complete | M — SDUI có tiền lệ nhưng instance ta phức tạp hơn | Phải dịch nhiều thành module; chậm app-factory | Gate A |
| AS3 | Issuer-side PhoenixKey EdDSA/JWKS sẽ sẵn (Long); PhoenixKey bổ sung device-revocation-list chi tiết cho F3.9 | M — ngoài tầm sửa của ta; recovery core (guardian 2/3 + 50 ADA + timelock 7 ngày + sequence-monotonic) ĐÃ CÓ, GAP = device-revocation-list | Block Phase 2 federation host ngoài; F3.9 thiếu danh sách thu hồi tường minh | Trước Phase 2 |
| AS4 | PII/sinh trắc off-chain tại VN + on-chain chỉ hash là đủ tuân PDPL | M — cần luật sư xác nhận data localization sinh trắc cụ thể | Vi phạm xử lý sinh trắc/PII: tới VND 3 tỷ; nếu PII rời VN (cross-border) → trần tới 5% doanh thu năm trước (§9.1) [E3] | Q5 + luật sư VN |
| AS5 | Host walled-garden sẽ tự adopt vì lợi ích gia tăng (PULL) | L — chưa kiểm chứng thị trường | Kênh 3 không có host nào adopt | Phase 2 pilot |
| AS6 | Phí B2C qua PSP né được khung trung gian thanh toán | M — cần luật sư fintech | Vướng pháp lý dòng tiền | Gate C, Q10 |
| AS7 | LAMP có demand-sink nội sinh đủ để bắt giá trị | **M↑ — cơ chế ĐÃ CÓ (§8.2, Q8 RESOLVED): PlatformKit `collectToTreasury` + C4 lock + C2 lock; còn lại là định lượng đủ-hay-không (Math)** | LAMP thành token Treasury tĩnh (rủi ro giảm — cơ chế tồn tại) | Math (định lượng `protocol_cut_bps`, cap C4) |
| AS8 | Module nghiệp vụ (Work/Trace/Chat) đủ chín để tích hợp | M — Work/Trace chạy thật; Chat chưa có spec chính tắc (Phase 1 kéo theo ProofChat spec, đã yêu cầu) | F8.3 phải dày hơn; chậm | Trước F8.x |
| AS9 | LampNet bổ sung "Data Sovereignty" module (placement + proof-of-residence) để cưỡng chế INV-3 residency | L — LampNet mới có móng (region tag/hint), CHƯA có policy engine/enforcement | INV-3 residency không cưỡng chế ở tầng fabric, chỉ cấu hình mềm | LampNet spec module (đã yêu cầu team) |

> Top-3 lowest-confidence (= top-3 risk): AS5 (PULL chưa kiểm chứng), **AS9 (LampNet Data Sovereignty CHƯA có — dependency risk)**, AS3 (issuer EdDSA ngoài tầm). AS7 (demand-sink LAMP) **đã hạ rủi ro** sau Q8 RESOLVED (cơ chế tồn tại; còn định lượng ở Math).

---

## §16. References

| ID | Source | URL (VERIFIED) | Accessed | Used in |
|---|---|---|---|---|
| E1 | Apple App Store Review Guidelines — 4.2.6 (template/super app, aggregated/picker model) | https://developer.apple.com/app-store/review/guidelines/ | 2026-06-17 | §0, §2, §6, §9, AS1 |
| E2 | Apple App Store Review Guidelines — 4.7 (mini apps/plug-ins) + 2.5.2 (no code download) | https://developer.apple.com/app-store/review/guidelines/ | 2026-06-17 | §0, §6, §9, AS1 |
| E3 | Vietnam PDPL — Law No. 91/2025/QH15 (hiệu lực 01/01/2026), dữ liệu sinh trắc nhạy cảm | https://www.tilleke.com/insights/vietnams-new-personal-data-protection-law-a-closer-look/ | 2026-06-17 | §2, §8.3, §9, AS4 |
| E4 | Decree 356/2025/NĐ-CP (thay NĐ 13/2023, hiệu lực 01/01/2026) | https://cms-lawnow.com/en/ealerts/2025/09/demystifying-vietnam-s-new-laws-regulating-data-and-navigating-key-compliance-for-businesses | 2026-06-17 | §5, §9 |
| E5 | Zalo Mini App (70M+ user VN; host walled-garden) | https://miniai.vn/zalo-mini-app/ | 2026-06-17 | §2, §3 |
| E6 | VNeID super-app + Mini App nhà nước (Quyết định 940) | [NEEDS-URL: văn bản Quyết định 940/VNeID 2026-2030] | — | §3, §7 |
| E7 | Server-Driven UI (Airbnb) — tiền lệ production | [NEEDS-URL: Airbnb engineering SDUI] | — | §3, §6 |
| E8 | Server-Driven UI (Lyft) — tiền lệ production | [NEEDS-URL: Lyft engineering SDUI] | — | §3, §6 |
| E9 | NĐ 52/2024 trung gian thanh toán + cấm crypto-làm-payment | [NEEDS-URL: NĐ 52/2024 chính thức] | — | §5, §8, §9 |

> Hard Rule 1: E6–E9 chưa verify URL primary source → [NEEDS-URL]. E1–E5 verified 2026-06-17.

---

## §17. Change Log

| Version | Date | Author | Changes | Trigger |
|---|---|---|---|---|
| v0.3 | 2026-06-17 | Banzi | Fold lời giải thật từ code/spec hệ sinh thái (KNOWLEDGE §H — kèm file:line). **§8 Business Model**: thêm §8.1 (phí 3 tầng: Tier 1 MAGIC mạng · Tier 2 app-level vd 7% · Tier 3 `protocol_cut_bps` Treasury) + §8.2 (demand-sink Q8: PlatformKit `collectToTreasury` mỗi instance/module = 1 caller cắt phí vào Treasury = nguồn cầu LAMP; C4 Holding lock one-LAMP-one-DID; C2 lock forward — LAMP HÚT khỏi lưu hành, KHÔNG burn); cập nhật Tokenomics intent + Pricing structure. **§14 Open Questions**: Q1/Q2/Q8 → **RESOLVED** + §14.1 câu trả lời (Q1 MagicLamp Foundation, phát hành GreenSun+Aladin pháp nhân VN, ra mắt 2026-09-27; Q2 Treasury multi-sig council + time-lock + ≥21 DID + Byzantine clamp ΣVP/21; Q8 demand-sink). **F8.3 Chat**: GIỮ Must + dependency tường minh "Phase 1 kéo theo ProofChat spec (đã yêu cầu)" — giải FZ-11, hết nợ-spec-ẩn. **Sovereignty/residency phân lớp**: §7 Non-goals thêm "không tự cưỡng chế residency (inherit LampNet)" + "không tự định nghĩa recovery/rotation (inherit PhoenixKey)"; §13 thêm LampNet Data Sovereignty = external dependency (CHƯA CÓ → dependency risk AS9, đã yêu cầu team); §13 Feat→Math ghi residency placement/proof thuộc LampNet. **FZ-02 recovery**: F3.7/F3.9 INHERIT cơ chế PhoenixKey (guardian 2/3 + 50 ADA + timelock 7 ngày + sequence-monotonic, states Active/Recovering/Migrated/Revoked); AC cập nhật; GAP device-revocation-list ghi trung thực. **§15**: AS7 hạ rủi ro (cơ chế demand-sink đã có); thêm AS9 (LampNet residency); cập nhật AS3 (GAP device-revocation) + top-3 risk. | Fold KNOWLEDGE §H (lời giải thật từ /LAMP /MAGIC /PhoenixKeyDID /LampNetCloud) + PLATFORM-MASTER v0.2 (INV-3 residency = dependency LampNet) |
| v0.2 | 2026-06-17 | Banzi | Vá Round 1 Faza. **FZ-01**: thêm bảng "Cấu trúc bậc chi phí" §2 (derivation O(số app)→O(1)+O(module)+O(config), Hard Rule 9) + hoà giải §8 (phân biệt chi phí PHÁT TRIỂN giảm vs VẬN HÀNH dịch chỗ). **FZ-02**: thêm F3.7 (recovery DID device-loss), F3.8 (multi-device merge), F3.9 (rotation/revocation) — đều Must; nâng F1.5 mergePolicy Should→Must; AC Given/When/Then cho recovery/merge/rotation; cập nhật P1 pain+JTBD+success. **FZ-03**: đính chính trần 5% = RIÊNG cross-border transfer (thêm §9.1 bảng cấu trúc phạt; sửa §2, §9, §15 AS4). **FZ-04**: phản ánh INV-1 nhất-quán-LOGIC + identity-core sovereign-shardable + controller per-chủ-quyền (Master v0.2) — sửa §8.3 #1, §8.4, §11 (P5 decision power + note giải xung đột + decision-right controller-residency), §13 Feat→Math, §18-A. **NORMAL**: FZ-05 (tách success P4 ≥2 kênh Phase 1/≥3 Phase 2; F1.4), FZ-06 (phân định build-time⟂runtime §6 intro), FZ-07 (edge config rỗng/0 module AC F2.2), FZ-08 (nhãn LTV:CAC = benchmark), FZ-09 (đẩy "flush onHide/onUnload" khỏi AC F3.1 xuống Tech). | Faza review ledger Round 1 (CONDITIONALLY_APPROVED, 4 HIGH) |
| v0.1 | 2026-06-17 | Banzi | Khởi tạo Feat-Spec L1. Phản ánh re-scope v2: DATA-FEDERATION = lõi đột phá; 3 kênh phân phối; PULL + sovereign compliance; app-factory không-dev (khẩu hiệu chỉnh); 6 personas; 8 feature group ↔ SG1-8; 4 invariant tham chiếu; business model fabric + PSP + demand-sink LAMP. | PLATFORM-MASTER v0.2 + EXPANSION-ANALYSIS (GO-có-điều-kiện) |

---

## §18. Appendices

- **A. Invariant tham chiếu** (ràng buộc Feat, chứng minh ở Math): INV-1 (nhất quán LOGIC per-DID, identity-core sovereign-shardable, host = thin client), INV-2 (data⟂experience), INV-3 (PII erasable + chủ quyền; controller per-tài-phán, Magiclamp = processor), INV-SEC (config declarative thuần). Nguồn: PLATFORM-MASTER §2 v0.2.
- **B. Ánh xạ Feature Group ↔ Spec Group**: FG1↔SG1, FG2↔SG2, FG3↔SG3, FG4↔SG4, FG5↔SG5, FG6↔SG6, FG7↔SG7, FG8↔SG8.
- **C. Ba kênh phân phối**: (1) tab trong instance MagicLamp; (2) app độc lập; (3) nhúng host ngoài (Phase 2).
- **D. Quyết định kiến trúc nguồn** (QĐ-1..QĐ-8): EXPANSION-ANALYSIS §4 — tham chiếu, không duplicate.

---

## Document Metadata

| Field | Value |
|---|---|
| Status | DRAFT |
| Scope level | L1 Platform |
| Applicability type | A (platform infrastructure) |
| Predecessor | PLATFORM-MASTER.md v0.2 |
| Math-Spec ref | (chưa có — fan-out sau APPROVED) |
| Tech-Spec ref | (chưa có) |
| Exec-Spec ref | (chưa có) |
| Platform deps | PhoenixKey, LAMP/MAGIC, AladinWork R1.5, OriLifeTrace LIVE, ProofChat, LampNetCloud, RN 0.84.1 |
| Publishing target | Internal (default) |
| Author | Banzi — 2026-06-17 |
| Reviewers (AI) | Faza Round 1 (CONDITIONALLY_APPROVED, 4 HIGH) → vá v0.2 → fold lời giải thật v0.3; chờ Faza Round 2 + format-checker + bias-checker |
| Reviewers (internal) | (chờ Founder review 3 vòng) |
| External reviewer | N/A (đề xuất: luật sư VN data + fintech khi LOCK §9) |
| Approver | (chờ Founder + Tech Lead) |

---

## Self-review (Banzi)

Đội mũ adversary, em tự thấy 10 điểm yếu/giả định rủi ro:

1. **Lệch giữa EXPANSION-ANALYSIS và văn bản Apple thật.** Phân tích nội bộ ghi "4.2.6 cho phép one-binary aggregated/picker". Verify thật (2026-06-17): 4.2.6 đúng là cho phép picker model, NHƯNG phần mini-app/registry nằm ở **4.7** (cập nhật 11/2025), với điều kiện thêm: phải có index + universal links + moderation + age-gate (4.7.1-4.7.5). Em đã tách E1 (4.2.6) ⟂ E2 (4.7+2.5.2) cho đúng. Rủi ro: kênh 3 registry mini-app gánh nghĩa vụ moderation/index của Apple mà spec chưa đặc tả — cần SG1 xử lý.

2. **Toàn bộ §3 (TAM/SAM/SOM) + §5 (scale) trống số.** Đây là điểm yếu lớn nhất: Feat-Spec gate-out sang Math yêu cầu "scale có con số cụ thể". Hiện chưa có baseline launch nên em chọn [NEEDS-EVIDENCE] thay vì bịa (Hard Rule 3). Q9 phải giải trước Gate-out.

3. **Unit economics + break-even trống.** "App-factory không-dev" có rủi ro ngụy biện chi phí (rủi ro #10 trong analysis). Em đã ghi chi phí dịch sang phí platform/template/DAO, nhưng chưa mô hình hoá TCO thật → §8 chưa đủ để chứng minh viability.

4. **AS5 (PULL chưa kiểm chứng) = giả định nền nhưng confidence L.** Toàn bộ luận điểm kênh 3 dựa trên "host tự adopt vì lợi ích gia tăng". Chưa có một host nào xác nhận. Nếu sai, Phase 2 (acquisition) không có đầu vào. Đây là rủi ro chiến lược lớn nhất.

5. **AS7 (demand-sink LAMP) — ĐÃ GIẢI CƠ CHẾ (v0.3).** Mục tiêu hệ sinh thái = làm LAMP có giá trị. Q8 RESOLVED: cơ chế demand-sink ĐÃ TỒN TẠI trong hợp đồng LAMP — PlatformKit `collectToTreasury` (mỗi instance/module = 1 caller cắt phí vào Treasury), C4 Holding lock, C2 lock forward (§8.2, fold KNOWLEDGE §H). App-factory + Registry của SuperApp trực tiếp sinh cầu LAMP tỷ lệ thuận tăng trưởng. Rủi ro CÒN LẠI = định lượng (`protocol_cut_bps`, cap C4 đủ hay không) — thuộc Math, không còn là "chưa thiết kế".

6. **Phụ thuộc ngoài tầm kiểm soát (AS3, issuer EdDSA/JWKS — Long).** Phase 2 federation host bị block bởi backend PhoenixKey mà Claude KHÔNG được sửa. Lịch trình Phase 2 không nằm trong tay đội platform.

7. **Q1/Q2 (pháp nhân Registry + safety-multisig) — ĐÃ GIẢI (v0.3).** Tử huyệt #2 trong analysis được tháo: pháp nhân = **MagicLamp Foundation** (3 hội đồng, bầu cộng đồng); phát hành **GreenSun + Aladin pháp nhân VN**; ra mắt + DAO **2026-09-27**; safety-multisig = **Treasury multi-sig council + time-lock** tách khỏi DAO chính sách; quyết trọng yếu ≥21 DID, Byzantine clamp ΣVP/21 (§14.1, fold KNOWLEDGE §H). Governance Phase 2 không còn treo ở tầng pháp nhân. Chi tiết governance/phí ở `/LAMP` + `/MAGIC`.

8. **VNeID (Q3) định đoạt cả một nhánh nhưng chưa rõ.** Em đặt VNeID = federate-VỚI, không cạnh tranh (theo analysis). Nhưng nếu nhà nước bắt buộc danh tính gốc từ VNeID/CCCD, vị trí PhoenixKey DID sinh trắc độc lập trở nên mơ hồ. E6 (Quyết định 940) chưa có URL primary — chỉ dựa trên analysis nội bộ.

9. **Regulatory §9 dựa nhiều vào nguồn thứ cấp (law firm blogs).** PDPL/NĐ 356 verified qua WebSearch nhưng điều khoản chi tiết (data localization sinh trắc cụ thể, ngưỡng phạt chính xác) cần luật sư VN xác nhận. NĐ 52/2024, Decree 147, NQ 05/2025, Quyết định 940 = [NEEDS-URL] primary chưa có.

10. **Rủi ro quyền lực ở tầng vận hành protocol federation (đã giải phần controller — FZ-04).** v0.1 ghi "identity lõi tập trung 1 controller (Magiclamp)" — Master v0.2 đã giải: INV-1 nhất-quán-LOGIC không tập trung vật lý, identity-core **sovereign-shardable**, controller = chủ quyền per-tài-phán, Magiclamp = processor/protocol operator. Nên KHÔNG còn "controller toàn cục" để bị ép. Rủi ro **còn lại** = bên vận hành protocol federation (neutral) bị ép/tấn công; mitigation = governance 2 tầng + protocol mở + sovereign-shard (data residency trong tài phán). Vẫn cần Math chứng minh INV-1 hội tụ trên mô hình sharded — đã đưa vào §13 Feat→Math.

11. **Dependency LampNet Data Sovereignty CHƯA CÓ (v0.3, AS9 = top-3 risk mới).** Cưỡng chế residency (placement shard theo vùng + proof-of-residence) là năng lực **LampNet**, KHÔNG phải SuperApp tự spec — đã phân lớp đúng (§7 Non-goals, §13 dependency, INV-3 Master). NHƯNG LampNet hiện mới có **móng** (region tag, `preferred_region` hint không enforce), CHƯA có policy engine/enforcement/governance residency. → Nếu LampNet không bổ sung module này, INV-3 residency chỉ còn cấu hình mềm, không cưỡng chế ở tầng fabric. Đã yêu cầu team LampNet (draft `_team-messages/LampNetCloud-DataSovereignty.md`). Rủi ro thật, ngoài tầm sửa của SuperApp.

12. **GAP device-revocation-list trong PhoenixKey (v0.3).** F3.9 rotation/revocation INHERIT recovery PhoenixKey (guardian 2/3 + 50 ADA + timelock 7 ngày + sequence-monotonic — đã có). Nhưng PhoenixKey CHƯA có **device-revocation-list chi tiết** → revoke per-khoá qua sequence có, danh sách thiết bị thu hồi tường minh = thiếu. Báo Long, không tự định nghĩa (Hard Rule 4). AS3 đã ghi.

### Danh sách [NEEDS-EVIDENCE] / [NEEDS-URL] tổng hợp

**[NEEDS-EVIDENCE]** (số liệu/data cần founder/khảo sát):
- §2: TCO per app thật; mức phân mảnh dữ liệu định lượng; tỷ lệ thiết bị thấp/3G (khảo sát HTX).
- §3: toàn bộ TAM/SAM/SOM; đối thủ gián tiếp khu vực (Gojek/Line).
- §5: user scale Phase 1/2; data scale; ma trận thiết bị mục tiêu.
- §8: CAC/LTV/gross margin/payback/break-even; TCO app-factory; export format data portability.
- §9: data localization sinh trắc cụ thể (luật sư VN); vị trí giấy phép PSP.
- §10: license PhoenixKey/LAMP/MAGIC/Aiken; kênh defensive publication; audit whitepaper token.
- §13: version compat issuer EdDSA/JWKS; LampNet "Data Sovereignty" module (placement + proof-of-residence) — CHƯA CÓ, đã yêu cầu team (DEP-1/AS9); PhoenixKey device-revocation-list chi tiết cho F3.9 — CHƯA CÓ, báo Long (DEP-2).

> **Đã giải v0.3 (không còn [NEEDS-EVIDENCE])**: §8 demand-sink LAMP (Q8 — cơ chế PlatformKit `collectToTreasury` + C4 + C2, KNOWLEDGE §H); §14 pháp nhân + safety-multisig (Q1/Q2 — MagicLamp Foundation + Treasury multi-sig + time-lock). Số định lượng (`protocol_cut_bps`, cap C4) chuyển sang Math, KHÔNG phải evidence-gap Feat.

**[NEEDS-URL]** (primary source chưa verify):
- E6: Quyết định 940 / VNeID 2026-2030.
- E7: Airbnb SDUI engineering.
- E8: Lyft SDUI engineering.
- E9: NĐ 52/2024 chính thức.
- §9: Decree 147; NQ 05/2025.
- §6.X: Figma wireframes/design system/tokens/prototype; repo orilife-mobile-app.

**[NEEDS-DECISION]** (= §14 Open Questions còn mở: Q3-Q7, Q9, Q10 — owner = Founder). **Đã giải v0.3**: Q1, Q2, Q8 → RESOLVED (§14.1).

### Đóng FZ Round 1 (Faza) — trạng thái sau v0.3

> v0.3 KHÔNG mở FZ mới từ review; v0.3 = fold lời giải thật (KNOWLEDGE §H) → giải 3 Open Question (Q1/Q2/Q8 RESOLVED), đóng FZ-11, mở 2 dependency-risk (DEP-1/DEP-2 ngoài tầm sửa SuperApp).

**ĐÃ ĐÓNG (4 HIGH)**:
- **FZ-01** ✓ — thêm bảng "Cấu trúc bậc chi phí" §2 (derivation Hard Rule 9), tách chi phí PHÁT TRIỂN (giảm xuống O(1)+O(module)+O(config)) khỏi chi phí VẬN HÀNH (vẫn O(số instance), chỉ dịch chỗ). §8 trỏ ngược §2, hết căng với "chi phí không biến mất".
- **FZ-02** ✓ — F3.7 recovery + F3.8 multi-device merge + F3.9 rotation/revocation (đều Must); F1.5 mergePolicy nâng Should→Must; 4 khối AC Given/When/Then; P1 persona cập nhật. Giới hạn đã biết (ghi offline chưa đồng bộ trước khi mất máy = mất) nêu trung thực, không che.
- **FZ-03** ✓ — §9.1 mới: 5% = trần RIÊNG cross-border transfer; mua-bán trái phép tới 10× lợi bất chính; vi phạm khác tới VND 3 tỷ. Sửa attribution §2/§9/§15-AS4. Verify lại WebSearch 2026-06-17 (securiti/conventus/tilleke) — khớp.
- **FZ-04** ✓ — phản ánh lời giải Master v0.2: INV-1 nhất-quán-LOGIC (không tập trung vật lý), identity-core sovereign-shardable, controller = chủ quyền per-tài-phán, Magiclamp = processor/protocol operator. Xoá xung đột P5-decision-power vs central-controller ở §8.3/§8.4/§11/§13/§18.

**ĐÃ ĐÓNG (NORMAL, sửa rẻ)**: FZ-05 (success P4 tách phase), FZ-06 (phân định build-time⟂runtime), FZ-07 (edge config rỗng), FZ-08 (nhãn benchmark LTV:CAC), FZ-09 (đẩy flush onHide/onUnload khỏi AC Feat xuống Tech).

**ĐỂ LẠI (NORMAL, có lý do)**:
- **FZ-10** — chờ luật sư VN điền điều/khoản gazette + URL primary cho PDPL/NĐ 356. Đã đánh dấu [NEEDS-EVIDENCE]; chỉ nâng khi LOCK §9. KHÔNG bịa URL/điều khoản (Hard Rule 1).
- **FZ-11** ✓ ĐÃ ĐÓNG (v0.3) — Founder chốt hướng: F8.3 GIỮ **Must** + "Phase 1 KÉO THEO team ProofChat sản xuất ProofChat spec" (đã yêu cầu, draft `_team-messages/ProofChat-SpecRequest.md`). Dependency tường minh ghi ở F8.3 + ghi chú dưới bảng FG8. Hết nợ-spec-ẩn trong lane Feat.

**MỞ MỚI (v0.3, dependency-risk — ngoài tầm sửa SuperApp)**:
- **DEP-1** (= AS9) — LampNet Data Sovereignty CHƯA CÓ. Cưỡng chế residency thuộc LampNet (đã phân lớp đúng); LampNet mới có móng. Đã yêu cầu team. Treo tới khi LampNet spec module.
- **DEP-2** (= AS3 GAP) — PhoenixKey CHƯA có device-revocation-list chi tiết cho F3.9. Recovery core đã có (INHERIT). Báo Long.

> Các founder-question FQ-A..FQ-H giữ nguyên ở §14 — Faza xác nhận đã đánh dấu đúng [NEEDS-EVIDENCE]/[NEEDS-DECISION], KHÔNG phải lỗi tác giả, không sửa.
