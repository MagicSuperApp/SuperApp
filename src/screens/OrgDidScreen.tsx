// screens/OrgDidScreen.tsx
//
// Ví tổ chức — TẠO OrgDID + danh sách OrgDID người dùng điều-khiển.
//
// OrgDID = danh tính tổ chức (did:phoenix / did:cardano), single-owner hiện tại
// (m-of-n founding = PR #40). Tạo org là bước ĐỘC-LẬP, cần TRƯỚC khi mint LAMP.
// Endpoint `POST /identity/org/create` 🟢 live; danh sách org: nếu backend chưa
// có endpoint list → rơi về CACHE LOCAL (org vừa tạo lưu AsyncStorage).
//
// Màn có đủ 4 trạng-thái: loading (nạp danh sách) / empty (chưa org nào) /
// offline (mất mạng) / error (lỗi API). Màu token-driven (COLORS), zero hardcode.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RootState } from '../store';
import { COLORS } from '../constants';
import {
  createOrg,
  listOrgs,
  isOrgMintReady,
  type Org,
} from '../services/orgMintService';
import { PhoenixKeyApiError } from '../services/phoenixKey-api';

const ORG_CACHE_KEY = '@orgmint/orgs_cache';

// Trạng-thái nạp danh sách org.
type LoadState = 'loading' | 'ready' | 'empty' | 'offline' | 'error';

// ── Cache local: nguồn dự-phòng khi backend chưa có endpoint list ──────────────
const readCachedOrgs = async (): Promise<Org[]> => {
  try {
    const raw = await AsyncStorage.getItem(ORG_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Org[]) : [];
  } catch {
    return [];
  }
};

const writeCachedOrgs = async (orgs: Org[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(ORG_CACHE_KEY, JSON.stringify(orgs));
  } catch {
    /* cache lỗi không chặn luồng chính */
  }
};

const mergeOrg = (list: Org[], incoming: Org): Org[] => {
  const exists = list.some(o => o.orgDid === incoming.orgDid);
  return exists ? list : [incoming, ...list];
};

const OrgDidScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const currentUser = useSelector((state: RootState) => state.user.currentUser);
  const ownerDid = currentUser?.did || currentUser?.id || '';

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [orgName, setOrgName] = useState('');
  const [creating, setCreating] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const enabled = isOrgMintReady();

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Nạp danh sách org: thử backend → fallback cache local. Lỗi mạng → offline.
  const load = useCallback(async () => {
    setLoadState('loading');
    const cached = await readCachedOrgs();

    const net = await NetInfo.fetch();
    const online = net.isConnected === true && net.isInternetReachable !== false;
    if (!online) {
      setOrgs(cached);
      setLoadState(cached.length ? 'ready' : 'offline');
      return;
    }

    try {
      const remote = await listOrgs();
      // Gộp remote + cache (giữ org local chưa kịp lên server).
      const merged = remote.reduce(mergeOrg, cached);
      setOrgs(merged);
      await writeCachedOrgs(merged);
      setLoadState(merged.length ? 'ready' : 'empty');
    } catch (err) {
      // Endpoint list chưa có / lỗi → dùng cache local (không chặn tạo org).
      if (err instanceof PhoenixKeyApiError) {
        setOrgs(cached);
        setLoadState(cached.length ? 'ready' : 'empty');
      } else {
        setOrgs(cached);
        setLoadState(cached.length ? 'ready' : 'error');
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const trimmedName = orgName.trim();
  const canCreate = useMemo(
    () => trimmedName.length >= 2 && !!ownerDid && !creating,
    [trimmedName, ownerDid, creating],
  );

  const handleCreate = async () => {
    if (!canCreate) return;
    if (!ownerDid) {
      Alert.alert('Chưa có danh tính', 'Vui lòng kích hoạt danh tính trước khi tạo tổ chức.');
      return;
    }
    setCreating(true);
    try {
      const res = await createOrg({ ownerDid, orgName: trimmedName });
      const created: Org = {
        orgDid: (res as any).orgDid ?? (res as any).org_did,
        orgName: (res as any).orgName ?? (res as any).org_name ?? trimmedName,
        role: 'owner',
        threshold: 1,
      };
      const next = mergeOrg(orgs, created);
      setOrgs(next);
      await writeCachedOrgs(next);
      setLoadState('ready');
      setOrgName('');
      Alert.alert('Đã tạo tổ chức', `OrgDID: ${created.orgDid}`);
    } catch (err) {
      const msg =
        err instanceof PhoenixKeyApiError
          ? err.message
          : 'Không tạo được tổ chức. Vui lòng thử lại.';
      Alert.alert('Lỗi', msg);
    } finally {
      setCreating(false);
    }
  };

  const goMint = (org: Org) => {
    navigation.navigate('OrgMint', { orgDid: org.orgDid, orgName: org.orgName });
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const renderList = () => {
    switch (loadState) {
      case 'loading':
        return (
          <View style={styles.stateBox}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.stateText}>Đang nạp danh sách tổ chức…</Text>
          </View>
        );
      case 'offline':
        return (
          <View style={styles.stateBox}>
            <Icon name="wifi-off" size={28} color={COLORS.textMuted} />
            <Text style={styles.stateText}>Mất kết nối mạng — chưa nạp được danh sách.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        );
      case 'error':
        return (
          <View style={styles.stateBox}>
            <Icon name="alert-circle-outline" size={28} color={COLORS.error} />
            <Text style={styles.stateText}>Lỗi nạp danh sách tổ chức.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        );
      case 'empty':
        return (
          <View style={styles.stateBox}>
            <View style={styles.emptyIconWrap}>
              <Icon name="office-building-outline" size={28} color={COLORS.textMuted} />
            </View>
            <Text style={styles.stateText}>Chưa có tổ chức nào. Tạo tổ chức đầu tiên ở trên.</Text>
          </View>
        );
      case 'ready':
      default:
        return (
          <View style={styles.list}>
            {orgs.map(org => (
              <TouchableOpacity
                key={org.orgDid}
                style={styles.orgRow}
                activeOpacity={0.8}
                onPress={() => goMint(org)}
              >
                <View style={styles.orgIconWrap}>
                  <Icon name="office-building" size={20} color={COLORS.accent} />
                </View>
                <View style={styles.orgBody}>
                  <Text style={styles.orgName} numberOfLines={1}>
                    {org.orgName || 'Tổ chức'}
                  </Text>
                  <Text style={styles.orgDid} numberOfLines={1}>
                    {org.orgDid}
                  </Text>
                  <Text style={styles.orgMeta}>
                    {(org.role || 'owner')} · ngưỡng ký {org.threshold ?? 1}
                  </Text>
                </View>
                <Icon name="chevron-right" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        );
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ví tổ chức</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 12) + 24 },
          ]}
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Ghi chú trạng-thái tính năng */}
            {!enabled && (
              <View style={styles.noticeCard}>
                <Icon name="information-outline" size={18} color={COLORS.warning} />
                <Text style={styles.noticeText}>
                  Tính năng mint đang ở chế độ xem trước — mint LAMP chưa chạy thật
                  (chờ LAMP chốt cap/authority và Enclave native ráp ký).
                </Text>
              </View>
            )}

            {/* Tạo OrgDID */}
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionLabel}>TẠO TỔ CHỨC MỚI</Text>
              <View style={styles.sectionCard}>
                <Text style={styles.fieldLabel}>Tên tổ chức</Text>
                <TextInput
                  style={styles.input}
                  value={orgName}
                  onChangeText={setOrgName}
                  placeholder="VD: Hợp tác xã Sen Vàng"
                  placeholderTextColor={COLORS.textMuted}
                  editable={!creating}
                  maxLength={64}
                />
                <Text style={styles.hint}>
                  Tạo OrgDID single-owner (bạn là chủ sở hữu đầu tiên). Nhiều chủ sở
                  hữu m-of-n sẽ mở khi PR #40 xong.
                </Text>

                <TouchableOpacity
                  style={[styles.primaryBtn, !canCreate && styles.primaryBtnDisabled]}
                  onPress={handleCreate}
                  disabled={!canCreate}
                  activeOpacity={0.85}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Icon name="plus-circle-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryBtnText}>Tạo tổ chức</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Danh sách org */}
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionLabel}>TỔ CHỨC CỦA BẠN</Text>
              <View style={styles.sectionCard}>{renderList()}</View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 36, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  headerPlaceholder: { width: 36 },

  scrollContent: { paddingTop: 18, paddingHorizontal: 20 },

  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: `${COLORS.warning}12`,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${COLORS.warning}40`,
    padding: 14,
    marginBottom: 20,
  },
  noticeText: { flex: 1, fontSize: 12.5, color: COLORS.textSub, lineHeight: 18 },

  sectionWrap: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 2,
    marginBottom: 10,
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSub,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 9,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.bgWarm,
  },
  hint: { fontSize: 12, color: COLORS.textMuted, marginTop: 8, lineHeight: 17 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 16,
  },
  primaryBtnDisabled: { backgroundColor: COLORS.textMuted, opacity: 0.6 },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  // Danh sách + trạng-thái
  list: { gap: 10 },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  orgIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${COLORS.accent}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgBody: { flex: 1 },
  orgName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  orgDid: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 },
  orgMeta: { fontSize: 11.5, color: COLORS.textSub, marginTop: 2 },

  stateBox: { alignItems: 'center', paddingVertical: 28, gap: 12 },
  stateText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.bgWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  retryText: { fontSize: 13, fontWeight: '700', color: COLORS.accent },
});

export default OrgDidScreen;
