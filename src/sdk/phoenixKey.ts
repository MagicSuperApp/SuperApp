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
import { phoenixKeyApi } from '../services/phoenixKey-api';
import { assertSupportedBackendDid } from '../services/phoenixDid';

export const STORAGE_USER_DID = 'phoenixkey_user_did';
export const KEY_ALIAS_OWNER = 'phoenixkey_owner_v1';

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
      const balance = await phoenixKeyApi.wallet.getBalance(did);
      return balance.balanceLamp > 0;
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
    const balance = await phoenixKeyApi.wallet.getBalance(did);
    return {
      isActivated: balance.balanceLamp > 0,
      magicCredits: balance.balanceMagic + balance.magicAccrued,
      lampTokens: balance.balanceLamp,
      adaBalance: balance.balanceLovelace / 1_000_000,
      address: balance.address ?? '',
      lastUpdated: Date.now(),
    };
  }

  async signData(payload: SignaturePayload): Promise<SignedData> {
    const canonical = canonicalize(payload);
    const dataHex = utf8ToHex(canonical);

    const exists = await nativeHasKey(KEY_ALIAS_OWNER);
    if (!exists) {
      throw new Error(
        'PhoenixKey owner key not enrolled. Run Genesis flow to register a keypair first.',
      );
    }

    const signature = await nativeSign(
      KEY_ALIAS_OWNER,
      dataHex,
      'Ký xác nhận',
      'Xác minh dữ liệu để gửi lên backend',
    );
    const publicKey = await nativeGetPublicKeyHex(KEY_ALIAS_OWNER);

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

export const isKeypairEnrolled = (): Promise<boolean> =>
  nativeHasKey(KEY_ALIAS_OWNER);

export const enrollKeypair = (): Promise<{
  alias: string;
  publicKeyHex: string;
}> => nativeGenerateKeypair(KEY_ALIAS_OWNER, true);

export const ownerPublicKey = (): Promise<string> =>
  nativeGetPublicKeyHex(KEY_ALIAS_OWNER);

export const signRaw = (
  dataHex: string,
  promptTitle: string,
  promptSubtitle?: string,
): Promise<string> =>
  nativeSign(KEY_ALIAS_OWNER, dataHex, promptTitle, promptSubtitle);

export const wipeIdentity = async (): Promise<void> => {
  try {
    await nativeDeleteKey(KEY_ALIAS_OWNER);
  } catch {
    /* key may already be gone — ignore */
  }
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
