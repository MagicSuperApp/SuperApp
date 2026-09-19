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
import { buildCanonicalHex } from './canonicalMessage';
import {
  getAcceptedFormat,
  rememberAcceptedFormat,
  formatsToTry,
  isSignatureRejection,
  type SigningFormat,
} from './signingFormatProbe';
import type { WalletRegisterProof } from '../sdk/taadEnclave';

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

/**
 * Ký chuỗi thách đố đăng ký ví theo MỘT khuôn.
 *
 * Trả `null` khi khuôn đó không dựng được TRÊN MÁY NÀY — hôm nay chỉ có một ca:
 * khuôn đóng khung cần cửa ký nhận **hex**, mà bản dựng trước 2026-09-15 không có
 * cửa đó. `null` là "máy không làm được", KHÁC hẳn "máy chủ từ chối"; gộp hai thứ
 * này lại là đúng chỗ một phép đo hoá thành lời khai sai.
 */
async function signRegisterProof(
  kek: string,
  userDid: string,
  fixedAddress: string,
  nonce: string,
  format: SigningFormat,
): Promise<WalletRegisterProof | null> {
  if (format === 'length-framed') {
    return taad.signWalletRegisterHex(
      kek,
      0,
      buildCanonicalHex(REGISTER_CHALLENGE_PREFIX, userDid, fixedAddress, nonce),
    );
  }
  return taad.signWalletRegister(
    kek,
    0,
    `${REGISTER_CHALLENGE_PREFIX}${userDid}:${fixedAddress}:${nonce}`,
  );
}

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

    // ── KHUÔN CHUỖI KÝ: ĐO, ĐỪNG ĐOÁN ────────────────────────────────────────
    // Máy chủ chưa khai cửa này dựng lại chuỗi ký theo khuôn nào (xem
    // `signingFormatProbe.ts`). Thử khuôn đang chạy trước, khuôn đóng khung sau, và
    // NHỚ cái máy chủ nhận. Không lật khuôn theo phỏng đoán trên đường người dùng.
    step = 'register';
    const remembered = await getAcceptedFormat('walletStandardRegister');
    let lastRejection: PhoenixKeyApiError | null = null;
    /**
     * Đếm số khuôn THẬT SỰ gửi được lên máy chủ — không phải số khuôn định thử.
     *
     * Vòng lặp có một lối bỏ qua không ghi gì vào `lastRejection`: máy thiếu cửa ký
     * hex thì `signRegisterProof` trả `null` và `continue`. Nên một lượt chỉ gửi đi
     * ĐÚNG MỘT khuôn vẫn rơi vào nhánh `lastRejection` bên dưới, và câu nhật ký ở đó
     * khai "cả hai khuôn đều bị từ chối" — nói rộng hơn thứ nó đo.
     *
     * Đắt ở chỗ nó gửi người đọc đi sai hướng: "cả hai đều bị từ chối" đọc thành
     * *"máy chủ đã đổi sang một khuôn thứ ba"*, trong khi sự thật có thể là
     * *"máy này chưa bao giờ gửi được khuôn đóng khung"* — hai nguyên nhân, hai việc
     * phải làm, và một trong hai nằm ở nhà khác.
     */
    let formatsSent = 0;

    for (const format of formatsToTry(remembered)) {
      // Nonce MỚI cho từng lượt. Nonce là thứ dùng-một-lần; gửi lại cái vừa bị từ
      // chối thì lượt sau có thể chết vì trùng nonce, và ta sẽ đọc nó thành "khuôn
      // này cũng sai" — một kết luận sai về đúng câu đang đo.
      const nonce = await taad.generateSalt();
      // fixedAddress = account 0 → ký bằng payment key account 0.
      const proof = await signRegisterProof(kek, userDid, fixedAddress, nonce, format);
      if (!proof) {
        // Máy này KHÔNG CÓ cửa ký hex nên không dựng nổi khuôn đóng khung. Đây không
        // phải "chữ ký sai" — nên không ghi gì vào dòng nhớ, và không tính là một
        // lượt bị từ chối.
        rLog.phoenixWallet.walletSigningFormat(`${format}:native-thieu-cua-hex`, false);
        continue;
      }
      rLog.phoenixWallet.walletProof(!!proof.paymentPublicKeyHex, !!proof.signature);
      formatsSent += 1;

      try {
        await phoenixKeyApi.wallet.standardRegister({
          fixedAddress,
          ...(activeAddress ? { activeAddress } : {}),
          ...(stakeAddress ? { stakeAddress } : {}),
          paymentPublicKeyHex: proof.paymentPublicKeyHex,
          signature: proof.signature,
          nonce,
        });
        rLog.phoenixWallet.walletSigningFormat(format, true);
        await rememberAcceptedFormat('walletStandardRegister', format);
        rLog.phoenixWallet.walletRegisterDone(true);
        lastFailure = null;
        return true;
      } catch (err) {
        if (err instanceof PhoenixKeyApiError) {
          // 409 / 3005 = ví ĐÃ đăng ký (idempotent, hoặc hai lượt chạy song song) →
          // coi là THÀNH CÔNG. Nhưng KHÔNG ghi khuôn này vào dòng nhớ: máy chủ có
          // thể báo trùng TRƯỚC khi verify chữ ký, nên lượt này không chứng minh
          // khuôn đúng. Nhớ theo một lượt như thế là tự dựng một lời khai sai.
          if (err.httpStatus === 409 || err.code === 3005) {
            rLog.phoenixWallet.walletRegisterDone(true);
            lastFailure = null;
            return true;
          }
          if (isSignatureRejection(err.httpStatus, err.code)) {
            rLog.phoenixWallet.walletSigningFormat(format, false);
            lastRejection = err;
            continue; // thử khuôn còn lại
          }
        }
        // Lý do khác (401 thiếu thẻ phiên, 5xx, mất mạng): thử khuôn thứ hai chỉ tốn
        // thêm một lượt gọi mà không trả lời được câu nào. Để nhánh catch ngoài ghi.
        throw err;
      }
    }

    if (lastRejection) {
      // Câu mang đúng PHẠM VI của phép đo: bao nhiêu khuôn đi được tới máy chủ, chứ
      // không phải bao nhiêu khuôn tồn tại.
      const phamVi =
        formatsSent >= 2
          ? 'cả hai khuôn chuỗi ký đều bị từ chối'
          : `máy chủ từ chối khuôn duy nhất máy này gửi được (${formatsSent}/2 khuôn `
            + 'dựng được trên máy này)';
      rLog.phoenixWallet.walletError(
        step, lastRejection.code, lastRejection.httpStatus,
        `${phamVi}: ${lastRejection.message}`,
      );
      noteFailure(step, lastRejection.code, lastRejection.httpStatus, lastRejection.message);
      return false;
    }

    // Không lượt nào gửi đi được — máy này không dựng nổi khuôn nào. Phải nói ra,
    // không thì nó trông giống một lượt chưa bao giờ chạy.
    rLog.phoenixWallet.walletError(step, -1, 0, 'không dựng được khuôn chuỗi ký nào');
    noteFailure(step, -1, 0, 'Máy này chưa dựng được khuôn chữ ký mà máy chủ nhận.');
    return false;
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
