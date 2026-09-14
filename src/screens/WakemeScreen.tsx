/**
 * WakemeScreen — nhận phần LAMP khởi tạo vào vault của mình (Wakeme / Activation Vault).
 *
 * NGUYÊN TẮC CỦA MÀN NÀY: KHÔNG BAO GIỜ VẼ MỘT CON SỐ MÌNH KHÔNG CÓ.
 * Khi máy chủ chưa mở tính năng, màn hiện đúng câu "chưa mở" và KHÔNG vẽ ô số nào —
 * không điền 0, không điền dấu gạch trong một ô trông như ô dữ liệu. Số 0 đọc y hệt
 * một câu trả lời thật, và đó chính là kiểu lỗi mà cả app này vừa phải đi dọn.
 *
 * Hai tầng cổng, vì "máy chủ sống" KHÁC "tính năng đã mở":
 *   tầng 1 — `useCapabilityLive('phoenix')` thăm `/actuator/health`;
 *   tầng 2 — `GET /wakeme/pot` (công khai, không cần đăng nhập, không đụng ví của ai),
 *            ném 9501 khi máy chủ chưa cấu hình. Xem `wakemeService.isFeatureOpen`.
 * Nhờ tầng 2 là lời gọi thật, màn này TỰ SỐNG DẬY khi Phoenix set biến môi trường —
 * không cần dựng lại app.
 *
 * Nút "Nhận LAMP" đang MỜ có chủ ý: đường ghi chặn ở lớp native (app chưa ký được
 * bằng khoá TAAD + khoá thiết bị). Chi tiết ở `wakemeService.getLamp()`. Thà mờ từ
 * đầu còn hơn bấm được rồi chết ở bước cuối sau khi người dùng đã xác nhận.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import { fmtLamp } from '../utils/token';
import { useCapabilityLive } from '../config/useCapabilityLive';
import { getStoredMasterKek } from '../services/masterKekStore';
import { isFeatureOpen, WAKEME_NOT_CONFIGURED, type FeatureProbe } from '../services/wakemeService';
import { tk } from '../i18n/keys';

type Phase = 'checking' | 'offline' | 'no_wallet' | 'not_open' | 'ready' | 'pot_empty' | 'error';

/**
 * Mã lỗi backend → chữ người dùng đọc được. Nguồn: `ErrorCode.java` +
 * `GetLampPreflight.java`. Mỗi dòng nói được BƯỚC TIẾP THEO, không chỉ nói hỏng.
 *
 * XUẤT RA để bài kiểm ghim được từng nhánh mà không phải dựng cả màn (màn này kéo
 * theo camera/sinh trắc). Đây là phần duy nhất của tệp sai được một cách IM LẶNG:
 * một mã lỗi trỏ nhầm câu vẫn hiện ra một hộp thoại trông bình thường.
 */
export function explain(code: number, raw: string): { title: string; body: string } {
  switch (code) {
    case WAKEME_NOT_CONFIGURED:
      return {
        title: 'Tính năng chưa mở',
        body: 'Máy chủ chưa bật phần nhận LAMP. Chưa cần làm gì — quay lại sau.',
      };
    case 1351:
      return {
        title: 'Danh tính chưa có khoá trên chuỗi',
        body: 'Bạn cần thiết lập ví (cụm 24 từ) trước, để danh tính có khoá neo trên chuỗi.',
      };
    case 1403:
      return { title: 'Danh tính đang bị khoá', body: 'Liên hệ hỗ trợ để mở lại.' };
    // 1405 = LỆCH GIỜ. Máy chủ tách nó khỏi 1403 (issue #274) đúng vì hai ca này
    // đòi người dùng làm hai việc khác hẳn nhau, mà trước đó chúng về chung một
    // câu. Ở màn này câu cũ còn tệ hơn ở chỗ khác: "Liên hệ hỗ trợ để mở lại" đẩy
    // người bị lệch đồng hồ đi gọi điện cho một việc họ tự sửa trong 15 giây.
    case 1405:
      return {
        title: tk('identity.err.clockSkew.title'),
        body: tk('identity.err.clockSkew.body'),
      };
    case 1352:
      return { title: 'Kho LAMP tạm hết', body: 'Kho sẽ được nạp lại. Quay lại sau.' };
    case 1304:
      return { title: 'Phiên đã hết hạn', body: 'Đăng nhập lại rồi thử lại.' };
    case 5101:
      return { title: 'Không nối được mạng Cardano', body: 'Mạng chuỗi đang trục trặc. Thử lại sau.' };
    case -1:
      return { title: 'Không có mạng', body: 'Kiểm tra kết nối rồi thử lại.' };
    default:
      return { title: 'Chưa lấy được thông tin', body: raw };
  }
}

const WakemeScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();
  const phoenixLive = useCapabilityLive('phoenix');

  const [phase, setPhase] = useState<Phase>('checking');
  const [probe, setProbe] = useState<FeatureProbe | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Tầng 1 hỏng thì KHÔNG gọi mạng — đỡ một vòng chờ vô ích ngoài vườn sóng yếu.
    if (!phoenixLive) { setPhase('offline'); return; }

    const kek = await getStoredMasterKek();
    if (!kek) { setPhase('no_wallet'); return; }

    const p = await isFeatureOpen();
    setProbe(p);
    if (!p.open) {
      setPhase(p.code === WAKEME_NOT_CONFIGURED ? 'not_open' : 'error');
      return;
    }
    setPhase(p.pot.currentDlamp > 0 ? 'ready' : 'pot_empty');
  }, [phoenixLive]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Icon name="chevron-left" size={26} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Nhận LAMP</Text>
      <View style={{ width: 26 }} />
    </View>
  );

  const shell = (children: React.ReactNode) => (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      {Header}
      {children}
    </View>
  );

  if (phase === 'checking') {
    return shell(<View style={styles.center}><ActivityIndicator color={COLORS.accent} /></View>);
  }

  if (phase === 'no_wallet') {
    return shell(
      <View style={styles.center}>
        <Icon name="wallet-outline" size={48} color={COLORS.accentLight} />
        <Text style={styles.emptyTitle}>Chưa có ví</Text>
        <Text style={styles.emptyText}>
          LAMP được nhận vào ví của bạn, nên phải có ví trước. Thiết lập bằng cụm 24 từ.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('SeedExport')}>
          <Icon name="key-outline" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Thiết lập ví (cụm 24 từ)</Text>
        </TouchableOpacity>
      </View>,
    );
  }

  if (phase === 'offline' || phase === 'not_open' || phase === 'error') {
    const info = phase === 'offline'
      ? { title: 'Chưa kết nối được máy chủ', body: 'Kiểm tra mạng rồi thử lại.' }
      : explain(
        probe && !probe.open ? probe.code : -1,
        probe && !probe.open ? probe.message : '',
      );
    return shell(
      <View style={styles.center}>
        <Icon name="cloud-off-outline" size={48} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>{info.title}</Text>
        <Text style={styles.emptyText}>{info.body}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => { setPhase('checking'); void load(); }}>
          <Icon name="refresh" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Thử lại</Text>
        </TouchableOpacity>
      </View>,
    );
  }

  const pot = probe && probe.open ? probe.pot : null;

  return shell(
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
    >
      <View style={styles.balanceRow}>
        <View style={styles.balCard}>
          <Text style={styles.balLabel}>Bạn sẽ nhận</Text>
          <Text style={styles.balValue}>{pot ? `${pot.currentDlamp.toLocaleString('en-US')}` : '—'}</Text>
          <Text style={styles.balUnit}>LAMP</Text>
        </View>
        <View style={styles.balCard}>
          <Text style={styles.balLabel}>Kho còn</Text>
          {/* `potBalanceLamp` là CHUỖI và đơn vị là oildrop — `fmtLamp` nhận chuỗi. */}
          <Text style={styles.balValue}>{pot ? fmtLamp(pot.potBalanceLamp) : '—'}</Text>
          <Text style={styles.balUnit}>LAMP</Text>
        </View>
      </View>

      {phase === 'pot_empty' ? (
        <View style={styles.noticeCard}>
          <Icon name="information-outline" size={18} color={COLORS.textMuted} />
          <Text style={styles.noticeText}>
            Kho tạm hết phần chia. Kho sẽ được nạp lại — quay lại sau.
          </Text>
        </View>
      ) : null}

      <TouchableOpacity style={[styles.primaryBtn, styles.btnDisabled]} disabled>
        <Icon name="lightbulb-on-outline" size={18} color="#fff" />
        <Text style={styles.primaryBtnText}>Nhận LAMP</Text>
      </TouchableOpacity>
      <Text style={styles.btnHint}>
        Đang chờ bản cập nhật ứng dụng — bản này chưa ký được giao dịch nhận LAMP.
      </Text>
    </ScrollView>,
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  scroll: { padding: 20, paddingBottom: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19 },
  balanceRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  balCard: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: COLORS.card, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, paddingVertical: 16, paddingHorizontal: 6,
  },
  balLabel: { fontSize: 12, color: COLORS.textMuted },
  balValue: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  balUnit: { fontSize: 11, color: COLORS.textMuted },
  noticeCard: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, padding: 12, marginBottom: 16,
  },
  noticeText: { flex: 1, fontSize: 13, color: COLORS.textMuted, lineHeight: 19 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
  },
  btnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnHint: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 10, lineHeight: 18 },
});

export default WakemeScreen;
