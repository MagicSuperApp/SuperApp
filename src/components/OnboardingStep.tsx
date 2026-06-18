// Build 52 (2026-05-17) — Single step view used by OnboardingWizard.
//
// Layout (mobile portrait, farmer-friendly):
//   ┌──────────────────────────┐
//   │      [big icon 80px]      │
//   │       <Title bold>        │
//   │  ✓ bullet 1               │
//   │  ✓ bullet 2               │
//   │  ✓ bullet 3               │
//   │       ● ○ ○  (dots)       │
//   └──────────────────────────┘
//
// All text in Vietnamese — nông dân U50 là persona chính.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS } from '../constants';
import { useSystemAccessibility, scaledFontSize } from '../hooks/useSystemAccessibility';

export interface OnboardingStepProps {
  iconName: string;
  title: string;
  bullets: string[];
  stepNum: number;     // 1-indexed
  totalSteps: number;
}

const OnboardingStep: React.FC<OnboardingStepProps> = ({
  iconName,
  title,
  bullets,
  stepNum,
  totalSteps,
}) => {
  const a11y = useSystemAccessibility();
  const titleSize = scaledFontSize(20, a11y.fontScale);
  const bulletSize = scaledFontSize(16, a11y.fontScale);

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Icon name={iconName} size={80} color={COLORS.accent} />
      </View>

      <Text
        style={[styles.title, { fontSize: titleSize }]}
        accessibilityRole="header"
      >
        {title}
      </Text>

      <View style={styles.bulletList}>
        {bullets.map((b, i) => (
          <View key={i} style={styles.bulletRow}>
            <Icon
              name="check-circle"
              size={20}
              color={COLORS.success}
              style={styles.bulletIcon}
            />
            <Text style={[styles.bulletText, { fontSize: bulletSize }]}>{b}</Text>
          </View>
        ))}
      </View>

      <View style={styles.dotsRow} accessibilityLabel={`Bước ${stepNum} trên ${totalSteps}`}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === stepNum - 1 ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  bulletList: {
    alignSelf: 'stretch',
    marginBottom: 32,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bulletIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  bulletText: {
    flex: 1,
    color: COLORS.textSub,
    lineHeight: 22,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 5,
  },
  dotActive: {
    backgroundColor: COLORS.accent,
  },
  dotInactive: {
    backgroundColor: COLORS.border,
  },
});

export default OnboardingStep;
