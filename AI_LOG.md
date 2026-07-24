# AI_LOG

> Nhật ký thay đổi do AI thực hiện. **Đọc file này TRƯỚC khi làm việc** thay vì quét cả project.
> Mỗi mục: ngắn gọn — làm gì / file liên quan / cách dùng. Mục mới thêm lên đầu.

---

## Fix Dashboard Trace kẹt loading khi user mới / chưa có trang trại

`src/modules/trace/screens/DashboardScreen.tsx` — vào Trace (route `Dashboard`) khi `currentUser` null (user mới, chưa có farm) → màn trắng, chỉ skeleton loading mãi.
- Nguyên nhân: `loadDashboard` có `if (!user) return;` ĐẶT TRƯỚC `try/finally` → `setHasLoadedOnce(true)` trong finally không chạy → điều kiện loading (`!hasLoadedOnce && !hasData`) kẹt true.
- Fix: chuyển guard `if (!user) return;` VÀO trong `try` → finally luôn chạy → rơi xuống empty state "Chưa có dữ liệu / Hãy thêm trang trại đầu tiên".

## Fix icon Home + QR scan không hiện (sót MCI name)

`resolveGateItems.ts` có registry icon RIÊNG chưa migrate → nút giữa (Home) & mục Trace-quét (QR) render null.
- `index.tsx` mainIcon fallback `home-variant` → `house`.
- `resolveGateItems.ts`: pine-tree→tree, needle→syringe, barn→warehouse, wallet-outline→wallet, bell-outline→bell, **qrcode-scan→qrcode**.
- Bài học: icon strings nằm ở NHIỀU registry (navLabels, actionRegistry, **resolveGateItems**, + fallback rải rác). Đổi bộ icon phải quét HẾT. Dùng script cross-check: node so tên `icon:`/`name=` với `ICONS`.

## Áp dụng Icon cho Navbar + Arc menu

Đã thay `react-native-vector-icons/MaterialCommunityIcons` → `<Icon>` (FA Solid) ở navbar + arc menu.
- Files: `src/navigation/NavItemFrame.tsx`, `src/navigation/index.tsx` (import), `src/navigation/navLabels.ts` (NAV_FRAME), `src/navigation/actionRegistry.ts` (action icons).
- Tên icon trong registry đổi từ MCI → FA Solid. FA Solid là 1 style → `icon` = `iconActive` (trạng thái active/nghỉ phân biệt bằng MÀU `tint`/`dimTint`, không đổi glyph).
- Map: home→house, chat-processing→comments, sprout→seedling, briefcase→briefcase, lightning-bolt→bolt, account-circle→circle-user, close-circle-outline→circle-xmark, pine-tree→tree, fruit-cherries→apple-whole, video-plus→video, paw→paw, watering-can→droplet, silverware-fork-knife→utensils, needle→syringe, barn→warehouse, cow→cow. Fallback dashboard→table-cells-large.
- `<Icon name>` giờ nhận `IconName | string` (registry truyền string động; tên lạ → null + warn DEV).
- `react-native-vector-icons` VẪN còn dùng ở file khác — chưa gỡ khỏi package.json.

## Hệ thống Icon (Font Awesome Solid)

**Bộ icon chính của toàn app** = Font Awesome Solid (`fa6-solid`) tải từ Iconify.

- **Nguồn (source of truth):** `assets/icons/*.svg` — file SVG tải từ Iconify.
- **Registry (auto-gen):** `src/components/Icon/icons.generated.ts` — KHÔNG sửa tay.
- **Component:** `src/components/Icon/Icon.tsx` (render bằng `react-native-svg`).
- **Import:** đường dẫn tương đối tới `src/components/Icon`, vd `import { Icon } from '../../components/Icon'` (project chưa cấu hình path alias).
- **Script:** `scripts/icons.js`.

### Dùng
```tsx
<Icon name="house" size={24} color="#16A34A" />        // fill (mặc định)
<Icon name="bell" size={20} color="#111" variant="outline" strokeWidth={28} />
<Icon name="user" size={28} color="#888" opacity={0.6} accessibilityLabel="Hồ sơ" />
```
Props: `name` (bắt buộc) · `size` (cao px, rộng tự scale, def 24) · `color` (def #000) ·
`variant` `'fill'|'outline'` (def fill) · `strokeWidth` (def 24) · `opacity` · `style` · `accessibilityLabel`.
Icon không tồn tại → render null + cảnh báo ở DEV.

### Thêm icon mới
1. Tìm tên tại https://icon-sets.iconify.design/fa6-solid/
2. `npm run icons -- <ten1> <ten2>`  → tải SVG + regenerate registry.
   (Hoặc `node scripts/icons.js` không tham số = chỉ regenerate từ SVG đã có.)

### Đã seed 62 icon (49 gốc + 13 cho navbar/arc)
arrow-left/right, arrow-right-from-bracket, bars, bell, bookmark, briefcase, calendar, camera,
check, chevron-(left/right/up/down), circle-(info/check/xmark/exclamation), clock, comment(s),
credit-card, ellipsis-vertical, envelope, eye, eye-slash, filter, gear, gift, heart, house,
house-chimney, image, leaf, location-dot, lock, magnifying-glass, paper-plane, pen, phone, plus,
qrcode, share-nodes, sliders, star, trash, user, wallet, xmark.
+navbar/arc: seedling, bolt, circle-user, table-cells-large, tree, apple-whole, video, paw, droplet,
utensils, syringe, warehouse, cow.

### Ghi chú kỹ thuật
- `react-native-svg@15.15.5` đã thêm vào `package.json` (trước đó chỉ là transitive dep).
- Icon FA Solid là glyph đặc → `variant="outline"` = stroke silhouette (dùng khi cần, có thể không đẹp mọi icon).
- viewBox width mỗi icon khác nhau (vd house 576×512) → component scale rộng theo tỉ lệ, cao = `size`.
