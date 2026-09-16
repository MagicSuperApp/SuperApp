// components/genie/autoOpenOnLogin.ts
//
// TỰ MỞ lớp trợ lý sau khi đăng nhập — một lần cho mỗi lần đăng nhập.
//
// ── Vì sao cần, và vì sao phải rất dè dặt ──────────────────────────────────
// Người dùng chính của app này là bác nông dân ít tiếp xúc máy móc. Một bong bóng
// nhỏ nổi ở góc màn không tự nói được rằng nó làm gì; phần lớn người ta không bấm
// vào một thứ mình không biết nó là gì. Nên trợ lý phải tự giới thiệu ĐÚNG MỘT
// LẦN, ngay sau khi vào app, rồi từ đó trở đi chờ được gọi.
//
// Nhưng một lớp phủ tự bung ra cũng là thứ khó chịu nhất một app có thể làm, nên
// mọi cửa gác dưới đây đều là CỬA GÁC, không phải tuỳ chọn:
//
//   · MỘT LẦN cho mỗi lần đăng nhập. Đăng xuất rồi vào lại mới tính lần nữa.
//   · Không mở ở màn CỬA VÀO (đăng nhập, 24 từ khôi phục, ví…). Cùng tập
//     `PUBLIC_ROUTES` + `GENIE_ROUTE_DENY` mà bong bóng dùng — thêm một màn nhạy
//     cảm là tự động được che, không ai phải nhớ tới tệp này.
//   · Người dùng đã TẮT trợ lý trong Cài đặt ⇒ không mở. Một thứ đã tắt mà tự
//     bật lên là một thứ hỏng.
//   · Đang mở sẵn ⇒ không đụng vào.
//
// ── Vì sao luật tách khỏi hook ─────────────────────────────────────────────
// `quyetDinh()` là hàm THUẦN, và đó là chỗ duy nhất có luật. Kiểm được nó mà
// không cần dựng cả cây navigation — mà đây đúng là thứ phải kiểm: một lỗi ở đây
// không làm app đổ, nó chỉ khiến lớp phủ bung ra trên màn 24 từ khôi phục.

import { useEffect, useRef } from 'react';

import { openAssistant } from './genieController';

/**
 * Chờ bao lâu sau khi vào app.
 *
 * Chủ sở hữu chốt 2 giây. Nó cũng là khoảng hợp lý: đủ để màn Tổng quan vẽ xong
 * và người dùng kịp nhận ra mình đang ở đâu — bung lên ngay khung hình đầu thì
 * lớp phủ trở thành thứ đầu tiên họ thấy, và họ không biết cái vừa che mất là gì.
 */
export const AUTO_OPEN_MS = 2000;

export interface AutoOpenGate {
  /** Có phiên đăng nhập. */
  loggedIn: boolean;
  /** Người dùng chưa tắt trợ lý trong Cài đặt. */
  enabled: boolean;
  /** Màn hiện tại cho phép trợ lý xuất hiện. */
  routeOk: boolean;
  /** Lớp đang mở sẵn. */
  layerOpen: boolean;
  /** Lần tự mở của phiên này đã dùng rồi. */
  fired: boolean;
}

/**
 * `'reset'` — quên lần đã dùng (phiên kết thúc; lần đăng nhập sau được tính lại).
 * `'open'`  — hẹn giờ rồi mở.
 * `'wait'`  — chưa phải lúc; giữ nguyên.
 */
export function quyetDinh(g: AutoOpenGate): 'reset' | 'open' | 'wait' {
  if (!g.loggedIn) return 'reset';
  if (g.fired || !g.enabled || !g.routeOk || g.layerOpen) return 'wait';
  return 'open';
}

/**
 * Gắn luật trên vào vòng đời React.
 *
 * Cờ "đã dùng" nằm trong `useRef` chứ không trong state: nó KHÔNG được làm component
 * vẽ lại — nó chỉ là một dấu nhớ. Và nó bật lên TRƯỚC khi gọi `openAssistant()`,
 * vì `openAssistant` làm effect này chạy lại ngay; đặt sau thì lượt chạy lại đó
 * thấy cờ còn tắt và hẹn thêm một giờ nữa.
 */
export function useAutoOpenOnLogin(g: Omit<AutoOpenGate, 'fired'>): void {
  const fired = useRef(false);
  const { loggedIn, enabled, routeOk, layerOpen } = g;

  useEffect(() => {
    const act = quyetDinh({ loggedIn, enabled, routeOk, layerOpen, fired: fired.current });
    if (act === 'reset') {
      fired.current = false;
      return undefined;
    }
    if (act !== 'open') return undefined;

    const id = setTimeout(() => {
      fired.current = true;
      openAssistant();
    }, AUTO_OPEN_MS);
    // Rời khỏi màn được phép (hoặc đăng xuất) TRONG lúc chờ ⇒ huỷ. Không huỷ thì
    // lớp bung ra hai giây sau, ngay trên màn mà chính nó không được phép mở.
    return () => clearTimeout(id);
  }, [loggedIn, enabled, routeOk, layerOpen]);
}
