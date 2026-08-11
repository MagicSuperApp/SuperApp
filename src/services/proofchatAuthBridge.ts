/**
 * proofchatAuthBridge.ts — Cầu nối danh tính PhoenixKey → ProofChat (TRỤC 3 v2.0).
 *
 * Nguyên lý (CLAUDE.md): vận hành độc lập. Nếu backend ProofChat OFF hoặc PhoenixKey
 * chưa có session token → trả trạng thái rõ ràng, KHÔNG ném lỗi làm sập chat tab.
 * Chat UI tiếp tục chạy mock; cầu nối chỉ "nâng cấp" sang phiên thật khi đủ điều kiện.
 *
 * Luồng: getSessionToken() (PhoenixKey, lưu sau QR-approve) → POST /auth/phoenixkey/login
 *        → lưu accessToken/refreshToken ProofChat.
 */
import { getSessionToken as getPhoenixSessionToken } from './phoenixKey-api';
import { ensurePhoenixSession } from './phoenixSessionService';
import {
  proofChatApi,
  isProofChatBackendEnabled,
  getAccessToken,
  ProofChatApiError,
} from './proofchat-api';

export type ConnectResult =
  | { status: 'connected'; alreadyHadSession: boolean }
  | { status: 'disabled' } // feature flag OFF / thiếu URL
  | { status: 'no-phoenix-session' } // chưa đăng nhập PhoenixKey
  | { status: 'error'; message: string };

/**
 * Bảo đảm có phiên ProofChat hợp lệ. Idempotent: nếu đã có accessToken thì không
 * gọi lại login. Không bao giờ throw — trả ConnectResult để UI quyết định hiển thị.
 */
export const connectProofChat = async (): Promise<ConnectResult> => {
  if (!isProofChatBackendEnabled()) {
    return { status: 'disabled' };
  }

  const existing = await getAccessToken();
  if (existing) {
    return { status: 'connected', alreadyHadSession: true };
  }

  let phoenixSession = await getPhoenixSessionToken();
  if (!phoenixSession) {
    // Mobile-only chưa có PhoenixKey session token (chưa self-pair) → tự ký lấy rồi
    // thử lại. Cùng token dùng cho /wallet/standard/register — xem phoenixSessionService.
    phoenixSession = await ensurePhoenixSession();
  }
  if (!phoenixSession) {
    return { status: 'no-phoenix-session' };
  }

  try {
    await proofChatApi.auth.phoenixKeyLogin(phoenixSession);
    return { status: 'connected', alreadyHadSession: false };
  } catch (err) {
    const message =
      err instanceof ProofChatApiError ? err.message : 'Không kết nối được ProofChat';
    return { status: 'error', message };
  }
};

/** Ngắt phiên ProofChat (đăng xuất cục bộ). logout() tự xoá token ở finally. */
export const disconnectProofChat = async (): Promise<void> => {
  if (!isProofChatBackendEnabled()) return;
  // logout() đã clearTokens() trong finally dù mạng lỗi → không xoá lại ở đây.
  await proofChatApi.auth.logout().catch(() => undefined);
};
