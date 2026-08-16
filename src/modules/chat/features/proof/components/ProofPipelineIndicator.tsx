// modules/chat/features/proof/components/ProofPipelineIndicator.tsx
//
// Chip nhỏ hiển thị stage hiện tại trong proof lifecycle.
// Dùng inline trong message bubble khi stage đang ở chế độ "đang xử lý".

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import type { MessageStage } from '../types';
import { STAGE_LABEL } from '../lifecycle';

const STAGE_ICON: Partial<Record<MessageStage, string>> = {
  encrypting:           'lock-plus-outline',
  signing:              'draw',
  sending:              'send-outline',
  decrypting:           'lock-open-variant-outline',
  verifying_signature:  'draw',
  checking_integrity:   'shield-search',
};

interface Props {
  stage: MessageStage;
  isMine?: boolean;
}

const ProofPipelineIndicator: React.FC<Props> = ({ stage, isMine }) => {
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
    // Effect chạy lại mỗi lần `stage` đổi. Không dừng vòng cũ thì mỗi bước của
    // đường ống để lại thêm một vòng nhấp nháy chồng lên nhau.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.6,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [stage]);

  const icon = STAGE_ICON[stage] ?? 'progress-clock';
  const label = STAGE_LABEL[stage];

  const accent = isMine ? 'rgba(255,255,255,0.95)' : CHAT_THEME.primary;
  const bg = isMine
    ? 'rgba(255,255,255,0.18)'
    : withAlpha(CHAT_THEME.primary, 0.10);

  return (
    <Animated.View style={[styles.wrap, { backgroundColor: bg, opacity: fade }]}>
      <Animated.View style={{ opacity: pulse }}>
        <Icon name={icon} size={11} color={accent} />
      </Animated.View>
      <Text style={[styles.text, { color: accent }]}>{label}…</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
});

export default ProofPipelineIndicator;
