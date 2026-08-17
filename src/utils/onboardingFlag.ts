/**
 * Cờ "đã xem màn chào" — hỏi-một-lần, giống `app_lang_v1` của phần ngôn ngữ.
 *
 * ĐỌC HỎNG THÌ COI NHƯ CHƯA XEM, không coi như đã xem. Hai chiều sai khác nhau
 * hẳn: đoán "đã xem" thì người mới cài không bao giờ biết Aladin là gì và không
 * có gì báo cho ai; đoán "chưa xem" thì cùng lắm người cũ thấy lại một màn bỏ
 * qua được, và họ THẤY nó — sai kiểu thấy được thì còn sửa được.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_SEEN_KEY = 'onboarding_seen_v1';

/** Đã xem màn chào chưa. Lỗi đọc → `false` (xem chú thích đầu tệp). */
export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_SEEN_KEY)) === '1';
  } catch (e) {
    console.warn('[onboarding] Không đọc được cờ đã-xem:', e);
    return false;
  }
}

/**
 * Ghi nhận đã xem. Trả về ghi được hay không — chỗ gọi vẫn đi tiếp dù ghi hỏng
 * (không được chặn người dùng ở màn chào vì một lần ghi đĩa thất bại), nhưng
 * phải BIẾT là chưa ghi được thay vì tưởng xong.
 */
export async function markOnboardingSeen(): Promise<boolean> {
  try {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    return true;
  } catch (e) {
    console.warn('[onboarding] Không ghi được cờ đã-xem:', e);
    return false;
  }
}
