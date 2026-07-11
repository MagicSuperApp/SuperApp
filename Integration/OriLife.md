# OriLife — SuperApp Integration

> Chuẩn: `SuperApp/Integration-Standard.md`. Cập nhật khi đổi. Snapshot: 2026-07-11.
> Module SuperApp: **Truy-xuất** (định-danh cây/quả/vật/farm).

## HEAD
- `orilife-core` **origin/main = `6e8210b`** (2026-07-08). ⚠️ Local `main` stale (`30def931` 06-27) — dùng origin/main.
- Contract chuẩn: `orilife-core/MassTreeIdentify/MOBILE-API-CONTRACT.md` (khớp origin/main).
- ⚠️ **PROD DRIFT:** deploy thật `/home/ductiger/field-reid/` (phẳng, không git) lệch main ~1500 dòng → merge PR KHÔNG tới field tới khi deploy lại. Quyết định deploy = anh Đức, chưa chốt.

## Base URL
- **`https://api.orilife.io`** (DUY NHẤT — bỏ test/staging-api). SuperApp `.env` đã đúng (`ORILIFE_API_BASE_URL`).

## Auth
- **PhoenixKey DID, P-256** (off-chain): `GET /api/auth/did/challenge` → ký P-256 (SHA256withECDSA, DER→base64, pubkey `04||X||Y` hex) → `POST /api/auth/did/verify` → `{token, owner=DID}`. Token TTL **12h**, lưu AsyncStorage `auth_token`, gắn `Authorization: Bearer`. `owner` server tự lấy từ token (chống IDOR).

## Endpoints chính
| Method·Path | Field |
|---|---|
| POST `/api/identify` | file `files`* (list) · `points`(JSON pixel GỐC)/shape/bbox · Query `matcher` → `{decision, tree_id, query_id, confidence, candidates[], allow_enroll_new, moved_distance_m}` |
| POST `/api/enroll` | `name`*, `farm_id`, `tree_id`?(None=mới), `points`, file `files`* → `{ok, tree_id, farm_dropped?}` · 409 duplicate/heterogeneous/flat |
| POST `/api/verify_add` | `tree_id`*, `farm_id`, `points`, file `files`* |
| POST `/api/identify_verdict` | `query_id`*, `verdict∈{correct,wrong,other}`, `correct_tid`? |
| GET `/api/trees?farm_id=` · POST `/api/farm` · `/api/farm/{id}` | quản-lý vườn |
| **POST `/api/tree/set_farm`** (MỚI) | gán/backfill farm_id cây mồ-côi — nhánh `claude/fix-field-identify-farm` CHƯA deploy |
| `/api/fruit/*` (file `file` đơn) · `/animal/*` (enroll `images`, identify `image`) · `/api/care/*` | — |

Field MỚI: `allow_enroll_new`(bool, vắng→true), `points`(khoanh cây), `farm_dropped` — chờ deploy nhánh farm.

## Env cho SuperApp
- `ORILIFE_API_BASE_URL=https://api.orilife.io`. KHÔNG có API-key tĩnh (`ALADIN_API_KEY` deprecated) — auth = token DID runtime.

## Creds/key
- Không static key. Token phiên sinh runtime (DID challenge/verify), lưu AsyncStorage. Khoá ký = PhoenixKey P-256 (Keystore/Enclave).

## Readiness
- 🟡 **Chờ deploy + quyết drift.** B1 (backend, chặn deploy — cần app render UNCERTAIN đúng), B2 (app farm reconcile, 100% hệ thống), B3 (Android — chờ log platform). Chi tiết: `MESSAGE-to-SuperApp-field-bugs-prod-drift.md`.
- ⚠️ Cần làm rõ: message B2 trích `orilife-mobile-app/FarmDetailScreen.tsx`, nhưng field-test dùng `AladinContract/SuperApp` (aladin_mobile_fe) — 2 repo; bug B2 có ở CẢ SuperApp.

## Changelog
- 2026-07-11: tạo file (5-agent cross-ref).
