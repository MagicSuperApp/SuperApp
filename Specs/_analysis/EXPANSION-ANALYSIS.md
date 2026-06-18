# PHÂN TÍCH MỞ RỘNG TẦM VÓC — APP-FACTORY (A) & NHÚNG HOST NGOÀI (B)

> **Cho**: Aladin (founder) · **Ngày**: 2026-06-17 · **Trạng thái**: Tổng hợp 8 trục đã qua phản biện đối kháng
> **Phạm vi**: hai tham vọng A (app-factory không-dev) và B (nhúng tính năng vào host ngoài), trên nền kiến trúc 3 lớp + 2 bất biến INV-1/INV-2.
> **Nguyên tắc**: bám spec đã chốt (PLATFORM-MASTER v0.1, KNOWLEDGE §F/G). Rủi ro REFUTED đã loại; rủi ro hạ cấp đã ghi mức điều chỉnh. Không bịa số/URL.

---

## 1. Luận điểm đột phá — hướng này có thật sự breakthrough không

**Có, nhưng đột phá nằm ở DATA-FEDERATION, không ở app-factory hay UI.** Lõi thật sự khác biệt là INV-1: một PhoenixKey DID = một nguồn dữ liệu xuyên mọi host. Đây là thứ host walled-garden (Zalo/Shopee/VNeID) về cấu trúc KHÔNG thể clone — clone nó nghĩa là tự bỏ chính moat walled-garden của mình. Mọi host có thể sao chép một tính năng (truy xuất nông sản, chat E2EE) trong một quý; không host nào tạo được mạng danh tính trung lập xuyên-host. App-factory one-binary config-driven là đòn bẩy CHI PHÍ thật (biến chi phí phát triển từ O(số app) xuống O(số module)+O(config), có tiền lệ production SDUI Airbnb/Lyft), nhưng nó là *lợi thế tốc độ*, không phải *hào phòng thủ*. Tham vọng B (nhúng host ngoài) nên được hạch toán là **kênh ACQUISITION**, không phải trụ doanh thu: value luôn ở lại tầng ecosystem fabric (DID + token + store), host chỉ là "kính hiển thị". Kết luận: hướng đi đúng về first-principles, nhưng giá trị bền vững dồn vào một điểm — lớp federation trung lập — chứ không trải đều khắp khẩu hiệu marketing.

---

## 2. Phán quyết GO / GO-CÓ-ĐIỀU-KIỆN / NO-GO

### Tham vọng A — App-factory không cần đội dev: **GO-CÓ-ĐIỀU-KIỆN**

Khả thi về kỹ thuật (SDUI có tiền lệ production, nền RN 0.84.1 đa-module đủ điều kiện), hợp pháp (Apple 4.2.6 bản 2026 CHO PHÉP one-binary aggregated/picker model — rủi ro "remote code" đã REFUTED), và đúng về unit economics (produce-once / distribute-N). Điều kiện sống còn:

1. **Khoá cứng bất biến config = declarative thuần, KHÔNG Turing-complete.** Không eval, không script trong theme tokens, không template engine có quyền truy cập code, billing hook = công thức đóng do platform định nghĩa. Đây là điều kiện số 1 — buông là sập toàn bộ luận điểm bảo mật.
2. **Registry permissionless phải kèm sandbox + trust-tier + kill-switch trung tâm.** Đăng ký tự do ≠ truy cập data/wallet/biometric tự do. Module mới = reputation 0, sandbox hạn quyền tối đa, không chạm SG3/SG5 cho tới khi qua hậu kiểm + đạt ngưỡng stake.
3. **Tách phán quyết kỹ thuật khỏi phán quyết giá trị trong DAO** (ủy ban chuyên môn DID-gate cho gỡ-vì-lỗ-hổng; một-người-một-phiếu cho chính sách).
4. **Đổi khẩu hiệu** từ "không cần đội dev" → "không cần đội dev RIÊNG cho phần lắp ráp chuẩn" — chi phí dịch sang phí platform + hệ template/agency + DAO hậu kiểm, không biến mất.

### Tham vọng B — Nhúng tính năng vào host ngoài: **GO-CÓ-ĐIỀU-KIỆN (hẹp)**

Khả thi cho **feature lát mỏng + handoff sang app native**, KHÔNG khả thi cho parity native-đầy-đủ trong WebView. Điều kiện:

1. **Coi B là ACQUISITION, không phải value-capture.** Data/DID/token luôn ở fabric; host chỉ là cửa sổ. Mỗi module phải sống được trên ≥3 kênh để không host nào có đòn bẩy độc quyền.
2. **Chỉ nhúng tính năng DỌC host thiếu** (truy xuất nông sản, chứng cứ lao động), TUYỆT ĐỐI không nhúng tính năng NGANG cạnh tranh lõi host. Bỏ điều kiện "vượt trội tính năng cũ của host" → đổi thành "lấp khe host không phủ".
3. **VNeID là CASE ĐẶC BIỆT, không phải host thường.** Quan hệ nhà nước tuyển chọn (Quyết định 940 — VNeID super-app, Mini App theo chuẩn API nhà nước), federate VỚI VNeID làm root-of-trust pháp lý, KHÔNG cạnh tranh eID. Tách hẳn khỏi giả định permissionless. Loại bỏ mọi narrative "PhoenixKey thay thế eID nhà nước" khỏi spec (rủi ro pháp lý thật).
4. **Threat model: mọi host hostile-by-default.** Credential/biometric/DID gốc KHÔNG BAO GIỜ vào WebView host; chỉ phát token audience-bound, sống-ngắn, sender-constrained, ký trong app gốc/passkey.
5. **Phase 1 chọn 1-2 host ưu tiên** (host có quan hệ đối tác/notice-period được), không hứa "Zalo+Shopee+Facebook+VNeID cùng lúc".

> **Không có NO-GO toàn cục**, nhưng có NO-GO cục bộ: (a) nhúng parity-đầy-đủ lõi native vào WebView; (b) PhoenixKey cạnh tranh trực diện lớp eID công dân với VNeID; (c) đặt PII/sinh trắc raw on-chain.

---

## 3. TOP 10 rủi ro (đã hiệu chỉnh sau phản biện)

| # | Trục | Rủi ro | Sev (đã chỉnh) | Likelihood | Mitigation lõi | Ai chịu trách nhiệm |
|---|---|---|---|---|---|---|
| 1 | security · governance | **Config trở thành Turing-complete** (template/SSTI injection → RCE xuyên mọi instance + xuyên INV-1). Tiền lệ 2025-2026: expression injection no-code, cụm SSTI templating | **CRITICAL** | HIGH | Config JSON-Schema validated, cấm template engine truy cập code, cấm free-form JSON sink, billing hook = công thức đóng; bịt riêng tầng theme-token | Orchestrator (Math-Spec SG1+SG7); enforce runtime ở host player |
| 2 | governance · legal | **Permissionless registry đụng luật trung gian (Decree 147 SLA gỡ 24h); DAO không phải pháp nhân → pháp nhân vận hành + Treasury thành bị đơn** (tiền lệ Ooki/bZx) | **CRITICAL** | HIGH | Safety-multisig takedown khẩn cấp tách khỏi vote DAO; pháp nhân vận hành rõ; DAO chỉ quyết dài hạn | Founder (chọn pháp nhân) + Orchestrator (SG governance) |
| 3 | security | **Module độc hại live trước hậu kiểm** (cửa sổ zero-day xã hội: ví giả, impersonation do brand-strip, thu thập dữ liệu lén) | **HIGH** | HIGH | Gate tự động (static scan capability), code-signing, sandbox trust-tier, stake LAMP bond + time-lock cho quyền nhạy cảm, kill-switch | Orchestrator (SG1/SG6); DAO + auto-monitor |
| 4 | legal · data | **Cross-border transfer + quyền xoá vs on-chain** (PDPL 91/2025 + NĐ 356/2025, phạt tới 5% doanh thu; sinh trắc = nhạy cảm). Foreign-access cũng tính transfer | **HIGH** | HIGH | On-chain CHỈ hash/commitment; PII+sinh trắc off-chain tại VN, erasable; DID pseudonymous; consent per-host; INV-3 "mọi PII erasable" | Founder (luật sư VN xác định vị trí store/validator) + Orchestrator (SG3) |
| 5 | competitive | **VNeID tự thành super-app + identity + wallet + Mini App** (Quyết định "VNeID 2026-2030"); nuốt mặt trận eID + host VNeID | **HIGH** | HIGH | Federate VỚI VNeID làm root-of-trust; làm Mini App TRONG VNeID (đảo vai); phòng thủ = trung lập xuyên-host-tư-nhân, không phải "loại dữ liệu ngách" | Founder (quyết định chiến lược) |
| 6 | competitive · business | **Phụ thuộc host — cắt API/đổi điều khoản giết kênh B** (tiền lệ Twitter/Reddit/Meta cắt API); brand-strip xoá đường rút | **MEDIUM** (chỉnh từ CRITICAL) | HIGH | ≥3 kênh độc lập; value ở fabric; **bỏ brand-strip ở kênh nhúng → bắt buộc co-brand "powered by"**; notice-period với host đối tác | Orchestrator (SG1 normative: co-brand kênh 3) |
| 7 | security · legal | **Federation HS256→JWKS chưa xong phía issuer; confused-deputy/identity-confusion xuyên host** | **HIGH** | HIGH (consumer đã có nửa) | Token audience-bound (host-id+module-id+device)+nonce+hạn ngắn; kiểm caller-id BẤT BIẾN ở mọi ranh giới; issuer-side mint EdDSA + /.well-known/jwks.json | Long (PhoenixKey backend — Claude KHÔNG sửa) + Orchestrator (SG3 consumer) |
| 8 | legal · business | **Phí token / ví chung chạm khung trung gian thanh toán + cấm crypto làm payment** (NĐ 52/2024 + Luật CNS 2025) | **MEDIUM** | MEDIUM | Tách dòng tiền: phí dịch vụ qua PSP có giấy phép, settlement PSP→founder (platform KHÔNG cầm/chia tiền); token CHỈ chi phí mạng nội bộ; tận dụng sandbox NQ 05/2025 | Founder (luật sư fintech) + Orchestrator (SG5) |
| 9 | governance · competitive | **DAO hậu kiểm vô quyền gatekeeping ở kênh nhúng** (Apple Guideline 4.7/1.2 + WeChat/Zalo tiền kiểm); content-Sybil bằng DID thật thuê | **HIGH** | HIGH | Governance 2 chế độ theo kênh; embed-SDK mang sẵn moderation đạt chuẩn host; đòn bẩy còn lại = thu hồi DID/token qua fabric; trọng số tín hiệu theo chi-phí-cứng (MAGIC) | Orchestrator (SG governance + Embedding Standard) |
| 10 | ux · business | **"Không cần dev" là ngụy biện chi phí** (dịch sang config-authoring/support/trust-safety/pháp chế); UI tệ do non-dev đẩy cực thấp ra khỏi sản phẩm | **HIGH** / MEDIUM | HIGH | KHÔNG canvas tự do — chỉ theme tokens + template đã kiểm định adaptive 2 cực + sắp xếp module; gate kiểm thử ma trận thiết bị thấp/3G + accessibility TRƯỚC khi template khả dụng; mô hình hoá TCO thật | Orchestrator (SG4) + Founder (định giá phí phủ TCO) |

> **3 tử huyệt** (nếu không giải = sập tham vọng): #1 (config Turing-complete), #2 (pháp nhân/SLA takedown), #4 (PII on-chain + cross-border). Ba cái này phải khoá thành invariant Math-Spec TRƯỚC khi viết bất kỳ SG nào.

---

## 4. Quyết định kiến trúc bắt buộc

**QĐ-1 — Host player one-binary config-driven, config DECLARATIVE thuần.**
Một app-binary nạp config lúc chạy (1 app, N config). Config schema phải non-Turing-complete (JSON-Schema validated, whitelist kiểu dữ liệu, không eval/script/template-engine-có-code). Bất kỳ nhu cầu "logic riêng" = phải thành MODULE mới qua registry (chịu gate bảo mật), KHÔNG lẻn vào tầng config. Refactor nav từ hard-import sang registry config-driven, giữ default bundle nhúng binary làm fallback offline. → Khoá vào Math-Spec SG1 như invariant.

**QĐ-2 — INV-1 là invariant của STORE, không của mọi runtime.**
Phát biểu lại chính xác: "store DID là single source of truth; mọi host (kể cả app native của ta) là CLIENT ghi qua API versioned có idempotency key + version vector, KHÔNG phải replica có quyền uy". Client KHÔNG BAO GIỜ ghi data layer trực tiếp — backend là điểm hội tụ duy nhất, validate schema, từ chối/chuẩn hoá. → SG3. Hệ quả: INV-1 enforceable cả ở kênh nhúng (host kill runtime cũng không vỡ vì host chỉ là thin client + durable outbox).

**QĐ-3 — Hai tầng dữ liệu pháp lý, mọi PII erasable (INV-3 mới).**
On-chain CHỈ chứa hash/commitment/pointer — KHÔNG BAO GIỜ PII hay sinh trắc raw. PII + sinh trắc nằm off-chain trong store đặt tại VN (data localization), xoá thật được. DID = pseudonymous identifier. Consent per-host tường minh (host ngoài không kế thừa consent host khác). Tách controller: identity lõi do 1 controller (Magiclamp) giữ; dữ liệu hành vi mỗi instance thuộc controller riêng, KHÔNG chảy ngang trừ consent per-purpose. → SG3 + cross-contract SG7.

**QĐ-4 — Permissionless ĐĂNG KÝ ≠ permissionless TRUY CẬP.**
Tách 4 quyền: (a) đăng ký module — tự do; (b) cài vào instance — admin chọn / DAO blacklist; (c) chạm shared-data/wallet/biometric — sandbox default-deny, chỉ mở sau hậu kiểm + stake; (d) đặt phí — trong khoảng DAO-bound (min/max guard-rail), billing-hook chạy backend có audit-log bất biến. Capability model cưỡng chế bằng runtime broker (per-call, default-deny), KHÔNG bằng quy ước. Kill-switch trung tâm qua registry. → SG1 + SG5.

**QĐ-5 — Federation: token audience-bound, ký trong app gốc; phân hạng LoA.**
Bằng chứng danh tính sinh + ký TRONG app PhoenixKey gốc (secure enclave/passkey) hoặc QR challenge-response; host chỉ nhận token phạm-vi-tối-thiểu, sống-ngắn, audience-bound (host-id + module-id + device + nonce), sender-constrained (DPoP). Bind DID qua bước "claim" một lần bằng kênh mạnh, KHÔNG auto-bind bằng phone host. Phân hạng LoA: chỉ DID sinh trắc gốc mới có quyền governance/thu phí; DID liên kết host ngoài LoA thấp chỉ được dùng tính năng. **Chặn cứng**: cần issuer-side PhoenixKey mint EdDSA + JWKS (thuộc Long, Claude KHÔNG sửa). → SG3, blocker cho B.

**QĐ-6 — Ranh giới phí: tách dòng tiền, token = phí mạng nội bộ.**
Phí dịch vụ thương mại đi qua PSP có giấy phép, settlement PSP→founder trực tiếp, platform CHỈ nhận phí nền tảng của mình (KHÔNG tự cầm/chia tiền — né khung trung gian thanh toán). LAMP/MAGIC CHỈ chi cho tài nguyên mạng nội bộ (gas/storage/compute), KHÔNG dùng định giá-thanh toán dịch vụ B2C (né cấm crypto-làm-payment). Sàn phí mạng MAGIC không-thể-zero (chống race-to-zero + phủ chi phí biên per-DID), calibrate theo tài nguyên thực, không flat. → SG5. Bắt buộc tư vấn luật sư fintech VN + tận dụng sandbox NQ 05/2025 trước khi bật billing per-feature.

**QĐ-7 — Governance 2 tốc độ + 2 tầng + 2 chế độ kênh.**
2 tốc độ: takedown khẩn cấp tập trung (safety-multisig, đáp ứng SLA luật) ⟂ hậu kiểm DAO dài hạn. 2 tầng phán quyết: kỹ thuật (ủy ban DID-gate + reputation, bằng chứng tái lập) ⟂ giá trị (một-người-một-phiếu). 2 chế độ kênh: kênh 1+2 (permissionless + DAO hậu kiểm đầy đủ) ⟂ kênh 3 (lớp-bổ-sung-dưới-luật-host, embed-SDK mang sẵn moderation chuẩn host). Stake bị phạt → chuyển Treasury (không burn, theo bất biến 36 tỷ). → SG governance.

**QĐ-8 — Brand: 2 chế độ tường minh.**
Kênh 1+2 (instance ta sở hữu) → brand-strip về app chủ (giữ nguyên §3 hiện tại). Kênh 3 (nhúng host) → ĐẢO chiều: nhận diện ta khiêm tốn, tuân chrome host, NHƯNG bắt buộc co-brand "powered by MagicLamp" tối thiểu (để user nhận ra + theo được khi rời host + chống impersonation). → sửa PLATFORM-MASTER §3: brand-strip KHÔNG áp lên kênh nhúng. Cam kết nhất quán xuyên kênh = nhất quán DỮ LIỆU + MÔ HÌNH TƯƠNG TÁC, bỏ nhất-quán-pixel.

---

## 5. Câu hỏi mở cần founder quyết

1. **Pháp nhân vận hành magiclamp.network Registry là ai** — ai ký, ai chịu SLA takedown 24h (Decree 147), Treasury liên kết pháp lý tới đâu? Đây là câu hỏi sống còn TRƯỚC mọi thiết kế governance.
2. **Safety-multisig đặt quyền vào tay ai** — tập trung điểm cưỡng chế cần thiết về pháp lý nhưng mâu thuẫn tinh thần phi-tập-trung. Ranh giới ở đâu, cơ chế chống lạm dụng (kill nhầm/kiểm duyệt)?
3. **Quan hệ với VNeID: federation hay cạnh tranh?** Nếu nhà nước bắt buộc danh tính gốc từ VNeID/CCCD, PhoenixKey DID sinh trắc độc lập đứng ở đâu — lớp phủ trên VNeID hay song song? Định đoạt toàn bộ nhánh B-VNeID.
4. **Phase 1 nhúng host nào trước?** Cam kết "Zalo+Shopee+Facebook+VNeID cùng lúc" là bất khả với ngân sách hữu hạn. Ưu tiên host đối-tác-được (đàm phán notice-period/co-brand) trước host thù địch cấu trúc (Facebook/Shopee cạnh tranh lõi).
5. **Vị trí pháp lý store/validator** (trong/ngoài VN) — quyết định cross-border transfer kích hoạt hay không. Cần luật sư VN xác nhận trước khi chọn hạ tầng. [NEEDS-EVIDENCE]
6. **Có chấp nhận trải nghiệm phân tầng theo kênh không** — mini-app nhúng chỉ là phễu lát mỏng + deep-link sang native cho thao tác nặng (ML/offline/sinh trắc), KHÔNG parity? Đây có bị coi là phá lời hứa "vượt trội host" không?
7. **Audit whitepaper/tài liệu LAMP/MAGIC** — có marketing nào ngụ ý kỳ vọng tăng giá/lợi nhuận không? Cần để bảo toàn lập luận "utility token, không phải instrument đầu tư" (cả MiCA lẫn VN). [NEEDS-EVIDENCE]
8. **Demand sink nội sinh cho LAMP** — staking mở instance/đăng ký module? Collateral escrow? Nếu không có, LAMP nguy cơ thành token Treasury tĩnh không bắt giá trị từ tăng trưởng platform.

---

## Phụ lục — Rủi ro REFUTED / hạ cấp mạnh (không còn là chặn)

- **Apple cấm one-binary "remote code" (technical-1)**: REFUTED. Apple 4.2.6 bản 2026 CHÍNH THỨC cho phép one-binary aggregated/picker model; 2.5.2 chỉ cấm download CODE, không cấm config declarative chọn module compile-sẵn. Chỉ cần 1 dòng spec cấm cứng "config không bao giờ nạp executable code".
- **INV-1 unenforceable trong host (data-architecture-1)**: REFUTED → LOW. INV-1 vốn đã là invariant của STORE; Zalo Mini App có onHide/onUnload + nativeStorage bền → outbox flush khả thi. Thin-client + durable outbox + idempotency là mẫu chuẩn.
- **Brand-strip xung đột host (experience-ux-1)**: REFUTED → LOW. Là gap scoping trong draft, không phải conflict; mục đích brand-subordination được host tự thoả mãn. Giải bằng QĐ-8.
- **Tam giác bất khả nhất quán 3 kênh (experience-ux-3)**: REFUTED → LOW. Headless logic + per-channel adapter là pattern công nghiệp; nhất quán ở tầng data+tương tác, không pixel.
- **HS256 chặn federation (technical-4)**: hạ CRITICAL→MEDIUM. Consumer ProofChat đã verify EdDSA qua JWKS; chỉ còn issuer-side (Long). Dependency lịch trình, không phải chặn thiết kế.
- **Conflict/merge xuyên host (data-architecture-5)**: hạ HIGH→LOW. Token/số dư settle on-chain (total order), ngoài đường offline-merge; phần còn lại là per-field CRDT đã giải production. Cần `merge_policy` bắt buộc trong module manifest.
- **Take-rate host nuốt margin (business-economic-1)**: hạ CRITICAL→MEDIUM. Apple 15% chỉ chạm digital-IAP; hàng vật lý/dịch vụ thực tế/crypto self-custody = 0%. Đẩy monetize sang lane on-chain/dịch vụ thực tế.
- **MiCA/e-money giết unit economics (business-economic-2, security-trust-8)**: hạ CRITICAL→MEDIUM. LAMP cố định không mint → không "offering"; utility-token-dịch-vụ-đang-chạy được miễn; regulated surface (token movement, biometric) centralize ở SG5/PhoenixKey, xin 1 giấy phép cho toàn platform. Vùng xám duy nhất: founder marketing token như primary sale.
