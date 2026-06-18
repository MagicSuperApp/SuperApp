// modules/trace/theme/colors.ts
// Truy xuất nông nghiệp — dùng palette xanh dương chung của app.
//
// Gộp về nguồn token duy nhất (YC-1): brand token nay sống tại theme/tokens.ts.
// File này GIỮ làm alias để import sẵn có (TRACE_THEME) không vỡ. Giá trị KHÔNG đổi.

import { TRACE_THEME } from '../../../theme';
import type { ModuleTheme } from '../../../theme/tokens';

export { TRACE_THEME };
export type { ModuleTheme };
