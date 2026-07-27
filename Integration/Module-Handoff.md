# SuperApp — Sổ bàn giao tính năng module (Module-Handoff)

> **Cho ai:** Thư (mobile/native), Tùng (frontend/UIUX), và SuperApp agent.
> **Là gì:** Danh sách SỐNG các việc cần DỰNG/CẬP NHẬT trong SuperApp — mỗi dòng 1 việc
> cụ thể (màn/wire/shape/fix), gắn với module backend đã (hoặc sắp) sẵn sàng.
> **Ai điền:** Agent của module/nền tảng ĐẨY dòng vào NGAY khi hoàn thành phần backend cần
> UI/wire ở SuperApp — KHÔNG để SuperApp đi hỏi. Format + nghĩa vụ: `Integration-Standard.md §12`.
> **Định nghĩa Done:** dev dựng xong + verify (tsc/test + đối chiếu shape thật) + merge vào develop.
> **Nguồn sự thật shape:** `Integration/<Platform>.md` (snapshot build). Ledger CHỈ trỏ, không chép shape.

Ký hiệu trạng thái BE: 🟢 live&deployed · 🟡 code có, chưa deploy · 🔴 chưa build · ⚫ OPS/secret chờ anh.

---

## Đang mở — chờ dev SuperApp dựng

| ID | Module (agent) | Loại | Việc ở SuperApp | Ref shape | BE | Ai | Ngày đẩy |
|----|----------------|------|-----------------|-----------|----|----|----------|
| H-01 | AladinWork | Screen | Màn KHÁM PHÁ dựng từ `/templates` thật (14 job-type: label/icon/fields/giá). Hiện chỉ có chip "Ngành nghề" (taxonomy nhóm), CHƯA có màn duyệt template. | `Integration/AladinWork.md` · `GET /api/v1/templates` | 🟢 | Tùng | 2026-07-27 |
| H-02 | AladinWork | Screen | Phục hồi mục "Tasker Nổi Bật" (đã gỡ vì mock) khi có API danh sách tasker/worker THẬT. | cần AladinWork cấp `/taskers` | 🔴 | Tùng | 2026-07-27 |
| H-03 | OriLife | Wire | Batch field-test #5/#6/#12: UX enroll dùng `views_kept`/`coverage_hint_vi` (#236), `features_vi` (#237), `suggest_text`/`dup_suspect.message_vi` (#235). | `Integration/OriLife.md` · chờ payload thật | 🟡 | Thư | 2026-07-27 |
| H-04 | OriLife | Wire | #10 danh sách hoạt động từ `GET /api/species/catalog` (`activities[]`). | chờ OriLife xác nhận đường+shape | 🟡 | Thư | 2026-07-27 |
| H-05 | OriLife | Screen | #7 hiện ảnh cây từ `GET /api/tree_views?tree_id=` (Tổng-quan/Lịch-sử + loading/empty). Chờ xác nhận `views[].url` tuyệt-đối/tương-đối + header auth. | `Integration/OriLife.md` | 🟢 | Tùng | 2026-07-27 |
| H-06 | OriLife | Fix | #9 SafeArea insets 2 màn (FruitVideoScreen nút sát mép) — client thuần. | — | 🟢 | Tùng | 2026-07-27 |
| H-07 | OriLife | Wire | Poll `POST /api/build3d/{tree_id}` + trạng thái khi model 3D chưa sẵn (viewer `/view/{code}`). | `Integration/OriLife.md` | 🟢 | Thư/Tùng | 2026-07-27 |
| H-08 | LAMP+Core+Phoenix | Wire | Mint LAMP: cắm `buildAndSignTx` (dựng+ký CBOR, device_pkh Ed25519) + bật `ORG_MINT_ENABLED` + shape `mint-lamp`/SSE. UI 2 bước ĐÃ dựng, chỉ chờ 3 blocker. | `orgMintService.ts` · chờ LAMP/Core/Phoenix | 🔴 | Thư | 2026-07-27 |
| H-09 | (native 3D) | Fix | `src/features/space3d/scene` — 79 lỗi tsc trên develop (feature 3D native WIP). Chưa rõ owner. | — | 🟡 | ? | 2026-07-27 |

## Đã xong (giữ lịch sử)

| ID | Việc | Merge |
|----|------|-------|
| — | Cổng runtime tự bật module khi backend sống | PR #68 (2026-07-27) |
| — | Field-test Đức #8/#11/#2/#1 (nav 3D/quả, GPS, schema) | PR #72 (2026-07-27) |
| — | AladinWork go-real: gỡ mock, empty-state thật, count thật | (chờ merge) |
| — | OrgDID: thêm ô MST tuỳ chọn | (chờ merge) |

---

*Cập nhật lần cuối bởi SuperApp agent 2026-07-27. Agent module: thêm dòng của mình vào bảng "Đang mở" theo §12.*
