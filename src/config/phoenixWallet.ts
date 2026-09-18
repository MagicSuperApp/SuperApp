/**
 * Cờ bật/tắt Ví Phượng hoàng (ký tác-vụ did_payment).
 *
 * MẶC ĐỊNH = false: backend did_payment (Phase 2) CHƯA deploy → UI ẩn/disable nút
 * ký, SDK ném PhoenixWalletDisabledError trước khi gọi mạng. Bật = đặt biến môi
 * trường PHOENIX_WALLET_ENABLED=true trong .env (sau khi backend Phase 2 sẵn sàng
 * VÀ đã đối-chiếu shape API thật ở phoenixWallet-api.ts).
 *
 * Cờ này CHỈ mở luồng ký trên preprod/preview. Mainnet bị chặn ở một nguồn
 * khác và độc lập: `MAINNET_SIGNING_ALLOWED` (`config/cardanoNetwork.ts`) —
 * bật cờ này KHÔNG mở mainnet.
 *
 * Câu trên từng viết là "chặn ở ALLOWED_SIGN_NETWORKS (phoenixWallet.ts)". Câu
 * đó đúng về đường `did_payment` mà nó tả, và SAI về hệ: hai đường tiêu tiền
 * khác (gửi ADA thô, uỷ thác stake) không hỏi danh sách đó. Nay cả ba đường
 * dẫn về cùng một hằng.
 */

// @ts-ignore — provided by react-native-dotenv at build time.
import { PHOENIX_WALLET_ENABLED } from '@env';

export function isPhoenixWalletEnabled(): boolean {
  return String(PHOENIX_WALLET_ENABLED ?? '').toLowerCase() === 'true';
}
