/**
 * cardanoNetwork — NGUỒN DUY NHẤT cho câu hỏi "app đang nói chuyện với chuỗi nào".
 *
 * ── Vì sao phải có tệp này ────────────────────────────────────────────────────
 * Trước đây con số mạng nằm cứng ở BẢY chỗ rời nhau, mỗi chỗ một hằng số riêng
 * kèm chú thích "đổi khi lên production":
 *
 *   services/standardWalletService.ts · services/phoenixKeyAuthService.ts
 *   screens/AccountScreen.tsx · screens/PhoenixWalletScreen.tsx
 *   screens/ExportIdentityScreen.tsx · screens/StakingScreen.tsx
 *   config/orgMintChain.ts
 *
 * Lật sót MỘT chỗ là hỏng theo kiểu khó thấy nhất: địa chỉ ví app đăng ký lên
 * backend thuộc mạng này, địa chỉ màn Ví hiện cho người dùng thuộc mạng kia.
 * Người dùng nhìn số dư 0 trong khi tiền nằm ở địa chỉ họ không thấy — hoặc tệ
 * hơn, đưa người khác một địa chỉ sai mạng để nhận tiền. Không có thông báo lỗi
 * nào cho chuyện đó, vì cả hai địa chỉ đều hợp lệ.
 *
 * ── Lên mainnet: ĐÚNG MỘT chỗ ─────────────────────────────────────────────────
 * Đặt biến môi trường `CARDANO_NETWORK=1` (Codemagic → Environment variables,
 * hoặc dòng tương ứng trong tệp môi trường lúc dựng). Không sửa một dòng mã nào.
 *
 * Thiếu biến, hoặc biến rác, thì rơi về **preprod**. Đây là fail-safe có chủ ý:
 * đoán nhầm sang preprod thì người dùng thấy số dư 0 và kêu; đoán nhầm sang
 * mainnet thì app ký giao dịch bằng tiền thật. Hai cái sai đó không cùng giá.
 */

import { CARDANO_NETWORK as RAW } from '@env';

/** 0 = preprod/preview (chuỗi thử), 1 = mainnet (tiền thật). */
export type CardanoNetworkId = 0 | 1;

function parseNetwork(raw: unknown): CardanoNetworkId {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === '1' || s === 'mainnet') return 1;
  return 0; // rỗng / 'preprod' / 'preview' / rác → chuỗi thử
}

export const CARDANO_NETWORK: CardanoNetworkId = parseNetwork(RAW);

/** Đang dùng tiền thật hay không. Dùng cái này thay vì so `=== 1` rải rác. */
export const IS_MAINNET: boolean = CARDANO_NETWORK === 1;

/**
 * Tên mạng để HIỆN cho người dùng. Cố ý không dùng chữ "preprod"/"mainnet" trần
 * — nhà vườn không biết hai chữ đó nghĩa gì, mà đây đúng là chỗ họ cần hiểu là
 * tiền có thật hay không.
 */
export const NETWORK_LABEL_KEY = IS_MAINNET
  ? 'wallet.network.mainnet'
  : 'wallet.network.testnet';
