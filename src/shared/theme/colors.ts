// shared/theme/colors.ts
//
// Gộp về nguồn token duy nhất (YC-1): NEUTRAL + withAlpha + ModuleTheme nay
// sống tại theme/tokens.ts. File này GIỮ làm alias để các import sẵn có
// (NEUTRAL, withAlpha, ModuleTheme, NeutralPalette) không vỡ. Giá trị KHÔNG đổi.
// Code mới nên dùng useTheme()/getToken() từ 'src/theme'.

import { NEUTRAL, withAlpha } from '../../theme';
import type { ModuleTheme, NeutralTokens } from '../../theme/tokens';

export { NEUTRAL, withAlpha };
export type { ModuleTheme };
export type NeutralPalette = NeutralTokens;
