# MeshGPU — Tiger server: Gaussian Splatting worker

**Repo:** **NEW** `/Users/ductiger/Projects/OriLifeTrace/orilife-mesh-worker` (tạo từ scratch)
**Budget:** 4 giờ
**MUST READ FIRST:**
1. [FOUNDATION.md](/Users/ductiger/Projects/OriLifeTrace/3d-capture-worktree/docs/3dmesh/FOUNDATION.md) — context Session D đã ship Bundle3DAssembler (TAR format) + LampNetAPI client mobile. Bundle bạn pull từ LampNet là output của pipeline đó.
2. [CONTRACT.md](/Users/ductiger/Projects/OriLifeTrace/3d-capture-worktree/docs/3dmesh/CONTRACT.md) — § 1 bundle, § 7 DB, § 10 storage hierarchy

**Bundle format bạn parse:** chính xác như Session D + Mesim assemble — POSIX ustar TAR có manifest.json + mesh.obj + texture.png + video.mp4 + frames + poses + depth + fruits_3d.json. Mọi schema field chốt trong CONTRACT.

## Role

Bạn là MeshGPU. Build service Python chạy trên Tiger server (RTX 5060, 16GB vRAM) để:
1. Poll DB OriLife → tìm captures có `cid_v2 IS NULL`
2. Pull bundle từ LampNet bằng `cid_v1`
3. Run Gaussian Splatting reconstruction
4. Refine fruit positions cho quả tier `near`
5. Write back: upload mesh v2 lên LampNet, update DB `captures.cid_v2` + `fruits.position_3d_v2`

KHÔNG đụng mobile, KHÔNG sửa orilife-core schema (MeshAPI define), KHÔNG đụng LampNet protocol.

## T+00:00 → T+00:30 — verify environment

1. SSH vào Tiger server, verify:
   - `nvidia-smi` → RTX 5060, 16GB vRAM, driver ≥ 535
   - Docker running + GPU passthrough OK (`docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi`)
   - DB OriLife accessible từ Tiger (test `psql` connection)
   - LampNet API accessible (`curl -I https://api.lampnet.cloud/health`)
2. Nếu thiếu gì → BÁO Session A trước khi tiếp tục

## Deliverables (file ownership của MeshGPU)

1. **NEW REPO** `/Users/ductiger/Projects/OriLifeTrace/orilife-mesh-worker/`:
   - `git init`, README.md, .gitignore, Dockerfile, docker-compose.yml
   - License header copy từ orilife-core

2. **NEW** `worker.py`:
   - Main entrypoint
   - Infinite loop:
     ```
     while True:
       capture = poll_pending_capture()  # SELECT WHERE cid_v2 IS NULL LIMIT 1 FOR UPDATE SKIP LOCKED
       if not capture: sleep(30); continue
       try:
         process(capture)
       except Exception as e:
         log + mark capture.processing_error = str(e), backoff
     ```

3. **NEW** `db_client.py`:
   - asyncpg/psycopg connection pool
   - Methods: `poll_pending()`, `update_capture_v2(capture_id, cid_v2, quality_score)`, `update_fruit_position_v2(fruit_id, position_3d_v2)`
   - Match schema từ MeshAPI CONTRACT § 7

4. **NEW** `lampnet_client.py`:
   - HTTP client: `download_bundle(cid) -> tarfile.TarFile` (lưu temp dir)
   - `upload_bundle(path) -> cid`
   - Reuse pattern auth từ mobile EvidenceAPI (multipart payload với signature)
   - Hoặc dùng server-server API key nếu LampNet support

5. **NEW** `gsplat_runner.py`:
   - Wrapper cho thư viện gsplat / NeRFstudio
   - Input: dir chứa `frames/*.jpg` + `poses/*.json` + intrinsics
   - Output: `.ply` point cloud + `.splat` file
   - Time: 2-5 phút trên RTX 5060
   - Choose: **gsplat** (https://github.com/nerfstudio-project/gsplat) — simpler, MIT license
   - Install: `pip install gsplat` (cần CUDA toolchain trong Docker)
   - Function: `reconstruct(session_dir: Path) -> ReconstructionResult`

6. **NEW** `fruit_upserter.py` (RESPONSIBILITY MỚI — quan trọng):

   **MeshAPI deviation:** POST /captures/3d KHÔNG upsert fruits từ payload mobile (payload không chứa fruits[]). MeshGPU phải upsert từ TAR bundle.
   
   Workflow:
   1. Pull TAR từ LampNet bằng `cid_v1`
   2. Extract `fruits_3d.json` từ TAR (Mesim's output)
   3. Cho mỗi fruit entry trong `fruits_3d.json`:
      - Load existing fruits cùng tree_id (`SELECT * FROM fruits WHERE tree_id = $1`)
      - Python euclidean distance: tìm fruit gần nhất < 0.15m (15cm)
      - **Match found:** UPDATE existing fruit (`last_seen_at = NOW()`, update bbox refs in fruit_evidence)
      - **Not match:** INSERT new fruit row với position_3d từ Mesim raycast
      - INSERT row vào `fruit_evidence (fruit_id, capture_id, frame_indices)`
   4. Trigger `recalc_tree_fruit_count` tự fire sau insert/update fruits

7. **NEW** `fruit_triangulator.py`:
   - Input: `fruits_3d.json` + frames + poses (sau khi upserter đã tạo fruits rows)
   - Cho mỗi fruit có `tier == "near"` (height ≤ 2m):
     - Lấy `bbox_frame_refs` (frames thấy quả này)
     - Project bbox center từ ≥2 frames qua camera intrinsics → 3D ray
     - Triangulate (least-squares) → refined 3D position
     - Compute reprojection error → confidence score
   - Output: UPDATE `fruits.position_3d_v2 = refined, confidence = updated`
   - Quả `tier == "far"` → KHÔNG refine (giữ position_3d v1)

7. **NEW** `mesh_combiner.py`:
   - Optional v1: chỉ output gsplat .splat + giữ mesh.obj từ ARKit
   - Bundle v2 structure:
     ```
     <session_id>_v2.tar
     ├── manifest_v2.json (extends v1 với processed_at, gsplat_iterations, ply_point_count)
     ├── mesh.obj          (copy từ v1, không đổi)
     ├── texture.png       (copy từ v1)
     ├── splat.ksplat      (NEW từ gsplat)
     ├── point_cloud.ply   (NEW)
     └── fruits_v2.json    (refined positions cho tier=near)
     ```
   - Upload v2 bundle lên LampNet → return cid_v2

8. **NEW** `Dockerfile`:
   - Base: `nvidia/cuda:12.0-cudnn8-runtime-ubuntu22.04`
   - Install Python 3.11, gsplat, psycopg2-binary, asyncpg, requests, numpy, opencv
   - Copy worker code
   - CMD: `python worker.py`

9. **NEW** `docker-compose.yml`:
   - Service `mesh-worker`
   - GPU passthrough: `deploy.resources.reservations.devices`
   - Env vars: DB_URL, LAMPNET_API_KEY, POLL_INTERVAL_SECS
   - Restart: unless-stopped

10. **NEW** `README.md`:
    - Deployment instructions (Tiger server commands)
    - Env var reference
    - Troubleshooting GPU issues
    - Performance benchmarks

## Acceptance criteria

- [ ] Tiger server: `docker compose up -d mesh-worker` → service start, health check pass
- [ ] Insert 1 fake capture row vào DB (cid_v1 = test bundle uploaded LampNet) → trong vòng 60s worker pick up
- [ ] Worker complete reconstruction trong 5 phút trên RTX 5060
- [ ] DB sau khi xong: `captures.cid_v2 NOT NULL`, `fruits.position_3d_v2 NOT NULL` cho tier=near
- [ ] Worker survive crash + restart: KHÔNG double-process row (SELECT FOR UPDATE SKIP LOCKED)
- [ ] Log structured (JSON) qua stdout, capture ID in mỗi log line
- [ ] PR description: kiến trúc, dependency list, benchmark time, deploy script

## Constraints

- GPU: KHÔNG OOM. Monitor vRAM usage; nếu gsplat eat > 14GB → giảm gaussian count param
- Polling interval: 30s (không spam DB)
- LampNet: dùng existing API, KHÔNG tự build storage layer
- DB schema: MATCH MeshAPI CONTRACT § 7 chính xác — nếu lệch → coord với Session A trước commit
- KHÔNG modify CONTRACT

## Khi xong

Push repo `orilife-mesh-worker` lên GitHub (tạo repo mới trên org `OriLifeTrace`). Tag Session A để deploy + smoke test.

Backup plan nếu Tiger không ready trong 4h:
- Ship code + Dockerfile xong
- Smoke test bằng `docker run` local (without GPU, mock gsplat reconstruction)
- Deploy thực tế defer tới Session A sau khi resolve Tiger access
