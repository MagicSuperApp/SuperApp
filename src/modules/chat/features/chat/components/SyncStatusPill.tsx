// modules/chat/features/chat/components/SyncStatusPill.tsx
//
// Một viên nhỏ báo tình trạng kết nối. Chỉ hiện khi CÓ CHUYỆN — mất mạng, đang
// đồng bộ, hoặc còn tin nằm chờ. Kết nối bình thường thì không vẽ gì cả: một viên
// xanh "Đã kết nối" đứng suốt ngày trên đầu phòng chat chỉ tốn chỗ và tốn mắt.

import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { MOTION, RADIUS, SPACE } from '../../../theme/fluent';
import type { SyncState } from '../types';

interface Props {
  state: SyncState;
}

const SyncStatusPill: React.FC<Props> = ({ state }) => {
  const fade = useRef(new Animated.Value(0)).current;

  const offline = !state.online;
  const queued = state.queuedCount > 0;
  const show = offline || state.syncing || queued;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: show ? 1 : 0,
      duration: MOTION.normal,
      useNativeDriver: true,
    }).start();
  }, [show, fade]);

  if (!show) return null;

  const cfg = offline
    ? { icon: 'wifi-off', tint: NEUTRAL.warning, label: 'Đang ngoại tuyến — tin sẽ gửi khi có mạng' }
    : queued
    ? {
        icon: 'clock-outline',
        tint: NEUTRAL.warning,
        label: `${state.queuedCount} tin đang chờ gửi`,
      }
    : { icon: 'sync', tint: NEUTRAL.info, label: 'Đang cập nhật…' };

  return (
    <Animated.View
      style={[styles.pill, { opacity: fade, backgroundColor: withAlpha(cfg.tint, 0.12) }]}
    >
      <Icon name={cfg.icon} size={12} color={cfg.tint} />
      <Text style={[styles.text, { color: cfg.tint }]} numberOfLines={1}>
        {cfg.label}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'center',
    marginVertical: SPACE.xs + 2,
    paddingHorizontal: SPACE.md,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  text: { fontSize: 11.5, fontWeight: '600' },
});

export default SyncStatusPill;
