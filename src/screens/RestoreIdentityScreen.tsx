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
import { COLORS } from '../constants';
import { showWarning, showSuccess } from '../utils/alert';
import taadEnclave from '../sdk/taadEnclave';
import { restoreMasterKekFromMnemonic } from '../services/masterKekStore';
import { phoenixKeyApi, PhoenixKeyApiError } from '../services/phoenixKey-api';
import { enrollKeypair, ownerPublicKey, saveUserDid, currentUserDid } from '../sdk/phoenixKey';
import { phoenixKeyAuth } from '../services/phoenixKeyAuthService';
import { loginUser } from '../store/userSlice';

const DID_RE = /^did:phoenix:[a-z2-7]{13}:[0-9a-f]{64}$/;
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

  // Prefill DID nếu máy đã lưu (đăng nhập lại trên CÙNG máy) → user khỏi gõ tay.
  // Máy mới hoàn-toàn: trống → user tự nhập DID để gắn thiết bị + đăng nhập.
  useEffect(() => {
    currentUserDid().then(d => { if (d) setDid(prev => prev || d); }).catch(() => {});
  }, []);

  // Đếm số từ realtime để hướng dẫn người dùng (cần đúng 24).
  const wordCount = useMemo(
    () => phrase.trim().split(/\s+/).filter(Boolean).length,
    [phrase],
  );
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
      const kek = await restoreMasterKekFromMnemonic(phrase);
      if (!kek || kek.length !== 64) {
        throw new Error('Master_KEK trả về không hợp lệ');
      }

      // DID để ĐĂNG NHẬP LẠI: ưu tiên user nhập, else DID đã lưu trên máy (prefill).
      // DID KHÔNG derive được từ KEK (gồm slot+hash ngẫu nhiên) nên bắt buộc phải có.
      const cleanDid = did.trim() || ((await currentUserDid()) ?? '');
      if (!cleanDid) {
        showWarning(
          'Cần DID để đăng nhập',
          'Đã lưu ví an toàn trên máy. Nhưng để ĐĂNG NHẬP lại cần nhập DID của bạn ' +
            '(did:phoenix:…) vào ô "Gắn vào DID". Máy không tự suy ra DID từ cụm 24 từ.',
        );
        return;
      }
      if (!DID_RE.test(cleanDid)) {
        throw new Error('DID chưa đúng định dạng did:phoenix.');
      }

      // Gắn thiết bị này vào DID (Mode B recover-device): TAAD_Key khôi phục ký
      // challenge (Ed25519) → POST /identity/recover-device (revoke owner-key cũ,
      // gắn HW_Key mới của máy này). 409 = HW pubkey ĐÃ gắn (cùng máy) → coi như OK.
      const taadPub = await taadEnclave.deriveTaadPubkey(kek);
      let newHwPub: string;
      try {
        newHwPub = (await enrollKeypair()).publicKeyHex;
      } catch {
        // Thiết bị đã có khoá HW → dùng lại khoá hiện có.
        newHwPub = await ownerPublicKey();
      }
      const nonce = genNonce();
      const challenge = `PHOENIXKEY_RECOVER:${cleanDid}:${newHwPub}:${nonce}`;
      const signature = await taadEnclave.signEd25519(kek, challenge);
      if (!signature) throw new Error('Ký bằng TAAD_Key thất bại');
      try {
        await phoenixKeyApi.identity.recoverDevice({
          userDid: cleanDid,
          newHwPublicKeyHex: newHwPub,
          taadPublicKeyHex: taadPub,
          signature,
          nonce,
        });
      } catch (e) {
        // 409 = HW pubkey đã đăng ký (máy này đã recover trước đó) → bỏ qua, đăng
        // nhập tiếp. Lỗi khác (403 chữ ký sai / 404 DID không tồn tại) → ném ra.
        if (!(e instanceof PhoenixKeyApiError && e.httpStatus === 409)) throw e;
      }
      await saveUserDid(cleanDid);

      // ĐĂNG NHẬP THẬT: mở danh tính + dispatch loginUser (khớp LoginScreen) rồi vào
      // Main. Thiếu bước này thì trước đây chỉ lưu KEK/goBack → không vào được app.
      const user = await phoenixKeyAuth.unlockExistingIdentity();
      if (!user) {
        throw new Error('Không mở được danh tính sau khôi phục (thiếu khoá HW?).');
      }
      await dispatch(loginUser(user as any) as any);
      showSuccess(
        'Đã khôi phục & đăng nhập',
        'Danh tính đã gắn vào máy này và đăng nhập thành công.',
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
            dấu cách, đúng thứ tự). Hệ thống sẽ khôi phục lại CHÍNH danh tính cũ của bạn.
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

        {/* DID — cần để ĐĂNG NHẬP lại (gắn máy này vào danh tính). Tự điền nếu máy
            đã lưu DID; máy mới thì nhập tay (máy không suy ra DID từ 24 từ). */}
        <Text style={styles.didLabel}>DID để đăng nhập</Text>
        <View style={styles.didWrap}>
          <TextInput
            style={styles.didInput}
            value={did}
            onChangeText={setDid}
            placeholder="did:phoenix:…  (nhập DID của bạn để đăng nhập)"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, (!countOk || loading) && { opacity: 0.5 }]}
          onPress={handleRestore}
          disabled={!countOk || loading}
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
