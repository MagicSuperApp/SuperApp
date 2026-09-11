// screens/GuardianScreen.tsx
// Quản-lý guardian (khôi-phục xã-hội): thêm/bớt qua POST /guardians/add|remove (API.md §6).
// Chưa có endpoint LIST guardian → giữ danh sách cục bộ (AsyncStorage) để hiển thị;
// đồng bộ server khi có GET (backend đã có, chờ contract).

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, StatusBar, ScrollView, ActivityIndicator, 
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants';
import { addGuardian, removeGuardian } from '../services/guardianService';
import { showError, showInfo, showSuccess, showWarning } from '../utils/alert';
import { t } from '../i18n';

const PRIMARY = '#4A55C7';
const DID_RE = /^did:phoenix:[a-z2-7]{13}:[0-9a-f]{64}$/;
const LOCAL_KEY = 'phoenixkey_guardians_local';

interface LocalGuardian { did: string; name: string }

const GuardianScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [list, setList] = useState<LocalGuardian[]>([]);
  const [gDid, setGDid] = useState('');
  const [gName, setGName] = useState('');
  const [busy, setBusy] = useState(false);

  const loadLocal = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_KEY);
      setList(raw ? JSON.parse(raw) : []);
    } catch { setList([]); }
  }, []);
  useEffect(() => { loadLocal(); }, [loadLocal]);

  const persist = async (next: LocalGuardian[]) => {
    setList(next);
    try { await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next)); } catch { /* non-fatal */ }
  };

  const onAdd = async () => {
    const did = gDid.trim();
    const name = gName.trim();
    if (!DID_RE.test(did)) { showInfo('Mã định danh chưa đúng', 'Nhập mã định danh của người giám hộ.'); return; }
    if (!name) { showInfo('Thiếu tên', 'Nhập tên hiển thị cho guardian.'); return; }
    if (list.some((g) => g.did === did)) { showSuccess('Đã có', 'Guardian này đã trong danh sách.'); return; }
    setBusy(true);
    try {
      await addGuardian(did);
      await persist([...list, { did, name }]);
      setGDid(''); setGName('');
    } catch (e) {
      showError('Thêm thất bại', e instanceof Error ? e.message : 'Thử lại.');
    } finally { setBusy(false); }
  };

  const onRemove = (g: LocalGuardian) => {
    showWarning('Bớt guardian', `Gỡ ${g.name} khỏi danh sách khôi phục?`, {
        confirmText: 'Gỡ',
        cancelText: 'Huỷ',
        onConfirm: async () => {
          try {
            await removeGuardian(g.did);
            await persist(list.filter((x) => x.did !== g.did));
          } catch (e) {
            showError(t('Gỡ thất bại'), e instanceof Error ? e.message : t('Thử lại.'));
          }
        },
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Người bảo hộ (Guardian)</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          Ghi danh người bạn tin tưởng bằng mã định danh của họ. Đường dùng người bảo hộ để khôi phục chưa chạy tới cuối — cụm 24 từ vẫn là bản dự phòng duy nhất.
        </Text>

        {/* Danh sách */}
        {list.length > 0 && (
          <View style={styles.card}>
            {list.map((g, i) => (
              <View key={g.did} style={[styles.gRow, i > 0 && styles.gRowBorder]}>
                <View style={styles.avatar}><Icon name="account-outline" size={18} color={PRIMARY} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gName}>{g.name}</Text>
                  <Text style={styles.gDid} numberOfLines={1}>{g.did}</Text>
                </View>
                <TouchableOpacity onPress={() => onRemove(g)} hitSlop={8}>
                  <Icon name="close-circle-outline" size={20} color="#C0533A" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Thêm */}
        <Text style={styles.section}>Thêm guardian</Text>
        <TextInput
          style={styles.input} placeholder="Mã định danh người giám hộ (did:phoenix:…)"
          placeholderTextColor={COLORS.textMuted} value={gDid} onChangeText={setGDid}
          autoCapitalize="none" autoCorrect={false}
        />
        <TextInput
          style={[styles.input, { marginTop: 10 }]} placeholder="Tên hiển thị (vd: Anh Tuấn)"
          placeholderTextColor={COLORS.textMuted} value={gName} onChangeText={setGName}
        />
        <TouchableOpacity style={styles.addBtn} onPress={onAdd} disabled={busy}>
          {busy ? <ActivityIndicator size="small" color="#fff" />
            : <><Icon name="account-plus-outline" size={16} color="#fff" /><Text style={styles.addText}>Thêm guardian</Text></>}
        </TouchableOpacity>
      </ScrollView>
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
  lead: { fontSize: 13, color: COLORS.textSub, lineHeight: 19, marginBottom: 18 },

  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 20 },
  gRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  gRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(74,85,199,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  gName: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  gDid: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  section: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 10 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 14, paddingVertical: 14, borderRadius: 12, backgroundColor: PRIMARY,
  },
  addText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});

export default GuardianScreen;
