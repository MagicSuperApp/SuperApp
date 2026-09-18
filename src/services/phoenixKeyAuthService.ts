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
import { PhoenixKeyNativeError } from './phoenixKey-native';
// Chuỗi hiển thị theo KHOÁ, không viết thẳng tiếng Việt vào mã dịch vụ — bốn thứ
// tiếng đi cùng nhau ở `i18n/keys/identity.ts`.
import { tk } from '../i18n/keys';
import {
  assertSupportedBackendDid,
  isMalformedPhoenixDid,
  isSupportedBackendDid,
} from './phoenixDid';
import taad, { isCoreUnavailableError } from '../sdk/taadEnclave';
import { getOrCreateMasterKek } from './masterKekStore';

const DID_USERS_KEY = 'did_users';
const BIOMETRIC_DID_KEY = 'biometric_did_map';

// Mạng Cardano cho địa chỉ ví derive từ Master_KEK. 0 = preprod (testnet, mặc
// định giai đoạn test, khớp Enclave), 1 = mainnet. Đổi khi lên production.
import { CARDANO_NETWORK as WALLET_NETWORK } from '../config/cardanoNetwork';

/**
 * Vì sao hai ca này KHÔNG gộp làm một, dù cùng dẫn tới "không đăng ký được":
 * chúng đòi người dùng làm hai việc KHÁC HẲN nhau. `core_missing` là bản app
 * thiếu lõi mã hoá — bấm lại một nghìn lần cũng y nguyên, phải cập nhật app.
 * `derive_failed` là lõi có mặt nhưng lần này hỏng — thử lại là việc đúng.
 * Gộp lại thì một trong hai nhóm người nhận lời khuyên vô dụng.
 *
 * (Tên trạng thái viết tiếng Anh theo quy ước định danh; các khoá lý do cũ trong
 * `RECOVER_FAIL_MESSAGE` phía dưới có trước quy ước đó nên giữ nguyên.)
 */
export type TaadKeyBlockReason = 'core_missing' | 'derive_failed';

/**
 * Không suy được khoá TAAD ⟹ KHÔNG đăng ký. Lỗi này là CỔNG, không phải cảnh báo.
 *
 * ── Vì sao chặn, dù chặn nghĩa là người dùng không tạo được tài khoản lúc này ──
 * Khoá TAAD được ghi vào máy chủ ĐÚNG MỘT LẦN, trong chính giao dịch khai sinh của
 * lượt đăng ký. Không có đường bổ sung về sau, và đường khôi phục bằng 24 từ đọc
 * đúng bảng đó rồi từ chối khi không thấy. (Dữ kiện do nhà giữ máy chủ đo và gửi
 * sang 2026-09-14; nhà này không có quyền đọc mã máy chủ để tự đo lại.)
 *
 * Nên một lượt đăng ký thiếu khoá TAAD không phải "tài khoản thiếu một tính năng"
 * — nó là **một danh tính không khôi phục được, vĩnh viễn**, trao cho người dùng
 * mà họ không biết, và chỉ lộ ra vào đúng ngày họ mất máy, tức lúc đã hết đường.
 * Bản trước trả `{}` ở cả ba nhánh hỏng rồi đăng ký tiếp, im lặng.
 *
 * Đổi một lượt đăng ký trượt CÓ CÂU GIẢI THÍCH lấy một danh tính chết KHÔNG AI
 * BÁO là đổi đúng chiều.
 */
export class TaadKeyUnavailableError extends Error {
  readonly code = 'TAAD_KEY_UNAVAILABLE';
  readonly reason: TaadKeyBlockReason;
  constructor(reason: TaadKeyBlockReason, cause?: unknown) {
    // Mượn ĐÚNG câu mà đường khôi phục dùng, thay vì viết câu thứ hai cho cùng một
    // sự việc. Hai đường tới đây — đăng ký mới ném thẳng lỗi này lên màn hình, còn
    // đường khôi phục tra `RECOVER_FAIL_MESSAGE[reason]` — nên hai câu rời nhau sẽ
    // trôi ra khỏi nhau đúng lúc ai đó sửa một bên; và bản dịch thì chỉ có một bản.
    super(RECOVER_FAIL_MESSAGE[reason]);
    this.name = 'TaadKeyUnavailableError';
    this.reason = reason;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Trường ví Master_KEK gắn kèm register. BẮT BUỘC: hỏng thì ném
 * `TaadKeyUnavailableError`, KHÔNG trả về một bộ trường khuyết.
 *
 * Tên hàm đổi từ `derive…` sang `require…` là có chủ đích: chỗ gọi phải đọc ra
 * được rằng đây là điều kiện, không phải phần thêm nếm.
 */
const requireWalletRegisterFields = async (): Promise<{
  taadPublicKeyHex: string;
  walletAddress: string;
  entityType: 'PERSON';
}> => {
  if (!taad.isAvailable()) {
    rLog.error('register_taad_key_blocked', { giai_doan: 'khong_co_cau_native' });
    throw new TaadKeyUnavailableError('core_missing');
  }
  let taadPublicKeyHex: string;
  let walletAddress: string;
  try {
    const kek = await getOrCreateMasterKek();
    taadPublicKeyHex = await taad.deriveTaadPubkey(kek);
    walletAddress = await taad.deriveWalletAddress(kek, 0, WALLET_NETWORK);
  } catch (e) {
    // `isAvailable()` đã cho qua mà lời gọi vẫn báo KHÔNG CÓ LÕI ⟹ máy này thiếu
    // `.so` cho ABI của nó. Đó không phải một lần trượt, nên đừng mời thử lại.
    const reason: TaadKeyBlockReason = isCoreUnavailableError(e) ? 'core_missing' : 'derive_failed';
    // Đếm được số lượt bị chặn là điều kiện để biết bản vá này đang cứu người hay
    // đang cấm cửa người. Không có dòng này thì ngày phát hành là một ngày mù.
    // Chỉ gửi giai đoạn + mã tra ngược: câu thô có thể mang vật liệu khoá.
    rLog.error('register_taad_key_blocked', { giai_doan: reason });
    console.warn('[PhoenixKey] suy khoá TAAD từ KEK hỏng — KHÔNG đăng ký:', e);
    throw new TaadKeyUnavailableError(reason, e);
  }
  // Rỗng mà không ném là ca riêng: cầu native trả về chuỗi trống thay vì lỗi. Nó
  // đi lọt mọi `catch`, nên phải có nhánh của chính nó.
  if (!taadPublicKeyHex || !walletAddress) {
    rLog.error('register_taad_key_blocked', { giai_doan: 'tra_ve_rong' });
    throw new TaadKeyUnavailableError('derive_failed');
  }
  // Backend DidType enum là CHỮ HOA (PERSON/ORG/...). Gửi 'person' → 400 malformed
  // (Cannot deserialize entity_type). PHẢI 'PERSON'.
  return { taadPublicKeyHex, walletAddress, entityType: 'PERSON' };
};

interface GenesisResult {
  user: AuthUser;
  txHash: string;
  /**
   * Tên đăng nhập đã ĐẶT ĐƯỢC LÊN MÁY CHỦ chưa.
   *
   * `undefined` = người dùng không gõ tên nào. `false` = có gõ nhưng máy chủ không
   * nhận, và lúc đó `usernameError` mang câu nói vì sao. Ba trạng thái, không gộp:
   * gộp "không gõ" với "gõ mà hỏng" là đúng cái vỏ im lặng khiến lỗi này sống được
   * tới hôm nay.
   */
  usernameSet?: boolean;
  usernameError?: string;
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

  // ⛔ ĐO TRƯỚC KHI ĐỘNG VÀO BẤT CỨ THỨ GÌ. Thứ tự ở đây là phần đắt nhất của bản
  // vá, không phải bản thân phép chặn.
  //
  // Đặt sau `enrollKeypair()` thì sinh ra bốn hệ quả, cả bốn đều thật:
  //   1. `enrollKeypair()` ĐỎ ngay khi máy còn khoá cũ: hai cầu native từ chối sinh
  //      đè bằng `E_KEY_EXISTS` (`PhoenixKeyModule.swift` nhánh `hasKeySync`,
  //      `PhoenixKeyModule.kt` nhánh `keyStore.containsAlias`). Người dùng nhận một
  //      mã lỗi native thay vì câu nói đúng ca của mình.
  //   2. Lần bấm lại, `isKeypairEnrolled()` ở trên trả `true` nên với `new-person`
  //      app hỏi "máy này đã có một danh tính" — về một danh tính chưa từng tồn tại.
  //   3. Người dùng đã gõ xong tên đăng nhập và qua HAI hộp sinh trắc trước khi
  //      nghe tin mình bị chặn. Chi phí trả trước, nhận về không.
  //   4. `reRegisterIdentity` gọi `wipeIdentity()` NGAY TRƯỚC hàm này, nên ở luồng
  //      đó khoá cũ đã mất trước cả khi phép đo chạy.
  // Đặt trước thì cả bốn biến mất cùng lúc, và hàm này giữ được tính chất "hỏng thì
  // máy không khác gì lúc chưa bấm".
  //
  // KEK có thể được sinh ở bước này (`getOrCreateMasterKek`) và ở lại máy khi lượt
  // đăng ký bị chặn. Đó là chủ đích: lần thử sau dùng lại đúng KEK ấy nên 24 từ của
  // người dùng không đổi giữa hai lần.
  const walletFields = await requireWalletRegisterFields();

  // ── CHIP TỪ CHỐI GHI ĐÈ ⟹ DỊCH MÃ NATIVE RA MỘT CÂU NÓI ĐƯỢC VIỆC PHẢI LÀM ──
  // Hai cầu native từ chối sinh khoá khi nhãn đã có khoá, và trả `E_KEY_EXISTS`
  // (`PhoenixKeyModule.kt` nhánh `keyStore.containsAlias`, `PhoenixKeyModule.swift`
  // nhánh `hasKeySync`). Hằng mã lỗi đã khai từ lâu ở `phoenixKey-native.ts` kèm
  // chú thích "switch on these in UI" — và tới 2026-09-17, grep cả kho ra 0 chỗ
  // bắt nó. Tức người dùng nhận đúng chuỗi `E_KEY_EXISTS` lên màn hình.
  //
  // Tới được đây là một mâu thuẫn CÓ THẬT chứ không phải lỗi lập trình: phép đo ở
  // đầu hàm (`isKeypairEnrolled()`) đọc nhãn qua con trỏ trong AsyncStorage
  // (`sdk/phoenixKey.ts` ▸ `getOwnerAlias`), nên mất AsyncStorage là con trỏ rơi
  // về nhãn mặc định và phép đo trả `false` cho một máy vẫn còn khoá dưới nhãn ấy.
  // App đo ra "máy trống trơn", mời người dùng tạo mới, rồi chip từ chối.
  //
  // KHÔNG xoá khoá cũ để đi tiếp: khoá đó có thể đang là khoá owner của một danh
  // tính còn sống, và xoá nó là bất khả hồi. Lối đúng là màn Khôi phục — ở đó
  // `lookupDidByDeviceKey` đổi CHÍNH khoá ấy lấy DID, không cần 24 từ, không cần
  // tên đăng nhập.
  let publicKeyHex: string;
  try {
    ({ publicKeyHex } = await enrollKeypair());
  } catch (err) {
    if ((err as { code?: string })?.code === PhoenixKeyNativeError.KEY_EXISTS) {
      const stuck = new Error(CHIP_KEY_EXISTS_MESSAGE) as Error & { reason?: string };
      stuck.reason = 'chip_key_exists';
      rLog.error('register_blocked_chip_key_exists', {});
      console.warn('[PhoenixKey register] chip còn khoá cũ dưới nhãn đang dùng:', err);
      throw stuck;
    }
    throw err;
  }
  const genesisMessage = `PHOENIXKEY_GENESIS:${publicKeyHex}`;
  const messageHex = utf8ToHex(genesisMessage);

  const signature = await signRaw(
    messageHex,
    tk('identity.bio.createTitle'),
    tk('identity.bio.createBody'),
  );

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

    // ── 3005 Ở ĐÂY KHÔNG CÙNG NGHĨA VỚI 3005 Ở ĐƯỜNG KHÔI PHỤC ───────────────
    // Đường khôi phục nhận 3005 về một khoá phần cứng đã có trong kho máy chủ.
    // Đường này thì không thể: `enrollKeypair()` ngay trên vừa sinh một khoá MỚI,
    // máy chủ chưa từng thấy nó. Thứ duy nhất trong lượt gọi này đã đăng ký được
    // là khoá TAAD suy từ Master_KEK, đi kèm trong `walletFields`.
    //
    // Đo được 15/09 trên máy ảo: `wipeIdentity()` rồi đăng ký lại → 3005/409, câu
    // máy chủ nói "TAAD public key đã được bind vào một DID khác"; đổi sang
    // `wipeLocalIdentity()` (thêm `clearMasterKek()`) thì hết. Biến duy nhất khác
    // nhau giữa hai lượt là Master_KEK, nên nó là nguyên nhân.
    //
    // Trước bản này ca đó rơi vào `default` của `friendlyRegisterError` và người
    // dùng đọc "Tạo danh tính thất bại. Thử lại." — lời mời làm một việc KHÔNG
    // BAO GIỜ khác đi, vì trở ngại là chiếc ví nằm sẵn trên máy chứ không phải
    // lần bấm này.
    //
    // ⚠ CÂU NÀY CỐ Ý KHÔNG CHỈ TỚI LỐI TẮT "khôi phục bằng ví trên máy", dù ví
    // đúng là còn trên máy. `doRestoreSameDevice` mở đầu bằng một phép chứng minh
    // có mặt (`signRaw`) cần khoá trong chip — mà `wipeIdentity()` vài dòng trên
    // vừa xoá. Chỉ tới lối đó là chỉ tới một cánh cửa đã khoá, đúng cái bẫy mà
    // khối `khoa_bi_thu_hoi` dựng ra để tránh. Không bỏ phép chứng minh ấy đi
    // được: Master_KEK hiện đọc được không cần sinh trắc, nên nó là thứ duy nhất
    // chặn người mượn được máy cộng biết tên đăng nhập.
    if (err instanceof PhoenixKeyApiError && err.code === 3005) {
      const stuck = new Error(WALLET_BOUND_ELSEWHERE_MESSAGE) as Error & {
        reason?: string;
      };
      stuck.reason = 'wallet_bound_to_other_did';
      console.warn('[PhoenixKey register] ví trên máy đã thuộc một DID khác:', err);
      throw stuck;
    }

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

  // ── TÊN ĐĂNG NHẬP PHẢI ĐI LÊN MÁY CHỦ NGAY TẠI ĐÂY ──────────────────────────
  // Trước bản này nó KHÔNG đi đâu cả. Màn Bước 1/3 hỏi tên, hứa với người dùng rằng
  // nó "không thể trùng trong toàn hệ sinh thái", rồi cất vào `AsyncStorage` của
  // chính máy đó. Thân `POST /identity/register` không có trường nào mang tên
  // (`phoenixKey-api.ts` ▸ `RegisterRequest`), và lối duy nhất đẩy tên lên là
  // `PUT /identity/username` — chỉ được gọi từ `UsernameScreen`, một màn nằm trong
  // Tài khoản, tức PHẢI đăng nhập xong mới tới được.
  //
  // Vòng tròn khép lại ở chỗ đắt nhất: người dùng mới cài lại app rồi gõ đúng tên
  // mình đã chọn, `RestoreIdentityScreen` hỏi `GET /identity/by-username/<tên>`,
  // máy chủ trả 404 vì tên chưa từng được đăng ký — và lượt 404 ấy bị nuốt bằng
  // `console.log`, thứ không ai đọc được trên bản đã phát hành.
  //
  // KHÔNG để lượt gọi này làm hỏng cả lần đăng ký: danh tính đã ghi lên chuỗi xong
  // rồi, ném ở đây là vứt một danh tính thật vì một cái tên. Nhưng cũng KHÔNG nuốt
  // — trả trạng thái ra cho màn hình nói cho người dùng biết.
  let usernameSet: boolean | undefined;
  let usernameError: string | undefined;
  const tenSach = username?.trim().toLowerCase();
  if (tenSach) {
    try {
      await phoenixKeyApi.identity.setUsername(tenSach);
      usernameSet = true;
    } catch (err) {
      usernameSet = false;
      usernameError =
        err instanceof PhoenixKeyApiError && err.message.trim()
          ? err.message
          : 'Chưa đăng ký được tên này lên máy chủ.';
      console.warn('[PhoenixKey register] đặt tên đăng nhập hỏng:', err);
    }
  }

  return { user, txHash, usernameSet, usernameError };
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
  // Đo TRƯỚC khi xoá. `wipeIdentity()` ở đây là bất khả hồi với khoá trong chip, nên
  // thứ tự cũ (xoá → đăng ký → phát hiện thiếu khoá TAAD) để lại một máy vừa mất
  // khoá cũ vừa không có khoá mới — và luồng gọi nó là màn nhận diện cây, tức người
  // dùng đang đứng ngoài vườn giữa một việc khác hẳn.
  //
  // `registerIdentity` bên dưới đo lại lần nữa. Không gộp làm một: hàm đó phải tự
  // đứng vững với mọi nơi gọi, chứ không dựa vào việc nơi gọi đã đo hộ.
  await requireWalletRegisterFields();
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

    // Ở ĐÂY KHÔNG CÓ `wipeIdentity()`, và đó là khác biệt cố ý với đường đăng ký
    // mới. Khoá chủ trên máy này có TRƯỚC lượt gọi, nó là thứ đang cần giữ chứ
    // không phải rác vừa sinh ra. Ném lên trên, `describeRecoverFailure` đọc ra
    // đúng lý do và màn hình mời thử lại — khoá vẫn nguyên chỗ cho lần sau.
    const walletFields = await requireWalletRegisterFields();
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
  // ĐẶT TRƯỚC MỌI PHÉP DÒ CHUỖI. Câu của lỗi này có chữ "khoá", và lưới dò phía
  // dưới bắt theo từ khoá nên một lần đổi câu là nó rơi nhầm nhánh mà không ai
  // thấy. Dò theo KIỂU thì không phụ thuộc câu chữ.
  if (err instanceof TaadKeyUnavailableError) return err.reason;

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
  // ⛔ ĐÍNH CHÍNH 2026-09-14. Câu trước ở đây dựng trên một TIỀN ĐỀ SAI, và tiền đề
  // đó từng được viết thẳng vào khối chú thích này: "hai app dùng chung một khe khoá
  // phần cứng, nên khoá lập trong Aladin hiện ra ở CheckFarm và ngược lại".
  //
  // Đo lại trong kho này 14/09: KHÔNG có tệp `.entitlements` nào dưới `ios/`, không
  // có `CODE_SIGN_ENTITLEMENTS` trong `SuperApp.xcodeproj/project.pbxproj`, không có
  // `keychain-access-groups`, không có `kSecAttrAccessGroup` trong mã của ta, và
  // Android không khai `sharedUserId`. Thiếu cả bốn thứ đó thì nhóm khoá mặc định
  // của iOS là `$(AppIdentifierPrefix)<mã gói>` và Keystore của Android tách theo
  // UID — tức mỗi app đứng trong kho khoá RIÊNG. Hai app KHÔNG thấy khoá của nhau.
  //
  // Hệ quả: mã `3005 KEY_ALREADY_REGISTERED` nói khoá của CHÍNH app này đã đăng ký,
  // nên "có thể do một ứng dụng khác" không giải thích được gì; lời khuyên "chỉ cần
  // nhập đúng tên đăng nhập đó" thì dẫn thẳng vào `ten_khong_khop_khoa` — tên bên
  // Aladin trỏ về một danh tính mà khoá của app này không ký được cho.
  //
  // Nguồn thật của cảnh này là CHÍNH app này ở một lần cài trước: kho khoá sống qua
  // lần gỡ app, AsyncStorage thì không. Nên câu mới nói ba vế: khoá là của app này ·
  // đi đâu (màn khôi phục nay tự hỏi máy chủ theo khoá, không cần tên) · và đóng
  // hẳn lối "mượn tên đăng nhập của app kia", vì đó là lối người dùng tự nghĩ ra.
  //
  // Người từng dùng app KHÁC của hệ trên cùng máy có lối riêng và nó KHÔNG phải lối
  // này — xem `IdentityEntryChoiceScreen`, thẻ "Nhờ app đang đăng nhập duyệt".
  can_ten_dang_nhap:
    'Máy này đã có khoá của một danh tính do CHÍNH ứng dụng này tạo ở lần cài trước — gỡ ứng dụng không xoá khoá đó đi. Hãy mở màn Khôi phục danh tính: máy sẽ tự hỏi máy chủ xem khoá này thuộc tài khoản nào, không cần bạn nhớ gì. Ứng dụng khác trên cùng điện thoại giữ khoá ở kho riêng, nên tên đăng nhập bên đó không mở được máy này.',
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
  // Hai câu dưới là ca DỪNG CÓ CHỦ ĐÍCH, không phải ca hỏng — xem khối lý do ở
  // `TaadKeyUnavailableError`. Cả hai đều phải nói được VÌ SAO app tự dừng, nếu
  // không người dùng sẽ đi tìm cách vòng qua nó, mà vòng qua chính là thứ sinh ra
  // danh tính chết.
  //
  // Cả hai đều nói rõ "không phải lỗi sóng, không phải lỗi vân tay": đó là hai thứ
  // duy nhất người dùng ngoài vườn biết tự sửa, nên không loại trừ thì họ sẽ đi
  // kiểm tra sóng và quẹt lại vân tay hàng chục lần cho một việc không liên quan.
  derive_failed:
    'Máy chưa tạo được khoá dự phòng cho danh tính, nên ứng dụng dừng lại — tạo tài khoản lúc này sẽ ra một tài khoản không khôi phục lại được nếu bạn mất máy. Đây không phải lỗi sóng, cũng không phải lỗi vân tay. Đóng hẳn ứng dụng rồi mở lại và thử lần nữa; nếu vẫn vậy, khởi động lại điện thoại. Vẫn không được thì chụp màn hình này gửi hỗ trợ.',
  core_missing:
    'Bản ứng dụng trên máy này thiếu phần tạo khoá dự phòng, nên ứng dụng dừng lại — tạo tài khoản lúc này sẽ ra một tài khoản không khôi phục lại được nếu bạn mất máy. Thử lại sẽ không khác. Hãy cập nhật ứng dụng lên bản mới nhất rồi tạo lại.',
};

/**
 * Câu cho ca ĐĂNG KÝ MỚI bị chặn vì ví trên máy đã thuộc một danh tính khác
 * (`3005` kèm `walletFields`). Xem khối lý do ở `catch` của `registerIdentity`.
 *
 * Để RIÊNG, không nhét thêm một khoá vào `RECOVER_FAIL_MESSAGE`: map đó là bảng
 * của đường KHÔI PHỤC, và `chonLyDoKhoiPhuc` chọn khoá trong đó theo một phép suy
 * luận không hề biết tới đường đăng ký. Một khoá lạ nằm trong bảng ấy là một khoá
 * mà phép suy luận kia có thể trỏ vào nhầm về sau, mà không gì đỏ lên.
 *
 * Ba vế bắt buộc, vì thiếu vế nào là người dùng đi sai một hướng:
 *  · trở ngại là CHIẾC VÍ còn trên máy — không phải sóng, không phải vân tay;
 *  · thử lại KHÔNG khác (câu cũ "Thử lại." mời họ bấm mãi);
 *  · lối ra là 24 từ ở màn Khôi phục — nói thẳng, không hứa lối tắt.
 */
export const WALLET_BOUND_ELSEWHERE_MESSAGE =
  'Máy này còn giữ ví của một danh tính đã tạo trước đó, và máy chủ không cho gắn ví đó vào một danh tính mới. Đây không phải lỗi sóng hay lỗi vân tay, nên bấm tạo lại sẽ ra đúng kết quả này. Hãy mở màn Khôi phục danh tính và dùng cụm 24 từ của danh tính cũ để lấy lại nó.';

/**
 * Câu cho ca CHIP CÒN KHOÁ CŨ dưới đúng nhãn app đang dùng (`E_KEY_EXISTS`).
 *
 * Ba vế bắt buộc, vì thiếu vế nào là người dùng đi sai một hướng:
 *  · trở ngại là KHOÁ CŨ trong chip — không phải sóng, không phải vân tay;
 *  · thử lại KHÔNG khác, và app cố ý KHÔNG xoá khoá đó hộ (nó có thể là khoá của
 *    một danh tính còn dùng được, và xoá là bất khả hồi);
 *  · lối ra là màn Khôi phục, nơi máy tự hỏi máy chủ theo chính khoá ấy — nói rõ
 *    "không cần 24 từ, không cần tên đăng nhập", vì đúng nhóm kẹt ở đây là nhóm
 *    không có hai thứ đó (`SeedExportScreen` nằm SAU lớp đăng nhập).
 *
 * Vế thứ TƯ thêm 2026-09-18, và nó tồn tại vì ba vế trên có một ca chúng dẫn vào
 * ngõ cụt: người mà khoá cũ đã CHẾT HẲN. Với họ, màn Khôi phục cũng dừng — đường
 * tra theo khoá cần một chữ ký từ chính khoá đang chết. Ba vế trên vẫn ĐÚNG cho ca
 * thường (khoá còn sống, cài lại app trên chính máy cũ) nên không được gỡ; cái
 * thiếu là một câu chỉ đường cho ca kia. Vá một đầu mà để câu chữ trỏ đầu kia thì
 * lối ra mới không ai tới được.
 */
export const CHIP_KEY_EXISTS_MESSAGE =
  'Máy này vẫn còn một khoá bảo mật từ lần cài trước nằm trong chip, và ứng dụng không được phép ghi đè lên nó — khoá đó có thể đang thuộc một tài khoản còn dùng được. Đây không phải lỗi sóng hay lỗi vân tay, nên bấm tạo lại sẽ ra đúng kết quả này. Hãy mở màn Khôi phục danh tính: máy sẽ tự hỏi máy chủ xem khoá này thuộc tài khoản nào, không cần 24 từ và không cần tên đăng nhập. Nếu màn đó cũng dừng lại vì khoá cũ đã chết hẳn, hãy quay ra màn đăng nhập và bấm nút sinh trắc một lần: máy sẽ thử ký để biết chắc khoá đã chết, rồi mới mở lối bỏ tài khoản cũ.';

/**
 * Vì sao lượt TRA DID THEO KHOÁ TRONG CHIP hỏng — ba ca, ba lối đi khác nhau.
 *
 * Tách khỏi `describeRecoverFailure`: hàm đó phục vụ chuỗi BA ĐƯỜNG của
 * `recoverLocalIdentityFromKey` và kết luận của nó được `chonLyDoKhoiPhuc` đọc
 * lại, nên một khoá lạ nhét vào đó là một khoá phép suy luận kia có thể trỏ nhầm
 * vào. Ở đây chỉ có ĐÚNG MỘT lời gọi (`lookupDidByDeviceKey`) nên lỗi của nó đọc
 * thẳng được, không phải đối chiếu với ai.
 *
 * Các ca KHÔNG được gộp, vì việc người dùng phải làm tiếp trái ngược nhau:
 *  · `biometric_not_done` — làm lại ngay tại chỗ là xong;
 *  · `network_down`       — đợi sóng rồi bấm lại, máy không mất gì;
 *  · `key_not_linked`     — bấm lại bao nhiêu lần cũng thế, phải đổi sang 24 từ;
 *  · `key_unusable`       — khoá CÒN trên máy nhưng chip từ chối dùng nó; cũng phải đổi
 *                           sang 24 từ, nhưng vì lý do khác hẳn và câu phải nói đúng lý do
 *                           đó, không thì người dùng đi kiểm tra tài khoản thay vì đi lấy
 *                           cụm từ. Xem khối vì-sao ở `E_KEY_INVALIDATED`.
 * Một câu "có lỗi xảy ra" cho cả bốn là đẩy ba nhóm đi sai đường.
 */
export type DeviceKeyLookupFailure =
  | 'biometric_not_done'
  | 'key_not_linked'
  | 'key_unusable'
  | 'network_down'
  | 'unknown';

/**
 * Hàm THUẦN — không gọi mạng, không đọc chip. Tách ra để bài kiểm ghim được từng
 * ca mà không phải dựng cả màn hình, đúng lý do `chonLyDoKhoiPhuc` được tách.
 *
 * THỨ TỰ DÒ là phần đáng đọc kỹ: mã native (`E_USER_CANCELED`) đi TRƯỚC mọi phép
 * dò chuỗi, vì câu của nó do hệ điều hành đặt và đổi theo ngôn ngữ máy. Rồi tới
 * `PhoenixKeyApiError` theo MÃ SỐ, rồi mới tới lưới dò chuỗi cho lỗi tầng dưới.
 */
export const classifyDeviceKeyLookupFailure = (err: unknown): DeviceKeyLookupFailure => {
  const code = (err as { code?: unknown })?.code;
  if (code === 'USER_CANCELED' || code === PhoenixKeyNativeError.USER_CANCELED) {
    return 'biometric_not_done';
  }
  if (code === PhoenixKeyNativeError.BIOMETRIC_LOCKOUT || code === 'BIOMETRIC_LOCKOUT') {
    return 'biometric_not_done';
  }

  // Chip nhận ra khoá nhưng TỪ CHỐI dùng nó. Bốn mã, một lối ra.
  //
  // Trước bản này cả bốn rơi xuống `unknown`, và `unknown` bảo người dùng "thử lại một
  // lần" — lời khuyên sai với đúng nhóm này: khoá đã bị vô hiệu hoá thì bấm bao nhiêu lần
  // cũng thế. Nhóm đó cũng chính là nhóm màn hình mời bấm nhiều nhất, vì `hasKey` trả
  // `true` nên thẻ "Khoá của bạn vẫn nằm trong máy này" vẫn dựng.
  if (
    code === PhoenixKeyNativeError.KEY_INVALIDATED ||
    code === PhoenixKeyNativeError.SIGN_AFTER_AUTH ||
    code === PhoenixKeyNativeError.NO_KEY ||
    code === PhoenixKeyNativeError.KEYSTORE
  ) {
    return 'key_unusable';
  }
  // Kho khoá chưa mở là ca DUY NHẤT trong họ này mà thử lại có ích — đừng gộp lên trên.
  if (code === PhoenixKeyNativeError.KEY_LOCKED) {
    return 'biometric_not_done';
  }

  if (err instanceof PhoenixKeyApiError) {
    // `httpStatus === 0` = lời gọi không tới được máy chủ — cùng quy ước với
    // `describeRecoverFailure`. Kiểm TRƯỚC 404: một lời gọi chết không mang 404.
    if (err.httpStatus === 0) return 'network_down';
    // 404 ở cửa này gộp ba ca có chủ đích ở máy chủ (chữ ký sai · khoá chưa đăng
    // ký · khoá đã thu hồi). KHÔNG dịch nó thành một nguyên nhân cụ thể — câu đưa
    // ra chỉ nói đúng thứ đo được: máy chủ chưa thấy khoá này thuộc tài khoản nào.
    if (err.httpStatus === 404) return 'key_not_linked';
    return 'unknown';
  }

  const m = String((err as { message?: string })?.message ?? err ?? '');
  if (/cancel|user_cancel|huỷ|huy/i.test(m)) return 'biometric_not_done';
  if (/network|timeout|ECONN|Network Error/i.test(m)) return 'network_down';
  return 'unknown';
};

/** Mỗi ca → MỘT câu hoàn chỉnh (từ điển tra theo NGUYÊN chuỗi — `i18n/translate.ts`). */
export const DEVICE_KEY_LOOKUP_MESSAGE: Record<DeviceKeyLookupFailure, string> = {
  biometric_not_done:
    'Chưa xác thực xong vân tay hoặc khuôn mặt nên máy chưa hỏi được máy chủ. Bấm lại và giữ tới khi máy báo xong — khoá trên máy vẫn còn nguyên.',
  key_not_linked:
    'Máy chủ chưa thấy khoá trên máy này thuộc về tài khoản nào: khoá có thể chưa đăng ký xong lần trước, hoặc đã bị thu hồi sau một lần khôi phục ở nơi khác. Bấm lại cũng ra đúng kết quả này — hãy dùng cụm 24 từ ở phần dưới màn hình.',
  network_down:
    'Chưa liên lạc được với máy chủ danh tính. Kiểm tra sóng rồi bấm lại — khoá trên máy vẫn còn nguyên, không mất gì.',
  // Câu này KHÔNG được dừng ở "dùng 24 từ đi". Nhóm rơi vào đây gồm cả người KHÔNG
  // giữ 24 từ, và với họ cả bốn cửa của màn đều đóng: hai lối ký bằng khoá trên máy
  // đều chết cùng một lý do, còn tạo tài khoản mới thì `enrollKeypair` ném
  // `E_KEY_EXISTS` vì khoá chết vẫn chiếm chỗ. Chỉ nói lối 24 từ là mời đúng nhóm
  // kẹt nhất đi vào một cửa họ không mở được, rồi để họ tự kết luận là mình làm sai.
  key_unusable:
    'Khoá vẫn nằm trong máy nhưng chip từ chối dùng nó — hay gặp nhất là khi bạn đã thêm hoặc đăng ký lại vân tay / khuôn mặt sau ngày tạo tài khoản: khoá cũ bị khoá vĩnh viễn ngay lúc đó, để người khác thêm sinh trắc của họ vào máy bạn cũng không mở được. Bấm lại bao nhiêu lần cũng ra đúng kết quả này. Nếu bạn CÓ giữ cụm 24 từ thì dùng nó ở phần dưới màn hình. Nếu KHÔNG giữ thì trên máy này chưa có lối nào khác — chụp màn hình này, gồm cả dòng mã bên dưới, rồi gửi hỗ trợ; dòng đó nói được chính xác chip đang từ chối vì lý do gì.',
  unknown:
    'Chưa tìm lại được danh tính từ khoá trên máy, chưa rõ vì sao. Thử lại một lần; nếu vẫn vậy, dùng cụm 24 từ ở phần dưới hoặc chụp màn hình này gửi hỗ trợ.',
};

/**
 * Dòng SỐ ĐO đính kèm câu báo lỗi — thứ biến một ảnh chụp màn hình thành một phép đo.
 *
 * ══ Vì sao hàm này tồn tại ════════════════════════════════════════════════════════
 * Câu của làn `unknown` bảo người dùng *"chụp màn hình này gửi hỗ trợ"*. Trước bản này màn
 * hình đó **không mang một dữ kiện nào**: cùng một bức ảnh cho một lần mất sóng lạ, một mã
 * HTTP 500, một khoá bị chip từ chối và một DID sai khuôn. Người dùng làm đúng y lời, gửi
 * ảnh về, và phía nhận vẫn không kết luận được gì — cả hai phía đều tin là đã đo.
 *
 * Một câu "gửi ảnh màn hình" là một HỢP ĐỒNG ĐO. Viết nó ra thì màn hình phải mang theo thứ
 * đọc ngược được, nếu không nó chỉ là một vòng lặp có chữ lịch sự.
 *
 * ══ Vì sao KHÔNG dán nguyên lỗi vào ═══════════════════════════════════════════════
 * Lỗi thô mang theo đường dẫn nội bộ, tên bảng, và — ở đúng luồng này — khoá công khai cùng
 * chữ ký. Một lần rò khoá ra ngoài theo traceback của thư viện ngoài đã xảy ra thật trong hệ.
 * Nên chỉ ba trường được đi ra, và phần chữ tự do bị CẮT ngắn rồi lọc:
 *   · mã lỗi native (`E_…`) hoặc `HTTP <mã>` — chuỗi đóng, do chính kho này đặt;
 *   · mã nghiệp vụ của máy chủ (số);
 *   · 90 ký tự đầu của câu, đã bỏ mọi chuỗi hex dài ≥16 và mọi thứ trông như đường dẫn.
 *
 * Hàm THUẦN, không đọc chip, không gọi mạng — bài kiểm ghim được từng ca.
 */
export const describeDeviceKeyLookupError = (err: unknown): string => {
  const parts: string[] = [];

  if (err instanceof PhoenixKeyApiError) {
    parts.push(err.httpStatus === 0 ? 'HTTP none' : `HTTP ${err.httpStatus}`);
    if (Number.isFinite(err.code)) parts.push(`mã ${err.code}`);
  } else {
    const code = (err as { code?: unknown })?.code;
    parts.push(typeof code === 'string' && code ? code : 'không có mã');
  }

  const raw = String((err as { message?: string })?.message ?? '');
  const scrubbed = raw
    // Hex dài = khoá công khai, chữ ký, nonce, DID. Không có ca nào cần chúng để phân loại.
    .replace(/\b[0-9a-fA-F]{16,}\b/g, '…')
    // Đường dẫn tệp — cả POSIX lẫn lược đồ. Lộ bố cục máy, không giúp gì người đọc.
    .replace(/(?:[a-z]+:)?\/\/?\S+/gi, '…')
    .replace(/\s+/g, ' ')
    .trim();
  if (scrubbed) parts.push(scrubbed.slice(0, 90));

  return `Mã tham chiếu: ${parts.join(' · ')}`;
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
