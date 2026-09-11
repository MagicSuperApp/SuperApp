/**
 * RestoreIdentityScreen — Khôi phục danh tính từ cụm 24 từ (BIP39) trên máy mới.
 *
 * Tương đương Enclave/lib/screens/restore_identity_screen.dart. Người dùng nhập
 * cụm 24 từ → Rust core (taadEnclave.mnemonicToMasterKek) giải về Master_KEK
 * (64-hex). Reject nếu sai checksum / không thuộc wordlist / không đủ 24 từ.
 *
 * Phase 1: validate cụm từ + lấy lại Master_KEK. Phase sau: derive DID/ví từ KEK,
 * wrap lại bằng Secure Enclave/Keystore của máy mới, đăng ký thiết bị.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, TextInput, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useDispatch } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants';
import { showSuccess, showWarning } from '../utils/alert';
import taadEnclave from '../sdk/taadEnclave';
import {
  deriveMasterKekFromMnemonic,
  getStoredMasterKek,
  storeMasterKek,
} from '../services/masterKekStore';
import { phoenixKeyApi, PhoenixKeyApiError } from '../services/phoenixKey-api';
import { enrollKeypair, ownerPublicKey, saveUserDid, currentUserDid, signRaw } from '../sdk/phoenixKey';
import { phoenixKeyAuth } from '../services/phoenixKeyAuthService';
import { loginUser } from '../store/userSlice';
import { countMnemonicWords, normalizeMnemonic } from '../utils/mnemonic';
import { t, tf } from '../i18n';

const DID_RE = /^did:phoenix:[a-z2-7]{13}:[0-9a-f]{64}$/;
// Registry {username, did} app lưu lúc đăng ký (SignUpBiometricScreen) — dùng để
// TỰ tìm lại DID trên CÙNG máy, khôi phục chỉ bằng 24 từ (không cần gõ DID).
const PHOENIX_USERS_KEY = '@phoenixkey/users';
// Nonce chống phát-lại cho cửa GẮN THIẾT BỊ MỚI vào DID — thứ này được ký bằng
// khoá thật, nên nguồn ngẫu nhiên phải là CSPRNG. `Math.random` của Hermes là
// xorshift: đoán được state từ vài đầu ra liên tiếp. Dự án đã có `generateSalt`
// (CSPRNG bên Rust, dùng đúng ở `guardianService` và `keyRotateService`).
const genNonce = (): Promise<string> => taadEnclave.generateSalt();

const RestoreIdentityScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();
  const dispatch = useDispatch();

  const [phrase, setPhrase] = useState('');
  const [did, setDid] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  // ── VÍ CÒN TRÊN MÁY KHÔNG — phép đo quyết định màn này có phải ngõ cụt không ──
  // `undefined` = CHƯA ĐO, `null` = đo xong và KHÔNG có, chuỗi = có. Ba trạng thái,
  // không gộp: gộp "chưa đo" vào "không có" thì thẻ lối tắt dưới đây nhấp nháy mất
  // ở đúng lần mở màn đầu tiên, tức đúng lần người dùng cần nó nhất.
  const [kekOnDevice, setKekOnDevice] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getStoredMasterKek()
      .then(k => { if (alive) setKekOnDevice(k); })
      .catch(() => { if (alive) setKekOnDevice(null); });
    return () => { alive = false; };
  }, []);

  // Cụm từ đã CHUẨN HOÁ — dùng cho cả phép đếm lẫn phép khôi phục. Xem
  // `utils/mnemonic.ts`: chép cụm từ kèm số thứ tự / dấu phẩy làm phép đếm cũ ra
  // 48 "từ" trong khi trên màn nhìn vẫn đúng 24, và nút Khôi phục chết không rõ lý do.
  const cleanPhrase = useMemo(() => normalizeMnemonic(phrase), [phrase]);
  const wordCount = useMemo(() => countMnemonicWords(phrase), [phrase]);
  const countOk = wordCount === 24;

  // ── CỬA XÁC NHẬN — đặt TRƯỚC mọi thao tác, không phải sau ──────────────────
  // Khôi phục bằng 24 từ gắn khoá phần cứng MỚI vào danh tính, và trên chuỗi mỗi
  // danh tính chỉ có MỘT chỗ đặt khoá đó (`TAADDatum` field 3 `hw_key_pubkey`;
  // spec phương thức DID §5.2 "exactly one key per purpose"). Nên gắn khoá mới =
  // khoá cũ mất chỗ — kể cả khoá của một app KHÁC đang dùng cùng danh tính trên
  // chính máy này.
  //
  // Và nó KHÔNG chỉ là chuyện chỗ đặt khoá trên máy. Máy chủ tăng `users.token_epoch`
  // mỗi lần khôi phục, rồi bác MỌI phiên và MỌI token thiết-bị-liên-kết mang epoch cũ
  // (`PhoenixKey-Database` V17__split_taad_keys_table.sql:15-19 — vá có chủ đích, ghi rõ
  // là để đóng lỗ "thiết bị cũ vẫn dùng phiên 24h + token 30 ngày"). Nên phạm vi văng là
  // MỌI máy, không riêng máy này: điện thoại kia, máy tính kia, đều mất phiên.
  //
  // Người dùng KHÔNG suy ra được điều đó từ hai chữ "Khôi phục ví". Máy cũng
  // không tự biết: mỗi app có vùng khoá riêng theo mã gói, app này không thấy
  // app kia. Nên đây là chỗ DUY NHẤT nói ra được, và nó phải nói trước khi làm.
  const handleRestore = () => {
    if (!countOk) {
      showWarning('Chưa đủ', tf('Cần đúng 24 từ — hiện có {n}.', { n: wordCount }));
      return;
    }
    showWarning(
      t('Việc này sẽ đăng xuất mọi app và mọi máy khác'),
      t('Khôi phục bằng 24 từ sẽ gắn danh tính của bạn vào ứng dụng này. Mọi ứng dụng khác đang dùng CÙNG danh tính đó sẽ bị đăng xuất — kể cả trên điện thoại khác hoặc máy tính khác, không riêng máy này.') +
        ' ' +
        t('Dữ liệu của bạn không mất — nhưng muốn dùng lại app kia thì phải nhập lại 24 từ ở đó, và khi ấy ứng dụng này lại bị đăng xuất.') +
        ' ' +
        t('Chỉ dùng đường này khi bạn đang cài lại máy hoặc đổi sang máy mới.'),
      {
        confirmText: t('Vẫn khôi phục'),
        cancelText: t('Để sau'),
        onConfirm: () => { void doRestore(); },
      },
    );
  };

  /**
   * Gắn MÁY NÀY vào đúng danh tính của chủ ví, bằng một Master_KEK đã có trong tay.
   *
   * Tách khỏi `doRestore` vì KEK tới được từ HAI nguồn, và chỉ MỘT nguồn cần 24 từ:
   *   `cum-tu`   — suy từ cụm 24 từ người dùng vừa gõ (máy mới / đổi máy);
   *   `vi-tren-may` — đọc thẳng từ kho khoá của máy (cài lại app trên CHÍNH máy cũ).
   * Từ chỗ có KEK trở đi hai đường giống hệt nhau, nên gộp làm một là để chúng
   * không trôi khỏi nhau — chứ không phải để tiết kiệm dòng.
   */
  const attachThisDevice = async (
    kek: string,
    deviceHadWallet: boolean,
    nguon: 'cum-tu' | 'vi-tren-may',
  ) => {
    const bangCumTu = nguon === 'cum-tu';

    /**
     * Đã sinh khoá phần cứng MỚI chưa — tức khoá cũ đã bị xoá khỏi chip chưa.
     *
     * Phải theo dõi vì nó đổi HẲN ý nghĩa của một lần thất bại: chưa sinh khoá mới
     * thì hỏng là hỏng suông, thử lại lúc khác cũng thế; đã sinh rồi thì máy đang
     * ở giữa chừng — khoá cũ mất hẳn, khoá mới chưa mã định danh nào công nhận —
     * và người dùng PHẢI làm cho xong, không được bỏ dở hay gỡ app.
     */
    let hwKeyReplaced = false;

    // ── TỰ TÌM DID (ưu tiên thứ đã có trên MÁY) ───────────────────────────────
    // DID không derive được từ KEK, nhưng app ĐÃ lưu DID lúc đăng ký ở
    // currentUserDid + registry '@phoenixkey/users'. Gom mọi DID đã biết (cộng DID
    // user tự nhập nếu có) rồi thử recover-device từng cái. DID SAI → backend trả
    // 403 (chữ ký không khớp TAAD_Key của DID đó) / 404 → KHÔNG đổi state → thử
    // tiếp. DID ĐÚNG (hoặc 409 = máy đã gắn) → đăng nhập.
    const candidates: string[] = [];
    const typedDid = did.trim();
    if (typedDid) candidates.push(typedDid);
    const storedDid = await currentUserDid();
    if (storedDid) candidates.push(storedDid);
    try {
      const raw = await AsyncStorage.getItem(PHOENIX_USERS_KEY);
      if (raw) {
        (JSON.parse(raw) as Array<{ did?: string }>).forEach(u => {
          if (u?.did) candidates.push(u.did);
        });
      }
    } catch {
      // registry hỏng/không có → bỏ qua, còn typed/stored.
    }

    // ── TÊN ĐĂNG NHẬP LÀ NGUỒN DID THỨ BA, và trên máy vừa cài lại nó là nguồn
    // DUY NHẤT. Hai nguồn trên đều nằm trong AsyncStorage — thứ mà xoá app là mất
    // sạch, trong khi kho khoá thì không. Nên đúng ca "cài lại app trên máy cũ" là
    // ca mà hai nguồn trên cùng rỗng một lúc, và trước bản này màn hình trả lời
    // bằng câu "Máy mới — cần nhập mã định danh": bắt người dùng gõ một chuỗi 80 ký
    // tự mà app chưa bao giờ đưa cho họ, ở đúng lúc app đã mất chỗ lưu nó.
    // Máy chủ thì vẫn nhớ. Hỏi máy chủ.
    const tenSach = username.trim();
    if (tenSach) {
      try {
        const { userDid } = await phoenixKeyApi.identity.resolveUsername(tenSach);
        if (userDid) candidates.push(userDid);
      } catch (err) {
        // Tên chưa đăng ký (404) hoặc mất sóng. KHÔNG dừng ở đây: các DID trên máy
        // (nếu có) vẫn đáng thử. Nói ra ở cuối hàm nếu không DID nào khớp.
        console.log('[Restore] resolveUsername lỗi:', err);
      }
    }

    const uniqueDids = [...new Set(candidates.filter(d => DID_RE.test(d)))];

    if (uniqueDids.length === 0) {
      showWarning(
        t('Chưa biết đây là tài khoản nào'),
        (bangCumTu
          ? (deviceHadWallet
              ? t('Ví đang có trên máy được GIỮ NGUYÊN, chưa thay gì cả.')
              : t('Đã lưu ví an toàn.')) + ' '
          : '') +
          t('Máy này không còn lưu mã định danh nào (xoá app là mất phần lưu đó).') + ' ' +
          t('Hãy gõ TÊN ĐĂNG NHẬP bạn đã dùng lúc tạo tài khoản vào ô bên dưới — máy chủ vẫn nhớ nó.') + ' ' +
          t('Nếu bạn có sẵn mã định danh did:phoenix:… thì gõ vào ô mã định danh cũng được.'),
      );
      return;
    }

    const taadPub = await taadEnclave.deriveTaadPubkey(kek);

    /** Thử gắn máy vào từng mã định danh ứng viên, bằng MỘT khoá phần cứng cho trước. */
    const tryAttachWith = async (hwPub: string): Promise<string | null> => {
      for (const cand of uniqueDids) {
        const nonce = await genNonce();
        const challenge = `PHOENIXKEY_RECOVER:${cand}:${hwPub}:${nonce}`;
        const signature = await taadEnclave.signEd25519(kek, challenge);
        if (!signature) continue;
        try {
          await phoenixKeyApi.identity.recoverDevice({
            userDid: cand,
            newHwPublicKeyHex: hwPub,
            taadPublicKeyHex: taadPub,
            signature,
            nonce,
          });
          return cand; // gắn thành công → đúng mã định danh
        } catch (e) {
          if (e instanceof PhoenixKeyApiError) {
            // 409 = khoá này đã gắn (máy này đã khôi phục mã đó rồi) → coi là ĐÚNG.
            if (e.httpStatus === 409) return cand;
            // 403 chữ ký không khớp / 404 không tồn tại / 2002 không có người dùng →
            // mã này SAI so với ví đang cầm → thử mã kế tiếp.
            if (e.httpStatus === 403 || e.httpStatus === 404 || e.code === 2002) continue;
          }
          throw e; // lỗi mạng/khác → dừng, báo lỗi.
        }
      }
      return null;
    };

    // ── THỬ KHOÁ PHẦN CỨNG ĐANG CÓ TRƯỚC, SINH KHOÁ MỚI SAU ───────────────────
    // `enrollKeypair()` KHÔNG phải một thao tác thêm: `nativeGenerateKeypair` XOÁ
    // khoá cũ trong Secure Enclave / Keystore trước khi ghi khoá mới, và khoá đó
    // không có bản sao ở đâu cả. Gọi nó ở dòng đầu — như bản trước — nghĩa là mọi
    // lần bấm Khôi phục đều phá khoá cũ TRƯỚC khi biết có gắn được không; mất sóng
    // giữa vòng lặp là máy còn lại một khoá mới chưa mã định danh nào công nhận.
    //
    // Với đường "ví còn trên máy" thì khoá cũ thường VẪN ĐÚNG là khoá đang đăng ký
    // (chỉ AsyncStorage mất, kho khoá thì không) — thử nó trước là máy chủ trả 409
    // "khoá này gắn rồi", tức xong việc mà không phá gì. Chỉ khi nó không được
    // nhận mới sinh khoá mới.
    let matchedDid: string | null = null;
    let hwPub: string | null = null;
    try {
      hwPub = await ownerPublicKey();
    } catch {
      hwPub = null; // máy chưa có khoá nào → phải sinh
    }
    if (hwPub) matchedDid = await tryAttachWith(hwPub);

    if (!matchedDid) {
      // Khoá đang có không được nhận (hoặc không có khoá nào). Giờ mới sinh khoá
      // mới — và từ đây trở đi khoá cũ đã mất, nên câu lỗi ở dưới phải nói ra.
      hwPub = (await enrollKeypair()).publicKeyHex;
      hwKeyReplaced = true;
      matchedDid = await tryAttachWith(hwPub);
    }

    if (!matchedDid) {
      showWarning(
        bangCumTu
          ? (typedDid ? t('Mã định danh không khớp cụm từ') : t('Không tìm thấy tài khoản khớp'))
          : t('Ví trên máy không khớp tài khoản nào vừa tra'),
        (bangCumTu
          ? (typedDid
              ? t('Mã định danh vừa nhập không khớp cụm 24 từ, hoặc không có trên máy chủ.')
              : t('Các tài khoản đã lưu trên máy đều không khớp cụm 24 từ này. Kiểm tra lại cụm từ, hoặc nhập đúng tên đăng nhập / mã định danh bên dưới.'))
          : t('Ví trên máy này không ký được cho tài khoản vừa tra. Kiểm tra lại tên đăng nhập; nếu đây đúng là máy cũ của bạn thì tài khoản có thể đã được khôi phục ở máy khác.')) +
          (deviceHadWallet ? ' ' + t('Ví đang có trên máy được GIỮ NGUYÊN.') : '') +
          // NÓI RA khi khoá phần cứng đã bị thay. Đây là thứ người dùng không có
          // cách nào tự thấy, mà nó đổi hẳn việc họ nên làm tiếp: khoá cũ đã mất
          // khỏi chip và không có bản sao, nên bỏ dở ở đây là để máy nằm giữa
          // chừng — khoá mới chưa tài khoản nào công nhận.
          (hwKeyReplaced
            ? ' ' + t('Lưu ý: máy đã sinh khoá bảo mật MỚI trong bước vừa rồi, khoá cũ không còn. Hãy làm cho xong bước khôi phục này — đừng gỡ app — nếu không máy sẽ không ký được cho tài khoản nào.')
            : ''),
      );
      return;
    }

    // Tới đây máy chủ đã xác nhận KEK này ký được cho DID `matchedDid` — tức nó
    // ĐÚNG là ví của người đang cầm máy. Giờ mới được phép ghi đè.
    if (deviceHadWallet) {
      await storeMasterKek(kek);
    }

    await saveUserDid(matchedDid);

    // ĐĂNG NHẬP THẬT: mở danh tính + dispatch loginUser (khớp LoginScreen) rồi vào Main.
    const user = await phoenixKeyAuth.unlockExistingIdentity();
    if (!user) {
      throw new Error('Không mở được danh tính sau khôi phục (thiếu khoá HW?).');
    }
    await dispatch(loginUser(user as any) as any);
    showSuccess(
      t('Đã khôi phục & đăng nhập'),
      bangCumTu
        ? t('Nhận diện danh tính từ cụm 24 từ và đăng nhập thành công.')
        : t('Nhận diện danh tính từ ví sẵn có trên máy và đăng nhập thành công.'),
      { onConfirm: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) },
    );
  };

  /**
   * LỐI TẮT: máy này VẪN CÒN ví — không cần 24 từ.
   *
   * Vì sao lối này phải tồn tại, và vì sao nó không phải một tiện nghi:
   * kho khoá của iOS/Android GIỮ Master_KEK qua lần xoá-cài-lại app, còn
   * AsyncStorage thì không. Nên người cài lại app trên chính máy cũ rơi vào một
   * trạng thái mà app trước bản này không có tên gọi: ví còn nguyên, mã định danh
   * mất sạch. Cả ba lối ở màn hỏi cửa vào đều dẫn về đây, và màn này chỉ nhận 24 từ
   * — một thứ app CHƯA BAO GIỜ bắt người dùng ghi lại (`SeedExportScreen` là màn
   * tự nguyện, nằm sau lớp đăng nhập). Ai chưa từng mở màn đó thì "lối ra duy nhất"
   * mà mã nguồn nhắc tới ở `phoenixKeyAuthService` là một lối không tồn tại.
   *
   * Ở đây KEK không đổi (đọc từ chính máy), nên `deviceHadWallet=false`: không có
   * gì bị ghi đè.
   *
   * ⛔ LỐI NÀY PHẢI QUA SINH TRẮC. Đây là chỗ bản đầu của tính năng hở, và lỗ hở
   * lớn hơn cái nó vá:
   *
   *   · `getStoredMasterKek()` đọc kho khoá ở mức `WhenUnlockedThisDeviceOnly` —
   *     tức chỉ cần MÀN HÌNH MÁY đã mở, KHÔNG có bước sinh trắc riêng của app.
   *   · `taadEnclave.signEd25519(kek, …)` ký bằng ví, cũng không hỏi sinh trắc.
   *   · Tên đăng nhập KHÔNG phải bí mật: `resolveUsername` là lời gọi GET trần,
   *     không Bearer, không ký (`services/phoenixKey-api.ts`). Chính tệp đó giải
   *     thích vì sao chiều tra-theo-khoá bắt buộc ký, nhưng chiều tra-theo-tên thì
   *     không có ràng buộc ấy.
   *
   * Ba thứ đó cộng lại: người mượn được máy lúc màn hình đang mở, biết tên đăng
   * nhập của chủ máy, là gắn được khoá phần cứng CỦA HỌ vào danh tính chủ máy mà
   * không lần nào phải đưa mặt hay vân tay ra. Đường 24 từ không có lỗ này vì 24 từ
   * là thứ KHÔNG nằm trên máy — người mượn máy không lấy được. Bỏ điều kiện ấy đi
   * mà không thay bằng điều kiện khác là hạ rào, không phải mở lối.
   *
   * Điều kiện thay vào là chữ ký của chính chip: `signRaw` chỉ trả về chữ ký sau
   * khi chip đã đối chiếu xong khuôn mặt / vân tay, và sửa mã JS không đi vòng được
   * (cùng lập luận đã viết ở `LoginScreen`). Chữ ký này không gửi đi đâu — giá trị
   * của nó nằm ở chỗ nó KHÔNG TỒN TẠI nếu chủ khoá vắng mặt.
   *
   * Chip không ký được (chưa có khoá, hoặc khoá đã hỏng vì người dùng vừa thêm/xoá
   * vân tay) thì lối này ĐÓNG, không mở hé. Đóng ở đây là fail-closed đúng nghĩa:
   * người thật còn đường 24 từ và đường hỗ trợ, còn để hé thì người mượn máy đi lọt.
   */
  const doRestoreSameDevice = async () => {
    if (!kekOnDevice) return;
    try {
      setLoading(true);

      // Chuỗi thử đổi mỗi lần, sinh theo TỪNG BYTE để chuỗi hex luôn CHẴN —
      // `hexToBytes` bên native đòi độ dài chẵn và ném ngay nếu lẻ.
      let nonceHex = '';
      for (let i = 0; i < 16; i++) {
        nonceHex += ((Math.random() * 256) | 0).toString(16).padStart(2, '0');
      }
      try {
        await signRaw(
          nonceHex,
          t('Khôi phục danh tính'),
          t('Xác thực để mở lại danh tính bằng ví sẵn có trên máy này'),
        );
      } catch (bioErr: any) {
        const code = bioErr?.code;
        if (code === 'USER_CANCELED' || code === 'E_USER_CANCELED') return; // tự huỷ → im lặng
        showWarning(
          t('Chưa xác thực được trên máy này'),
          t('Lối khôi phục bằng ví sẵn có cần chính vân tay hoặc khuôn mặt của chủ máy — không có bước đó thì bất cứ ai mượn được máy cũng khôi phục được.') + ' ' +
            t('Nếu máy vừa thêm hoặc xoá vân tay/khuôn mặt thì khoá cũ đã bị hệ điều hành huỷ, và lối này không dùng được nữa.') + ' ' +
            t('Hãy dùng cụm 24 từ ở phần dưới màn hình.'),
        );
        return;
      }

      await attachThisDevice(kekOnDevice, false, 'vi-tren-may');
    } catch (e: any) {
      showWarning(
        t('Chưa khôi phục được'),
        e?.message ?? t('Không gắn được máy này vào tài khoản. Kiểm tra sóng rồi thử lại.'),
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cửa xác nhận cho LỐI TẮT — cùng một cái giá, nên cùng một lời cảnh báo.
   *
   * Bản đầu của tính năng gọi thẳng `doRestoreSameDevice`, và chú thích thẻ lối tắt
   * còn tự khen nó "không thu hồi khoá ở máy khác". Câu đó SAI, và sai theo kiểu
   * khó thấy nhất: cả hai lối gọi CÙNG một `identity.recoverDevice` bên trong
   * `attachThisDevice`, không phân nhánh theo nguồn. Nên hậu quả ghi ở đầu tệp —
   * máy chủ tăng `token_epoch` rồi bác mọi phiên và mọi token mang epoch cũ, trên
   * MỌI máy — xảy ra y hệt ở lối tắt. Lối tắt rẻ hơn ở chỗ không phải gõ 24 từ,
   * KHÔNG rẻ hơn ở chỗ hậu quả.
   */
  const handleRestoreSameDevice = () => {
    if (!username.trim()) {
      showWarning(t('Chưa có tên đăng nhập'), t('Gõ tên đăng nhập bạn đã dùng lúc tạo tài khoản, rồi bấm lại.'));
      return;
    }
    showWarning(
      t('Việc này sẽ đăng xuất mọi app và mọi máy khác'),
      t('Khôi phục sẽ gắn danh tính của bạn vào ứng dụng này. Mọi ứng dụng khác đang dùng CÙNG danh tính đó sẽ bị đăng xuất — kể cả trên điện thoại khác hoặc máy tính khác, không riêng máy này.') +
        ' ' +
        t('Dữ liệu của bạn không mất. Máy sẽ hỏi vân tay hoặc khuôn mặt ở bước tiếp theo.'),
      {
        confirmText: t('Vẫn khôi phục'),
        cancelText: t('Để sau'),
        onConfirm: () => { void doRestoreSameDevice(); },
      },
    );
  };

  const doRestore = async () => {
    if (!taadEnclave.isAvailable()) {
      showWarning(
        'Chưa sẵn sàng',
        'Lõi bảo mật (Rust core) chưa được tích hợp trong bản build này.',
      );
      return;
    }
    try {
      setLoading(true);
      // Suy Master_KEK TRONG RAM. KHÔNG ghi vào máy ở đây.
      //
      // Bản trước ghi đè ngay dòng này, trước mọi phép kiểm. "Hợp lệ BIP39" chỉ nói
      // cụm từ đúng dạng, không nói nó là cụm từ của người đang cầm máy — nên gõ
      // nhầm cụm của ví khác là gốc ví trên máy bị thay, rồi mới báo "không tìm thấy
      // tài khoản khớp". Lúc đó KEK cũ đã mất và LAMP trong ví cũ không lấy lại được.
      // Nay: suy → đối chiếu với máy chủ → CHỈ KHI khớp mới ghi (xem cuối hàm).
      const kek = await deriveMasterKekFromMnemonic(cleanPhrase);
      if (!kek || kek.length !== 64) {
        throw new Error('Master_KEK trả về không hợp lệ');
      }
      // Máy CHƯA có ví thì ghi ngay là an toàn — không có gì để mất. Máy ĐANG có ví
      // thì phải chờ đối chiếu xong, vì ghi đè là thao tác không hoàn tác được.
      const existingKek = await getStoredMasterKek();
      const deviceHadWallet = existingKek != null && existingKek !== kek;
      if (!deviceHadWallet) {
        await storeMasterKek(kek);
      }

      await attachThisDevice(kek, deviceHadWallet, 'cum-tu');
    } catch (e: any) {
      showWarning(
        'Cụm từ không hợp lệ',
        e?.message?.includes('không hợp lệ') || e?.code === 'E_MNEMONIC_INVALID'
          ? 'Kiểm tra lại: đúng 24 từ, đúng chính tả, đúng thứ tự (tiếng Anh, viết thường).'
          : (e?.message ?? 'Không khôi phục được từ cụm từ này.'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Khôi phục bằng cụm từ</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* LỐI TẮT — chỉ hiện khi ĐÃ ĐO XONG và máy thật sự còn ví. `undefined`
            (chưa đo) KHÔNG hiện: hiện rồi rút lại là hứa một lối rồi lấy đi. */}
        {kekOnDevice ? (
          <View style={styles.shortcutCard} testID="restore-shortcut-same-device">
            <View style={styles.shortcutHead}>
              <Icon name="cellphone-key" size={20} color={COLORS.success} />
              <Text style={styles.shortcutTitle}>
                Máy này vẫn còn ví của bạn — không cần 24 từ
              </Text>
            </View>
            <Text style={styles.shortcutBody}>
              Xoá app không xoá ví: nó vẫn nằm trong kho khoá của máy. Chỉ cần gõ
              <Text style={styles.bold}> tên đăng nhập</Text> bạn đã dùng lúc tạo tài
              khoản, rồi bấm nút dưới đây.
            </Text>

            <View style={styles.didWrap}>
              <TextInput
                style={styles.didInput}
                testID="restore-username"
                value={username}
                onChangeText={setUsername}
                placeholder="tên đăng nhập của bạn"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />
            </View>

            <TouchableOpacity
              testID="restore-same-device-btn"
              style={[styles.shortcutBtn, loading && { opacity: 0.5 }]}
              onPress={handleRestoreSameDevice}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Icon name="login-variant" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Khôi phục bằng ví trên máy</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.shortcutOr}>
              Không nhớ tên đăng nhập? Dùng 24 từ ở phần bên dưới.
            </Text>
          </View>
        ) : null}

        <View style={styles.infoCard}>
          <Icon name="backup-restore" size={22} color={COLORS.accent} />
          <Text style={styles.infoText}>
            Nhập đủ <Text style={styles.bold}>24 từ</Text> khôi phục (cách nhau bằng
            dấu cách, đúng thứ tự). Trên cùng máy, <Text style={styles.bold}>chỉ 24 từ</Text> là
            đủ — hệ thống tự nhận lại danh tính cũ của bạn.
          </Text>
        </View>

        <View style={[styles.inputWrap, countOk && styles.inputWrapOk]}>
          <TextInput
            style={styles.input}
            value={phrase}
            onChangeText={setPhrase}
            placeholder="ví dụ: abandon ability able about ..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.countRow}>
          <Icon
            name={countOk ? 'check-circle' : 'information-outline'}
            size={15}
            color={countOk ? COLORS.success : COLORS.textMuted}
          />
          <Text style={[styles.countText, countOk && { color: COLORS.success }]}>
            {tf('{n}/24 từ', { n: wordCount })}
          </Text>
        </View>

        {/* Tên đăng nhập — chỗ này chỉ hiện khi thẻ lối tắt KHÔNG hiện, để màn không
            có hai ô cùng nghĩa. Nó vẫn cần cho đường 24 từ: trên máy mới thì tên
            đăng nhập là cách rẻ nhất để ra DID, rẻ hơn nhiều so với gõ tay 80 ký tự. */}
        {!kekOnDevice ? (
          <>
            <Text style={styles.didLabel}>Tên đăng nhập (nếu bạn còn nhớ)</Text>
            <View style={styles.didWrap}>
              <TextInput
                style={styles.didInput}
                testID="restore-username"
                value={username}
                onChangeText={setUsername}
                placeholder="tên đăng nhập lúc tạo tài khoản"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />
            </View>
          </>
        ) : null}

        {/* DID — chỉ cần khi khôi phục trên MÁY MỚI (cài lại / đổi điện thoại). Trên
            cùng máy để trống: app tự tìm DID đã lưu để khôi phục chỉ bằng 24 từ. */}
        <Text style={styles.didLabel}>Mã định danh để đăng nhập (chỉ khi máy mới)</Text>
        <View style={styles.didWrap}>
          <TextInput
            style={styles.didInput}
            value={did}
            onChangeText={setDid}
            placeholder="did:phoenix:… (để trống nếu khôi phục trên máy cũ)"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
        </View>

        {/* Nút vẫn BẤM ĐƯỢC khi chưa đủ 24 từ (chỉ mờ đi), để `handleRestore` nói ra
            "cần đúng 24 từ — hiện có N". Khoá cứng thì người dùng chỉ thấy một cái
            nút chết: họ tin là đã nhập đúng, và không có gì chỉ cho họ chỗ sai. */}
        <TouchableOpacity
          style={[styles.primaryBtn, (!countOk || loading) && { opacity: 0.5 }]}
          onPress={handleRestore}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="lock-open-check-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Khôi phục</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.note}>
          Cụm từ chỉ được xử lý trên thiết bị của bạn — không gửi lên máy chủ.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  scroll: { padding: 20, paddingBottom: 40 },

  // Thẻ lối tắt dùng màu THÀNH CÔNG vì nó là lối DUY NHẤT còn đi được với người
  // không có 24 từ — không phải vì nó nhẹ hậu quả hơn.
  //
  // ⚠ Câu ở đây từng viết "không thu hồi khoá ở máy khác". SAI, và sai theo kiểu
  // khó thấy nhất: hai lối gọi CÙNG một `identity.recoverDevice` bên trong
  // `attachThisDevice`, không phân nhánh theo nguồn. Hậu quả thu hồi phiên trên
  // MỌI máy — ghi ở đầu tệp — xảy ra y hệt ở lối tắt. Nên cả hai lối nay cùng đi
  // qua một cửa xác nhận (`handleRestoreSameDevice` / `handleRestore`).
  // Chú thích khen một thuộc tính an ninh mà mã không có là thứ sẽ được người
  // review sau tin theo, nên nó đắt hơn một dòng mã sai.
  shortcutCard: {
    backgroundColor: COLORS.inputBg, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.success,
    padding: 14, marginBottom: 22,
  },
  shortcutHead: {
    flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8,
  },
  shortcutTitle: {
    flex: 1, fontSize: 14, fontWeight: '800', color: COLORS.text, lineHeight: 19,
  },
  shortcutBody: {
    fontSize: 13, lineHeight: 19, color: COLORS.textSub, marginBottom: 12,
  },
  shortcutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.success, borderRadius: 12, paddingVertical: 14,
  },
  shortcutOr: {
    fontSize: 12, color: COLORS.textMuted, textAlign: 'center',
    marginTop: 10, lineHeight: 17,
  },

  infoCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: COLORS.accentGlow, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.accentLight,
    padding: 14, marginBottom: 18,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19, color: COLORS.textSub },
  bold: { fontWeight: '800', color: COLORS.accent },

  inputWrap: {
    backgroundColor: COLORS.inputBg, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.border,
    padding: 4,
  },
  inputWrapOk: { borderColor: COLORS.success },
  input: {
    minHeight: 120, fontSize: 16, color: COLORS.text,
    padding: 12, lineHeight: 24,
  },

  countRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, marginBottom: 18, paddingHorizontal: 4,
  },
  countText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },

  didLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 8 },
  didWrap: {
    backgroundColor: COLORS.inputBg, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.border, marginBottom: 18,
  },
  didInput: { fontSize: 14, color: COLORS.text, paddingHorizontal: 12, paddingVertical: 12 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 15,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  note: {
    fontSize: 12, color: COLORS.textMuted, textAlign: 'center',
    marginTop: 16, lineHeight: 17,
  },
});

export default RestoreIdentityScreen;
