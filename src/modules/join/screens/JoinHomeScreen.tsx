// modules/join/screens/JoinHomeScreen.tsx
// Màn "Tham gia LampNet" (Kết đèn) — spec SG8·F8.4 §4.1.
//
// KHUNG UI + gọi API (spec §5): nút Join, chọn mức đóng góp (CPU/RAM/băng thông),
// hiện tier sau đăng ký. Token-driven, zero hardcode màu (brand lampnet =
// vàng-hổ-phách trên nền app chủ). Đủ 4 trạng thái qua StateView.
//
// CHỖ CHỜ:
//   - Native `join_and_contribute` + seed_hex Keystore = Thư (joinService.joinViaNativeSdk).
//   - Endpoint LampNet dev sống thì Join thật; nay bắt lỗi 3 lớp qua JoinApiError.
//   - DID hiện qua adapter resolvePersonDid() — KHÔNG rò did:cardano thô (spec §6).

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';
import { COLORS } from '../../../constants';
import { LAMPNET_THEME } from '../theme/colors';
import StateView from '../../../components/state/StateView';
import { CONTRIBUTION_LEVELS, type ContributionLevel } from '../data/contributionLevels';
import {
  getPeerId,
  isNativeJoinAvailable,
  joinViaNativeSdk,
  resolvePersonDid,
  isLampNetBackendEnabled,
  JoinApiError,
  type JoinConfig,
  type JoinResult,
} from '../joinService';

type JoinPhase = 'idle' | 'joining' | 'joined' | 'error' | 'offline';

const JoinHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  // DID + địa chỉ ví lấy từ store user (đã đăng nhập). did đi qua adapter (spec §6).
  const currentUser = useSelector((s: RootState) => s.user.currentUser);
  const walletAddress = useSelector((s: RootState) => s.user.wallet?.address ?? null);
  const personDid = resolvePersonDid(currentUser?.did ?? currentUser?.id ?? null);

  const [level, setLevel] = useState<ContributionLevel['id']>('balanced');
  const [phase, setPhase] = useState<JoinPhase>('idle');
  const [result, setResult] = useState<JoinResult | null>(null);
  const [errorKind, setErrorKind] = useState<'auth' | 'server' | 'unsupported' | null>(null);

  const handleJoin = useCallback(async () => {
    // Chưa cấu hình backend → coi như offline (KHUNG chạy được, không vỡ).
    if (!isLampNetBackendEnabled()) {
      setPhase('offline');
      return;
    }
    // Cầu native chưa có ⇒ biết trước là không đăng ký được. Trả lời ngay, đừng bắt
    // người dùng chờ một vòng mạng để nhận câu trả lời đã biết.
    //
    // CỔNG NÀY PHẢI ĐỨNG TRƯỚC cổng danh tính. Đặt sau thì người dùng nhận câu "cần
    // danh tính và ví nhận thưởng", đi tạo danh tính sinh trắc + ví Cardano — một luồng
    // dài không lấy lại được thời gian — rồi quay lại mới bị báo "bản này chưa hỗ trợ".
    // Nói sai lý do còn tệ hơn không nói.
    if (!isNativeJoinAvailable()) {
      setErrorKind('unsupported');
      setPhase('error');
      return;
    }

    if (!personDid || !walletAddress) {
      // Thiếu danh tính/ví nhận thưởng → thông điệp quyền (auth), không phải lỗi mạng.
      setErrorKind('auth');
      setPhase('error');
      return;
    }

    setPhase('joining');
    setErrorKind(null);
    try {
      // Bước 0 — bootstrap.
      const { bootstrap_did } = await getPeerId();

      // Bước 1 — đăng ký. JoinConfig KHÔNG chứa seed_hex (INV-3 — native lo).
      const config: JoinConfig = {
        subject_did: personDid,
        cardano_address: walletAddress,
        bootstrap_did,
        attestation_mode: 'Hardware',
      };
      // Ưu tiên native SDK (Thư); nay fallback REST bên trong joinViaNativeSdk.
      const res = await joinViaNativeSdk(config);
      setResult(res);
      setPhase('joined');
    } catch (e) {
      if (e instanceof JoinApiError) {
        if (e.kind === 'network') {
          setPhase('offline');
        } else {
          setErrorKind(e.kind);
          setPhase('error');
        }
      } else {
        setErrorKind('server');
        setPhase('error');
      }
    }
  }, [personDid, walletAddress]);

  const retry = useCallback(() => {
    setPhase('idle');
    setErrorKind(null);
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={LAMPNET_THEME.primaryDeep} />

      {/* ── Header (brand-strip về app chủ — kênh 1+2, spec §4 / UI-UX §11) ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Icon name="arrow-left" size={22} color={LAMPNET_THEME.onPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle}>Góp máy</Text>
            <Text style={styles.headerSubtitle}>Góp sức máy · Tham gia mạng lưới</Text>
          </View>
          <View style={styles.headerIconWrap}>
            <Icon name="lightning-bolt" size={20} color={LAMPNET_THEME.onPrimary} />
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Giới thiệu ─────────────────────────────────────── */}
        <View style={styles.introCard}>
          <View style={styles.introIconWrap}>
            <Icon name="lightbulb-on-outline" size={26} color={LAMPNET_THEME.primary} />
          </View>
          <Text style={styles.introTitle}>Biến điện thoại thành một ngọn đèn của mạng</Text>
          <Text style={styles.introBody}>
            {/* Câu cuối trước đây là "Bạn toàn quyền chọn mức góp." — một lời hứa RỖNG:
                `CONTRIBUTION_LEVELS` người dùng chọn KHÔNG chảy vào `JoinConfig` (chỗ dựng
                cấu hình chỉ gửi 4 trường), nên không có mức nào được cưỡng chế cả. Người
                chọn "Nhẹ nhàng" rồi thấy máy nóng sẽ kết luận app nói dối, và họ đúng.
                Hoặc nối vào cưỡng chế thật, hoặc nói đúng hiện trạng — chọn vế thứ hai
                cho tới khi cầu native có thật (Join xác nhận chặn duy nhất còn lại là
                khâu đóng gói uniffi, thuộc LampNet core). */}
            Máy bạn góp một phần sức tính toán cho LampNet. Mỗi việc hoàn thành được
            mạng kiểm chứng (tính lại + ký) rồi tích thưởng. Mức góp sẽ mở ở bản sau.
          </Text>
        </View>

        {/* ── Chọn mức đóng góp (CPU/RAM/băng thông) ──────────── */}
        <Text style={styles.sectionLabel}>Mức đóng góp</Text>
        {CONTRIBUTION_LEVELS.map((lv) => {
          const active = lv.id === level;
          return (
            <TouchableOpacity
              key={lv.id}
              activeOpacity={0.9}
              onPress={() => setLevel(lv.id)}
              style={[styles.levelCard, active && styles.levelCardActive]}
            >
              <View
                style={[
                  styles.levelIconWrap,
                  active && { backgroundColor: LAMPNET_THEME.primary },
                ]}
              >
                <Icon
                  name={lv.icon}
                  size={20}
                  color={active ? LAMPNET_THEME.onPrimary : LAMPNET_THEME.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.levelTitleRow}>
                  <Text style={styles.levelTitle}>{lv.label}</Text>
                  {active && (
                    <Icon name="check-circle" size={18} color={LAMPNET_THEME.primary} />
                  )}
                </View>
                <Text style={styles.levelHint}>{lv.hint}</Text>
                <View style={styles.levelSpecRow}>
                  <SpecPill icon="chip" text={`CPU ${lv.cpuPct}%`} />
                  <SpecPill icon="memory" text={`RAM ${lv.ramMb}MB`} />
                  <SpecPill icon="access-point" text={`${lv.bandwidthMbps}Mbps`} />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Ước W điện/ngày — CHỖ CHỜ mobile-sdk `estimate_contribution` (spec §6). */}
        <View style={styles.estimatePlaceholder}>
          <Icon name="lightning-bolt-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.estimateText}>
            Ước lượng điện mỗi ngày sẽ hiện ở đây trong bản sau.
          </Text>
        </View>

        {/* ── Kết quả / trạng thái Join ───────────────────────── */}
        {phase === 'joining' && (
          <View style={styles.statusBox}>
            <ActivityIndicator color={LAMPNET_THEME.primary} />
            <Text style={styles.statusText}>Đang đăng ký tham gia mạng…</Text>
          </View>
        )}

        {phase === 'offline' && (
          <StateView status="offline" onRetry={retry} />
        )}

        {phase === 'error' && (
          <StateView
            status="error"
            title={
              errorKind === 'auth' ? 'Chưa tham gia được'
              : errorKind === 'unsupported' ? 'Chưa hỗ trợ'
              : 'Mạng đang trục trặc'
            }
            message={
              errorKind === 'auth'
                ? 'Cần có danh tính và ví nhận thưởng hợp lệ, hoặc bạn chưa đủ bậc tham gia.'
                : errorKind === 'unsupported'
                ? 'Tính năng Góp máy sẽ mở ở bản sau.'
                : 'Máy chủ đang bận. Thử lại sau ít phút.'
            }
            onRetry={retry}
          />
        )}

        {phase === 'joined' && (
          <View style={styles.tierCard}>
            <View style={styles.tierBadge}>
              <Icon name="medal-outline" size={18} color={LAMPNET_THEME.onPrimary} />
              <Text style={styles.tierBadgeText}>
                Bậc: {result?.tier != null ? String(result.tier) : '—'}
              </Text>
            </View>
            <Text style={styles.tierTitle}>Đã tham gia mạng lưới</Text>
            <Text style={styles.tierBody}>
              Máy của bạn giờ là một ngọn đèn của mạng. Theo dõi việc đang chạy và
              thưởng tích luỹ ở màn "Đang đóng góp".
            </Text>
            {/* Bậc là con số máy chủ TỰ SUY, KHÔNG được chữ ký nào phủ. Nhà LampNet
                đo và báo 12/08: `classify_tier` tính bậc từ `hw_cpu_score`/`hw_ram_mb`
                (`lib.rs:96-104`), mà bốn trường `hw_*` KHÔNG nằm trong `F` — khối được
                ký ở `attest_sig_hex`. Ai đứng trên đường truyền, kể cả node bootstrap
                nhận yêu cầu, sửa hai số đó là đổi bậc của người khác mà không phá chữ
                ký nào.
                Nên đừng trình bậc như một thuộc tính đã được chứng thực. Dòng dưới là
                mức trung thực rẻ nhất; khi nào bốn trường đó được ký thì gỡ nó đi. */}
            {result?.tier != null && (
              <Text style={styles.tierNote}>
                Bậc do máy chủ tự xếp theo cấu hình máy bạn khai. Nó chưa được ký, nên
                hãy coi là ước lượng.
              </Text>
            )}
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.tierCta}
              onPress={() => navigation.navigate('Contributing')}
            >
              <Text style={styles.tierCtaText}>Xem đóng góp</Text>
              <Icon name="arrow-right" size={18} color={LAMPNET_THEME.onPrimary} />
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ── Nút Join cố định đáy (ẩn khi đã join) ────────────── */}
      {phase !== 'joined' && (
        <View style={styles.footer}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.joinBtn, phase === 'joining' && styles.joinBtnDisabled]}
            disabled={phase === 'joining'}
            onPress={handleJoin}
          >
            <Icon name="power-plug-outline" size={20} color={LAMPNET_THEME.onPrimary} />
            <Text style={styles.joinBtnText}>
              {phase === 'joining' ? 'Đang góp máy…' : 'Góp máy — Tham gia ngay'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ── Sub-component ────────────────────────────────────────────────────
const SpecPill: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
  <View style={styles.specPill}>
    <Icon name={icon} size={12} color={COLORS.textMuted} />
    <Text style={styles.specPillText}>{text}</Text>
  </View>
);

// ── Styles (màu qua token: LAMPNET_THEME + COLORS — zero hardcode hex) ──
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LAMPNET_THEME.primaryLight },

  header: {
    backgroundColor: LAMPNET_THEME.primaryDeep,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitleBox: { flex: 1 },
  headerTitle: {
    fontSize: 19, fontWeight: '800', color: LAMPNET_THEME.onPrimary, letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11, color: LAMPNET_THEME.onPrimary, opacity: 0.8, marginTop: 2,
  },
  headerIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: LAMPNET_THEME.primaryGlow,
  },

  scrollContent: { padding: 16, paddingBottom: 24 },

  introCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: LAMPNET_THEME.primaryLight,
  },
  introIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: LAMPNET_THEME.primaryGlow,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  introTitle: {
    fontSize: 16, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2, marginBottom: 6,
  },
  introBody: { fontSize: 12, color: COLORS.textSub, lineHeight: 18 },

  sectionLabel: {
    fontSize: 13, fontWeight: '800', color: COLORS.text, marginBottom: 10, letterSpacing: -0.2,
  },

  levelCard: {
    flexDirection: 'row', gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  levelCardActive: { borderColor: LAMPNET_THEME.primary },
  levelIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: LAMPNET_THEME.primaryGlow,
    alignItems: 'center', justifyContent: 'center',
  },
  levelTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  levelHint: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, marginBottom: 8 },
  levelSpecRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  specPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: LAMPNET_THEME.primaryGlow, borderRadius: 6,
  },
  specPillText: { fontSize: 10, color: COLORS.textSub, fontWeight: '600' },

  estimatePlaceholder: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4, marginBottom: 16, paddingHorizontal: 4,
  },
  estimateText: { flex: 1, fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' },

  statusBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 12,
    backgroundColor: LAMPNET_THEME.primaryGlow, marginBottom: 12,
  },
  statusText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },

  tierCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16, padding: 18, marginTop: 4,
    borderWidth: 1.5, borderColor: LAMPNET_THEME.primary,
  },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: LAMPNET_THEME.primary, borderRadius: 8, marginBottom: 12,
  },
  tierBadgeText: { fontSize: 12, fontWeight: '800', color: LAMPNET_THEME.onPrimary },
  tierTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  tierBody: { fontSize: 12, color: COLORS.textSub, lineHeight: 18, marginBottom: 14 },
  tierNote: { fontSize: 11, color: COLORS.textMuted, lineHeight: 16, marginBottom: 14 },
  tierCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: LAMPNET_THEME.primaryDeep,
  },
  tierCtaText: { fontSize: 14, fontWeight: '800', color: LAMPNET_THEME.onPrimary },

  footer: {
    padding: 16, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: COLORS.divider,
    backgroundColor: COLORS.card,
  },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 14,
    backgroundColor: LAMPNET_THEME.primary,
  },
  joinBtnDisabled: { opacity: 0.6 },
  joinBtnText: { fontSize: 15, fontWeight: '800', color: LAMPNET_THEME.onPrimary, letterSpacing: 0.2 },
});

export default JoinHomeScreen;
