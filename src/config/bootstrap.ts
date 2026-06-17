// config/bootstrap.ts
//
// SIDE-EFFECT BOOTSTRAP — wire theme theo instance đang chạy.
//
// Vì sao là module RIÊNG (không inline trong index.js):
//   ES `import` được HOIST và thực thi theo THỨ TỰ XUẤT HIỆN, trước mọi câu
//   lệnh trong file. Nếu để `setActiveThemeConfig(...)` là câu lệnh dưới phần
//   import trong index.js, nó vẫn chạy SAU khi `import App` đã giải (kéo theo
//   screens import theme → snapshot alias COLORS/NAV). Đặt việc set theme làm
//   SIDE-EFFECT của module này, rồi import module này là DÒNG ĐẦU index.js,
//   bảo đảm theme resolve TRƯỚC khi cây import App chạm theme (YC-1: stylesheet
//   đọc token lúc import top-level).
//
// DEFAULT (Aladin) = override rỗng → token giữ nguyên giá trị (parity tuyệt
// đối). White-label: đổi DEFAULT_INSTANCE.themeConfig trong instance.config.ts.

import { setActiveThemeConfig } from '../theme';
import { DEFAULT_INSTANCE } from './instance.config';

setActiveThemeConfig(DEFAULT_INSTANCE.themeConfig);
