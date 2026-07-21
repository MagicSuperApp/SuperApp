// onboarding/CoachMarkOverlay.tsx
//
// Lớp phủ luồng hướng dẫn: LÀM TỐI xung quanh + SPOTLIGHT vùng đang giới thiệu,
// kèm linh vật "nói" (TalkingBlinkLogo) và thẻ nội dung với nút "Tôi đã hiểu
// rồi!" (kết thúc) / "Tiếp".
//
// Bốn điểm cốt lõi (sửa các lỗi thực tế trên máy thật):
//
//  1) TOẠ ĐỘ ĐÚNG. Target đo bằng measureInWindow (gốc = cửa sổ, GỒM cả thanh
//     trạng thái trên Android). Overlay lại nằm trong cây view có thể bị đẩy
//     xuống → nếu vẽ thẳng theo toạ độ cửa sổ thì spotlight LỆCH. Ở đây đo thêm
//     chính khung overlay rồi TRỪ đi độ lệch gốc, nên khớp trên mọi máy/notch.
//
//  2) KHOÉT LỖ BO GÓC. Một View duy nhất với borderWidth cực lớn + borderRadius:
//     phần "viền" phủ kín màn hình, phần "ruột" là ô trong suốt BO GÓC đúng bằng
//     bo góc của viền sáng (cách cũ dùng 4 dải chữ nhật nên góc bị vuông).
//
//  3) BẤM ĐƯỢC. Lớp chặn thao tác là một View RIÊNG nằm DƯỚI thẻ nội dung. Trước
//     đây khung ngoài cùng tự nhận responder cả khi ngón tay nhích nhẹ
//     (onMoveShouldSetResponder) → cướp cú chạm của nút "Tiếp" và bước không
//     nhảy. Giờ nút nằm trên cùng nên luôn nhận được chạm.
//
//  4) KHÔNG LỌT MÀN HÌNH. Vị trí thẻ tính theo chiều cao THẬT (onLayout) rồi kẹp
//     trong vùng an toàn → nút không bị che/khuất trên máy nhỏ hoặc màn cao.

import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const SCRIM = 'rgba(6, 20, 10, 0.86)';      // tối đậm, ám xanh brand
const RING = '#FFD34E';                      // viền spotlight: hổ phách, nổi rõ trên nền tối
const RING_GLOW = 'rgba(255, 211, 78, 0.30)';// quầng sáng ngoài
const BRAND = '#285B23';
const PAD = 6;                               // đệm quanh ô spotlight (nhỏ → ôm sát target)
const MASCOT = 72;                           // cỡ linh vật
const MASCOT_OVERLAP = 18;                   // linh vật đè lên mép thẻ
const GAP = 16;                              // khoảng cách thẻ ↔ vùng spotlight
const READ_SECONDS = 3;                      // khoá nút "Tiếp" cho người dùng kịp đọc

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// Bốn góc của lỗ khoét + bề dày viền dùng để cắt "múi" bo góc.
const CORNERS = [
  { key: 'tl', right: false, bottom: false },
  { key: 'tr', right: true, bottom: false },
  { key: 'bl', right: false, bottom: true },
  { key: 'br', right: true, bottom: true },
] as const;
const CB = (radius: number) => radius + 8;

type Point = { x: number; y: number };

export default function CoachMarkOverlay() {
  const { active, stepIndex, steps, next, skip, measure } = useCoachMark();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const step = active ? steps[stepIndex] : null;

  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(260);       // chiều cao thật của khối linh vật + thẻ
  const [remain, setRemain] = useState(READ_SECONDS);
  const hostRef = useRef<View | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // Đo gốc toạ độ của chính overlay (để quy đổi toạ độ cửa sổ → toạ độ overlay).
  const measureHost = useCallback(
    (): Promise<Point> =>
      new Promise((resolve) => {
        const node = hostRef.current as any;
        if (!node || typeof node.measureInWindow !== 'function') {
          resolve({ x: 0, y: 0 });
          return;
        }
        let done = false;
        const timer = setTimeout(() => {
          if (!done) {
            done = true;
            resolve({ x: 0, y: 0 });
          }
        }, 250);
        node.measureInWindow((x: number, y: number) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({ x: x || 0, y: y || 0 });
        });
      }),
    [],
  );

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
    if (!active || !step || step.targetId == null) {
      setRect(null);
      return;
    }
    let cancelled = false;
    let tries = 0;
    const tryMeasure = async () => {
      if (cancelled) return;
      const r = await measure(step.targetId as any);
      const origin = await measureHost();
      if (cancelled) return;
      // Quy về toạ độ overlay rồi kiểm tra có THỰC SỰ nằm trong màn hình không:
      // target của màn đang ẩn (tab khác) hoặc header đang thu sẽ cho ô lệch/âm →
      // bỏ qua, coi như bước không có target (thẻ hiện giữa màn) thay vì khoanh sai.
      const local = r
        ? { x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height }
        : null;
      const onScreen =
        !!local &&
        local.width >= 8 &&
        local.height >= 8 &&
        local.y + local.height > 8 &&
        local.y < SCREEN_H - 8 &&
        local.x + local.width > 0 &&
        local.x < SCREEN_W;
      if (onScreen) {
        setRect(local);
      } else if (tries++ < 8) {
        setTimeout(tryMeasure, 80);
      } else {
        setRect(null);
      }
    };
    setRect(null);
    tryMeasure();
    return () => {
      cancelled = true;
    };
  }, [active, step, stepIndex, measure, measureHost, SCREEN_H, SCREEN_W]);

  // Khoá nút "Tiếp" READ_SECONDS giây mỗi bước để người dùng kịp đọc.
  useEffect(() => {
    if (!active) return;
    setRemain(READ_SECONDS);
    let n = READ_SECONDS;
    const id = setInterval(() => {
      n -= 1;
      setRemain(n);
      if (n <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [active, stepIndex]);

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
  const locked = remain > 0;

  // Ô spotlight (đã cộng đệm), kẹp trong màn hình. Làm TRÒN về số nguyên để 4 dải
  // tối và các múi góc khớp nhau, không để lộ đường kẻ mảnh do lệch nửa pixel.
  const hole = rect
    ? (() => {
        const x = Math.round(Math.max(0, rect.x - PAD));
        const y = Math.round(Math.max(0, rect.y - PAD));
        return {
          x,
          y,
          w: Math.round(Math.min(rect.width + PAD * 2, SCREEN_W - x)),
          h: Math.round(rect.height + PAD * 2),
        };
      })()
    : null;

  // Bo góc ô: không vượt quá nửa cạnh ngắn (nút tròn → radius 999 tự thành hình
  // tròn). Kẹp cũng để RN khỏi tự co bo góc của lớp khoét lỗ bên dưới.
  const radius = hole
    ? Math.min(step.radius ?? 16, Math.floor(Math.min(hole.w, hole.h) / 2))
    : 0;

  // ── Vị trí thẻ: ưu tiên phía còn nhiều chỗ, luôn kẹp trong vùng an toàn ──
  const totalH = cardH; // cardWrap đã gồm linh vật + thẻ
  const minTop = insets.top + 52;                       // chừa chỗ nút ✕ nổi
  const maxTop = Math.max(minTop, SCREEN_H - insets.bottom - 12 - totalH);
  let cardTop: number;
  if (hole) {
    const below = hole.y + hole.h + GAP;
    const above = hole.y - GAP - totalH;
    const fitsBelow = below + totalH <= SCREEN_H - insets.bottom - 12;
    const fitsAbove = above >= minTop;
    if (fitsBelow) cardTop = below;
    else if (fitsAbove) cardTop = above;
    else cardTop = hole.y + hole.h / 2 < SCREEN_H / 2 ? below : above;
  } else {
    cardTop = (SCREEN_H - totalH) / 2;
  }
  cardTop = clamp(cardTop, minTop, maxTop);

  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: fade }]} pointerEvents="box-none">
      <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.6)" translucent />

      {/* Khung mốc để quy đổi toạ độ cửa sổ → toạ độ overlay (không bắt chạm). */}
      <View ref={hostRef} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFillObject} />

      {/* CHẶN THAO TÁC: nuốt mọi chạm rơi ra ngoài thẻ/nút của luồng hướng dẫn.
          Nằm DƯỚI thẻ nên không cướp cú chạm của nút "Tiếp" / "Tôi đã hiểu rồi!". */}
      <View
        style={StyleSheet.absoluteFillObject}
        onStartShouldSetResponder={() => true}
        onResponderRelease={() => {}}
      />

      {/* ── Lớp tối: 4 dải bao quanh ô + 4 "múi" bo góc ──────────────────────
          Dải chữ nhật đảm bảo LUÔN tối kín (không phụ thuộc tính năng vẽ nào),
          còn 4 múi góc — cắt từ một khung có borderWidth+borderRadius rồi kẹp
          trong ô vuông góc (overflow hidden) — bo tròn 4 góc của lỗ khoét đúng
          bằng bo góc của viền sáng. Các vùng KHÔNG chồng nhau nên không có vệt
          đậm ở mối nối. */}
      {hole ? (
        <>
          <View pointerEvents="none" style={[styles.scrim, { top: 0, left: 0, right: 0, height: hole.y }]} />
          <View
            pointerEvents="none"
            style={[styles.scrim, { top: hole.y + hole.h, left: 0, right: 0, bottom: 0 }]}
          />
          <View
            pointerEvents="none"
            style={[styles.scrim, { top: hole.y, left: 0, width: hole.x, height: hole.h }]}
          />
          <View
            pointerEvents="none"
            style={[styles.scrim, { top: hole.y, left: hole.x + hole.w, right: 0, height: hole.h }]}
          />
          {radius > 0 &&
            CORNERS.map((c) => {
              const cx = hole.x + (c.right ? hole.w - radius : 0);
              const cy = hole.y + (c.bottom ? hole.h - radius : 0);
              return (
                <View
                  key={c.key}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: cx,
                    top: cy,
                    width: radius,
                    height: radius,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      position: 'absolute',
                      left: hole.x - CB(radius) - cx,
                      top: hole.y - CB(radius) - cy,
                      width: hole.w + CB(radius) * 2,
                      height: hole.h + CB(radius) * 2,
                      borderWidth: CB(radius),
                      borderColor: SCRIM,
                      borderRadius: radius + CB(radius),
                      backgroundColor: 'transparent',
                    }}
                  />
                </View>
              );
            })}
          {/* Quầng sáng ngoài */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: hole.x - 5,
              top: hole.y - 5,
              width: hole.w + 10,
              height: hole.h + 10,
              borderRadius: radius + 5,
              borderWidth: 5,
              borderColor: RING_GLOW,
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            }}
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
              borderWidth: 3,
              borderColor: RING,
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            }}
          />
        </>
      ) : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: SCRIM }]} />
      )}

      {/* ── Thẻ nội dung + linh vật ── */}
      <View
        pointerEvents="box-none"
        style={[styles.cardWrap, { top: cardTop }]}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0 && Math.abs(h - cardH) > 1) setCardH(h);
        }}
      >
        <View style={styles.mascotRow}>
          <TalkingBlinkLogo size={MASCOT} />
        </View>

        <View style={styles.card}>
          <Text style={styles.stepCounter}>
            Bước {stepIndex + 1}/{steps.length}
          </Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>

          <View style={styles.btnRow}>
            <TouchableOpacity onPress={skip} style={styles.skipBtn} activeOpacity={0.7} hitSlop={6}>
              <Text style={styles.skipText}>Tôi đã hiểu rồi!</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={next}
              disabled={locked}
              style={[styles.nextBtn, locked && styles.nextBtnOff]}
              activeOpacity={0.85}
              hitSlop={6}
            >
              <Text style={styles.nextText}>
                {locked ? `${isLast ? 'Xong' : 'Tiếp'} (${remain})` : isLast ? 'Xong' : 'Tiếp'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Nút thoát nhanh — biểu tượng gọn, luôn với tới được ở mọi bước/máy. */}
      <TouchableOpacity
        onPress={skip}
        style={[styles.floatingSkip, { top: insets.top + 8 }]}
        activeOpacity={0.7}
        accessibilityLabel="Tôi đã hiểu rồi, đóng hướng dẫn"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.floatingSkipText}>✕</Text>
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
    marginBottom: -MASCOT_OVERLAP,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
  },
  skipBtn: {
    paddingVertical: 10,
    paddingRight: 12,
    flexShrink: 1,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7A69',
    textDecorationLine: 'underline',
  },
  nextBtn: {
    backgroundColor: BRAND,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 12,
    minWidth: 96,
    alignItems: 'center',
  },
  nextBtnOff: {
    backgroundColor: '#9BB098',
  },
  nextText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  floatingSkip: {
    position: 'absolute',
    right: 14,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 17,
  },
  floatingSkipText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
});
