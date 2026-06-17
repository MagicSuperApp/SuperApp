// Build 51 (2026-05-17) — Auto-adapt UX theo system accessibility settings.
//
// 3 settings detected:
// 1. Reduce Motion (iOS Settings → Accessibility → Motion → Reduce Motion)
//    — User dễ chóng mặt khi xem animation. App should skip/shorten transitions.
// 2. Color Scheme (light/dark) — Follow system Appearance setting.
// 3. Font Scale (iOS Dynamic Type / Android Font Size) — Honor user's chosen size.
//
// Usage in components:
//   const a11y = useSystemAccessibility();
//   const duration = a11y.reduceMotion ? 0 : 300;
//   const fontSize = 16 * a11y.fontScale; // auto-scale up if user wants bigger
//
// Build 52 sẽ thêm:
// - Brightness-reactive theme (UIScreen.brightnessDidChangeNotification)
// - Camera EV-based theme (outdoor sun vs indoor)

import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Appearance,
  PixelRatio,
  ColorSchemeName,
} from 'react-native';

export interface SystemAccessibilityState {
  /**
   * User enabled "Reduce Motion" accessibility setting.
   * App nên skip/shorten transitions, fade thay vì slide/zoom.
   */
  reduceMotion: boolean;

  /**
   * System color scheme — 'light', 'dark', hoặc null.
   * Build 51 follow system (RN useColorScheme behavior).
   */
  colorScheme: ColorSchemeName;

  /**
   * Font scale từ system Dynamic Type / Font Size setting.
   * Typical range: 0.85 (xsmall) - 3.0 (accessibility extra large).
   * Default 1.0. Multiply base font sizes by this factor.
   */
  fontScale: number;
}

export function useSystemAccessibility(): SystemAccessibilityState {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [colorScheme, setColorScheme] = useState<ColorSchemeName>(
    () => Appearance.getColorScheme() ?? 'light',
  );
  const [fontScale, setFontScale] = useState<number>(PixelRatio.getFontScale());

  useEffect(() => {
    // Reduce Motion subscription
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const motionSub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => setReduceMotion(enabled),
    );

    // Color scheme subscription
    const appearanceSub = Appearance.addChangeListener(({ colorScheme: cs }) => {
      setColorScheme(cs);
    });

    // Font scale changes only fire on iOS via NativeEventEmitter Native bridge;
    // for build 51 we read once on mount + on app foreground (TODO build 52).

    return () => {
      mounted = false;
      motionSub?.remove?.();
      appearanceSub.remove();
    };
  }, []);

  return { reduceMotion, colorScheme, fontScale };
}

/**
 * Helper: scale a base font size by user's preferred font scale.
 * Cap at 1.5x to avoid layout breakage on small screens; nông dân U50
 * thường set 1.2-1.4x là đủ to.
 */
export function scaledFontSize(baseSize: number, scale: number): number {
  const cap = Math.min(scale, 1.5);
  return Math.round(baseSize * cap);
}

/**
 * Helper: animation duration adjusted for reduce-motion.
 * Returns 0 if user enables Reduce Motion → caller should use fade fallback
 * instead of slide/zoom animations.
 */
export function adjustedDuration(baseDuration: number, reduceMotion: boolean): number {
  return reduceMotion ? 0 : baseDuration;
}
