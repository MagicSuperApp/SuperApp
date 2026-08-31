// Giả lập `phoenixKey-api` phải mang theo LỚP LỖI THẬT, không chỉ hàm.
//
// Bản đầu chỉ giả lập `identity.getHealth` rồi cho nó ném `{response:{status:401}}`
// — hình dạng lỗi thô của axios. Bài XANH, mà đường đó không ai đi được: mọi lối
// ra của `unwrap` đều ném `PhoenixKeyApiError`, và lớp ấy không có `response`.
// Nên bài kiểm chứng nhận một phép phân biệt đang HỎNG.
//
// Lớp dưới đây giữ đúng chữ ký lớp thật `(code, httpStatus, message)`. Gán trường
// trong thân hàm chứ không dùng tham số-thuộc-tính: babel biến tham số-thuộc-tính
// thành tham chiếu ra ngoài phạm vi và nhà máy `jest.mock` từ chối.
jest.mock('./phoenixKey-api', () => {
  class PhoenixKeyApiError extends Error {
    code: number;
    httpStatus: number;
    constructor(code: number, httpStatus: number, message: string) {
      super(message);
      this.code = code;
      this.httpStatus = httpStatus;
      this.name = 'PhoenixKeyApiError';
    }
  }
  return { PhoenixKeyApiError, identity: { getHealth: jest.fn() } };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { identity, PhoenixKeyApiError } from './phoenixKey-api';
import {
  checkDeviceKeyRisk, isRiskSnoozed, snoozeRisk, resetRiskSnooze,
} from './deviceKeyRisk';

const getHealth = identity.getHealth as jest.Mock;

/** Dựng lỗi ĐÚNG như `unwrap` dựng nó. */
const loi = (code: number, httpStatus: number, msg = 'loi') =>
  new PhoenixKeyApiError(code, httpStatus, msg);

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
    // `AuthRequiredInterceptor.java:164` ném UNAUTHORIZED(1304) + HTTP 401 khi
    // thiếu Bearer; `unwrap` gói lại thành PhoenixKeyApiError(1304, 401, …).
    getHealth.mockRejectedValue(loi(1304, 401, 'Missing Bearer token'));
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'unknown', why: 'no-session' });
  });

  it('403 → unknown/no-session', async () => {
    getHealth.mockRejectedValue(loi(1304, 403, 'Invalid Bearer token'));
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'unknown', why: 'no-session' });
  });

  it('phong bì báo 1304 trên HTTP 200 vẫn là "chưa có phiên"', async () => {
    // `unwrap` có một lối dựng lỗi với `httpStatus: 200` — khi HTTP là 200 mà
    // phong bì mang `code !== 1000`. Ở lối đó chỉ còn mã nghiệp vụ đứng vững,
    // nên phép đo không được chỉ dựa vào mã HTTP.
    getHealth.mockRejectedValue(loi(1304, 200, 'Unauthorized'));
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'unknown', why: 'no-session' });
  });

  it('500 → unknown/server', async () => {
    getHealth.mockRejectedValue(loi(-1, 500, 'Internal error'));
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'unknown', why: 'server' });
  });

  it('mạng rớt → unknown/server, KHÔNG ném ra ngoài', async () => {
    // `unwrap` dựng `PhoenixKeyApiError(-1, 0, 'Network error')` cho lối này —
    // KHÔNG phải để lọt một `TypeError` trần ra ngoài.
    getHealth.mockRejectedValue(loi(-1, 0, 'Network error'));
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'unknown', why: 'server' });
  });

  it('lỗi lạ không phải PhoenixKeyApiError → unknown/server, vẫn không ném', async () => {
    getHealth.mockRejectedValue(new TypeError('Network request failed'));
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'unknown', why: 'server' });
  });

  it('hình dạng lỗi THÔ của axios KHÔNG còn được đọc thành "chưa có phiên"', async () => {
    // Bài chốt lại chính lỗi đã sửa, theo chiều ngược. `{response:{status:401}}`
    // là thứ `getHealth` KHÔNG BAO GIỜ ném ra. Nếu ai đó khôi phục lại phép đọc
    // `response.status`, bài này đỏ và chỉ đúng vào chỗ sai — thay vì để một
    // phép phân biệt hỏng nằm im dưới một bài xanh.
    getHealth.mockRejectedValue({ response: { status: 401 } });
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
