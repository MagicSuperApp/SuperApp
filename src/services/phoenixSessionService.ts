/**
 * PhoenixKey SESSION cho MOBILE (self-pairing) — API.md §3.
 *
 * VÌ SAO: các endpoint PhoenixKey `needsAuth` (POST /wallet/standard/register,
 * devices/register, seed export, keys/*, guardians/*) yêu cầu Bearer `session` token.
 * Luồng session gốc là QR-pairing (web tạo → mobile duyệt → token về WEB), nên user
 * ĐĂNG-NHẬP-MOBILE-THUẦN (vân tay) KHÔNG bao giờ có session token cho CHÍNH mình →
 * đăng-ký ví Standard fail câm → /wallet/all rỗng → UI không hiện ví (field 13/07).
 *
 * SELF-PAIRING: mobile TỰ init một session rồi TỰ approve bằng khoá owner:
 *   1. POST /auth/session/init                → { sessionId, challenge }
 *   2. ký DER(ECDSA P-256) trên "challenge:domain:timestamp" bằng khoá HW owner
 *   3. POST /auth/session/{id}/approve         → { sessionToken }
 *   4. setSessionToken(sessionToken)           → mọi endpoint needsAuth chạy được
 *
 * AN TOÀN: backend KHÔNG validate `domain` (chỉ nằm trong chuỗi ký — đã đọc source
 * SessionServiceImpl.approve), pubkey phải là active authorized_key của DID (khoá owner
 * mobile — đúng). Token TTL 1h → gọi lại khi hết (idempotent, nuốt lỗi).
 */

import { currentUserDid, ownerPublicKey, signRaw } from '../sdk/phoenixKey';
import {
  phoenixKeyApi,
  setSessionToken,
  getSessionToken,
  PhoenixKeyApiError,
} from './phoenixKey-api';
import rLog from './remoteLogger';

// Domain tuỳ ý (không bị backend validate) — đặt tên app cho dễ truy vết log.
const SELF_PAIR_DOMAIN = 'aladin-mobile';

// message ASCII (challenge hex + domain + timestamp) → hex để signRaw ký.
const asciiToHex = (s: string): string => {
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    out += s.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return out;
};

/**
 * LÝ DO HỎNG GẦN NHẤT — để chỗ hỏng thôi im.
 *
 * Hàm dưới đây là best-effort có chủ ý: nó nuốt lỗi và trả `null` để một phiên
 * chưa dựng được không làm sập màn nào. Nhưng "không sập" đã bị hiểu thành
 * "không nói gì": mọi nơi gọi chỉ nhận `null`, nên khi tự-ghép-cặp hỏng thì ví
 * hiện số dư `—`, danh sách phòng trống, và KHÔNG chỗ nào nói vì sao. Đúng cái
 * bẫy mà chú thích đầu tệp này ghi là lý do nó ra đời ("đăng-ký ví Standard fail
 * câm → /wallet/all rỗng → UI không hiện ví") — chỉ là lần này câm ở tầng trên.
 *
 * Nên giữ nguyên hợp đồng (vẫn không ném, vẫn trả `null`) và ghi thêm lý do ra
 * một chỗ đọc được. Màn nào đang phải vẽ một khoảng trống thì hỏi chỗ này để nói
 * cho người dùng biết đang chờ gì.
 *
 * Đo 2026-09-08: bước hỏng là `approve` — `POST /auth/session/{id}/approve` trả
 * 401 `Unauthorized — Missing Bearer token`. Đây là ràng buộc phía máy chủ
 * (PhoenixKeyDID/PhoenixKey-Database#257), client không tự qua được.
 */
export interface PhoenixSessionFailure {
  /** Bước chết: existing | identity | init | sign | approve | status. */
  step: string;
  code: number;
  httpStatus: number;
  message: string;
  /** Mốc thời gian (ms) — màn hình dùng để không khoe lại lỗi quá cũ. */
  at: number;
}

let lastFailure: PhoenixSessionFailure | null = null;

/** Lý do lần dựng phiên gần nhất hỏng; `null` nếu chưa hỏng lần nào hoặc đã xong. */
export const getLastPhoenixSessionFailure = (): PhoenixSessionFailure | null => lastFailure;

/**
 * Câu ngắn, người-đọc-được, cho lý do đang kẹt. `null` khi không có gì để nói.
 * KHÔNG in mã lỗi kỹ thuật ra UI (OriLife §5) — mã đã nằm trong remote log rồi.
 */
export const describePhoenixSessionFailure = (): string | null => {
  if (!lastFailure) return null;
  if (lastFailure.httpStatus === 401 || lastFailure.httpStatus === 403) {
    return 'Máy chủ danh tính chưa cho máy này mở phiên đăng nhập.';
  }
  if (lastFailure.httpStatus === 0) {
    return 'Không nối được tới máy chủ danh tính.';
  }
  return 'Chưa mở được phiên đăng nhập với máy chủ danh tính.';
};

// Guard chống chạy TRÙNG: nhiều effect/màn gọi ensurePhoenixSession gần như đồng
// thời → nếu không khoá, self-pair chạy 2 lần = 2 lần ký = 2 Face ID + 2 đăng-ký
// ví (lần 2 dính 409). Gộp về 1 promise dùng chung khi đang bay.
let inflightSession: Promise<string | null> | null = null;

/**
 * Bảo đảm có PhoenixKey session token. Trả token nếu có/vừa lấy được, null nếu bỏ qua
 * (chưa có danh tính / offline / lỗi). KHÔNG ném — best-effort như ensureOrilifeToken.
 *
 * @param force  bỏ qua token đang lưu, ép self-pair mới (dùng khi gặp 401).
 */
export function ensurePhoenixSession(opts: { force?: boolean } = {}): Promise<string | null> {
  // Đang có 1 lần chạy → dùng CHUNG kết quả (trừ khi force ép làm mới).
  if (!opts.force && inflightSession) return inflightSession;
  const run = ensurePhoenixSessionInner(opts);
  inflightSession = run;
  // Xoá khoá khi xong (thành công hay lỗi) để lần sau (vd force/401) chạy lại được.
  run.finally(() => {
    if (inflightSession === run) inflightSession = null;
  });
  return run;
}

async function ensurePhoenixSessionInner(opts: { force?: boolean }): Promise<string | null> {
  // `step` bám theo tiến-trình để catch biết CHẾT Ở ĐÂU (log remote).
  let step = 'existing';
  try {
    const existing = opts.force ? null : await getSessionToken();
    rLog.phoenixWallet.sessionStart(!!existing, !!opts.force);
    if (existing) {
      lastFailure = null;
      return existing;
    }

    step = 'identity';
    const did = await currentUserDid();
    const pubkey = await ownerPublicKey();
    rLog.phoenixWallet.sessionIdentity(!!did, !!pubkey);
    if (!did || !pubkey) {
      noteFailure(step, -1, 0, 'Máy này chưa có danh tính để mở phiên.');
      return null;
    }

    step = 'init';
    const { sessionId, challenge, tempToken } = await phoenixKeyApi.session.init();
    rLog.phoenixWallet.sessionInit(sessionId, !!challenge, !!tempToken);

    step = 'sign';
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `${challenge}:${SELF_PAIR_DOMAIN}:${timestamp}`;
    const signature = await signRaw(
      asciiToHex(message),
      'Activate the wallet',
      'Sign with the hardware key to unlock the wallet services',
    );

    rLog.phoenixWallet.sessionSigned(signature?.length ?? 0);

    // approve MINT token nhưng KHÔNG trả sessionToken trong response HTTP (backend
    // SessionApproveResponse chỉ có status + linkedDeviceToken; sessionToken chỉ qua SSE).
    step = 'approve';
    if (__DEV__) {
      // Chẩn đoán chuỗi canonical. Nhánh chữ ký này TRƯỚC ĐÂY chưa từng chạy thật:
      // cửa 401 ở `approve` chặn trước nó, nên một sai lệch định dạng ở đây có thể
      // đã nằm im từ đầu. In ra để đối chiếu với thứ máy chủ dựng lại. Không có bí
      // mật nào ở đây — challenge là công khai, chữ ký chỉ dùng được một lần cho
      // đúng session này, khoá riêng không rời Secure Enclave.
      console.log('[pk_selfpair] message   =', JSON.stringify(message));
      console.log('[pk_selfpair] pubkey    =', pubkey);
      console.log('[pk_selfpair] signature =', signature);
      console.log('[pk_selfpair] timestamp =', timestamp, '| domain =', SELF_PAIR_DOMAIN);
    }
    const approveRes = await phoenixKeyApi.session.approve(sessionId, {
      userDid: did,
      publicKeyHex: pubkey,
      signature,
      domain: SELF_PAIR_DOMAIN,
      timestamp,
    });
    rLog.phoenixWallet.sessionApprove(approveRes?.status ?? 'unknown');

    // Lấy sessionToken qua /status (trả kèm khi approved) — Bearer tempToken.
    step = 'status';
    const status = await phoenixKeyApi.session.getStatus(sessionId, tempToken);
    rLog.phoenixWallet.sessionStatus(status?.status ?? 'unknown', !!status?.sessionToken);
    if (status?.sessionToken) {
      await setSessionToken(status.sessionToken);
      rLog.phoenixWallet.sessionDone(true);
      lastFailure = null;
      return status.sessionToken;
    }
    rLog.phoenixWallet.sessionDone(false);
    // Không ném, nhưng cũng KHÔNG có token — vẫn là một lần hỏng, phải ghi lại.
    noteFailure(step, -1, 0, 'Máy chủ báo phiên chưa được duyệt.');
    return null;
  } catch (err) {
    // Chưa có danh tính / offline / backend từ chối → thử lại lần vào sau.
    // Log lỗi THẬT (code/httpStatus/message) để biết bước nào hỏng.
    if (err instanceof PhoenixKeyApiError) {
      rLog.phoenixWallet.sessionError(step, err.code, err.httpStatus, err.message);
      noteFailure(step, err.code, err.httpStatus, err.message);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      rLog.phoenixWallet.sessionError(step, -1, 0, message);
      noteFailure(step, -1, 0, message);
    }
    return null;
  }
}

/** Ghi lý do hỏng. Tách hàm để mọi nhánh `return null` đều đi qua một chỗ. */
function noteFailure(step: string, code: number, httpStatus: number, message: string): void {
  lastFailure = { step, code, httpStatus, message, at: Date.now() };
}
