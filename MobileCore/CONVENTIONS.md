# MobileCore — Quy ước dùng chung cho 6 nhóm build (BẮT BUỘC)

> Áp cho mọi file trong `MobileCore/`. Council-gate yêu cầu 1 mini-contract chung để PHASE 3 khỏi phải sửa tích hợp lộn xộn.

## 1. Ranh giới tầng
- **L0 (`l0/*`)** = TS THUẦN, KHÔNG import `react-native`, KHÔNG chạm phần cứng/OS/UI. Chỉ tính toán + điều phối logic. Test được bằng Jest node thuần.
- **L1 (`l1/*`)** = CHỈ khai **interface** (TypeScript `interface`/`type` mô tả contract native). KHÔNG hiện thực native ở đây. Mỗi symbol native gắn JSDoc `@needs-device-test`.

## 2. Export & đặt tên
- **Named export** duy nhất — KHÔNG `export default`.
- Hàm/biến: `camelCase`. Type/interface/class: `PascalCase`. Hằng: `UPPER_SNAKE`.
- Mỗi module có `index.ts` re-export API công khai của nó. Barrel gốc `MobileCore/index.ts` do orchestrator ráp ở PHASE 3 — **agent KHÔNG sửa file gốc** (`MobileCore/index.ts`, `tsconfig.json`, `l0/errors.ts`).

## 3. Lỗi
- Ném `MobileCoreError` từ `../errors` (đường dẫn tương đối trong l0) với `code` thuộc `MobileCoreErrorCode`.
- KHÔNG nhét câu tiếng Việt cho người dùng vào L0. Text người-đọc là việc của tầng UI platform. Nếu harvest thấy `fieldErrorMessage()` (tiếng Việt) → GIỮ LẠI dạng map `code → key` hoặc để platform tự dịch, KHÔNG hard-code câu vào core.

## 4. Test
- Mỗi năng lực có test trong `<module>/__tests__/<name>.test.ts`.
- Test THẬT: input→output cụ thể, có ca biên (edge-case survey đã chỉ ra: wrap-around self-intersection, walk-away polygon lõm, 401 single-flight đồng thời, cooldown chỉ khi lỗi-server không khi user-huỷ...). KHÔNG test rỗng/`expect(true)`.
- Chạy được: `npx jest MobileCore/l0/<module>`.

## 5. Harvest — KHÔNG kéo rác
- Mở lại file nguồn trên ĐÚNG branch (survey ghi `repo@branch`) bằng `git show <branch>:<path>` trước khi bê.
- BỎ mọi mock/stub/dead-code (survey đánh dấu). Ví dụ: video→Spectra mock, dead-code delegate GPU, hardcoded model name → viết dạng registry/param, KHÔNG copy nguyên.
- GIỮ nguyên comment giải-thích-edge-case (lịch sử debug field) — đó là tri thức, không phải rác.

## 6. Phụ thuộc
- Cần thêm dependency npm → KHÔNG tự sửa `package.json`. Ghi 1 dòng vào `<module>/NEEDS.md` để orchestrator gộp ở PHASE 3.
- L0 hạn chế tối đa dependency ngoài; ưu tiên chuẩn TS/JS built-in.
