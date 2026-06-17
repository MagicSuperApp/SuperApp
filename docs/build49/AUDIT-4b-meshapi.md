# AUDIT — Session 4b · MeshAPI backend deploy (build 49)

- **Date:** 2026-05-16
- **Branch:** `claude/session-4b-build49-migration` (PR #22)
- **Agent:** BackendDeploy-4b
- **Status:** ⚠ Partial — backend fully deployed and smoke-tested locally, but the public hostname `api.orilife.io` resolves to a stale SAM3 instance outside Tiger. Local Tiger deployment is complete and working.

---

## 1. PR landings

| PR | Branch | State | Merge SHA |
|---|---|---|---|
| **#21** `feature/captures-3d-api` | merged via user-authorized override | MERGED 2026-05-16 02:28:36Z | `b3afea2a743bffcc03f7dd4fcf8195eebeb188b4` |
| **#22** `claude/session-4b-build49-migration` | OPEN | https://github.com/OriLifeTrace/orilife-core/pull/22 | — |

Both PRs are now on `main` of `orilife-core` (PR #22 awaits review; build49_extension.sql was applied directly to Tiger staging per the deploy plan).

## 2. Database bootstrap

### Sequence executed on `sam3-postgres-prod` (Tiger)

1. **Role `orilife_app`** — created via `CREATE ROLE orilife_app WITH LOGIN`, password set via `ALTER ROLE orilife_app WITH LOGIN PASSWORD <literal>` from a temp SQL file (no shell echo).
2. **Database `orilife`** — created with `OWNER orilife_app`, `GRANT ALL PRIVILEGES`.
3. **Extensions inside `orilife`** — `pgcrypto`, `postgis`, `vector` installed by superuser. Schema `public` re-`ALTER`ed to owner `orilife_app`.
4. **Base schema** — applied `/tmp/orilife_base_bootstrap.sql` (trees + farm_zones, mirrored from `src/repository/entityModels.py` and `spatialEntityModels.py`). Both `sam3` DB and our new `orilife` DB now coexist on the same Postgres container; `sam3` remains empty (Thư's verify endpoint not yet seeded — confirmed before and after bootstrap, count = 0 tables in both states).
5. **Migration 1** — `~/repos/orilife-core/migrations/3dmesh_v1.sql` (PR #21).
6. **Migration 2** — `~/repos/orilife-core/migrations/build49_extension.sql` (PR #22).

### Validation transcript

```
=== orilife tables ===
 public | captures        | table | orilife_app
 public | farm_zones      | table | orilife_app
 public | fruit_evidence  | table | orilife_app
 public | fruits          | table | orilife_app
 public | spatial_ref_sys | table | sam3user     (PostGIS system table)
 public | trees           | table | orilife_app

=== orilife trees count ===         0
=== sam3 trees count (Thư intact) === 0 tables matched

=== build49 trees cols ===
 variety             | character varying(50)
 species             | character varying(100)   | DEFAULT 'Durio zibethinus'
 age_years           | integer
 health_status       | character varying(30)
 last_harvest_date   | date
 metadata_voice_cid  | text
 metadata_updated_at | timestamp with time zone
 metadata_notes      | text
"trees_health_status_check" CHECK 9-value enum
  (healthy, flowering, fruiting, pest_damage, nutrient_deficiency,
   diseased, dry, dead, unknown)

=== build49 captures cols ===
 sensors                | jsonb
 derived_metrics        | jsonb
 tree_metadata_snapshot | jsonb

=== Functional indexes (all 3 present) ===
idx_captures_tree_height_m
idx_captures_canopy_diameter_m
idx_captures_quality_score
plus baseline indexes: idx_captures_tree, idx_captures_farm, idx_captures_pending_v2
```

### Network alias

`sam3-prod-network` membership of `sam3-postgres-prod` rebuilt with `--alias postgres --alias sam3-postgres-prod`. Verified via throw-away `alpine:3` on the network:

```
172.18.0.4 postgres  postgres
172.18.0.4 sam3-postgres-prod  sam3-postgres-prod
```

All 18 other containers (phoenixkey-*, proofchat-*, milvus-prod, etcd-prod, minio-prod, lampnet-upload) stayed `healthy` through the disconnect-reconnect window.

## 3. Deploy artifacts

| File | Location | Purpose |
|---|---|---|
| `Dockerfile.tier` | `~/repos/orilife-core/Dockerfile.tier` (Tiger) | Slim CPU-only build (~600 MB) for build 49 endpoints. Skips CUDA/torch wheels because captures/fruits/trees routes never touch GPU singletons. |
| `docker-compose.tier.yml` | `~/repos/orilife-core/docker-compose.tier.yml` (Tiger) | Single-service compose: `orilife-core-api` container, port `127.0.0.1:8000:8000`, joined to `sam3-prod-network`, env from `~/.orilife-deploy.env`. |
| `/tmp/orilife_base_bootstrap.sql` | Tiger `/tmp/` | One-shot DDL (trees + farm_zones, idempotent). Kept as `/tmp` artifact; not committed because `init_db()` in the orilife-core app already creates these via `Base.metadata.create_all` for fresh dev DBs. |

Build/start transcript (compressed):

```
=== docker compose build ===
#17 exporting to image
#17 exporting layers 134.4s done
#17 naming to docker.io/orilife/orilife-core:0.49.0-tier
=== docker compose up -d ===
 Container orilife-core-api Created
 Container orilife-core-api Started

=== startup logs ===
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
2026-05-16 02:54:10 | INFO | src.api.lifespan | Starting SAM3 Tree Identification API...
2026-05-16 02:54:10 | INFO | src.api.lifespan | ✓ Vector dimension validated: 384
2026-05-16 02:54:10 | INFO | src.repository.databaseManager | Database extensions ensured: vector, postgis
2026-05-16 02:54:10 | INFO | src.repository.databaseManager | Connected to PostgreSQL: postgresql://orilife_app:***@postgres:5432/orilife
2026-05-16 02:54:10 | INFO | src.repository.databaseManager | Features enabled: pgvector=True, GeoAlchemy2=False
2026-05-16 02:54:10 | INFO | src.api.lifespan | ✓ Application resources initialized (PostgreSQL / init_db)
INFO:     Application startup complete.
```

`docker ps`:

```
orilife-core-api   Up <minutes> (healthy)   127.0.0.1:8000->8000/tcp
```

## 4. Smoke test (Tiger local — via SSH because Cloudflare hostname is misrouted; see §6)

Seed:

```sql
INSERT INTO farm_zones (farm_id, owner_did, region_code, farm_name, boundary)
VALUES ('smoke-farm-4b', 'did:smoke:4b', 'VN-SM', '4b Smoke Farm',
        ST_GeogFromText('SRID=4326;POLYGON((106.0 10.0, 106.1 10.0, 106.1 10.1, 106.0 10.1, 106.0 10.0))'))
ON CONFLICT (farm_id) DO NOTHING;

INSERT INTO trees (id, region_code, farm_id, geohash_7)
VALUES ('smoke-tree-4b', 'VN-SM', 'smoke-farm-4b', 'w3gvc0p')
ON CONFLICT (id) DO NOTHING;
```

(Note: `region_code` is VARCHAR(10) so the smoke region code is `VN-SM`, not `VN-SmokeRegion` as initially attempted.)

### Capture ingest

```
POST http://localhost:8000/captures/3d
{ "payload": { "session_id":"D8E9F812-93F5-4AD6-B7B3-1F5CF4FE90CF",
               "tree_id":"smoke-tree-4b", "farm_id":"smoke-farm-4b",
               "captured_at":"2026-05-16T02:55:07Z",
               "frame_count":15, "ar_engine":"ARKit",
               "device_id":"smoke-4b", "nonce":"smoke-nonce-4b", "signature":"stub" },
  "cid":"lamp://ln1q_smoke4bplaceholder000000000000" }

→ 201 Created
{ "status_code":201, "message":"Capture accepted",
  "data": { "capture_id":"b0fab199-e7f0-4529-bd86-7e5072919afa",
            "status":"uploaded_v1" } }
```

### List fruits (post-ingest, before MeshGPU finishes)

```
GET http://localhost:8000/trees/smoke-tree-4b/fruits
→ 200 OK
{ "data": { "tree_id":"smoke-tree-4b", "fruit_count":0,
            "last_scanned_at":"2026-05-16T02:55:07Z",
            "latest_mesh_cid":"lamp://ln1q_smoke4bplaceholder000000000000",
            "latest_capture_processed_at":null,
            "fruits":[] } }
```

### List captures (shows MeshGPU 4c already processed one)

```
GET http://localhost:8000/trees/smoke-tree-4b/captures
→ 200 OK
{ "data": { "tree_id":"smoke-tree-4b", "total":2,
            "captures": [
              { "capture_id":"b0fab199-e7f0-4529-bd86-7e5072919afa",
                "captured_at":"2026-05-16T02:55:07Z",
                "cid_v1":"lamp://ln1q_smoke4bplaceholder000000000000",
                "cid_v2":null, "frame_count":15,
                "processed_at":null },
              { "capture_id":"47001386-59e1-4340-a309-a265ad8ead8f",
                "captured_at":"2026-05-16T02:47:08Z",
                "cid_v1":"lamp://ln1q_smoke4bplaceholder000000000000",
                "cid_v2":null, "frame_count":15,
                "processed_at":"2026-05-16T02:47:14.480770Z" }
            ] } }
```

The earlier capture has `processed_at` set — confirms 4c (`orilife-mesh-worker`) is polling and processing.

### Healthchecks

```
http://localhost:8000/health     →  200  {"status":"healthy"}
https://api.orilife.io/health    →  200  (served by a different SAM3 instance, see §6)
```

## 5. INSERT statements for orchestrator's Phase 2 smoke

```sql
-- 1. Smoke farm zone (required by trees.farm_id FK)
INSERT INTO farm_zones (farm_id, owner_did, region_code, farm_name, boundary)
VALUES (
  'smoke-farm-4b',
  'did:smoke:4b',
  'VN-SM',
  '4b Smoke Farm',
  ST_GeogFromText('SRID=4326;POLYGON((106.0 10.0, 106.1 10.0, 106.1 10.1, 106.0 10.1, 106.0 10.0))')
)
ON CONFLICT (farm_id) DO NOTHING;

-- 2. Smoke tree
INSERT INTO trees (id, region_code, farm_id, geohash_7)
VALUES ('smoke-tree-4b', 'VN-SM', 'smoke-farm-4b', 'w3gvc0p')
ON CONFLICT (id) DO NOTHING;
```

POST body shape (matches `src/dto/capture.py · CaptureCreateRequest`, NOT the simplified form in the orchestrator's brief):

```json
{
  "payload": {
    "session_id": "<uuid>",
    "tree_id": "smoke-tree-4b",
    "farm_id": "smoke-farm-4b",
    "captured_at": "<ISO8601>",
    "frame_count": 15,
    "ar_engine": "ARKit",
    "device_id": "smoke",
    "nonce": "<rand>",
    "signature": "stub"
  },
  "cid": "lamp://ln1q_<from 4a smoke>"
}
```

`ar_engine` is **required**. The flat `cid` (not `cid_v1`) sits as a sibling of `payload`, not inside it. The auth block can be flat fields on `payload` or nested under `payload.auth`.

## 6. Blockers / partial completion

### ⚠ Cloudflare hostname mis-route — outside this agent's scope

`https://api.orilife.io` does **not** route to our `orilife-core-api` container on Tiger:

| Probe | Result |
|---|---|
| `dig +short api.orilife.io` | `172.67.156.73`, `104.21.40.184` (Cloudflare Argo IPs — correct) |
| `GET https://api.orilife.io/openapi.json` | 21 paths, none of `/captures/3d`, `/trees/{id}/captures`, `/trees/{id}/fruits`, `/fruits/{id}` |
| `GET http://localhost:8000/openapi.json` (Tiger) | **25 paths**, includes all 4 build49 routes |
| `POST https://api.orilife.io/captures/3d` (any body) | `404 {"detail":"Not Found"}` |
| `POST http://localhost:8000/captures/3d` (Tiger) | `201` with `capture_id`, body correctly persisted |

Container logs on `orilife-core-api` show **zero** requests originating from cloudflared during repeated CF probes — only the local docker healthcheck (`127.0.0.1`). Tiger's cloudflared process is running with tunnel ID `4e244e62-2508-4632-aa42-d6b5efee2bb6` (matches the deploy plan), but the Cloudflare dashboard ingress for `api.orilife.io` is evidently bound to a different origin — likely an older SAM3 instance from `/opt/sam3-staging/docker-compose.prod.yml` on another machine, since the openapi shape exactly matches a pre-PR-#21 build of this same repo.

**Recommendation:** orchestrator/operator must update the Cloudflare Zero Trust dashboard for tunnel `4e244e62-…` so the Public Hostname for `api.orilife.io` points at `http://localhost:8000` on this Tiger host (or `http://orilife-core-api:8000` if cloudflared joins `sam3-prod-network`). Until then the public smoke path (`https://api.orilife.io/captures/3d`) will keep 404-ing. Tiger-local smoke via SSH is green; mobile build 49 cannot validate end-to-end through the Cloudflare hostname yet.

### Other notes (non-blocking)

- The reference Dockerfile in repo (`Dockerfile`) references a non-existent `.[cpu]` extra in `pyproject.toml`. `Dockerfile.tier` works around this by installing core deps only (no extras). PR follow-up: define `[cpu]` extra in pyproject.toml or fix the Dockerfile reference.
- `~/.orilife-deploy.env` has multi-line comments that break a naive `set -a; source` — needed `eval "$(grep -E '^[A-Z_]+=' ~/.orilife-deploy.env | sed -E 's/^/export /')"`. Optional cleanup: collapse the wrapped comments onto a single line each so the standard sourcing pattern from the deploy plan works.
- Matplotlib emits a `Permission denied: '/home/orilife/.config/matplotlib'` warning at startup because the non-root user has no home dir (`useradd --no-create-home`). Falls back to `/tmp` cache — harmless. To silence, set `MPLCONFIGDIR=/tmp` in the compose env.
- The `orilife-core-api` container was destroyed once mid-session by an external compose operation; brought back up cleanly with `docker compose up -d`. No state loss because the only state lives in `orilife` DB on `sam3-postgres-prod`.

## 7. Deploy locations summary

| Resource | Path |
|---|---|
| Repo (Mac) | `/Users/ductiger/Projects/OriLifeTrace/orilife-core` |
| Repo (Tiger) | `~/repos/orilife-core` |
| Dockerfile | `~/repos/orilife-core/Dockerfile.tier` |
| Compose | `~/repos/orilife-core/docker-compose.tier.yml` |
| Container | `orilife-core-api` (image `orilife/orilife-core:0.49.0-tier`) |
| Host port | `127.0.0.1:8000` |
| Internal DNS | `orilife-core-api:8000` on `sam3-prod-network` |
| Public (intended) | `https://api.orilife.io` — **blocked, see §6** |
| Database | `orilife` on `sam3-postgres-prod`, role `orilife_app` |
| Migrations | `migrations/3dmesh_v1.sql` (PR #21), `migrations/build49_extension.sql` (PR #22) |
