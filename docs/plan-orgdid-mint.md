# Kế hoạch: OrgDID + mint LAMP bản B (phần feature SuperApp)

> Nguồn: handoff PhoenixKey `HANDOFF-SuperApp-orgdid-mint-2026-07-11.md`. Tuân [`Integration-Standard.md`](../Integration-Standard.md) (§1.3 silent/feature, §2.1 token, §5.1/§5.3 embed+enclave, §7.1/§7.3 nav+state, §8 checklist).
> Trạng thái: **NO-GO ship** — chờ 4 blocker (mục 4). Đây là KẾ HOẠCH, chưa build.

## 1. PhoenixKey đã giao (phần silent — đã audit)
- Builder Core (`_wt-core-mint-b`, `2c63ad7`, cargo 158/158): FFI `taad_build_mint_lamp_via_did` (13 tham số, thứ tự cố định) + `taad_build_create_child_taad_utxo_tx` (tạo OrgDID).
- Validator LAMP (`_wt-lamp-mint-b`, `761bb7e`, aiken 118/118): `registry_write.ak` + `lamp_mint.ak` bản B.
- Deploy runbook Preview (`Genesis/DEPLOY-RUNBOOK-preview.md`) — NO-GO submit thật.

## 2. Việc feature (khi mở blocker) — trên nền develop THẬT

> Đối chiếu develop: OrgMint UX **đã có** (`src/screens/OrgMintScreen.tsx`, `OrgDidScreen.tsx`, `src/services/orgMint-api.ts`, `orgMintService.ts`, `src/config/orgMint.ts`), rust `mint_lamp.rs`+`registry_mint.rs` **đã có** (có thể bản A), bridge `TaadEnclaveModule` **14 @ReactMethod**. → mở rộng, KHÔNG dựng từ 0.

| # | Việc | Chi tiết | Chặn bởi |
|---|---|---|---|
| S1 | Sync rust core → bản B | Copy `mint_lamp.rs`+`registry_mint.rs` từ Core `2c63ad7`, splice FFI vào `lib.rs`. **Schema byte-perfect** với validator `registry.ak` (constr-index/field-order khớp — lệch = decode sai = gate sai). Giải xung đột rust core develop. | — (làm được ngay) |
| S2 | Bridge FFI | Thêm 2 method vào `TaadEnclaveModule` (Swift + Kotlin): `buildMintLampViaDid` (13 param), `buildCreateChildTaad` (OrgDID). Không đụng 14 method sẵn. | — (làm được ngay) |
| S3 | Chain-data + submit **qua fabric API** | Fetch UTxO/protocol-params/registry/kho/SupplyState + submit tx **qua backend relay**, KHÔNG Blockfrost thẳng (§5.3, INV-1 §3.2, `capabilities.network=fabric.api`). Wire vào `orgMintService`. | Backend relay (Long) |
| S4 | Compliance module feature | `module.manifest.json` (`integrationKind:feature`, §1.1) + design token zero-hardcode-màu (§2.1, lint CI) + 4 trạng thái (§7.3) + nav config-driven (§7.1). Wire màn OrgMint sẵn có. | — (làm được ngay) |
| S5 | Vault Master_KEK | Vault secure-enclave thật thay stopgap nhập 24 từ mỗi phiên (§5.1, QĐ-5). | Thiết kế vault |
| S6 | Env FINAL | 11 biến (`TAAD_POLICY_ID_HEX`...`LAMP_TOKEN_NAME_HEX`) vào `.env`. | Deploy Preview go |
| S7 | Verify (§8) | RN analyze+test CI xanh · manifest pass JSON-Schema · capability static-scan khớp · evidence output thật. | Sau S1–S6 |

## 3. Contract PhoenixKey giữ (không tự sửa)
FFI signature + datum schema (RegistryDatum/SupplyState/TAADDatum) + interface validator. Cần đổi → báo PhoenixKey. Backend relay `/identity/org/{orgDid}/mint-lamp` thuộc Long.

## 4. Blocker (NO-GO tới khi mở hết)
1. Deploy Preview bản B = NO-GO (3 dep on-chain: TAAD anchor Active, Reserve meter_nft, khoá ví).
2. Env FINAL chưa cấp (có sau deploy go).
3. Backend relay (Long) — mới nháp issue, chờ duyệt.
4. Chưa có vault Master_KEK bảo vệ trong SuperApp.

## 5. Việc CÓ THỂ làm song song ngay (không chờ blocker)
S1 (rust sync), S2 (bridge FFI), S4 (compliance module) — dựng sẵn để khi env/relay về là ráp submit (S3) + verify (S7). **Đề xuất:** chờ anh chốt có khởi động S1/S2/S4 chưa (handoff là plan, blocker ship còn cứng).
