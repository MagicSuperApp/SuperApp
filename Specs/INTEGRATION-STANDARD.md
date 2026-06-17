# MagicLamp Platform Integration Standard

> **Mục đích**: Tài liệu chuẩn để Agent/dev của MỌI platform (ProofChat, OriLife, AladinWork, LampNetCloud, Farm, và module mới bất kỳ) nắm context + thực thi đúng, đảm bảo nhất quán khi cắm vào host shell (kênh 1+2) và khi nhúng host ngoài (kênh 3).
> **Cấp**: L1 Platform — Ecosystem-wide Standard.
> **Status**: DRAFT v0.1 — 2026-06-17.
> **Owner**: Aladin (founder) · Orchestrator giữ interface contract.
> **Nguồn chốt**: `PLATFORM-MASTER.md` (INV-1/INV-2, 8 Spec Group, 2 kiểu tích hợp), `BRAIN/KNOWLEDGE.md §F/G`, `_analysis/EXPANSION-ANALYSIS.md` (QĐ-1..QĐ-8).
> **Quan hệ với spec khác**: Tài liệu này là CONTRACT trừu tượng. Chi tiết hiện thực thuộc các Spec Group SG1..SG8. Khi mâu thuẫn, Math-Spec (invariant) thắng. KHÔNG duplicate nội dung cross-group — chỉ tham chiếu.

---

## 0. Mệnh đề nền (đọc trước khi code)

1. **Hào phòng thủ nằm ở DATA-FEDERATION, không ở UI hay app-factory.** INV-1 (1 DID = 1 nguồn dữ liệu xuyên mọi host) là thứ host walled-garden không thể clone. Mọi quyết định kỹ thuật phải bảo vệ điểm này trước.
2. **Config là DECLARATIVE thuần, KHÔNG BAO GIỜ Turing-complete** (QĐ-1). Cần "logic riêng" = phải thành MODULE mới qua Registry (chịu gate bảo mật), KHÔNG lẻn vào tầng config/theme/billing.
3. **Permissionless ĐĂNG KÝ ≠ permissionless TRUY CẬP** (QĐ-4). Đăng ký tự do; truy cập shared-data/wallet/biometric là default-deny, mở dần sau hậu kiểm + stake.
4. **Mọi host hostile-by-default** (QĐ-5). Credential/biometric/DID gốc KHÔNG BAO GIỜ vào WebView host ngoài.
5. **B (nhúng host ngoài) = kênh ACQUISITION, không phải value-capture.** Value luôn ở fabric. Mỗi module phải sống được trên ≥3 kênh.

> 3 tử huyệt phải khoá ở mọi tài liệu con: (a) config Turing-complete; (b) pháp nhân + SLA takedown; (c) PII/sinh trắc on-chain hoặc cross-border trái phép.

---

## 1. Module Manifest Contract

Mỗi module khai báo bằng MỘT file `module.manifest.json`, validate bằng JSON-Schema tại Registry **trước khi** được nạp. Manifest là declarative thuần — không nhúng code, không URL trỏ tới code tải động.

### 1.1 Cấu trúc tối thiểu

```jsonc
{
  "schemaVersion": "1.0",
  "moduleId": "orilife.trace",            // reverse-DNS, duy nhất toàn ecosystem
  "version": "2.3.1",                      // semver, dùng cho SG6 upgrade
  "displayName": { "vi": "Truy xuất", "en": "Trace" },
  "integrationKind": "feature",            // "silent" | "feature" (xem §1.3)

  // --- chỉ áp dụng khi integrationKind = "feature" ---
  "entrypoint": "TraceHomeScreen",         // tên screen đã compile-sẵn trong binary, KHÔNG phải đường dẫn tải động
  "route": "/trace",                       // route nội bộ trong navigation grammar (§7.1)
  "icon": "token:icon.trace",              // tham chiếu design token, CẤM nhúng asset thô màu cứng
  "navSlot": "primary",                    // "primary" (tab) | "secondary" (drawer/more) | "contextual"

  // --- quyền (capability) — default-deny, runtime broker cưỡng chế (§3.4, QĐ-4) ---
  "capabilities": {
    "data": ["read:profile", "write:trace.record"],   // scope hẹp; KHÔNG xin "*"
    "wallet": ["read:balance"],                         // chạm SG5 = trust-tier cao
    "biometric": [],                                    // rỗng cho module trust-tier thấp
    "network": ["fabric.api"],                          // chỉ gọi fabric API, KHÔNG free-form egress
    "host": []                                          // quyền yêu cầu host ngoài (kênh 3)
  },

  // --- declarative metadata cho merge offline (xem Phụ lục REFUTED data-architecture-5) ---
  "mergePolicy": "per-field-crdt",         // BẮT BUỘC: "lww" | "per-field-crdt" | "on-chain-total-order"

  // --- config schema + billing (§4) ---
  "configSchemaRef": "./config.schema.json",
  "billingHooks": ["trace.verify", "trace.export"],

  // --- embed (§5) — chỉ khai khi module hỗ trợ kênh 3 ---
  "embed": {
    "channels": ["zalo-miniapp", "web-iframe"],
    "surface": "thin-funnel",              // "thin-funnel" | "full" — full chỉ cho kênh ta sở hữu
    "deepLinkNative": "magiclamp://trace"  // handoff sang app native cho thao tác nặng
  },

  // --- trust & governance ---
  "trustTier": 0,                          // 0 = mới đăng ký (sandbox tối đa); nâng qua hậu kiểm
  "stakeBondLamp": "0",                    // LAMP bond cho quyền nhạy cảm (§6)
  "signature": "<code-signing sig>"        // ký bởi publisher; verify ở Registry
}
```

### 1.2 Quy tắc bất biến của manifest

- **CẤM** mọi trường chứa: biểu thức/template engine, đường dẫn tải executable, eval-able string, free-form JSON sink.
- `entrypoint` trỏ tới screen **đã compile-sẵn** trong host-player binary. Module mới muốn có screen mới = phải vào binary qua release SG6, KHÔNG nạp runtime (Apple 2.5.2 chỉ cấm tải CODE; config chọn module compile-sẵn được phép — xem Phụ lục technical-1).
- `capabilities` xin theo nguyên tắc tối thiểu. Registry từ chối manifest xin `*` hoặc scope rộng không tương xứng `trustTier`.
- `moduleId` + `version` là khoá định danh cho SG6 (versioning, migration, lan truyền nâng cấp).

### 1.3 Hai kiểu tích hợp (kế thừa PLATFORM-MASTER §3)

| Kiểu | `integrationKind` | Hiện diện | Hợp đồng |
|---|---|---|---|
| **Ngầm (silent)** | `silent` | Không chiếm UI; cung service API cho module khác | PhoenixKey, VeData, LAMP/MAGIC, LampNet. Khai `capabilities` + service API; KHÔNG khai `entrypoint`/`route`/`icon` |
| **Feature** | `feature` | Hiện thành tab/màn trong vỏ | ProofChat→Chat, OriLife→Trace, AladinWork→Work, Join, Farm. BẮT BUỘC khai `entrypoint`/`route`/`icon`/`navSlot` + tuân design system (§2) + navigation grammar (§7) |

---

## 2. Design Token + Brand-strip

### 2.1 Một bộ token — module chỉ TIÊU THỤ

- Tồn tại MỘT design token set cấp ecosystem (sở hữu bởi SG4). Module **chỉ tiêu thụ token**, KHÔNG định nghĩa giá trị màu/spacing/typography riêng.
- **CẤM hardcode màu** (hex/rgb/named color) trong code module. Lint rule chặn ở CI (xem §8). Mọi màu phải đi qua token, ví dụ `color.surface.primary`, `color.text.muted`, `color.accent`.
- Token phân lớp: `color.*`, `space.*`, `radius.*`, `type.*`, `elevation.*`, `motion.*`, `icon.*`. Theme per-instance chỉ override **giá trị token**, KHÔNG thêm token mới có khả năng inject (giá trị token là literal đã validate kiểu, KHÔNG phải expression — QĐ-1).
- Adaptive 2 cực (§7.2) là token-driven: cùng token, 2 profile giá trị (`lowEnd` / `rich`).

### 2.2 Brand-strip — 2 chế độ tường minh (QĐ-8, sửa PLATFORM-MASTER §3)

| Kênh | Chế độ brand | Quy tắc |
|---|---|---|
| **Kênh 1+2** (instance ta sở hữu: Aladin/TonFarm/app suy biến) | **Brand-strip về app chủ** | Module ẩn TOÀN BỘ thương hiệu/logo/màu/tên gốc. User chỉ thấy nhận diện app chủ. (giữ nguyên tinh thần §3 cũ) |
| **Kênh 3** (nhúng host ngoài: Zalo/Shopee/VNeID) | **ĐẢO chiều — co-brand bắt buộc** | Nhận diện ta khiêm tốn, tuân chrome host, NHƯNG BẮT BUỘC hiển thị "powered by MagicLamp" tối thiểu. Lý do: user nhận ra để theo được khi rời host + chống impersonation + giữ đường rút khi host cắt API. CẤM brand-strip toàn phần ở kênh nhúng. |

> Cam kết nhất quán xuyên kênh = nhất quán **DỮ LIỆU + MÔ HÌNH TƯƠNG TÁC**, KHÔNG phải nhất-quán-pixel. Headless logic + per-channel adapter là pattern bắt buộc.

---

## 3. Identity & Data Rules

### 3.1 PhoenixKey DID là root

- Danh tính = PhoenixKey DID (pseudonymous). Module KHÔNG redefine identity, chỉ tiêu thụ qua service API của PhoenixKey (silent module). Ký secp256k1/Ed25519; issuer-side đang chuyển HS256→JWKS bất đối xứng (EdDSA) — thuộc Long, **Claude KHÔNG sửa PhoenixKey backend**.
- Phân hạng **LoA (Level of Assurance)** (QĐ-5): chỉ DID sinh trắc gốc mới có quyền governance + thu phí; DID liên kết host ngoài (LoA thấp) chỉ được dùng tính năng.

### 3.2 INV-1 — Nhất quán dữ liệu xuyên host (invariant của STORE, QĐ-2)

- Phát biểu chính xác: **store DID là single source of truth; mọi host — kể cả app native của ta — là CLIENT** ghi qua API versioned có idempotency key + version vector. Client KHÔNG BAO GIỜ ghi data layer trực tiếp.
- Backend là điểm hội tụ duy nhất: validate schema, từ chối/chuẩn hoá. Host kill runtime cũng không vỡ INV-1 vì host = thin client + **durable outbox** (flush qua onHide/onUnload + nativeStorage bền).

### 3.3 Data layer ⟂ Experience layer (INV-2)

- Cái khác nhau giữa instance CHỈ nằm ở experience layer (module nào hiện, bố cục, brand, ngôn ngữ, config admin). Data layer KHÔNG đổi theo app.
- Mọi tuỳ biến admin chỉ tác động experience. Bất kỳ config nào chạm data layer = VI PHẠM, Registry/CI từ chối.

### 3.4 Hai tầng dữ liệu pháp lý (INV-3 mới, QĐ-3)

- **On-chain CHỈ chứa hash/commitment/pointer** — KHÔNG BAO GIỜ PII hay sinh trắc raw.
- PII + sinh trắc nằm off-chain trong store đặt tại VN (data localization), **erasable thật**.
- Consent **per-host tường minh** — host ngoài KHÔNG kế thừa consent của host khác. Tách controller: identity lõi do 1 controller giữ; dữ liệu hành vi mỗi instance thuộc controller riêng, KHÔNG chảy ngang trừ consent per-purpose.
- **Capability cưỡng chế bằng runtime broker** (per-call, default-deny), KHÔNG bằng quy ước. Mọi truy cập data/wallet/biometric đi qua broker kiểm `capabilities` trong manifest + `trustTier` + consent.

---

## 4. Config Schema + Billing Hook (phục vụ app-factory không-dev)

### 4.1 Config schema (declarative thuần — QĐ-1)

- Mỗi module khai `config.schema.json` (JSON-Schema). Đây là tập tham số mà người khởi nghiệp (non-dev) tuỳ biến khi lắp app: bật/tắt tính năng con, ngưỡng, nhãn, thứ tự, theme token override.
- **Whitelist kiểu dữ liệu**: `string`(có maxLength + pattern), `number`(min/max), `boolean`, `enum`, `array`(của các kiểu trên). CẤM: kiểu `object` free-form làm sink, string chứa expression/template, ref tới code.
- Mọi giá trị config validate **trước khi nạp** vào host-player. Giá trị ngoài schema = reject.
- "Logic riêng" KHÔNG được biểu diễn bằng config. Nếu instance cần hành vi mới = đặt một MODULE mới (qua Registry, chịu gate). Đây là ranh giới sống còn của luận điểm bảo mật.

Ví dụ `config.schema.json`:
```jsonc
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "enableExport":   { "type": "boolean", "default": false },
    "verifyThreshold":{ "type": "number", "minimum": 0, "maximum": 1, "default": 0.8 },
    "label":          { "type": "string", "maxLength": 40, "pattern": "^[\\p{L}\\p{N} ]+$" },
    "themeOverride":  { "$ref": "#/$defs/tokenOverride" }   // chỉ literal token, không expression
  }
}
```

### 4.2 Billing hook (điểm đo phí mỗi tính năng)

- Module khai các `billingHooks` = **điểm đo phí** (metering point) cho từng feature, ví dụ `trace.verify`, `chat.message`, `work.escrow.open`.
- **Billing hook = công thức ĐÓNG do platform định nghĩa** (QĐ-1/QĐ-4). Người khởi nghiệp chỉ chọn **mức phí trong khoảng DAO-bound** (min/max guard-rail), KHÔNG viết công thức tự do.
- Billing chạy **backend, audit-log bất biến** (per-call). Client không tự tính/tự thu.
- **Ranh giới dòng tiền** (QĐ-6): phí dịch vụ thương mại B2C đi qua **PSP có giấy phép**, settlement PSP→founder; platform KHÔNG tự cầm/chia tiền (né khung trung gian thanh toán NĐ 52/2024). **LAMP/MAGIC CHỈ chi cho tài nguyên mạng nội bộ** (gas/storage/compute), KHÔNG dùng định giá-thanh toán dịch vụ B2C (né cấm crypto-làm-payment). Sàn phí mạng MAGIC không-thể-zero (chống race-to-zero). Bắt buộc tư vấn luật sư fintech VN trước khi bật billing per-feature. **[NEEDS-EVIDENCE: vị trí giấy phép PSP cụ thể]**

---

## 5. Embed-SDK Contract cho host ngoài (kênh 3)

> Phạm vi: feature lát mỏng (thin-funnel) + handoff sang app native. **KHÔNG** parity native-đầy-đủ trong WebView (NO-GO cục bộ).

### 5.1 Federation danh tính (QĐ-5 — threat model: host hostile-by-default)

- Bằng chứng danh tính **sinh + ký TRONG app PhoenixKey gốc** (secure enclave/passkey) hoặc QR challenge-response. Credential/biometric/DID gốc **KHÔNG BAO GIỜ** vào WebView host.
- Host chỉ nhận **token phạm-vi-tối-thiểu, sống-ngắn**:
  - **audience-bound**: `host-id + module-id + device + nonce`.
  - **sender-constrained**: DPoP.
  - **không auto-bind bằng phone host** — bind DID qua bước "claim" một lần bằng kênh mạnh.
- Kiểm `caller-id` BẤT BIẾN ở mọi ranh giới (chống confused-deputy / identity-confusion xuyên host).
- **Chặn cứng (blocker cho B)**: cần issuer-side PhoenixKey mint EdDSA + `/.well-known/jwks.json` — thuộc Long, Claude KHÔNG sửa. Consumer-side (ProofChat) đã verify EdDSA qua JWKS.

### 5.2 Bề mặt API (surface)

- Embed-SDK lộ một bề mặt HẸP, ổn định, versioned: `init(config)`, `authenticate()`(trả token audience-bound), `invokeFeature(featureId, args)`, `openNative(deepLink)`, `emitEvent()`, `onLifecycle(onHide/onUnload)` (để flush durable outbox).
- Mọi gọi data đi qua fabric API (thin client), KHÔNG ghi data layer trực tiếp (INV-1).
- Mỗi platform có 1 adapter per host (`zalo-miniapp`, `web-iframe`, `shopee`, `vneid`) — headless logic dùng chung, adapter chỉ map UI/lifecycle host.

### 5.3 Sandbox

- Module trong host chạy sandbox: capability default-deny, chỉ mở scope khai trong `embed.host` + đã qua hậu kiểm.
- Egress hạn chế về fabric API; CẤM free-form network từ embed surface.
- **VNeID là CASE ĐẶC BIỆT** (QĐ, câu hỏi mở #3): federate VỚI VNeID làm root-of-trust pháp lý, làm **Mini App TRONG VNeID** (đảo vai), KHÔNG cạnh tranh eID. Tách hẳn khỏi giả định permissionless. Loại mọi narrative "PhoenixKey thay thế eID nhà nước". **[NEEDS-EVIDENCE: chuẩn API Mini App nhà nước hiện hành]**

---

## 6. Registry permissionless + Sandbox + DAO hậu kiểm — yêu cầu an toàn TỐI THIỂU

Để 1 module được phép CHẠY (không chỉ đăng ký), phải đạt gate sau (QĐ-4):

1. **Manifest hợp lệ** — pass JSON-Schema; không trường cấm (§1.2); `mergePolicy` khai rõ.
2. **Config + theme declarative** — pass validator non-Turing-complete (§4.1, §2.1).
3. **Static capability scan** — quét tự động capability thực tế khớp `capabilities` khai; phát hiện sink ẩn → reject.
4. **Code-signing** — `signature` verify bởi publisher đã định danh.
5. **Trust-tier khởi đầu = 0** — sandbox hạn quyền tối đa, KHÔNG chạm SG3(data nhạy)/SG5(wallet)/biometric cho tới khi:
   - qua **hậu kiểm DAO** (kỹ thuật: ủy ban DID-gate + reputation, bằng chứng tái lập), và
   - đạt ngưỡng **stake LAMP bond + time-lock** cho quyền nhạy cảm.
6. **Kill-switch trung tâm** qua Registry + **safety-multisig takedown khẩn cấp** (tách khỏi vote DAO, đáp ứng SLA luật — Decree 147 gỡ 24h). Stake bị phạt → chuyển **Treasury (KHÔNG burn**, theo bất biến 36 tỷ).
7. **Governance 2 chế độ theo kênh**: kênh 1+2 = permissionless + DAO hậu kiểm đầy đủ; kênh 3 = lớp-bổ-sung-dưới-luật-host, embed-SDK **mang sẵn moderation đạt chuẩn host**.

> Tách phán quyết: **kỹ thuật** (ủy ban DID-gate, gỡ-vì-lỗ-hổng) ⟂ **giá trị** (một-người-một-phiếu, KHÔNG token-weighted). Pháp nhân vận hành Registry phải rõ TRƯỚC mọi thiết kế governance (câu hỏi mở #1 — founder quyết).

---

## 7. Frontend Consistency

### 7.1 Navigation grammar chung

- MỘT framework điều hướng (sở hữu SG4). Module feature chỉ đăng ký `route` + `navSlot` (`primary`/`secondary`/`contextual`), KHÔNG tự dựng navigator riêng.
- Refactor nav từ **hard-import sang registry config-driven** (QĐ-1): nav bind theo config instance, giữ default bundle nhúng binary làm fallback offline. (Hiện code vi phạm: nav import cứng — phải sửa.)
- Back/forward, deep-link (`magiclamp://<module>`), và handoff native theo một grammar chung xuyên mọi instance + kênh nhúng.

### 7.2 Adaptive 2 cực (token-driven, override 2 cấp)

- Hai cực NGANG NHAU từ đầu: (a) nông dân/Android đời thấp/3G/ít quen; (b) đô thị/máy mạnh/quen app. KHÔNG tối ưu một cực rồi vá.
- **Tự động** detect (thiết bị/mạng) **+ override 2 cấp**: admin của instance HOẶC user tự chọn profile (`lowEnd`/`rich`).
- Cấp thấp: nhẹ asset, ít animation, ưu tiên offline + 3G; cấp cao: đầy đủ. Cùng token, 2 profile giá trị.

### 7.3 Trạng thái bắt buộc cho MỌI màn feature

| Trạng thái | Yêu cầu |
|---|---|
| **Loading** | Skeleton token-driven; KHÔNG spinner trắng vô định; có timeout → chuyển error |
| **Empty** | Thông điệp + hành động gợi ý; KHÔNG màn trống |
| **Offline** | Hiện rõ chế độ offline; thao tác ghi vào durable outbox + báo "sẽ đồng bộ"; KHÔNG mất dữ liệu (INV-1) |
| **Error** | Thông điệp người-đọc-được + retry; phân biệt lỗi mạng ⟂ lỗi quyền (capability) ⟂ lỗi server; KHÔNG nuốt lỗi |

---

## 8. Checklist tuân thủ — "sẵn sàng tích hợp"

Một platform/module chỉ được coi là READY khi TẤT CẢ mục dưới xanh (evidence output thật, không "file exists"):

**Manifest & Config**
- [ ] `module.manifest.json` pass JSON-Schema; không trường cấm (§1.2); `mergePolicy` khai rõ.
- [ ] `config.schema.json` non-Turing-complete; whitelist kiểu; `additionalProperties:false`.
- [ ] `capabilities` tối thiểu, khớp static scan; không xin `*`.

**Design & Brand**
- [ ] Zero hardcode màu (lint CI xanh); chỉ tiêu thụ design token.
- [ ] Brand-strip về app chủ ở kênh 1+2; co-brand "powered by MagicLamp" ở kênh 3.

**Identity & Data**
- [ ] Mọi ghi data qua fabric API versioned + idempotency key; KHÔNG ghi data layer trực tiếp (INV-1).
- [ ] On-chain chỉ hash/commitment; PII/sinh trắc off-chain VN, erasable (INV-3).
- [ ] Consent per-host; capability cưỡng chế qua runtime broker (default-deny).

**Billing**
- [ ] `billingHooks` khai điểm đo phí; công thức đóng platform; mức phí trong DAO-bound.
- [ ] Dòng tiền B2C qua PSP; LAMP/MAGIC chỉ phí mạng nội bộ.

**Embed (nếu hỗ trợ kênh 3)**
- [ ] Token audience-bound + DPoP + nonce; credential/biometric KHÔNG vào WebView.
- [ ] Thin-funnel + deep-link native cho thao tác nặng; durable outbox flush onHide/onUnload.
- [ ] Adapter per-host; egress chỉ về fabric API.

**Frontend**
- [ ] Đăng ký `route`/`navSlot` theo navigation grammar; nav config-driven, không hard-import.
- [ ] Adaptive 2 cực; override admin/user; CI ma trận thiết bị thấp/3G + accessibility xanh TRƯỚC khi phát hành.
- [ ] Đủ 4 trạng thái loading/empty/offline/error.

**Registry & Governance**
- [ ] Code-signed; trust-tier khởi đầu = 0; sandbox default-deny.
- [ ] Đăng ký Registry; chấp nhận kill-switch + safety-multisig + DAO hậu kiểm.
- [ ] Stake bond cho quyền nhạy cảm; phạt → Treasury (không burn).

**Verify (CLAUDE.md §Verify)**
- [ ] Backend: `curl` endpoint thật với payload thực tế sau deploy.
- [ ] Mobile: `flutter/RN analyze + test` CI xanh; evidence output cụ thể.
- [ ] Đổi constraint/signature/import → grep TOÀN BỘ callers + tests, update đồng thời.

---

## 9. Change Log
- v0.1 (2026-06-17): Khởi tạo Integration Standard. Tổng hợp QĐ-1..QĐ-8 từ EXPANSION-ANALYSIS + INV-1/INV-2/INV-3. 8 mục: Manifest, Design token/brand, Identity/data, Config/billing, Embed-SDK, Registry/governance, Frontend consistency, Checklist.
