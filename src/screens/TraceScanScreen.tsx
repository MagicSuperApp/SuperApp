// screens/TraceScanScreen.tsx
//
// SG9 §3 — MÀN QUÉT TRUY XUẤT (full-bleed, dùng-rồi-thoát). Mở camera, quét mã QR
// trên sản phẩm → soi nguồn gốc. Nhận diện được → REPLACE bằng màn chi tiết đã có
// (TreeDetail/FarmDetail/AnimalDetail…) nên "back" từ kết quả về thẳng nơi khởi
// động (Home/cổng), KHÔNG kẹt lại màn quét. Không nhận diện → báo + quét lại.
//
// Tái dùng hạ tầng camera của WebLoginScanScreen (react-native-camera-kit) +
// bộ phân giải thuần navigation/traceScan.ts. KHÔNG dựng màn provenance mới.

import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
// @ts-ignore — react-native-camera-kit không kèm types cho Camera prop scanBarcode
import { Camera } from 'react-native-camera-kit';
import { COLORS } from '../constants';
import { parseTraceCode, parseTreeCode } from '../navigation/traceScan';
import { TRACE_RESULT_ROUTE_NAME } from './TraceResultScreen';

type Step = 'scanning' | 'unknown';

const TraceScanScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();

  const [step, setStep] = useState<Step>('scanning');
  const [lastCode, setLastCode] = useState('');
  const handled = useRef(false); // chặn xử nhiều lần cùng một mã

  // Back an toàn: còn stack thì lùi; nếu mở bằng deep-link (không stack) → về Main
  // để KHÔNG thoát app (§3 — wrapper ép nút-back).
  const safeBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  };

  /**
   * Sang đường ẢNH — cửa `/api/fruit/lookup` cho người mua.
   *
   * REPLACE chứ không PUSH: cả hai màn đều là "dùng-rồi-thoát" (§3), chồng chúng
   * lên nhau thì nút back đưa người ta ngược về đúng cái khung quét vừa không
   * giúp được gì.
   */
  const goLookup = () => navigation.replace('FruitLookup');

  const onReadCode = (event: any) => {
    if (handled.current) return;
    const raw = event?.nativeEvent?.codeStringValue;
    if (!raw) return;
    handled.current = true;

    const target = parseTraceCode(raw);
    if (target) {
      // REPLACE màn quét bằng màn kết quả → "dùng-rồi-thoát".
      navigation.replace(target.route, target.params);
      return;
    }

    // Mã cây công khai `ORI-…`: máy chủ ghép thành URL `{PUBLIC_BASE_URL}/t/{code}`
    // (`server.py:730-741`) rồi phát ra dưới dạng QR ở `/qr/{code}`. Chuỗi quét được
    // là URL http, KHÔNG phải `lamp://…`, nên `parseTraceCode` ở trên không đọc nổi.
    // Đây là LỐI TẮT tra cứu xuất xứ, không phải cách định danh cây — định danh đi
    // bằng ảnh qua `/api/identify` (xem chú thích đầu `navigation/traceScan.ts`).
    const code = parseTreeCode(raw);
    if (code) {
      navigation.replace(TRACE_RESULT_ROUTE_NAME, { code });
      return;
    }

    setLastCode(raw);
    setStep('unknown');
  };

  const rescan = () => {
    handled.current = false;
    setLastCode('');
    setStep('scanning');
  };

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={safeBack} style={styles.backBtn} accessibilityLabel="Đóng">
        <Icon name="chevron-left" size={26} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Quét truy xuất</Text>
      <View style={{ width: 26 }} />
    </View>
  );

  if (step === 'scanning') {
    return (
      <View style={styles.rootDark}>
        <StatusBar barStyle="light-content" />
        <Camera style={StyleSheet.absoluteFill} scanBarcode onReadCode={onReadCode} />
        <View style={styles.overlay}>
          {Header}
          <View style={styles.scanBox} />
          <Text style={styles.scanHint}>Đưa mã QR trên sản phẩm vào khung để soi nguồn gốc</Text>
          {/* Lối ra cho ca THƯỜNG GẶP NHẤT: cầm quả trên tay mà trên quả không có
              mã nào cả. Quả được định danh bằng ẢNH, mã QR chỉ là lối tắt cấp SAU
              cho CÂY — nên bắt người mua đi tìm một mã không tồn tại là dẫn họ vào
              ngõ cụt. Xem `navigation/traceScan.ts:46`. */}
          <TouchableOpacity style={styles.altBtn} onPress={goLookup}>
            <Icon name="fruit-cherries" size={17} color="#fff" />
            <Text style={styles.altBtnText}>Không có mã QR? Chụp quả</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // step === 'unknown' — mã không thuộc hệ Aladin / chưa đăng ký truy xuất.
  return (
    <View style={styles.rootDark}>
      <StatusBar barStyle="light-content" />
      {Header}
      <View style={styles.center}>
        <Icon name="magnify-scan" size={52} color={COLORS.accentLight} />
        <Text style={styles.title}>Chưa nhận diện được mã</Text>
        <Text style={styles.subtle}>
          Mã này chưa gắn dữ liệu truy xuất Aladin. Hãy thử mã QR trên sản phẩm đã định danh.
        </Text>
        {!!lastCode && (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>MÃ ĐỌC ĐƯỢC</Text>
            <Text style={styles.codeVal} numberOfLines={2}>{lastCode}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.primaryBtn} onPress={rescan}>
          <Icon name="reload" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Quét lại</Text>
        </TouchableOpacity>
        {/* Đây là chỗ người mua rơi vào khi bao bì KHÔNG có mã Aladin — tức phần
            lớn trường hợp hôm nay. Mời "quét lại" một mã không tồn tại là vòng
            lặp vô nghĩa; đường ảnh mới là đường định danh thật. */}
        <TouchableOpacity style={styles.altBtn} onPress={goLookup}>
          <Icon name="fruit-cherries" size={17} color="#fff" />
          <Text style={styles.altBtnText}>Chụp quả để tra cứu</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={safeBack}>
          <Text style={styles.linkText}>Đóng</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  rootDark: { flex: 1, backgroundColor: '#0B0F0D' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-start' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  scanBox: {
    alignSelf: 'center', marginTop: 80, width: 240, height: 240,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 24,
  },
  scanHint: {
    color: '#fff', textAlign: 'center', marginTop: 20, fontSize: 14, opacity: 0.9,
    paddingHorizontal: 32, lineHeight: 20,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  title: { fontSize: 19, fontWeight: '800', color: '#fff', marginTop: 4 },
  subtle: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20 },
  codeCard: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', gap: 4, maxWidth: '100%',
  },
  codeLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  codeVal: { fontSize: 13, fontWeight: '600', color: '#fff', textAlign: 'center' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28,
    marginTop: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Nút phụ: viền, không nền đặc — nó là LỐI RA thứ hai, không được cạnh tranh
  // thị giác với hành động chính của từng màn (quét / quét lại).
  altBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 13, paddingHorizontal: 22, marginTop: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignSelf: 'center',
  },
  altBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  linkText: { color: COLORS.accentLight, fontSize: 14, marginTop: 4 },
});

export default TraceScanScreen;
