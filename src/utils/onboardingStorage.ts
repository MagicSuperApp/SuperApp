// Build 52 (2026-05-17) — Onboarding flag storage.
//
// First-time users see 3-step wizard (Tạo farm → Thêm cây → Chụp 3D)
// once. After completion (or skip) we set the flag so future launches
// go straight to Main.
//
// Key versioning: bump suffix (v1 → v2) when wizard content changes
// significantly so existing users see the new flow.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@aladin/onboarding_completed_v2_build52';

/**
 * Returns true if onboarding wizard should be shown (i.e. user has not
 * completed it yet). Defaults to true on storage read errors so that
 * a new install / cleared storage falls back to showing the wizard.
 */
export async function shouldShowOnboarding(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(KEY);
    return val !== 'true';
  } catch {
    return true; // Default show on error
  }
}

/**
 * Mark wizard as completed. Called when user finishes the last step
 * OR taps "Bỏ qua" — both count as completion.
 */
export async function markOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(KEY, 'true');
}

/**
 * Dev / QA helper — wipe the flag so the wizard shows again on next launch.
 * Not wired to UI in Build 52, callable from a debug screen later.
 */
export async function resetOnboardingForDev(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
