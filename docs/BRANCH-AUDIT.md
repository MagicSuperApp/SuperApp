# SuperApp — Kiểm toán nhánh (2026-07-11)

> Đối chiếu `git merge-base --is-ancestor <nhánh> develop`. develop head = [`8ec70fc`](https://github.com/AladinContract/SuperApp/tree/develop) (merge [#42](https://github.com/AladinContract/SuperApp/pull/42)).
> Quy tắc: nhánh đã-merge → commit đã nằm trong develop, xoá KHÔNG mất gì. **Dev tự xoá nhánh của mình** — file này chỉ cung cấp phân tích.

## A. ĐÃ MERGE hết vào develop → xoá an toàn

| Nhánh | Chủ | Bằng chứng |
|---|---|---|
| [`Spec/work-integration`](https://github.com/AladinContract/SuperApp/tree/Spec/work-integration) | anh | ancestor của develop |
| [`chore/sync-camera-fix`](https://github.com/AladinContract/SuperApp/tree/chore/sync-camera-fix) | anh | ancestor của develop |
| [`claude/camera-fullscreen-overlay`](https://github.com/AladinContract/SuperApp/tree/claude/camera-fullscreen-overlay) | Claude | ancestor của develop |
| [`feat/farm-add-screen-update`](https://github.com/AladinContract/SuperApp/tree/feat/farm-add-screen-update) | **Tùng** | merged [#41](https://github.com/AladinContract/SuperApp/pull/41) |
| [`feat/fix-ui`](https://github.com/AladinContract/SuperApp/tree/feat/fix-ui) | **Tùng** | merged [#33](https://github.com/AladinContract/SuperApp/pull/33) |
| [`feat/tree-scan-ui-update`](https://github.com/AladinContract/SuperApp/tree/feat/tree-scan-ui-update) | **Tùng** | ancestor của develop |
| [`feat/foundation`](https://github.com/AladinContract/SuperApp/tree/feat/foundation) | **Thư** | merged [#2](https://github.com/AladinContract/SuperApp/pull/2) (cả main) |
| [`feat/orilife-phoenixkey-work`](https://github.com/AladinContract/SuperApp/tree/feat/orilife-phoenixkey-work) | **Thư** | merged [#42](https://github.com/AladinContract/SuperApp/pull/42) — ví Standard + YOLO iOS + field A+B |
| [`claude/proofchat-wire`](https://github.com/AladinContract/SuperApp/tree/claude/proofchat-wire) | Claude | merged [#39](https://github.com/AladinContract/SuperApp/pull/39) |

## B. CHƯA merge, cũ, của Claude (DucTiger) — lỗi thời

| Nhánh | Ngày | Sau develop | Đã superseded bởi |
|---|---|---|---|
| [`claude/superapp-build-ready`](https://github.com/AladinContract/SuperApp/tree/claude/superapp-build-ready) | 06-25 | ahead 2 | build/api.orilife.io đã vào develop |
| [`claude/superapp-username-ket-den`](https://github.com/AladinContract/SuperApp/tree/claude/superapp-username-ket-den) | 06-25 | ahead 3 | Kết đèn + [#35](https://github.com/AladinContract/SuperApp/pull/35) SG4 đã merge |
| [`claude/audit-fixes-nonauth`](https://github.com/AladinContract/SuperApp/tree/claude/audit-fixes-nonauth) | 06-27 | ahead 6 | audit cũ, tiền-[#38](https://github.com/AladinContract/SuperApp/pull/38) |
| [`claude/fix-camera-preview`](https://github.com/AladinContract/SuperApp/tree/claude/fix-camera-preview) | 07-02 | ahead 1 | camera guided `2b6b37f` đã vào develop |

→ Cả 4 là nhánh Claude, không mất việc team. Xoá được sau khi anh xác nhận (Claude không tự xoá).

## C. GIỮ (đang sống)

| Nhánh | Lý do |
|---|---|
| [`develop`](https://github.com/AladinContract/SuperApp/tree/develop) · [`main`](https://github.com/AladinContract/SuperApp/tree/main) | nhánh chính |
| `claude/orilife-field-fixes` | việc app đang làm (B2 reconcile, allow_enroll_new) — chưa push, sẽ PR vào develop |

> Không còn nhánh feature nào của Thư/Tùng đang mở trên origin — tất cả đã merge.

## D. Phân vai việc dọn + follow-up

**→ Thư (mobile / PR):** xoá nhánh đã merge của mình (`feat/foundation`, `feat/orilife-phoenixkey-work`). Follow-up: B3 Android EXIF/blur, mint FFI (worktree `_wt-superapp-mint`).

**→ Tùng (frontend / UIUX):** xoá 3 nhánh đã merge (`feat/farm-add-screen-update`, `feat/fix-ui`, `feat/tree-scan-ui-update`). Follow-up: Home config-driven (bỏ quick-actions 100% Trace), mở Domain menu ra work/chat/join, ẩn/Việt-hoá thuật ngữ.

**→ Claude (frontend + API):** xoá 4 nhánh claude cũ (mục B) sau khi anh xác nhận. App: B2 farm reconcile, allow_enroll_new wire (ví Standard đã do Thư làm ở [#42](https://github.com/AladinContract/SuperApp/pull/42)).
