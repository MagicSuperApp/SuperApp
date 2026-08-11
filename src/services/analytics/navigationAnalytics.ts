// services/analytics/navigationAnalytics.ts

import type { NavigationState, PartialState } from '@react-navigation/native';
import analyticsService from './analyticsService';
import { trackScreenOpen } from '../featureUsageService';

type AnyNavState = NavigationState | PartialState<NavigationState> | undefined;

/**
 * Lấy tên route đang hiển thị (đi sâu qua các navigator lồng nhau:
 * Stack → Tab → Stack…).
 */
export function getActiveRouteName(state: AnyNavState): string | undefined {
  if (!state || typeof state.index !== 'number') return undefined;
  const route: any = state.routes[state.index];
  if (route?.state) {
    return getActiveRouteName(route.state);
  }
  return route?.name;
}

/**
 * Gắn vào <NavigationContainer onStateChange={...}>. Tự động đo thời gian xem
 * màn hình và độ trễ mở màn hình thông qua analyticsService, đồng thời ghi nhận
 * lượt DÙNG TÍNH NĂNG (SQLite cục bộ) để Quick Action xếp nút theo thói quen —
 * đếm ở đây nên mọi lối vào đều tính, không riêng nút trong hộp Quick Action.
 */
export function handleNavigationStateChange(state: AnyNavState): void {
  const routeName = getActiveRouteName(state);
  analyticsService.onNavigationStateChange(routeName);
  trackScreenOpen(routeName);
}
