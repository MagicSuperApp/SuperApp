/**
 * Ví Phượng hoàng (did_payment) — SDK KÝ TÁC-VỤ.
 *
 * Ranh-giới (sự-thật đã xác-minh với team PhoenixKey, 2026-06-23):
 *   - Ví Phượng hoàng = `did_payment`, ví KHÔI-PHỤC-ĐƯỢC, khoá NON-CUSTODIAL
 *     (suy từ Master_KEK trên máy, KHÔNG ở backend).
 *   - Backend build-tx did_payment = **Phase 2, CHƯA deploy** (team đang triển khai).
 *     Demo hiện chạy Preview/preprod. Mainnet CHƯA bật.
 *
 * Vì native chỉ ký ECDSA-secp256r1 trên một `dataHex` tuỳ-ý (SHA256withECDSA —
 * xem PhoenixKeyModule.kt), KHÔNG dựng được transaction Cardano on-device, luồng
 * đúng cho ví khôi-phục-được là:
 *
 *   1. client xin backend BUILD tx did_payment (theo intent người dùng chọn);
 *   2. backend trả về tx chưa-ký + `signingDigestHex` + `displayText` + network;
 *   3. client HIỆN RÕ displayText cho user, kiểm network-guard;
 *   4. native KÝ digest bằng khoá-trên-máy (sinh-trắc, BiometricPrompt);
 *   5. client gửi chữ-ký lên backend APPROVE → backend ráp witness + SUBMIT.
 *
 * Toàn bộ phần GỌI backend ở đây là theo SHAPE DỰ-KIẾN, gắn cờ
 * `[CHỜ team PhoenixKey chốt]`. Khi cờ `PHOENIX_WALLET_ENABLED` còn false (mặc
 * định), các hàm build/submit ném `PhoenixWalletDisabledError` — UI ẩn/disable
 * nút, KHÔNG gọi mạng. Phần KÝ digest (bước 4) chạy-được-ngay (native đã có).
 */

import {
  signRaw,
  isKeypairEnrolled,
  ownerPublicKey,
  currentUserDid,
} from '../sdk/phoenixKey';
import { phoenixWalletApi, type BuildTxResult } from './phoenixWallet-api';
import { parseDidNetwork, type CardanoNetwork } from './phoenixDid';
import { isPhoenixWalletEnabled } from '../config/phoenixWallet';

export type { CardanoNetwork } from './phoenixDid';

/** Mạng được phép ký từ app. Mainnet bị CHẶN tới khi Phase 2 ổn định + bật cờ. */
export const ALLOWED_SIGN_NETWORKS: ReadonlySet<CardanoNetwork> = new Set<CardanoNetwork>([
  'preprod',
  'preview',
]);

/** Loại tác-vụ ví hỗ-trợ. Mở rộng khi backend chốt thêm intent. */
export type WalletActionType =
  | 'transfer_lamp'
  | 'transfer_ada'
  | 'claim_magic'
  | 'pay_fee';

/** Tham-số tác-vụ user chọn (client tự dựng, gửi cho backend build-tx). */
export interface WalletActionIntent {
  type: WalletActionType;
  /** Thân intent — tuỳ loại (recipient, amount...). Backend diễn giải. */
  body: Record<string, unknown>;
  /** Mô-tả ngắn để client log/hiển thị tạm trước khi có displayText từ backend. */
  label: string;
}

/** Kết-quả ký + submit của một tác-vụ. */
export interface SignedTxResult {
  txHash: string;
  network: CardanoNetwork;
  submittedAt: number;
}

/** Bản xem-trước tx (sau build, trước khi ký) để UI hiện cho user duyệt. */
export interface TxPreview {
  requestId: string;
  /** Text người-đọc-được do BACKEND sinh (nguồn sự-thật để duyệt). */
  displayText: string;
  network: CardanoNetwork;
  /** Digest hex backend yêu cầu client ký (KHÔNG phải toàn bộ tx). */
  signingDigestHex: string;
  /** Phí ước-tính (lovelace) nếu backend trả. */
  feeLovelace?: number;
  expiresAt: number;
}

export class PhoenixWalletDisabledError extends Error {
  constructor() {
    super(
      'Ví Phượng hoàng chưa sẵn sàng — backend did_payment (Phase 2) đang được triển khai.',
    );
    this.name = 'PhoenixWalletDisabledError';
  }
}

export class NetworkNotAllowedError extends Error {
  constructor(public readonly network: string) {
    super(
      network === 'mainnet'
        ? 'Ký giao dịch trên Cardano Mainnet đang bị khoá trong giai đoạn thử nghiệm.'
        : `Mạng "${network}" không được phép ký từ ứng dụng.`,
    );
    this.name = 'NetworkNotAllowedError';
  }
}

export class KeypairNotEnrolledError extends Error {
  constructor() {
    super('Chưa có khoá Phượng hoàng trên máy. Vui lòng kích hoạt danh tính trước.');
    this.name = 'KeypairNotEnrolledError';
  }
}

const ensureEnabled = (): void => {
  if (!isPhoenixWalletEnabled()) throw new PhoenixWalletDisabledError();
};

function assertNetworkAllowed(network: string): asserts network is CardanoNetwork {
  if (!ALLOWED_SIGN_NETWORKS.has(network as CardanoNetwork)) {
    throw new NetworkNotAllowedError(network);
  }
}

/**
 * Resolve mạng để áp network-guard. Ưu tiên DID (đáng tin nhất), rồi tới mạng
 * backend khai trong build-result. KHÔNG đoán mainnet — không rõ thì ném lỗi.
 */
const resolveSignNetwork = (
  did: string | null,
  fromBuild: string | undefined,
): string => {
  const fromDid = parseDidNetwork(did);
  if (fromDid) return fromDid;
  if (fromBuild) return fromBuild;
  // Không xác định được mạng → KHÔNG ký (an-toàn hơn đoán).
  throw new NetworkNotAllowedError('unknown');
};

/**
 * BƯỚC 1–3: Xin backend build tx did_payment và trả bản xem-trước để user duyệt.
 *
 * [CHỜ team PhoenixKey chốt] shape POST /wallet/did-payment/build-tx.
 * Chạy-được khi: backend Phase 2 deploy + cờ PHOENIX_WALLET_ENABLED=true.
 */
export async function buildActionTx(intent: WalletActionIntent): Promise<TxPreview> {
  ensureEnabled();

  if (!(await isKeypairEnrolled())) throw new KeypairNotEnrolledError();

  const did = await currentUserDid();
  if (!did) throw new KeypairNotEnrolledError();

  const built: BuildTxResult = await phoenixWalletApi.buildTx({
    userDid: did,
    intent: { type: intent.type, body: intent.body },
  });

  const network = resolveSignNetwork(did, built.network);
  assertNetworkAllowed(network);

  return {
    requestId: built.requestId,
    displayText: built.displayText,
    network,
    signingDigestHex: built.signingDigestHex,
    feeLovelace: built.feeLovelace,
    expiresAt: built.expiresAt,
  };
}

/**
 * BƯỚC 4–5: User đã duyệt preview → ký digest bằng sinh-trắc rồi gửi backend submit.
 *
 * `preview` PHẢI là object trả về từ buildActionTx (không tự dựng) — đảm bảo
 * digest ký đúng là digest backend đã build, chống thay-tx giữa chừng.
 *
 * [CHỜ team PhoenixKey chốt] shape POST /wallet/did-payment/submit.
 */
export async function signAndSubmit(preview: TxPreview): Promise<SignedTxResult> {
  ensureEnabled();

  // Network-guard LẦN HAI ngay trước khi ký (preview có thể đã cũ).
  assertNetworkAllowed(preview.network);

  if (Date.now() > preview.expiresAt) {
    throw new Error('Yêu cầu ký đã hết hạn — vui lòng tạo lại giao dịch.');
  }

  // Ký CHÍNH digest backend cấp (không canonicalize lại — tránh lệch byte).
  const signatureHex = await signRaw(
    preview.signingDigestHex,
    'Ký bằng Ví Phượng hoàng',
    preview.displayText,
  );
  const publicKeyHex = await ownerPublicKey();

  const result = await phoenixWalletApi.submitTx({
    requestId: preview.requestId,
    signatureHex,
    publicKeyHex,
  });

  return {
    txHash: result.txHash,
    network: preview.network,
    submittedAt: Date.now(),
  };
}

/** Cờ tiện cho UI: ví đã có thể dùng chưa (cờ build-time bật + có khoá trên máy). */
export async function isWalletReady(): Promise<boolean> {
  if (!isPhoenixWalletEnabled()) return false;
  try {
    return await isKeypairEnrolled();
  } catch {
    return false;
  }
}
