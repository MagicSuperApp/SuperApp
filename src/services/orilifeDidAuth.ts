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
import { tk } from '../i18n/keys';
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

/**
 * Chỗ hỏng, theo NGƯỜI DÙNG PHẢI LÀM GÌ — không theo tầng kỹ thuật.
 *
 * Có nhãn này vì `error` là chuỗi viết cho người sửa máy (`Challenge HTTP 401`,
 * `Verify network: …`), và đem nguyên văn ra màn hình là đúng thứ §"lỗi hệ thống
 * thô thì hiện MÃ THAM CHIẾU" cấm. Nhưng bỏ hẳn đi rồi nói một câu chung chung thì
 * lại là cái vỏ im lặng. Nhãn này là đường giữa: máy chủ nói gì thì phân đúng ô,
 * rồi màn hình tự chọn câu tiếng Việt hợp ô đó.
 *
 * Năm ô đòi năm hành động NGƯỢC nhau, nên đừng gộp:
 *   · no-identity — máy chưa có danh tính → phải lập/khôi phục danh tính;
 *   · network     — không tới được máy chủ → xem sóng, thử lại;
 *   · sign        — ký hỏng (người dùng tắt hộp thoại, sinh trắc không nhận) → ký lại;
 *   · refused     — tới nơi, máy chủ TỪ CHỐI danh tính này → thử lại vô ích;
 *   · server      — máy chủ trả lời sai hợp đồng → chờ, không phải lỗi người dùng.
 */
export type DidLoginFailKind =
  | 'no-identity'
  | 'network'
  | 'sign'
  | 'refused'
  | 'server'
  | 'unknown';

export interface DidLoginResult {
  ok: boolean;
  token?: string;
  owner?: string;
  username?: string;
  error?: string;
  kind?: DidLoginFailKind;
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
      return { ok: false, kind: 'no-identity', error: 'Thiết bị chưa có danh tính.' };
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
      return { ok: false, kind: 'network', error: `Challenge network: ${ne?.message ?? ne}` };
    }
    if (!chRes.ok) {
      rLog.error('did_login_challenge_http', { status: chRes.status });
      // 401/403 ở cửa CHALLENGE nghĩa là máy chủ chặn trước cả khi biết mình là ai —
      // đó là từ-chối, không phải máy chủ hỏng. Hai ca đòi hai câu khác nhau.
      return {
        ok: false,
        kind: chRes.status === 401 || chRes.status === 403 ? 'refused' : 'server',
        error: `Challenge HTTP ${chRes.status}`,
      };
    }
    const chBody = await chRes.json();
    const challenge: string | undefined = chBody?.challenge;
    rLog.info('did_login_challenge_ok', { hasChallenge: !!challenge });
    if (!challenge) {
      return { ok: false, kind: 'server', error: 'Server không trả challenge.' };
    }

    // 2) Ký challenge bằng khoá phần-cứng (ECDSA P-256 SHA-256 → HEX của DER).
    let signatureHex: string;
    let pubkeyHex: string;
    try {
      signatureHex = await signRaw(
        asciiToHex(challenge),
        tk('identity.bio.farmLoginTitle'),
        tk('identity.bio.farmLoginBody'),
      );
      pubkeyHex = await ownerPublicKey();
      rLog.info('did_login_signed', {
        sigHexLen: signatureHex?.length ?? 0,
        pubkeyLen: pubkeyHex?.length ?? 0,
      });
    } catch (se: any) {
      rLog.error('did_login_sign_failed', { err: se?.message ?? String(se), code: se?.code });
      return { ok: false, kind: 'sign', error: `Ký thất bại: ${se?.message ?? se}` };
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
      return { ok: false, kind: 'network', error: `Verify network: ${ne?.message ?? ne}` };
    }
    const vBody = await vRes.json().catch(() => ({}));
    if (!vRes.ok || !vBody?.ok || !vBody?.token) {
      rLog.error('did_login_verify_rejected', {
        status: vRes.status,
        detail: vBody?.detail ?? vBody?.error ?? null,
      });
      return {
        ok: false,
        // Tới được cửa verify mà bị bác: máy chủ đã NHÌN chữ ký và nói không.
        // 5xx là máy chủ hỏng, còn lại là từ-chối — và từ-chối thì thử lại vô ích.
        kind: vRes.status >= 500 ? 'server' : 'refused',
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
    return { ok: false, kind: 'unknown', error: err?.message ?? String(err) };
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
  const res = await loginOnce(baseUrl);
  return res.ok;
}

// ── Van chặn bão sinh trắc ───────────────────────────────────────────────────
//
// `loginOrilifeWithDid` gọi `signRaw`, và `signRaw` bật hộp thoại sinh trắc của hệ
// điều hành. Hộp thoại đó là MODAL: nó phủ lên màn đang mở, nuốt mọi thao tác chạm,
// và người dùng không tắt được bằng nút Quay lại.
//
// Chỗ hỏng đo được trên bản 99 (ba đoạn quay người dùng gửi 2026-09-12): mở màn
// trang trại mà phiên OriLife đã chết thì Face ID bật lại ở giây 19 · 23 · 26 · 30 ·
// 38 — lần nào cũng nhận đúng mặt, và lần nào xong cũng lại có cái tiếp theo. Máy
// trông như treo ("đơ như cây cơ") trong khi thật ra không luồng nào treo cả.
//
// Nguyên nhân KHÔNG nằm ở một chỗ gọi nào: 11 service cùng gọi `ensureOrilifeToken`
// trước mỗi yêu cầu, rồi gọi LẠI với `force` khi máy chủ trả 401 — riêng màn trang
// trại có ba luồng làm đúng thế. Mỗi lượt là một lần ký, tức một hộp thoại. Vá từng
// chỗ gọi thì vá 22 chỗ và chỗ thứ 23 viết sau lại hở, nên van đặt ở ĐÂY, nơi duy
// nhất mọi đường đi qua.
//
// Hai lớp, giải hai việc khác nhau — đừng gộp:
//   · gộp-đang-bay: nhiều lời gọi CÙNG LÚC dùng chung một lần ký (một hộp thoại);
//   · nghỉ-sau-khi-trượt: máy chủ vừa từ chối thì 60 giây sau mới hỏi lại sinh trắc.
//     Không có lớp này thì ba luồng nối đuôi nhau vẫn ra ba hộp thoại, chỉ là không
//     chồng lên nhau.
//
// `force` KHÔNG vượt được van. `force` nghĩa là "đừng tin thẻ đang lưu", không phải
// "cứ hỏi vân tay người ta thêm lần nữa" — và mọi chỗ truyền `force` hôm nay đều là
// đường thử-lại tự động sau 401, đúng thứ sinh ra cơn bão. Đường vượt van có chủ ý
// là `clearOrilifeLoginCooldown()`, gọi khi trạng thái đã ĐỔI thật: đổi danh tính,
// đăng xuất, hoặc người dùng tự bấm đăng nhập lại.
const LOGIN_COOLDOWN_MS = 60_000;
let inflightLogin: Promise<DidLoginResult> | null = null;
let loginCooldownUntil = 0;
let lastLoginError: string | null = null;
let lastLoginKind: DidLoginFailKind | null = null;

/** Cho phép hỏi sinh trắc lại NGAY. Chỉ gọi khi trạng thái danh tính đã đổi thật. */
export function clearOrilifeLoginCooldown(): void {
  loginCooldownUntil = 0;
  lastLoginError = null;
  lastLoginKind = null;
  inflightLogin = null;
}

/** Còn bao nhiêu mili-giây nữa mới hỏi sinh trắc lại; 0 nghĩa là hỏi được ngay. */
export const orilifeLoginCooldownLeft = (): number =>
  Math.max(0, loginCooldownUntil - Date.now());

/**
 * Lý do máy chủ từ chối ở lần đăng nhập DID gần nhất, nguyên văn.
 *
 * Có hàm này để màn hình thôi phải bịa. Câu cũ — "Phiên đăng nhập hết hạn. Hãy đăng
 * nhập lại." — vừa sai (phiên có thể chưa hết hạn; máy chủ có thể đang từ chối chính
 * DID này) vừa không làm được gì: màn trang trại không có chỗ nào để "đăng nhập lại".
 */
export const lastOrilifeLoginError = (): string | null => lastLoginError;

/** Ô hỏng của lần đăng nhập DID gần nhất — dùng để chọn câu nói với người dùng. */
export const lastOrilifeLoginKind = (): DidLoginFailKind | null => lastLoginKind;

function loginOnce(baseUrl: string): Promise<DidLoginResult> {
  if (inflightLogin) return inflightLogin;
  if (Date.now() < loginCooldownUntil) {
    // KHÔNG ký, KHÔNG hộp thoại. Trả về đúng lý do máy chủ đã nói lần trước —
    // im lặng trả `{ok:false}` trơ ở đây là dựng lại cái vỏ im lặng ở tầng dưới.
    return Promise.resolve({
      ok: false,
      kind: lastLoginKind ?? undefined,
      error: lastLoginError ?? undefined,
    });
  }
  const run = (async () => {
    const res = await loginOrilifeWithDid(baseUrl);
    if (res.ok) {
      loginCooldownUntil = 0;
      lastLoginError = null;
      lastLoginKind = null;
    } else {
      loginCooldownUntil = Date.now() + LOGIN_COOLDOWN_MS;
      lastLoginError = res.error ?? null;
      lastLoginKind = res.kind ?? 'unknown';
    }
    return res;
  })();
  inflightLogin = run;
  run.finally(() => {
    if (inflightLogin === run) inflightLogin = null;
  });
  return run;
}
