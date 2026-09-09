/**
 * Ghim HAI chốt mà bộ kiểm hiện không chạm tới, và cả hai hỏng theo kiểu câm.
 *
 * ── 1. Đường socket.io mặc định ──────────────────────────────────────────────
 * Đo bằng curl thẳng vào máy chủ (2026-09-08, hai cực để phân biệt "có" với "không
 * tồn tại"):
 *
 *   GET /ws/socket.io/?EIO=4&transport=polling → 404   (nginx không có route /ws/)
 *   GET /socket.io/?EIO=4&transport=polling    → 200
 *
 * Đường lui cũ `/ws/socket.io/` khiến MỌI bản dựng thiếu `PROOFCHAT_WS_PATH` gặp
 * handshake 404 — và 404 đó hiện ra ngoài đúng như "máy chủ chưa sẵn sàng", không
 * như "cấu hình sai". Không cổng nào đỏ, không dòng log nào chỉ vào cấu hình.
 *
 * ── 2. Provider phiên phải được ĐĂNG KÝ ─────────────────────────────────────
 * `setProofChatSessionProvider(ensureProofChatSession)` là thứ duy nhất nối interceptor
 * REST với cầu đăng nhập. Gỡ nó đi thì mọi lượt gọi cần-auth đầu tiên trả 401 và màn
 * hình báo "Chưa tải được" dù máy chủ sống — cũng là một lỗi câm, ở một tầng khác.
 *
 * Cả hai đều là hằng số/lời gọi một dòng, nên chúng dễ bị "dọn" trong một lượt sửa
 * khác mà không ai nhận ra. Bài này là cái kêu.
 */
import { WS_PATH_FALLBACK } from './chatSocket';

describe('đường socket.io — đường lui phải là đường ĐO ĐƯỢC là sống', () => {
  it('bản dựng không khai biến ⇒ dùng /socket.io, KHÔNG dùng /ws/socket.io', () => {
    // Ghim HẰNG, không gọi `wsPath()`: hàm đó đọc giá trị môi trường của máy đang
    // chạy, nên nó đo cấu hình của một cái máy chứ không đo mã. Cái mã kiểm soát —
    // và cái PR này sửa — là đường lui.
    expect(WS_PATH_FALLBACK).toBe('/socket.io');
    // Nói thẳng cái đã đo 404 ra, để lần sau ai định "sửa lại cho khớp tài liệu"
    // thì gặp câu này trước.
    expect(WS_PATH_FALLBACK).not.toMatch(/^\/ws\//);
  });
});

describe('provider phiên ProofChat phải được nối vào cổng runtime', () => {
  it('bootstrap đăng ký đúng `ensureProofChatSession` làm provider', async () => {
    jest.resetModules();
    const setProvider = jest.fn();
    jest.doMock('./proofchat-api', () => ({
      ...jest.requireActual('./proofchat-api'),
      setProofChatSessionProvider: setProvider,
    }));
    const bridge = jest.requireActual('./proofchatAuthBridge');

    const { bootstrapRuntimeGate } = require('../config/runtimeGateBootstrap');
    await bootstrapRuntimeGate();

    expect(setProvider).toHaveBeenCalledTimes(1);
    // Ghim CHÍNH hàm, không chỉ ghim "có gọi". Truyền nhầm một hàm khác cũng làm
    // `toHaveBeenCalled()` xanh, và interceptor sẽ chạy bằng một cầu khác.
    expect(setProvider).toHaveBeenCalledWith(bridge.ensureProofChatSession);
  });
});
