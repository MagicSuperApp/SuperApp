/**
 * PhoenixKey auth service — high-level Genesis + Unlock flows.
 *
 * Returns AuthUser shape compatible with existing app stores.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type BiometricKind = 'face' | 'fingerprint' | 'strong';

export interface AuthUser {
  id: string;
  did: string;
  name?: string;
  phone?: string;
  email?: string;
  walletAddress?: string;
  createdAt?: number;
  updatedAt?: number;
}

import phoenixKeySDK, {
  KEY_ALIAS_OWNER,
  STORAGE_USER_DID,
  currentUserDid,
  enrollKeypair,
  isKeypairEnrolled,
  ownerPublicKey,
  saveUserDid,
  signRaw,
  wipeIdentity,
} from '../sdk/phoenixKey';
import { phoenixKeyApi, PhoenixKeyApiError } from './phoenixKey-api';
import {
  assertSupportedBackendDid,
  isMalformedPhoenixDid,
  isSupportedBackendDid,
} from './phoenixDid';
import taad from '../sdk/taadEnclave';
import { getOrCreateMasterKek } from './masterKekStore';

const DID_USERS_KEY = 'did_users';
const BIOMETRIC_DID_KEY = 'biometric_did_map';

// Mạng Cardano cho địa chỉ ví derive từ Master_KEK. 0 = preprod (testnet, mặc
// định giai đoạn test, khớp Enclave), 1 = mainnet. Đổi khi lên production.
const WALLET_NETWORK = 0;

/**
 * Trường ví Master_KEK gắn kèm register (ADDITIVE). Lấy/sinh KEK → derive
 * TAAD_Key (Ed25519) + địa chỉ Cardano account-0. NON-BLOCKING: nếu Rust core
 * chưa sẵn (build cũ) hoặc derive lỗi → trả {} → register DID như cũ (chỉ HW_Key),
 * did_auth không bị ảnh hưởng.
 */
const deriveWalletRegisterFields = async (): Promise<{
  taadPublicKeyHex?: string;
  walletAddress?: string;
  entityType?: 'person';
}> => {
  if (!taad.isAvailable()) return {};
  try {
    const kek = await getOrCreateMasterKek();
    const taadPublicKeyHex = await taad.deriveTaadPubkey(kek);
    const walletAddress = await taad.deriveWalletAddress(kek, 0, WALLET_NETWORK);
    if (!taadPublicKeyHex || !walletAddress) return {};
    return { taadPublicKeyHex, walletAddress, entityType: 'person' };
  } catch (e) {
    console.warn('[PhoenixKey] derive ví từ KEK lỗi (bỏ qua, register chỉ HW_Key):', e);
    return {};
  }
};

interface GenesisResult {
  user: AuthUser;
  txHash: string;
}

export const registerIdentity = async (
  biometricKind: BiometricKind,
): Promise<GenesisResult> => {
  if (await isKeypairEnrolled()) {
    // Nếu keypair đã tồn tại nhưng JS storage bị mất (reinstall/update/cache clear),
    // đừng bắt user đăng xuất/tạo mới. Khôi phục local identity từ native key.
    const existing = await recoverLocalIdentityFromKey(biometricKind);
    if (existing) return existing;

    throw new Error(
      'Thiết bị đã có khóa PhoenixKey nhưng chưa khôi phục được danh tính. Vui lòng thử đăng nhập lại hoặc liên hệ hỗ trợ.',
    );
  }

  const { publicKeyHex } = await enrollKeypair();
  const genesisMessage = `PHOENIXKEY_GENESIS:${publicKeyHex}`;
  const messageHex = utf8ToHex(genesisMessage);

  const signature = await signRaw(
    messageHex,
    'Tạo danh tính mới',
    'Ký bằng khóa phần cứng vừa sinh',
  );

  // ADDITIVE: gắn ví Master_KEK (TAAD_Key + địa chỉ Cardano). Bỏ qua nếu lỗi.
  const walletFields = await deriveWalletRegisterFields();

  let userDid: string;
  let txHash: string;
  try {
    const res = await phoenixKeyApi.identity.register({
      publicKeyHex,
      keyOrigin: 'SECURE_ENCLAVE',
      keyRole: 'owner',
      addedBySignature: signature,
      ...walletFields,
    });
    userDid = assertSupportedBackendDid(res.userDid, 'PhoenixKey register userDid');
    txHash = res.txHash;
  } catch (err) {
    await wipeIdentity();
    throw new Error(friendlyRegisterError(err));
  }

  await saveUserDid(userDid);
  const user: AuthUser = {
    id: userDid,
    did: userDid,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await persistLegacyStores(user, biometricKind);
  return { user, txHash };
};

export const unlockExistingIdentity = async (): Promise<AuthUser | null> => {
  const [did, hasKey] = await Promise.all([
    currentUserDid(),
    isKeypairEnrolled(),
  ]);
  if (!did || !hasKey) return null;
  if (!isSupportedBackendDid(did)) {
    if (isMalformedPhoenixDid(did)) {
      const recovered = await recoverLocalIdentityFromKey('strong');
      if (recovered) return recovered.user;
    }
    console.warn('[PhoenixKey unlock] invalid stored DID, refusing local unlock:', did);
    return null;
  }

  const users = await loadDidUsers();
  const stored = users[did];
  if (stored) return stored;

  const user: AuthUser = { id: did, did, updatedAt: Date.now() };
  await saveDidUser(user);
  return user;
};

export const hasLocalIdentity = async (): Promise<boolean> => {
  const [did, hasKey] = await Promise.all([
    currentUserDid(),
    isKeypairEnrolled(),
  ]);
  return !!did && hasKey;
};

export const phoenixKeyAuth = {
  registerIdentity,
  unlockExistingIdentity,
  hasLocalIdentity,
  ownerPublicKey,
  wipeIdentity,
  sdk: phoenixKeySDK,
  keyAlias: KEY_ALIAS_OWNER,
  storageUserDid: STORAGE_USER_DID,
};

const recoverLocalIdentityFromKey = async (
  biometricKind: BiometricKind,
): Promise<GenesisResult | null> => {
  try {
    const publicKeyHex = await ownerPublicKey();
    const genesisMessage = `PHOENIXKEY_GENESIS:${publicKeyHex}`;
    const messageHex = utf8ToHex(genesisMessage);
    const signature = await signRaw(
      messageHex,
      'Khôi phục danh tính PhoenixKey',
      'Xác thực để khôi phục danh tính trên thiết bị này',
    );

    const walletFields = await deriveWalletRegisterFields();
    const res = await phoenixKeyApi.identity.register({
      publicKeyHex,
      keyOrigin: 'SECURE_ENCLAVE',
      keyRole: 'owner',
      addedBySignature: signature,
      ...walletFields,
    });
    const userDid = assertSupportedBackendDid(res.userDid, 'PhoenixKey recovered userDid');
    const user: AuthUser = {
      id: userDid,
      did: userDid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await migrateLegacyDidStores(userDid, user, biometricKind);

    return { user, txHash: res.txHash };
  } catch (err) {
    console.warn('[PhoenixKey recover] failed:', err);
    return null;
  }
};

const friendlyRegisterError = (err: unknown): string => {
  console.warn('[PhoenixKey register] failed:', err);

  if (!(err instanceof PhoenixKeyApiError)) {
    return 'Không tạo được danh tính. Vui lòng thử lại.';
  }
  if (err.code === -1 || err.httpStatus === 0) {
    return 'Mất kết nối. Thử lại sau.';
  }
  if (err.httpStatus === 502 || err.httpStatus === 504) {
    return 'Mạng Cardano chậm. Đợi 1 phút rồi mở app lại.';
  }
  switch (err.code) {
    case 1403:
      return 'Chữ ký không hợp lệ. Thử lại.';
    case 5101:
      return 'Blockchain bận. Thử lại sau vài phút.';
    case 9800:
      return 'App phiên bản cũ. Cập nhật rồi thử lại.';
    case 9999:
      return 'Server lỗi. Thử lại sau.';
    default:
      return 'Tạo danh tính thất bại. Thử lại.';
  }
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

const loadDidUsers = async (): Promise<Record<string, AuthUser>> => {
  try {
    const raw = await AsyncStorage.getItem(DID_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveDidUser = async (user: AuthUser): Promise<void> => {
  const users = await loadDidUsers();
  users[user.did] = user;
  await AsyncStorage.setItem(DID_USERS_KEY, JSON.stringify(users));
};

const persistLegacyStores = async (
  user: AuthUser,
  biometricKind: BiometricKind,
): Promise<void> => {
  await saveDidUser(user);
  try {
    const raw = await AsyncStorage.getItem(BIOMETRIC_DID_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    map[biometricKind] = user.did;
    await AsyncStorage.setItem(BIOMETRIC_DID_KEY, JSON.stringify(map));
  } catch {
    /* non-fatal */
  }
};

const migrateLegacyDidStores = async (
  userDid: string,
  user: AuthUser,
  biometricKind: BiometricKind,
): Promise<void> => {
  await saveUserDid(userDid);
  await persistLegacyStores(user, biometricKind);

  try {
    const raw = await AsyncStorage.getItem(DID_USERS_KEY);
    const users: Record<string, AuthUser> = raw ? JSON.parse(raw) : {};
    for (const key of Object.keys(users)) {
      if (isMalformedPhoenixDid(key)) {
        delete users[key];
      }
    }
    users[userDid] = user;
    await AsyncStorage.setItem(DID_USERS_KEY, JSON.stringify(users));
  } catch {
    /* non-fatal */
  }

  try {
    const raw = await AsyncStorage.getItem(BIOMETRIC_DID_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    for (const [kind, did] of Object.entries(map)) {
      if (isMalformedPhoenixDid(did)) {
        map[kind] = userDid;
      }
    }
    map[biometricKind] = userDid;
    await AsyncStorage.setItem(BIOMETRIC_DID_KEY, JSON.stringify(map));
  } catch {
    /* non-fatal */
  }
};
