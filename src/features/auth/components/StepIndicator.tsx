// features/auth/components/StepIndicator.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AUTH_BLUE } from '../theme';

interface Props {
  current: number;   // 1-based
  total: number;
}

const StepIndicator: React.FC<Props> = ({ current, total }) => {
  const dots = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Bước {current}/{total}</Text>
      <View style={styles.row}>
        {dots.map((n, i) => {
          const done = n < current;
          const active = n === current;
          return (
            <React.Fragment key={n}>
              <View
                style={[
                  styles.dot,
                  done && styles.dotDone,
                  active && styles.dotActive,
                ]}
              >
                {done && <View style={styles.innerCheck} />}
              </View>
              {i < dots.length - 1 && (
                <View style={[styles.bar, n < current && styles.barDone]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 6, alignItems: 'flex-end' },
  label: {
    fontSize: 10, fontWeight: '800',
    color: AUTH_BLUE.primary, letterSpacing: 1.4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: AUTH_BLUE.pale,
    alignItems: 'center', justifyContent: 'center',
  },
  dotActive: {
    backgroundColor: AUTH_BLUE.primary,
    width: 14, height: 14, borderRadius: 7,
    shadowColor: AUTH_BLUE.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 6,
    elevation: 4,
  },
  dotDone: { backgroundColor: AUTH_BLUE.primary },
  innerCheck: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: AUTH_BLUE.white,
  },
  bar: {
    width: 16, height: 2, borderRadius: 1,
    backgroundColor: AUTH_BLUE.pale,
  },
  barDone: { backgroundColor: AUTH_BLUE.primary },
});

export default StepIndicator;
