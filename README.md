# Aladin SuperApp Platform

Nền tảng white-label để sản xuất super-app nông nghiệp từ một codebase duy nhất. Một instance config → một app hoàn chỉnh, không fork code.

## Kiến trúc

```
┌─────────────────────────────────────────────────────┐
│              Instance Config (per-app)              │
│         appId · themeOverride · moduleList          │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │   Module Registry (YC-2/3)   │
        │  Trace · ProofChat · Work    │
        │  Join (future)               │
        └────────────┬────────────┘
                     │
   ┌─────────────────▼──────────────────────┐
   │           Platform Core               │
   │  Token system (YC-1)                  │
   │  Composition-driven nav (YC-3)        │
   │  Config + billing hooks (YC-4)        │
   │  4-state StateView + adaptive (YC-5)  │
   └───────────────────────────────────────┘
```

**4 bất biến cứng:**
- `INV-1` DATA-FEDERATION — mỗi module giữ dữ liệu riêng, không chia sẻ qua DB chung
- `INV-2` Experience layer độc lập với backend
- `INV-3` PII erasable — xóa user là xóa được hết
- `INV-SEC` Config declarative — không có RCE qua config

## Modules

| Module | Mô tả | Backend |
|---|---|---|
| **Trace** | Định danh cây, quét ReID, 3D viewer, bản đồ vườn | field-reid (`/api/identify`, `/api/enroll`, `/api/trees`, `/api/farm*`) |
| **ProofChat** | Chat nông dân ↔ chuyên gia, miễn phí | ProofChat API |
| **Work** | Đăng việc nông nghiệp, kết nối lao động | AladinWork API |
| **Join** | Tham gia mạng LampNet (future) | LampNet field-reid |

## Tech stack

- React Native 0.84.1 · TypeScript 5.8.3 · New Architecture (Fabric + TurboModules)
- React Navigation v7 · Redux Toolkit · SQLite offline-first
- PhoenixKey DID · LAMP/MAGIC token · Cardano L1

## Branch

```
main     ← production (CI: AAB ký → Play Store)
  └── dev     ← staging (CI: debug APK, Thư test)
        └── feat/*   ← feature branches → PR vào dev
```

## Build local

```bash
npm install --legacy-peer-deps
# Android
cd android && ./gradlew assembleDebug
# iOS
cd ios && bundle exec pod install && cd .. && npx react-native run-ios
```

## CI / GitHub Actions

| Workflow | Trigger | Output |
|---|---|---|
| `debug-apk.yml` | push `dev`, `feat/**` | `superapp-debug.apk` (sideload test) |
| `android-aab.yml` | push `main` | `superapp-release.aab` (Play Store) |

Trước khi CI AAB chạy được, Thư cần set 4 secrets trong repo settings → xem [`BRAIN/CI-SETUP-FOR-THU.md`](BRAIN/CI-SETUP-FOR-THU.md).

## Thêm instance mới (white-label)

1. Tạo `src/config/instances/myapp.config.ts` kế thừa `BaseInstanceConfig`
2. Khai báo `moduleList`, `themeOverride`, `appId`
3. Set `INSTANCE_ID=myapp` khi build

Không fork code, không sửa core.
