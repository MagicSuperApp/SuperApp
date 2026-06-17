// modules/proofchat/features/chat/components/MessageBubble.tsx
//
// Bubble cho 1 tin nhắn. Hiển thị nội dung + lifecycle + kết quả kiểm chứng.
// - Đang gửi (encrypting/signing/sending) → ProofPipelineIndicator
// - Đang nhận (decrypting/verifying/checking) → ProofPipelineIndicator
// - Encrypted (chưa decrypt) → placeholder, tap để chạy pipeline
// - Done + verified → normal bubble + ✅
// - Done + failed → đổi sang trạng thái cảnh báo đỏ, disable trust UI

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { PROOFCHAT_THEME } from '../../../theme/colors';
import type { Message } from '../types';
import { formatTime } from '../../../shared/utils/format';
import {
  isProcessing,
  type MessageStage,
} from '../../proof/types';
import ProofPipelineIndicator from '../../proof/components/ProofPipelineIndicator';

interface Props {
  message: Message;
  showTail?: boolean;
  onDecrypt?: (m: Message) => void;
}

const SEND_STATUS_ICON: Partial<Record<MessageStage, { name: string; color?: string }>> = {
  queued:      { name: 'cloud-off-outline' },
  sent:        { name: 'check' },
  delivered:   { name: 'check-all' },
  read:        { name: 'check-all', color: '#A8E6A1' },
  failed_send: { name: 'alert-circle-outline', color: '#FFB4A0' },
};

const MessageBubble: React.FC<Props> = ({ message, showTail = true, onDecrypt }) => {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(message.isMine ? 8 : -8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, []);

  const isMine = message.isMine;
  const stage = message.stage;
  const failed = message.verificationStatus === 'failed';

  // ── Bubble color ──
  const bubbleStyle = [
    styles.bubble,
    isMine ? styles.bubbleMine : styles.bubbleTheirs,
    !showTail && (isMine ? styles.bubbleMineNoTail : styles.bubbleTheirsNoTail),
    failed && styles.bubbleFailed,
  ];

  // ── Content ──
  const isProc = isProcessing(stage);
  const isEncrypted = stage === 'encrypted';

  return (
    <Animated.View
      style={[
        styles.row,
        isMine ? styles.rowMine : styles.rowTheirs,
        { opacity: fade, transform: [{ translateX: slide }] },
      ]}
    >
      <View style={bubbleStyle}>
        {/* ─── BODY ─── */}
        {isEncrypted ? (
          <EncryptedPlaceholder
            isMine={isMine}
            onDecrypt={() => onDecrypt?.(message)}
          />
        ) : isProc ? (
          <ProcessingBody
            stage={stage}
            isMine={isMine}
            text={message.text}
          />
        ) : (
          <Text
            style={[
              styles.text,
              isMine ? styles.textMine : styles.textTheirs,
              failed && styles.textFailed,
            ]}
          >
            {message.text}
          </Text>
        )}

        {/* ─── META ROW ─── */}
        {!isEncrypted && !isProc && (
          <View style={styles.metaRow}>
            {/* Verification badge — chỉ hiện khi stage === 'done' (tin đã nhận xong) */}
            {!isMine && stage === 'done' && (
              <VerifPill status={message.verificationStatus} />
            )}

            <Text
              style={[
                styles.time,
                isMine ? styles.timeMine : styles.timeTheirs,
                failed && styles.timeFailed,
              ]}
            >
              {formatTime(message.timestamp)}
            </Text>

            {/* Status tick icons — chỉ với tin của mình */}
            {isMine && SEND_STATUS_ICON[stage] && (
              <Icon
                name={SEND_STATUS_ICON[stage]!.name}
                size={13}
                color={
                  SEND_STATUS_ICON[stage]!.color ??
                  (isMine ? 'rgba(255,255,255,0.85)' : NEUTRAL.textMuted)
                }
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
        )}

        {/* Failed warning footer — disable trust UI */}
        {failed && stage === 'done' && (
          <View style={styles.failedFooter}>
            <Icon name="shield-off-outline" size={12} color="#C0533A" />
            <Text style={styles.failedFooterText}>
              Không xác minh được nguồn gốc — không nên tin nội dung này.
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────────

const ProcessingBody: React.FC<{
  stage: MessageStage;
  isMine: boolean;
  text?: string;
}> = ({ stage, isMine, text }) => (
  <View style={{ gap: 6 }}>
    {!!text && (
      <Text
        style={[
          styles.text,
          isMine ? styles.textMine : styles.textTheirs,
          { opacity: 0.7 },
        ]}
        numberOfLines={2}
      >
        {text}
      </Text>
    )}
    <ProofPipelineIndicator stage={stage} isMine={isMine} />
  </View>
);

const EncryptedPlaceholder: React.FC<{
  isMine: boolean;
  onDecrypt: () => void;
}> = ({ isMine, onDecrypt }) => (
  <TouchableOpacity activeOpacity={0.7} onPress={onDecrypt}>
    <View style={styles.encryptedRow}>
      <Icon
        name="lock-outline"
        size={16}
        color={isMine ? 'rgba(255,255,255,0.85)' : PROOFCHAT_THEME.primary}
      />
      <Text
        style={[
          styles.encryptedText,
          { color: isMine ? 'rgba(255,255,255,0.92)' : PROOFCHAT_THEME.primaryDeep },
        ]}
      >
        Tin nhắn đã mã hóa — chạm để giải mã
      </Text>
    </View>
  </TouchableOpacity>
);

const VerifPill: React.FC<{ status: Message['verificationStatus'] }> = ({
  status,
}) => {
  const map = {
    verified: { icon: 'shield-check', label: 'Đã xác thực', color: '#3D7A5E' },
    pending:  { icon: 'shield-sync-outline', label: 'Đang xác thực', color: '#B07D2F' },
    failed:   { icon: 'shield-alert',  label: 'Không xác thực', color: '#C0533A' },
  } as const;
  const cfg = map[status];
  return (
    <View
      style={[
        styles.verifPill,
        { backgroundColor: withAlpha(cfg.color, 0.14) },
      ]}
    >
      <Icon name={cfg.icon} size={9} color={cfg.color} />
      <Text style={[styles.verifText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 2, paddingHorizontal: 12 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },

  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  bubbleMine: {
    backgroundColor: PROOFCHAT_THEME.primary,
    borderBottomRightRadius: 6,
  },
  bubbleMineNoTail: { borderBottomRightRadius: 18 },
  bubbleTheirs: {
    backgroundColor: NEUTRAL.card,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    borderBottomLeftRadius: 6,
  },
  bubbleTheirsNoTail: { borderBottomLeftRadius: 18 },
  bubbleFailed: {
    backgroundColor: '#FFF5F2',
    borderColor: '#E8B0A0',
    borderWidth: 1.5,
  },

  text: { fontSize: 14, lineHeight: 20 },
  textMine: { color: NEUTRAL.white },
  textTheirs: { color: NEUTRAL.text },
  textFailed: {
    color: '#8C3622',
    textDecorationLine: 'line-through',
    textDecorationStyle: 'dotted',
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  time: { fontSize: 10, fontWeight: '500' },
  timeMine: { color: 'rgba(255,255,255,0.8)' },
  timeTheirs: { color: NEUTRAL.textMuted },
  timeFailed: { color: '#C0533A' },

  encryptedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  encryptedText: { fontSize: 13, fontStyle: 'italic', fontWeight: '500' },

  verifPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
  },
  verifText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  failedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8B0A0',
  },
  failedFooterText: {
    flex: 1,
    fontSize: 11,
    color: '#8C3622',
    fontWeight: '600',
    lineHeight: 15,
  },
});

export default MessageBubble;
