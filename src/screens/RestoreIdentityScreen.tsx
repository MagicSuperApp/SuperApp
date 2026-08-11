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

import React, { useMemo, useState } from 'react';
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
import { showWarning, showSuccess } from '../utils/alert';
import taadEnclave from '../sdk/taadEnclave';
import { restoreMasterKekFromMnemonic } from '../services/masterKekStore';
import { phoenixKeyApi, PhoenixKeyApiError } from '../services/phoenixKey-api';
import { enrollKeypair, ownerPublicKey, saveUserDid, currentUserDid } from '../sdk/phoenixKey';
import { phoenixKeyAuth } from '../services/phoenixKeyAuthService';
import { loginUser } from '../store/userSlice';
import { countMnemonicWords, normalizeMnemonic } from '../utils/mnemonic';

const DID_RE = /^did:phoenix:[a-z2-7]{13}:[0-9a-f]{64}$/;
// Registry {username, did} app lưu lúc đăng ký (SignUpBiometricScreen) — dùng để
// TỰ tìm lại DID trên CÙNG máy, khôi phục chỉ bằng 24 từ (không cần gõ DID).
const PHOENIX_USERS_KEY = '@phoenixkey/users';
const genNonce = (): string => {
  let s = '';
  for (let i = 0; i < 32; i++) s += ((Math.random() * 16) | 0).toString(16);
  return s;
};

const RestoreIdentityScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();
  const dispatch = useDispatch();

  const [phrase, setPhrase] = useState('');
  const [did, setDid] = useState('');
  const [loading, setLoading] = useState(false);

  // Cụm từ đã CHUẨN HOÁ — dùng cho cả phép đếm lẫn phép khôi phục. Xem
  // `utils/mnemonic.ts`: chép cụm từ kèm số thứ tự / dấu phẩy làm phép đếm cũ ra
  // 48 "từ" trong khi trên màn nhìn vẫn đúng 24, và nút Khôi phục chết không rõ lý do.
  const cleanPhrase = useMemo(() => normalizeMnemonic(phrase), [phrase]);
  const wordCount = useMemo(() => countMnemonicWords(phrase), [phrase]);
  const countOk = wordCount === 24;

  const handleRestore = async () => {
    if (!taadEnclave.isAvailable()) {
      showWarning(
        'Chưa sẵn sàng',
        'Lõi bảo mật (Rust core) chưa được tích hợp trong bản build này.',
      );
      return;
    }
    if (!countOk) {
      showWarning('Chưa đủ', `Cần đúng 24 từ — hiện có ${wordCount}.`);
      return;
    }
    try {
      setLoading(true);
      // Validate cụm từ → Master_KEK → LƯU vào secure storage (ghi đè KEK ví hiện
      // có). Sau bước này SeedExport sẽ hiện đúng cụm này + ví derive nhất quán.
      const kek = await restoreMasterKekFromMnemonic(cleanPhrase);
      if (!kek || kek.length !== 64) {
        throw new Error('Master_KEK trả về không hợp lệ');
      }

      // ── TỰ TÌM DID trên MÁY (KHÔNG đụng backend) → 24 từ là đủ trên cùng máy ──
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
      const uniqueDids = [...new Set(candidates.filter(d => DID_RE.test(d)))];

      if (uniqueDids.length === 0) {
        // Máy MỚI (cài lại/đổi máy) — chưa từng lưu DID nào. Chỉ trường hợp này mới
        // cần user nhập DID (máy không thể suy ra DID chỉ từ 24 từ + không gọi backend).
        showWarning(
          'Máy mới — cần nhập mã định danh',
          'Đã lưu ví an toàn. Máy này chưa từng đăng nhập nên không có mã định danh để tự khôi phục. ' +
            'Nếu là máy MỚI, nhập mã định danh của bạn vào ô bên dưới.',
        );
        return;
      }

      // Khoá HW của máy này — chuẩn bị 1 lần, dùng chung cho mọi lần thử.
      const taadPub = await taadEnclave.deriveTaadPubkey(kek);
      let newHwPub: string;
      try {
        newHwPub = (await enrollKeypair()).publicKeyHex;
      } catch {
        newHwPub = await ownerPublicKey();
      }

      // Thử từng DID ứng viên (ký bằng KEK — KHÔNG cần vân tay mỗi lần).
      let matchedDid: string | null = null;
      for (const cand of uniqueDids) {
        const nonce = genNonce();
        const challenge = `PHOENIXKEY_RECOVER:${cand}:${newHwPub}:${nonce}`;
        const signature = await taadEnclave.signEd25519(kek, challenge);
        if (!signature) continue;
        try {
          await phoenixKeyApi.identity.recoverDevice({
            userDid: cand,
            newHwPublicKeyHex: newHwPub,
            taadPublicKeyHex: taadPub,
            signature,
            nonce,
          });
          matchedDid = cand; // gắn thành công → đúng DID
          break;
        } catch (e) {
          if (e instanceof PhoenixKeyApiError) {
            // 409 = HW pubkey đã gắn (máy này đã recover DID này) → coi là ĐÚNG DID.
            if (e.httpStatus === 409) { matchedDid = cand; break; }
            // 403 chữ ký không khớp / 404 DID không tồn tại / 2002 user not found →
            // DID này SAI cụm 24 từ → thử DID kế tiếp.
            if (e.httpStatus === 403 || e.httpStatus === 404 || e.code === 2002) continue;
          }
          throw e; // lỗi mạng/khác → dừng, báo lỗi.
        }
      }

      if (!matchedDid) {
        showWarning(
          typedDid ? 'Mã định danh không khớp cụm từ' : 'Không tìm thấy tài khoản khớp',
          typedDid
            ? 'Mã định danh vừa nhập không khớp cụm 24 từ, hoặc không có trên máy chủ.'
            : 'Các tài khoản đã lưu trên máy đều không khớp cụm 24 từ này. Kiểm tra lại cụm từ, ' +
              'hoặc nhập đúng mã định danh vào ô bên dưới nếu là máy mới.',
        );
        return;
      }

      await saveUserDid(matchedDid);

      // ĐĂNG NHẬP THẬT: mở danh tính + dispatch loginUser (khớp LoginScreen) rồi vào Main.
      const user = await phoenixKeyAuth.unlockExistingIdentity();
      if (!user) {
        throw new Error('Không mở được danh tính sau khôi phục (thiếu khoá HW?).');
      }
      await dispatch(loginUser(user as any) as any);
      showSuccess(
        'Đã khôi phục & đăng nhập',
        'Nhận diện danh tính từ cụm 24 từ và đăng nhập thành công.',
        { onConfirm: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) },
      );
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
            {wordCount}/24 từ
          </Text>
        </View>

        {/* DID — chỉ cần khi khôi phục trên MÁY MỚI (cài lại / đổi điện thoại). Trên
            cùng máy để trống: app tự tìm DID đã lưu để khôi phục chỉ bằng 24 từ. */}
        <Text style={styles.didLabel}>Mã định danh để đăng nhập (chỉ khi máy mới)</Text>
        <View style={styles.didWrap}>
          <TextInput
            style={styles.didInput}
            value={did}
            onChangeText={setDid}
            placeholder="did:phoenix:…  (để trống nếu khôi phục trên máy cũ)"
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
