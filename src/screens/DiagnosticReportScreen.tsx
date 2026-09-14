/**
 * Màn XEM TRƯỚC báo cáo thử thực địa — phải đọc được TOÀN VĂN trước khi gửi.
 *
 * ── Vì sao màn này tồn tại, thay cho một nút trong hộp thoại ─────────────────────
 * Bản đầu gắn nút "Gửi báo cáo" vào hộp thoại ở màn Tài khoản, và chú thích tại chỗ
 * khẳng định người dùng *"THẤY toàn văn trước khi gửi"*. Khẳng định đó SAI, và đo được:
 * hộp thoại hiện `APP_DEBUG_INFO` (phần đầu), còn đoạn báo cáo đi thẳng vào
 * `Share.share({ message: report })`. Thêm nữa `components/AlertPopup.tsx` render thân
 * bằng một `<Text>` trần, không có vùng cuộn — nên 40 dòng KHÔNG thể nằm trong hộp thoại
 * kể cả khi muốn.
 *
 * ── Vì sao xem trước là ràng buộc bắt buộc, không phải tiện nghi ─────────────────
 * Báo cáo chở những câu app đã hiện cho người dùng, và nhiều câu trong số đó có nội suy
 * tên người thứ ba: `GuardianScreen` (tên người bảo hộ), `UsernameScreen` (`@username`),
 * `TreeManagementScreen` và `AnimalManagementScreen` (tên cây, tên cá thể), `OrgDidScreen`.
 * Bộ lọc `telemetryGate.FORBIDDEN_SHAPES` có năm mẫu — cụm 24 từ, `did:`, hex-64, base64
 * dài, địa chỉ ví — và **không mẫu nào chặn tên người**. Mở khay chia sẻ là gửi ra ngoài,
 * tức bất khả hồi. Xác nhận cho một việc bất khả hồi phải KHÁC LOẠI với một nút nữa; ở
 * đây loại khác đó là *phải đọc được nội dung thật*.
 *
 * Cố ý KHÔNG thêm một nút "Tôi đồng ý" — người dùng bấm nút thứ hai theo phản xạ, và một
 * ô tích không làm ai đọc thêm một chữ nào.
 *
 * ── Vì sao màn này mở được khi CHƯA đăng nhập ───────────────────────────────────
 * Lớp lỗi thực địa dày nhất nằm TRƯỚC lúc đăng nhập xong (khoá sinh trắc bị hệ điều hành
 * huỷ vì vừa thêm vân tay, danh tính chưa dùng được trên máy này…). Nếu cửa báo cáo nằm
 * sau cổng đăng nhập thì đúng lớp lỗi cần báo nhất lại là lớp không báo được — và việc
 * người thực địa làm thay vào đó là chụp ảnh màn hình gửi Zalo, mất commit, mất máy chủ,
 * mất 39 dòng trước đó. Nên tên màn này nằm trong `PUBLIC_ROUTES` (`navigation/authGate.tsx`).
 *
 * Màn KHÔNG đọc `state.user` một dòng nào, và báo cáo thì chỉ chứa câu app đã hiện —
 * không truy vấn gì thêm. Nên mở nó ra ngoài cổng không mở thêm dữ liệu nào của người dùng.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import Clipboard from '@react-native-clipboard/clipboard';

import { COLORS } from '../constants';
import { buildDiagnosticReport } from '../services/diagnosticReport';
import { fieldReportHead } from '../services/fieldReportHead';

const DiagnosticReportScreen = () => {
  const navigation = useNavigation();
  // Dựng MỘT LẦN lúc mở màn. Dựng lại mỗi lần render thì mỗi thông báo mới (kể cả thông
  // báo do chính màn này sinh ra) lại đổi nội dung đang đọc dưới tay người dùng.
  const report = useMemo(() => buildDiagnosticReport(fieldReportHead()), []);
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    Clipboard.setString(report);
    setCopied(true);
  };

  const onShare = () => {
    Share.share({ message: report }).catch(() => {
      // Khay không mở được thì vẫn còn đường bảng nháp — im lặng ở đây là bỏ người thử
      // giữa đường, ngoài vườn, với một cái nút vừa bấm không phản ứng.
      onCopy();
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={20} color={COLORS.textSub} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Báo cáo gửi về</Text>
      </View>

      <View style={styles.notice}>
        <Icon name="eye-outline" size={15} color={COLORS.textSub} />
        <Text style={styles.noticeText}>
          Đây là TOÀN BỘ những gì sẽ được gửi. Hãy đọc qua trước khi bấm Chia sẻ — trong
          đó có thể có tên người hoặc tên cây của bạn. Bạn tự chọn gửi cho ai.
        </Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyPad}>
        {/* `selectable`: người thử có thể tự bôi đen một đoạn để gửi riêng đoạn đó. */}
        <Text style={styles.report} selectable testID="diag-report-text">{report}</Text>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.copyBtn} onPress={onCopy} testID="diag-copy">
          <Icon name={copied ? 'check' : 'content-copy'} size={16} color={COLORS.textSub} />
          <Text style={styles.copyText}>{copied ? 'Đã sao chép' : 'Sao chép'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareBtn} onPress={onShare} testID="diag-share">
          <Icon name="share-variant" size={16} color="#fff" />
          <Text style={styles.shareText}>Chia sẻ</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 52, paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },

  notice: {
    flexDirection: 'row', gap: 8, margin: 16, marginBottom: 8,
    padding: 12, borderRadius: 10, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: COLORS.textSub },

  body: { flex: 1 },
  bodyPad: { paddingHorizontal: 16, paddingBottom: 24 },
  report: { fontSize: 11, lineHeight: 17, color: COLORS.text, fontFamily: 'Courier' },

  bottomBar: {
    flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  copyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  copyText: { fontSize: 14, fontWeight: '700', color: COLORS.textSub },
  shareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 13, borderRadius: 12, backgroundColor: COLORS.accent,
  },
  shareText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});

export default DiagnosticReportScreen;
