/**
 * OriLife field-reid — Đăng nhập api.orilife.io bằng khoá PhoenixKey (DID auth).
 *
 * Vì sao có file này:
 *   Backend field-reid (MassTreeIdentify/core/did_auth.py) THÊM một đường đăng nhập
 *   cho app PhoenixKey (app KHÔNG có username/password). App ký một challenge bằng
 *   khoá riêng Secure Enclave (iOS) / Keystore (Android) của DID → server lấy public
 *   key của DID từ PhoenixKey-Core, verify ECDSA P-256, rồi cấp token field-reid.
 *
 * Luồng (khớp did_auth.py):
 *   1) GET  {BASE}/api/auth/did/challenge        → { ok, challenge, ttl }   (không auth)
 *   2) ký challenge: ECDSA P-256 SHA-256, chữ-ký DER  (signRaw → HEX của DER)
 *   3) POST {BASE}/api/auth/did/verify
 *        { did, challenge, signature(base64 DER), pubkey_hex }  → { ok, token, owner, username }
 *   4) lưu token vào AsyncStorage 'auth_token' → 5 service ReID (tree/fruit/animal/
 *      farm/care) tự gắn `Authorization: Bearer <token>`.
 *
 * GHI CHÚ định-dạng (khớp Android PhoenixKeyModule.kt + did_auth.py):
 *   - signRaw nhận HEX của bytes cần ký; ký challenge.utf8 (challenge là base64url ASCII).
 *   - signRaw TRẢ HEX của chữ-ký DER (giống Android `bytesToHex(sig.sign())`).
 *   - did_auth.py `_b64_any_decode` nhận BASE64 (chuẩn/url) → convert hex→base64 trước khi gửi.
 *   - pubkey_hex = EC point không nén `04||X(32)||Y(32)` (ownerPublicKey trả đúng dạng này).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { currentUserDid, ownerPublicKey, signRaw, isKeypairEnrolled } from '../sdk/phoenixKey';
import { isAvailable as phoenixKeyIsAvailable } from './phoenixKey-native';
import rLog from './remoteLogger';

import { AUTH_TOKEN_KEY, resetOrilifeAuthHeaderCache } from './orilifeAuthHeader';

/**
 * DID đã đổi lấy `auth_token` đang nằm trong kho.
 *
 * ⛔ Vì sao khoá này phải có — lỗi đo được 2026-08-28:
 *   `logoutUser` (store/userSlice.ts) xoá phiên Work, ngắt ProofChat, xoá nháp, đóng
 *   CSDL per-user — nhưng KHÔNG xoá `auth_token`. Mà `ensureOrilifeToken` cũ chỉ hỏi
 *   "có token không", không hỏi "của ai". Nên trên một máy dùng chung ngoài đồng:
 *   người A đăng xuất → người B đăng nhập → lời gọi OriLife đầu tiên thấy token còn
 *   đó và trả `true` ngay, KHÔNG ký lại. Từ đó 17 chỗ đọc `auth_token` (vườn, cây,
 *   con, chăm sóc, dòng thời gian, truy xuất, video, trôi mẫu, ảnh…) đi ra máy chủ
 *   MANG DANH NGƯỜI A, cho tới khi token hết hạn. Không màn nào báo gì.
 *
 * Nên từ nay token luôn đi kèm DID đã ký ra nó. Không khớp — hoặc không rõ của ai —
 * là BỎ và ký lại. Mặc định ĐÓNG: token đời cũ (lưu trước bản này) không có khoá
 * này, nên bị coi là vô chủ và người dùng ký lại MỘT lần sau khi cập nhật. Đó là
 * cái giá cố ý: thà một lần hỏi sinh trắc còn hơn một lần gửi dữ liệu nhầm danh.
 */
const TOKEN_DID_KEY = 'orilife_token_did';

/**
 * `owner-ref` của chính người đang đăng nhập (`acct:<id>` hoặc DID).
 *
 * Máy chủ trả nó ở bước verify nhưng trước đây app vứt đi, nên không chỗ nào biết
 * "mình là ai" theo cách máy chủ gọi. Cửa `GET /api/grants` trả danh sách chia sẻ
 * HAI CHIỀU trong một mảng phẳng — không có mã này thì không tách nổi "mình cấp
 * cho người ta" với "người ta cấp cho mình", và đoán bừa là hiển thị đúng ngược
 * chiều. Xem `grantService.splitGrants`.
 */
export const OWNER_REF_KEY = 'orilife_owner_ref';

// ── helpers ────────────────────────────────────────────────────────────────

/** challenge là base64url ASCII (mọi ký-tự < 0x80) → 1 byte/ký-tự. */
const asciiToHex = (s: string): string => {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    out += s.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return out;
};

const B64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** hex (chữ-ký DER) → base64 chuẩn (byte-accurate, KHÔNG qua utf8). */
const hexToBase64 = (hex: string): string => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : B64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : B64_ALPHABET[b2 & 0x3f];
  }
  return out;
};

// ── public API ───────────────────────────────────────────────────────────────

export interface DidLoginResult {
  ok: boolean;
  token?: string;
  owner?: string;
  username?: string;
  error?: string;
}

/**
 * Đăng nhập api.orilife.io bằng DID PhoenixKey → lưu `auth_token`.
 *
 * baseUrl: BASE_URL field-reid (vd https://api.orilife.io). Tự .trim() phòng whitespace.
 * Trả { ok:true, token } khi thành công; { ok:false, error } khi thất bại (KHÔNG ném).
 */
export async function loginOrilifeWithDid(baseUrl: string): Promise<DidLoginResult> {
  const base = (baseUrl || '').trim().replace(/\/+$/, '');
  try {
    rLog.info('did_login_start', { base });

    const did = await currentUserDid();
    const keyEnrolled = await isKeypairEnrolled().catch(() => false);
    rLog.info('did_login_identity', {
      hasDid: !!did,
      // DID là định danh CÔNG KHAI → log đầy đủ để chẩn đoán (canonical phải
      // ≥78 ký tự: did:phoenix:<slot>:<64hex>). didLen < 78 = malformed/cụt.
      did: did ?? null,
      didLen: did ? did.length : 0,
      keyEnrolled,
      signerAvailable: phoenixKeyIsAvailable(),
    });
    if (!did) {
      rLog.error('did_login_no_did', { keyEnrolled, signerAvailable: phoenixKeyIsAvailable() });
      return { ok: false, error: 'Thiết bị chưa có danh tính.' };
    }

    // 1) Lấy challenge (single-use, TTL 5 phút) — không cần auth.
    let chRes: Response;
    try {
      chRes = await fetch(`${base}/api/auth/did/challenge`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
    } catch (ne: any) {
      rLog.error('did_login_challenge_neterr', { err: ne?.message ?? String(ne) });
      return { ok: false, error: `Challenge network: ${ne?.message ?? ne}` };
    }
    if (!chRes.ok) {
      rLog.error('did_login_challenge_http', { status: chRes.status });
      return { ok: false, error: `Challenge HTTP ${chRes.status}` };
    }
    const chBody = await chRes.json();
    const challenge: string | undefined = chBody?.challenge;
    rLog.info('did_login_challenge_ok', { hasChallenge: !!challenge });
    if (!challenge) {
      return { ok: false, error: 'Server không trả challenge.' };
    }

    // 2) Ký challenge bằng khoá phần-cứng (ECDSA P-256 SHA-256 → HEX của DER).
    let signatureHex: string;
    let pubkeyHex: string;
    try {
      signatureHex = await signRaw(
        asciiToHex(challenge),
        'OriLife login',
        'Sign challenge for OriLife login (DID auth)',
      );
      pubkeyHex = await ownerPublicKey();
      rLog.info('did_login_signed', {
        sigHexLen: signatureHex?.length ?? 0,
        pubkeyLen: pubkeyHex?.length ?? 0,
      });
    } catch (se: any) {
      rLog.error('did_login_sign_failed', { err: se?.message ?? String(se), code: se?.code });
      return { ok: false, error: `Ký thất bại: ${se?.message ?? se}` };
    }
    const signatureB64 = hexToBase64(signatureHex);

    // 3) Verify → nhận token field-reid.
    let vRes: Response;
    try {
      vRes = await fetch(`${base}/api/auth/did/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          did,
          challenge,
          signature: signatureB64,
          pubkey_hex: pubkeyHex,
        }),
      });
    } catch (ne: any) {
      rLog.error('did_login_verify_neterr', { err: ne?.message ?? String(ne) });
      return { ok: false, error: `Verify network: ${ne?.message ?? ne}` };
    }
    const vBody = await vRes.json().catch(() => ({}));
    if (!vRes.ok || !vBody?.ok || !vBody?.token) {
      rLog.error('did_login_verify_rejected', {
        status: vRes.status,
        detail: vBody?.detail ?? vBody?.error ?? null,
      });
      return {
        ok: false,
        error: vBody?.detail || vBody?.error || `Verify HTTP ${vRes.status}`,
      };
    }

    // 4) Lưu token → mọi service ReID tự gắn Bearer.
    //
    // THỨ TỰ CÓ CHỦ Ý, đừng đảo: xoá dấu chủ TRƯỚC, ghi token, rồi mới ghi chủ mới.
    // Máy tắt giữa chừng ở bất kỳ điểm nào cũng chỉ ra một trạng thái: token không
    // rõ chủ → lần sau bị bỏ và ký lại. Ghi chủ trước rồi mới ghi token thì có một
    // khoảnh khắc "chủ = B mà token vẫn của A" — đúng cái ca phải chặn.
    await AsyncStorage.removeItem(TOKEN_DID_KEY).catch(() => {});
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, vBody.token);
    await AsyncStorage.setItem(TOKEN_DID_KEY, did);
    // Đệm đầu đề ảnh giữ `Bearer` cũ tới 30 giây — đổi token mà không xoá đệm thì
    // ảnh trong nửa phút đầu vẫn đi kèm token người trước.
    resetOrilifeAuthHeaderCache();
    // Lưu luôn owner-ref (xem OWNER_REF_KEY). Best-effort: máy chủ không hứa
    // trường này, và thiếu nó thì màn chia sẻ nói "không rõ chiều" chứ không đoán.
    if (typeof vBody.owner === 'string' && vBody.owner.trim()) {
      await AsyncStorage.setItem(OWNER_REF_KEY, vBody.owner.trim()).catch(() => {});
    }
    rLog.info('did_login_success', { owner: vBody.owner ?? null, username: vBody.username ?? null });

    return {
      ok: true,
      token: vBody.token,
      owner: vBody.owner,
      username: vBody.username,
    };
  } catch (err: any) {
    rLog.error('did_login_exception', { err: err?.message ?? String(err) });
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * Có sẵn token field-reid trong AsyncStorage chưa.
 *
 * ⚠ Câu hỏi này KHÔNG đủ để quyết định "khỏi ký lại" — nó không nói token của AI.
 * Chỗ quyết định phải dùng `tokenMatchesCurrentDid()`. Giữ hàm này cho việc chẩn
 * đoán/hiển thị trạng thái.
 */
export async function hasOrilifeToken(): Promise<boolean> {
  const t = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  return !!t;
}

/** Xoá token (vd khi 401 / đăng xuất). */
export async function clearOrilifeToken(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  // Xoá cùng lúc: owner-ref của phiên cũ mà còn sót lại thì màn chia sẻ tách
  // danh sách theo NGƯỜI KHÁC — sai chiều mà không có gì báo.
  await AsyncStorage.removeItem(OWNER_REF_KEY).catch(() => {});
  await AsyncStorage.removeItem(TOKEN_DID_KEY).catch(() => {});
  // Đệm trong BỘ NHỚ, không nằm trong kho — xoá kho mà quên nó thì 30 giây kế tiếp
  // ảnh vẫn mang token vừa bị xoá.
  resetOrilifeAuthHeaderCache();
}

/**
 * `owner-ref` của người đang đăng nhập, hoặc `null` nếu chưa biết.
 *
 * `null` là một câu trả lời hợp lệ: tài khoản đăng nhập từ trước bản này chưa
 * lưu mã đó, và nó chỉ có sau lần đăng nhập kế tiếp. Chỗ gọi phải chịu được
 * `null` chứ không được dựng ra một mã giả.
 */
export async function currentOwnerRef(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(OWNER_REF_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** DID đã ký ra token đang lưu, hoặc `null` nếu không rõ (token đời cũ / không có). */
export async function tokenOwnerDid(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(TOKEN_DID_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Token đang lưu có ĐÚNG là của danh tính đang dùng máy không.
 *
 * Trả `false` ở cả ba ca, và cả ba đều phải ký lại — không ca nào được nới:
 *   · không có token;
 *   · có token nhưng không rõ của ai (token lưu trước bản buộc-DID);
 *   · có token, rõ của ai, nhưng người đó KHÔNG phải người đang dùng máy.
 */
export async function tokenMatchesCurrentDid(): Promise<boolean> {
  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY).catch(() => null);
  if (!token) return false;
  const owner = await tokenOwnerDid();
  if (!owner) return false;
  const did = await currentUserDid().catch(() => null);
  if (!did) return false;
  return owner === did;
}

/**
 * Đảm bảo có token CỦA ĐÚNG NGƯỜI ĐANG DÙNG MÁY trước khi gọi API ReID.
 *
 * Bản trước chỉ hỏi "có token không" (`hasOrilifeToken`). Trên máy dùng chung ngoài
 * đồng đó là một lỗ: token người trước sống sót qua đăng xuất, và lời gọi đầu tiên
 * của người sau trả `true` ngay mà không ký lại — xem ghi chú ở `TOKEN_DID_KEY`.
 *
 * Nay không khớp là XOÁ rồi ký lại. Xoá chứ không chỉ bỏ qua: 17 chỗ đọc thẳng
 * `auth_token` từ kho mà KHÔNG đi qua hàm này (`RemoteImage`, các service ReID lúc
 * gửi lại hàng đợi…), nên chừng nào token lạ còn nằm trong kho thì chừng đó còn
 * đường cho nó ra khỏi máy.
 */
export async function ensureOrilifeToken(
  baseUrl: string,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  if (!opts.force) {
    if (await tokenMatchesCurrentDid()) return true;
    await clearOrilifeToken().catch(() => {});
  }
  const res = await loginOrilifeWithDid(baseUrl);
  return res.ok;
}
