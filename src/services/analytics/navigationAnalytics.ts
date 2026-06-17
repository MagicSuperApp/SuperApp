// services/analytics/navigationAnalytics.ts

import type { NavigationState, PartialState } from '@react-navigation/native';
import analyticsService from './analyticsService';

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
 * màn hình và độ trễ mở màn hình thông qua analyticsService.
 */
export function handleNavigationStateChange(state: AnyNavState): void {
  const routeName = getActiveRouteName(state);
  analyticsService.onNavigationStateChange(routeName);
}
