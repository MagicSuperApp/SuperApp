/**
 * Bài kiểm cờ "đã xem màn chào".
 *
 * Thứ cần canh nhất: CHIỀU của lỗi. Đọc hỏng phải ra "chưa xem"; nếu ra "đã xem"
 * thì người mới cài mất luôn màn giải thích và không có gì báo cho ai biết.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasSeenOnboarding, markOnboardingSeen, ONBOARDING_SEEN_KEY } from './onboardingFlag';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const store = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('hasSeenOnboarding', () => {
  it('chưa có gì trong máy → chưa xem', async () => {
    store.getItem.mockResolvedValue(null);
    await expect(hasSeenOnboarding()).resolves.toBe(false);
    expect(store.getItem).toHaveBeenCalledWith(ONBOARDING_SEEN_KEY);
  });

  it('có cờ → đã xem', async () => {
    store.getItem.mockResolvedValue('1');
    await expect(hasSeenOnboarding()).resolves.toBe(true);
  });

  it('giá trị lạ KHÔNG được tính là đã xem', async () => {
    store.getItem.mockResolvedValue('true');
    await expect(hasSeenOnboarding()).resolves.toBe(false);
  });

  it('đọc hỏng → chưa xem, KHÔNG ném lên chỗ gọi', async () => {
    store.getItem.mockRejectedValue(new Error('đĩa hỏng'));
    await expect(hasSeenOnboarding()).resolves.toBe(false);
  });
});

describe('markOnboardingSeen', () => {
  it('ghi được → true', async () => {
    store.setItem.mockResolvedValue(undefined);
    await expect(markOnboardingSeen()).resolves.toBe(true);
    expect(store.setItem).toHaveBeenCalledWith(ONBOARDING_SEEN_KEY, '1');
  });

  it('ghi hỏng → false chứ không ném, để màn chào vẫn đi tiếp được', async () => {
    store.setItem.mockRejectedValue(new Error('hết chỗ'));
    await expect(markOnboardingSeen()).resolves.toBe(false);
  });
});
