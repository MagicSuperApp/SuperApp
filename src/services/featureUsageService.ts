// services/featureUsageService.ts
//
// Suy ra "tính năng hay dùng" từ hành vi thật, để Quick Action ở Trang chủ tự
// mọc nút và tự sắp thứ tự.
//
// Mô hình đếm — CHỈ MỘT LUẬT, không có ngoại lệ:
//   MỞ MÀN HÌNH CỦA MỘT TÍNH NĂNG = 1 LƯỢT DÙNG.
// Khoá đếm chính là TÊN ROUTE. Ghi nhận đặt ở NavigationContainer.onStateChange
// (services/analytics/navigationAnalytics.ts) nên MỌI lối vào đều tính: nút Quick
// Action, mục Dịch vụ, navbar, menu hành động, deep-link. Không màn nào phải tự
// gọi hàm đếm → không thể quên, không lệch key.

import { QUICK_ACTIONS, QUICK_ACTION_MIN_USES, type QuickActionConfig } from '../config/quickActions';
import { insertUsage, getUsageCounts, resetUsage, usageBackend, type UsageCounts } from './featureUsageDb';

export type { QuickActionConfig, UsageCounts };
export { QUICK_ACTION_MIN_USES, resetUsage, usageBackend };

// Chống đếm trùng cho CÙNG một lần mở: onStateChange có thể bắn nhiều lần liên
// tiếp cho cùng một route (animation, nested navigator settle). Mở lại route sau
// 1.5s được tính là lượt mới.
const DEDUPE_MS = 1500;
const lastLoggedAt: Record<string, number> = {};

// Chỉ đếm route CÓ TRONG cấu hình Quick Action — khỏi phình bảng vì những màn phụ.
const TRACKED_ROUTES = new Set(QUICK_ACTIONS.map((a) => a.route));

/** Gọi từ NavigationContainer.onStateChange mỗi khi route đang hiển thị đổi. */
export function trackScreenOpen(routeName: string | undefined): void {
  if (!routeName || !TRACKED_ROUTES.has(routeName)) return;
  const now = Date.now();
  if (now - (lastLoggedAt[routeName] ?? 0) < DEDUPE_MS) return;
  lastLoggedAt[routeName] = now;
  // fire-and-forget: người dùng đang điều hướng, không chờ ghi DB.
  void insertUsage(routeName);
}

export type RankedQuickAction = QuickActionConfig & { useCount: number };

/**
 * Danh sách nút Quick Action cần hiển thị: chỉ tính năng đã dùng >= ngưỡng,
 * sắp theo số lượt GIẢM DẦN (dùng nhiều nhất đứng đầu). Chưa đủ → mảng rỗng
 * → HomeScreen ẩn cả khối.
 */
export async function getRankedQuickActions(): Promise<RankedQuickAction[]> {
  const counts = await getUsageCounts();
  return QUICK_ACTIONS.map((a) => ({ ...a, useCount: counts[a.route] ?? 0 }))
    .filter((a) => a.useCount >= QUICK_ACTION_MIN_USES)
    .sort((a, b) => b.useCount - a.useCount);
}
