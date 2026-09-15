/**
 * Đăng-ký ví Standard (CIP-1852) lên PhoenixKey backend — API.md §7
 * `POST /wallet/standard/register`.
 *
 * VÌ SAO: `GET /wallet/{did}/all` chỉ trả ví Standard SAU khi client đăng-ký địa-chỉ.
 * Chưa đăng-ký thì user không thấy ví tự-kiểm-soát (chỉ có Phoenix custody nếu backend
 * derive sẵn) — đây là mảnh còn thiếu khiến màn Tài-khoản trống địa-chỉ.
 *
 * Client derive địa-chỉ TỪ Master_KEK (không rời khoá): fixed = account 0 (bắt buộc),
 * active = account N (nếu user đã xoay), stake = role 2 CIP-1852 (m/1852'/1815'/0'/2/0)
 * — cho staking/delegate sau này. Idempotent — gọi lại cập-nhật active/stake; backend
 * KHÔNG cho đổi fixed. Best-effort: nuốt lỗi (chưa có session/offline) → thử lại lần sau.
 */

import taad from '../sdk/taadEnclave';
import { currentUserDid } from '../sdk/phoenixKey';
import { getStoredMasterKek, getActiveAccountIndex } from './masterKekStore';
import { phoenixKeyApi, PhoenixKeyApiError, ensureSessionTokenBelongsTo } from './phoenixKey-api';
import rLog from './remoteLogger';

// 0 = preprod (testnet), khớp WALLET_NETWORK bên register + AccountScreen + PhoenixWalletScreen.
import { CARDANO_NETWORK as WALLET_NETWORK } from '../config/cardanoNetwork';

// Prefix challenge proof-of-ownership — KHỚP backend WalletV2ServiceImpl.REGISTER_PREFIX.
// Đổi ở đây mà không đổi backend → chữ ký fail (WALLET_PAYMENT_SIGNATURE_INVALID).
const REGISTER_CHALLENGE_PREFIX = 'PHOENIXKEY_WALLET_STANDARD_REGISTER:';

/**
 * ══ LƯỢT ĐĂNG KÝ HỎNG PHẢI CÓ CHỖ ĐỂ Ở ══════════════════════════════════════
 *
 * Hàm dưới trả `false` khi hỏng và **không ai đọc giá trị đó**
 * (`navigation/index.tsx` bỏ nó). Rồi màn chính hỏi `/wallet/{did}/all` — lượt đó
 * THÀNH CÔNG, danh sách không có ví Standard nào, nên màn in số dư của ví custody
 * ra như thể đó là số dư của người dùng. Con số ấy nghĩa là *"chưa bao giờ đăng ký
 * được"* nhưng được vẽ bằng đúng hình dạng của *"ví rỗng"*.
 *
 * Đo trên máy ảo 2026-09-15, danh tính mới tạo:
 *
 *   [rLog:pk_wallet_error] { step: 'register', code: 1326, httpStatus: 403,
 *     message: 'Signature does not verify against paymentPublicKeyHex' }
 *
 * trong khi màn chính vẫn hiện `0 MAGIC · 0 LAMP`.
 *
 * Nên giữ nguyên hợp đồng (vẫn không ném, vẫn trả `false`) và ghi thêm lý do ra
 * một chỗ đọc được — cùng khuôn `getLastPhoenixSessionFailure` ở
 * `phoenixSessionService.ts`. Màn nào đang phải vẽ một con số thì hỏi chỗ này
 * trước, để biết con số đó có nói về ví của người dùng hay không.
 */
export interface StandardWalletFailure {
  /** Bước chết: kek | derive | proof | session | register. */
  step: string;
  code: number;
  httpStatus: number;
  message: string;
  /** Mốc thời gian (ms) — màn hình dùng để không khoe lại lỗi quá cũ. */
  at: number;
}

let lastFailure: StandardWalletFailure | null = null;

/** Lý do lần đăng ký ví gần nhất hỏng; `null` nếu chưa hỏng lần nào hoặc đã xong. */
export const getLastStandardWalletFailure = (): StandardWalletFailure | null => lastFailure;

function noteFailure(step: string, code: number, httpStatus: number, message: string): void {
  lastFailure = { step, code, httpStatus, message, at: Date.now() };
}

/**
 * Câu ngắn, người-đọc-được, cho lý do ví tự-kiểm-soát chưa lập được. `null` khi
 * không có gì để nói.
 *
 * KHÔNG in mã lỗi kỹ thuật ra giao diện — mã đã nằm trong nhật ký từ xa. Nhưng câu
 * trả về phải nói được NGƯỜI DÙNG đang mất gì: không phải "có lỗi xảy ra", mà là
 * số trên màn không nói về ví của họ.
 */
export const describeStandardWalletFailure = (): string | null => {
  if (!lastFailure) return null;
  if (lastFailure.step === 'session') {
    return 'Máy vừa bỏ một thẻ đăng nhập không thuộc tài khoản này. Mở lại màn để thử lập ví.';
  }
  if (lastFailure.httpStatus === 403 || lastFailure.httpStatus === 401) {
    return 'Máy chủ chưa nhận ví tự kiểm soát của bạn, nên số dư dưới đây chưa phải của ví bạn giữ khoá.';
  }
  if (lastFailure.httpStatus === 0) {
    return 'Chưa nối được tới máy chủ để lập ví tự kiểm soát của bạn.';
  }
  return 'Chưa lập được ví tự kiểm soát của bạn trên máy chủ.';
};

// Guard chống chạy TRÙNG (nhiều effect gọi gần đồng-thời) → tránh 2 lần register
// (lần 2 dính 409) + 2 lần ký proof thừa. Gộp về 1 promise khi đang bay.
let inflightRegister: Promise<boolean> | null = null;

/**
 * Bảo đảm ví Standard đã đăng-ký với backend. Trả `true` nếu gọi register thành công
 * (hoặc đã có — idempotent), `false` nếu bỏ qua (thiếu native/KEK/session). Không ném.
 */
export function ensureStandardWalletRegistered(): Promise<boolean> {
  if (inflightRegister) return inflightRegister;
  const run = ensureStandardWalletRegisteredInner();
  inflightRegister = run;
  run.finally(() => {
    if (inflightRegister === run) inflightRegister = null;
  });
  return run;
}

async function ensureStandardWalletRegisteredInner(): Promise<boolean> {
  let step = 'available';
  try {
    const available = taad.isAvailable();
    rLog.phoenixWallet.walletStart(available);
    if (!available) return false;

    step = 'kek';
    const kek = await getStoredMasterKek();
    rLog.phoenixWallet.walletKek(!!kek);
    if (!kek) return false;

    step = 'derive';
    const fixedAddress = await taad.deriveWalletAddress(kek, 0, WALLET_NETWORK);
    if (!fixedAddress) {
      rLog.phoenixWallet.walletDerive(false, false, false);
      return false;
    }

    const activeIdx = await getActiveAccountIndex();
    const activeAddress =
      activeIdx > 0
        ? await taad.deriveWalletAddress(kek, activeIdx, WALLET_NETWORK)
        : undefined;

    // stake_address (role 2, CIP-1852) — cùng account với ví cố-định. Best-effort:
    // máy chưa cập-nhật native (thiếu deriveStakeAddress) → bỏ qua, backend cho optional.
    let stakeAddress: string | undefined;
    try {
      stakeAddress = (await taad.deriveStakeAddress(kek, 0, WALLET_NETWORK)) || undefined;
    } catch {
      stakeAddress = undefined;
    }
    rLog.phoenixWallet.walletDerive(!!fixedAddress, !!activeAddress, !!stakeAddress);

    // ── Proof-of-ownership (Issue #47) ────────────────────────────────────────
    // Backend đòi ký challenge canonical bằng PAYMENT key của fixedAddress (account
    // 0). Thiếu → 400 code 9800. userDid cần cho challenge; nonce dùng-1-lần (reuse
    // generateSalt = 16 byte hex = khớp regex ^[0-9a-fA-F]{32,}$).
    step = 'proof';
    const userDid = await currentUserDid();
    if (!userDid) {
      rLog.phoenixWallet.walletProof(false, false);
      return false;
    }
    const nonce = await taad.generateSalt();
    const challenge = `${REGISTER_CHALLENGE_PREFIX}${userDid}:${fixedAddress}:${nonce}`;
    // fixedAddress = account 0 → ký bằng payment key account 0.
    const proof = await taad.signWalletRegister(kek, 0, challenge);
    rLog.phoenixWallet.walletProof(!!proof.paymentPublicKeyHex, !!proof.signature);

    // ── THẺ PHIÊN PHẢI THUỘC ĐÚNG NGƯỜI NÀY ──────────────────────────────────
    // Thân gửi dưới đây KHÔNG mang trường DID nào, nên máy chủ suy chủ thể từ thẻ
    // Bearer. Thẻ còn sống của tài khoản trước ⟹ máy chủ dựng lại chuỗi ký bằng DID
    // của chủ thẻ ⟹ Ed25519 trượt ⟹ `403 / 1326`, đúng cùng mã lỗi với ca "hai bên
    // dựng hai chuỗi byte khác nhau". Kiểm ở đây là cách duy nhất phía máy tách
    // được hai nguyên nhân đó ra.
    step = 'session';
    const tokenOwner = await ensureSessionTokenBelongsTo(userDid);
    if (tokenOwner === 'foreign' || tokenOwner === 'unmarked') {
      // Thẻ đã bị bỏ. KHÔNG tự lập phiên mới ở đây: việc đó tốn một lần hỏi sinh
      // trắc, và lượt gọi này không phải chỗ người dùng đang chờ. Lượt sau sẽ lập.
      noteFailure(
        step, -1, 0,
        tokenOwner === 'foreign'
          ? 'Thẻ phiên trên máy thuộc một mã định danh khác — đã bỏ.'
          : 'Thẻ phiên trên máy không mang dấu chủ nên không kiểm được — đã bỏ.',
      );
      rLog.phoenixWallet.walletError(step, -1, 0, `session token ${tokenOwner}`);
      return false;
    }

    step = 'register';
    await phoenixKeyApi.wallet.standardRegister({
      fixedAddress,
      ...(activeAddress ? { activeAddress } : {}),
      ...(stakeAddress ? { stakeAddress } : {}),
      paymentPublicKeyHex: proof.paymentPublicKeyHex,
      signature: proof.signature,
      nonce,
    });
    rLog.phoenixWallet.walletRegisterDone(true);
    lastFailure = null;
    return true;
  } catch (err) {
    // Best-effort: chưa có session token / offline / backend chưa bật → thử lại lần sau.
    // Log lỗi THẬT để biết bước nào hỏng (thường là register → 401 thiếu session token).
    if (err instanceof PhoenixKeyApiError) {
      // 409 (code 3005 "already exists") = ví ĐÃ đăng ký rồi (idempotent, hoặc do
      // 2 lời gọi chạy song song) → coi như THÀNH CÔNG, không phải lỗi.
      if (err.httpStatus === 409 || err.code === 3005) {
        rLog.phoenixWallet.walletRegisterDone(true);
        lastFailure = null;
        return true;
      }
      rLog.phoenixWallet.walletError(step, err.code, err.httpStatus, err.message);
      noteFailure(step, err.code, err.httpStatus, err.message);
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      rLog.phoenixWallet.walletError(step, -1, 0, msg);
      noteFailure(step, -1, 0, msg);
    }
    return false;
  }
}
