# Quy tắc đóng góp — SuperApp

> Giai đoạn sắp chạy production. Tuân thủ chặt luồng nhánh dưới đây.

## Luồng nhánh

```
feature/* , fix/* , claude/*   →  PR  →  develop      (nhánh tích hợp, default)
develop                         →  PR  →  main         (chỉ khi sẵn sàng production)
```

- **`main`**: nhánh production. KHÔNG push thẳng. Chỉ nhận PR **từ `develop`**.
- **`develop`**: nhánh tích hợp (default branch). Mọi feature/fix gộp vào đây trước.
- **Nhánh con**: luôn cắt từ `develop`, đặt tên `feature/...`, `fix/...`, `claude/...`.

## Cách làm

1. `git checkout develop && git pull`
2. `git checkout -b feature/ten-viec`
3. Code + commit, mở **PR vào `develop`** (mặc định đã là develop).
4. Review xong → merge vào `develop`.
5. Khi `develop` đủ chín cho production → mở PR `develop → main`.

## Chốt kỹ thuật

- Default branch = `develop` → PR/clone tự nhắm develop.
- Workflow [`branch-policy.yml`](.github/workflows/branch-policy.yml): PR nhắm `main` mà
  không xuất phát từ `develop` sẽ **fail** (chốt mềm — repo private+free chưa bật được
  branch protection cứng; khi nâng GitHub Pro sẽ thêm ruleset cấm push thẳng main).
