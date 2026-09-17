// services/genie/genieNav.ts
//
// Trợ lý MỞ MÀN cho người dùng — tool `ui.openScreen` phía vỏ.
//
// ── VÌ SAO LÀ MỘT HÀM ĐĂNG KÝ, KHÔNG PHẢI `useNavigation` ───────────────────
// Bong bóng trợ lý dựng ở `navigation/index.tsx` — ANH EM của `Stack.Navigator`,
// không nằm trong nó (`components/assistantBus.ts` nói thẳng lý do: trợ lý không
// phải một trang, nên không có route nào để `navigate` tới). `useNavigation` ở
// một component ngoài navigator thì không có gì để lấy.
//
// Nên đi lối đã có sẵn và đã đo được trong kho này: `setPushNavigator` ở
// `services/pushHandler.ts` nhận một hàm điều hướng tại `onReady`. Tệp này lặp
// đúng khuôn đó.
//
// ── ĐĂNG KÝ TẠI `onReady`, KHÔNG SỚM HƠN ───────────────────────────────────
// Chú thích sẵn có tại chỗ gọi `setPushNavigator` (`navigation/index.tsx`) đã
// nói: *"Trao một hàm điều hướng trước lúc container sẵn sàng là trao một tham
// chiếu chưa dùng được — hỏng lặng lẽ đúng như khi chưa trao gì, chỉ khác là
// lần này trông như đã nối dây."* Luật đó áp nguyên vào đây.
//
// ── TỆP NÀY KHÔNG MỞ ĐƯỜNG NÀO MỚI VÀO APP ─────────────────────────────────
// Nó điều hướng BÊN TRONG app đã qua `AuthGate`, không dựng deep-link, không
// đụng `Linking`. `MODULE_DEEP_LINK_ALLOW = []` ở `navigation/deepLinkAllow.ts`
// là một quyết định có chủ ý và tệp này không lách qua nó.

import { useEffect, useState } from 'react';
import { genieMayOpen } from './fastPath';

type Navigate = (route: string, params?: Record<string, unknown>) => void;

let navigate: Navigate | null = null;

/** Gọi ở `onReady` của `NavigationContainer`. */
export function setGenieNavigator(fn: Navigate | null): void {
  navigate = fn;
}

export type OpenResult =
  | { ok: true }
  /** Chưa nối dây / container chưa sẵn sàng — lỗi của bên mình, không của người dùng. */
  | { ok: false; reason: 'not-ready' }
  /** Màn nằm trong danh sách trợ lý không được tự mở. */
  | { ok: false; reason: 'denied' };

/**
 * Mở một màn hộ người dùng.
 *
 * Trả KẾT QUẢ chứ không ném: nơi gọi là một luồng hội thoại, và ở đó một ngoại lệ
 * chưa bắt sẽ nuốt luôn câu trả lời — người dùng nhận lại sự im lặng.
 */
export function genieOpenScreen(
  route: string,
  params?: Record<string, unknown>,
): OpenResult {
  if (!genieMayOpen(route)) return { ok: false, reason: 'denied' };
  if (!navigate) return { ok: false, reason: 'not-ready' };
  navigate(route, params);
  return { ok: true };
}

/** Cho bài kiểm và cho màn Cài đặt: trợ lý đã nối được dây điều hướng chưa. */
export function genieNavigatorReady(): boolean {
  return navigate != null;
}

// ── MÀN ĐANG MỞ LÀ MÀN NÀO ─────────────────────────────────────────────────
//
// Bong bóng trợ lý dựng NGOÀI `Stack.Navigator`, nên nó không có `useRoute()`.
// Trước khi có chỗ này nó chỉ gác bằng `state.user.currentUser`, và thế là chưa
// đủ: các màn ở CỬA VÀO (đăng nhập, khôi phục danh tính, chọn ngôn ngữ, điều
// khoản) vẫn dựng trong lúc phiên cũ còn trong store, nên bong bóng nổi lên
// ngay trên màn đăng nhập.
//
// Chỗ đó không chỉ xấu. `SeedExport`/`RestoreIdentity` là những màn mà một
// bong bóng che mất một dòng chữ có thể làm người dùng chép sai 24 từ khôi phục.
//
// Nguồn sự thật là `PUBLIC_ROUTES` ở `navigation/authGate.tsx` — danh sách đã
// khai sẵn "màn nào mở được khi CHƯA có phiên". Trợ lý không xuất hiện ở đúng
// tập đó, nên thêm một màn cửa-vào mới là tự động được che, không ai phải nhớ.

let currentRoute: string | null = null;
const routeListeners = new Set<(r: string | null) => void>();

/** Gọi từ `onStateChange` của `NavigationContainer`. */
export function setGenieRoute(route: string | null): void {
  if (route === currentRoute) return;
  currentRoute = route;
  routeListeners.forEach((f) => f(route));
}

export function getGenieRoute(): string | null {
  return currentRoute;
}

/** Route đang mở, cập nhật theo thời gian thực. */
export function useGenieRoute(): string | null {
  const [r, setR] = useState<string | null>(currentRoute);
  useEffect(() => {
    routeListeners.add(setR);
    setR(currentRoute);
    return () => {
      routeListeners.delete(setR);
    };
  }, []);
  return r;
}
