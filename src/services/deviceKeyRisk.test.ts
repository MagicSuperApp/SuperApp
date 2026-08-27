jest.mock('./phoenixKey-api', () => ({ identity: { getHealth: jest.fn() } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { identity } from './phoenixKey-api';
import {
  checkDeviceKeyRisk, isRiskSnoozed, snoozeRisk, resetRiskSnooze,
} from './deviceKeyRisk';

const getHealth = identity.getHealth as jest.Mock;

const OK = {
  seedExported: true, exportedAt: '2026-08-01T00:00:00Z',
  activeKeyCount: 1, guardianCount: 2, hasDeviceKey: true, requiresDeviceCosign: true,
};

beforeEach(() => { jest.clearAllMocks(); (AsyncStorage as any).clear?.(); });

describe('checkDeviceKeyRisk — BA trạng thái, không phải hai', () => {
  it('đã bật khoá thiết bị + 0 người khôi phục → at-risk', async () => {
    getHealth.mockResolvedValue({ ...OK, hasDeviceKey: true, guardianCount: 0 });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'at-risk' });
  });

  it('đã bật khoá thiết bị + có người khôi phục → safe', async () => {
    getHealth.mockResolvedValue({ ...OK, hasDeviceKey: true, guardianCount: 1 });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'safe' });
  });

  it('CHƯA bật khoá thiết bị → safe, dù 0 người khôi phục', async () => {
    // Không có khoá thiết bị thì không có đường đóng băng nào để mà lo. Doạ họ ở
    // đây là dạy người dùng bỏ qua cảnh báo.
    getHealth.mockResolvedValue({ ...OK, hasDeviceKey: false, guardianCount: 0 });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'safe' });
  });

  // Ba bài dưới đây là phần đắt nhất: "chưa hỏi được" KHÔNG được rơi vào một
  // trong hai đầu kia.
  it('401 → unknown/no-session, KHÔNG phải at-risk và KHÔNG phải safe', async () => {
    getHealth.mockRejectedValue({ response: { status: 401 } });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'unknown', why: 'no-session' });
  });

  it('500 → unknown/server', async () => {
    getHealth.mockRejectedValue({ response: { status: 500 } });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'unknown', why: 'server' });
  });

  it('mạng ném (không có status) → unknown/server, KHÔNG ném ra ngoài', async () => {
    getHealth.mockRejectedValue(new TypeError('Network request failed'));
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'unknown', why: 'server' });
  });

  it('bản máy chủ cũ VẮNG trường → unknown/server, KHÔNG đọc vắng thành "bằng không"', async () => {
    getHealth.mockResolvedValue({ seedExported: true, activeKeyCount: 1 });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'unknown', why: 'server' });
  });
});

describe('tạm ẩn — im 7 ngày rồi nói lại', () => {
  const T0 = 1_800_000_000_000;

  it('chưa ẩn thì không ẩn', async () => {
    await expect(isRiskSnoozed(T0)).resolves.toBe(false);
  });

  it('ẩn rồi thì im trong 7 ngày, sang ngày thứ 8 nói lại', async () => {
    await snoozeRisk(T0);
    await expect(isRiskSnoozed(T0 + 6 * 86_400_000)).resolves.toBe(true);
    await expect(isRiskSnoozed(T0 + 8 * 86_400_000)).resolves.toBe(false);
  });

  it('xoá mốc ẩn thì nói lại ngay — dùng khi đổi tài khoản', async () => {
    await snoozeRisk(T0);
    await resetRiskSnooze();
    await expect(isRiskSnoozed(T0)).resolves.toBe(false);
  });

  it('giá trị rác trong kho → coi như CHƯA ẩn', async () => {
    await AsyncStorage.setItem('device_key_risk_snoozed_until', 'khong-phai-so');
    await expect(isRiskSnoozed(T0)).resolves.toBe(false);
  });
});
