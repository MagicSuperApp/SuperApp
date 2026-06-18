// modules/proofchat/features/chat/components/SyncStatusPill.tsx

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { withAlpha } from '../../../../../shared/theme';
import { PROOFCHAT_THEME } from '../../../theme/colors';
import type { SyncState } from '../types';

interface Props {
  state: SyncState;
}

const SyncStatusPill: React.FC<Props> = ({ state }) => {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state.syncing) {
      Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      spin.stopAnimation();
      spin.setValue(0);
    }
  }, [state.syncing]);

  if (!state.online) {
    return (
      <View style={[styles.wrap, styles.offline]}>
        <Icon name="cloud-off-outline" size={11} color="#C0533A" />
        <Text style={[styles.text, { color: '#C0533A' }]}>
          Queued (offline){state.queuedCount > 0 ? ` · ${state.queuedCount}` : ''}
        </Text>
      </View>
    );
  }

  if (state.syncing) {
    const rotate = spin.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });
    return (
      <View style={[styles.wrap, styles.syncing]}>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Icon name="sync" size={11} color={PROOFCHAT_THEME.primary} />
        </Animated.View>
        <Text style={[styles.text, { color: PROOFCHAT_THEME.primary }]}>
          Syncing…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, styles.ok]}>
      <Icon name="cloud-check-outline" size={11} color="#3D7A5E" />
      <Text style={[styles.text, { color: '#3D7A5E' }]}>Sent</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  ok: { backgroundColor: withAlpha('#3D7A5E', 0.10) },
  offline: { backgroundColor: withAlpha('#C0533A', 0.10) },
  syncing: { backgroundColor: withAlpha(PROOFCHAT_THEME.primary, 0.10) },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
});

export default SyncStatusPill;
