// screens/SignRequestScreen.tsx
// Duyệt yêu-cầu ký giao-dịch từ điện-thoại (PhoenixKey SignRequest).
// Poll GET /sign/request/:id → hiện intent → ký canonicalJson(intent) bằng TAAD_Key
// (Ed25519, signEd25519) → approve; hoặc cancel. Khớp client Dart sign_request_screen.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { COLORS } from '../constants';
import { phoenixKeyApi } from '../services/phoenixKey-api';
import { getStoredMasterKek } from '../services/masterKekStore';
import taad from '../sdk/taadEnclave';
import StateView from '../components/state/StateView';

type RouteParams = { SignRequest: { requestId: string } };

const PRIMARY = '#4A55C7'; // tím-lam PhoenixKey

/** Canonical JSON (khoá sắp xếp — khớp _canonicalJson client Dart). */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return '{' + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

interface IntentView {
  intent?: Record<string, unknown>;
  status?: string;
}

const SignRequestScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'SignRequest'>>();
  const { requestId } = route.params;

  const [data, setData] = useState<IntentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'cancel' | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = (await phoenixKeyApi.signRequest.get(requestId)) as IntentView;
      setData(res);
      setLoading(false);
      setError(null);
      // Dừng poll khi không còn pending.
      if (res.status && res.status !== 'pending' && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    } catch (e) {
      setLoading(false);
      setError('Không tải được yêu cầu ký (hết hạn hoặc mạng lỗi).');
    }
  }, [requestId]);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 3000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  const onApprove = async () => {
    if (!data?.intent) return;
    setBusy('approve');
    try {
      const kek = await getStoredMasterKek();
      if (!kek) { Alert.alert('Chưa sẵn sàng', 'Không tìm thấy khoá — hãy đăng nhập lại.'); return; }
      const canonical = canonicalJson(data.intent);
      const taadPub = await taad.deriveTaadPubkey(kek);
      const signature = await taad.signEd25519(kek, canonical);
      await phoenixKeyApi.signRequest.approve(requestId, {
        publicKeyHex: taadPub,
        signature,
      });
      Alert.alert('Đã duyệt', 'Giao dịch đã được ký và gửi.', [
        { text: 'Xong', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Ký thất bại', e instanceof Error ? e.message : 'Thử lại.');
    } finally {
      setBusy(null);
    }
  };

  const onCancel = () => {
    Alert.alert('Từ chối yêu cầu', 'Bạn chắc chắn từ chối ký giao dịch này?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Từ chối', style: 'destructive',
        onPress: async () => {
          setBusy('cancel');
          try {
            await phoenixKeyApi.signRequest.cancel(requestId);
            navigation.goBack();
          } catch {
            Alert.alert('Lỗi', 'Không từ chối được, thử lại.');
          } finally { setBusy(null); }
        },
      },
    ]);
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Duyệt yêu cầu ký</Text>
    </View>
  );

  if (loading) return <View style={styles.root}>{header}<StateView status="loading" loadingLines={4} /></View>;
  if (error) return <View style={styles.root}>{header}<StateView status="error" title="Lỗi" message={error} onRetry={load} /></View>;

  const intent = data?.intent ?? {};
  const displayText = (intent.displayText as string) ?? (intent.display_text as string) ?? 'Yêu cầu ký giao dịch';
  const type = (intent.type as string) ?? '';
  const domain = (intent.domain as string) ?? '';
  const done = data?.status && data.status !== 'pending';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY} />
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={styles.iconCircle}>
          <Icon name="shield-key-outline" size={30} color={PRIMARY} />
        </View>
        <Text style={styles.displayText}>{displayText}</Text>

        <View style={styles.card}>
          {!!type && <Row label="Loại" value={type} />}
          {!!domain && <Row label="Ứng dụng" value={domain} />}
          <Row label="Mã yêu cầu" value={requestId} mono />
          {!!data?.status && <Row label="Trạng thái" value={data.status} />}
        </View>

        <View style={styles.warn}>
          <Icon name="alert-outline" size={15} color="#C7862E" />
          <Text style={styles.warnText}>
            Chỉ duyệt khi bạn nhận ra giao dịch này. Ký bằng khoá TAAD trong thiết bị — không ai khác ký thay được.
          </Text>
        </View>
      </ScrollView>

      {done ? (
        <View style={styles.bottomBar}>
          <View style={styles.doneRow}>
            <Icon name="check-circle" size={16} color={COLORS.success} />
            <Text style={styles.doneText}>Yêu cầu đã {data?.status === 'approved' ? 'được duyệt' : 'kết thúc'}.</Text>
          </View>
        </View>
      ) : (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.rejectBtn} onPress={onCancel} disabled={busy !== null}>
            {busy === 'cancel' ? <ActivityIndicator size="small" color="#C0533A" />
              : <Text style={styles.rejectText}>Từ chối</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.approveBtn} onPress={onApprove} disabled={busy !== null}>
            {busy === 'approve' ? <ActivityIndicator size="small" color="#fff" />
              : <><Icon name="check" size={16} color="#fff" /><Text style={styles.approveText}>Duyệt & ký</Text></>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={1}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: PRIMARY, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },

  iconCircle: {
    width: 64, height: 64, borderRadius: 32, alignSelf: 'center',
    backgroundColor: 'rgba(74,85,199,0.10)', alignItems: 'center', justifyContent: 'center',
    marginTop: 8, marginBottom: 14,
  },
  displayText: { fontSize: 16, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 18, lineHeight: 22 },

  card: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 11, paddingHorizontal: 12, gap: 12,
  },
  rowLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  rowValue: { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: '700', textAlign: 'right' },
  mono: { fontSize: 11, fontWeight: '600' },

  warn: {
    flexDirection: 'row', gap: 8, marginTop: 16,
    backgroundColor: 'rgba(199,134,46,0.08)', padding: 12, borderRadius: 10,
  },
  warnText: { flex: 1, fontSize: 11, color: COLORS.textSub, lineHeight: 16 },

  bottomBar: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 24,
    backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  rejectBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#C0533A',
  },
  rejectText: { fontSize: 14, fontWeight: '800', color: '#C0533A' },
  approveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 12, backgroundColor: PRIMARY,
  },
  approveText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  doneRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  doneText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
});

export default SignRequestScreen;
