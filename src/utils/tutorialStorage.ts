// utils/tutorialStorage.ts
//
// Cờ đã-xem luồng hướng dẫn (coach-mark tour) — LƯU THEO TỪNG NGƯỜI DÙNG.
//
// Yêu cầu: sau khi một người đã skip/hoàn thành luồng hướng dẫn thì lần đăng nhập
// sau của CHÍNH người đó sẽ không tự chạy lại nữa. Vì vậy cờ được gắn theo
// `username`. Người dùng khác (tài khoản demo khác) vẫn được xem lần đầu.
//
// Nút "Chạy luồng hướng dẫn" trong Cài đặt sẽ gọi trực tiếp start() nên không
// phụ thuộc cờ này (luôn chạy được theo yêu cầu người dùng).

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@aladin/tutorial_seen_v1:';

const keyFor = (username?: string | null) => `${PREFIX}${username ?? '_anon'}`;

/**
 * Có nên TỰ ĐỘNG chạy luồng hướng dẫn cho user này không (chưa từng xem).
 * Mặc định true khi lỗi đọc / cài mới để người mới luôn được hướng dẫn.
 */
export async function shouldAutoRunTutorial(username?: string | null): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(keyFor(username));
    return val !== 'true';
  } catch {
    return true;
  }
}

/** Đánh dấu đã xem (gọi khi Skip hoặc chạy hết luồng). */
export async function markTutorialSeen(username?: string | null): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(username), 'true');
  } catch {
    // im lặng: không xem được cờ thì lần sau cùng lắm chạy lại — không nghiêm trọng.
  }
}

/** Xoá cờ (dev/QA) để luồng tự chạy lại lần sau. */
export async function resetTutorial(username?: string | null): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(username));
  } catch {
    // bỏ qua
  }
}
