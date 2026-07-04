/**
 * proofchatIdentity.ts — Cầu định danh **did:phoenix → phiên ProofChat**.
 *
 * Mobile DẪN ĐẦU bằng PhoenixKey (web sẽ chuyển sang PhoenixKey sau). Lớp này ráp
 * đúng "bức tranh toàn bộ hiện tại" từ các mảnh ĐÃ CÓ THẬT trong app:
 *   • DID người dùng: `currentUserDid()` (sdk/phoenixKey) — `did:phoenix:<13>:<64>`.
 *   • deviceId: `getDeviceId()` (proofchat-api) — UUID persistent/thiết bị.
 *   • Khoá DID phần cứng P-256: `signRaw()`/`ownerPublicKey()` (Secure Enclave/Keystore).
 *   • Khoá session Ed25519: `chatMls.newSessionEd25519()` (Rust core).
 *
 * Ba việc:
 *   1. `getDid()` / `getDeviceId()` — định danh gửi kèm tin (senderId = did:phoenix).
 *   2. `ensureProofChatSession()` — AUTH: đổi PhoenixKey session-token → accessToken
 *      ProofChat (`/auth/phoenixkey/login`).
 *   3. `getMerkleSession()` — uỷ nhiệm session cho Merkle tier-3 (DIRECT/JOB_NEGOTIATION):
 *      sinh khoá Ed25519 session (native) + khoá DID P-256 ký uỷ nhiệm → `delegationCert`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { currentUserDid, ownerPublicKey, signRaw, isKeypairEnrolled } from '../sdk/phoenixKey';
import { getDeviceId, getAccessToken, proofChatApi } from './proofchat-api';
import { getSessionToken as getPhoenixSessionToken } from './phoenixKey-api';
import * as chatMls from '../sdk/chatMls';
import type { SessionDelegation } from './proofchatMessage';

// ── 1. Định danh ───────────────────────────────────────────────────────────────

export { getDeviceId };

/** did:phoenix của người dùng hiện tại (null nếu chưa tạo/đăng nhập PhoenixKey). */
export const getDid = (): Promise<string | null> => currentUserDid();

// ── 2. AUTH: PhoenixKey session-token → phiên ProofChat ─────────────────────────

/**
 * Đảm bảo có phiên ProofChat (accessToken trong AsyncStorage cho chatSocket/REST).
 *
 * Đổi **PhoenixKey session-token** (đã lưu sau khi đăng nhập PhoenixKey qua luồng
 * session-approve — `phoenixkey_session_token`) lấy `accessToken`/`refreshToken`
 * ProofChat qua `POST /auth/phoenixkey/login`. Idempotent: đã có accessToken →
 * true ngay (làm mới do interceptor proofchat-api lo). Trả **false** nếu CHƯA
 * đăng nhập PhoenixKey (không có session-token) → caller hiển thị "cần đăng nhập".
 *
 * PHỤ THUỘC TRIỂN KHAI (config, KHÔNG phải code): BE ProofChat phải cấu hình
 * `PHOENIXKEY_JWKS_URL`/`PHOENIXKEY_BASE_URL` để verify token EdDSA của PhoenixKey.
 * Không nuốt lỗi login: ném ProofChatApiError để caller phân biệt "chưa đăng nhập"
 * (false) với "login lỗi" (throw).
 */
export async function ensureProofChatSession(): Promise<boolean> {
  const existing = await getAccessToken();
  if (existing) return true;

  const phoenixToken = await getPhoenixSessionToken();
  if (!phoenixToken) return false; // chưa đăng nhập PhoenixKey

  await proofChatApi.auth.phoenixKeyLogin(phoenixToken);
  return true;
}

// ── 3. Merkle session delegation (tier-3, chỉ DIRECT/JOB_NEGOTIATION) ───────────

/** Session sống 12h (khớp identity.sessionExpiresAt của ProofChat). */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Xoay session sớm hơn hạn 5 phút để không dùng khoá gần hết hạn. */
const SESSION_RENEW_SKEW_MS = 5 * 60 * 1000;
const MERKLE_SESSION_KEY = 'proofchat_merkle_session';
/** Định danh format delegationCert did:phoenix (mobile định nghĩa, web theo sau). */
const DELEGATION_TYPE = 'did-phoenix-session-delegation';
const DELEGATION_V = 1;

interface StoredMerkleSession {
  did: string;
  seedHex: string;
  publicKeyHex: string; // Ed25519 session pubkey
  didPublicKey: string; // P-256 khoá DID (04||X||Y hex)
  certificate: string; // delegationCert (base64)
  issuedAt: number;
  expiresAt: number;
}

let memoCache: StoredMerkleSession | null = null;

/** JSON canonical (khoá sắp xếp byte-order) — khớp pattern ký của sdk/phoenixKey. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

function utf8ToHex(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out += cp.toString(16).padStart(2, '0');
    else if (cp < 0x800)
      out +=
        (0xc0 | (cp >> 6)).toString(16).padStart(2, '0') +
        (0x80 | (cp & 0x3f)).toString(16).padStart(2, '0');
    else if (cp < 0x10000)
      out +=
        (0xe0 | (cp >> 12)).toString(16).padStart(2, '0') +
        (0x80 | ((cp >> 6) & 0x3f)).toString(16).padStart(2, '0') +
        (0x80 | (cp & 0x3f)).toString(16).padStart(2, '0');
    else
      out +=
        (0xf0 | (cp >> 18)).toString(16).padStart(2, '0') +
        (0x80 | ((cp >> 12) & 0x3f)).toString(16).padStart(2, '0') +
        (0x80 | ((cp >> 6) & 0x3f)).toString(16).padStart(2, '0') +
        (0x80 | (cp & 0x3f)).toString(16).padStart(2, '0');
  }
  return out;
}

/** base64 của chuỗi UTF-8 (không thêm dependency — dùng global.btoa của RN Hermes). */
function utf8ToBase64(s: string): string {
  // Hermes có global btoa; nếu môi trường thiếu, fallback thủ công.
  const g = globalThis as { btoa?: (b: string) => string };
  if (typeof g.btoa === 'function') {
    // btoa cần binary string; encodeURIComponent→escape đảm bảo UTF-8 đúng.
    return g.btoa(unescape(encodeURIComponent(s)));
  }
  const bytes = utf8ToHex(s);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  const arr: number[] = [];
  for (let i = 0; i < bytes.length; i += 2) arr.push(parseInt(bytes.substr(i, 2), 16));
  for (let i = 0; i < arr.length; i += 3) {
    const b0 = arr[i], b1 = arr[i + 1], b2 = arr[i + 2];
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : chars[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : chars[b2 & 63];
  }
  return out;
}

function isFresh(s: StoredMerkleSession | null, did: string): s is StoredMerkleSession {
  return (
    !!s &&
    s.did === did &&
    typeof s.expiresAt === 'number' &&
    s.expiresAt - SESSION_RENEW_SKEW_MS > Date.now()
  );
}

async function loadStored(): Promise<StoredMerkleSession | null> {
  if (memoCache) return memoCache;
  try {
    const raw = await AsyncStorage.getItem(MERKLE_SESSION_KEY);
    memoCache = raw ? (JSON.parse(raw) as StoredMerkleSession) : null;
  } catch {
    memoCache = null;
  }
  return memoCache;
}

async function persist(s: StoredMerkleSession): Promise<void> {
  memoCache = s;
  try {
    await AsyncStorage.setItem(MERKLE_SESSION_KEY, JSON.stringify(s));
  } catch {
    /* non-fatal — vẫn dùng memoCache trong phiên hiện tại */
  }
}

/**
 * Uỷ nhiệm session cho Merkle. Sinh cặp khoá **Ed25519 session** (native), rồi
 * khoá **DID P-256 phần cứng** ký uỷ nhiệm lên pubkey session → `delegationCert`.
 * Cache 12h (persist) để không bật sinh trắc học mỗi lần gửi.
 *
 * `delegationCert` (base64 của JSON) — format did:phoenix (mobile định nghĩa):
 *   payload ký (canonical) = {v, type, did, sessionPublicKey, issuedAt, expiresAt}
 *   cert = base64(JSON({...payload, didPublicKey:<P256 hex>, sig:<DER hex>}))
 * Người verify: resolve DID → khoá P-256, verify `sig` trên canonical(payload),
 * đối chiếu `sessionPublicKey == leaf.signerPublicKey`, kiểm hạn → tin chữ ký session.
 *
 * Trả **undefined** (degrade mềm — tầng 1+2 vẫn chạy) khi: native chat_mls chưa
 * sẵn / chưa có DID / chưa enroll khoá phần cứng.
 */
export async function getMerkleSession(): Promise<SessionDelegation | undefined> {
  const did = await currentUserDid();
  if (!did) return undefined;
  if (!chatMls.isAvailable()) return undefined;
  if (!(await isKeypairEnrolled())) return undefined;

  const cached = await loadStored();
  if (isFresh(cached, did)) {
    return {
      seedHex: cached.seedHex,
      certificate: cached.certificate,
      walletCoseKey: cached.didPublicKey,
    };
  }

  // Sinh session mới + ký uỷ nhiệm bằng khoá DID (P-256 phần cứng).
  const kp = await chatMls.newSessionEd25519(); // {seedHex, publicKeyHex}
  const didPublicKey = await ownerPublicKey();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + SESSION_TTL_MS;

  const signedPayload = {
    v: DELEGATION_V,
    type: DELEGATION_TYPE,
    did,
    sessionPublicKey: kp.publicKeyHex,
    issuedAt,
    expiresAt,
  };
  const sigDerHex = await signRaw(
    utf8ToHex(canonicalize(signedPayload)),
    'Uỷ nhiệm phiên chat',
    'Ký để bật bằng chứng toàn vẹn tin nhắn (12 giờ)',
  );

  const certificate = utf8ToBase64(
    JSON.stringify({ ...signedPayload, didPublicKey, sig: sigDerHex }),
  );

  const stored: StoredMerkleSession = {
    did,
    seedHex: kp.seedHex,
    publicKeyHex: kp.publicKeyHex,
    didPublicKey,
    certificate,
    issuedAt,
    expiresAt,
  };
  await persist(stored);

  return { seedHex: stored.seedHex, certificate, walletCoseKey: didPublicKey };
}

/** Xoá uỷ nhiệm session (khi đăng xuất / xoay danh tính). */
export async function clearMerkleSession(): Promise<void> {
  memoCache = null;
  try {
    await AsyncStorage.removeItem(MERKLE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export default {
  getDid,
  getDeviceId,
  ensureProofChatSession,
  getMerkleSession,
  clearMerkleSession,
};
