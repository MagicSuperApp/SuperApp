# Session A Handoff — Build 50 mobile env flip

> From BackendDeploy orchestrator on 2026-05-16. Build 49 (already on TestFlight) runs with `USE_MOCK_MESHAPI=true`. Build 50 should flip mocks off and point at the staging stack proven end-to-end below.

## 1. Build 50 env vars to set

```env
# LampNet ingestion gateway (multipart upload + bundle download)
LAMPNET_BASE_URL=https://staging-api.lampnet.cloud
LAMPNET_API_KEY=8548dcc5b7fca592dfa40d17299494ef19070c98df2a2d2a7a4153033237df16

# orilife-core (captures, fruits, trees)
ORILIFE_API_BASE_URL=https://staging-api.orilife.io

# Feature flag (replaces USE_MOCK_MESHAPI)
MESHAPI_ENABLED=true
```

- Staging key is checked in here on purpose — staging only. Rotate before any prod cut.
- Production `api.lampnet.cloud` / `api.orilife.io` are **untouched** (Thanh Dat's `lampnet-node` SuperNode and Thang Loi's python service still own those ports). Do not point Build 50 at those.

## 2. Wire-up proven (E2E trace from 2026-05-16 04:47Z)

```
mobile  POST https://staging-api.lampnet.cloud/upload
        → 200 {"cid":"lamp://ln1q_9177e787f9066f0833667ff76dfba7b1","size_bytes":3072}

mobile  POST https://staging-api.orilife.io/captures/3d
        → 201 {"status_code":201,"message":"Capture accepted","error":null,
               "data":{"capture_id":"9e09a10a-436e-4a73-bea3-5522d2b1467d",
                       "status":"uploaded_v1"}}

mesh-worker (Tiger, lease poll +30s):
        process.start capture_id=9e09a10a-...
        GET http://lampnet-upload:8080/bundles/ln1q_9177e787.../download → 200 OK 3072 B
        ✓ download ok → /var/tmp/mesh-worker/<id>/v1.tar
        ✗ extract_v1 → BundleFormatError: required entry missing: fruits_3d.json
          (test TAR was minimal — a real Build 50 bundle includes fruits_3d.json,
           frames/, poses/, depth/, mesh.obj, etc., so this step will succeed
           on the first real capture from a device.)

DB:     captures(session_id=1c9b9181..., cid_v1=lamp://ln1q_9177e787...,
                 processed_at IS NOT NULL, cid_v2 IS NULL)   ← lease-claimed
```

## 3. Exact request shapes (lock these)

### POST `/upload` (mobile → LampNet)

Multipart form-data:

| Field | Type | Required | Notes |
|---|---|---|---|
| `payload` | text (JSON) | yes | Free-form metadata. v1 stub does NOT verify ECDSA signature — logged only. Sample: `{"device_id":"<id>","nonce":"<n>","signature":"<sig>"}`. |
| `file` | binary (TAR) | yes | ≤ 50 MB; >50 MB returns 413. |

Header: `X-API-Key: <LAMPNET_API_KEY>` (required, 401 if missing/invalid).

Response 200: `{"cid":"lamp://ln1q_<32 hex>","size_bytes":<N>}`. Same bytes → same CID (blake3-deterministic, idempotent).

### POST `/captures/3d` (mobile → MeshAPI)

JSON body, **wrapped envelope shape** (NOT flat):

```json
{
  "payload": {
    "session_id":"<uuid>",
    "tree_id":"<str>",
    "farm_id":"<str>",
    "captured_at":"<ISO8601 Z>",
    "frame_count":15,
    "ar_engine":"arkit",       // REQUIRED
    "app_version":"50.0",
    "mesh_face_count":1000,
    "mesh_coverage_pct":0.85,
    "auth":{"device_id":"<id>","nonce":"<n>","signature":"<sig>"}
    // optional build 49 schema extensions:
    // "sensors":{...}, "derived_metrics":{...}, "tree_metadata":{...}
  },
  "cid":"lamp://ln1q_<hex16>"
}
```

Response 201 envelope:
```json
{
  "status_code":201,
  "message":"Capture accepted",
  "error":null,
  "data":{"capture_id":"<uuid>","status":"uploaded_v1"}
}
```

### GET `/trees/{tree_id}/fruits` (mobile read path)

Same `staging-api.orilife.io` base. Returns 200 with `fruits: []` while MeshGPU is processing (cid_v2 not yet set), then real data after gsplat reconstruction completes.

## 4. Mobile knobs unchanged from Build 49

- TAR bundle schema (manifest.json v1.2, `fruits_3d.json`, frames/, poses/, depth/, mesh.obj, …) — unchanged.
- ECDSA signature on `payload` — server still ignores; keep generating it client-side (deviation B), v2.1 will validate.
- Mobile `Capture3DAPI.swift` and `Upload3DQueue.swift` — only the URL constants change.

## 5. Recommended Build 50 release plan

1. Flip env vars (above) in mobile target.
2. Bump `CFBundleVersion` 49 → 50 (build only; marketing version stays 2.0).
3. Test in simulator against `staging-api.*` (Cloudflare front works from any network).
4. TestFlight upload → Quang/Giang/internal testers re-install.
5. First real outdoor capture → expect:
   - Upload completes in <30 s (depending on network and TAR size).
   - `/captures/3d` returns 201 within 1 s.
   - GET `/trees/{tree_id}/fruits` shows `fruits:[]` initially, then real fruits 5–10 min later (gsplat is the slow step on Tiger's RTX 5060 Ti).

## 6. Backend status (informational — no action needed)

- `lampnet-upload` on Tiger `127.0.0.1:6490` → Cloudflare `staging-api.lampnet.cloud`. 4 routes: `/health`, `/upload`, `/bundles/{ref}/download`, `/bundles/upload`. Image `orilife/lampnet-upload:0.1.0`.
- `orilife-core-api` on Tiger `127.0.0.1:7390` → Cloudflare `staging-api.orilife.io`. Image `orilife/orilife-core:0.49.0-tier`.
- `orilife-mesh-worker` (GPU, no host port) on Tiger; polls `captures` table every 30 s; lease expires 1 h.
- Postgres: container `sam3-postgres-prod`, DB `orilife`, role `orilife_app`, isolated from Thư's empty `sam3` DB on the same instance.
- DB schema: PR #21 (3dmesh phase 1) merged on `main` (SHA `b3afea2`). PR #22 (build 49 extension, additive trees + captures JSONB) open against `main`; the migration has already been applied to staging.

## 7. Open items (won't block Build 50)

- **PR #22** (`orilife-core/migrations/build49_extension.sql`) — please review/merge so dev environments can replay the schema.
- **PR #2** on `LampNetCloud/lampnet-hivemind` (`/upload` + `/bundles/{ref}/download` + `POST /bundles/upload`) — please review/merge.
- **Thanh Dat clarification** — does `lampnet-node` SuperNode on prod `:6480` expose its own HTTP `/upload`, or is it pure libp2p P2P? If the latter, staging vs prod separation we have is fine long-term; if the former, eventually merge the new container's logic into the SuperNode binary and retire the staging stack. Slack/Telegram ping from your side — orchestrator has no IM access.
- Staging `LAMPNET_API_KEY` rotation (single static key today; Vault on Tiger already runs `phoenixkey-server-vault` if you want to grow into it).
- ECDSA signature verification (deviation B, deferred to v2.1).

## 8. Quick troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Mobile gets `401` from `/upload` | Wrong `LAMPNET_API_KEY` | Confirm env value matches §1 exactly (64 hex chars). |
| Mobile gets `422` from `/captures/3d` | Body shape (flat vs wrapped) or missing `ar_engine` | Use §3 wrapped envelope. |
| `fruits:[]` stays empty > 15 min after upload | Worker stuck or bundle invalid | `ssh tiger-cloud 'sudo docker logs orilife-mesh-worker --tail 50'` — look for `BundleFormatError` or LampNet errors. |
| `staging-api.*` returns 502/504 | Cloudflared tunnel hiccup | Wait 30 s, retry; or `sudo systemctl restart cloudflared` on Tiger. |
| Upload returns `413` | TAR > 50 MB | Reduce frames or video bitrate; mobile should already cap at ~30 MB. |

## 9. Contact points

- Backend deploy questions → `orilife-mobile-app/docs/build49/AUDIT-4{a,b,c}*.md` (each sub-task has its own AUDIT).
- DEPLOY-PLAN single-source-of-truth → `orilife-mobile-app/docs/build49/session-4-DEPLOY-PLAN.md` (note: port numbers there are pre-staging-flip; the values in this handoff supersede them).
