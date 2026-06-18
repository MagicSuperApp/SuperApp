// Build 52 (2026-05-17) — 3-step onboarding wizard for first-time users.
//
// Shown once on first launch (before reaching Main). User can either
// step through all 3 cards or tap "Bỏ qua" — either way we persist
// the completion flag via onboardingStorage and replace() to Main so
// the wizard isn't on the back stack.
//
// Persona: nông dân U50 — short text, big icons, no jargon.

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import OnboardingStep from '../components/OnboardingStep';
import { markOnboardingComplete } from '../utils/onboardingStorage';
import { COLORS } from '../constants';
import {
  useSystemAccessibility,
  adjustedDuration,
  scaledFontSize,
} from '../hooks/useSystemAccessibility';

interface StepDef {
  iconName: string;
  title: string;
  bullets: string[];
}

const STEPS: StepDef[] = [
  {
    iconName: 'shape-polygon-plus',
    title: 'Bước 1: Tạo nông trại',
    bullets: [
      'Đi 1 vòng quanh ruộng, app tự ghi điểm GPS mỗi vài mét',
      'Cần tối thiểu 4 điểm để tạo ranh giới',
      'Bấm "Hoàn thành" khi đủ điểm',
    ],
  },
  {
    iconName: 'tree',
    title: 'Bước 2: Thêm cây vào nông trại',
    bullets: [
      'Tap vào vị trí cây trên bản đồ vườn',
      'Mỗi cây có mã định danh riêng',
      'Đặt tên cây để dễ nhớ (vd "Cây tổ tiên")',
    ],
  },
  {
    iconName: 'camera-iris',
    title: 'Bước 3: Chụp ảnh 3D cây',
    bullets: [
      'Đi 1 vòng quanh cây trong ~30 giây',
      'App tự chụp ảnh, không cần bấm gì',
      'Đợi 1-2 phút để máy chủ dựng mô hình 3D',
    ],
  },
];

type Nav = StackNavigationProp<Record<string, object | undefined>>;

const OnboardingWizard: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const [stepIndex, setStepIndex] = useState(0);
  const a11y = useSystemAccessibility();
  const animDuration = adjustedDuration(300, a11y.reduceMotion);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  const transitionTo = (nextIdx: number) => {
    if (animDuration === 0) {
      setStepIndex(nextIdx);
      return;
    }
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: animDuration / 2,
      useNativeDriver: true,
    }).start(() => {
      setStepIndex(nextIdx);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: animDuration / 2,
        useNativeDriver: true,
      }).start();
    });
  };

  const finish = async () => {
    await markOnboardingComplete();
    navigation.replace('Login');
  };

  const next = async () => {
    if (stepIndex < STEPS.length - 1) {
      transitionTo(stepIndex + 1);
    } else {
      await finish();
    }
  };

  const skip = async () => {
    await finish();
  };

  const isLast = stepIndex === STEPS.length - 1;
  const buttonTextSize = scaledFontSize(16, a11y.fontScale);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={skip}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Bỏ qua hướng dẫn"
        >
          <Text style={[styles.skipText, { fontSize: buttonTextSize }]}>Bỏ qua</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[styles.stepContainer, { opacity: fadeAnim }]}>
        <OnboardingStep
          {...STEPS[stepIndex]}
          stepNum={stepIndex + 1}
          totalSteps={STEPS.length}
        />
      </Animated.View>

      <View style={styles.buttonsRow}>
        <TouchableOpacity
          onPress={next}
          style={styles.primaryBtn}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Hoàn thành hướng dẫn' : 'Bước tiếp theo'}
        >
          <Text style={[styles.primaryBtnText, { fontSize: buttonTextSize }]}>
            {isLast ? 'Hoàn thành' : 'Tiếp'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  skipText: {
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  stepContainer: {
    flex: 1,
  },
  buttonsRow: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: COLORS.white,
    fontWeight: '700',
  },
});

export default OnboardingWizard;
