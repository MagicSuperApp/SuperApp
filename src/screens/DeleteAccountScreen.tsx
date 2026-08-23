// screens/DeleteAccountScreen.tsx
//
// Xoá tài khoản — bắt buộc bởi Apple 5.1.1(v) + Google Play (issue #144 mục 1.1).
//
// Trung thực là điều kiện Apple xét: màn này nói THẲNG cái gì xoá được (khoá/danh tính/
// dữ liệu trên máy — app toàn quyền, làm THẬT), cái gì chỉ GỬI YÊU CẦU (dữ liệu phía máy
// chủ — backend chưa có cửa xoá theo DID, thư gửi 12/08), và cái gì KHÔNG xoá được (đã
// neo lên chuỗi, đặc trưng đã gộp vào mô hình chung). Không hứa điều app không làm được.
//
// Chuỗi trong <Text> tự dịch qua i18n (install.ts bọc Text); Alert là dialog native nên
// phải bọc t() thủ công.

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { t } from '../i18n';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { logoutUser } from '../store/userSlice';
import { requestRemoteDeletion, wipeLocalIdentity } from '../services/accountDeletionService';
import { showInfo } from '../utils/alert';

// Từ xác nhận chấp nhận theo NGÔN NGỮ đang hiện (hướng dẫn 'Nhập XOÁ' dịch theo lang, nên
// nhận cả DELETE/删除/削除). So sau khi bỏ dấu-cách + viết hoa.
const CONFIRM_WORDS = new Set(['XOÁ', 'XÓA', 'XOA', 'DELETE', '删除', '削除']);

const DeleteAccountScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const did = useAppSelector((s) => s.user.currentUser?.did);

  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canDelete = useMemo(
    () => CONFIRM_WORDS.has(confirmText.trim().toUpperCase()),
    [confirmText],
  );

  const onDelete = async () => {
    if (!canDelete || deleting) return;
    setDeleting(true);
    try {
      // 1) Yêu cầu máy chủ xoá theo DID (chưa có endpoint → ghi 'pending', không bịa).
      await requestRemoteDeletion(did);
      // 2) Đóng DB per-user + xoá phiên xuyên module + nháp.
      await dispatch(logoutUser());
      // 3) Xoá sạch khoá/DID/token/cache trên máy — non-custodial: xoá khoá = xoá tài khoản.
      await wipeLocalIdentity();
      Alert.alert(
        t(t('Đã xoá tài khoản')),
        t(t('Dữ liệu trên máy này đã được xoá. Yêu cầu xoá phía máy chủ đã được ghi nhận và sẽ được xử lý.')),
        [{ text: t(t('Đã hiểu')), onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) }],
      );
    } catch (e) {
      console.warn('[DeleteAccount] lỗi:', e);
      showInfo(t('Chưa xoá được. Thử lại khi có mạng tốt.'));
      setDeleting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Xoá tài khoản</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Cảnh báo không hoàn tác */}
        <View style={styles.warnBox}>
          <Icon name="alert-octagon" size={22} color={COLORS.error} />
          <Text style={styles.warnText}>
            Xoá tài khoản là việc không thể hoàn tác. Hãy đọc kỹ trước khi tiếp tục.
          </Text>
        </View>

        {/* Sẽ làm gì */}
        <Row icon="cellphone-remove" tint={COLORS.text} title="Xoá khỏi máy này">
          Mọi khoá, danh tính, phiên đăng nhập và dữ liệu tạm trên điện thoại — kể cả clip
          chưa gửi. Sau bước này bạn không đăng nhập lại được trên thiết bị này.
        </Row>

        <Row icon="cloud-upload-outline" tint={COLORS.text} title="Gửi yêu cầu xoá tới máy chủ">
          Yêu cầu xoá dữ liệu gắn với danh tính của bạn: hồ sơ vườn, công việc, hội thoại.
        </Row>

        {/* Không xoá được */}
        <Row icon="link-lock" tint={COLORS.error} title="Có thứ không xoá được">
          Dữ liệu đã ghi lên chuỗi và đặc trưng ảnh đã gộp vào mô hình nhận diện chung thì
          không thể gỡ. Đây là giới hạn kỹ thuật, không phải lựa chọn.
        </Row>

        {/* Gõ xác nhận */}
        <Text style={styles.confirmLabel}>Nhập XOÁ để xác nhận</Text>
        <TextInput
          style={styles.input}
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="XOÁ"
          placeholderTextColor={COLORS.textMuted}
          editable={!deleting}
        />

        <TouchableOpacity
          style={[styles.deleteBtn, (!canDelete || deleting) && styles.deleteBtnDisabled]}
          onPress={onDelete}
          disabled={!canDelete || deleting}
          activeOpacity={0.85}
        >
          {deleting ? (
            <>
              <ActivityIndicator color={COLORS.white} />
              <Text style={styles.deleteBtnText}>Đang xoá tài khoản…</Text>
            </>
          ) : (
            <>
              <Icon name="delete-forever" size={18} color={COLORS.white} />
              <Text style={styles.deleteBtnText}>Xoá vĩnh viễn</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()} disabled={deleting}>
          <Text style={styles.cancelText}>Huỷ</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

/** Một dòng: icon + tiêu đề + phần giải thích (children là chuỗi tiếng Việt, tự dịch). */
const Row: React.FC<{ icon: string; tint: string; title: string; children: React.ReactNode }> = ({
  icon, tint, title, children,
}) => (
  <View style={styles.row}>
    <Icon name={icon} size={20} color={tint} style={{ marginTop: 2 }} />
    <View style={{ flex: 1 }}>
      <Text style={[styles.rowTitle, { color: tint }]}>{title}</Text>
      <Text style={styles.rowBody}>{children}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  body: { padding: 20, paddingBottom: 40 },
  warnBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#fdecea', borderRadius: 12, padding: 14, marginBottom: 20,
  },
  warnText: { flex: 1, fontSize: 14, lineHeight: 20, color: COLORS.error, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 18 },
  rowTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  rowBody: { fontSize: 13.5, lineHeight: 20, color: COLORS.textSub },
  confirmLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginTop: 6, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: COLORS.text,
    letterSpacing: 2, marginBottom: 20,
  },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.error, borderRadius: 12, paddingVertical: 15,
  },
  deleteBtnDisabled: { opacity: 0.45 },
  deleteBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  cancelText: { color: COLORS.textSub, fontSize: 15, fontWeight: '600' },
});

export default DeleteAccountScreen;
