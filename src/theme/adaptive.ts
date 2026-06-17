// theme/adaptive.ts
//
// LỚP ADAPTIVE 2 CỰC (INTEGRATION-STANDARD §7.2) — token-driven.
//
// Hai cực NGANG NHAU từ đầu:
//   - lowEnd : nông dân / Android đời thấp / 3G / ít quen — tắt hiệu ứng nặng,
//              giảm ảnh, spacing gọn, ít animation, ưu tiên offline.
//   - rich   : đô thị / máy mạnh / quen app — đầy đủ hiệu ứng.
//
// "Cùng token, 2 profile giá trị" (§2.1): file này KHÔNG định nghĩa MÀU (màu
// vẫn ở tokens.ts). Nó định nghĩa các token HÀNH VI/MẬT ĐỘ (animation, ảnh,
// spacing, shadow) theo 2 cực — declarative thuần, KHÔNG logic/eval (QĐ-1).
//
// Override 2 cấp (§7.2):
//   1. ADMIN của instance — đọc từ instance.config (setActiveAdaptiveConfig
//      lúc bootstrap, cùng pattern setActiveThemeConfig của theme/index.ts).
//   2. USER tự chọn — setUserAdaptiveProfile() (đọc/ghi từ user setting).
// Khi cả hai 'auto' → tự động dò tier qua tín hiệu thiết bị/mạng sẵn có
// (Dimensions/PixelRatio + NetInfo) — KHÔNG cài thêm package.
//
// Vì sao module-level state (không React Context): nhất quán với theme/index.ts
// — token đọc ở stylesheet top-level; Context sẽ vỡ ~73 import sẵn có. Hook
// useAdaptive() đăng ký lại khi tín hiệu (mạng/kích thước) đổi để re-render.

import { useEffect, useState } from 'react';
import { Dimensions, PixelRatio } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

// ---------------------------------------------------------------------------
// Profile + token biến thể
// ---------------------------------------------------------------------------
export type AdaptiveTier = 'lowEnd' | 'rich';

// Lựa chọn override: 'auto' = nhường cho dò tự động / cấp dưới.
export type AdaptiveChoice = AdaptiveTier | 'auto';

// Token hành vi/mật độ — 2 profile giá trị. Literal thuần (không expression).
export interface AdaptiveTokens {
  tier: AdaptiveTier;
  // Bật animation trang trí (pulse/float/slide-in card...). lowEnd = false.
  animations: boolean;
  // Hệ số nhân thời lượng animation còn-lại (vd shimmer). lowEnd rút ngắn.
  motionScale: number;
  // Bật shimmer của Skeleton. Máy yếu: tắt → khối tĩnh, vẫn hiển thị bố cục.
  shimmer: boolean;
  // Bật shadow/elevation nặng. lowEnd = false (đỡ overdraw).
  shadows: boolean;
  // Tỉ lệ ảnh tải (gợi ý cho ảnh có biến thể độ phân giải). lowEnd giảm.
  imageScale: number;
  // Hệ số spacing — lowEnd gọn hơn để vừa màn nhỏ + ít cuộn.
  spacingScale: number;
  // Số item render ban đầu cho danh sách dài (FlatList initialNumToRender).
  listInitialRender: number;
}

const RICH_TOKENS: AdaptiveTokens = {
  tier: 'rich',
  animations: true,
  motionScale: 1,
  shimmer: true,
  shadows: true,
  imageScale: 1,
  spacingScale: 1,
  listInitialRender: 10,
};

const LOW_END_TOKENS: AdaptiveTokens = {
  tier: 'lowEnd',
  animations: false,
  motionScale: 0.6,
  shimmer: false,
  shadows: false,
  imageScale: 0.5,
  spacingScale: 0.85,
  listInitialRender: 6,
};

const TOKENS_BY_TIER: Record<AdaptiveTier, AdaptiveTokens> = {
  rich: RICH_TOKENS,
  lowEnd: LOW_END_TOKENS,
};

// ---------------------------------------------------------------------------
// Override 2 cấp (declarative)
// ---------------------------------------------------------------------------
export interface AdaptiveConfig {
  // Override cấp ADMIN (instance). 'auto' = không ép, để dò tự động.
  profile: AdaptiveChoice;
}

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveConfig = { profile: 'auto' };

// State module-level (giống activeTheme).
let adminChoice: AdaptiveChoice = DEFAULT_ADAPTIVE_CONFIG.profile;
let userChoice: AdaptiveChoice = 'auto';

// Bộ thuê-bao để hook re-render khi override/tín hiệu đổi.
type Listener = () => void;
const listeners = new Set<Listener>();
function emit(): void {
  listeners.forEach((l) => l());
}

// Wire lúc bootstrap từ instance.config (cùng pattern setActiveThemeConfig).
export function setActiveAdaptiveConfig(config: AdaptiveConfig): void {
  adminChoice = config.profile ?? 'auto';
  emit();
}

// User tự chọn (đọc/ghi từ user setting). Truyền 'auto' để bỏ ép, về dò tự động.
export function setUserAdaptiveProfile(choice: AdaptiveChoice): void {
  userChoice = choice;
  emit();
}

export function getUserAdaptiveProfile(): AdaptiveChoice {
  return userChoice;
}

// ---------------------------------------------------------------------------
// Dò tự động (chỉ chạy khi không có override) — tín hiệu SẴN CÓ, không package.
//   - PixelRatio + kích thước màn: proxy nhẹ cho đời máy / RAM. Máy phổ thông
//     đời thấp ở VN thường màn nhỏ + mật độ điểm thấp.
//   - Mạng: cellular/2g/3g hoặc mất kết nối → nghiêng về lowEnd (tiết kiệm).
// Đây là HEURISTIC bảo thủ: nghi ngờ thì nghiêng lowEnd (2 cực ngang nhau,
// nhưng an toàn cho máy yếu là ràng buộc chính — theo anh Aladin).
// ---------------------------------------------------------------------------
function detectFromDevice(): AdaptiveTier {
  const { width, height } = Dimensions.get('window');
  const shortest = Math.min(width, height);
  const density = PixelRatio.get();
  // Màn hẹp (≤ 360dp) hoặc mật độ thấp (≤ 2) → máy phổ thông đời thấp.
  if (shortest <= 360 || density <= 2) return 'lowEnd';
  return 'rich';
}

function tierFromNetwork(
  type: string | null | undefined,
  cellularGen: string | null | undefined,
): AdaptiveTier | null {
  if (type === 'cellular') {
    // 2g/3g → lowEnd; 4g/5g không tự ép (để device quyết).
    if (cellularGen === '2g' || cellularGen === '3g') return 'lowEnd';
  }
  if (type === 'none') return 'lowEnd';
  return null;
}

// Tier hiệu lực: ưu tiên USER → ADMIN → dò tự động (device + mạng hiện tại).
function resolveTier(networkTier: AdaptiveTier | null): AdaptiveTier {
  if (userChoice !== 'auto') return userChoice;
  if (adminChoice !== 'auto') return adminChoice;
  // Dò tự động: nếu mạng yếu HOẶC device yếu → lowEnd.
  if (networkTier === 'lowEnd') return 'lowEnd';
  return detectFromDevice();
}

// ---------------------------------------------------------------------------
// Selector ngoài-React (cho stylesheet/handler không trong component).
// Lưu ý: bản này KHÔNG biết mạng (chỉ device + override) — dùng cho giá trị
// tĩnh; thông tin mạng realtime đi qua hook useAdaptive().
// ---------------------------------------------------------------------------
export function getAdaptive(): AdaptiveTokens {
  return TOKENS_BY_TIER[resolveTier(null)];
}

// ---------------------------------------------------------------------------
// Hook chính cho component — re-render khi override/kích thước/mạng đổi.
// ---------------------------------------------------------------------------
export function useAdaptive(): AdaptiveTokens {
  const [networkTier, setNetworkTier] = useState<AdaptiveTier | null>(null);
  // version chỉ để buộc re-render khi override/Dimensions đổi.
  const [, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    listeners.add(bump);

    const dimSub = Dimensions.addEventListener('change', bump);

    const netSub = NetInfo.addEventListener((state) => {
      const details = state.details as { cellularGeneration?: string | null } | null;
      const next = tierFromNetwork(
        state.type as string | null,
        details?.cellularGeneration ?? null,
      );
      setNetworkTier(next);
    });

    return () => {
      listeners.delete(bump);
      // @ts-ignore RN >=0.65 trả subscription có .remove; cũ hơn trả void.
      dimSub?.remove?.();
      netSub();
    };
  }, []);

  return TOKENS_BY_TIER[resolveTier(networkTier)];
}
