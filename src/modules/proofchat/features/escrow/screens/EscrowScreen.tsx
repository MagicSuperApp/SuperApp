// modules/proofchat/features/escrow/screens/EscrowScreen.tsx
//
// Escrow MVP đơn giản: 3 status (Pending/Locked/Released) + 3 action (Fund/Approve/Cancel).
// Không nhắc tới chi tiết blockchain ở UI — đó là việc của tầng giao dịch dưới.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Animated, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../../../store';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { PROOFCHAT_THEME } from '../../../theme/colors';
import EscrowStatusCard from '../components/EscrowStatusCard';
import { setEscrowStatus } from '../../../store/proofchatSlice';
import { formatToken, truncateAddress } from '../../../shared/utils/format';
import { TOKEN_SYMBOL } from '../../wallet/types';
import type { EscrowStatus } from '../types';

const EscrowScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useDispatch();

  const roomId: string = route.params?.roomId;
  const room = useSelector((s: RootState) =>
    s.proofchat.rooms.find(r => r.id === roomId),
  );

  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(8)).current;
  const [busyAction, setBusyAction] = useState<EscrowStatus | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  if (!room || !room.escrow) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.notFound}>Không tìm thấy ký quỹ.</Text>
      </View>
    );
  }

  const { escrow } = room;

  // Chuyển status với một chút delay để giả lập "đang xử lý".
  const transition = (next: EscrowStatus) => {
    setBusyAction(next);
    setTimeout(() => {
      dispatch(setEscrowStatus({ roomId, status: next }));
      setBusyAction(null);
    }, 700);
  };

  const timeline = buildTimeline(escrow.status);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={NEUTRAL.bg} />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <Icon name="chevron-left" size={22} color={NEUTRAL.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ký quỹ (Escrow)</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Animated.View
          style={{ opacity: fade, transform: [{ translateY: slide }], marginBottom: 18 }}
        >
          <EscrowStatusCard escrow={escrow} jobTitle={room.jobTitle} />
        </Animated.View>

        {/* Counterparty info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>ĐỐI TÁC</Text>
          <View style={styles.infoRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {room.counterpartyName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoName}>{room.counterpartyName}</Text>
              <Text style={styles.infoSub}>
                {truncateAddress(room.counterpartyAddress)} · {room.jobCategory}
              </Text>
            </View>
            {room.counterpartyVerified && (
              <Icon name="check-decagram" size={20} color={PROOFCHAT_THEME.primary} />
            )}
          </View>
        </View>

        {/* Timeline 3 bước */}
        <Text style={styles.sectionTitle}>Tiến trình</Text>
        <View style={styles.timelineCard}>
          {timeline.map((step, i) => (
            <TimelineRow key={step.status} step={step} isLast={i === timeline.length - 1} />
          ))}
        </View>

        {/* Actions tùy theo status */}
        <View style={styles.actions}>
          {escrow.status === 'pending' && (
            <PrimaryButton
              icon="cash-plus"
              label={
                busyAction === 'locked'
                  ? 'Đang nạp…'
                  : `Fund — Nạp ${formatToken(escrow.amount)} ${TOKEN_SYMBOL}`
              }
              loading={busyAction === 'locked'}
              onPress={() => transition('locked')}
            />
          )}
          {escrow.status === 'locked' && (
            <>
              <PrimaryButton
                icon="check-decagram"
                label={
                  busyAction === 'released'
                    ? 'Đang giải ngân…'
                    : 'Approve — Xác nhận hoàn thành'
                }
                loading={busyAction === 'released'}
                onPress={() => transition('released')}
              />
              <SecondaryButton
                icon="close-circle-outline"
                label="Cancel — Hủy ký quỹ"
                color="#C0533A"
                onPress={() => transition('pending')}
              />
            </>
          )}
          {escrow.status === 'released' && (
            <View style={styles.successBox}>
              <Icon name="check-decagram" size={20} color="#3D7A5E" />
              <Text style={styles.successText}>
                Đã giải ngân — tiền cọc đã chuyển cho đối tác.
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.footnote}>
          Escrow giữ tiền cọc cho tới khi cả hai bên đồng ý giải ngân.
          Nếu hủy, tiền sẽ quay lại trạng thái Pending để xử lý tiếp.
        </Text>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
};

// ── Timeline ────────────────────────────────────────────────────────────────
type Step = {
  status: EscrowStatus;
  label: string;
  active: boolean;
  done: boolean;
};

function buildTimeline(current: EscrowStatus): Step[] {
  const order: EscrowStatus[] = ['pending', 'locked', 'released'];
  const idx = order.indexOf(current);
  return order.map((s, i) => ({
    status: s,
    label:
      s === 'pending' ? 'Tạo & Pending' :
      s === 'locked'  ? 'Nạp tiền (Locked)' :
                        'Giải ngân (Released)',
    done: i < idx,
    active: i === idx,
  }));
}

const TimelineRow: React.FC<{ step: Step; isLast: boolean }> = ({ step, isLast }) => {
  const dotColor = step.done ? '#3D7A5E' : step.active ? PROOFCHAT_THEME.primary : NEUTRAL.border;
  const labelColor = step.active || step.done ? NEUTRAL.text : NEUTRAL.textMuted;

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineLeft}>
        <View style={[styles.timelineDot, { backgroundColor: dotColor }]}>
          {step.done && <Icon name="check" size={11} color={NEUTRAL.white} />}
          {step.active && !step.done && <View style={styles.timelinePulse} />}
        </View>
        {!isLast && <View style={styles.timelineLine} />}
      </View>
      <View style={styles.timelineContent}>
        <Text style={[styles.timelineLabel, { color: labelColor }]}>{step.label}</Text>
      </View>
    </View>
  );
};

const PrimaryButton: React.FC<{
  icon: string; label: string; onPress: () => void; loading?: boolean;
}> = ({ icon, label, onPress, loading }) => {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={1}
        disabled={loading}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, {
            toValue: 1, friction: 4, useNativeDriver: true,
          }).start()
        }
        onPress={onPress}
        style={[styles.btnPrimary, loading && { opacity: 0.7 }]}
      >
        <Icon name={icon} size={18} color={NEUTRAL.white} />
        <Text style={styles.btnPrimaryText}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const SecondaryButton: React.FC<{
  icon: string; label: string; color?: string; onPress: () => void;
}> = ({ icon, label, color, onPress }) => (
  <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.btnSecondary}>
    <Icon name={icon} size={18} color={color ?? NEUTRAL.textSub} />
    <Text style={[styles.btnSecondaryText, color ? { color } : null]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NEUTRAL.bgSoft },
  center: { alignItems: 'center', justifyContent: 'center' },
  notFound: { color: NEUTRAL.textMuted, fontSize: 14 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 14,
    paddingBottom: 12,
    backgroundColor: NEUTRAL.bg,
    borderBottomWidth: 1, borderBottomColor: NEUTRAL.border,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: NEUTRAL.text, letterSpacing: -0.2 },

  scroll: { padding: 20 },

  infoCard: {
    backgroundColor: NEUTRAL.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: NEUTRAL.border, marginBottom: 18,
  },
  infoLabel: {
    fontSize: 9, fontWeight: '800',
    color: NEUTRAL.textMuted, letterSpacing: 1.2, marginBottom: 10,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.12),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: withAlpha(PROOFCHAT_THEME.primary, 0.4),
  },
  avatarText: { fontSize: 14, fontWeight: '800', color: PROOFCHAT_THEME.primary },
  infoName: { fontSize: 14, fontWeight: '700', color: NEUTRAL.text },
  infoSub: {
    fontSize: 11, color: NEUTRAL.textMuted, marginTop: 2,
    fontFamily: 'monospace',
  },

  sectionTitle: {
    fontSize: 13, fontWeight: '800',
    color: NEUTRAL.text, letterSpacing: -0.2, marginBottom: 10,
  },

  timelineCard: {
    backgroundColor: NEUTRAL.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: NEUTRAL.border, marginBottom: 18,
  },
  timelineRow: { flexDirection: 'row', gap: 12, minHeight: 36 },
  timelineLeft: { alignItems: 'center', width: 18 },
  timelineDot: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: NEUTRAL.bg,
  },
  timelinePulse: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: NEUTRAL.white,
  },
  timelineLine: {
    flex: 1, width: 2, backgroundColor: NEUTRAL.border, marginTop: 2,
  },
  timelineContent: { flex: 1, paddingBottom: 14, paddingTop: 1 },
  timelineLabel: { fontSize: 13, fontWeight: '700' },

  actions: { gap: 10, marginBottom: 16 },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: 14,
    backgroundColor: PROOFCHAT_THEME.primary,
    shadowColor: PROOFCHAT_THEME.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30, shadowRadius: 14, elevation: 5,
  },
  btnPrimaryText: { color: NEUTRAL.white, fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  btnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
    backgroundColor: NEUTRAL.card,
    borderWidth: 1, borderColor: NEUTRAL.border,
  },
  btnSecondaryText: { fontSize: 13, fontWeight: '700', color: NEUTRAL.textSub },
  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: withAlpha('#3D7A5E', 0.10),
    padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: withAlpha('#3D7A5E', 0.25),
  },
  successText: { flex: 1, fontSize: 12, color: '#2A5A44', lineHeight: 17 },
  footnote: {
    fontSize: 11, color: NEUTRAL.textMuted,
    textAlign: 'center', lineHeight: 17,
  },
});

export default EscrowScreen;
