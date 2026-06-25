// screens/JoinScreen.tsx
// Module KẾT ĐÈN — kết nối và xem trạng thái mạng LampNet.
// PhoenixKey JWT auth cho LampNet chưa wire (INTEGRATION.md §2.2) → namespace/upload là v2.1.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RootState } from '../store';
import { COLORS } from '../constants';

const LAMP_GOLD = '#F5A623';
const LAMP_GOLD_DEEP = '#C47F0D';
const LAMPNET_BASE = 'https://lampnet.cloud';

type NetworkStatus = 'checking' | 'online' | 'degraded' | 'offline';

const JoinScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const currentUser = useSelector((state: RootState) => state.user.currentUser);
  const did = currentUser?.did ?? null;

  const [portalCount, setPortalCount] = useState<number>(0);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('checking');

  const checkNetwork = useCallback(async () => {
    setNetworkStatus('checking');
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${LAMPNET_BASE}/v1/portals`, {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const count = Array.isArray(data)
          ? data.length
          : (data?.portals?.length ?? data?.count ?? 0);
        setPortalCount(count);
        setNetworkStatus(count > 0 ? 'online' : 'degraded');
      } else {
        setNetworkStatus('degraded');
      }
    } catch {
      setNetworkStatus('offline');
    }
  }, []);

  useEffect(() => { checkNetwork(); }, [checkNetwork]);

  const statusColor: string =
    networkStatus === 'online'   ? '#16A34A' :
    networkStatus === 'degraded' ? '#D97706' :
    networkStatus === 'offline'  ? '#DC2626' :
    COLORS.textMuted;

  const statusLabel: string =
    networkStatus === 'checking' ? 'Đang kết nối...' :
    networkStatus === 'online'   ? `${portalCount} portal đang hoạt động` :
    networkStatus === 'degraded' ? 'Mạng giảm tải' :
    'Không kết nối được';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kết đèn</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Math.max(insets.bottom, 12) + 24 },
        ]}
      >
        {/* Banner */}
        <View style={styles.banner}>
          <View style={styles.bannerIcon}>
            <Icon name="lightning-bolt" size={28} color={LAMP_GOLD} />
          </View>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>LampNet Storage</Text>
            <Text style={styles.bannerDesc}>
              Lưu trữ phi tập trung, bất biến, bảo mật end-to-end
            </Text>
          </View>
        </View>

        {/* Trạng thái mạng */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TRẠNG THÁI MẠNG</Text>
          <View style={styles.card}>
            <View style={styles.networkRow}>
              {networkStatus === 'checking' ? (
                <ActivityIndicator size="small" color={LAMP_GOLD} />
              ) : (
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              )}
              <Text style={[styles.statusText, { color: networkStatus === 'checking' ? COLORS.textMuted : statusColor }]}>
                {statusLabel}
              </Text>
              {networkStatus !== 'checking' && (
                <TouchableOpacity onPress={checkNetwork} style={styles.refreshBtn}>
                  <Icon name="refresh" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.endpointText}>{LAMPNET_BASE}</Text>
          </View>
        </View>

        {/* Namespace cá nhân */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DANH TÍNH</Text>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>DID PhoenixKey</Text>
            {did ? (
              <Text style={styles.fieldValue} numberOfLines={1} ellipsizeMode="middle">
                {did}
              </Text>
            ) : (
              <Text style={[styles.fieldValue, { color: COLORS.textMuted }]}>
                Chưa có danh tính
              </Text>
            )}
            <View style={styles.divider} />
            <View style={styles.comingSoonRow}>
              <Icon name="clock-outline" size={14} color={LAMP_GOLD_DEEP} />
              <Text style={styles.comingSoonText}>
                Namespace cá nhân — sẵn sàng sau khi PhoenixKey JWT LampNet hoàn thiện
              </Text>
            </View>
          </View>
        </View>

        {/* Upload / Lưu trữ */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>LƯU TRỮ</Text>
          <View style={styles.cardCenter}>
            <View style={styles.uploadIconWrap}>
              <Icon name="folder-upload-outline" size={32} color={LAMP_GOLD} />
            </View>
            <Text style={styles.uploadTitle}>Lưu dữ liệu phi tập trung</Text>
            <Text style={styles.uploadDesc}>
              Mã hoá client-side AES-256-GCM, lưu trên LampNet với CID bất biến BLAKE3.
            </Text>
            <View style={styles.v21Badge}>
              <Text style={styles.v21BadgeText}>v2.1</Text>
            </View>
          </View>
        </View>

        {/* Inspect CID */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>KIỂM TRA CID</Text>
          <View style={styles.cardCenter}>
            <View style={styles.uploadIconWrap}>
              <Icon name="magnify" size={28} color={LAMP_GOLD} />
            </View>
            <Text style={styles.uploadTitle}>Tra cứu nội dung theo CID</Text>
            <Text style={styles.uploadDesc}>
              Nhập CID (định dạng <Text style={{ fontFamily: 'monospace' }}>ln1q_</Text>...) để xem metadata và tải về.
            </Text>
            <View style={styles.v21Badge}>
              <Text style={styles.v21BadgeText}>v2.1</Text>
            </View>
          </View>
        </View>

        {/* Link tới lampnet.cloud */}
        <TouchableOpacity
          style={styles.externalLink}
          onPress={() => Linking.openURL('https://lampnet.cloud').catch(() => {})}
          activeOpacity={0.7}
        >
          <Icon name="open-in-new" size={14} color={LAMP_GOLD_DEEP} />
          <Text style={styles.externalLinkText}>Tìm hiểu thêm tại lampnet.cloud</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  headerPlaceholder: { width: 36 },

  // Scroll
  scroll: { paddingTop: 20 },

  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: `${LAMP_GOLD}12`,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${LAMP_GOLD}30`,
    padding: 16,
  },
  bannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: `${LAMP_GOLD}20`,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bannerText: { flex: 1 },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: LAMP_GOLD_DEEP,
    marginBottom: 3,
  },
  bannerDesc: {
    fontSize: 12,
    color: LAMP_GOLD_DEEP,
    opacity: 0.75,
    lineHeight: 17,
  },

  // Section
  section: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },

  // Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 6,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  cardCenter: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },

  // Network
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  refreshBtn: {
    padding: 4,
  },
  endpointText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Fields
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
    fontFamily: 'monospace',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  comingSoonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  comingSoonText: {
    flex: 1,
    fontSize: 12,
    color: LAMP_GOLD_DEEP,
    lineHeight: 16,
  },

  // Upload card
  uploadIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: `${LAMP_GOLD}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  uploadTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  uploadDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  v21Badge: {
    marginTop: 4,
    backgroundColor: `${LAMP_GOLD}18`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${LAMP_GOLD}40`,
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  v21BadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: LAMP_GOLD_DEEP,
    letterSpacing: 0.5,
  },

  // External link
  externalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 12,
  },
  externalLinkText: {
    fontSize: 13,
    color: LAMP_GOLD_DEEP,
    fontWeight: '500',
  },
});

export default JoinScreen;
