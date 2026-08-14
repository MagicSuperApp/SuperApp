import { Vibration } from 'react-native';

import { buzz, stopBuzz } from './haptics';

describe('haptics — rung hỏng thì im lặng, không sập màn', () => {
  afterEach(() => jest.restoreAllMocks());

  it('máy rung được → gửi đúng mẫu xuống hệ điều hành', () => {
    const spy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    expect(buzz([0, 90, 80, 90])).toBe(true);
    expect(spy).toHaveBeenCalledWith([0, 90, 80, 90]);
  });

  it('THIẾU QUYỀN VIBRATE → nuốt lỗi, KHÔNG ném lên màn', () => {
    jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {
      throw new Error('Requires VIBRATE permission');
    });
    // Đây chính là lỗi đã làm sập màn Dẫn đường đúng lúc người dùng tới nơi.
    expect(() => buzz(200)).not.toThrow();
    expect(buzz(200)).toBe(false);
  });

  it('máy không có mô-tơ rung → cũng chỉ trả false', () => {
    jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {
      throw new Error('no vibrator');
    });
    expect(buzz(50)).toBe(false);
  });

  it('dừng rung hỏng cũng không ném', () => {
    jest.spyOn(Vibration, 'cancel').mockImplementation(() => {
      throw new Error('nope');
    });
    expect(() => stopBuzz()).not.toThrow();
  });
});
