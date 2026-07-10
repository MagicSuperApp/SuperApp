// modules/phoenixOrgMint/screens/OrgMintHomeScreen.tsx
//
// Entrypoint module "Tạo tổ chức & mint LAMP" (magiclamp.orgmint, navSlot=hub).
// 2 lối vào: (a) tạo OrgDID mới, (b) mint LAMP vào kho bằng quyền OrgDID hiện có.
// Chặn rõ nếu thiếu artifact deploy (.env) — KHÔNG cho vào luồng build tx sai.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RootState } from '../../../store';
import { COLORS, ORGMINT_THEME } from '../../../theme';
import {
  isPhoenixOrgMintEnabled,
  getMissingCreateOrgConfig,
  getMissingMintConfig,
} from '../../../config/phoenixOrgMint';

const GOLD = ORGMINT_THEME.primary;
const GOLD_DEEP = ORGMINT_THEME.primaryDeep;

const OrgMintHomeScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const currentUser = useSelector((state: RootState) => state.user.currentUser);
  const did = currentUser?.did ?? null;

  const enabled = isPhoenixOrgMintEnabled();
  const missingCreate = getMissingCreateOrgConfig();
  const missingMint = getMissingMintConfig();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tổ chức & LAMP</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}
      >
        <View style={styles.banner}>
          <View style={styles.bannerIcon}>
            <Icon name="domain-plus" size={26} color={GOLD} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>OrgDID + mint LAMP</Text>
            <Text style={styles.bannerDesc}>
              Tạo tổ chức (OrgDID) trên chuỗi, sau đó mint LAMP vào kho tổ chức theo
              quyền được Registry cấp.
            </Text>
          </View>
        </View>

        {!enabled && (
          <View style={styles.warnBox}>
            <Icon name="alert-circle-outline" size={18} color={COLORS.warning} />
            <Text style={styles.warnText}>
              Module đang TẮT (PHOENIX_ORG_MINT_ENABLED=false trong .env). Artifact
              deploy (policy-id/CBOR script) chưa được cấp cho bản build này.
            </Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>DANH TÍNH ĐANG DÙNG</Text>
        <View style={styles.card}>
          <Text style={styles.didText} numberOfLines={2} selectable>
            {did ?? 'Chưa đăng nhập'}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>THAO TÁC</Text>

        <TouchableOpacity
          style={[styles.actionCard, (!enabled || missingCreate.length > 0 || !did) && styles.actionCardDisabled]}
          activeOpacity={0.85}
          disabled={!enabled || missingCreate.length > 0 || !did}
          onPress={() => navigation.navigate('OrgMintCreate')}
        >
          <View style={styles.actionIconWrap}>
            <Icon name="domain-plus" size={22} color={GOLD_DEEP} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Tạo tổ chức (OrgDID)</Text>
            <Text style={styles.actionDesc}>
              Đúc anchor OrgDID mới trên chuỗi — bạn (chủ sở hữu) ký, tổ chức con giữ
              khoá điều khiển riêng.
            </Text>
            {missingCreate.length > 0 && (
              <Text style={styles.missingText}>Thiếu cấu hình: {missingCreate.join(', ')}</Text>
            )}
          </View>
          <Icon name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, (!enabled || missingMint.length > 0 || !did) && styles.actionCardDisabled]}
          activeOpacity={0.85}
          disabled={!enabled || missingMint.length > 0 || !did}
          onPress={() => navigation.navigate('OrgMintConfirm', { orgDid: did })}
        >
          <View style={styles.actionIconWrap}>
            <Icon name="hand-coin-outline" size={22} color={GOLD_DEEP} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Mint LAMP vào kho</Text>
            <Text style={styles.actionDesc}>
              Ký tx mint LAMP theo quyền Registry cấp cho OrgDID — LAMP rót thẳng vào
              KHO, KHÔNG ra ví.
            </Text>
            {missingMint.length > 0 && (
              <Text style={styles.missingText}>Thiếu cấu hình: {missingMint.join(', ')}</Text>
            )}
          </View>
          <Icon name="chevron-right" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 36, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: COLORS.text },
  headerPlaceholder: { width: 36 },
  scroll: { paddingTop: 20, paddingHorizontal: 20 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
    backgroundColor: `${GOLD}12`,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${GOLD}30`,
    padding: 16,
  },
  bannerIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: `${GOLD}20`, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  bannerTitle: { fontSize: 15, fontWeight: '700', color: GOLD_DEEP, marginBottom: 4 },
  bannerDesc: { fontSize: 13, color: COLORS.textSub, lineHeight: 18 },
  warnBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: `${COLORS.warning}14`, borderRadius: 12, padding: 12, marginBottom: 20,
  },
  warnText: { flex: 1, fontSize: 12.5, color: COLORS.warning, lineHeight: 18 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted,
    letterSpacing: 0.5, marginBottom: 8, marginTop: 4,
  },
  card: {
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, marginBottom: 20,
  },
  didText: { fontSize: 13, color: COLORS.text, fontFamily: 'monospace' },
  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, marginBottom: 12,
  },
  actionCardDisabled: { opacity: 0.5 },
  actionIconWrap: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: `${GOLD}18`,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  actionTitle: { fontSize: 14.5, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  actionDesc: { fontSize: 12.5, color: COLORS.textSub, lineHeight: 17 },
  missingText: { fontSize: 11, color: COLORS.error, marginTop: 4 },
});

export default OrgMintHomeScreen;
