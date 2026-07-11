# LampNet — SuperApp Integration

> Chuẩn: `SuperApp/Integration-Standard.md`. Snapshot: 2026-07-11.
> Module SuperApp: **Kết đèn** (Join thiết bị + đóng góp compute/lưu trữ).

## HEAD
- `LampNetCloud` (Specs) origin/main = `479a12f` (07-01). `lampnet-hivemind` (daemon code thật) origin/main = `506c611` (07-11).
- Doc join: `lampnet-hivemind/docs/join-ket-den.md`, `Specs/_shared/SuperApp-Join-Integration.md`.
- ⚠️ SuperApp Join integration **vẫn PENDING** (chưa giao/chưa làm); bridge mobile-sdk đổi UniFFI→**C-ABI** (07-08, chưa làm).

## Base URL
- Prod `https://lampnet.cloud`. API daemon thật = `api.lampnet.cloud:6480`. Upload = `POST {BASE}/mirage/put` (multipart).
- Env `LAMPNET_BASE_URL` (mặc định `https://lampnet.cloud`). ⚠️ `LAMPNET_UPLOAD_URL` **KHÔNG thấy trong repo** [NEEDS-EVIDENCE] — có thể chỉ là biến app-side.

## Auth — khác nhau theo endpoint
- `POST /v1/join/v2/request`: **public** (không Bearer) — xác thực bằng chữ ký Ed25519 device (challenge_sig/attest_sig).
- `POST /mirage/put`: **Bearer BẮT BUỘC** (`LAMPNET_API_UPLOAD_TOKEN`). ⚠️ Doc cũ ghi "không auth" là SAI (auth thêm từ 07-06-03). Lấy token runtime qua `GET /v1/signaling_config` (public, trả `api_token`).
- `subject_did` = `did:phoenix:...` (PhoenixKey thật chưa có → test dùng `did:phoenix:tmp:<device_id>` LoA=0).

## Endpoints Kết đèn
| Bước | Method·Path | Auth |
|---|---|---|
| Bootstrap | GET `/v1/peer_id` · `/v1/network_info` | không |
| Join | POST `/v1/join/v2/request` (JoinV2RequestBody: nonce, sigs, subject_did, fingerprint, attestation...) → `{decision, score, tier, certificate}` | không |
| Kích hoạt ví | POST `/v1/wallet/activate` (rep≥50) | [NEEDS-EVIDENCE] |
| Compute | POST `/v1/mobile/lease` → `/payload/:id` → `/report` (daemon recompute-verify) | [NEEDS-EVIDENCE] |
| Quyết toán | POST `/v1/mobile/settlement` | Bearer |
| Poll | GET `/v1/node/stats` · `/v1/reward/epoch` | không |
| Upload | POST `/mirage/put` (`file,doc_type,redundancy,data_class`) → CID | Bearer |

## Env / Creds
- `LAMPNET_API_UPLOAD_TOKEN` (Bearer /mirage/put) — ⚠️ **chưa set live trên 3 node prod** → token thật hiện = fallback dev. Lấy runtime qua `/v1/signaling_config`.
- `LAMPNET_SIGNALING_SECRET`, `LAMPNET_NODE_SEED` = server-side, KHÔNG cho app.

## Readiness
- 🟡 Join + compute **chạy thật có test** (107+ test pass). Nhưng:
- 🔴 **Chưa nhận MAGIC thật** — thưởng chỉ µLAMP in-memory, settlement Cardano = **dry-run** ("DRY_RUN_NO_TX_SUBMITTED").
- 🔴 Storage contribution = **NotImplemented** (chỉ góp compute).
- 🔴 PhoenixKey DID thật chưa có (dùng tmp LoA=0).
- ⚠️ Doc vs code lệch (/mirage/put auth), upload token chưa live prod, bridge C-ABI chưa làm.

## Changelog
- 2026-07-11: tạo file (5-agent cross-ref).
