// modules/work/theme/colors.ts
// Việc làm — Aladin brand palette: xanh lá đậm + cam accent.
// Tham chiếu: ~/Downloads/aladin-icon-1024.png + AladinApp cover.png
//
// Gộp về nguồn token duy nhất (YC-1): brand token nay sống tại theme/tokens.ts.
// File này GIỮ làm alias để import sẵn có (WORK_THEME, WORK_ACCENT, ...) không vỡ.
// Giá trị KHÔNG đổi.

import {
  WORK_THEME,
  WORK_ACCENT,
  WORK_ACCENT_DEEP,
  WORK_BG_SOFT,
} from '../../../theme';
import type { ModuleTheme } from '../../../theme/tokens';

export { WORK_THEME, WORK_ACCENT, WORK_ACCENT_DEEP, WORK_BG_SOFT };
export type { ModuleTheme };
