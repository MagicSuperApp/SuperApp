# PhoenixKey — SuperApp Integration

> Chuẩn: `SuperApp/Integration-Standard.md`. Snapshot: 2026-07-11.
> Module SuperApp: **DID login · Ví (Standard/Phoenix) · OrgDID/Mint LAMP**.

## HEAD
- `PhoenixKey-Database` main = `6c45962` (2026-06-12). Việc mint LAMP nằm ở **worktree local CHƯA merge** (xem Readiness).

## Base URL / JWKS
- REST: `http://localhost:8080/api/v1` (dev); prod dự kiến `https://api.phoenixkey.me/api/v1` (⚠️ domain chưa thấy trong CORS list — [NEEDS-EVIDENCE]).
- JWKS: `GET /.well-known/jwks.json` (Ed25519, `kid=phoenixkey-ed25519-1`). ⚠️ Live = **404** hiện tại; backend đang verify HS256 (RS256/JWKS planned V1.2).

## Auth — token-exchange qua ServiceDID
- `POST /auth/token/exchange {sessionToken, aud=<ServiceDID app>, redirectUri, nonce?}` → `{appToken(JWT EdDSA), userDid}`.
- `redirectUri` phải khớp EXACT một `serviceEndpoint[]` trong DID Document của ServiceDID (nguồn on-chain). **SuperApp phải đăng ký ServiceDID on-chain** — không có "app registry" ở backend.
- DID người: `did:phoenix:<slot13 base32>:<hash64 hex>`.

## Endpoints ĐÃ SẴN (🟢)
| Method·Path | Field |
|---|---|
| POST `/wallet/standard/register` 🔒 | `fixed_address`* (bech32, idempotent), `active_address?`, `stake_address?` |
| GET `/wallet/standard/{userDid}` | → `{addresses:{fixed,active,stake}, balances:{lovelace,lamp,carp}}`, 404 nếu chưa register |
| GET `/wallet/{userDid}/all` | gộp ví phoenix+standard + `magic{}` (magic=0 tới khi vault wired). **Đây là API app NÊN dùng** |
| POST `/identity/org/create` · `/founding`(m-of-n) · `/{orgDid}/upgrade-authority` | tạo/quản OrgDID |

**Deprecated (đừng dùng):** `/wallet/register`, `/wallet/{did}/balance` (V1).

## Endpoints CHƯA có (app gọi nhưng backend thiếu — grep 0 hit)
- `mint-lamp` + `mint-lamp/submit-tx` (issue giao Long còn DRAFT chưa post: `DRAFT-Long-issue-lamp-mint-2026-07-10.md`).
- `did-payment/build-tx` + submit (Phase 2, chưa deploy).
- `GET /identity/org` (list OrgDID theo owner).

## Env / Creds cho SuperApp
- KHÔNG có API-key/client-secret kiểu OAuth — cơ chế = **ServiceDID on-chain + JWKS**.
- `PHOENIXKEY_API_URL=https://api.phoenixkey.me/api/v1`. Artifact mint (`REGISTRY_NFT_POLICY_ID`, `LAMP_POLICY_CBOR_HEX`, `SUPPLY_STATE_SCRIPT_CBOR_HEX`, `TAAD_POLICY_ID_HEX`, `KHO_NFT_POLICY_ID`...) đọc `.env` — **CHƯA có giá trị** (chờ LAMP Genesis deploy bản B). `BLOCKFROST_KEY` SuperApp tự cấu hình (không qua PhoenixKey).

## Readiness
- Ví Standard: 🟢 **backend sẵn, app CHƯA nối** — thêm client `wallet.registerStandard/getStandard/getAllWallets`, đổi V1 `getBalance`→`/wallet/{did}/all`.
- Ví Phoenix (did-payment ký): 🔴 backend chưa có.
- **Mint LAMP: 🔴 NO-GO.** Nguồn mint tiến xa nhất = worktree **`/Projects/_wt-superapp-mint`** (branch `claude/superapp-orgdid-mint`, HEAD `a0c11593` 07-11): build tx Rust FFI on-device → submit THẲNG Blockfrost (bỏ qua backend), bản B. cargo 150/150, tsc 0. **Chặn:** 3 deps on-chain chưa deploy Preview (TAAD anchor Active, Reserve `meter_nft`, policy FINAL) → "NO-GO có cơ sở". Long backend (mint-lamp endpoint) + threshold `@Min(2)` (nhánh `fix/47-low-cleanup`) chưa merge.

## Changelog
- 2026-07-11: tạo file (5-agent cross-ref).
