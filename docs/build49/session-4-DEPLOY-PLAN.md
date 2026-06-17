# Session 4 — DEPLOY PLAN (post-Δ unlock)

> Authored by BackendDeploy orchestrator. Single source of truth for the 3 sub-agents (4a, 4b, 4c). Read this BEFORE spawning agents. Updated 2026-05-16 after pre-flight on Tiger.

## 0. Shared facts (do not re-derive)

| Fact | Value |
|---|---|
| Tiger SSH host (Mac) | `tiger-cloud` (via `~/.ssh/config`, cloudflared tunnel) |
| Tiger user | `ductiger` |
| Tiger source mirror | `~/repos/{LampNetCloud,orilife-core,orilife-mesh-worker}` (rsynced 2026-05-16) |
| GPU | RTX 5060 Ti 16311 MiB, driver supports `--gpus all` |
| Docker | 29.3.1; `ductiger` NOT yet in docker group → use `sudo docker` (or run `sudo usermod -aG docker ductiger && newgrp docker` first) |
| Existing Docker network | `sam3-prod-network` (bridge, joins existing `sam3-postgres-prod`) |
| Existing Postgres container | `sam3-postgres-prod` — postgis/postgis:16-3.4. Hostname on `sam3-prod-network` = `sam3-postgres-prod`. Internal port `5432`. |
| Postgres credentials | Loaded from `/home/ductiger/.orilife-deploy.env` (Δ1, user-created). Contains `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=sam3`. **Source it, do NOT echo, do NOT cat into logs.** |
| Cloudflare tunnel | Token-managed, ID `4e244e62-2508-4632-aa42-d6b5efee2bb6`, runs as systemd `cloudflared.service` (root). Config in Cloudflare dashboard, not on disk. |
| LampNet API key (shared) | `LAMPNET_API_KEY=8548dcc5b7fca592dfa40d17299494ef19070c98df2a2d2a7a4153033237df16` (generated 2026-05-16 for staging only — rotate on prod cut-over) |
| Port allocation | LampNet `/upload` → host `127.0.0.1:8080`; orilife-core → host `127.0.0.1:8000`. Both also reachable inside `sam3-prod-network` by container name. |
| External URLs (post-Δ2) | `https://api.lampnet.cloud` → `localhost:8080`; `https://api.orilife.io` → `localhost:8000` |
| Existing ports in use on Tiger | 80/443 (Caddy), 8002 (a docker-proxy). 8000/8080 are free. |

## 1. Δ pre-checks (BackendDeploy orchestrator runs these; do not spawn agents until ALL green)

```bash
# Δ1 — env file exists and is readable
ssh tiger-cloud 'test -r ~/.orilife-deploy.env && grep -c POSTGRES_PASSWORD ~/.orilife-deploy.env'
# Expect output: 1

# Δ2 — Cloudflare hostnames resolve to the tunnel (NOT NXDOMAIN, NOT pointing
# elsewhere). Use dig from local Mac because cloudflared tunnel ingress
# is resolved via Cloudflare edge, not host DNS:
dig +short api.lampnet.cloud
dig +short api.orilife.io
# Expect: each returns the Cloudflare Argo IP set (104.21.x or 172.67.x).
# A negative result here means the user has not added Public Hostnames yet.

# Δ3 — gh auth on Tiger
ssh tiger-cloud 'gh auth status 2>&1 | grep -c "Logged in"'
# Expect: >=1
```

If any check fails → DO NOT proceed. Surface to user.

## 2. Shared docker-compose conventions

Each new service joins the existing `sam3-prod-network` external bridge. Each compose file declares:

```yaml
networks:
  default:
    name: sam3-prod-network
    external: true
```

This avoids creating sibling networks and lets services reach `sam3-postgres-prod` by name.

## 3. Sub-task 4a — LampNet `/upload` (Rust)

**Working dir (Mac):** `/Users/ductiger/Projects/LampNetCloud/lampnet-mirage` (workspace member of `lampnet-hivemind`).
**Working dir (Tiger):** `~/repos/LampNetCloud/lampnet-mirage`.

### Code additions

1. New module `src/upload_server.rs` (or extend existing `bin/lampnet-node.rs`):
   - axum 0.7 router with 2 routes:
     - `GET /health` → 200 OK `{"status":"ok"}`
     - `POST /upload` → consumes multipart with fields `payload` (JSON text) + `file` (binary, ≤50MB enforced via `DefaultBodyLimit::max(50 * 1024 * 1024)`).
     - Auth: header `X-API-Key` against `ALLOWED_API_KEYS` env (comma-separated). If missing/invalid → 401. (Stub v1: do NOT verify ECDSA inside payload — log only.)
     - Idempotency: compute `blake3(file_bytes)` → `cid = "lamp://ln1q_" + hex(hash[..16])` (deterministic, same bytes → same CID).
     - Storage: write file to `/var/lib/lampnet/bundles/{cid_without_scheme}.tar` (created via volume mount). If file exists, skip write.
     - Response: 200 `{"cid": "lamp://ln1q_...", "size_bytes": N}`.
   - Backpressure: on `ENOSPC` / disk full → 503 `{"error":"storage_full"}`.

2. Add binary entry `src/bin/lampnet-upload.rs` that:
   - Reads `BIND_ADDR` (default `0.0.0.0:8080`), `ALLOWED_API_KEYS`, `STORAGE_DIR` (default `/var/lib/lampnet/bundles`) from env.
   - Boots the axum router. JSON-structured logging to stdout (use `tracing` + `tracing-subscriber` with `EnvFilter`).

3. Update `lampnet-hivemind/Cargo.toml` workspace if new binary needs declaration (it does NOT — bins inside crate are auto-discovered).

### Dockerfile

`lampnet-mirage/Dockerfile.upload`:

```dockerfile
FROM rust:1.83-slim-bookworm AS builder
WORKDIR /build
COPY . .
# Build only the upload binary, release mode, against the hivemind workspace.
WORKDIR /build/lampnet-hivemind
RUN cargo build --release -p lampnet-mirage --bin lampnet-upload

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
RUN useradd -r -u 10001 -g nogroup lampnet
COPY --from=builder /build/lampnet-hivemind/target/release/lampnet-upload /usr/local/bin/
RUN mkdir -p /var/lib/lampnet/bundles && chown -R 10001:nogroup /var/lib/lampnet
USER 10001:nogroup
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/lampnet-upload"]
```

### docker-compose.upload.yml (in `LampNetCloud/`)

```yaml
services:
  lampnet-upload:
    build:
      context: .
      dockerfile: lampnet-mirage/Dockerfile.upload
    image: orilife/lampnet-upload:0.1.0
    container_name: lampnet-upload
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"
    environment:
      BIND_ADDR: "0.0.0.0:8080"
      ALLOWED_API_KEYS: "${LAMPNET_API_KEY}"
      STORAGE_DIR: "/var/lib/lampnet/bundles"
      RUST_LOG: "lampnet_upload=info,tower_http=info"
    volumes:
      - lampnet_bundles:/var/lib/lampnet/bundles
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:8080/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
networks:
  default:
    name: sam3-prod-network
    external: true
volumes:
  lampnet_bundles:
    name: lampnet-bundles
```

### Deploy steps

```bash
# 1. Code locally + commit (branch claude/session-4a-lampnet-upload)
cd /Users/ductiger/Projects/LampNetCloud
git checkout -b claude/session-4a-lampnet-upload
# … add files …
git add lampnet-mirage/src/upload_server.rs lampnet-mirage/src/bin/lampnet-upload.rs \
        lampnet-mirage/Dockerfile.upload docker-compose.upload.yml
git commit -m "feat(lampnet): /upload endpoint (build 49 staging)"

# 2. Push to Tiger
rsync -a --exclude='target/' --exclude='.git/' \
   -e 'ssh' \
   /Users/ductiger/Projects/LampNetCloud/ tiger-cloud:~/repos/LampNetCloud/

# 3. Build + run on Tiger
ssh tiger-cloud 'set -a; source ~/.orilife-deploy.env; \
  LAMPNET_API_KEY=8548dcc5b7fca592dfa40d17299494ef19070c98df2a2d2a7a4153033237df16; \
  cd ~/repos/LampNetCloud && \
  sudo -E docker compose -f docker-compose.upload.yml up -d --build'

# 4. Verify
ssh tiger-cloud 'sudo docker logs lampnet-upload --tail 20'
ssh tiger-cloud 'curl -fsS http://localhost:8080/health'  # expect 200
curl -fsS https://api.lampnet.cloud/health                # expect 200 via cloudflared
```

### Smoke test for 4a

```bash
# create a tiny test TAR
echo "test bundle" > /tmp/test.txt
tar -cf /tmp/test.tar /tmp/test.txt

# upload
curl -X POST https://api.lampnet.cloud/upload \
  -H "X-API-Key: 8548dcc5b7fca592dfa40d17299494ef19070c98df2a2d2a7a4153033237df16" \
  -F 'payload={"device_id":"smoke","nonce":"abc","signature":"stub"}' \
  -F 'file=@/tmp/test.tar'
# Expect: {"cid":"lamp://ln1q_<32 hex>","size_bytes":<N>}

# idempotency: re-run same file → same CID
```

---

## 4. Sub-task 4b — MeshAPI merge + migrations + deploy

**Working dir (Mac):** `/Users/ductiger/Projects/OriLifeTrace/orilife-core` (branch `feature/captures-3d-api`, PR #21 open).
**Working dir (Tiger):** `~/repos/orilife-core`.

### Steps

```bash
# 1. Merge PR #21 to main (locally)
cd /Users/ductiger/Projects/OriLifeTrace/orilife-core
git fetch origin
gh pr merge 21 --merge --delete-branch=false        # squash or merge per repo convention
git checkout main && git pull origin main

# 2. Add build49_extension.sql migration commit on a new branch
git checkout -b claude/session-4b-build49-migration
# build49_extension.sql was pre-written by orchestrator and committed to feature
# branch; if not yet on main, cherry-pick or re-add:
git add migrations/build49_extension.sql
git commit -m "feat(migrations): build 49 schema extension (trees metadata + captures jsonb)"
gh pr create --title "build49: schema extension" --body "additive only, idempotent, see session-4-DEPLOY-PLAN.md"

# 3. Apply migrations on Tiger staging DB
ssh tiger-cloud '
  set -a; source ~/.orilife-deploy.env;
  sudo docker exec -i sam3-postgres-prod psql -U $POSTGRES_USER -d $POSTGRES_DB \
    < ~/repos/orilife-core/migrations/3dmesh_v1.sql
  sudo docker exec -i sam3-postgres-prod psql -U $POSTGRES_USER -d $POSTGRES_DB \
    < ~/repos/orilife-core/migrations/build49_extension.sql
'
# Both are idempotent — safe even if re-applied.

# 4. Re-rsync after merge (so Tiger source matches main)
rsync -a --exclude='target/' --exclude='__pycache__/' --exclude='*.pyc' \
      --exclude='.venv/' --exclude='node_modules/' \
   /Users/ductiger/Projects/OriLifeTrace/orilife-core/ \
   tiger-cloud:~/repos/orilife-core/

# 5. Build + run orilife-core on Tiger
# The repo's docker-compose.prod.yml builds the full stack incl. its own
# postgres. We DO NOT want to start a second postgres — we attach to the
# existing sam3-postgres-prod via the external network.
# Create a slim compose override: docker-compose.tier.yml in orilife-core/
ssh tiger-cloud 'cat > ~/repos/orilife-core/docker-compose.tier.yml <<EOF
services:
  sam3-api:
    image: orilife/orilife-core:0.49.0
    build:
      context: .
      dockerfile: Dockerfile
    container_name: orilife-core-api
    restart: unless-stopped
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      ENV: staging
      DATABASE_URL: postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@sam3-postgres-prod:5432/\${POSTGRES_DB}?schema=public
      CORS_ORIGINS: "https://api.orilife.io"
      # Disable in-process services not needed for build49 endpoints
      MILVUS_URI: "http://milvus-prod:19530"
      MINIO_ENDPOINT: "minio-prod:9000"
    depends_on: []
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:8000/healthz || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
networks:
  default:
    name: sam3-prod-network
    external: true
EOF'

ssh tiger-cloud '
  set -a; source ~/.orilife-deploy.env;
  cd ~/repos/orilife-core && \
  sudo -E docker compose -f docker-compose.tier.yml up -d --build
'

# 6. Verify
ssh tiger-cloud 'sudo docker logs orilife-core-api --tail 30'
ssh tiger-cloud 'curl -fsS http://localhost:8000/healthz'    # 200
curl -fsS https://api.orilife.io/healthz                     # 200 via cloudflared
```

### Smoke test for 4b

```bash
# pick a real tree_id from staging — orchestrator will provide
TREE_ID="<from staging>"
curl -X POST https://api.orilife.io/captures/3d \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$(uuidgen)\",
    \"tree_id\": \"$TREE_ID\",
    \"farm_id\": \"smoke-farm\",
    \"captured_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"cid_v1\": \"lamp://ln1q_<from 4a smoke>\",
    \"frame_count\": 15,
    \"auth\": { \"device_id\": \"smoke\", \"nonce\": \"x\", \"signature\": \"y\" }
  }"
# Expect: 201 {"capture_id": "<uuid>", "status": "uploaded_v1"}

curl -fsS https://api.orilife.io/trees/$TREE_ID/fruits
# Expect: 200 with fruits=[] (still empty until MeshGPU processes)
```

---

## 5. Sub-task 4c — MeshGPU worker

**Working dir (Mac):** `/Users/ductiger/Projects/OriLifeTrace/orilife-mesh-worker`.
**Working dir (Tiger):** `~/repos/orilife-mesh-worker`.

### Steps

```bash
# 1. Write .env on Tiger (uses sourced POSTGRES_PASSWORD; never written to git)
ssh tiger-cloud 'set -a; source ~/.orilife-deploy.env; \
cat > ~/repos/orilife-mesh-worker/.env <<EOF
DB_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@sam3-postgres-prod:5432/${POSTGRES_DB}
LAMPNET_BASE_URL=http://lampnet-upload:8080
LAMPNET_API_KEY=8548dcc5b7fca592dfa40d17299494ef19070c98df2a2d2a7a4153033237df16
POLL_INTERVAL_SECS=30
PROCESSING_LEASE_HOURS=1
WORKDIR=/var/tmp/mesh-worker
GSPLAT_MAX_GAUSSIANS=200000
GSPLAT_ITERATIONS=7000
LOG_LEVEL=INFO
EOF
chmod 600 ~/repos/orilife-mesh-worker/.env'

# Note: LAMPNET_BASE_URL uses internal container name (lampnet-upload:8080)
# inside sam3-prod-network. External (https://api.lampnet.cloud) also works
# but adds cloudflared hop. Internal is faster, no cert needed, and is the
# right boundary for east-west traffic.

# 2. Override compose to join sam3-prod-network
ssh tiger-cloud 'cat > ~/repos/orilife-mesh-worker/docker-compose.override.yml <<EOF
services:
  mesh-worker:
    container_name: orilife-mesh-worker
    networks:
      default: {}
networks:
  default:
    name: sam3-prod-network
    external: true
EOF'

# 3. Build + run
ssh tiger-cloud 'cd ~/repos/orilife-mesh-worker && \
   sudo docker compose --env-file .env up -d --build mesh-worker'

# 4. Verify GPU passthrough + poll loop
ssh tiger-cloud 'sudo docker logs orilife-mesh-worker --tail 40'
# Expect: "polling captures table", "0 pending" (no rows yet).
ssh tiger-cloud 'sudo docker exec orilife-mesh-worker nvidia-smi --query-gpu=name --format=csv'
# Expect: "NVIDIA GeForce RTX 5060 Ti"
```

---

## 6. Phase 2 — end-to-end smoke test (orchestrator runs)

```bash
# 1. Health gates
curl -fsS https://api.lampnet.cloud/health
curl -fsS https://api.orilife.io/healthz

# 2. Upload TAR → get cid_v1
CID_V1=$(curl -sS -X POST https://api.lampnet.cloud/upload \
  -H "X-API-Key: 8548dcc5b7fca592dfa40d17299494ef19070c98df2a2d2a7a4153033237df16" \
  -F 'payload={"device_id":"smoke","nonce":"$(uuidgen)","signature":"stub"}' \
  -F 'file=@/tmp/sample-bundle.tar' | jq -r .cid)
echo "cid_v1=$CID_V1"

# 3. POST /captures/3d
SESSION_ID=$(uuidgen)
CAP=$(curl -sS -X POST https://api.orilife.io/captures/3d \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"tree_id\":\"$TREE_ID\",\
       \"farm_id\":\"smoke\",\"captured_at\":\"$(date -u +%FT%TZ)\",\
       \"cid_v1\":\"$CID_V1\",\"frame_count\":15,\
       \"auth\":{\"device_id\":\"smoke\",\"nonce\":\"x\",\"signature\":\"y\"}}")
echo "capture=$CAP"

# 4. Watch worker pick it up (≤ POLL_INTERVAL_SECS + lease grace)
ssh tiger-cloud 'sudo docker logs -f orilife-mesh-worker' &
# Expect log line: "claimed capture <id>"

# 5. After ~5 min, verify DB
ssh tiger-cloud '
  source ~/.orilife-deploy.env;
  sudo docker exec sam3-postgres-prod psql -U $POSTGRES_USER -d $POSTGRES_DB \
    -c "SELECT id, cid_v1, cid_v2, processed_at, quality_score_v2 FROM captures WHERE session_id='\'\''$SESSION_ID'\'\'';"
'
# Expect: cid_v2 NOT NULL, processed_at recent

# 6. Mobile path: fruits API returns data
curl -fsS https://api.orilife.io/trees/$TREE_ID/fruits | jq .
# Expect: fruits.length > 0
```

## 7. Notify Session A (after smoke pass)

Hand-off note containing:
- `https://api.orilife.io` base URL
- Sample request/response from step 3
- Reminder to flip `USE_MOCK_MESHAPI=false` and bump CFBundleVersion to 49
- Caveat: staging key `LAMPNET_API_KEY` is in source — Session A must add Mobile-side equivalent.

## 8. Rollback (if smoke fails)

```bash
# 4a: stop LampNet upload (other LampNet services not affected since this is a
# separate compose project)
ssh tiger-cloud 'cd ~/repos/LampNetCloud && sudo docker compose -f docker-compose.upload.yml down'

# 4b: stop orilife-core API. Migrations are NOT rolled back — they're additive
# nullable, no data loss, no breaking change to PR #21 codepaths.
ssh tiger-cloud 'cd ~/repos/orilife-core && sudo docker compose -f docker-compose.tier.yml down'

# 4c: stop mesh worker
ssh tiger-cloud 'cd ~/repos/orilife-mesh-worker && sudo docker compose down'

# DB migrations are NOT reverted; they are additive. Re-applying is a no-op.
```

## 9. Open items for future sessions (NOT this deploy)

- ECDSA signature verification in LampNet `/upload` (deviation B; defer to v2.1).
- ALLOWED_API_KEYS rotation strategy (currently single shared static key).
- Cloudflare Access policy on `api.orilife.io` (currently open via tunnel; if Mobile cannot send Cloudflare service tokens, leave open; add Authentication/JWT inside FastAPI later).
- Caddy reverse proxy as a backup path if cloudflared tunnel flaps.
- Auto-update of `~/.orilife-deploy.env` rotation; consider Hashicorp Vault since it already runs on Tiger (`phoenixkey-server-vault`).
