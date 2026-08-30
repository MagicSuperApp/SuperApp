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
import { currentUserDid } from '../sdk/phoenixKey';

import { getSessionToken as getPhoenixSessionToken } from './phoenixKey-api';
import { ensurePhoenixSession } from './phoenixSessionService';
import {
  proofChatApi,
  isProofChatBackendEnabled,
  getAccessToken,
  getTokenOwnerDid,
  setTokenOwnerDid,
  clearTokens,
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

  const did = await currentUserDid().catch(() => null);

  const existing = await getAccessToken();
  if (existing) {
    // "CÓ token" chưa đủ — phải là token CỦA NGƯỜI ĐANG DÙNG MÁY. Xem ghi chú ở
    // `TOKEN_DID_KEY` (proofchat-api.ts): trên máy dùng chung, câu hỏi thiếu vế
    // đó cho người sau chạy tiếp phiên chat của người trước.
    const owner = await getTokenOwnerDid();
    if (did && owner && owner === did) {
      return { status: 'connected', alreadyHadSession: true };
    }
    // Không khớp, hoặc không rõ của ai → XOÁ rồi đăng nhập lại. Xoá chứ không chỉ
    // bỏ qua: 42 phương thức trong `proofchat-api` đọc thẳng token từ kho qua
    // interceptor, nên chừng nào token lạ còn nằm đó thì chừng đó còn đường cho
    // nó ra khỏi máy.
    await clearTokens();
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
    // Đóng dấu chủ NGAY sau khi có token. `did` null (chưa đọc được DID) thì
    // KHÔNG đóng dấu bừa: lượt sau sẽ coi token là vô chủ và đăng nhập lại. Đăng
    // nhập thừa một lượt rẻ hơn nhận nhầm token của người khác là của mình.
    if (did) await setTokenOwnerDid(did);
    return { status: 'connected', alreadyHadSession: false };
  } catch (err) {
    const message =
      err instanceof ProofChatApiError ? err.message : 'Không kết nối được ProofChat';
    return { status: 'error', message };
  }
};

/**
 * Ngắt phiên ProofChat (đăng xuất cục bộ).
 *
 * ⛔ XOÁ TOKEN LÀ VIỆC KHÔNG ĐIỀU KIỆN. Bản trước thoát sớm khi cờ tính năng tắt
 * (`if (!isProofChatBackendEnabled()) return;` đặt TRƯỚC mọi thứ), nên có một
 * đường đi thật sự xảy ra: bật cờ → người A đăng nhập, token vào kho → tắt cờ →
 * người A đăng xuất, `logoutUser` gọi hàm này và nó thoát ngay, token Ở LẠI →
 * bật cờ lại → người B mở app và tiếp tục phiên chat của người A.
 *
 * Cờ tính năng quyết định có GỌI MÁY CHỦ hay không. Nó không được quyết định có
 * dọn dữ liệu phiên trên máy này hay không.
 */
export const disconnectProofChat = async (): Promise<void> => {
  if (isProofChatBackendEnabled()) {
    // logout() đã clearTokens() trong finally dù mạng lỗi.
    await proofChatApi.auth.logout().catch(() => undefined);
  }
  // Chạy cả khi cờ tắt, và cả khi logout() ở trên đã xoá — `clearTokens` là
  // idempotent, và đây là đường duy nhất bảo đảm kho sạch sau khi đăng xuất.
  await clearTokens().catch(() => undefined);
};
