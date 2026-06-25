// constants/index.ts

// COLORS gộp về nguồn token duy nhất (YC-1). Giá trị giữ NGUYÊN (lớp `app` của
// theme/tokens.ts). Re-export để các import COLORS sẵn có không vỡ.
// Code mới nên dùng useTheme()/getToken() từ '../theme'.
import { COLORS } from '../theme';
import type { AppTokens } from '../theme/tokens';

export { COLORS };
export type ColorsType = AppTokens;

// Build 51 (2026-05-17) — flip from mock to staging Cloudflare tunnel.
export const API_BASE_URL = 'https://api.orilife.io';

export const CREDITS_PER_IMAGE = 1; // 1 MAGIC per image

export const LAMP_TO_MAGIC_RATIO = 1; // 1 LAMP = 1 MAGIC every 5 days
