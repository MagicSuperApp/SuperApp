// modules/work/screens/ContractDetailScreen.tsx
// Chi tiết hợp đồng + state machine Pledge. Nút hành động hiện theo (state, vai);
// backend là người quyết định (409 ESCROW_RULE nếu sai bước). Có nút mở ProofChat.

import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { WORK_THEME } from '../theme/colors';
import { formatVND } from '../data/mockData';
import { useContract, useContractAction, pledgeErrorMessage } from '../hooks/useContracts';
import { openConversation } from '../services/workApi';
import { isWorkBackendEnabled } from '../services/config';
import {
  STATE_META, PLEDGE_STEPS, stateIndex, availableActions, type PledgeActionBtn,
} from './contractState';
import StateView from '../../../components/state/StateView';
import type { ContractParty } from '../services/types';
import { showError, showInfo, showWarning } from '../../../utils/alert';
import { t } from '../../../i18n';

type RouteParams = { ContractDetail: { contractId: string } };

const ContractDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'ContractDetail'>>();
  const { contractId } = route.params;
  const { contract, loading, errorKind, usingMock, reload, setContract } = useContract(contractId);
  const { run, running } = useContractAction();
  const [openingChat, setOpeningChat] = useState(false);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Hợp đồng</Text>
      {usingMock && <View style={styles.demoTag}><Text style={styles.demoText}>DEMO</Text></View>}
    </View>
  );

  if (loading) return <View style={styles.root}>{header}<StateView status="loading" loadingLines={5} /></View>;
  if (errorKind === 'network') return <View style={styles.root}>{header}<StateView status="offline" onRetry={reload} /></View>;
  if (errorKind && errorKind !== 'client') return <View style={styles.root}>{header}<StateView status="error" onRetry={reload} /></View>;
  if (!contract) {
    return (
      <View style={styles.root}>{header}
        <StateView status="empty" title="Không tìm thấy hợp đồng" actionLabel="Quay lại" onAction={() => navigation.goBack()} />
      </View>
    );
  }

  const meta = STATE_META[contract.state];
  const curIdx = stateIndex(contract.state);
  const actions = availableActions(contract);

  const onAction = (btn: PledgeActionBtn) => {
    const confirmMsg =
      btn.action === 'dispute' ? 'Mở tranh chấp hợp đồng này?'
      : btn.action === 'lockPledge' ? `Khoá ${contract.parties[contract.myRole ?? 'aladin']?.pledgeAsk} MAGIC làm cọc? Số CARP tương ứng sẽ bị giữ.`
      : `Xác nhận: ${btn.label}?`;
    showWarning('Xác nhận', confirmMsg, {
        confirmText: 'Đồng ý',
        cancelText: 'Huỷ',
        onConfirm: async () => {
          try {
            // Truyền version đang cầm → header If-Version chặn double-apply (409).
            const updated = await run(contract.id, btn.action, btn.body, contract.version);
            if (updated) setContract(updated);
            if (isWorkBackendEnabled()) reload();
            else showInfo(t('Chế độ demo'), t('Cần backend AladinWork để thực thi bước này.'));
          } catch (err) {
            showError(t('Không thực hiện được'), pledgeErrorMessage(err));
          }
        },
    });
  };

  const onOpenChat = async () => {
    if (!isWorkBackendEnabled()) {
      showInfo('Chế độ demo', 'Cần backend để mở phòng chat của hợp đồng.');
      return;
    }
    setOpeningChat(true);
    try {
      const conv = await openConversation(contract.id);
      if (!conv.conversationId || conv.status === 'unconfigured') {
        showInfo('Chat chưa sẵn sàng', 'ProofChat chưa được cấu hình cho hợp đồng này. Bạn có thể nối lại sau.');
        return;
      }
      navigation.navigate('ChatRoom', { roomId: conv.conversationId });
    } catch {
      showError('Lỗi', 'Không mở được phòng chat, thử lại.');
    } finally {
      setOpeningChat(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={WORK_THEME.primaryDeep} />
      {header}

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Trạng thái */}
        <View style={styles.titleBox}>
          <View style={[styles.badge, { backgroundColor: meta.glow, alignSelf: 'flex-start' }]}>
            <View style={[styles.dot, { backgroundColor: meta.color }]} />
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={styles.service}>{contract.service}</Text>
          {typeof contract.serviceFeeVND === 'number' && (
            <Text style={styles.fee}>Giá dịch vụ {formatVND(contract.serviceFeeVND)} VND · trả off-chain</Text>
          )}
        </View>

        {/* Tiến trình Pledge */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tiến trình ký quỹ</Text>
          <View style={styles.stepper}>
            {PLEDGE_STEPS.map((s, i) => {
              const idx = stateIndex(s.state);
              const done = curIdx >= idx && curIdx >= 0;
              const active = contract.state === s.state;
              return (
                <React.Fragment key={s.state}>
                  {i > 0 && <View style={[styles.stepLine, done && styles.stepLineDone]} />}
                  <View style={styles.stepItem}>
                    <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                      {done && <Icon name="check" size={11} color="#fff" />}
                    </View>
                    <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{s.label}</Text>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {/* Hai bên + cọc */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hai bên & ký quỹ</Text>
          <PartyRow label="Người thuê (Aladin)" party={contract.parties.aladin} isMe={contract.myRole === 'aladin'} />
          <View style={styles.partyDivider} />
          <PartyRow label="Người nhận (Genie)" party={contract.parties.genie} isMe={contract.myRole === 'genie'} />
        </View>

        {/* Nhật ký */}
        {contract.log && contract.log.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Nhật ký</Text>
            {contract.log.slice().reverse().map((l, i) => (
              <View key={i} style={styles.logItem}>
                <View style={styles.logDot} />
                <Text style={styles.logMsg}>{l.msg}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Thanh hành động */}
      <View style={styles.bottomBar}>
        <TouchableOpacity onPress={onOpenChat} style={styles.chatBtn} disabled={openingChat}>
          {openingChat
            ? <ActivityIndicator size="small" color={WORK_THEME.primary} />
            : <Icon name="message-outline" size={20} color={WORK_THEME.primary} />}
        </TouchableOpacity>
        <View style={{ flex: 1, gap: 8 }}>
          {/* Bên làm (Genie) đăng bằng chứng TRƯỚC khi giao việc (server đòi evidence
              cho bước deliver). Hiện khi hợp đồng đang thực hiện. */}
          {contract.state === 'ACTIVE' && contract.myRole === 'genie' && (
            <TouchableOpacity
              onPress={() => navigation.navigate('WorkEvidence', { contractId: contract.id })}
              activeOpacity={0.85}
              style={[styles.actionBtn, styles.actionSecondary]}
            >
              <Text style={[styles.actionText, { color: WORK_THEME.primary }]}>Đăng bằng chứng</Text>
            </TouchableOpacity>
          )}
          {actions.length === 0 ? (
            <View style={styles.noAction}>
              <Icon name="information-outline" size={14} color={COLORS.textMuted} />
              <Text style={styles.noActionText}>Chờ phía bên kia hoặc hợp đồng đã kết thúc.</Text>
            </View>
          ) : (
            actions.map((btn) => (
              <TouchableOpacity
                key={btn.action + btn.label}
                onPress={() => onAction(btn)}
                disabled={running !== null}
                activeOpacity={0.85}
                style={[
                  styles.actionBtn,
                  btn.tone === 'secondary' && styles.actionSecondary,
                  btn.tone === 'danger' && styles.actionDanger,
                ]}
              >
                {running === btn.action
                  ? <ActivityIndicator size="small" color={btn.tone === 'primary' ? '#fff' : WORK_THEME.primary} />
                  : (
                    <Text style={[
                      styles.actionText,
                      btn.tone !== 'primary' && { color: btn.tone === 'danger' ? '#C0533A' : WORK_THEME.primary },
                    ]}>
                      {btn.label}
                    </Text>
                  )}
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
    </View>
  );
};

const PartyRow: React.FC<{ label: string; party: ContractParty; isMe: boolean }> = ({
  label, party, isMe,
}) => (
  <View style={styles.partyRow}>
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={styles.partyName}>{party.name}</Text>
        {isMe && <View style={styles.meTag}><Text style={styles.meText}>Bạn</Text></View>}
      </View>
      <Text style={styles.partyLabel}>{label}</Text>
    </View>
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={styles.partyPledge}>{party.pledgeLocked}/{party.pledgeAsk}</Text>
      <Text style={styles.partyPledgeLabel}>MAGIC {party.pledgeLocked >= party.pledgeAsk && party.pledgeAsk > 0 ? '· đã khoá' : '· chờ'}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: WORK_THEME.primaryDeep,
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },
  demoTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.16)' },
  demoText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  titleBox: {
    backgroundColor: COLORS.card, margin: 12, padding: 16, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, gap: 10,
  },
  service: { fontSize: 17, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3, lineHeight: 23 },
  fee: { fontSize: 12, color: COLORS.textSub, fontWeight: '600' },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: '800' },

  section: {
    backgroundColor: COLORS.card, marginHorizontal: 12, marginBottom: 8, padding: 16,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text, marginBottom: 14 },

  stepper: { flexDirection: 'row', alignItems: 'flex-start' },
  stepItem: { alignItems: 'center', width: 56 },
  stepDot: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.inputBg,
    borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: '#2E7D46', borderColor: '#2E7D46' },
  stepDotActive: { borderColor: WORK_THEME.primary, backgroundColor: WORK_THEME.primary },
  stepLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '700', marginTop: 5, textAlign: 'center' },
  stepLabelActive: { color: WORK_THEME.primary },
  stepLine: { flex: 1, height: 2, backgroundColor: COLORS.border, marginTop: 11 },
  stepLineDone: { backgroundColor: '#2E7D46' },

  partyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  partyDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  partyName: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  partyLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 },
  meTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: WORK_THEME.primaryGlow },
  meText: { fontSize: 9, fontWeight: '800', color: WORK_THEME.primary },
  partyPledge: { fontSize: 15, fontWeight: '900', color: WORK_THEME.primary },
  partyPledgeLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },

  logItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  logDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: WORK_THEME.primaryLight },
  logMsg: { flex: 1, fontSize: 12, color: COLORS.textSub },

  bottomBar: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-end',
    paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 24,
    backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  chatBtn: {
    width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: WORK_THEME.primaryGlow, borderWidth: 1, borderColor: WORK_THEME.primaryLight,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, backgroundColor: WORK_THEME.primary, borderRadius: 12,
  },
  actionSecondary: { backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: WORK_THEME.primary },
  actionDanger: { backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: '#C0533A' },
  actionText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  noAction: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, justifyContent: 'center' },
  noActionText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
});

export default ContractDetailScreen;
