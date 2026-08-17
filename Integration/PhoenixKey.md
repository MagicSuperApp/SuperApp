# PhoenixKey — SuperApp Integration

> 🔴 **KHÔNG phải nguồn chuẩn.** Canonical = **`PhoenixKeyDID/PhoenixKey-SDK/INTEGRATION.md`**
> (anh chốt 2026-07-21, repo công khai + versioned). Mâu thuẫn thì **canonical thắng** — đã biết
> một chỗ lệch: canonical nói `grantee_did` để TRỐNG khiến Grant thành **bearer** (ai cầm cũng
> trình được) nên phải LUÔN đặt, còn file này ghi "tuỳ chọn". Canonical cũng ghi thêm: **phía TIÊU
> Grant chưa tồn tại** trên `main` — lấy được Grant KHÔNG có nghĩa LAMP chảy.
>
> File này giữ tạm vì còn phần trạng thái riêng của SuperApp (Readiness, việc app phải sửa) chưa
> gỡ ra chỗ khác. Theo §10.1 nó sẽ được cất nốt. Đọc canonical TRƯỚC.

> Chuẩn: `SuperApp/Integration-Standard.md`. Snapshot: 2026-07-11 (thân bài cập nhật tới 2026-08-05).
> Module SuperApp: **DID login · Ví (Standard/Phoenix) · OrgDID/Mint LAMP**.

## HEAD
- `PhoenixKey-Database` main = `b4c4ce2` (2026-08-04). PR #116 merged 2026-07-31: 3 endpoint đọc ví chuyển sang bắt buộc Bearer. Việc mint LAMP nằm ở **worktree local CHƯA merge** (xem Readiness).

## Base URL / JWKS
- REST: `http://localhost:8080/api/v1` (dev); prod dự kiến `https://api.phoenixkey.me/api/v1` (⚠️ domain chưa thấy trong CORS list — [NEEDS-EVIDENCE]).
- JWKS: `GET /api/v1/.well-known/jwks.json` (Ed25519, `kid=phoenixkey-ed25519-1`). ⚠️ **Đường KHÔNG có tiền tố `/api/v1` trả 404** — backend có context-path `/api/v1`, giống `/health` vs `/api/v1/actuator/health` ở Changelog 2026-08-05. Đường đúng hiện **vẫn trả 400 trên prod** kể cả khi không gửi header `Origin` (chặn cả gọi máy-tới-máy); vá ở PhoenixKey Database PR #123. ⇒ chưa verify được chữ ký bằng khoá công khai, đừng dựng luồng phụ thuộc JWKS rồi chờ. (Nguồn: `ProofChat/INTEGRATION.md` v2026-08-08 §9 + mục ⚠️ #4, đo 2026-08-05.)

## Auth — token-exchange qua ServiceDID
- `POST /auth/token/exchange {sessionToken, aud=<ServiceDID app>, redirectUri, nonce?}` → `{appToken(JWT EdDSA), userDid}`.
- `redirectUri` phải khớp EXACT một `serviceEndpoint[]` trong DID Document của ServiceDID (nguồn on-chain). **SuperApp phải đăng ký ServiceDID on-chain** — không có "app registry" ở backend.
- DID người: `did:phoenix:<slot13 base32>:<hash64 hex>`.

## Endpoints ĐÃ SẴN (🟢)
| Method·Path | Field |
|---|---|
| POST `/wallet/standard/register` 🔒 | `fixed_address`* (bech32, idempotent), `active_address?`, `stake_address?` |
| GET `/wallet/standard/{userDid}` 🔒 | → `{addresses:{fixed,active,stake}, balances:{lovelace,lamp,carp}}`, 404 nếu chưa register |
| GET `/wallet/{userDid}/all` 🔒 | gộp ví phoenix+standard + `magic{}` (magic=0 tới khi vault wired). **Đây là API app NÊN dùng**. `caller_did` phải == `path_did` |
| POST `/identity/org/create` · `/founding`(m-of-n) · `/{orgDid}/upgrade-authority` | tạo/quản OrgDID |

**Deprecated (đừng dùng):** `/wallet/register`, `/wallet/{did}/balance` (V1 — giờ vừa deprecated vừa đòi Bearer 🔒).

## `POST /identity/org/{orgDid}/mint-lamp` — là GRANT UỶ QUYỀN, không phải lệnh đúc
> Cập nhật 2026-08-03 (Phoenix agent). Database **PR #119**, chờ Long merge → BE 🟡.
> Đính chính bản cũ ghi "grep 0 hit / sẽ không có": endpoint CÓ, nhưng **nghĩa khác hẳn**
> cái client `src/services/orgMint-api.ts` đang giả định.

Endpoint **không đúc LAMP, không submit tx**. Nó verify controller của OrgDID đã ký thử thách,
rồi phát một **Grant tự-verify** (Anchorme §11.2). Bên tiêu Grant để ráp + ký + submit giao dịch
thật là **`dist_treasury` phía MagicLamp**, không phải app, không phải PhoenixKey.

```
POST /api/v1/identity/org/{orgDid}/mint-lamp
{ "action": "mint:LAMP",            // mint:LAMP | pot:fund | pot:distribute (3 chặng)
  "resource": "<pot-id / addr kho>",
  "amountLamp": "26000000000000000", // oildrop — CHUỖI big-number, parse BigInt, ĐỪNG dùng number
  "granteeDid": "did:phoenix:…",     // tuỳ chọn: operator dist_treasury được uỷ quyền
  "validTtlSeconds": 3600,           // 60–604800, tuỳ chọn — hạn theo GIÂY tương đối
  "ownerDid": "did:phoenix:…",       // controller single-owner của org
  "ownerSignature": "<hex>", "nonce": "<1–64>" }

challenge = "PHOENIXKEY_ORG_LAMP:" + orgDid + ":" + action + ":" + amountLamp + ":"
          + resource + ":" + (granteeDid||"") + ":" + (validTtlSeconds||"") + ":" + nonce

200 → { grantId, grantorDid, granteeDid, action, resource, amountLamp(String), validFromSlot,
        validUntilSlot, nonce, status:"ISSUED", signerDid, signerPublicKeyHex, signature,
        canonicalChallenge, revocable:true }
403 chữ ký sai / signer≠controller · 404 org không tồn tại
409 nonce đã dùng / org không single-owner · 400 validTtlSeconds ngoài dải
```

**`validTtlSeconds` chứ KHÔNG phải `validUntilSlot`** (Phoenix đổi hợp đồng 03/08 sau khi
SuperApp chỉ ra backend không có đường trả slot công khai ⇒ hạn tuyệt đối là bất-khả-dụng cho
app). Server tự đóng dấu `validFromSlot = tip`, tính `validUntilSlot = validFromSlot +
validTtlSeconds` (≈1 slot/giây) rồi trả về tuyệt đối cho `dist_treasury`. **App không cần đồng
hồ slot, không cần hằng số mạng, không quy đổi POSIXTime.** Bỏ trống = Grant không hết hạn
(nonce dùng-một-lần vẫn chặn phát lại) — nhưng nên đặt hạn.

**`nonce`: app tự sinh** (khuyến nghị ≥128-bit, 1–64 ký tự). Server tiêu dùng-một-lần theo
`(ownerDid, nonce)`, **TTL 10 phút**. Verify chạy TRƯỚC khi tiêu ⇒ ký sai KHÔNG đốt nonce.
Người dùng bấm hai lần vì mạng chậm: **khoá nút + hiện "đang xử lý"**, đừng để chạm `409`.
Muốn thử lại sau khi hỏng thật → **sinh nonce MỚI** và ký lại, đừng tái dùng nonce cũ.

**Grant LÀ BÍ MẬT — cất Enclave/Keychain, KHÔNG AsyncStorage.** Nó mang chữ ký controller nên
là *bearer authorization*: ai cầm được đều trình cho `dist_treasury` để thực thi thao tác đã
uỷ quyền. Đích (resource/amount) cố định trong Grant nên rò KHÔNG cho đổi hướng tiền, nhưng
CHO thực-thi-sớm hoặc lặp trong cửa sổ hạn.

**Đường Grant → `dist_treasury` chưa chốt** (push hay pull, đang chờ MagicLamp trả lời). Phoenix
khuyến nghị app **lưu Grant BỀN, sống qua app-kill** — đúng cho cả hai cách, khỏi làm lại cấu
trúc màn. Kết hợp với đoạn trên: bền **và** trong Enclave, không phải AsyncStorage.

**Việc phía app phải sửa** (client hiện tại KHÔNG khớp):
- `orgMint-api.ts:453` đang gửi `{orgDid, amount}` rồi chờ intent + SSE `/sign/request/{id}/stream`.
  Hợp đồng thật cần đủ 8 trường trên, ký **Ed25519 device-key** trong Enclave, và **không** có
  bước SSE nào — 200 trả thẳng Grant.
- `amountLamp` là **chuỗi**. Ép về `number` là mất chính xác ở cỡ 2.6×10¹⁶ oildrop.
- Ký on-chain dùng **Ed25519 device-key**; HW_Key P-256 chỉ verify off-chain (P-256 chưa verify
  được on-chain). Đây đúng như app đang giả định.
- m-of-n chưa hỗ trợ: org nhiều chủ → `409`. Follow-up phía Phoenix.

## Endpoints CHƯA có (app gọi nhưng backend thiếu — grep 0 hit)
- `mint-lamp/submit-tx` — **sẽ không có ở PhoenixKey**: submit là việc của bên tiêu Grant.
- `GET /sign/request/{id}/stream` — SSE thật nằm ở `/auth/session/{id}/stream` (SDK dùng đường đó).
- `did-payment/build-tx` + submit (Phase 2, chưa deploy).
- `GET /identity/org` (list OrgDID theo owner) — app phải dựa cache cục bộ.
- `GET /wallet/utxos` + `GET /wallet/params` — thiếu 2 proxy này thì native dựng được tx cũng
  không có UTxO để ráp ⇒ **gửi ADA và uỷ thác pool đều chết**, dù `POST /wallet/tx/submit` đã có.

## Env / Creds cho SuperApp
- KHÔNG có API-key/client-secret kiểu OAuth — cơ chế = **ServiceDID on-chain + JWKS**.
- `PHOENIXKEY_API_URL=https://api.phoenixkey.me/api/v1`. Artifact mint (`REGISTRY_NFT_POLICY_ID`, `LAMP_POLICY_CBOR_HEX`, `SUPPLY_STATE_SCRIPT_CBOR_HEX`, `TAAD_POLICY_ID_HEX`, `KHO_NFT_POLICY_ID`...) đọc `.env` — **CHƯA có giá trị** (chờ LAMP Genesis deploy bản B). `BLOCKFROST_KEY` SuperApp tự cấu hình (không qua PhoenixKey).

## Readiness
- Ví Standard: 🟢 **backend sẵn, app CHƯA nối** — thêm client `wallet.registerStandard/getStandard/getAllWallets`, đổi V1 `getBalance`→`/wallet/{did}/all`.
- Ví Phoenix (did-payment ký): 🔴 backend chưa có.
- **Mint LAMP: 🟡 đổi thế.** Nghĩa đã chốt: OrgDID **xin uỷ quyền**, MagicLamp mới đúc. Endpoint
  Grant có ở PR #119 (chờ merge) nên app dựng được luồng ký NGAY, cắm bên tiêu Grant sau —
  không phải làm lại. Phần dưới là hiện trạng nhánh mint CŨ (đúc thẳng), giữ để đối chiếu:
- **Mint LAMP (đường cũ, đúc thẳng): 🔴 NO-GO.** Nguồn mint tiến xa nhất = worktree **`/Projects/_wt-superapp-mint`** (branch `claude/superapp-orgdid-mint`, HEAD `a0c11593` 07-11): build tx Rust FFI on-device → submit THẲNG Blockfrost (bỏ qua backend), bản B. cargo 150/150, tsc 0. **Chặn:** 3 deps on-chain chưa deploy Preview (TAAD anchor Active, Reserve `meter_nft`, policy FINAL) → "NO-GO có cơ sở". Long backend (mint-lamp endpoint) + threshold `@Min(2)` (nhánh `fix/47-low-cleanup`) chưa merge.

## Changelog
- 2026-08-05: đo lại host — `api.phoenixkey.me/api/v1/actuator/health` trả **200 `{"status":"UP"}`**
  (ngày 30/07 còn 502 toàn bộ). `/health` và `/v3/api-docs` trả 404 Tomcat, đúng thiết kế vì đường
  thật có tiền tố `/api/v1` — không phải hồi quy. Trục danh tính hết bị chặn ở tầng hạ tầng.
- 2026-08-04: PR #116 merged — `/wallet/{did}/all`, `/wallet/standard/{did}`, `/wallet/{did}/balance` chuyển sang bắt buộc Bearer + ép `caller_did == path_did`. Cập nhật HEAD `b4c4ce2`, thêm 🔒 vào bảng. Thư Phoenix 2026-08-04.
- 2026-08-03 (lần 2): hợp đồng đổi `validUntilSlot` → **`validTtlSeconds`** sau phản hồi của
  SuperApp; chốt thêm nonce (app sinh, TTL 10 phút), Grant là bí mật (cất Enclave), và app phải
  lưu Grant bền.
- 2026-08-03: `mint-lamp` = **Grant uỷ quyền** (PR #119) chứ không phải lệnh đúc — kèm hợp đồng
  đầy đủ + danh sách việc app phải sửa. Bổ sung 2 proxy ví còn thiếu vào mục CHƯA có.
- 2026-07-11: tạo file (5-agent cross-ref).
