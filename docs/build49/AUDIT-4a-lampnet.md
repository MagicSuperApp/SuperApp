# AUDIT — Session 4a — LampNet `/upload` (Build 49 staging)

**Agent:** BackendDeploy-4a
**Date:** 2026-05-16
**Branch:** `claude/session-4a-lampnet-upload` (in `LampNetCloud/lampnet-hivemind`)
**PR:** https://github.com/LampNetCloud/lampnet-hivemind/pull/2 (open, **NOT merged**)
**Deploy URL (intended):** https://api.lampnet.cloud
**Deploy URL (working):** Tiger `http://localhost:8080` (container `lampnet-upload`)
**Status:** ⚠️ Service is healthy and fully exercised on Tiger localhost; Cloudflare front for `api.lampnet.cloud` is NOT yet routing to it (still resolves to the legacy `lampnet-node` SuperNode on host port 6480). Cloudflare tunnel reconfiguration is owned by the user (Δ2) and outside this agent's authority.

---

## 1. Files created / modified

| Path | Status | Lines | Purpose |
|---|---|---|---|
| `lampnet-hivemind/lampnet-mirage/src/upload_server.rs` | new | 239 | axum router (`/health`, `/upload`), multipart parsing, blake3 CID, idempotent persist, constant-time X-API-Key auth, ENOSPC → 503 |
| `lampnet-hivemind/lampnet-mirage/src/bin/lampnet-upload.rs` | new | 69 | env-driven entrypoint (`BIND_ADDR`, `ALLOWED_API_KEYS`, `STORAGE_DIR`); refuses to boot with empty key list |
| `lampnet-hivemind/lampnet-mirage/src/lib.rs` | modified | +1 | `pub mod upload_server;` |
| `lampnet-hivemind/lampnet-mirage/Cargo.toml` | modified | +13 | adds `tracing`, `tracing-subscriber`, `tower-http` `limit` feature, explicit `[[bin]]` for `lampnet-upload` |
| `lampnet-hivemind/lampnet-mirage/Dockerfile.upload` | new | 44 | multi-stage build (`rust:1.91-slim-bookworm` → `debian:bookworm-slim`), non-root uid 10001 |
| `lampnet-hivemind/Cargo.lock` | modified | +2 | toolchain-managed |
| `LampNetCloud/docker-compose.upload.yml` | new (untracked) | 39 | binds `127.0.0.1:8080` → container `8080`; joins external `sam3-prod-network`; `lampnet-bundles` named volume; wget healthcheck |

`docker-compose.upload.yml` lives one level above the `lampnet-hivemind` git repo and is intentionally not part of PR #2 — its parent directory `LampNetCloud/` is not a git working tree. It is synced to Tiger via rsync.

Total new code: **391 lines**.

---

## 2. Module logic

### `upload_server.rs`
- `router(AppState) -> Router` mounts `GET /health` and `POST /upload`, applies `DefaultBodyLimit::max(50 MB)`. State carries `Arc<Vec<Vec<u8>>>` for allowed keys and `Arc<PathBuf>` for storage dir (both cheap to clone per-request).
- `authorize()` uses constant-time XOR-fold compare and iterates the full allowed-key list regardless of an early match — no timing oracle on key length or position.
- Multipart loop accepts two named fields:
  - `payload` (text JSON): parsed best-effort to extract `device_id` for the log line; signature **not** verified (deviation B per `CONTRACT.md`).
  - `file` (binary): collected with `field.bytes()`; `MultipartError::status() == 413` is mapped to `UploadError::PayloadTooLarge`.
- CID: `blake3::hash(file_bytes)`, take first 16 bytes → 32-char lowercase hex → `cid = format!("lamp://ln1q_{}", hex16)`. Deterministic.
- Persist: write to `${STORAGE_DIR}/{hex16}.tar` via temp-and-rename (`.tar.tmp` → `.tar`) for crash safety. If destination already exists, skip the write entirely (`upload deduplicated` log). On ENOSPC (raw_os_error 28) → `503 {"error":"storage_full"}`.
- Response: `200 {"cid":"lamp://ln1q_<hex16>","size_bytes":N}` (matches `CONTRACT.md` lock).

### `bin/lampnet-upload.rs`
- Reads `BIND_ADDR` (default `0.0.0.0:8080`), `ALLOWED_API_KEYS` (required, comma-split, refuses to boot on empty), `STORAGE_DIR` (default `/var/lib/lampnet/bundles`), `RUST_LOG` (default `info`).
- Init order: tracing → config → ensure storage dir → bind → serve. Errors at any step surface as a typed `Box<dyn Error>` and exit non-zero.

### `Dockerfile.upload`
- Builder: `rust:1.91-slim-bookworm` (originally specified `1.83`, but the workspace uses `edition = "2024"` which requires cargo ≥ 1.85 — see Issue #1 below). Installs `pkg-config libssl-dev build-essential`, copies `lampnet-hivemind/`, runs `cargo build --release -p lampnet-mirage --bin lampnet-upload`.
- Runtime: `debian:bookworm-slim` + `ca-certificates libssl3 wget`. Creates system user `lampnet` (uid 10001, gid 65534 nogroup), mkdir + chown `/var/lib/lampnet/bundles`, copies binary, `USER 10001:nogroup`, `EXPOSE 8080`.

### `docker-compose.upload.yml`
- Build context `LampNetCloud/`, dockerfile path `lampnet-hivemind/lampnet-mirage/Dockerfile.upload`. Image tag `orilife/lampnet-upload:0.1.0`.
- Port binding `127.0.0.1:8080:8080` (loopback only, per hard constraint).
- Joined to `sam3-prod-network` (external) so MeshGPU (4c) can dial `lampnet-upload:8080` internally without the Cloudflare hop.
- Named volume `lampnet-bundles` for persistence across restarts.
- Healthcheck `wget -qO- http://localhost:8080/health` every 30 s (5 s timeout, 3 retries).

---

## 3. Build & deploy commands run

### Local check (Mac, rustc 1.91.0)
```bash
cd /Users/ductiger/Projects/LampNetCloud/lampnet-hivemind
cargo check -p lampnet-mirage --bin lampnet-upload   # clean
cargo build -p lampnet-mirage --bin lampnet-upload   # clean
```

### Git
```bash
cd /Users/ductiger/Projects/LampNetCloud/lampnet-hivemind
git checkout -b claude/session-4a-lampnet-upload
git add lampnet-mirage/Cargo.toml lampnet-mirage/src/lib.rs \
        lampnet-mirage/src/upload_server.rs lampnet-mirage/src/bin/lampnet-upload.rs \
        lampnet-mirage/Dockerfile.upload Cargo.lock
git commit -m "feat(mirage): /upload HTTP endpoint for Build 49 staging"
git push -u origin claude/session-4a-lampnet-upload
gh pr create --title "..." --body "..."  # → PR #2
```

### Deploy (Tiger)
```bash
# Sync source
rsync -a --exclude='target/' --exclude='.git/' --exclude='__pycache__/' \
   -e 'ssh -o ConnectTimeout=15' \
   /Users/ductiger/Projects/LampNetCloud/ tiger-cloud:~/repos/LampNetCloud/

# Build + run (LAMPNET_API_KEY supplied inline — see Issue #2 re: env file)
ssh tiger-cloud 'cd ~/repos/LampNetCloud && \
  sudo -E env LAMPNET_API_KEY=<32-byte-hex> \
    docker compose -f docker-compose.upload.yml up -d --build'
```

Build wall-clock on Tiger: **~2 min** (release profile, ~50 deps from the workspace, no sccache).

### Status post-deploy
```
$ ssh tiger-cloud 'sudo docker ps --filter name=lampnet-upload --format "{{.Status}}"'
Up 33 seconds (healthy)
```

Boot log:
```
INFO lampnet_upload: lampnet-upload starting bind=0.0.0.0:8080 storage=/var/lib/lampnet/bundles key_count=1
```

---

## 4. Smoke test transcripts

### 4.1 Health — Tiger localhost (✓)
```
$ ssh tiger-cloud 'curl -fsS http://localhost:8080/health'
{"status":"ok"}
```

### 4.2 Upload happy path — Tiger localhost (✓)
```
$ ssh tiger-cloud 'curl -sS -X POST http://localhost:8080/upload \
    -H "X-API-Key: <staging>" \
    -F "payload={\"device_id\":\"smoke-4a\",\"nonce\":\"abc\",\"signature\":\"stub\"}" \
    -F "file=@/tmp/sample-4a.tar"'
{"cid":"lamp://ln1q_b97803e97b51a6ed78566e257d49db08","size_bytes":10240}
```

Container log line:
```
INFO lampnet_mirage::upload_server: upload stored device_id=smoke-4a
  cid=lamp://ln1q_b97803e97b51a6ed78566e257d49db08 size_bytes=10240
```

### 4.3 Idempotency — same file → same CID (✓)
```
$ ssh tiger-cloud 'curl -sS -X POST http://localhost:8080/upload [same args]'
{"cid":"lamp://ln1q_b97803e97b51a6ed78566e257d49db08","size_bytes":10240}
```

Container log line:
```
INFO lampnet_mirage::upload_server: upload deduplicated device_id=smoke-4a
  cid=lamp://ln1q_b97803e97b51a6ed78566e257d49db08 size_bytes=10240
```

Disk state inside container:
```
$ sudo docker exec lampnet-upload ls -la /var/lib/lampnet/bundles
-rw-r--r-- 1 lampnet nogroup 10240 May 16 02:36 b97803e97b51a6ed78566e257d49db08.tar
```
(Single file, no `.tar.tmp` left behind, no `lamp://` prefix on disk — matches spec.)

### 4.4 Bad auth → 401 (✓)
```
$ ssh tiger-cloud 'curl -isS -X POST http://localhost:8080/upload \
    -H "X-API-Key: wrongkey" -F "payload={}" -F "file=@/tmp/sample-4a.tar"'
HTTP/1.1 401 Unauthorized
content-type: application/json
{"error":"unauthorized"}
```

### 4.5 Missing auth → 401 (✓)
```
$ ssh tiger-cloud 'curl -isS -X POST http://localhost:8080/upload \
    -F "payload={}" -F "file=@/tmp/sample-4a.tar"'
HTTP/1.1 401 Unauthorized
{"error":"unauthorized"}
```

### 4.6 External health via Cloudflare — ⚠️ MISROUTED
```
$ curl -fsS https://api.lampnet.cloud/health
{"node_id":"12D3KooWP9hAzqj7ZxKZqFpdmBffXCcVq1tosyzgCUt4PosE67Su",
 "role":"SuperNode","status":"healthy","uptime_secs":299692}
```

That is the response from the legacy `lampnet-node` host process bound to `0.0.0.0:6480` (PID 1786535 on Tiger), NOT from our container. See Issue #3 below.

### Sample CID for downstream (4b/4c) testing
`lamp://ln1q_b97803e97b51a6ed78566e257d49db08` — 10 240-byte tarball of a single 36-byte text file. Stable across redeploys (deterministic from bytes).

---

## 5. Issues encountered and resolutions

### Issue #1 — `rust:1.83-slim-bookworm` cannot compile the workspace (`edition = "2024"` requires cargo ≥ 1.85)
- **Symptom:** First build failed with `feature 'edition2024' is required ... not stabilized in this version of Cargo (1.83.0)` while parsing `lampnet-types/Cargo.toml`.
- **Cause:** The DEPLOY-PLAN suggested `rust:1.83-slim-bookworm`; the workspace `Cargo.toml` declares `edition.workspace = true` → `edition = "2024"`, which only became stable in cargo 1.85 (Feb 2025).
- **Fix:** Bumped builder image to `rust:1.91-slim-bookworm` (Dockerfile.upload line 13). Build then completed cleanly in ~2 min.

### Issue #2 — `~/.orilife-deploy.env` is not valid POSIX sh syntax
- **Symptom:** `source ~/.orilife-deploy.env` printed shell errors (`BackendDeploy.: command not found`, `syntax error near unexpected token ')'`), so the file aborted before defining `LAMPNET_API_KEY`.
- **Cause:** The file contains prose lines (e.g. section banners, Vietnamese comments) that are not commented-out with `#`.
- **Workaround:** Per the CLAUDE.md "DO NOT change env/config files" rule, I did NOT edit the env file. Instead I passed `LAMPNET_API_KEY=<value>` inline to the `docker compose` command (the value is the shared staging key from the mission spec, also visible in `session-4-DEPLOY-PLAN.md` §0). The container picks it up via the compose `environment:` block.
- **Recommendation:** The user should re-format `~/.orilife-deploy.env` so all non-`KEY=VALUE` lines are prefixed with `#`. Otherwise every future deploy will need the inline override (which leaks the key into shell history / sudo audit logs on Tiger). Filed as TODO below.

### Issue #3 — `https://api.lampnet.cloud` still routes to legacy `lampnet-node`, not to `lampnet-upload`
- **Symptom:** `GET /health` via Cloudflare returns the SuperNode peer-id JSON; `POST /upload` returns `404 "Not a valid CID: upload"` (lampnet-node treats the path as a CID lookup).
- **Cause:** The cloudflared tunnel ingress for `api.lampnet.cloud` is pointed at the existing host process `lampnet-node` listening on `0.0.0.0:6480` (PID 1786535), not at `localhost:8080` where our new container is bound. Δ2 in the deploy plan ("Cloudflare hostname `api.lampnet.cloud` is already routed by the user to `localhost:8080`") was not completed in the way the spec assumed.
- **Constraint:** The mission explicitly forbids modifying the cloudflared config ("DO NOT change cloudflared config (already done by user — Δ2)"), so I did not attempt to re-route.
- **Resolution required from the user:** in the Cloudflare Zero Trust dashboard, edit the public-hostname rule for `api.lampnet.cloud` so the service target is `http://localhost:8080` (the `lampnet-upload` container) instead of the legacy `lampnet-node:6480` upstream. Once flipped, the smoke commands in §4 will succeed end-to-end against the public URL. **Sub-agents 4b and 4c can still proceed** since they reach this service via the internal name `http://lampnet-upload:8080` on `sam3-prod-network`, not via Cloudflare.

---

## 6. Test coverage

No new unit/integration tests were added in this PR — staging-quality OK per `session-4-backend-deploy.md` constraints ("KHÔNG production-grade hardening v1 — staging-quality OK"). Coverage of the new module is **0%**; the four smoke scenarios in §4 cover the happy path, idempotency, and both auth-failure branches at black-box level.

**TODO (next session):** add `tests/upload_server.rs` integration tests for:
- 413 on >50 MB body
- 503 on simulated ENOSPC (mock storage dir with `chmod -w` or `mount tmpfs size=4k`)
- Multipart with neither `file` nor `payload` → 400
- Multipart with `file` only (no `payload`) → 200 (current behaviour: payload optional in the v1 stub)
- Concurrent uploads of the same bytes (race on rename) — current temp-then-rename should be safe

---

## 7. Deploy instructions (reproducible)

```bash
# Mac → Tiger sync
rsync -a --exclude='target/' --exclude='.git/' --exclude='__pycache__/' \
   -e 'ssh -o ConnectTimeout=15' \
   /Users/ductiger/Projects/LampNetCloud/ tiger-cloud:~/repos/LampNetCloud/

# On Tiger: build + run (loopback only)
ssh tiger-cloud 'cd ~/repos/LampNetCloud && \
  sudo -E env LAMPNET_API_KEY=8548dcc5b7fca592dfa40d17299494ef19070c98df2a2d2a7a4153033237df16 \
    docker compose -f docker-compose.upload.yml up -d --build'

# Healthcheck
ssh tiger-cloud 'sudo docker ps --filter name=lampnet-upload --format "{{.Status}}"'
# expect: Up N seconds (healthy)

# Tail logs
ssh tiger-cloud 'sudo docker logs lampnet-upload --tail 50 -f'
```

### Rollback
```bash
ssh tiger-cloud 'cd ~/repos/LampNetCloud && \
  sudo docker compose -f docker-compose.upload.yml down'
```
Bundles in the `lampnet-bundles` named volume are preserved on `down`. To wipe persisted data: add `-v` to the down command (destroys the named volume).

---

## 8. TODO & open risks

| # | Severity | Item |
|---|---|---|
| 1 | **HIGH** | User must flip cloudflared ingress for `api.lampnet.cloud` → `http://localhost:8080`. Without this, mobile clients (Capture3DAPI / Upload3DQueue) cannot reach the new service through its production hostname. Internal traffic (MeshGPU 4c) is unaffected (uses `lampnet-upload:8080` on `sam3-prod-network`). |
| 2 | medium | Re-format `~/.orilife-deploy.env` so non-`KEY=VALUE` lines are commented (`#`-prefixed) — currently aborts on `source` at line 7. |
| 3 | medium | Add integration tests (see §6) before promoting to production. |
| 4 | low | ECDSA signature verification on `payload` is deliberately stubbed (deviation B). Lift in v2.1 per `session-4-DEPLOY-PLAN.md` §9. |
| 5 | low | `ALLOWED_API_KEYS` is a single static value shared across all callers — fine for staging, but production needs per-device key rotation (Vault is already running on Tiger as `phoenixkey-server-vault`). |
| 6 | low | No request-rate limiting yet — a misbehaving client could fill the named volume. Tiger has ~plenty of free disk so this is not urgent for staging. |

---

## 9. Hand-off to orchestrator

- **For 4b (MeshAPI):** Database remains untouched by this sub-task. The sample CID `lamp://ln1q_b97803e97b51a6ed78566e257d49db08` is available in the storage volume and can be referenced from a `captures` row whenever 4b is ready.
- **For 4c (MeshGPU worker):** Service is reachable at `http://lampnet-upload:8080` on `sam3-prod-network`. The container exposes only `GET /health` and `POST /upload`. There is currently NO download endpoint — if MeshGPU needs to fetch the original TAR bytes by CID, that's a follow-up (the file lives at `/var/lib/lampnet/bundles/<hex16>.tar` inside the container; mount the same `lampnet-bundles` volume read-only into the worker, or add `GET /bundles/{cid}` here in a later commit).
- **For Session A (mobile):** External URL `https://api.lampnet.cloud` will only work once Issue #3 is resolved. In the meantime, set `LAMPNET_BASE_URL` to the Tiger-internal address for any device on the same network, or use `cloudflared access` token, or wait for the user's tunnel flip.
