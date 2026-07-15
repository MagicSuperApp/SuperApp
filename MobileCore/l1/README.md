# MobileCore/l1 — Interface only (KHÔNG có native code ở đây)

`l1/*` chỉ khai `interface`/`type` TypeScript mô tả contract native
(TurboModule / Swift pod / Kotlin module). Không file nào trong thư mục
này chứa Swift/Kotlin/Java hay logic hiện thực — xem
`MobileCore/CONVENTIONS.md` §1.

## 1. Chính sách `@needs-device-test`

- Mọi method trong mọi `interface` ở `l1/*` PHẢI có JSDoc gắn tag
  `@needs-device-test`. Đây là hợp đồng native — hành vi thật (enclave,
  BiometricPrompt/LAContext, camera session, GPS, filesystem) chỉ verify
  được trên phần cứng thật, KHÔNG verify được bằng `tsc`/Jest.
- **KHÔNG dán nhãn "done"/"xong" cho bất kỳ symbol L1 nào cho tới khi có
  bằng chứng test máy thật** (log/screenshot/output thật, không phải
  "chạy được trên simulator" hay "type-check sạch"). Type-check sạch chỉ
  chứng minh CHỮ KÝ đúng, không chứng minh HÀNH VI đúng.
- Khi PHASE-3 hiện thực 1 native module theo interface ở đây: xoá
  `@needs-device-test` khỏi method ĐÃ có bằng chứng test máy thật cụ thể
  (ghi kèm bằng chứng — thiết bị nào, ngày nào, log gì), KHÔNG xoá hàng
  loạt.

## 2. Bảng con trỏ harvest (file:line ở nguồn — đọc lại bằng `git show <branch>:<path>` trước khi bê, CONVENTIONS §5)

| Interface | Method | Nguồn harvest (repo@ref path:line) |
|---|---|---|
| `keystore.interface.ts` | `generateKeypair` | `orilife-mobile-app@origin/main src/services/phoenixKey-native.ts` (RN bridge); Android: `android/app/src/main/java/com/aladincontract/company/PhoenixKeyModule.kt:35`; iOS: `ios/LocalPods/ScannerModule/UI/PhoenixKeyModule.swift:17` |
| | `getPublicKeyHex` | Android `PhoenixKeyModule.kt:79`; iOS `PhoenixKeyModule.swift:71` |
| | `hasKey` | Android `PhoenixKeyModule.kt:91`; iOS `PhoenixKeyModule.swift:87` |
| | `deleteKey` | Android `PhoenixKeyModule.kt:101`; iOS `PhoenixKeyModule.swift:94` |
| | `sign` | Android `PhoenixKeyModule.kt:112`; iOS `PhoenixKeyModule.swift:111`; canonicalize (KHÔNG copy vào MobileCore — chỉ tham khảo) `PhoenixKeyDID/PhoenixKey-SDK/src/verifier.ts:222-243` |
| `ml-engine.interface.ts` | `loadModel` | `orilife-mobile-app@claude/surface-data-collection ios/LocalPods/ScannerModule/Core/Detection/YOLOTFLiteRunner.swift:75` (model-registry hardcode ở `ModelType` enum cùng file — PHASE-3 phải đổi thành registry động) |
| | `infer` | cùng file, `detect(...)` dòng 138 (native method tên khác, hành vi tương đương invoke 1 khung) |
| | `selectDelegate` | cùng file, dòng 91-94 — comment dead-code ANE/GPU, hiện KHÔNG có delegate thật nào được gắn (luôn CPU-only) |
| `sqlite.interface.ts` | `openForUser` | `SuperApp@claude/orilife-farm-sync-enroll-gate src/utils/database.ts:18` (`init`), mở DB dòng 33 (`SQLite.openDatabase`) |
| | `exec` / `query` | cùng file, dòng 62 (`createTables`) — CHỈ harvest cách mở DB per-user, KHÔNG harvest các bảng nghiệp vụ (farms/trees/fruits/...) vì đó là business logic platform, ngoài phạm vi MobileCore |
| | `close` | cùng file — pattern `if (this.db && this.currentUserId !== userKey) await this.close()` trong `init` |
| `location.interface.ts` | `watchPosition` | `orilife-mobile-app@origin/claude/spec-cam-controls-flash-ultrawide ios/LocalPods/ScannerModule/Core/Sensor/LocationHelper.swift` (`start()`/`didUpdateLocations` delegate) |
| | `clearWatch` | cùng file, `stop()` |
| | `setDistanceFilter` | cùng file, dòng 52 (`distanceFilter = 3.0`) |
| | `enableAutoPause` | cùng file, dòng 60-61 (`activityType = .fitness`, `pausesLocationUpdatesAutomatically = true`) — giảm 30-50% power theo comment field-test build 51 trong file |
| `camera.interface.ts` | `startStream` / `stop` | `ios/LocalPods/ScannerModule/Core/Detection/DetectionCoordinator.swift` (`processFrame`/pipeline lifecycle) |
| | `setFrameSkip` | iOS `DetectionCoordinator.swift:449-451` (`enableFrameSkip`/`skipFrames`) + thermal throttle `:430-441`; Android `android/orilifesdk/.../coordinator/DetectionCoordinator.kt:230` (`Config.ENABLE_FRAME_SKIP`/`SKIP_FRAMES`) |
| | `enableIdlePowerOff` | Android CÓ SẴN: `android/orilifesdk/.../camera/CameraStateManager.kt:22,26,47` (`autoPowerOffDelay`, `recordActivity`, `checkAutoPowerOff`). iOS: KHÔNG có tương đương — PHASE-3 tự xây |

## 3. Luật PHASE-3 grep gate

Trước khi PHASE-3 coi bất kỳ module L1 nào là "sẵn sàng tích hợp", chạy:

```bash
# Mọi export interface trong l1/*.interface.ts phải có method gắn @needs-device-test
grep -rn "^\s*[a-zA-Z]" MobileCore/l1/*.interface.ts | grep -B1 "):" 
```

Điều kiện PASS bắt buộc:
1. Mọi method trong mọi `interface` xuất từ `l1/*.interface.ts` có JSDoc
   ngay phía trên chứa `@needs-device-test` (trừ khi đã có bằng chứng
   test máy thật kèm theo — xem mục 1).
2. `l1/*.interface.ts` KHÔNG import `react-native`, không import
   Swift/Kotlin, không chứa implementation (`class ... implements`,
   `NativeModules.X`) — chỉ `interface`/`type`/JSDoc.
3. `npx tsc --noEmit -p MobileCore/tsconfig.json` sạch cho mọi file
   trong `l1/`.
4. Named export duy nhất, không `export default` (CONVENTIONS §2).

Nếu grep gate FAIL ở điều kiện 1 → KHÔNG cho PHASE-3 tích hợp module đó,
trả lại cho agent build bổ sung JSDoc trước.
