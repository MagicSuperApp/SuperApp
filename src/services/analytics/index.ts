// services/analytics/index.ts
//
// Điểm vào duy nhất của hệ thống thu thập hành vi người dùng.
//
//   import analytics, { useAnalytics, TrackedButton } from '../services/analytics';
//   analytics.init();                       // App.tsx
//   const { trackTap } = useAnalytics('Home');

export { default } from './analyticsService';
export { default as analyticsService } from './analyticsService';
export { useAnalytics } from './useAnalytics';
export { default as TrackedButton } from './TrackedButton';
export {
  handleNavigationStateChange,
  getActiveRouteName,
} from './navigationAnalytics';
export * from './types';
