# ProofChat — SuperApp Integration

> Chuẩn: `SuperApp/Integration-Standard.md`. Snapshot: 2026-07-11.
> Module SuperApp: **Trò-chuyện** (E2EE MLS + socket.io).

## HEAD
- BE main = `52a41db` (07-04), WS main = `78a902e` (07-04). Fix mới ở branch `fix/audit-2026-07-09` → **PR [BE#58](https://github.com/ProofChat/BE/pull/58) + [WS#36](https://github.com/ProofChat/WS/pull/36) OPEN, chưa merge**.
- Contract: `ProofChat/INTEGRATION.md` (v2026-07-04, đã qua audit BE#11/#15).

## Base URL (Option B — chốt qua BE#15 MERGED)
- REST: `https://api.proofchat.me/api/v1`
- WS: `wss://api.proofchat.me` · namespace `/chat` · **path `/ws/socket.io/` (BẮT BUỘC)** — nginx `/ws/` strip prefix. `transports:['websocket']` (polling bị chặn ngoài CORS allowlist).

## Auth
- `POST /auth/phoenixkey/login {sessionToken}` → `.data:{accessToken, refreshToken, userDid}`. WS token = **accessToken** (không phải session_token gốc).
- Response REST bọc `{data,message,statusCode,timestamp}` — payload ở `.data`.
- **503** = `PHOENIXKEY_ENABLED≠true` (KHÔNG phải 401). Rate limit login 5/60s.
- JWKS `api.phoenixkey.me/.well-known/jwks.json` (BE dùng để verify; hiện 404 + BE verify HS256, RS256 planned V1.2). HS256 sunset 2026-07-01 đã qua (BE#54 open).

## Events socket (dùng TÊN ĐÚNG — `contract:message.*`)
- Emit: `chat.room.join{roomId}` · `contract:message.send` · `contract:message.typing` · `contract:message.read` · `mls:sync.epoch`.
- Nhận: `contract:message.new` · `contract:message.typing/read/pinned/unpinned` · `mls:sync.epoch` · `mls:device.joined` · `error:auth`.
- ⚠️ Tên `chat:*` (FE#6/WS#2 gốc) là **SAI** — đã sửa thành `contract:message.*` (PR#15). ĐỪNG dùng `chat:typing`... (rà lại TODO trong SuperApp PR #39 — có thể ghi ngược chiều).
- Chưa implement: `chat:message.delivered/reaction.added`, `presence:update`.

## MLS
- Ciphersuite `MLS_128_DHKEMP256_AES128GCM_SHA256_P256`. Endpoint `/mls/keypackage[/status]`, `/mls/keypackages/batch`, `/mls/keypackages/room/:id`, `/mls/epoch-sync[/:id/current]`.

## Env cho SuperApp
```
PROOFCHAT_BACKEND_ENABLED=false   # true khi staging up + creds
PROOFCHAT_API_URL=https://api.proofchat.me/api/v1
PROOFCHAT_WS_URL=wss://api.proofchat.me
PROOFCHAT_WS_PATH=/ws/socket.io/
```
Không có API-key tĩnh — chỉ cần accessToken từ login. Service sẵn: `proofchat-api.ts`, `proofchatAuthBridge.ts`, `chatSocket.ts`.

## Readiness
- 🔴 **Staging 502** (live 07-11). Gốc = **BE#58 chưa merge** (thiếu `PHOENIXKEY_JWT_ISS/JWT_AUD` trong docker-compose.prod → app-token 401). **Cần merge BE#58 + deploy lại.**
- `PHOENIXKEY_ENABLED` chưa chắc đã bật (BE#13 đóng do fix root-cause, chưa smoke-test 200; việc bật cờ "chờ anh Đức thao tác").
- 🔴 **BLOCKER interop:** web dùng `stakeAddress`, mobile `did:phoenix` — migration đang làm chưa xong (MLS keypackage route còn param `:stakeAddress`). Cross-platform 1 user có thể 2 identity.

## Changelog
- 2026-07-11: tạo file (5-agent cross-ref).
