// onboarding/CoachMarkOverlay.tsx
//
// Lớp phủ luồng hướng dẫn: LÀM TỐI xung quanh + SPOTLIGHT vùng đang giới thiệu,
// kèm linh vật "nói" (TalkingBlinkLogo) và thẻ nội dung với nút Bỏ qua / Tiếp.
//
// CHẶN THAO TÁC: toàn màn được một View phủ kín bắt mọi chạm; chỉ nút Bỏ qua và
// Tiếp là bấm được — mọi nút khác của app vô hiệu trong lúc luồng chạy (đúng yêu
// cầu). Vùng spotlight chỉ được HIỂN THỊ (nhìn xuyên qua) chứ không bấm được.
//
// Kỹ thuật "khoét lỗ" bằng 4 dải tối bao quanh ô target (không cần svg mask).

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCoachMark, Rect } from './CoachMarkContext';
import TalkingBlinkLogo from '../components/TalkingBlinkLogo';

const SCRIM = 'rgba(6, 20, 10, 0.86)';   // tối đậm, ám xanh brand
const RING = '#7CE38B';                    // viền spotlight sáng
const BRAND = '#285B23';
const PAD = 10;                            // đệm quanh ô spotlight

export default function CoachMarkOverlay() {
  const { active, stepIndex, steps, next, skip, measure } = useCoachMark();
  const { height: SCREEN_H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const step = active ? steps[stepIndex] : null;

  const [rect, setRect] = useState<Rect | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // Fade lớp phủ khi bật/tắt.
  useEffect(() => {
    Animated.timing(fade, {
      toValue: active ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [active, fade]);

  // Đo vị trí target mỗi khi đổi bước (retry vài nhịp phòng layout chưa xong).
  useEffect(() => {
    if (!active || !step) {
      setRect(null);
      return;
    }
    if (step.targetId == null) {
      setRect(null);
      return;
    }
    let cancelled = false;
    let tries = 0;
    const tryMeasure = async () => {
      if (cancelled) return;
      const r = await measure(step.targetId as any);
      if (cancelled) return;
      if (r) {
        setRect(r);
      } else if (tries++ < 6) {
        setTimeout(tryMeasure, 70);
      } else {
        setRect(null); // không đo được → coi như bước không target (hiện giữa màn)
      }
    };
    setRect(null);
    tryMeasure();
    return () => {
      cancelled = true;
    };
  }, [active, step, stepIndex, measure]);

  // Nhịp "thở" cho viền spotlight.
  useEffect(() => {
    if (!active) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [active, pulse]);

  if (!active || !step) return null;

  const isLast = stepIndex >= steps.length - 1;

  // Ô spotlight (đã cộng đệm), kẹp trong màn hình.
  const hole = rect
    ? {
        x: Math.max(0, rect.x - PAD),
        y: Math.max(0, rect.y - PAD),
        w: rect.width + PAD * 2,
        h: rect.height + PAD * 2,
      }
    : null;

  const radius = step.radius ?? 16;

  // Thẻ nội dung: đặt dưới target nếu target ở nửa trên, ngược lại đặt trên;
  // không có target thì căn giữa.
  const targetCenterY = hole ? hole.y + hole.h / 2 : SCREEN_H / 2;
  const cardBelow = targetCenterY < SCREEN_H * 0.52;

  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { opacity: fade }]}
      pointerEvents="auto"
      // NUỐT mọi chạm không rơi vào nút Bỏ qua/Tiếp: nút của app (kể cả nút đang
      // được spotlight, nhìn xuyên qua "lỗ") sẽ KHÔNG bấm được khi luồng chạy.
      // TouchableOpacity của thẻ/skip sâu hơn nên vẫn giành responder trước.
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderRelease={() => {}}
    >
      <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.6)" translucent />

      {/* ── Lớp tối: 4 dải quanh ô spotlight (hoặc phủ kín nếu không có target) ── */}
      {hole ? (
        <>
          <View style={[styles.scrim, { top: 0, left: 0, right: 0, height: hole.y }]} />
          <View style={[styles.scrim, { top: hole.y + hole.h, left: 0, right: 0, bottom: 0 }]} />
          <View style={[styles.scrim, { top: hole.y, left: 0, width: hole.x, height: hole.h }]} />
          <View
            style={[
              styles.scrim,
              { top: hole.y, left: hole.x + hole.w, right: 0, height: hole.h },
            ]}
          />
          {/* Viền spotlight */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: hole.x,
              top: hole.y,
              width: hole.w,
              height: hole.h,
              borderRadius: radius,
              borderWidth: 2.5,
              borderColor: RING,
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            }}
          />
        </>
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.scrim]} />
      )}

      {/* ── Thẻ nội dung + linh vật ── */}
      <View
        pointerEvents="box-none"
        style={[
          styles.cardWrap,
          hole
            ? cardBelow
              ? { top: hole.y + hole.h + 18 }
              : { bottom: SCREEN_H - hole.y + 18 }
            : { top: 0, bottom: 0, justifyContent: 'center' },
        ]}
      >
        <View style={styles.mascotRow}>
          <TalkingBlinkLogo size={76} />
        </View>

        <View style={styles.card}>
          <Text style={styles.stepCounter}>
            Bước {stepIndex + 1}/{steps.length}
          </Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>

          <View style={styles.btnRow}>
            <TouchableOpacity onPress={skip} style={styles.skipBtn} activeOpacity={0.7}>
              <Text style={styles.skipText}>Bỏ qua</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={next} style={styles.nextBtn} activeOpacity={0.85}>
              <Text style={styles.nextText}>{isLast ? 'Xong' : 'Tiếp'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Nút Bỏ qua nổi trên cùng bên phải — luôn với tới được trong mọi bước. */}
      <TouchableOpacity
        onPress={skip}
        style={[styles.floatingSkip, { top: insets.top + 8 }]}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.floatingSkipText}>Bỏ qua ✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    backgroundColor: SCRIM,
  },
  cardWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  mascotRow: {
    marginBottom: -18,
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 26,
    paddingBottom: 18,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  stepCounter: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#14210F',
    marginBottom: 8,
  },
  body: {
    fontSize: 14.5,
    lineHeight: 21,
    color: '#3A4A36',
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 18,
  },
  skipBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8A968A',
  },
  nextBtn: {
    backgroundColor: BRAND,
    paddingVertical: 11,
    paddingHorizontal: 26,
    borderRadius: 12,
  },
  nextText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  floatingSkip: {
    position: 'absolute',
    right: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 16,
  },
  floatingSkipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
