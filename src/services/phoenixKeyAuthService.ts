/**
 * PhoenixKey auth service — high-level Genesis + Unlock flows.
 *
 * Returns AuthUser shape compatible with existing app stores.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BiometryTypes } from 'react-native-biometrics';
import rLog from './remoteLogger';

export type BiometricKind = 'face' | 'fingerprint' | 'strong';

/**
 * Suy `BiometricKind` từ cảm biến THẬT của máy (`isSensorAvailable().biometryType`).
 *
 * KHÔNG suy từ nút người dùng bấm. `simplePrompt()` không nhận tham số chọn
 * phương thức — hệ điều hành tự dùng thứ đang khai trên máy đó, nên "người dùng
 * chọn khuôn mặt hay vân tay" chưa bao giờ là chuyện có thật:
 *   • iOS  — mỗi máy chỉ có MỘT loại (Face ID hoặc Touch ID), không có gì để chọn.
 *   • Android — `BiometricPrompt` chọn theo ĐỘ MẠNH (BIOMETRIC_STRONG/WEAK), cố ý
 *     không cho ứng dụng ép người dùng dùng bộ phận cơ thể nào.
 *
 * `Biometrics` (Android gộp chung) và lúc chưa dò xong đều về `'strong'` — đúng
 * với thứ nền tảng thật sự hứa: một cảm biến đủ mạnh, không nói rõ là cái gì.
 */
export const biometricKindFromType = (
  biometryType?: string | null,
): BiometricKind =>
  biometryType === BiometryTypes.FaceID
    ? 'face'
    : biometryType === BiometryTypes.TouchID
    ? 'fingerprint'
    : 'strong';

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
  entityType?: 'PERSON';
}> => {
  if (!taad.isAvailable()) return {};
  try {
    const kek = await getOrCreateMasterKek();
    const taadPublicKeyHex = await taad.deriveTaadPubkey(kek);
    const walletAddress = await taad.deriveWalletAddress(kek, 0, WALLET_NETWORK);
    if (!taadPublicKeyHex || !walletAddress) return {};
    // Backend DidType enum là CHỮ HOA (PERSON/ORG/...). Gửi 'person' → 400 malformed
    // (Cannot deserialize entity_type). PHẢI 'PERSON'.
    return { taadPublicKeyHex, walletAddress, entityType: 'PERSON' };
  } catch (e) {
    console.warn('[PhoenixKey] derive ví từ KEK lỗi (bỏ qua, register chỉ HW_Key):', e);
    return {};
  }
};

interface GenesisResult {
  user: AuthUser;
  txHash: string;
}

/**
 * Máy đã có khoá chủ trong chip, nhưng người đang đứng trước máy vừa tự khai là
 * NGƯỜI MỚI (bấm "Đăng ký", nhập username mới).
 *
 * VÌ SAO PHẢI NÉM RA CHỨ KHÔNG ÂM THẦM KHÔI PHỤC — `isKeypairEnrolled()` chỉ trả
 * lời được "máy này đã có khoá chưa", KHÔNG trả lời được "người đang cầm máy có
 * phải chủ khoá đó không". Hai tình huống rất khác nhau lại cho cùng một tín hiệu:
 *   (a) chính chủ cài lại app / xoá cache  → khôi phục là ĐÚNG;
 *   (b) người thứ hai mượn máy đăng ký     → khôi phục là TRAO NHẦM DANH TÍNH.
 * Trước bản này app luôn chọn (a). Hệ quả ngoài vườn: người thứ hai nhận LẠI DID
 * của người thứ nhất, hai người thành MỘT tài khoản trên máy chủ — thấy hết ảnh,
 * GPS vườn, nhật ký chăm sóc của nhau, và xoá được cây của nhau.
 *
 * Máy không tự phân biệt được thì phải HỎI. Lỗi này là cái cớ để màn hình hỏi.
 */
export class DeviceHasOwnerKeyError extends Error {
  readonly code = 'DEVICE_HAS_OWNER_KEY';
  constructor() {
    super('Máy này đã có một danh tính được tạo trước đó.');
    this.name = 'DeviceHasOwnerKeyError';
  }
}

/**
 * `resume`     — mặc định: khoá cũ nghĩa là chính người này quay lại (cài lại app,
 *                xoá cache). Giữ nguyên hành vi cũ cho mọi nơi gọi đang có.
 * `new-person` — người đứng trước máy tự khai là người MỚI. Gặp khoá cũ thì DỪNG
 *                và ném `DeviceHasOwnerKeyError` để màn hình hỏi lại, không đoán.
 */
export type RegisterIntent = 'resume' | 'new-person';

export const registerIdentity = async (
  biometricKind: BiometricKind,
  intent: RegisterIntent = 'resume',
): Promise<GenesisResult> => {
  if (await isKeypairEnrolled()) {
    if (intent === 'new-person') throw new DeviceHasOwnerKeyError();

    // Nếu keypair đã tồn tại nhưng JS storage bị mất (reinstall/update/cache clear),
    // đừng bắt user đăng xuất/tạo mới. Khôi phục local identity từ native key.
    const existing = await recoverLocalIdentityFromKey(biometricKind);
    if (existing.ok) return existing.value;

    // Nói ra LÝ DO. Câu cũ đúng nhưng rỗng — người dùng không biết nên thử lại
    // vân tay, đợi sóng, hay thật sự phải gọi hỗ trợ; và người nhận báo lỗi thực
    // địa cũng không lần ngược được về đâu.
    throw new Error(
      RECOVER_FAIL_MESSAGE[existing.reason] ?? RECOVER_FAIL_MESSAGE.khong_ro,
    );
  }

  const { publicKeyHex } = await enrollKeypair();
  const genesisMessage = `PHOENIXKEY_GENESIS:${publicKeyHex}`;
  const messageHex = utf8ToHex(genesisMessage);

  const signature = await signRaw(
    messageHex,
    'Create a new identity',
    'Sign to create a new PhoenixKey identity on this device',
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
      if (recovered.ok) return recovered.value.user;
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

/**
 * DID hiện tại CÓ tồn-tại trên PhoenixKey directory không (probe /identity/{did}/pubkey).
 * - `true`  : có (HTTP 200).
 * - `false` : chắc-chắn KHÔNG (HTTP 404 — DID mồ côi, vd server đã clean data).
 * - `null`  : không xác-định (mạng lỗi / DID local trống) → KHÔNG kết-luận mồ côi để
 *             tránh bắt user đăng-ký lại oan khi chỉ mất mạng tạm.
 *
 * Vì sao cần: khi server PhoenixKey bị reset, máy vẫn giữ DID+khoá local → OriLife
 * verify resolve DID thất-bại (503). Probe này phân-biệt "DID mồ côi" với "server bận".
 */
export const isIdentityRegisteredOnServer = async (): Promise<boolean | null> => {
  const did = await currentUserDid();
  if (!did) return null;
  try {
    await phoenixKeyApi.identity.getPubkey(did);
    return true;
  } catch (err) {
    if (err instanceof PhoenixKeyApiError && err.httpStatus === 404) return false;
    return null; // lỗi khác (mạng/5xx) → không kết-luận
  }
};

/**
 * Đăng-ký LẠI danh-tính khi DID cũ mồ côi (server đã reset). Vì keypair cũ vẫn còn,
 * registerIdentity sẽ "recover" DID cũ → phải WIPE trước để sinh khoá + DID MỚI,
 * ghi genesis mới lên PhoenixKey. Trả GenesisResult (user DID mới + txHash).
 *
 * ⚠️ Tạo DID MỚI — dữ-liệu gắn DID cũ (nếu có) không tự chuyển sang. Chấp-nhận được
 * sau khi server đã clean (DID cũ dù sao cũng không còn resolve được).
 */
export const reRegisterIdentity = async (
  biometricKind: BiometricKind,
): Promise<GenesisResult> => {
  await wipeIdentity();
  return registerIdentity(biometricKind);
};

export const phoenixKeyAuth = {
  registerIdentity,
  reRegisterIdentity,
  DeviceHasOwnerKeyError,
  isIdentityRegisteredOnServer,
  unlockExistingIdentity,
  hasLocalIdentity,
  ownerPublicKey,
  wipeIdentity,
  sdk: phoenixKeySDK,
  keyAlias: KEY_ALIAS_OWNER,
  storageUserDid: STORAGE_USER_DID,
};

/**
 * Kết quả khôi phục — có LÝ DO khi hỏng.
 *
 * Vì sao không trả `null` như trước: ngoài vườn người dùng chỉ thấy đúng một câu
 * "Thiết bị đã có khoá nhưng chưa khôi phục được danh tính", còn lý do thật thì
 * nằm trong `console.warn` — thứ không ai đọc được trên máy đã cài qua TestFlight.
 * Ba nguyên nhân rất khác nhau (người dùng huỷ vân tay · máy chủ từ chối đăng ký
 * lại khoá cũ · DID máy chủ trả về sai định dạng) đều cho CÙNG một câu, nên báo
 * lỗi thực địa không lần ngược được. Nay lý do đi theo kết quả.
 */
type RecoverOutcome =
  | { ok: true; value: GenesisResult }
  | { ok: false; reason: string };

const recoverLocalIdentityFromKey = async (
  biometricKind: BiometricKind,
): Promise<RecoverOutcome> => {
  try {
    const publicKeyHex = await ownerPublicKey();
    const genesisMessage = `PHOENIXKEY_GENESIS:${publicKeyHex}`;
    const messageHex = utf8ToHex(genesisMessage);
    const signature = await signRaw(
      messageHex,
      'Khôi phục danh tính',
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

    return { ok: true, value: { user, txHash: res.txHash } };
  } catch (err) {
    const reason = describeRecoverFailure(err);
    console.warn('[PhoenixKey recover] failed:', err);
    rLog.error('identity_recover_failed', { reason, raw: String(err).slice(0, 300) });
    return { ok: false, reason };
  }
};

/**
 * Rút một câu NGẮN, người ngoài đọc được, từ lỗi thô — để đưa thẳng lên màn hình.
 *
 * Không dán nguyên `String(err)` lên màn: chuỗi lỗi mạng thường kèm URL và mã nội
 * bộ, người dùng đọc xong vẫn không biết phải làm gì. Nhưng cũng không nuốt: câu
 * thô vẫn đi vào `rLog` ở trên.
 */
const describeRecoverFailure = (err: unknown): string => {
  const m = String((err as { message?: string })?.message ?? err ?? '');
  if (/cancel|user_cancel|huỷ|huy/i.test(m)) return 'chua_xac_thuc';
  if (/network|timeout|ECONN|Network Error/i.test(m)) return 'mat_mang';
  if (/409|exist|registered|duplicate/i.test(m)) return 'may_chu_tu_choi';
  if (/did/i.test(m)) return 'did_sai_dinh_dang';
  return 'khong_ro';
};

/**
 * Mỗi lý do → MỘT câu hoàn chỉnh, vì từ điển tra theo NGUYÊN chuỗi
 * (`src/i18n/translate.ts`). Ghép chuỗi lúc chạy thì không câu nào khớp từ điển
 * và người dùng tiếng Anh/Trung/Nhật lãnh nguyên tiếng Việt. Năm câu dưới đây
 * đều có bản dịch ở `src/i18n/phrases/errors.ts`.
 *
 * Câu nào cũng phải nói được BƯỚC TIẾP THEO — "liên hệ hỗ trợ" một mình là câu
 * cụt, ngoài vườn không ai gọi được ai.
 */
const RECOVER_FAIL_MESSAGE: Record<string, string> = {
  chua_xac_thuc:
    'Chưa xác thực được vân tay hoặc khuôn mặt nên không mở lại được danh tính trên máy này. Thử lại và giữ ngón tay tới khi máy báo xong.',
  mat_mang:
    'Máy này đã có khoá, nhưng chưa liên lạc được máy chủ danh tính để mở lại. Kiểm tra sóng rồi thử lại.',
  may_chu_tu_choi:
    'Máy chủ từ chối mở lại danh tính cho khoá đã có trên máy này. Đây là lỗi phía máy chủ — chụp màn hình này gửi hỗ trợ.',
  did_sai_dinh_dang:
    'Máy chủ trả về một mã danh tính app chưa hiểu được. Đây là lỗi phía máy chủ — chụp màn hình này gửi hỗ trợ.',
  khong_ro:
    'Máy này đã có khoá nhưng chưa mở lại được danh tính, chưa rõ vì sao. Thử lại một lần; nếu vẫn vậy, chụp màn hình này gửi hỗ trợ.',
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
    pruneOtherKindsForDid(map, user.did, biometricKind);
    map[biometricKind] = user.did;
    await AsyncStorage.setItem(BIOMETRIC_DID_KEY, JSON.stringify(map));
  } catch {
    /* non-fatal */
  }
};

/**
 * Một DID = MỘT bản ghi trong `biometric_did_map`.
 *
 * Bản cũ ghi CẢ `face` lẫn `fingerprint` cho cùng một DID, làm map trông như
 * người dùng có hai lựa chọn tách rời — trong khi bật một cái là bật cả hai.
 * Dọn các khoá loại khác trỏ về cùng DID trước khi ghi loại cảm biến thật.
 *
 * Đây chỉ là dọn phía GHI. Đường ĐỌC (`Object.values(map).includes(did)`) vẫn
 * quét theo giá trị nên máy đã cài từ bản cũ không phải bật lại.
 */
const pruneOtherKindsForDid = (
  map: Record<string, string>,
  did: string,
  keep: BiometricKind,
): void => {
  for (const kind of Object.keys(map)) {
    if (kind !== keep && map[kind] === did) delete map[kind];
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
    // Vá DID hỏng ở trên có thể để lại nhiều khoá cùng trỏ về DID mới → gộp lại.
    pruneOtherKindsForDid(map, userDid, biometricKind);
    map[biometricKind] = userDid;
    await AsyncStorage.setItem(BIOMETRIC_DID_KEY, JSON.stringify(map));
  } catch {
    /* non-fatal */
  }
};
