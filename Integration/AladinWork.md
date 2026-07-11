# AladinWork — SuperApp Integration

> Chuẩn: `SuperApp/Integration-Standard.md`. Snapshot: 2026-07-11.
> Module SuperApp: **Việc-làm** (jobs/contracts/pledge/match).

## HEAD
- `aladin-backend` HEAD = `8040617` (2026-07-07, "artifact deploy production, sẵn sàng non-mock").
- Version **0.2.0** (bump `c5f0628` 07-05, khớp spec SuperApp v0.2.0 — **lệch version cũ đã hết**).
- Message mới nhất: `messages/08-SuperApp-enable-reply.md` (07-07).

## Base URL — CHƯA có host live
- Context `/api/v1`, port 7040. `WORK_API_URL=http://<host>:7040/api/v1` — `<host>` còn **placeholder**. Docker image `aladinwork/aladin-backend:0.2.0` sẵn (compose+DEPLOY.md) nhưng CHƯA chạy trên máy reachable.
- Prod PHẢI để `*_MOCK=0`.

## Auth — PhoenixKey login → session Bearer (KHÔNG static token)
- `POST /auth/challenge {did}` → `{challenge, domain, expiresAt}`.
- Ký **P-256** message `${challenge}:${domain}:${timestamp}` (sha256, DER hex).
- `POST /auth/verify {did, challenge, signature, timestamp}` → `{session, expiresAt}`. **503 `PHOENIXKEY_UNAVAILABLE`** (dịch vụ chết) ≠ 401 (token sai).
- Route khác: `Authorization: Bearer <session>`. Resolve pubkey qua PhoenixKey: `GET {PHOENIXKEY_URL}/api/v1/identity/{did}/pubkey`.

## Endpoints chính
| Method·Path | Field |
|---|---|
| GET `/jobs` `?openOnly` · POST `/jobs` | tạo tin `{templateKey,title,quantity,priceVND,aladinPledge,geniePledge,req,deadlineDays}` |
| GET `/jobs/:id/match` | → `{weights, candidates:[{did,name,qualified,available,score,priceVND}]}` |
| POST `/capabilities` · `/capabilities/:id/verify` | credential (Stamp) |
| POST `/contracts` | `{jobId,candidateDid}` hoặc `{offeringId,...}` → gate `qualified` (409 NOT_QUALIFIED) |
| POST `/contracts/:id/:action` | action∈[lockPledge,activate,deliver,confirmPayment,mutualRelease,forfeit,dispute]. lockPledge `{side,amount}` khoá **CARP** min 100 → 402 NO_FUNDS |
| POST `/contracts/:id/conversation` | → ProofChat `{conversationId,url}` |

State: INIT→PENDING→COMMITTED→ACTIVE→DELIVERED→RELEASED (+FORFEITED/DISPUTED).

## Token model — CHỐT
- **3 ví: walletMAGIC + walletLAMP + walletCARP.** MAGIC=định giá (phi-chuyển, escrow không đụng); **CARP=thanh toán** (pledge+phí, `402 NO_FUNDS`=thiếu CARP); LAMP=backing.
- **ADA KHÔNG user-facing** — chỉ demo onchain tuỳ chọn (action `'onchain'` ngoài ACTIONS chuẩn, cần `WALLET_SEED`+`BLOCKFROST`). "CARP gộp MAGIC" (v0.3) **DEPRECATED 07-03**.

## Env cho SuperApp
```
WORK_API_URL=http://<host>:7040/api/v1   # <host> chưa có
WORK_BACKEND_ENABLED=true                # bật sau khi có host
```
Backend cần: `AUTH_HMAC_SECRET`, `PHOENIXKEY_URL` thật, `PHOENIXKEY_MOCK=0` (`DEPLOY.md`).

## Readiness
- 🟡 **Code SẴN SÀNG** (0.2.0 non-mock + Docker+compose+DEPLOY.md). Blocker = **hạ tầng**: chưa có host chạy + chưa set `AUTH_HMAC_SECRET`/`PHOENIXKEY_URL`.
- Phụ thuộc con: token MAGIC/CARP on-chain thật chưa có (escrow = off-chain accounting DB); `credentialArchetype` chờ VeData lock.

## Changelog
- 2026-07-11: tạo file (5-agent cross-ref).
