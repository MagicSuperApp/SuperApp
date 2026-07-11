# SuperApp — Integration Standard (chuẩn tích hợp platform)

> **App BUILD từ repo [`AladinContract/SuperApp`](https://github.com/AladinContract/SuperApp) — KHÔNG build từ repo của platform.** Mọi tích hợp (endpoint, auth, key) mà SuperApp thực sự đọc đều nằm trong repo này. Platform là nguồn sự-thật cho hợp đồng tích hợp; SuperApp giữ bản snapshot đã kiểm chứng để build.
>
> Đây là nguồn DUY NHẤT quy định cách mọi platform (OriLife, PhoenixKey, ProofChat, AladinWork, LampNet) khai báo tích hợp với SuperApp. Mỗi phiên, agent SuperApp đọc snapshot trong [`Integration/`](Integration/) — KHÔNG đoán, KHÔNG dựa trí nhớ.
>
> Phiên bản: **v2 · 2026-07-11** · đối chiếu develop [`8ec70fc`](https://github.com/AladinContract/SuperApp/tree/develop).

---

## 1. Nguyên tắc

1. **Nguồn sự-thật 2 lớp:**
   - **Upstream (canonical):** mỗi platform duy trì 1 file `SuperApp-Integration.md` trong repo Specs của ORG mình (xem §7 để biết vị trí + link). Platform đổi endpoint/auth/token → cập nhật file đó cùng lúc (kèm ngày + HEAD commit).
   - **Snapshot (build):** SuperApp giữ bản đã kiểm chứng trong [`Integration/<Platform>.md`](Integration/). Đây là bản app thực sự đọc để build. Khi upstream đổi → đồng bộ snapshot này rồi mới bật cờ.
2. SuperApp coi snapshot là sự-thật khi build; lệch giữa code và snapshot là lỗi phải sửa. Lệch giữa snapshot và upstream là việc đồng bộ (ghi ngày ở Changelog mỗi file).
3. SuperApp KHÔNG hard-code endpoint/host trong code — đọc từ `.env` (xem §3). File snapshot cho biết ĐẶT GIÁ TRỊ GÌ vào `.env`.

## 2. Cấu trúc bắt buộc của mỗi file integration

```
# <Platform> — SuperApp Integration
> Latest main HEAD: <hash> (<ngày>). Cập nhật khi đổi.

## HEAD / Base URL — REST + (WS/upload nếu có), production + staging
## Auth           — cơ chế (DID login / session Bearer / JWKS), TTL, lỗi 401/503
## Endpoints      — bảng: method · path · field chính · response · fee/lỗi
## Env cho SuperApp— tên biến .env (X_API_URL / X_WS_URL / X_BACKEND_ENABLED...) + giá trị
## Creds/API key  — VỊ TRÍ đặt key (KHÔNG dán giá trị) + cách lấy
## Readiness      — 🟢 sẵn / 🟡 chờ creds / 🔴 chặn — kèm blocker + issue/PR liên quan
## Changelog      — dòng ngày + đổi gì
```

## 3. Vị trí API key / creds — CHUẨN

- **Git token (push/PR):** `.env` tại `/Users/ductiger/Projects/.env`, biến `GH_TOKEN_<ACCOUNT>` (vd `GH_TOKEN_ALADIN_Worktree`). KHÔNG commit, KHÔNG dán giá trị vào doc/PR/commit.
- **API key/host platform:** `.env` của SuperApp (repo root, gitignored — mẫu ở [`.env.example`](https://github.com/AladinContract/SuperApp/blob/develop/.env.example)). Quy ước tên biến:
  - `<PLATFORM>_API_URL` (REST base) · `<PLATFORM>_WS_URL` + `<PLATFORM>_WS_PATH` (nếu socket) · `<PLATFORM>_API_KEY` (nếu có static key) · `<PLATFORM>_BACKEND_ENABLED` (cờ bật/tắt).
- **KHÔNG static token khi platform dùng DID/session** (AladinWork, ProofChat, OriLife): auth = PhoenixKey login → Bearer TTL, KHÔNG cần API key tĩnh. File platform phải ghi rõ cơ chế.
- **Nguyên tắc bí mật:** doc chỉ ghi TÊN biến + VỊ TRÍ file, TUYỆT ĐỐI không ghi giá trị token/key thật. (Nếu phát hiện token nhúng trong URL remote git → coi là rò rỉ, xoay vòng ngay.)

## 4. Cờ tính năng (feature flag) — CHUẨN

- Mỗi module gọi backend phải gate bởi `<PLATFORM>_BACKEND_ENABLED`. **Mặc định `false` = chạy mock**, app phải chạy được offline khi cờ tắt hoặc backend down.
- Chỉ bật `true` khi: (a) file integration ghi Readiness 🟢, (b) đã có creds trong `.env`, (c) đã đối chiếu shape API thật.

## 5. Token hệ sinh thái (thống nhất mọi màn ví/giá)

- **3 token user-facing: MAGIC · LAMP · CARP.**
  - **MAGIC** = đơn vị ĐỊNH GIÁ (giá/phí tính bằng MAGIC).
  - **CARP** = đồng THANH TOÁN (pledge + phí giữ/chuyển bằng CARP; `402 NO_FUNDS` = thiếu CARP).
  - **LAMP** = backing/governance (cố định 36 tỷ, no-burn — nguồn: [`LAMP/Treasury/CONTRACT.md §5`](https://github.com/MagicLampNetwork)).
- **ADA KHÔNG phải token user-facing** — chỉ là phí chain (lovelace), trừu-tượng-hoá. Ví on-chain CÓ giữ ADA thật để trả phí; vì vậy ADA chỉ xuất hiện ở mục "Tài sản khác" (nếu cần), KHÔNG đặt ngang hàng MAGIC/LAMP/CARP ở màn chính.
- (Ghi chú: doc `MAGIC-Token-HopNhat` "CARP gộp vào MAGIC" đã DEPRECATED 2026-07-03 — KHÔNG dùng.)

## 6. Vai + ranh giới sửa code

- **Thư** = mobile (native camera/EXIF, Enclave ký, wiring API backend-facing).
- **Tùng** = frontend/UIUX.
- **Claude/SuperApp** = frontend + gọi API (KHÔNG sửa backend platform).
- Backend từng platform do team platform sở hữu: PhoenixKey = Long · ProofChat = Lợi · AladinWork = Work team · OriLife = OriLife agent · LampNet = LampNet team.

## 7. Danh mục platform — snapshot (build) + upstream (canonical)

| Platform | Module SuperApp | Snapshot (đọc khi build) | Upstream canonical (team maintain) |
|---|---|---|---|
| OriLife | Truy-xuất (cây/quả/vật/farm) | [`Integration/OriLife.md`](Integration/OriLife.md) | [`OriLifeTrace/OriLife-Specs`](https://github.com/OriLifeTrace/OriLife-Specs) → `SuperApp-Integration.md` |
| PhoenixKey | DID login · ví · OrgDID/mint | [`Integration/PhoenixKey.md`](Integration/PhoenixKey.md) | [`PhoenixKeyDID`](https://github.com/PhoenixKeyDID) → repo Specs `SuperApp-Integration.md` |
| ProofChat | Trò-chuyện (E2EE) | [`Integration/ProofChat.md`](Integration/ProofChat.md) | [`ProofChat/BE`](https://github.com/ProofChat/BE) → `SuperApp-Integration.md` |
| AladinWork | Việc-làm | [`Integration/AladinWork.md`](Integration/AladinWork.md) | [`AladinWork/Specs`](https://github.com/AladinWork/Specs) → `SuperApp-Integration.md` |
| LampNet | Kết đèn | [`Integration/LampNet.md`](Integration/LampNet.md) | [`LampNetCloud/Specs`](https://github.com/LampNetCloud/Specs) → `SuperApp-Integration.md` |

> Snapshot luôn có link hoạt động (nội-repo). Upstream: nếu team chưa commit file lên repo Specs của org, coi là việc cần làm — SuperApp vẫn build từ snapshot.

## 8. Tóm tắt hiện trạng 5 platform (cross-ref 2026-07-11)

| Platform | main HEAD | Base URL | Auth | Readiness |
|---|---|---|---|---|
| **OriLife** | `6e8210b` (07-08) | `api.orilife.io` | DID P-256, token 12h | 🟡 prod drift ~1500 dòng + B1/B2/B3 (issue [#20](https://github.com/AladinContract/SuperApp/issues/20)) |
| **PhoenixKey** | `6c45962` (06-12) | `api.phoenixkey.me` | token-exchange ServiceDID + JWKS | Ví Standard 🟢 (**đã nối app** — PR [#42](https://github.com/AladinContract/SuperApp/pull/42)) · Mint 🔴 NO-GO |
| **ProofChat** | BE `52a41db` (07-04) | `api.proofchat.me` | login → accessToken | 🔴 502 (BE#58 chưa merge, thiếu JWT_ISS/AUD) · interop identity |
| **AladinWork** | `8040617` (07-07) v0.2.0 | `<host>:7040` chưa có | challenge/verify P-256 → session | 🟡 code sẵn (Docker), chưa có host |
| **LampNet** | hivemind `506c611` (07-11) | `lampnet.cloud` | join public · upload Bearer | 🟡 join/compute chạy · 🔴 reward dry-run, storage NI |

> Chi tiết + endpoint đầy đủ ở snapshot [`Integration/`](Integration/). Mỗi phiên đọc file đó, KHÔNG dựa trí nhớ. Trạng thái nhánh: [`BRANCH-AUDIT.md`](BRANCH-AUDIT.md).
