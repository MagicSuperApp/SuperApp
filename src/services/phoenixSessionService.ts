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
import { phoenixKeyApi, setSessionToken, getSessionToken } from './phoenixKey-api';

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
 * Bảo đảm có PhoenixKey session token. Trả token nếu có/vừa lấy được, null nếu bỏ qua
 * (chưa có danh tính / offline / lỗi). KHÔNG ném — best-effort như ensureOrilifeToken.
 *
 * @param force  bỏ qua token đang lưu, ép self-pair mới (dùng khi gặp 401).
 */
export async function ensurePhoenixSession(opts: { force?: boolean } = {}): Promise<string | null> {
  try {
    if (!opts.force) {
      const existing = await getSessionToken();
      if (existing) return existing;
    }

    const did = await currentUserDid();
    const pubkey = await ownerPublicKey();
    if (!did || !pubkey) return null;

    const { sessionId, challenge } = await phoenixKeyApi.session.init();

    const timestamp = Math.floor(Date.now() / 1000);
    const message = `${challenge}:${SELF_PAIR_DOMAIN}:${timestamp}`;
    const signature = await signRaw(
      asciiToHex(message),
      'Kích hoạt ví',
      'Ký bằng khoá phần cứng để mở khoá dịch vụ ví',
    );

    const res = await phoenixKeyApi.session.approve(sessionId, {
      userDid: did,
      publicKeyHex: pubkey,
      signature,
      domain: SELF_PAIR_DOMAIN,
      timestamp,
    });

    if (res?.sessionToken) {
      await setSessionToken(res.sessionToken);
      return res.sessionToken;
    }
    return null;
  } catch {
    // Chưa có danh tính / offline / backend từ chối → thử lại lần vào sau.
    return null;
  }
}
