# MagicLamp Platform Integration Standard

> **Mục đích**: Tài liệu chuẩn để Agent/dev của MỌI platform (ProofChat, OriLife, AladinWork, LampNetCloud, Farm, và module mới bất kỳ) nắm context + thực thi đúng, đảm bảo nhất quán khi cắm vào host shell (kênh 1+2) và khi nhúng host ngoài (kênh 3).
> **Cấp**: L1 Platform — Ecosystem-wide Standard.
> **Status**: v0.3 — 2026-08-10 (xem §9 Change Log).
> **Owner**: Aladin (founder) · Orchestrator giữ interface contract.
> **Nguồn chốt**: `Specs/PLATFORM-MASTER.md` (INV-1/INV-2, 8 Spec Group, 2 kiểu tích hợp), `Specs/_analysis/EXPANSION-ANALYSIS.md` (QĐ-1..QĐ-8).
> **Quan hệ với spec khác**: Tài liệu này là CONTRACT trừu tượng. Chi tiết hiện thực thuộc các Spec Group SG1..SG8. Khi mâu thuẫn, Math-Spec (invariant) thắng. KHÔNG duplicate nội dung cross-group — chỉ tham chiếu.

---

## 0. Mệnh đề nền (đọc trước khi code)

1. **Hào phòng thủ nằm ở DATA-FEDERATION, không ở UI hay app-factory.** INV-1 (1 DID = 1 nguồn dữ liệu xuyên mọi host) là thứ host walled-garden không thể clone. Mọi quyết định kỹ thuật phải bảo vệ điểm này trước.
2. **Config là DECLARATIVE thuần, KHÔNG BAO GIỜ Turing-complete** (QĐ-1). Cần "logic riêng" = phải thành MODULE mới qua Registry (chịu gate bảo mật), KHÔNG lẻn vào tầng config/theme/billing.
3. **Permissionless ĐĂNG KÝ ≠ permissionless TRUY CẬP** (QĐ-4). Đăng ký tự do; truy cập shared-data/wallet/biometric là default-deny, mở dần sau hậu kiểm + stake. ⚠️ **Trạng thái ĐÍCH** — hôm nay `src/navigation/registry.ts` là sổ TĨNH, chưa có đường đăng ký nào để mà tự do hay không tự do.
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
    "deepLinkNative": "lamp://trace"  // handoff sang app native cho thao tác nặng
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
- **Chặn cứng (blocker cho B)**: cần issuer-side PhoenixKey mint EdDSA + `/api/v1/.well-known/jwks.json` (backend có context-path `/api/v1`; đường không tiền tố trả **404**) — thuộc Long, Claude KHÔNG sửa. Consumer-side (ProofChat) đã verify EdDSA qua JWKS.

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
- Nav **registry config-driven** (QĐ-1): nav bind theo config instance, giữ default bundle nhúng binary làm fallback offline. (YC-3 ĐÃ refactor từ hard-import → config-driven, xem `src/modules/index.ts` + `src/navigation/registry.ts`.)
- Back/forward, deep-link (`lamp://<module>`), và handoff native theo một grammar chung xuyên mọi instance + kênh nhúng.

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
- v0.3 (2026-08-10): **Bỏ mô hình snapshot 2 lớp** — áp quyết định Aladin 2026-07-15 đã treo chưa land
  (`_Agents/topics/integration-standard-convention.md`): platform sở hữu contract ở repo mình, SuperApp
  chỉ giữ INDEX. Viết lại §10.1 + §11. Cất `Integration/ProofChat.md` + `Integration/OriLife.md`
  (đều chốt 2026-07-11, dạy sai so với canonical) vào `Legacy/`. Cất cây `MobileCore/` v0.2 (repo chủ
  đã lên v0.3, 0 importer trong `src/`) vào `Legacy/`. Sửa đường JWKS `/.well-known/jwks.json` →
  `/api/v1/.well-known/jwks.json` ở §5.1 (đường cũ trả 404 — đo 2026-08-05).
- v0.2.1 (2026-07-12): Rà soát nhất quán — sửa Status header (v0.1→v0.2), path "Nguồn chốt" trỏ `Specs/`, gỡ ghi chú lỗi thời §7.1 (nav ĐÃ config-driven qua YC-3), cập nhật vị trí git token (§10.2, chuẩn mới `Agents/.env`), làm rõ CARP thanh toán = tầng mạng nội bộ (§10.4 nhất quán §4.2), thống nhất mô tả upstream (§10.1↔§11).
- v0.2 (2026-07-12): Gộp về MỘT file duy nhất tại ROOT (`Integration-Standard.md`) — dời khỏi `Specs/` (references dùng tên "INTEGRATION-STANDARD §X" không đổi). Thêm §10 (vận hành: env/cờ/token UI) + §11 (danh mục platform) + thư mục `Integration/` chứa snapshot 5 nền tảng. Đây là nơi mọi agent/dev tham chiếu chuẩn tích hợp.
- v0.1 (2026-06-17): Khởi tạo Integration Standard. Tổng hợp QĐ-1..QĐ-8 từ EXPANSION-ANALYSIS + INV-1/INV-2/INV-3. 8 mục: Manifest, Design token/brand, Identity/data, Config/billing, Embed-SDK, Registry/governance, Frontend consistency, Checklist.

---

## 10. Vận hành tích hợp — Env · Feature Flag · Token UI (operational)

> §0–§9 là CONTRACT trừu tượng (kiến trúc + bất biến). Mục này là quy ước VẬN HÀNH cụ thể để agent/dev cắm API THẬT của từng platform vào SuperApp. **App BUILD từ repo [`MagicSuperApp/SuperApp`](https://github.com/MagicSuperApp/SuperApp) — KHÔNG build từ repo platform.** Mọi giá trị SuperApp đọc đều nằm trong repo này.

### 10.1 MỘT nguồn sự-thật — platform sở hữu, SuperApp THAM CHIẾU (Aladin chốt 2026-07-15)

> **Mô hình "2 lớp upstream + snapshot" trước đây ĐÃ BỎ.** Nguyên văn quyết định:
> *"Mỗi platform TỰ GIỮ `<Platform>-Integration.md` ở root repo mình. SuperApp THAM CHIẾU về đó —
> KHÔNG giữ snapshot/bản sao. Mô hình cũ 'SuperApp giữ `Integration/<Platform>.md` snapshot' = SAI,
> phải bỏ."* Lý do: app NGOÀI cũng tích hợp thẳng platform → contract phải do platform sở hữu.
> Nguồn: `_Agents/topics/integration-standard-convention.md` (2026-07-15), thắng bản §10.1 cũ (12/07).

- **Canonical:** file contract nằm ở repo của CHÍNH platform (cột "Nguồn chuẩn" §11). Platform là chủ,
  tự cập nhật theo version mình; đổi endpoint/auth/token → sửa tại đó (kèm ngày + HEAD commit).
- **SuperApp giữ INDEX, không giữ bản sao.** Mỗi phiên đọc THẲNG file canonical, KHÔNG dựa trí nhớ,
  KHÔNG đọc bản sao trong repo này.
- **Bản sao đã cất:** snapshot ProofChat + OriLife (cả hai chốt ở 2026-07-11) đã chuyển vào
  [`Legacy/`](Legacy/) — chúng dạy sai so với canonical hiện hành. Lý do từng cái: [`Legacy/README.md`](Legacy/README.md).
- **Còn treo:** AladinWork và LampNet CHƯA publish file ở repo mình, nên bản trong `Integration/` tạm
  thời vẫn là nguồn duy nhất — đánh dấu ⚠ ở §11. Khi họ publish xong → cất nốt bản ở đây.

### 10.2 Vị trí key / creds
- **Git token (push/PR):** `.env` ở workspace cha NGOÀI repo (2026-07-12: chuẩn mới `Agents/.env`, cũ `Projects/.env`), biến `GH_TOKEN_<ACCOUNT>`. KHÔNG commit, KHÔNG dán giá trị, KHÔNG nhúng trong URL remote.
- **API host/key platform:** `.env` của SuperApp (gitignored; mẫu [`.env.example`](.env.example)). Quy ước biến: `<PLATFORM>_API_URL` · `<PLATFORM>_WS_URL`+`_WS_PATH` · `<PLATFORM>_API_KEY` · `<PLATFORM>_BACKEND_ENABLED`.
- Platform dùng DID/session (OriLife/AladinWork/ProofChat) → KHÔNG static token; auth = PhoenixKey login → Bearer TTL (§3.1, §5.1).
- **Token nhúng trong URL remote git = rò rỉ** — xoay vòng ngay, sửa `git remote set-url`.

### 10.3 Feature flag
- Mỗi module gọi backend gate bởi `<PLATFORM>_BACKEND_ENABLED`. **Mặc định `false` = mock**; app chạy offline khi cờ tắt/backend down (đồng bộ §7.3 Offline + durable outbox).
- Bật `true` chỉ khi: snapshot Readiness 🟢 + có creds trong `.env` + đã đối chiếu shape API thật.

### 10.4 Token hiển thị (bổ sung §4.2)
- 3 token user-facing: **MAGIC** (đơn vị định giá) · **CARP** (đồng thanh toán trong mạng: pledge + phí giữ/chuyển; `402 NO_FUNDS` = thiếu CARP) · **LAMP** (backing/governance, cố định 36 tỷ, no-burn).
- ⚠️ Nhất quán với §4.2: CARP/MAGIC/LAMP là thanh toán **tài nguyên mạng nội bộ**, KHÔNG phải thanh toán dịch vụ thương mại B2C (phí B2C fiat đi qua **PSP có giấy phép**, không qua crypto).
- **ADA KHÔNG user-facing** — chỉ phí chain (lovelace). Ví on-chain CÓ giữ ADA thật để trả phí, nên ADA chỉ hiện ở mục "Tài sản khác", KHÔNG đặt ngang hàng MAGIC/LAMP/CARP ở màn chính.
- Doc "CARP gộp MAGIC" DEPRECATED (2026-07-03) — KHÔNG dùng.

### 10.5 Vai + ranh giới sửa code
- **Thư** = mobile (native camera/EXIF, Enclave ký, wiring API backend-facing). **Tùng** = frontend/UIUX. **Claude/SuperApp** = frontend + gọi API (KHÔNG sửa backend platform).
- Backend mỗi platform do team đó sở hữu: PhoenixKey=Long · ProofChat=Lợi · AladinWork=Work team · OriLife=OriLife agent · LampNet=LampNet team.

## 11. Danh mục platform — INDEX trỏ tới nguồn chuẩn (§10.1)

> Cột "Nguồn chuẩn" là thứ DUY NHẤT được đọc khi build. Không có cột snapshot nữa.

| Platform | Module | Nguồn chuẩn (đọc THẲNG file này) | Chủ |
|---|---|---|---|
| OriLife | Truy-xuất | `OriLifeTrace/OriLife-Integration.md` — v0.2.2 · 2026-08-06, ở root repo OriLife | OriLife agent |
| PhoenixKey | DID · ví · mint | `PhoenixKeyDID/PhoenixKey-SDK/INTEGRATION.md` — canonical từ 2026-07-21 (bản `PhoenixKeyDID/PhoenixKey-Integration.md` chỉ là con trỏ) | Phoenix agent · Long |
| ProofChat | Trò-chuyện (E2EE) | `ProofChat/INTEGRATION.md` — v2026-08-08, thay bản 2026-07-04 | Lợi |
| AladinWork | Việc-làm | ⚠ [`Integration/AladinWork.md`](Integration/AladinWork.md) — **tạm**, upstream chưa publish | Work team |
| LampNet | Kết đèn | ⚠ [`Integration/LampNet.md`](Integration/LampNet.md) — **tạm**, upstream chưa publish | LampNet team |

> ⚠ **`Integration/PhoenixKey.md` vẫn còn trong repo** nhưng KHÔNG phải nguồn chuẩn — nó trùng lặp
> với canonical ở trên và có chỗ lệch (canonical nói `grantee_did` để trống = Grant thành **bearer**,
> phải LUÔN đặt; bản trong repo này ghi "tuỳ chọn"). Giữ tạm vì còn phần trạng thái riêng của
> SuperApp chưa gỡ ra. **Đọc canonical trước.** Việc gỡ hẳn: chờ chủ dự án chốt.

**Hiện trạng cross-ref (2026-07-12):**

| Platform | main HEAD | Base URL | Auth | Readiness |
|---|---|---|---|---|
| OriLife | `6e8210b` (07-08) | `api.orilife.io` | DID P-256, token 12h | 🟡 prod drift + B1/B2/B3 (issue [#20](https://github.com/MagicSuperApp/SuperApp/issues/20)) |
| PhoenixKey | `6c45962` (06-12) | `api.phoenixkey.me` | token-exchange ServiceDID + JWKS | Ví Standard 🟢 (đã nối, [#42](https://github.com/MagicSuperApp/SuperApp/pull/42)) · Mint 🔴 |
| ProofChat | BE `52a41db` (07-04) | `api.proofchat.me` | login → accessToken | 🔴 502 (BE#58 chưa merge) |
| AladinWork | `8040617` (07-07) v0.2.0 | `<host>:7040` chưa có | challenge/verify P-256 → session | 🟡 code sẵn, chưa host |
| LampNet | hivemind `506c611` (07-11) | `lampnet.cloud` | join public · upload Bearer | 🟡 join/compute chạy · 🔴 reward dry-run |

> Trạng thái nhánh dọn dẹp: [`docs/BRANCH-AUDIT.md`](docs/BRANCH-AUDIT.md).

## 12. Handoff Ledger — module ĐẨY việc cho dev SuperApp (không để SuperApp đi hỏi)

> **Vấn đề:** trước nay SuperApp phải đi HỎI từng module "backend xong chưa, shape gì" (pull).
> Chậm + dễ sót. **Đảo chiều (push):** module/nền tảng nào hoàn thành một năng lực có phần
> UI/wire cần dựng ở SuperApp thì TỰ GHI vào sổ bàn giao — dev SuperApp (Thư/Tùng) đọc 1 chỗ.

### 12.1 File sổ
- MỘT file sống: [`Integration/Module-Handoff.md`](Integration/Module-Handoff.md) trong repo SuperApp.
- Là bảng nhiều-tay-ghi → tách khỏi tài liệu CONTRACT tĩnh này để tránh xung đột merge. §12 chỉ
  định nghĩa FORMAT + nghĩa vụ; DỮ LIỆU nằm ở file sổ (KHÔNG duplicate — theo nguyên tắc doc này).

### 12.2 Nghĩa vụ (áp cho MỌI agent module/nền tảng)
Khi hoàn thành một năng lực backend/nền tảng mà SuperApp cần dựng UI hoặc nối API:
1. **Append NGAY** một dòng vào bảng "Đang mở" của `Module-Handoff.md` (qua PR vào SuperApp,
   hoặc nhờ SuperApp agent chèn nếu không có quyền push repo này) — KHÔNG chờ SuperApp hỏi.
2. Cập nhật shape thật vào **file canonical ở repo mình** (§10.1/§11) TRƯỚC, rồi ledger chỉ TRỎ tới đó.
   KHÔNG chép shape vào repo SuperApp.
3. Khi backend đổi shape/endpoint đã bàn giao → cập nhật lại dòng ledger + snapshot (kèm ngày).

### 12.3 Format 1 dòng (8 cột)
`ID | Module (agent) | Loại | Việc cụ thể ở SuperApp | Ref shape | BE | Ai (Thư/Tùng) | Ngày đẩy`
- **Loại** ∈ {Screen, Wire, Shape, Fix}. **BE** ∈ {🟢 live · 🟡 code chưa deploy · 🔴 chưa build · ⚫ OPS/secret}.
- **Ref shape** trỏ file canonical của platform (§11) hoặc endpoint cụ thể — KHÔNG chép shape vào ledger.
- **Định nghĩa Done:** dev dựng xong + verify (tsc/test + đối chiếu shape thật) + merge develop → chuyển dòng xuống "Đã xong".

### 12.4 Ranh giới rule
- Nghĩa vụ HÀNH VI "phải tự đẩy khi xong" là rule CHÉO mọi agent → thuộc `_rules/Forall.md`
  (chủ nhân kiểm soát tập trung, Forall §"không tự sửa file rule global"). §12 chỉ định nghĩa
  cơ chế/format; việc ép mọi agent tuân do rule global chốt. Agent đề xuất, chủ nhân duyệt.
