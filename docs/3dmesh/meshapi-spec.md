# MeshAPI — Backend FastAPI: DB schema + endpoints captures/fruits

**Repo:** `/Users/ductiger/Projects/OriLifeTrace/orilife-core`
**Branch:** `feature/captures-3d-api`
**Budget:** 4 giờ
**MUST READ FIRST:**
1. [FOUNDATION.md](/Users/ductiger/Projects/OriLifeTrace/3d-capture-worktree/docs/3dmesh/FOUNDATION.md) — context Session D mobile đã làm gì (bạn build endpoint cho client này gọi)
2. [CONTRACT.md](/Users/ductiger/Projects/OriLifeTrace/3d-capture-worktree/docs/3dmesh/CONTRACT.md) — § 6 API, § 7 DB schema

**Lưu ý:** Mobile client `CaptureMetadataAPI.swift` đã có sẵn từ Session D (gated `metadataPostEnabled=false`). Khi bạn ship endpoint xong, Session A sẽ flip flag → mobile bắt đầu POST. Endpoint contract MeshAPI build phải MATCH chính xác payload mobile gửi (CONTRACT § 6 POST /captures/3d).

## Role

Bạn là MeshAPI. Build backend Python FastAPI cho 3D captures + fruits: DB schema + migration + endpoints + tests. KHÔNG đụng mobile, KHÔNG deploy mesh worker GPU (MeshGPU lo).

## T+00:00 → T+00:30 BLOCKING — verify migration approach

orilife-core hiện CHƯA có alembic. Hour 0 deliverable:
1. Đọc `src/repository/entityModels.py` → tìm cách Tree, TreeEvidence được tạo
2. Tìm `src/config/containers.py` + `src/api/lifespan.py` → cách DB init
3. Xác định approach:
   - Có dùng `Base.metadata.create_all()` không?
   - Có raw SQL migration file nào không?
   - Production deploy chạy migration thế nào?
4. **Quyết định path forward**:
   - Option A: Thêm alembic vào project (1h overhead, đúng practice)
   - Option B: Tạo `migrations/3dmesh_v1.sql` raw SQL + apply tay trong deploy (faster, ít cấu trúc hơn)
5. Pick Option B cho 4h budget (nhanh hơn). Document trong PR description.

## Deliverables (file ownership của MeshAPI)

1. **NEW** `migrations/3dmesh_v1.sql`:
   - Toàn bộ DDL từ CONTRACT § 7 (ALTER trees + CREATE captures + CREATE fruits + CREATE fruit_evidence + trigger)
   - Idempotent: dùng `IF NOT EXISTS` mọi nơi
   - Comment đầu file: instructions để apply

2. **NEW** `src/repository/captureModels.py`:
   - `Capture(Base)` SQLAlchemy ORM model match schema CONTRACT
   - `Fruit(Base)` model
   - `FruitEvidence(Base)` model
   - Import vào main `entityModels.py` hoặc package `__init__` để model được register

3. **MODIFY** `src/repository/entityModels.py`:
   - Class `Tree`: thêm 4 columns mới (`fruit_count`, `last_scanned_at`, `latest_capture_id`, `latest_mesh_cid`)
   - **Additive only**, default values, nullable nơi cần. KHÔNG xóa column nào.

4. **NEW** `src/dto/capture.py` + `src/dto/fruit.py`:
   - Pydantic models cho request/response (match CONTRACT § 6)
   - `CaptureCreateRequest`, `CaptureResponse`, `FruitResponse`, `TreeFruitsResponse`, `FruitDetailResponse`, `FruitPatchRequest`
   - Validate `payload.signature` field exists (auth)

5. **NEW** `src/repository/captureRepository.py` + `src/repository/fruitRepository.py`:
   - CRUD ops + custom queries:
     - `find_pending_v2()` — `SELECT * FROM captures WHERE cid_v2 IS NULL` (cho MeshGPU poll)
     - Fruit repository: `find_by_tree(tree_id)`, `get_by_id(fruit_id)`, `update_status(fruit_id, status)`, `update_position_v2(fruit_id, position)`
     - **KHÔNG implement** `find_nearby_fruit` hay `upsert_fruit` — đây là MeshGPU's responsibility (xem deviation A)

6. **NEW** `src/service/captureService.py` + `src/service/fruitService.py`:
   - Business logic:
     - `ingest_capture(payload, cid)`:
       1. Validate signature flat precedence (xem deviation B: `payload.signature` → fallback `payload.auth.signature`)
       2. Log signature/nonce/counter/timestamp/device_id (v1 không verify cryptographic)
       3. INSERT row vào `captures` (cid_v1=cid, cid_v2=NULL, raw_manifest=payload as JSONB)
       4. UPDATE `trees.last_scanned_at`, `latest_capture_id`, `latest_mesh_cid`
       5. **KHÔNG upsert fruits** từ payload (deviation A — fruits nằm trong TAR, MeshGPU sẽ upsert sau khi pull TAR)
       6. trees.fruit_count vẫn old value cho đến khi MeshGPU process xong (limbo window vài phút)
     - `update_fruit_status(fruit_id, status)` — PATCH endpoint
     - `update_fruit_position(fruit_id, position_3d)` — PATCH endpoint (override manual)

7. **NEW** `src/api/captures.py`:
   - `POST /captures/3d` → `captureService.ingest_capture`
   - `GET /trees/{tree_id}/captures` → list captures
   - Router register vào `src/api/__init__.py`

8. **NEW** `src/api/fruits.py`:
   - `GET /trees/{tree_id}/fruits` → tree fruits aggregate response
   - `GET /fruits/{fruit_id}` → fruit detail với evidence list
   - `PATCH /fruits/{fruit_id}` → status or position override
   - Router register

9. **NEW** `tests/unit/test_captures_api.py` + `tests/unit/test_fruits_api.py`:
   - Pytest, 2-3 test per endpoint
   - Mock DB via MagicMock (deviation F)
   - Test: ingest capture creates row + updates trees fields, KHÔNG touch fruits
   - Test: signature flat precedence (`payload.signature` win over `payload.auth.signature`)
   - Test: PATCH status validates enum
   - Test: GET /trees/{id}/fruits trả structure CONTRACT § 6

## File KHÔNG được đụng

`src/api/trees.py` (existing), `src/api/farms.py`, `src/api/evidences.py` (Thư), bất kỳ file mobile, mọi file ngoài orilife-core repo.

## Acceptance criteria

- [ ] Project root: `python -m pytest tests/unit/test_captures_api.py tests/unit/test_fruits_api.py -v` exit 0
- [ ] `python -c "from src.repository.captureModels import Capture, Fruit, FruitEvidence; print('ok')"` exit 0
- [ ] `migrations/3dmesh_v1.sql` apply trên DB test thành công, idempotent (run 2 lần OK)
- [ ] `POST /captures/3d` với valid payload tạo 1 capture row + N fruit rows
- [ ] `GET /trees/{id}/fruits` trả structure đúng CONTRACT § 6
- [ ] Trigger `recalc_tree_fruit_count` work (insert fruit → trees.fruit_count tăng)
- [ ] PR description liệt kê: cách apply migration, endpoints exposed, test results, deploy instructions

## Constraints

- KHÔNG dùng alembic trong 4h (defer Option A v2.1)
- KHÔNG modify schema `trees` ngoài 4 columns additive đã spec (Thư's verify endpoint phải vẫn work)
- KHÔNG modify CONTRACT
- Auth: reuse existing pattern. Mobile gửi signature trong `payload.auth.signature` — verify hoặc tạm log + accept cho v1
- KHÔNG deploy mesh worker GPU (MeshGPU)

## Khi xong

Push branch → PR target `main` (orilife-core mặc định) với title `feat(captures): 3D captures + fruits API (3Dmesh phase 1)`.

Notify Session A: deploy migration trên Tiger staging trước khi mobile có thể test thật.
