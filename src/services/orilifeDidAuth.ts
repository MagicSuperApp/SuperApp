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

const AUTH_TOKEN_KEY = 'auth_token';

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
      didPrefix: did ? did.slice(0, 24) : null,
      keyEnrolled,
      signerAvailable: phoenixKeyIsAvailable(),
    });
    if (!did) {
      rLog.error('did_login_no_did', { keyEnrolled, signerAvailable: phoenixKeyIsAvailable() });
      return { ok: false, error: 'Chưa có danh tính PhoenixKey (DID) trên thiết bị.' };
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
        'Đăng nhập OriLife',
        'Ký bằng khoá PhoenixKey để nhận diện cây',
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
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, vBody.token);
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

/** Có sẵn token field-reid trong AsyncStorage chưa. */
export async function hasOrilifeToken(): Promise<boolean> {
  const t = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  return !!t;
}

/** Xoá token (vd khi 401 / đăng xuất). */
export async function clearOrilifeToken(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
}

/**
 * Đảm bảo có token trước khi gọi API ReID. Nếu chưa có (hoặc force) → DID login.
 * Trả true nếu sau cùng có token dùng được.
 */
export async function ensureOrilifeToken(
  baseUrl: string,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  if (!opts.force && (await hasOrilifeToken())) return true;
  const res = await loginOrilifeWithDid(baseUrl);
  return res.ok;
}
