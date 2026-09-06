/**
 * SeedExportScreen — Xuất cụm 24 từ khôi phục (BIP39) cho PhoenixKey Enclave.
 *
 * Tương đương Enclave/lib/screens/seed_export_screen.dart. Cụm 24 từ CHÍNH LÀ
 * Master_KEK (32 byte = 256-bit entropy) — bản sao lưu DUY NHẤT của gốc-tin-cậy.
 * Sinh qua Rust core (taadEnclave): generateMasterKek → masterKekToMnemonic.
 *
 * AN TOÀN:
 *   - Master_KEK/24 từ chỉ tồn tại trong RAM lúc hiển thị, KHÔNG log/persist thô.
 *   - Phase sau: wrap Master_KEK bằng Secure Enclave/Keystore + lưu để derive ví.
 *
 * ── Vì sao màn này KHÔNG giục người dùng ghi ra giấy ──────────────────────────
 * PhoenixKey sinh ra để BỎ cụm từ khôi phục, không phải để phát nó ra. Cụm 24 từ
 * là bản sao KHÔNG THU HỒI ĐƯỢC của toàn bộ ví: ai đọc được tờ giấy đó thì có ví,
 * vĩnh viễn, và chủ ví không có cách nào huỷ nó. Đổi khoá cũng không cứu — cụm từ
 * SINH RA khoá, nên nó vẫn mở được ví mới.
 *
 * Bản trước của màn này giục ("Ghi ra giấy, cất nơi an toàn") rồi CHẶN nút Hoàn
 * tất sau một ô đánh dấu "Tôi đã ghi lại đủ 24 từ" — tức là buộc người dùng khai
 * đã làm một việc nguy hiểm thì mới thoát ra được. Nay: xuất là TUỲ CHỌN, nói rõ
 * rủi ro trước khi hiện, và đẩy người dùng sang việc an toàn hơn làm được ngay
 * hôm nay — đặt người bảo hộ, thứ đường khôi phục on-chain sẽ đọc.
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Platform, ActivityIndicator, Clipboard,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import { showInfo, showWarning } from '../utils/alert';
import taadEnclave from '../sdk/taadEnclave';
import { getOrCreateMasterKek } from '../services/masterKekStore';
import { signRaw, currentUserDid } from '../sdk/phoenixKey';
import { PhoenixKeyNativeError } from '../services/phoenixKey-native';

const SeedExportScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();

  const [words, setWords] = useState<string[] | null>(null);
  const [did, setDid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);

  /**
   * ── Vì sao cổng đứng GIỮA bước 1 và bước 3, không đứng trước cả hàm ─────────
   * Màn này làm HAI việc khác hẳn nhau bằng một nút:
   *   (1) TẠO ví — `getOrCreateMasterKek()` sinh + lưu KEK nếu máy chưa có
   *       (masterKekStore.ts, chú thích "khởi tạo ví lần đầu").
   *   (3) LỘ bí mật — `masterKekToMnemonic()` biến KEK thành 24 từ đọc được.
   *
   * Hai lối vào khác dẫn người dùng tới đây để làm việc (1), không phải việc (3):
   * màn Nhận LAMP và màn Ví đều gọi màn này bằng nhãn "Thiết lập ví". Đặt cổng
   * trước CẢ hàm thì ai không qua được cổng sẽ KHÔNG CÓ VÍ và không nhận được
   * LAMP — tức cổng bảo mật biến thành cổng chặn người dùng khỏi tài sản của họ.
   * Nên bước (1) chạy trước, không cổng; cổng chỉ chắn bước (3).
   *
   * ── Vì sao là `signRaw`, KHÔNG phải `simplePrompt` ──────────────────────────
   * `simplePrompt()` bật hộp thoại từ JS và trả về một `boolean` ở tầng JS: ai
   * sửa được luồng JS là đổi được nó thành true. Đường đăng nhập của app này đã
   * bỏ nó vì đúng lý do đó (LoginScreen.tsx, khối "XÁC THỰC BẰNG CHÍNH KHOÁ").
   * `signRaw` để CHIP bật hộp thoại và chỉ trả chữ ký khi chip đã đối chiếu xong
   * sinh trắc — chữ ký này không gửi đi đâu, giá trị của nó nằm ở chỗ nó KHÔNG
   * TỒN TẠI nếu chủ khoá vắng mặt.
   *
   * ⚠️ Giới hạn phải nói thẳng, đừng đọc cổng này rộng hơn nó: nó chắn NGƯỜI
   * đang cầm máy. Nó KHÔNG chắn mã chạy trong cùng tiến trình JS — khoá AES bọc
   * Master_KEK ở TaadEnclaveModule dựng KHÔNG kèm `setUserAuthenticationRequired`
   * (khác PhoenixKeyModule, nơi có), nên `secureLoad` + `masterKekToMnemonic` gọi
   * thẳng được. Bịt đường đó là đổi ở tầng Keystore/Keychain, và nó đụng mọi ví
   * đã tồn tại nên phải có đường di trú — việc RIÊNG, chưa làm ở đây.
   */
  const handleGenerate = async () => {
    if (!taadEnclave.isAvailable()) {
      showWarning(
        'Chưa sẵn sàng',
        'Lõi bảo mật (Rust core) chưa được tích hợp trong bản build này. ' +
          'Cần build lại app sau khi tích hợp taad_enclave_core.',
      );
      return;
    }
    try {
      setLoading(true);
      // BƯỚC 1 — TẠO VÍ. Không cổng, xem khối chú thích trên.
      // KEK BỀN VỮNG: lấy KEK ví đã lưu, hoặc sinh + lưu lần đầu → 24 từ ỔN ĐỊNH
      // (cùng cụm mỗi lần mở, đúng nghĩa backup). KHÔNG sinh KEK mới mỗi lần.
      const kek = await getOrCreateMasterKek();

      // BƯỚC 2 — CỔNG. Sinh theo TỪNG BYTE để chuỗi hex luôn CHẴN: bên native
      // `hexToBytes` đòi `length % 2 == 0` và ném ngay nếu lẻ, và lỗi đó lại trả
      // về đúng mã mà app dịch thành "khoá trên máy hỏng".
      let nonceHex = '';
      for (let i = 0; i < 16; i++) {
        nonceHex += ((Math.random() * 256) | 0).toString(16).padStart(2, '0');
      }
      await signRaw(
        nonceHex,
        'Xác thực để hiện cụm 24 từ',
        'Cụm từ này mở được toàn bộ ví của bạn.',
      );

      // BƯỚC 3 — LỘ. Chỉ tới đây khi chip đã xác nhận chủ khoá có mặt.
      const phrase = await taadEnclave.masterKekToMnemonic(kek);
      const list = phrase.split(/\s+/).filter(Boolean);
      if (list.length !== 24) {
        throw new Error(`Cụm từ không đúng 24 từ (nhận ${list.length})`);
      }
      // DID đi CÙNG cụm từ — xem khối chú thích ở chỗ hiển thị bên dưới.
      setDid(await currentUserDid());
      setWords(list);
      setRevealed(true);
    } catch (e: any) {
      // Mã lỗi native đã phân biệt sẵn. Gộp hết thành một câu "thất bại" là bắt
      // người dùng đoán xem họ vừa tự huỷ, hay máy đang khoá tạm, hay khoá hỏng.
      const code = (e as { code?: string } | null)?.code;
      if (code === PhoenixKeyNativeError.USER_CANCELED) {
        return; // tự huỷ: im lặng, ví đã tạo xong ở bước 1
      }
      if (code === PhoenixKeyNativeError.BIOMETRIC_LOCKOUT) {
        showWarning(
          'Máy đang tạm khoá sinh trắc',
          'Sai sinh trắc học nhiều lần nên máy đang tạm khoá. Chờ khoảng 30 giây rồi thử lại, ' +
            'hoặc mở khoá máy bằng mã PIN trước. Ví của bạn KHÔNG bị ảnh hưởng.',
        );
        return;
      }
      showWarning('Lỗi', e?.message ?? 'Không tạo được cụm từ khôi phục.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!words) return;
    showWarning(
      'Sao chép cụm từ?',
      'Clipboard KHÔNG an toàn (app khác đọc được). Chỉ dùng tạm rồi xoá. ' +
        'Tốt nhất nên GHI RA GIẤY.',
      {
        confirmText: 'Vẫn sao chép',
        onConfirm: () => {
          Clipboard.setString(words.join(' '));
          showInfo('Đã sao chép', 'Hãy dán vào nơi an toàn rồi xoá clipboard.');
        },
      },
    );
  };

  const handleDone = () => {
    // Xoá khỏi RAM màn hình.
    setWords(null);
    setDid(null);
    setRevealed(false);
    navigation.goBack();
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cụm từ khôi phục</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Nói RỦI RO trước, không giục. Người dùng phải biết mình đang đánh đổi
            cái gì TRƯỚC khi cụm từ hiện lên màn hình — sau khi hiện thì muộn rồi. */}
        <View style={styles.dangerCard}>
          <Icon name="alert-octagon-outline" size={22} color="#B3261E" />
          <Text style={styles.warnText}>
            Ghi cụm 24 từ ra giấy là <Text style={styles.bold}>tự tạo một chìa khoá thứ hai</Text> cho
            ví của bạn. Ai đọc được tờ giấy đó thì mở được ví, và bạn
            {' '}<Text style={styles.bold}>không thu hồi được</Text> — đổi khoá cũng không cứu, vì
            chính cụm từ sinh ra khoá.
          </Text>
        </View>

        {/* Việc AN TOÀN HƠN và làm được ngay hôm nay. Để trên nút hiện cụm từ, vì
            phần lớn người vào đây chỉ đang tìm cách khỏi mất ví. */}
        <TouchableOpacity
          style={styles.saferCard}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Guardian')}
        >
          <Icon name="account-multiple-check-outline" size={22} color={COLORS.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.saferTitle}>Cách an toàn hơn: đặt người bảo hộ</Text>
            <Text style={styles.saferSub}>
              Không có giấy tờ nào để mất. Đặt ngay bây giờ thì lúc mất máy đã sẵn sàng.
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.warnCard}>
          <Icon name="shield-key-outline" size={22} color={COLORS.warning} />
          <Text style={styles.warnText}>
            Hôm nay đường khôi phục bằng người bảo hộ chưa chạy được tới cuối, nên cụm 24 từ vẫn là
            bản dự phòng duy nhất nếu mất máy. Nó là bản sao <Text style={styles.bold}>tạm thời</Text>,
            không phải cách hệ định vận hành. Khi đường kia mở, hãy xoay khoá trước rồi mới huỷ giấy —
            đừng huỷ trước.
          </Text>
        </View>

        {!revealed ? (
          <>
            <View style={styles.placeholderCard}>
              <Icon name="eye-off-outline" size={40} color={COLORS.accentLight} />
              <Text style={styles.placeholderText}>
                Bạn không bắt buộc phải xuất cụm từ. Nếu vẫn muốn, hãy chắc không ai nhìn màn hình của bạn.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
              onPress={handleGenerate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Icon name="key-plus" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Vẫn hiện cụm 24 từ</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Lưới 24 từ */}
            <View style={styles.grid}>
              {words!.map((w, i) => (
                <View key={i} style={styles.wordChip}>
                  <Text style={styles.wordIndex}>{i + 1}</Text>
                  <Text style={styles.wordText}>{w}</Text>
                </View>
              ))}
            </View>

            {/* ── KHÔNG AI ĐƯỢC HỎI CỤM TỪ ─────────────────────────────────────
                Cảnh báo phía trên màn nói về mối đe doạ BỊ ĐỘNG ("ai đọc được tờ
                giấy"). Cách mất tiền phổ biến hơn là CHỦ ĐỘNG: có người gọi điện
                tự xưng nhân viên hỗ trợ, xin cụm từ để "giúp khôi phục". Người
                dùng đang nhìn 24 từ là người sắp bị hỏi, nên câu này phải nằm ở
                đây chứ không nằm trong tài liệu. */}
            <View style={styles.scamCard}>
              <Icon name="account-alert-outline" size={20} color="#B3261E" />
              <Text style={styles.scamText}>
                Không ai — <Text style={styles.bold}>kể cả nhân viên hỗ trợ của ứng dụng này</Text> —
                có quyền hỏi bạn 24 từ. Ai hỏi, người đó đang lừa bạn.
              </Text>
            </View>

            {/* ── DID phải được chép CÙNG 24 từ ────────────────────────────────
                Trước đây màn này không hiện DID ở đâu cả. Nhưng khi khôi phục
                trên MÁY MỚI, `RestoreIdentityScreen` không suy được DID chỉ từ 24
                từ nên nó BẮT NGƯỜI DÙNG GÕ DID vào (xem nhánh "Máy mới — cần nhập
                mã định danh" ở màn đó).

                Nghĩa là người dùng chép đủ 24 từ đúng như màn này dặn, mất máy,
                rồi không khôi phục được — vì thiếu một dòng chưa ai bảo họ chép.
                Đây là đường mất ví KHÔNG cần kẻ tấn công nào, và nạn nhân là
                người đã làm đúng mọi việc được dặn.

                DID là phần CÔNG KHAI, chia sẻ được — nên hiện nó ở đây không mở
                thêm rủi ro nào, mà đóng một đường mất vĩnh viễn. */}
            {did ? (
              <View style={styles.didCard}>
                <Text style={styles.didLabel}>Mã định danh — chép dòng này cùng 24 từ</Text>
                <Text style={styles.didValue} selectable>
                  {did}
                </Text>
                <Text style={styles.didNote}>
                  Đổi sang máy mới thì <Text style={styles.bold}>cần cả dòng này</Text>, 24 từ
                  không đủ. Dòng này không phải bí mật — gửi cho chính mình để giữ cũng được.
                </Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
              <Icon name="content-copy" size={15} color={COLORS.accent} />
              <Text style={styles.copyBtnText}>Sao chép (kém an toàn)</Text>
            </TouchableOpacity>

            {/* Xác nhận đã lưu */}
            {/* Không còn ô "Tôi đã ghi lại đủ 24 từ" chặn nút. Ghi hay không là
                việc của người dùng; bắt họ khai đã ghi mới cho thoát là ép làm một
                việc rủi ro, và cái khai đó cũng không kiểm được. */}
            <TouchableOpacity style={styles.primaryBtn} onPress={handleDone}>
              <Icon name="check" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Đóng</Text>
            </TouchableOpacity>
          </>
        )}
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

  dangerCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#FDECEA', borderRadius: 14,
    borderWidth: 1, borderColor: '#F3B9B2',
    padding: 14, marginBottom: 14,
  },
  saferCard: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 14, marginBottom: 14,
  },
  saferTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  saferSub: { fontSize: 12, lineHeight: 17, color: COLORS.textMuted, marginTop: 2 },
  warnCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#FBF3E6', borderRadius: 14,
    borderWidth: 1, borderColor: '#EAD9B8',
    padding: 14, marginBottom: 18,
  },
  warnText: { flex: 1, fontSize: 13, lineHeight: 19, color: COLORS.textSub },
  bold: { fontWeight: '800', color: COLORS.warning },

  scamCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#FDECEA', borderRadius: 14,
    borderWidth: 1, borderColor: '#F3B9B2',
    padding: 14, marginTop: 16, marginBottom: 14,
  },
  scamText: { flex: 1, fontSize: 13, lineHeight: 19, color: '#7A1C13' },

  didCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 14, marginBottom: 14,
  },
  didLabel: { fontSize: 12, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  // Chữ đều nét: DID là chuỗi hex dài, người dùng phải chép TAY ra giấy nên
  // `0`/`O` và `1`/`l` phải phân biệt được bằng mắt.
  didValue: {
    fontSize: 12, lineHeight: 18, color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  didNote: { fontSize: 12, lineHeight: 17, color: COLORS.textMuted, marginTop: 8 },

  placeholderCard: {
    alignItems: 'center', gap: 12, padding: 28,
    backgroundColor: COLORS.inputBg, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed',
    marginBottom: 18,
  },
  placeholderText: {
    fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19,
  },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    gap: 10, marginBottom: 16,
  },
  wordChip: {
    width: '31%', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.card, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 10, paddingHorizontal: 8,
  },
  wordIndex: {
    fontSize: 11, fontWeight: '700', color: COLORS.accentLight, minWidth: 16,
  },
  wordText: { fontSize: 14, fontWeight: '600', color: COLORS.text },

  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, marginBottom: 8,
  },
  copyBtnText: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },

  confirmRow: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 4, marginBottom: 8,
  },
  confirmText: { flex: 1, fontSize: 13, color: COLORS.textSub, lineHeight: 19 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 15,
    marginTop: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default SeedExportScreen;
