// modules/join/theme/colors.ts
// Kết đèn (LampNet) — brand palette: vàng-hổ-phách (đèn) trên nền xanh app chủ.
//
// Gộp về nguồn token duy nhất (YC-1): brand token sống tại theme/tokens.ts
// (khối `lampnet`). File này CHỈ là alias để import gọn trong module, KHÔNG
// định nghĩa màu mới — zero hardcode màu ở màn (spec §4, UI-UX-STANDARD §3).

import { LAMPNET_THEME } from '../../../theme';
import type { ModuleTheme } from '../../../theme/tokens';

export { LAMPNET_THEME };
export type { ModuleTheme };
