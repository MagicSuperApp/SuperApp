# Build 52 Sprint Plan — Dev Assignments

> **Sprint duration:** 5-7 ngày (2026-05-18 → 2026-05-24 dự kiến)
> **Branch:** `feat/build52` (đã tạo từ `fix/build51-complete`)
> **Owner orchestrate:** AppBuilder Agent (Claude)
> **PM approve:** Lành (PM OriLife)

## 🎯 Mục tiêu

Build 52 ship 4 epic chính cùng lúc với 4 dev parallel:

1. **Epic A:** Tree dedup "1 cây 2 mã" — fix triệt để
2. **Epic B:** Capture3D 24-slot redesign V2 (variable duration + per-frame metadata)
3. **Epic C:** UX terminology cleanup + onboarding wizard 3 bước
4. **Epic D:** AI training infrastructure (annotation table + YOLO export pipeline)

## 📋 Code Status (đã prep trên `feat/build52` branch)

### Quick-wins ĐÃ APPLY trong commit prep

| File | Change | Status |
|---|---|---|
| `src/modules/trace/screens/TreeDetailScreen.tsx` | "quả đã định danh" → "quả đã ghi nhận"; "Trưởng thành" → "Gần thu hoạch" mature label; empty state + CTA button rename | ✅ |
| `src/modules/trace/screens/FarmDetailScreen.tsx` | "Chưa có cây nào được định danh" → "Chưa có cây nào trong vườn" | ✅ |
| `src/modules/trace/screens/FarmListScreen.tsx` | "định danh và truy xuất" → "ghi nhận và truy xuất" | ✅ |
| `src/components/CreateFarmPromptModal.tsx` | "trước khi định danh cây" → "trước khi thêm cây" | ✅ |

### Stub files CREATED (cho dev implement)

| File | Purpose | Owner |
|---|---|---|
| `src/services/treeDedupCache.ts` | Client-side dedup cache với 60s + 1.5m window | **Lợi** |
| `src/modules/capture3d/utils/slotClassifier.ts` | 24-slot horizontal/vertical/distance classifier (RN side) | **Thư + Tùng** |
| `src/modules/capture3d/utils/slotNavHint.ts` | Vietnamese nav hint algorithm ("Quay sang hướng X + ngước máy lên") | **Tùng** |
| `src/modules/capture3d/utils/frameClassifier.ts` | Frame purpose classifier (training_candidate/evidence/both/discard) + slot dedup | **Lợi** |
| `src/modules/capture3d/components/Capture3DSlotGrid.tsx` | 24-slot grid UI với ✅/⚠️/❌ + progress bar + hint | **Tùng** |
| `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DSlotClassifier.swift` | Native Swift slot classifier (mirror RN logic) | **Thư** |
| `ios/LocalPods/ScannerModule/Core/Capture3D/Capture3DFrameMetadata.swift` | Schema 3dmesh/2.0 + FrameMetadata + ManifestV2 types | **Thư** |
| `ios/LocalPods/ScannerModule/Core/Capture3D/Sensors/AttitudeCollector.swift` | CMDeviceMotion attitude collector (pitch/yaw/roll) | **Thư** |

### Spec docs CREATED

- `docs/build52/CAPTURE3D-REDESIGN-V2-SPEC.md` — Full 24-slot spec với schema + algorithm + UI design
- `docs/build52/SPRINT-PLAN.md` — file này
- `docs/spec/VIDEO-TUTORIAL-SPEC.md` — Cho Tùng làm dần khi rảnh (Rive/Lottie + Gemini 3.1 TTS)

## 👥 Dev Assignments (5 dev parallel)

### Track 1: **Thư** — Capture3D 24-slot native + Wire VerifyAPI dedup (Mobile + IoT + AI)

**Estimated:** 28-30h (3-4 ngày làm việc) — +4-6h cho T-Th2-07

| Task | File | Hours | Spec ref |
|---|---|---|---|
| T-Th2-01 | Implement `Capture3DSlotClassifier.swift` (stub đã có, fill body) | 2h | `slotClassifier.ts` RN mirror |
| T-Th2-02 | Implement `AttitudeCollector.swift` + wire vào `SensorPackCoordinator` | 5h | Audit report Q2 |
| T-Th2-03 | Add `MotionBlurComputer.swift` (gyro magnitude squared) | 3h | Audit report Q4 |
| T-Th2-04 | Extend `Capture3DCoordinator.persist()` để compute FrameMetadata realtime + stash | 8h | Audit Q5, 18h reduced bằng using stubs |
| T-Th2-05 | Refactor `writeManifest()` → schema 3dmesh/2.0 với `frames_metadata: []` array | 4h | `Capture3DFrameMetadata.swift` stub |
| T-Th2-06 | Bridge event `onSlotUpdate` emit từ native về RN | 2h | Audit Q6 |
| **T-Th2-07** | **Wire Capture3D flow → existing `VerifyAPI`** — copy pattern từ `ScannerViewController.swift:186` (callback + TreeMatchHandler) sang `Capture3DBridgeModule.swift`. Step: trước khi `coordinator` start, call `VerifyAPI.verify(firstKeyframe, gps, ...)` → if isMatched && confidence ≥0.95 auto-reuse OR 0.6-0.95 show TreeMatchConfirmationView. | **4-6h** | **Fix "1 cây 2 mã" Giang root cause** |

**Output:** Native side ready emit per-frame slot assignment + metadata + **dedup wired cho Capture3D flow**.

### Track 2: **Tùng** — Capture3D 24-slot UI + Onboarding (Frontend + Motion)

**Estimated:** 18h (2.5 ngày)

| Task | File | Hours | Spec ref |
|---|---|---|---|
| T-Tu2-01 | Wire `Capture3DSlotGrid.tsx` vào `Capture3DSessionScreen.tsx` thay thế `FrameDotStrip` | 4h | Stub ready |
| T-Tu2-02 | Subscribe `onSlotUpdate` event (RN bridge từ native) + state map slotStatus | 3h | Audit Q6 |
| T-Tu2-03 | Animate slot status transitions (empty → captured) với reduceMotion check | 3h | `useSystemAccessibility` |
| T-Tu2-04 | Onboarding wizard 3 bước (modal overlay sau first login): Tạo nông trại → Thêm cây → Chụp 3D | 6h | UX audit P1 |
| T-Tu2-05 | Tooltip "?" icon cho metrics ("Quả gần/xa", "Mã DID") | 2h | UX audit P1 |

**Output:** UI realtime hiển thị 24-slot + onboarding wizard.

### Track 3: **Lợi** — AI training infrastructure (Backend AI)

**Estimated:** 13h (2 ngày) — REDUCED từ 22h sau khi check debug-branch

**🔍 Discovery 2026-05-17:** Thư đã build `VerifyAPI` + `TreeMatchHandler` + `TreeMatchConfirmationView` cho **legacy Scanner flow** trong build 46-49 (commits `eb86537` + `bea3180` + `afd483a` — TẤT CẢ đã merge main). Server endpoint `POST /evidences/verify` LIVE với image + IMU + GPS spatial match 30m radius + confidence scoring.

**Nhưng Capture3D path BYPASS dedup** — đó là root cause "1 cây 2 mã" Giang báo. → Re-route Track 3 thay vì build mới.

| Task | File | Hours | Spec ref |
|---|---|---|---|
| ~~T-Lo2-01~~ | ~~Wire `treeDedupCache.ts`~~ | ~~4h~~ | **CANCELLED** — re-route sang Thư T-Th2-07 |
| ~~T-Lo2-02~~ | ~~Backend GPS accuracy gate~~ | ~~5h~~ | **CANCELLED** — VerifyAPI đã làm job này |
| T-Lo2-03 | Backend annotations table migration + CRUD API | 6h | AI training audit Trục 5 |
| T-Lo2-04 | Backend `POST /captures/<id>/export-training-data` YOLO/COCO format | 5h | AI training audit |
| T-Lo2-05 | Backend `GET /captures/<id>/manifest` + `GET /captures/<id>/frames` endpoints | 2h | AI training audit Trục 1 |

**Note:** `treeDedupCache.ts` ở `src/services/` retained as **mobile-side fast-path** (instant UX cho rapid re-scan 95% case). Mobile check cache → hit → skip verify call. Miss → call server VerifyAPI. Defense-in-depth.

**Output:** AI training infrastructure ready (annotations + YOLO export + frame access).

### Track 4: **Long** — PhoenixKey support + DB tooling (Fullstack)

**Estimated:** 10h (1.5 ngày) — phụ trợ Lợi

| Task | File | Hours | Spec ref |
|---|---|---|---|
| T-Lg2-01 | Hỗ trợ Lợi annotations table migration (SQL design) | 3h | Cross-team |
| T-Lg2-02 | Frame extraction sidecar (TAR → individual frame URLs với cache) | 5h | AI training audit Trục 3 |
| T-Lg2-03 | LampNet list endpoint `GET /bundles?tree_id=X` | 2h | AI training audit Trục 6 |

**Output:** Frame access infrastructure ready cho AppBuilder Agent browse training data.

### Track 5: **Đạt** — LampNet multi-node (Fullstack Rust) — defer Build 53

**Estimated:** Defer — Build 52 không block

LampNet multi-node replication + bundle search endpoint sẽ ship Build 53 sau khi data volume tăng đáng kể.

### Special: **Tuân** — On-chain DID anchor research (Blockchain L1) — defer

Tree DID on-chain anchor (1 cây = 1 NFT/Datum trên Cardano) — research only Build 52, ship Build 54+.

### Special: **Thịnh** — VeData L2 NFT fruit timeline research (Blockchain L2) — defer

Fruit growth timeline as Hydra Head streaming — research only Build 52, ship Build 54+.

## 🧪 Test plan Build 52

### Field test cycle 1 (sau merge feat/build52 → ship build 52 TestFlight)

| # | Test scenario | Verify | Tester |
|---|---|---|---|
| 1 | Scan cùng 1 cây 2 lần liên tiếp (< 60s) | Dialog "Cây vừa quét — dùng cây cũ?" hiện ra | Giang |
| 2 | Scan cây thứ 2 cách 5m | Tạo tree_id mới (KHÔNG dedup) | Giang |
| 3 | Capture3D 1 cây outdoor open sky | 24-slot grid hiển thị realtime, hint "Quay sang hướng E" | Giang |
| 4 | Capture3D cây có lá rậm (xen canh test) | Slot Bắc + Đông cao chụp được, slot Nam thấp khó (vướng lá) | Giang |
| 5 | Capture3D ≥16 slots → button "Hoàn thành" enable | Bundle TAR có frames_metadata 3dmesh/2.0 | Giang |
| 6 | Backend `GET /captures/<id>/manifest` return | JSON manifest 3dmesh/2.0 đầy đủ | AppBuilder |
| 7 | Backend `GET /captures/<id>/frames` return | Frame URLs list, không phải full TAR | AppBuilder |
| 8 | Annotation UI dev tool (web) | Label được 5 frames mẫu | Dev internal |

### Regression (KHÔNG broke build 51)

- [ ] Login + farms list + trees list OK
- [ ] Capture3D 15-frame current flow vẫn ship được nếu user disable 24-slot mode (feature flag)
- [ ] Thêm quả button vẫn show Alert nếu camera permission denied
- [ ] LampNet upload → CID `lamp://ln1q_*` return OK
- [ ] Thermal vẫn ổn (xác nhận `.fitness` activity + drop video.mp4 chưa regress)

## 📦 Build 52 IPA ship sequence

1. Tất cả track merge vào `feat/build52` (via PR cho mỗi sub-task)
2. AppBuilder Agent verify Debug build simulator BUILD SUCCEEDED
3. Bump CFBundleVersion 51 → 52 (cả Info.plist + project.pbxproj)
4. Pod install verify Podfile.lock sync
5. Archive Release + MapLibre workaround
6. exportArchive → `ios/build/export_52/aladin_mobile_fe.ipa`
7. Verify NEW IPA chứa stubs implemented (strings check)
8. User upload Transporter → TestFlight Internal "OriLife Testing"
9. Giang + Cường field test cycle 1
10. PM Lành Go/No-Go decision Build 53 production cut

## 🔗 References

- `docs/build51/dev/TECHNICAL-NOTES.md` — Build 51 hoàn chỉnh shipped state
- `docs/build52/CAPTURE3D-REDESIGN-V2-SPEC.md` — Full 24-slot spec
- `docs/spec/VIDEO-TUTORIAL-SPEC.md` — Tùng video tutorials
- `/Users/ductiger/Products/Agents/BuildApp/STATE.md` — Project-wide state
- `/Users/ductiger/Products/Agents/BuildApp/OPEN-ITEMS.md` — Open items tracking
- 3 audit reports đã spawn parallel: tree dedup root cause, "định danh" 11 locations, Capture3D 24-slot feasibility

## 🚦 Status check before sprint kick-off

User cần confirm:
- [ ] Approve sprint plan + dev assignments?
- [ ] 5 dev (Thư/Tùng/Lợi/Long + AppBuilder) all available 5-7 ngày?
- [ ] Trade-off backend AI training infra vs production cut Ngày 5-7?
- [ ] Tree dedup Option 1 (mobile dedup dialog, 4h Lợi) hay Option 2 (backend accuracy gate, 5h Lợi) hay BOTH?
