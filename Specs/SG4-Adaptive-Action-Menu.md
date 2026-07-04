# SG4 — Menu hành động thích ứng (Adaptive Action Menu)

> **Scope**: L3 (SG4 · Host Shell/Navigation) · DRAFT v0.1 (2026-07-03) · chờ anh Aladin duyệt.
> **Thuộc**: nút chính giữa navbar (kế thừa notch, PR #23) — chạm = Trang chủ, giữ/kéo = xoè menu nhanh.
> **Tuân**: PLATFORM-MASTER INV-2 (data ⟂ experience), UI-UX-STANDARD §3 (token) + §11 (điều hướng), INTEGRATION §7.

## 0. Một câu định nghĩa
Menu nhanh (xoè từ nút chính) **KHÔNG cố định**. Nút hiển thị = **hành động khả dụng cho loại thực thể người dùng đang quản lý**, xếp theo mức hay dùng, đặt tên động theo loài. Người trồng sầu riêng và người nuôi gà thấy nút KHÁC nhau từ cùng một nút chính.

## 1. Nguyên lý (menu = hàm 3 tầng)
`menu = rank( actions(domain(user)) ∩ context(screen) , usage(user) )` → lấy top 3–4.

1. **Domain của user — TỰ SUY TỪ DỮ LIỆU** (không hỏi thêm — ưu tiên ít thao tác):
   - Suy từ `state.farm` (farms + trees + animals user đã đăng ký) + loài đã nhận diện.
   - Có cây ăn trái sầu riêng → domain `orchard-durian`; có gà → `poultry`; nhiều loại → hợp nhiều pack.
   - **User mới chưa có gì** → menu onboarding: chỉ `Thêm vườn` / `Thêm đàn`.
2. **Ngữ cảnh màn**: đang ở vườn/đàn X → boost hành động của domain đó lên đầu.
3. **Cá nhân hoá**: đếm tần suất dùng mỗi hành động (AsyncStorage), hành động hay dùng nổi lên; cho **ghim 1 mặc định** (chạm nút chính = chạy mặc định thay vì về Trang chủ).

## 2. Action Registry (config-driven — như module registry, INV-2 experience layer)
Mỗi domain khai 1 **ActionPack**; thêm domain mới KHÔNG sửa navigator.
```ts
interface ActionPack {
  domain: string;                       // 'orchard-durian' | 'poultry' | ...
  match: (farm: FarmState) => boolean;  // user có loại này không (suy từ dữ liệu)
  actions: ActionDef[];
}
interface ActionDef {
  key: string;                          // 'scan-tree' | 'feed' | ...
  label: (entity?: EntityCtx) => string;// ĐỘNG theo loài: e => `Quét ${e.speciesName}`
  icon: string;                         // Tabler outline
  group: 'scan' | 'nutrition' | 'health' | 'create';  // quyết định MÀU (§4)
  route: string;                        // màn đích khi chọn
  canCreate?: boolean;                  // hành động "Thêm ..." — luôn ưu tiên giữ 1 slot
}
```

### Bộ pack pilot (đề xuất — mở rộng sau qua config)
| Domain | actions (label động) |
|---|---|
| `orchard-durian` | Quét ${loài}(scan) · Quét quả(scan) · Bón phân(nutrition) · Tỉa quả(health) |
| `orchard-generic` | Quét ${loài}(scan) · Quét quả(scan) · Bón phân(nutrition) · Thêm vườn(create) |
| `poultry` | Quét ${loài}(scan) · Cho ăn(nutrition) · Tiêm thuốc(health) · Thêm đàn(create) |

> Loài (`speciesName`) lấy từ entity đã nhận diện: "Quét sầu riêng", "Quét gà". Chưa rõ loài → "Quét cây"/"Quét vật" mặc định.

## 3. Thuật toán chọn nút
```
packs   = REGISTRY.filter(p => p.match(farmState))
actions = unique(flatten(packs.map(p => p.actions)))
if (screen is a farm/flock X) boost actions of X.domain
ranked  = actions.sort(by usageCount desc, then pack default order)
pick    = ranked.slice(0, 4)
if (user canCreate && no create-action in pick) → thay slot cuối bằng "Thêm vườn/đàn"
if (farmState empty) → return onboarding menu [Thêm vườn, Thêm đàn]
label mỗi action qua label(entityCtx)  // đặt tên động theo loài
```
Số nút: **3–4** (giữ đơn giản). Không bao giờ > 4.

## 4. Màu — mã hoá theo NHÓM hành động (token hoá, không hardcode)
Nhất quán xuyên domain để tạo phản xạ (dù đổi loại canh tác, màu nhóm giữ nguyên):
| group | ý nghĩa | token màu (UI-UX-STANDARD §3) |
|---|---|---|
| `scan` | quét / nhận diện | xanh lá (success family) |
| `nutrition` | bón phân / cho ăn | hổ phách (amber) |
| `health` | tỉa quả / tiêm thuốc / thu | đỏ (error/warm family) |
| `create` | thêm vườn / đàn | lam (accent) |
Nút chính: 1 màu ấm tương phản cao nổi trên navbar xanh đậm. Contrast ≥ WCAG AA. Icon lớn, nhãn 1 từ, bo mềm, animation xoè mượt.

## 5. Ranh giới
- Đây **experience layer** (SG4/SG7) — cấu hình per user/instance; **data layer** (entity type, loài) từ farm/animal model (SG3), KHÔNG đổi.
- Nút chính giữ hành vi: **chạm = Trang chủ** (hoặc mặc định đã ghim), **giữ/kéo = xoè menu**. Giữ tab Tài khoản trong navbar.
- Thêm domain pack mới = config, không sửa navbar (như thêm module qua registry).

## 6. Change Log
- v0.1 (2026-07-03): Khởi tạo từ yêu cầu anh Aladin (menu phải thích ứng theo loại canh tác — vườn cây ≠ sầu riêng ≠ trại gà). Domain tự suy từ dữ liệu; Action Registry config-driven; naming động theo loài; màu theo nhóm hành động.
