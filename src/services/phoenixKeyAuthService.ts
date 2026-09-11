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
// Chuỗi hiển thị theo KHOÁ, không viết thẳng tiếng Việt vào mã dịch vụ — bốn thứ
// tiếng đi cùng nhau ở `i18n/keys/identity.ts`.
import { tk } from '../i18n/keys';
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
import { CARDANO_NETWORK as WALLET_NETWORK } from '../config/cardanoNetwork';

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
  username?: string,
): Promise<GenesisResult> => {
  if (await isKeypairEnrolled()) {
    if (intent === 'new-person') throw new DeviceHasOwnerKeyError();

    // Nếu keypair đã tồn tại nhưng JS storage bị mất (reinstall/update/cache clear),
    // đừng bắt user đăng xuất/tạo mới. Khôi phục local identity từ native key.
    const existing = await recoverLocalIdentityFromKey(biometricKind, username);
    if (existing.ok) return existing.value;

    // Nói ra LÝ DO. Câu cũ đúng nhưng rỗng — người dùng không biết nên thử lại
    // vân tay, đợi sóng, hay thật sự phải gọi hỗ trợ; và người nhận báo lỗi thực
    // địa cũng không lần ngược được về đâu.
    // Gắn `reason` LÊN lỗi. Màn hình cần nó để mở đúng lối thoát — với ca khoá bị
    // thu hồi thì một câu chữ là chưa đủ: người dùng phải bấm được sang màn 24 từ
    // ngay tại chỗ. Dò chuỗi tiếng Việt ở phía màn hình để đoán ra ca là cách làm
    // vỡ ngay khi đổi câu hoặc đổi ngôn ngữ.
    const failure = new Error(
      RECOVER_FAIL_MESSAGE[existing.reason] ?? RECOVER_FAIL_MESSAGE.khong_ro,
    ) as Error & { reason?: string };
    failure.reason = existing.reason;
    throw failure;
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

/** Tiền tố miền của cửa tra DID theo khoá. KHÁC `PHOENIXKEY_GENESIS:` của đăng ký. */
export const LOOKUP_PREFIX = 'PHOENIXKEY_LOOKUP:';

/**
 * Tra DID theo CHÍNH khoá trong chip máy này — `POST /identity/lookup`.
 *
 * Tách ra khỏi đường 1 của `recoverLocalIdentityFromKey` vì có NƠI THỨ HAI cần
 * đúng bước này: máy vừa được máy khác uỷ quyền (`devicePairService`) phải đổi khoá
 * lấy DID, và nó KHÔNG được phép đi tiếp xuống đường 3 (đường đó đăng ký một DID
 * MỚI). Chép lại chuỗi ký sang tệp kia là dựng một bản sao sẽ chết im lặng vào
 * ngày máy chủ đổi khuôn — nên hai nơi gọi CHUNG hàm này.
 *
 * NÉM nguyên lỗi ra ngoài, không nuốt 404: hai nơi gọi đọc 404 theo hai nghĩa khác
 * nhau (đường 1 ghép nó với câu trả lời của đường 3 để suy ra "khoá đã bị thu hồi";
 * luồng ghép máy đọc nó là "máy kia chưa duyệt xong"). Quyết hộ ở đây là lấy mất
 * của cả hai chỗ phần thông tin họ cần.
 *
 * Lời nhắc sinh trắc truyền vào, vì hai luồng nói hai việc khác nhau với người dùng.
 */
export const lookupDidByDeviceKey = async (
  promptTitle: string,
  promptSubtitle: string,
): Promise<string> => {
  const publicKeyHex = (await ownerPublicKey()).toLowerCase();
  const nonce = randomHexNonce();
  // ⚠ MIỀN KÝ RIÊNG — sai tiền tố thì máy chủ trả 404 và không có gì nói vì sao.
  const messageHex = utf8ToHex(`${LOOKUP_PREFIX}${publicKeyHex}:${nonce}`);
  const signatureHex = await signRaw(messageHex, promptTitle, promptSubtitle);

  const { userDid } = await phoenixKeyApi.identity.lookupByKey({
    publicKeyHex,
    nonce,
    signatureHex: signatureHex.toLowerCase(),
  });
  return assertSupportedBackendDid(userDid, 'PhoenixKey lookup-by-key userDid');
};

const recoverLocalIdentityFromKey = async (
  biometricKind: BiometricKind,
  username?: string,
): Promise<RecoverOutcome> => {
  /**
   * Đường 1 có trả lời "không thấy khoá này" không.
   *
   * Máy chủ CỐ Ý gộp ba ca vào cùng một 404 (chữ ký sai · chưa đăng ký · đã thu hồi)
   * nên riêng nó không kết luận được. Nhưng ghép với đường 3 thì suy ra được đúng một
   * ca — xem `khoa_bi_thu_hoi`.
   */
  let lookupSaidNotFound = false;

  /**
   * VÌ SAO PHẢI GIỮ LÝ DO CỦA ĐƯỜNG 1, KHÔNG CHỈ GIỮ MỖI 404.
   *
   * Đường 3 ở dưới suy luận dựa trên một TIỀN ĐỀ viết thẳng trong chú thích của nó:
   * "tới được đây nghĩa là đường 1 đã không ra DID nào; với khoá đã đăng ký thì
   * đường 1 phải thành công". Tiền đề ấy chỉ đúng khi đường 1 THẬT SỰ HỎI ĐƯỢC máy
   * chủ. Nó sai ở đúng ba ca hay gặp ngoài vườn, và trước bản này KHÔNG ca nào được
   * kiểm: người dùng bỏ qua hộp sinh trắc thứ hai · mất sóng giữa chừng · máy chủ
   * trả 5xx. Cả ba đều rơi xuống đường 3, nhận `3005` (khoá ĐÃ đăng ký), rồi báo
   * `can_ten_dang_nhap` — một câu nói về TÊN ĐĂNG NHẬP, trong khi thứ vừa hỏng
   * không liên quan gì tới tên.
   *
   * Người dùng thực địa đọc câu đó rồi xoá app cài lại, vì câu ấy không nói được
   * điều gì họ làm khác đi. Cài lại không gỡ được: Keychain giữ khoá qua lần cài.
   *
   * Nên giữ lại phân loại lỗi của đường 1 và ĐỐI CHIẾU với kết luận của đường 3.
   * `chua_chay` nghĩa là đường 1 chưa từng ném lỗi nào — khác hẳn "hỏng không rõ".
   */
  let duong1Loi = 'chua_chay';

  // ĐƯỜNG 1 — tra DID theo CHÍNH KHOÁ trong chip. Không hỏi tên đăng nhập.
  //
  // Đây là cửa `POST /identity/lookup` (PhoenixKey-Database #192, lên 18/08/2026,
  // commit `5f5cc95`). Đo trên prod 19/08: POST `{}` → 400, GET → 405 ⟹ route sống
  // và chỉ nhận POST; 400 chứ không 401 ⟹ nằm trong danh sách công khai, không Bearer.
  //
  // Ca nó cứu là CÀI LẠI APP — thứ vừa cắn ở thực địa: Keychain giữ khoá qua lần cài
  // lại, còn AsyncStorage (nơi lưu tên đăng nhập) bị xoá sạch. Trước bản này app không
  // còn gì để tra nên rơi thẳng xuống đường 3, nhận `KEY_ALREADY_REGISTERED`, rồi hiện
  // một câu đổ tội cho máy chủ về đúng cái cổng máy chủ dựng để chống cướp khoá.
  //
  // Ký challenge CHÍNH LÀ "khôi phục bằng vân tay/khuôn mặt": muốn ký thì phải mở khoá
  // trong Secure Enclave bằng sinh trắc. Không có gì để nhớ, không có gì để gõ.
  try {
    // Chuỗi ký + lượt gọi nằm ở `lookupDidByDeviceKey` — dùng CHUNG với luồng ghép
    // máy, xem chú thích ở đó. Ở đây chỉ còn phần riêng của đường 1.
    const did = await lookupDidByDeviceKey(
      'Khôi phục danh tính',
      'Xác thực để tìm lại danh tính của bạn trên máy này',
    );

    const user: AuthUser = { id: did, did, createdAt: Date.now(), updatedAt: Date.now() };
    await migrateLegacyDidStores(did, user, biometricKind);
    // `txHash` rỗng CÓ Ý: đường này không ghi gì lên chuỗi, chỉ nhận lại DID đã có.
    return { ok: true, value: { user, txHash: '' } };
  } catch (err) {
    // Máy chủ CỐ Ý trả 404 giống hệt nhau cho ba ca: chữ ký sai · khoá chưa đăng ký ·
    // khoá đã thu hồi. Nên KHÔNG được dịch 404 ở đây thành một nguyên nhân cụ thể —
    // chỉ ghi sổ rồi đi tiếp. Ca "khoá chưa từng đăng ký" là ca duy nhất đường 3 cứu
    // được, và nó cũng chính là ca hay gặp thứ hai (sinh khoá xong thì mất mạng).
    duong1Loi = describeRecoverFailure(err);
    rLog.info('identity_lookup_by_key_failed', {
      duong1Loi,
      raw: String(err).slice(0, 200),
    });
    // GIỮ LẠI việc "lookup nói không thấy". Một mình nó không kết luận được gì (404
    // gộp ba ca), nhưng ghép với câu trả lời của đường 3 thì SUY RA được — xem
    // `describeRecoverFailure` và chú thích ở `khoa_bi_thu_hoi`.
    if (err instanceof PhoenixKeyApiError && err.httpStatus === 404) lookupSaidNotFound = true;
  }

  // ĐƯỜNG 2 — tra DID qua TÊN ĐĂNG NHẬP rồi đối chiếu khoá.
  //
  // Giữ lại làm lưới đỡ cho ca đường 1 không dùng được (máy chủ ở môi trường khác chưa
  // có `/identity/lookup`, hoặc lỗi mạng đúng lúc). Nay nó KHÔNG còn là đường chính nên
  // không ai bị bắt phải nhớ tên đăng nhập nữa — đúng điều khối này vốn bị chê.
  //
  // KHÔNG hỏi sinh trắc lại ở đây: màn gọi tới đã hỏi ngay trước đó, và việc so khoá
  // này chỉ đọc khoá CÔNG KHAI trong chip — không mở gì, không ký gì.
  if (username && username.trim()) {
    try {
      const mine = (await ownerPublicKey()).toLowerCase();
      const { userDid } = await phoenixKeyApi.identity.resolveUsername(username.trim());
      const did = assertSupportedBackendDid(userDid, 'PhoenixKey lookup userDid');

      // HỎI THẲNG "khoá này có được uỷ quyền cho DID đó không", thay vì SO với khoá
      // mà `/pubkey` trả về. Phép so cũ sai theo hai chiều, và cả hai đều im lặng:
      //
      //  · `/pubkey` trả owner-key MỚI NHẤT và **không lọc trạng thái** — máy chủ ghi
      //    thẳng điều đó (`IdentityController.java:422-433`). Khoá đã thu hồi vẫn được
      //    trả về, nên so KHỚP không chứng minh khoá còn dùng được.
      //  · `/pubkey` chỉ trả MỘT khoá. Từ khi `POST /keys/authorize` cho một DID giữ
      //    nhiều khoá (đúng đường mà #233 cần), so LỆCH không chứng minh khoá là của
      //    người khác — nó có thể là khoá hợp lệ thứ hai của chính họ. Khi đó app nói
      //    "Tên đăng nhập này thuộc về một danh tính khác", một câu vừa sai vừa doạ.
      //
      // `key-authorized` trả đúng một boolean cho đúng câu hỏi đó.
      const { authorized } = await phoenixKeyApi.identity.keyAuthorized(did, mine);
      if (!authorized) return { ok: false, reason: 'ten_khong_khop_khoa' };

      const user: AuthUser = { id: did, did, createdAt: Date.now(), updatedAt: Date.now() };
      await migrateLegacyDidStores(did, user, biometricKind);
      // `txHash` rỗng CÓ Ý: đường này không ghi gì lên chuỗi, chỉ nhận lại DID đã có.
      // Bịa một mã giao dịch ở đây là nói dối về một việc chưa xảy ra.
      return { ok: true, value: { user, txHash: '' } };
    } catch (err) {
      // Tên chưa đăng ký (404) hay mất sóng thì rơi xuống đường 2 — nó sẽ trả về lý
      // do đúng của chính nó. Ghi lại để lần sau lần ngược được.
      rLog.info('identity_lookup_by_username_failed', { raw: String(err).slice(0, 200) });
    }
  }

  // ĐƯỜNG 3 — đăng ký lại bằng chính khoá cũ. Giữ lại cho ca máy có khoá mà khoá đó
  // CHƯA từng đăng ký lên máy chủ (sinh khoá xong thì mất mạng giữa chừng). Với khoá
  // đã đăng ký thì đường này chắc chắn trả lỗi, và nay lỗi đó có câu riêng.
  //
  // Tới được đây nghĩa là đường 1 (tra theo khoá) đã không ra DID nào. Với khoá đã
  // đăng ký thì đường 1 phải thành công, nên ca còn lại ở đây gần như chắc chắn là
  // khoá CHƯA từng lên máy chủ — đúng ca đường này sinh ra để cứu.
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
    let reason = describeRecoverFailure(err);

    // ── SUY RA "KHOÁ ĐÃ BỊ THU HỒI" ──────────────────────────────────────────
    // Hai cửa máy chủ dùng HAI truy vấn khác nhau trên cùng một chuỗi khoá:
    //   lookup   `findByPublicKeyHexAndStatus(hex, "active")`  → rỗng ⟹ 404
    //   register `existsByPublicKeyHex(hex)`  — KHÔNG lọc status → có ⟹ 3005
    // Một cửa không thấy, cửa kia thấy. Khác biệt duy nhất là `status`. Nên cặp
    // (404 ở lookup) + (3005 ở register) chỉ có một cách giải: khoá CÓ trong kho
    // nhưng KHÔNG còn `active` — tức đã bị thu hồi.
    //
    // Thu hồi ở đâu ra: khôi phục bằng 24 từ (Mode B) gọi `revokeOwnersByUserDid`
    // (`IdentityServiceImpl.java:337`), thu hồi TOÀN BỘ khoá owner cũ — kể cả khoá
    // đang nằm trong Secure Enclave của chính máy này.
    //
    // Từ lúc đó máy này vào ngõ cụt: lookup từ chối vì không `active`, register từ
    // chối vì khoá vẫn tồn tại. Xoá app cài lại KHÔNG gỡ được — khoá vẫn nguyên
    // trong Keychain và vẫn đang bị thu hồi. Lối ra duy nhất là 24 từ.
    //
    // ⚠ Đây là phép SUY LUẬN, không phải máy chủ nói. Nếu chữ ký lookup hỏng vì lý
    // do khác thì cũng ra 404 và rơi vào đây. Câu chữ vì thế nói "nhiều khả năng"
    // và vẫn chừa đường thử lại, chứ không phán chắc.
    // ── ĐỐI CHIẾU VỚI LÝ DO CỦA ĐƯỜNG 1 ──────────────────────────────────────
    // `3005` chỉ nói "khoá này đã đăng ký". Nó KHÔNG nói vì sao đường 1 không lấy
    // được DID cho chính khoá ấy — mà đó mới là thứ người dùng cần biết để làm
    // khác đi. Thứ tự dưới đây đi từ kết luận CHẮC nhất xuống kết luận yếu nhất:
    //
    //  1. đường 1 nhận 404  ⟹ khoá có trong kho nhưng không `active` ⟹ đã thu hồi.
    //  2. đường 1 hỏng vì CHƯA XÁC THỰC ⟹ người dùng bỏ qua hộp sinh trắc thứ hai.
    //     Đây là ca im lặng nhất: không lỗi mạng, không lỗi máy chủ, không gì trên
    //     màn hình nói rằng có một hộp thứ hai vừa bị bỏ qua.
    //  3. đường 1 hỏng vì MẤT MẠNG ⟹ dùng câu về sóng, đã có sẵn.
    //  4. còn lại ⟹ giữ nguyên `can_ten_dang_nhap`; tên đăng nhập vẫn là việc
    //     người dùng làm được ngay, nên câu đó vẫn là câu đúng nhất còn lại.
    reason = chonLyDoKhoiPhuc({ reason, lookupSaidNotFound, duong1Loi });

    console.warn('[PhoenixKey recover] failed:', err);
    rLog.error('identity_recover_failed', {
      reason, lookupSaidNotFound, duong1Loi, raw: String(err).slice(0, 300),
    });
    return { ok: false, reason };
  }
};

/**
 * Chọn LÝ DO cuối cùng, từ ba mảnh bằng chứng rời.
 *
 * Tách ra thành hàm THUẦN vì nó là một phép suy luận, không phải một bước của thủ
 * tục: nó không gọi mạng, không đọc chip, không ghi gì. Nằm lồng trong `catch` thì
 * không ghim được bằng phép kiểm, mà đây đúng là chỗ đã sai một lần ngoài thực địa.
 *
 * `reason` — kết luận của đường 3 (đăng ký lại).
 * `lookupSaidNotFound` — đường 1 có nhận 404 không.
 * `duong1Loi` — đường 1 hỏng vì gì, `'chua_chay'` nếu nó không ném lỗi nào.
 */
export const chonLyDoKhoiPhuc = ({
  reason,
  lookupSaidNotFound,
  duong1Loi,
}: {
  reason: string;
  lookupSaidNotFound: boolean;
  duong1Loi: string;
}): string => {
  // Chỉ can thiệp vào đúng một kết luận. Mọi lý do khác của đường 3 đều đã nói
  // đúng thứ nó biết, không có gì để đối chiếu thêm.
  if (reason !== 'can_ten_dang_nhap') return reason;

  if (lookupSaidNotFound) return 'khoa_bi_thu_hoi';
  if (duong1Loi === 'chua_xac_thuc') return 'duong1_chua_xac_thuc';
  if (duong1Loi === 'mat_mang') return 'mat_mang';
  return reason;
};

/**
 * Rút một câu NGẮN, người ngoài đọc được, từ lỗi thô — để đưa thẳng lên màn hình.
 *
 * Không dán nguyên `String(err)` lên màn: chuỗi lỗi mạng thường kèm URL và mã nội
 * bộ, người dùng đọc xong vẫn không biết phải làm gì. Nhưng cũng không nuốt: câu
 * thô vẫn đi vào `rLog` ở trên.
 */
const describeRecoverFailure = (err: unknown): string => {
  // MÃ SỐ TRƯỚC, CHUỖI SAU. Bản trước chỉ dò chuỗi trong `.message`, mà
  // `PhoenixKeyApiError` mang mã ở thuộc tính `.code` RIÊNG
  // (`phoenixKey-api.ts`) — hàm này không hề đọc tới. Hệ quả đo được ở thực địa
  // 19/08: máy chủ trả `KEY_ALREADY_REGISTERED` = mã **3005**, HTTP 409, kèm câu
  // tiếng Anh "Public key already registered" (`ErrorCode.java:215`). Chuỗi đó
  // KHÔNG chứa tên hằng nên nhánh 3005 phía dưới trượt, rồi rơi vào nhánh chung
  // và app hiện câu "đây là lỗi phía máy chủ" — đổ tội cho đúng cái cổng máy chủ
  // dựng để chống một máy khác cướp khoá của DID khác.
  //
  // Dò theo mã số thì không phụ thuộc ngôn ngữ máy chủ trả về. Giữ phần dò chuỗi
  // làm lưới đỡ cho lỗi KHÔNG phải từ API (huỷ sinh trắc, lỗi mạng tầng dưới).
  const api = err instanceof PhoenixKeyApiError ? err : null;
  if (api) {
    // 3005 = KEY_ALREADY_REGISTERED. Từ khi đường 1 (tra theo khoá) chạy, khoá đã
    // đăng ký sẽ được tìm ra ở đó; xuống tới đây kèm 3005 nghĩa là đường 1 không
    // hỏi được máy chủ (sóng) chứ không phải khoá có vấn đề.
    if (api.code === 3005) return 'can_ten_dang_nhap';
    if (api.httpStatus === 0) return 'mat_mang';
  }

  const m = String((err as { message?: string })?.message ?? err ?? '');
  if (/cancel|user_cancel|huỷ|huy/i.test(m)) return 'chua_xac_thuc';
  if (/network|timeout|ECONN|Network Error/i.test(m)) return 'mat_mang';
  if (/KEY_ALREADY_REGISTERED/i.test(m)) return 'can_ten_dang_nhap';
  if (/409|exist|registered|duplicate/i.test(m)) return 'can_ten_dang_nhap';
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
  // ⚠ NAY KHÔNG NHÁNH NÀO TRỎ TỚI ĐÂY NỮA, và đó là chủ đích. Câu này đổ tội cho
  // máy chủ về đúng cái cổng máy chủ dựng để chống cướp khoá (`KEY_ALREADY_REGISTERED`
  // = 3005). Thực địa 19/08 gặp nó vì phép dò chuỗi cũ bắt trúng chữ "registered"
  // trong câu tiếng Anh của máy chủ. Nay 3005 đi thẳng về `can_ten_dang_nhap`.
  //
  // Giữ khoá này lại thay vì xoá: chuỗi đang có bản dịch ở `i18n/phrases/errors.ts`,
  // và `RECOVER_FAIL_MESSAGE[reason]` tra động nên xoá đi mà còn chỗ nào gọi tên cũ
  // thì rơi về `khong_ro` một cách im lặng. ĐỪNG trỏ nhánh mới nào vào đây — nếu cần
  // một câu cho lỗi máy chủ thật thì viết câu mới, đừng mượn câu này.
  may_chu_tu_choi:
    'Máy chủ từ chối mở lại danh tính cho khoá đã có trên máy này. Đây là lỗi phía máy chủ — chụp màn hình này gửi hỗ trợ.',
  did_sai_dinh_dang:
    'Máy chủ trả về một mã danh tính app chưa hiểu được. Đây là lỗi phía máy chủ — chụp màn hình này gửi hỗ trợ.',
  can_ten_dang_nhap:
    'Máy này đã có khoá của một danh tính đã tạo trước đó. Nhập lại đúng tên đăng nhập của danh tính đó để mở lại trên máy này.',
  // Ca này TRƯỚC ĐÂY đội lốt `can_ten_dang_nhap` và đó là chỗ đắt nhất: người dùng
  // được bảo đi sửa tên đăng nhập, trong khi thứ vừa hỏng là một hộp sinh trắc mà
  // họ còn không biết là có. Câu phải gọi đúng tên hộp đó, vì trên màn hình nó là
  // thứ duy nhất phân biệt được lần hỏi thứ nhất với lần thứ hai.
  duong1_chua_xac_thuc:
    'Máy này đã có danh tính của bạn, nhưng bước xác thực để mở lại chưa xong. Bấm lại và làm hết CẢ HAI lần hỏi vân tay hoặc khuôn mặt — lần thứ hai có tên "Khôi phục danh tính".',
  // Ca NGÕ CỤT: khoá còn trong máy nhưng máy chủ đã thu hồi nó, nên không cửa nào
  // nhận. Xoá app cài lại KHÔNG gỡ được — phải nói thẳng, nếu không người dùng sẽ
  // cài lại lần thứ ba, thứ tư.
  //
  // CÂU CŨ NÓI "lối ra duy nhất là 24 từ", VÀ ĐÓ LÀ MỘT LỐI RA KHÔNG TỒN TẠI với
  // phần lớn người đọc nó: app chưa bao giờ bắt ai ghi lại 24 từ — `SeedExportScreen`
  // là màn tự nguyện và nằm SAU lớp đăng nhập, tức đúng người đang kẹt ở đây là
  // người không vào lấy được. Chỉ vào một thứ họ không có thì câu ấy chính là ngõ
  // cụt mà nó đang mô tả.
  //
  // Thứ máy này CÓ: Master_KEK vẫn nằm trong kho khoá (kho khoá sống qua lần xoá
  // app, AsyncStorage thì không) — cùng một bí mật mà 24 từ dùng để dựng lại. Nên
  // màn khôi phục dò kho khoá rồi mở lối "khôi phục bằng ví trên máy", chỉ cần tên
  // đăng nhập. Câu này vì thế chỉ tới MÀN, không chỉ tới phương tiện.
  khoa_bi_thu_hoi:
    'Khoá trên máy này đã bị thu hồi, nhiều khả năng do trước đó có một lần khôi phục ở nơi khác. Cài lại ứng dụng không mở lại được. Hãy mở màn Khôi phục danh tính: nếu ví của bạn còn trong máy thì chỉ cần tên đăng nhập, không cần 24 từ.',
  ten_khong_khop_khoa:
    'Tên đăng nhập này thuộc về một danh tính khác, không phải danh tính đang có khoá trên máy. Kiểm tra lại tên, hoặc dùng máy đã tạo danh tính đó.',
  khong_ro:
    'Máy này đã có khoá nhưng chưa mở lại được danh tính, chưa rõ vì sao. Thử lại một lần; nếu vẫn vậy, chụp màn hình này gửi hỗ trợ.',
};

/**
 * Mã lỗi lúc ĐĂNG KÝ → câu người đọc được.
 *
 * XUẤT RA để bài kiểm ghim từng nhánh. Riêng cặp 1403/1405 đáng một bài: chúng là
 * hai NGUYÊN NHÂN khác hẳn nhau mà máy chủ mới tách ra, và trỏ nhầm thì người dùng
 * vẫn thấy một câu trơn tru — không ngoại lệ, không màu đỏ ở đâu.
 */
export const friendlyRegisterError = (err: unknown): string => {
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
      return tk('identity.err.badSignature.title') + ' ' + tk('identity.err.badSignature.body');
    // 1405 = LỆCH GIỜ, tách khỏi 1403 ở máy chủ (issue #274). Hai lỗi này người
    // dùng xử lý khác hẳn nhau: 1403 thì thử lại, 1405 thì phải đi sửa đồng hồ —
    // và ai đọc "chữ ký không hợp lệ" cho ca lệch giờ sẽ thử lại tới khi bỏ cuộc,
    // vì thứ hỏng nằm ở Cài đặt chứ không ở app.
    case 1405:
      return tk('identity.err.clockSkew.title') + ' ' + tk('identity.err.clockSkew.body');
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

/**
 * Nonce hex ngẫu nhiên cho challenge lookup.
 *
 * Máy chủ ép `^[0-9a-f]{16,128}$` (`IdentityLookupDtos.java`). Dùng 32 ký tự = 128 bit:
 * đủ để hai máy không đụng nonce, mà vẫn gọn. Nonce chỉ chống phát lại trong phạm vi
 * MỘT khoá công khai nên không cần nguồn ngẫu nhiên cấp mật mã — nhưng cũng đừng dùng
 * thời gian trần, vì hai lượt bấm liền nhau trong cùng mili-giây sẽ ra trùng.
 */
const randomHexNonce = (): string => {
  let out = '';
  while (out.length < 32) {
    out += Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  }
  return out.slice(0, 32);
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
