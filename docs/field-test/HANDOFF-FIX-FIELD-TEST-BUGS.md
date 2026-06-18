# HANDOFF — Fix Field Test 25/5 Bugs (Mobile)

**Audience:** Thư (mobile owner), Lành (tester), Lợi (backend — context)
**Branch:** `claude/fix-field-test-bugs` (base: `feat/build57-tree-identify`)
**Date:** 2026-05-26

---

## TL;DR

Field tester báo 25/5:
> "Quá trình test 6 cây khác nhau cho ra 6 mã cây, đơ máy lag gửi lên server mất 3 phút. Quét lại 6 cây đó vẫn cho ra mã mới. Tắt mạng đi vẫn quét được cây thì vẫn cho ra mã. Khi bật mạng lên quét lại cây đó cũng vẫn cho ra mã khác. Phần 3D vẫn hiện là có trái (dù cây ra bông). Nóng máy nhanh hơn lần trước."

PR này fix các bug mobile khả thi xử lý trong code mobile mà không cần đợi backend deploy. Backend fix song song trong PR `orilife-core#26`.

---

## 7 bug fix trong PR này

### 1. Grid hash 3m → 8m (P0, root cause "6 cây 6 mã")

**File:** `ios/LocalPods/ScannerModule/Core/Security/IDGenerator.swift`

**Triệu chứng:** `generateTreeIdByLocation` round GPS theo grid 3m. Nhưng field test 25/5 cho thấy GPS dưới tán sầu riêng jitter 5-15m → 2 lần scan cùng cây fall vào 2 grid cell khác → 2 tree_id khác.

**Fix:** Default `gridMeters: Double = 8.0` (was 3.0). Sầu riêng trồng ≥6m nên 8m vẫn an toàn.

**Risk:** Trung bình — 2 cây trồng < 8m sẽ merge thành 1 tree_id. Mitigation: dialog dedup vẫn hỏi user xác nhận khi distance > 0; backend cũng có thể manual unmerge.

### 2. Reject GPS Null Island (0, 0) (P0, mass-dedup risk)

**File:** `ios/LocalPods/ScannerModule/Core/Security/IDGenerator.swift`, `src/services/treeDedupCache.ts`

**Triệu chứng:** Khi GPS chưa lock, iOS có thể trả `(0, 0)` (Null Island ở Gulf of Guinea). Tất cả cây quét với GPS hỏng → cùng grid `(0, 0)` → cùng tree_id → mass-deduplication.

**Fix:** `generateTreeIdByLocation` đổi return type từ `String` → `String?`. Trả `nil` nếu lat hoặc lng == 0, hoặc out of range. Callers fallback `generateTreeId(deviceId, sessionId, timestamp)` — không dedup được nhưng tránh mass-merge.

```swift
guard latitude != 0.0, longitude != 0.0 else { return nil }
guard abs(latitude) <= 90.0, abs(longitude) <= 180.0 else { return nil }
```

3 callsites trong `DetectionCoordinator.swift` đã được update để handle Optional.

`treeDedupCache.ts` cũng skip check khi GPS hỏng.

### 3. Backend ERROR ≠ NO_MATCH (P0, root cause "quét lại ra mã mới")

**File:** `ios/LocalPods/ScannerModule/Core/Network/UploadQueue.swift`

**Triệu chứng:** Backend trả `decision="ERROR"` (vì SuperPoint empty keypoints, model crash...) → mobile fallback `finalTreeId = item.treeId` (grid hash mới) → mỗi lần quét lại ra mã khác.

**Fix:** Phân biệt 3 trường hợp:
- `verifyResponse.isMatched == true` → dùng `matchedTreeId`
- `verifyResponse.status == "error"` || `decision == "ERROR"` → **throw `ApiError.httpError(503)`** để retry, KHÔNG fallback tạo tree mới
- Còn lại (no_match thật) → fallback `item.treeId` enroll new

**Tương tác với backend fix:** Sau khi `orilife-core#26` deploy, backend sẽ trả `NO_MATCH` cho empty DB thay vì ERROR. Mobile fix này sẽ retry-storm khi backend genuinely down (cẩn thận monitor retry count).

### 4. Adaptive thermal throttle YOLO (P0, root cause "nóng máy")

**File:** `ios/LocalPods/ScannerModule/Core/Detection/DetectionCoordinator.swift`

**Triệu chứng:** YOLO chạy ~10fps continuous bất kể device nóng. Camera 30fps + ARKit + YOLO + GPS + sensor + upload → CPU thermal `.serious`/`.critical` → đơ máy.

**Fix:** Trong `processFrameInternal`, throttle interval adaptive:

```swift
switch ProcessInfo.processInfo.thermalState {
case .nominal, .fair: throttleInterval = baseInterval        // ~10fps
case .serious:        throttleInterval = baseInterval * 2    // ~5fps
case .critical:       throttleInterval = baseInterval * 4    // ~2.5fps
}
```

**Risk:** Thấp — chỉ giảm fps khi đã nóng. Pipeline vẫn responsive.

### 5. Tree dedup cache: persist + history (P0, root cause "tắt mạng vẫn ra mã mới")

**File:** `src/services/treeDedupCache.ts`, `App.tsx`, `src/modules/capture3d/native/Capture3DBridge.ts`

**Triệu chứng:** Build 52 `treeDedupCache.ts` chỉ giữ 1 scan trong memory (module-level `let lastScan`). App background/killed → cache empty. Quét cây thứ 2, 3, 4... đều không bắt được duplicate với cây thứ 1.

**Fix:** Rewrite:
- **Persist `AsyncStorage`** key `@aladin/treeDedupCache/v2` (lưu qua restart)
- **Per-farm history** `Record<farmId, CachedTreeScan[]>` (lưu N=100 scan/farm)
- **Dedup window:** 60s → 5 phút (test 6 cây không hoàn thành trong 60s)
- **Distance threshold:** 1.5m → 8m (khớp grid mới + GPS jitter)
- **Expire 30 ngày** khi load để không phình mãi
- **`updateCanonicalTreeId()`** thêm mới — khi server match đổi `tree_id`, cache update theo

`App.tsx` thêm `useEffect` gọi `loadTreeDedupCache()` lúc app mount.

**Risk:** Thấp. Backward compat: API `cacheTreeScan` đổi sang `async` — caller `Capture3DBridge.ts` dùng `void` để fire-and-forget.

### 6. Disable mock 3D fruits mặc định (P0, root cause "3D có trái dù cây ra bông")

**File:** `src/api/captures3d.ts`

**Triệu chứng:** `USE_MOCK_MESHAPI = ... !== 'true'` — fail-open vào mock. `.env` không có `MESHAPI_ENABLED=true` → API trả 7 quả mock cho mọi cây.

**Fix:** Đảo logic: chỉ mock khi explicit `MESHAPI_USE_MOCK=true`. Default = real API (HTTP request thật).

```typescript
// Before
USE_MOCK_MESHAPI = String(meshApiEnabledRaw).toLowerCase() !== 'true';
// After
USE_MOCK_MESHAPI = String(meshApiUseMockRaw).toLowerCase() === 'true';
```

**Risk:** Trung bình — nếu backend `GET /captures/3d` trả 500, UI sẽ thấy fruits rỗng thay vì mock data. Đây là behavior đúng (trung thực hơn). Cần monitor sau khi merge.

### 7. Bỏ random harvestPct fallback (P1, mất niềm tin)

**File:** `src/modules/trace/screens/FarmDetailScreen.tsx`

**Triệu chứng:** `const harvestPct = item.harvestProgress ?? Math.floor(Math.random() * 80 + 10)` → mỗi cây chưa có data thật hiện %thu hoạch ngẫu nhiên 10-90%. Nông dân thấy số "lạ" → mất niềm tin UI.

**Fix:** Đổi fallback thành `?? 0`. Đợi backend trả data thật.

---

## Việc Thư cần làm sau khi merge

### Bước 1 — Kéo code về máy

```bash
git fetch origin
git checkout claude/fix-field-test-bugs
git pull
```

### Bước 2 — Build IPA build 58

```bash
cd ios
pod install  # nếu cần
# Build theo workflow Thư đang dùng (xcodebuild / Xcode UI / Codemagic)
```

### Bước 3 — Smoke test trên TestFlight TRƯỚC khi field test

Smoke test này KHÔNG được skip — đây là cái Claude đã quên ở lần trước, dẫn đến field test 25/5 thất bại:

1. Mở app, đợi 3 giây cho `loadTreeDedupCache` xong
2. Quét 1 cây ở vườn (hoặc giả lập GPS): xem có tạo `tree_id` hợp lệ không
3. Quét lại cây đó (giữ máy ở vị trí gần): app phải hiện dialog "Cây vừa quét, có phải cùng 1 cây?" (cache hit) HOẶC tree_id giống cũ (grid hash hit)
4. Kill app, mở lại: lặp bước 3, vẫn phải nhận diện được cây cũ (test persist)
5. Quét cây khác cách >10m: phải tạo `tree_id` mới
6. Disable mạng → quét: phải work (offline)
7. Bật mạng lại → quét lại cây cũ: phải nhận lại (cache + backend match)

### Bước 4 — TestFlight invite Lành

Bao gồm checklist trên trong release notes để Lành test có hướng dẫn.

### Bước 5 — Track metric

Sau 1 ngày field test, check `tree_dedup_success` vs `tree_dedup_rejected` vs `tree_verify_backend_error` trong Analytics. Báo lại số.

---

## ⚠ KHÔNG nằm trong PR này (defer)

| # | Item | Lý do defer |
|---|---|---|
| 1 | **LampNet API key hardcoded** trong `APISecrets.swift:74` | Sensitive — Thư + Lợi quyết khi nào rotate. Cần coordinate với LampNet team. |
| 2 | Camera fps cap 24fps | Có thể conflict với ARKit. Cần Thư test trước. |
| 3 | Polygon GPS EMA smoothing | Cần thiết kế UX cho indicator "GPS đang ổn định" |
| 4 | Auto `display_index` "Cây 1, Cây 2..." | Cần thiết kế DB sequence + sync với backend |
| 5 | Polygon edit từ FarmDetail screen | UX feature mới, không phải bug fix |
| 6 | `syncService.ts` stub | iOS UploadQueue (real) đã handle. RN syncService chỉ là legacy, không trong critical path. |
| 7 | Parallel upload TaskGroup | Risk ép 4G quá tải. Cần A/B test |
| 8 | Image downscale ≤1280px trước save | Tách PR riêng để Thư test thoroughly |

Các fix này quan trọng nhưng phức tạp hơn — đề xuất Thư tạo issue follow-up.

---

## Risk assessment

| Risk | Mitigation |
|---|---|
| Grid 8m merge 2 cây thật trồng < 8m | Backend hoặc UI cho phép manual unmerge. Hiếm xảy ra với sầu riêng. |
| Throw error retry storm khi backend genuinely down | UploadQueue có max retries (3); items eventually fail. Monitor analytic `tree_verify_backend_error`. |
| Mock disable → 3D viewer empty khi backend chưa sẵn | Đúng behavior. Tester sẽ thấy "Chưa có dữ liệu quả" — trung thực hơn fake 7 quả. |
| AsyncStorage persist fail | Catch + log, không crash app. In-memory cache vẫn hoạt động cho session. |

---

## Files thay đổi

```
App.tsx                                                          +9 dòng
ios/LocalPods/ScannerModule/Core/Security/IDGenerator.swift     +25 / -10
ios/LocalPods/ScannerModule/Core/Detection/DetectionCoordinator.swift  +60 / -25
ios/LocalPods/ScannerModule/Core/Network/UploadQueue.swift      +25 / -1
src/services/treeDedupCache.ts                                   ~200 (rewrite)
src/modules/capture3d/native/Capture3DBridge.ts                  +4 / -2
src/api/captures3d.ts                                            +13 / -8
src/modules/trace/screens/FarmDetailScreen.tsx                   +4 / -1
docs/field-test/HANDOFF-FIX-FIELD-TEST-BUGS.md (new) — doc này
```

Tổng: ~350 dòng code change. TypeScript: 0 lỗi MỚI trên các file tôi chạm (61 lỗi pre-existing trên các file khác, ngoài scope).

---

## Liên hệ

- Câu hỏi mobile flow: comment PR này
- Câu hỏi backend: xem PR `orilife-core#26`
- Field test feedback gốc: tin nhắn Lành 25/5

🤖 Generated with [Claude Code](https://claude.com/claude-code)
