// crashReporter.ts — PHẢI được import ĐẦU TIÊN trong index.js (trước cả bootstrap).
//
// App vốn KHÔNG có global JS error handler → mọi lỗi lúc khởi động (import-time
// hoặc render sớm) bị nuốt lặng → MÀN HÌNH TRẮNG mà không log gì. Module này gắn
// handler báo lỗi về remoteLogger để chẩn đoán từ xa.
//
// Đồng thời gửi 1 ping "app_boot" ngay khi JS chạy: nếu ping này KHÔNG tới server
// mà app vẫn trắng → JS bundle không được nạp (vấn đề native/bundle, không phải JS).
import rLog from '../services/remoteLogger';

try {
  rLog.info('app_boot', { stage: 'js_started' });
} catch {
  // ignore
}

const g: any = global as any;
if (g && g.ErrorUtils && typeof g.ErrorUtils.setGlobalHandler === 'function') {
  const prev =
    typeof g.ErrorUtils.getGlobalHandler === 'function'
      ? g.ErrorUtils.getGlobalHandler()
      : null;

  g.ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    try {
      rLog.error('js_global_error', {
        isFatal: !!isFatal,
        name: error && error.name ? error.name : null,
        message: error && error.message ? error.message : String(error),
        stack: String((error && error.stack) || '').slice(0, 4000),
      });
    } catch {
      // ignore
    }
    if (typeof prev === 'function') {
      prev(error, isFatal);
    }
  });
}

export {};
