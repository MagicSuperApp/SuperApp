// screens/ActivationScreen.tsx
//
// Màn kích hoạt CŨ đã gỡ 2026-08-14. Route giữ lại để liên kết cũ không văng lỗi
// điều hướng; nội dung nay chỉ trỏ sang đường thật.
//
// VÌ SAO GỠ — bản cũ có ĐÚNG MỘT đường ra, và đường đó là "thành công":
//
//   handleScan()  →  setStep(1)  →  setTimeout(3000)  →  setStep(2)
//   bước 2 in:  "Kích hoạt thành công!"
//               "Tài sản đã được chuyển vào ví Cardano của bạn."
//
//   $ grep -nE "await |fetch\(|api\.|Service\." ActivationScreen.tsx   → RỖNG
//
// Màn 693 dòng, KHÔNG một lời gọi backend nào. Không có thao tác nào để thất bại,
// nên không tồn tại đường ra nào khác ngoài đường lành — và nó khẳng định với người
// dùng rằng tài sản đã chuyển. Đây là bậc nặng nhất của họ lỗi cả kho vừa đi dọn:
// một phép đo trả về giá trị hợp lệ đúng lúc nó không đo được gì.
//
// VÌ SAO GỠ HẲN THAY VÌ VÔ HIỆU HOÁ NÚT — tiền lệ đã áp hai lần trong chính kho này:
// ví ProofChat (issue #110) và module Pool (PR #130). Lý do ghi ở #110 vẫn đúng
// nguyên: trong một màn có chữ "ví" và một con số, bấm một nút mà không có gì xảy ra
// KHÔNG đọc ra là "chưa làm" — nó đọc ra là tiền vừa đi đâu mất.
//
// ĐƯỜNG THẬT nay là `WakemeScreen` ("Nhận LAMP"), vào từ màn Tôi
// (`AccountScreen.tsx:753`). Màn đó làm đúng thứ màn này giả vờ làm, và làm ngược
// lại về nguyên tắc: hai tầng cổng thật (`useCapabilityLive('phoenix')` +
// `GET /wakeme/pot`), không vẽ ô số nào khi máy chủ chưa mở, và nút "Nhận LAMP" mờ
// có chủ ý vì đường ghi còn chặn ở lớp native.
//
// Đổi ý thì dựng lại trên `wakemeService`, ĐỪNG khôi phục bản `setTimeout`.

import React from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';

const ActivationScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={styles.body}>
        <Icon name="lightning-bolt-outline" size={44} color={COLORS.textMuted} />
        <Text style={styles.title}>Nhận LAMP đã chuyển sang màn khác</Text>
        <Text style={styles.desc}>
          Màn này không còn dùng. Phần nhận LAMP khởi tạo nay nằm ở mục{' '}
          <Text style={styles.strong}>Nhận LAMP</Text> trong màn Tôi.
        </Text>

        <TouchableOpacity
          style={styles.btn}
          onPress={() => navigation.navigate('Wakeme')}
          accessibilityRole="button"
          accessibilityLabel="Mở màn Nhận LAMP"
        >
          <Text style={styles.btnText}>Mở màn Nhận LAMP</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Main')} hitSlop={8}>
          <Text style={styles.skip}>Để sau</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: {
    marginTop: 16, fontSize: 17, fontWeight: '700',
    color: COLORS.text, textAlign: 'center',
  },
  desc: {
    marginTop: 8, fontSize: 14, lineHeight: 21,
    color: COLORS.textMuted, textAlign: 'center',
  },
  strong: { fontWeight: '700', color: COLORS.text },
  btn: {
    marginTop: 24, paddingHorizontal: 22, paddingVertical: 12,
    borderRadius: 10, backgroundColor: COLORS.accent,
  },
  btnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  skip: { marginTop: 16, fontSize: 14, color: COLORS.textMuted },
});

export default ActivationScreen;
