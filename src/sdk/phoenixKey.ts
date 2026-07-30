/**
 * PhoenixKey SDK — Android Keystore + PhoenixKey backend implementation.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  WalletStatus,
  SignaturePayload,
  SignedData,
} from '../types/verification';
import {
  generateKeypair as nativeGenerateKeypair,
  getPublicKeyHex as nativeGetPublicKeyHex,
  hasKey as nativeHasKey,
  deleteKey as nativeDeleteKey,
  sign as nativeSign,
} from '../services/phoenixKey-native';
import { phoenixKeyApi, summarizeWalletAll } from '../services/phoenixKey-api';
import { assertSupportedBackendDid } from '../services/phoenixDid';

export const STORAGE_USER_DID = 'phoenixkey_user_did';
/** Alias MẶC ĐỊNH (install lần đầu). Sau khi xoay khoá, alias thực = con trỏ dưới. */
export const KEY_ALIAS_OWNER = 'phoenixkey_owner_v1';

// ── Con trỏ alias khoá owner (hỗ trợ xoay khoá) ───────────────────────────────
// Keystore/Secure Enclave KHÔNG cho đổi tên khoá → xoay khoá = sinh khoá dưới alias
// MỚI (vd _v2) rồi trỏ con trỏ này sang đó. Mọi thao tác owner-key đọc alias qua
// getOwnerAlias() thay vì hằng cứng. Mặc định = KEY_ALIAS_OWNER để install cũ chạy nguyên.
const OWNER_ALIAS_POINTER = 'phoenixkey_owner_alias';

/** Alias khoá owner HIỆN HÀNH (đọc con trỏ; mặc định phoenixkey_owner_v1). */
export const getOwnerAlias = async (): Promise<string> => {
  const p = await AsyncStorage.getItem(OWNER_ALIAS_POINTER);
  return p && p.trim() ? p : KEY_ALIAS_OWNER;
};

/** Đặt con trỏ alias owner (dùng sau khi xoay khoá thành công). */
export const setOwnerAlias = (alias: string): Promise<void> =>
  AsyncStorage.setItem(OWNER_ALIAS_POINTER, alias);

/** Tính alias KẾ TIẾP khi xoay: bump hậu tố _v<N> (không có → _v2). */
export const nextOwnerAlias = (current: string): string => {
  const m = current.match(/^(.*_v)(\d+)$/);
  if (m) return `${m[1]}${parseInt(m[2], 10) + 1}`;
  return `${current}_v2`;
};

const utf8ToHex = (s: string): string => {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const code = s.codePointAt(i);
    if (code === undefined) break;
    if (code < 0x80) {
      out += code.toString(16).padStart(2, '0');
      i += 1;
    } else if (code < 0x800) {
      out += (0xc0 | (code >> 6)).toString(16).padStart(2, '0');
      out += (0x80 | (code & 0x3f)).toString(16).padStart(2, '0');
      i += 1;
    } else if (code < 0x10000) {
      out += (0xe0 | (code >> 12)).toString(16).padStart(2, '0');
      out += (0x80 | ((code >> 6) & 0x3f)).toString(16).padStart(2, '0');
      out += (0x80 | (code & 0x3f)).toString(16).padStart(2, '0');
      i += 1;
    } else {
      out += (0xf0 | (code >> 18)).toString(16).padStart(2, '0');
      out += (0x80 | ((code >> 12) & 0x3f)).toString(16).padStart(2, '0');
      out += (0x80 | ((code >> 6) & 0x3f)).toString(16).padStart(2, '0');
      out += (0x80 | (code & 0x3f)).toString(16).padStart(2, '0');
      i += 2;
    }
  }
  return out;
};

const byteCompare = (a: string, b: string): number => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort(byteCompare);
  return (
    '{' +
    keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') +
    '}'
  );
};

const readStoredDid = (): Promise<string | null> =>
  AsyncStorage.getItem(STORAGE_USER_DID);

interface PhoenixKeySDK {
  isActivated(): Promise<boolean>;
  getWalletStatus(): Promise<WalletStatus>;
  signData(payload: SignaturePayload): Promise<SignedData>;
  requestActivation(): Promise<{ success: boolean; message: string }>;
}

class RealPhoenixKey implements PhoenixKeySDK {
  async isActivated(): Promise<boolean> {
    const did = await readStoredDid();
    if (!did) return false;
    try {
      const s = summarizeWalletAll(await phoenixKeyApi.wallet.getAll(did));
      return s.lamp > 0;
    } catch {
      return false;
    }
  }

  async getWalletStatus(): Promise<WalletStatus> {
    const did = await readStoredDid();
    if (!did) {
      return {
        isActivated: false,
        magicCredits: 0,
        lampTokens: 0,
        adaBalance: 0,
        address: '',
        lastUpdated: Date.now(),
      };
    }
    const s = summarizeWalletAll(await phoenixKeyApi.wallet.getAll(did));
    return {
      isActivated: s.lamp > 0,
      magicCredits: s.magicAvailable + s.magicAccrued,
      lampTokens: s.lamp,
      adaBalance: s.lovelace / 1_000_000,
      address: s.address ?? '',
      lastUpdated: Date.now(),
    };
  }

  async signData(payload: SignaturePayload): Promise<SignedData> {
    const canonical = canonicalize(payload);
    const dataHex = utf8ToHex(canonical);

    const alias = await getOwnerAlias();
    const exists = await nativeHasKey(alias);
    if (!exists) {
      throw new Error(
        'PhoenixKey owner key not enrolled. Run Genesis flow to register a keypair first.',
      );
    }

    const signature = await nativeSign(
      alias,
      dataHex,
      'Ký xác nhận',
      'Xác minh dữ liệu để gửi lên backend',
    );
    const publicKey = await nativeGetPublicKeyHex(alias);

    return { payload, signature, publicKey };
  }

  async requestActivation(): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message:
        'Kích hoạt tài khoản thực hiện trên phoenixkey.me — vui lòng mở dashboard web',
    };
  }
}

const phoenixKeySDK: PhoenixKeySDK = new RealPhoenixKey();

export default phoenixKeySDK;
export type { PhoenixKeySDK };

export const usePhoenixKey = () => ({
  isActivated: phoenixKeySDK.isActivated.bind(phoenixKeySDK),
  getWalletStatus: phoenixKeySDK.getWalletStatus.bind(phoenixKeySDK),
  signData: phoenixKeySDK.signData.bind(phoenixKeySDK),
  requestActivation: phoenixKeySDK.requestActivation.bind(phoenixKeySDK),
});

export const isKeypairEnrolled = async (): Promise<boolean> =>
  nativeHasKey(await getOwnerAlias());

/**
 * Đăng ký keypair owner LẦN ĐẦU. Reset con trỏ về alias mặc định (danh tính mới bắt
 * đầu từ v1) rồi sinh khoá dưới đó.
 */
export const enrollKeypair = async (): Promise<{
  alias: string;
  publicKeyHex: string;
}> => {
  await setOwnerAlias(KEY_ALIAS_OWNER);
  return nativeGenerateKeypair(KEY_ALIAS_OWNER, true);
};

export const ownerPublicKey = async (): Promise<string> =>
  nativeGetPublicKeyHex(await getOwnerAlias());

export const signRaw = async (
  dataHex: string,
  promptTitle: string,
  promptSubtitle?: string,
): Promise<string> =>
  nativeSign(await getOwnerAlias(), dataHex, promptTitle, promptSubtitle);

export const wipeIdentity = async (): Promise<void> => {
  try {
    await nativeDeleteKey(await getOwnerAlias());
  } catch {
    /* key may already be gone — ignore */
  }
  // Reset con trỏ về alias mặc định để lần đăng ký sau bắt đầu sạch từ v1.
  await AsyncStorage.removeItem(OWNER_ALIAS_POINTER);
  await AsyncStorage.removeItem(STORAGE_USER_DID);
  await phoenixKeyApi.clearSessionToken();
};

export const saveUserDid = (did: string): Promise<void> =>
  AsyncStorage.setItem(
    STORAGE_USER_DID,
    assertSupportedBackendDid(did, 'PhoenixKey stored userDid'),
  );

export const currentUserDid = (): Promise<string | null> => readStoredDid();

export { PhoenixKeyApiError } from '../services/phoenixKey-api';
