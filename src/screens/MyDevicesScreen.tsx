// screens/MyDevicesScreen.tsx
// "Thiết bị của tôi" — GET /keys/devices, POST /keys/devices/{keyId}/name,
// POST /keys/devices/{keyId}/revoke. Đối chiếu DeviceLifecycleController +
// KeyServiceImpl (PhoenixKey-Database).
//
// ── Ba chỗ dễ làm sai, đã xử ở đây ──────────────────────────────────────────
//
// 1. `list` trả VỀ CẢ khoá đã thu hồi. `findByUserDidOrderByCreatedAtDesc`
//    không lọc `status`, nên máy đã bị đá ra vẫn nằm trong danh sách. Đó là
//    CHỦ Ý — người dùng cần thấy "máy này đã bị gỡ" chứ không phải thấy nó biến
//    mất không dấu vết. Nên màn này KHÔNG lọc, chỉ tách nhóm và làm mờ.
//
// 2. `rename` trả `toDeviceView(key, null)` — tham số `callerKeyId` là `null`,
//    nên `current` trong phản hồi LUÔN là `false`, kể cả khi vừa đổi tên đúng
//    cái máy đang cầm. Nếu ta ghi đè cả bản ghi bằng phản hồi đó thì nhãn "máy
//    này" biến mất ngay sau khi đổi tên. Nên chỗ hợp nhất dưới đây chỉ lấy
//    `deviceName` từ phản hồi và GIỮ `current` của bản địa phương.
//
// 3. Nút "gỡ" trên máy owner đang dùng sẽ LUÔN bị máy chủ từ chối 3008: chỉ số
//    duy nhất V36 cho phép tối đa MỘT owner-key active mỗi DID, mà cửa này chỉ
//    vai owner gọi được ⇒ owner-key active của bạn luôn là cái cuối cùng. Bày
//    một nút chắc chắn hỏng ra rồi mới báo lỗi là tệ, nên nút đó không hiện;
//    chỗ nó lẽ ra đứng có một dòng nói cách làm đúng (24 từ / người bảo hộ).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, 
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import { phoenixKeyApi, PhoenixKeyApiError, type DeviceView } from '../services/phoenixKey-api';
import { checkDeviceName, DEVICE_NAME_MAX_LEN } from '../features/devices/deviceName';
import { showError, showSuccess, showWarning } from '../utils/alert';
import StateView from '../components/state/StateView';

const PRIMARY = '#4A55C7';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Chủ danh tính',
  manager: 'Người quản lý',
  device: 'Thiết bị phụ',
};

const roleLabel = (r: string): string => ROLE_LABEL[r?.toLowerCase()] ?? r ?? '—';

const iconForRole = (r: string): string => {
  switch (r?.toLowerCase()) {
    case 'owner': return 'shield-key';
    case 'manager': return 'account-tie';
    default: return 'cellphone';
  }
};

const fmtTime = (v: string | null): string => {
  if (!v) return '';
  const n = Date.parse(v);
  return Number.isNaN(n) ? '' : new Date(n).toLocaleString('vi-VN');
};

const isActive = (d: DeviceView) => d.status?.toLowerCase() === 'active';

/**
 * Đổi mã lỗi máy chủ thành câu người đọc được.
 *
 * Bốn mã dưới đây đều là ca ĐUA — người dùng mở danh sách, để đó, rồi bấm; giữa
 * hai thời điểm ấy máy khác đã đổi trạng thái. Nên mỗi câu đều kết bằng việc nói
 * rõ danh sách đang cũ, và nơi gọi tải lại ngay sau đó.
 */
const failMessage = (e: unknown): string => {
  const code = e instanceof PhoenixKeyApiError ? e.code : undefined;
  switch (code) {
    case 3002: return 'Không tìm thấy thiết bị này. Có thể nó đã bị gỡ ở nơi khác.';
    case 3004: return 'Thiết bị này đã bị gỡ trước đó rồi.';
    case 3008: return 'Đây là khoá chủ duy nhất còn hiệu lực — gỡ nó thì bạn mất luôn danh tính. Hãy dùng 24 từ hoặc người bảo hộ để chuyển sang máy mới.';
    case 3012: return `Tên máy không hợp lệ — để trống, dài quá ${DEVICE_NAME_MAX_LEN} ký tự, hoặc có ký tự ẩn.`;
    case 1306: return 'Phiên này không phải vai chủ danh tính nên không quản được thiết bị. Hãy đăng nhập bằng máy chủ danh tính.';
    default: return e instanceof Error && e.message ? e.message : 'Không thực hiện được. Thử lại sau.';
  }
};

const MyDevicesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Ô đổi tên. `target` cũng là cờ mở/đóng — một nguồn sự thật, không có ca
  // "modal mở mà không biết đang sửa máy nào".
  const [target, setTarget] = useState<DeviceView | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const res = await phoenixKeyApi.deviceLifecycle.list();
      setDevices(res.devices ?? []);
    } catch {
      setError(true); setDevices([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { dangDung, daGo } = useMemo(() => ({
    dangDung: devices.filter(isActive),
    daGo: devices.filter(d => !isActive(d)),
  }), [devices]);

  const openRename = useCallback((d: DeviceView) => {
    setTarget(d);
    setDraft(d.deviceName ?? '');
  }, []);

  const submitRename = useCallback(async () => {
    if (!target) return;
    const nameCheck = checkDeviceName(draft);
    if (!nameCheck.ok) { showError(nameCheck.message); return; }
    setSaving(true);
    try {
      // Gửi giá trị ĐÃ CẮT, không phải chuỗi thô — xem chú thích ở checkDeviceName.
      const view = await phoenixKeyApi.deviceLifecycle.rename(target.keyId, nameCheck.value);
      setDevices(prev => prev.map(d =>
        // Chỉ nhận `deviceName` từ phản hồi. `current` của phản hồi luôn false
        // (điểm 2 ở đầu tệp) nên phải giữ giá trị địa phương.
        d.keyId === target.keyId ? { ...d, deviceName: view.deviceName ?? nameCheck.value } : d,
      ));
      setTarget(null);
      showSuccess('Đã đổi tên máy.');
    } catch (e) {
      showError(failMessage(e));
      await load();
    } finally { setSaving(false); }
  }, [target, draft, load]);

  const doRevoke = useCallback(async (d: DeviceView) => {
    setBusyKeyId(d.keyId);
    try {
      await phoenixKeyApi.deviceLifecycle.revoke(d.keyId);
      // Không xoá khỏi danh sách — máy chủ vẫn trả về nó với status='revoked'.
      // Tải lại để trạng thái trên màn đúng bằng trạng thái đã lưu.
      showSuccess('Đã gỡ máy khỏi danh tính của bạn.');
      await load();
    } catch (e) {
      showError(failMessage(e));
      await load();
    } finally { setBusyKeyId(null); }
  }, [load]);

  const confirmRevoke = useCallback((d: DeviceView) => {
    const ten = d.deviceName?.trim() || 'Máy không tên';
    // Alert của nền tảng, không phải một Modal nữa: hành động này KHÔNG hoàn tác
    // được, và một Modal thứ hai chồng lên Modal đổi tên là đúng cái lỗi iOS đã
    // sửa ở `CandidateDetailSheet`.
    showWarning(
      'Gỡ máy này?',
      `“${ten}” sẽ mất quyền truy cập danh tính của bạn ngay lập tức. Không hoàn tác được.`,
      {
        actions: [
          { text: 'Thôi', style: 'cancel' },
          { text: 'Gỡ máy', style: 'destructive', onPress: () => { doRevoke(d); } },
        ],
      },
    );
  }, [doRevoke]);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Thiết bị của tôi</Text>
      <TouchableOpacity onPress={load} hitSlop={8} disabled={loading}>
        <Icon name="refresh" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  if (loading) return <View style={styles.root}>{header}<StateView status="loading" loadingLines={4} /></View>;
  if (error) return <View style={styles.root}>{header}<StateView status="error" onRetry={load} /></View>;

  const renderRow = (d: DeviceView) => {
    const song = isActive(d);
    const ten = d.deviceName?.trim() || 'Máy không tên';
    // Điểm 3 đầu tệp: owner đang hoạt động là khoá cuối cùng ⇒ nút gỡ chắc
    // chắn hỏng, nên không bày ra.
    const goDuoc = song && d.keyRole?.toLowerCase() !== 'owner';
    const dangBan = busyKeyId === d.keyId;

    return (
      <View style={[styles.row, !song && styles.rowGo]}>
        <View style={[styles.iconWrap, !song && styles.iconWrapGo]}>
          <Icon name={iconForRole(d.keyRole)} size={18} color={song ? PRIMARY : COLORS.textMuted} />
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.nameLine}>
            <Text style={[styles.name, !song && styles.nameGo]} numberOfLines={1}>{ten}</Text>
            {d.current && <View style={styles.badgeNay}><Text style={styles.badgeNayText}>máy này</Text></View>}
            {!song && <View style={styles.badgeGo}><Text style={styles.badgeGoText}>đã gỡ</Text></View>}
          </View>
          <Text style={styles.meta}>{roleLabel(d.keyRole)}</Text>
          {!!fmtTime(d.lastUsedAt) && (
            <Text style={styles.time}>Dùng lần cuối: {fmtTime(d.lastUsedAt)}</Text>
          )}
          {!d.lastUsedAt && !!fmtTime(d.createdAt) && (
            <Text style={styles.time}>Thêm vào: {fmtTime(d.createdAt)}</Text>
          )}
          {song && !goDuoc && (
            <Text style={styles.note}>
              Khoá chủ không gỡ được từ đây. Muốn đổi sang máy khác, dùng 24 từ hoặc người bảo hộ.
            </Text>
          )}
        </View>

        {song && (
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => openRename(d)} hitSlop={8} style={styles.actBtn}>
              <Icon name="pencil-outline" size={18} color={COLORS.textSub} />
            </TouchableOpacity>
            {goDuoc && (
              dangBan
                ? <ActivityIndicator style={styles.actBtn} color="#C62828" />
                : (
                  <TouchableOpacity onPress={() => confirmRevoke(d)} hitSlop={8} style={styles.actBtn}>
                    <Icon name="link-off" size={18} color="#C62828" />
                  </TouchableOpacity>
                )
            )}
          </View>
        )}
      </View>
    );
  };

  type Muc = { kind: 'title'; text: string; key: string } | { kind: 'device'; d: DeviceView };
  const data: Muc[] = [
    ...(dangDung.length ? [{ kind: 'title', text: 'Đang hoạt động', key: 'h-active' } as Muc] : []),
    ...dangDung.map(d => ({ kind: 'device', d } as Muc)),
    ...(daGo.length ? [{ kind: 'title', text: 'Đã gỡ', key: 'h-revoked' } as Muc] : []),
    ...daGo.map(d => ({ kind: 'device', d } as Muc)),
  ];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY} />
      {header}

      <FlatList
        data={data}
        keyExtractor={m => (m.kind === 'title' ? m.key : m.d.keyId)}
        contentContainerStyle={data.length === 0 ? styles.empty : styles.list}
        onRefresh={load}
        refreshing={false}
        ListEmptyComponent={
          <StateView
            status="empty"
            title="Chưa có thiết bị nào"
            message="Mỗi máy bạn đăng nhập sẽ hiện ở đây để bạn đặt tên hoặc gỡ ra."
          />
        }
        renderItem={({ item }) =>
          item.kind === 'title'
            ? <Text style={styles.sectionTitle}>{item.text}</Text>
            : renderRow(item.d)
        }
      />

      {/* Ô đổi tên. Màn này KHÔNG nằm trong một modal nào khác, nên một Modal
          lồng-một-tầng ở đây là an toàn trên iOS. */}
      <Modal visible={target !== null} transparent animationType="fade" onRequestClose={() => setTarget(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBg}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Đặt tên máy</Text>
            <Text style={styles.modalSub}>
              Tên chỉ để bạn nhận ra máy nào là máy nào khi cần gỡ.
            </Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ví dụ: iPhone của Thư"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              maxLength={DEVICE_NAME_MAX_LEN}
              autoFocus
              editable={!saving}
              returnKeyType="done"
              onSubmitEditing={submitRename}
            />
            <Text style={styles.count}>{draft.trim().length}/{DEVICE_NAME_MAX_LEN}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setTarget(null)} disabled={saving} style={styles.btnPhu}>
                <Text style={styles.btnPhuText}>Thôi</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitRename} disabled={saving} style={[styles.btnChinh, saving && styles.btnMo]}>
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.btnChinhText}>Lưu</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: PRIMARY, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },

  list: { padding: 12, gap: 8 },
  empty: { flexGrow: 1 },
  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8, marginLeft: 4,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  rowGo: { opacity: 0.55 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(74,85,199,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapGo: { backgroundColor: 'rgba(0,0,0,0.05)' },

  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 13, fontWeight: '800', color: COLORS.text },
  nameGo: { textDecorationLine: 'line-through' },
  badgeNay: { backgroundColor: 'rgba(74,85,199,0.12)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeNayText: { fontSize: 10, fontWeight: '800', color: PRIMARY },
  badgeGo: { backgroundColor: 'rgba(198,40,40,0.10)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeGoText: { fontSize: 10, fontWeight: '800', color: '#C62828' },

  meta: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  time: { fontSize: 11, color: COLORS.textMuted, marginTop: 4, fontWeight: '600' },
  note: { fontSize: 11, color: COLORS.textMuted, marginTop: 6, lineHeight: 15, fontStyle: 'italic' },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actBtn: { padding: 6 },

  modalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: COLORS.card, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: COLORS.border,
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  modalSub: { fontSize: 12, color: COLORS.textSub, marginTop: 4, lineHeight: 17 },
  input: {
    marginTop: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  count: { fontSize: 11, color: COLORS.textMuted, marginTop: 6, textAlign: 'right' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  btnPhu: { paddingHorizontal: 16, paddingVertical: 10 },
  btnPhuText: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
  btnChinh: {
    minWidth: 84, alignItems: 'center', backgroundColor: PRIMARY,
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
  },
  btnMo: { opacity: 0.6 },
  btnChinhText: { fontSize: 13, fontWeight: '800', color: '#fff' },
});

export default MyDevicesScreen;
