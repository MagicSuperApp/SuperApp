/**
 * Cờ bật/tắt Ví Phượng hoàng (ký tác-vụ did_payment).
 *
 * MẶC ĐỊNH = false: backend did_payment (Phase 2) CHƯA deploy → UI ẩn/disable nút
 * ký, SDK ném PhoenixWalletDisabledError trước khi gọi mạng. Bật = đặt biến môi
 * trường PHOENIX_WALLET_ENABLED=true trong .env (sau khi backend Phase 2 sẵn sàng
 * VÀ đã đối-chiếu shape API thật ở phoenixWallet-api.ts).
 *
 * Cờ này CHỈ mở luồng ký trên preprod/preview. Mainnet vẫn bị chặn riêng ở
 * ALLOWED_SIGN_NETWORKS (phoenixWallet.ts) — bật cờ KHÔNG mở mainnet.
 */

// @ts-ignore — provided by react-native-dotenv at build time.
import { PHOENIX_WALLET_ENABLED } from '@env';

export function isPhoenixWalletEnabled(): boolean {
  return String(PHOENIX_WALLET_ENABLED ?? '').toLowerCase() === 'true';
}
