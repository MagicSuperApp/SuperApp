# Session 4 — BackendDeploy (3 sub-tasks parallel)

**Agent tên:** BackendDeploy
**Budget:** 4-6 giờ (3 sub-tasks parallel)
**Goal:** End-to-end mobile → backend → DB → MeshGPU live trên staging.

## Sub-task 4a — LampNet Upload Endpoint

**Repo:** `/Users/ductiger/Projects/LampNetCloud` (Rust)
**Working dir:** `cd /Users/ductiger/Projects/LampNetCloud && claude`

### Mục tiêu
Deploy HTTP endpoint `POST https://api.lampnet.cloud/upload` nhận multipart upload từ mobile (Capture3DAPI.swift + Upload3DQueue.swift).

### Yêu cầu
- Multipart form: field `payload` (JSON) + field `file` (binary TAR ≤50MB)
- Auth: verify `device_id + nonce + signature` trong payload (ECDSA P-256, SecureSignature pattern). Có thể stub v1 (log + accept) per deviation B.
- Response: `{ "cid": "lamp://ln1q_...", "size_bytes": N }` per CONTRACT
- Health check: `GET /health` return 200

### Implementation hints
- Tìm Rust HTTP server hiện tại (lampnet-mirage hay lampnet-compass)
- Storage: dùng module hiện có `lamp://` CID scheme. Bundle persist disk hoặc IPFS-like content addressing.
- Idempotent: same SHA256 bundle → same CID
- Backpressure: reject if disk full

### Deploy
- Tiger server SSH
- `cargo build --release` + systemd service hoặc docker compose
- Verify `curl -X POST https://api.lampnet.cloud/upload -F payload=... -F file=@test.tar` returns 200 + cid

### Output
- URL endpoint live
- Sample curl command
- Doc: API reference

---

## Sub-task 4b — MeshAPI Merge + Deploy Staging

**Repo:** `/Users/ductiger/Projects/OriLifeTrace/orilife-core` (Python FastAPI)
**Working dir:** `cd /Users/ductiger/Projects/OriLifeTrace/orilife-core && claude`

### Mục tiêu
Merge PR #21 (`feature/captures-3d-api`) vào `main` + deploy lên Tiger staging server orilife-core. Update DB schema thêm trees columns nếu trees table mới.

### Yêu cầu
1. **Review PR #21** — verify code MeshAPI from build 48 audit (12/12 PASS đã có). Merge vào main.
2. **Run migration**: `psql "$POSTGRES_URL" -f migrations/3dmesh_v1.sql` trên staging DB
3. **DB schema extension** cho build 49 fields (trees.variety, trees.species, trees.health_status, trees.age_years, trees.last_harvest_date, trees.metadata_voice_cid, trees.metadata_updated_at, captures.sensors JSONB, captures.derived_metrics JSONB, captures.tree_metadata_snapshot JSONB)
4. **Deploy**: docker-compose pull + restart orilife-core service trên Tiger
5. **Smoke test**: `POST /captures/3d` với sample payload từ MeshAPI tests → return 201

### Output
- URL `https://api.orilife.io/captures/3d` returning real response (not 404)
- Migration applied verify
- Connection string staging cho MeshGPU

---

## Sub-task 4c — MeshGPU Worker Tiger Deploy

**Repo:** `/Users/ductiger/Projects/OriLifeTrace/orilife-mesh-worker` (Python + CUDA)
**Working dir:** `cd /Users/ductiger/Projects/OriLifeTrace/orilife-mesh-worker && claude`

### Mục tiêu
Push repo lên GitHub OriLifeTrace org + deploy docker compose Tiger với GPU access.

### Yêu cầu
1. **GitHub push**: `git add -A && git commit -m "feat(meshgpu): initial GS worker" && gh repo create OriLifeTrace/orilife-mesh-worker --private --source=. --push`
2. **Tiger setup**:
   - SSH access verify (user `ductiger`)
   - Docker group: `sudo usermod -aG docker ductiger`
   - Nvidia container toolkit installed
   - Clone repo Tiger
3. **Configure env**: `.env` with `DB_URL`, `LAMPNET_API_KEY`, `LAMPNET_BASE_URL=https://api.lampnet.cloud`
4. **Build + run**: `docker compose up -d mesh-worker`
5. **Smoke test**: 
   - Insert fake capture row trong staging DB (cid_v1 = uploaded test bundle)
   - Verify worker pick up trong 60s
   - Verify gsplat reconstruction complete trong 5 phút
   - Verify DB updated: `cid_v2 NOT NULL`, fruits rows inserted, `processed_at` set

### Output
- Worker service running Tiger
- Sample log output 1 successful capture process
- DB sanity check query

---

## Coordination giữa 3 sub-tasks

```
4a LampNet     ──┐
4b MeshAPI     ──┼─→ Verify end-to-end smoke test
4c MeshGPU     ──┘
                  ↓
        Mobile build 48 v3 user installed → tap "Chụp cây" → bundle upload LampNet → cid_v1 trả về → POST /captures/3d → capture row created cid_v1 → MeshGPU poll → process → cid_v2 + fruits → mobile pull GET /trees/{id}/fruits → real data
```

## Acceptance criteria toàn Session 4

- [ ] `curl https://api.lampnet.cloud/health` → 200
- [ ] `curl -X POST https://api.orilife.io/captures/3d -H "Content-Type: application/json" -d '{minimal payload}'` → 201
- [ ] Insert fake row staging DB → MeshGPU log "processing capture xxx" trong 60s
- [ ] Gsplat reconstruction complete → cid_v2 written
- [ ] Mobile (turn off `USE_MOCK_MESHAPI`) → `GET /trees/{id}/fruits` return real data

## Constraints

- KHÔNG production-grade hardening v1 — staging-quality OK
- Idempotent retry trong worker
- Logging structured JSON
- Document deploy commands trong README

## Khi xong

Notify Session A để flip `USE_MOCK_MESHAPI=false` trong mobile build 49 + bump build number.
