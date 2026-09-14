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

describe('checkDeviceKeyRisk — đo ĐÃ LƯU 24 TỪ, không đo số người bảo hộ', () => {
  it('chưa lưu 24 từ → at-risk, và nói rõ đã đo đại lượng nào', async () => {
    getHealth.mockResolvedValue({ ...OK, seedExported: false, exportedAt: null });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({
      state: 'at-risk', why: 'seed-not-saved',
    });
  });

  it('đã lưu 24 từ → safe, kể cả khi KHÔNG có người bảo hộ nào', async () => {
    getHealth.mockResolvedValue({ ...OK, seedExported: true, guardianCount: 0 });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'safe' });
  });

  // ══ Bài đắt nhất của tệp này ═══════════════════════════════════════════════
  // Đây đúng là ca bản cũ trả SAI: `hasDeviceKey && guardianCount === 0` cho ra
  // `safe` ngay khi có một người bảo hộ, nên lời nhắc TẮT cho người chưa bao giờ
  // thấy 24 từ của mình. Mà đường khôi phục bằng người bảo hộ chưa chạy tới cuối
  // (`screens/GuardianScreen.tsx:181` tự khai với người dùng), nên "an toàn" đó
  // là một lời hứa không có gì đỡ.
  it('ĐÃ ghi danh người bảo hộ NHƯNG chưa lưu 24 từ → VẪN at-risk', async () => {
    getHealth.mockResolvedValue({
      ...OK, seedExported: false, exportedAt: null,
      hasDeviceKey: true, guardianCount: 1,
    });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({
      state: 'at-risk', why: 'seed-not-saved',
    });
  });

  it('ghi danh NHIỀU người bảo hộ vẫn không hạ được mức rủi ro', async () => {
    // Chốt chiều "càng nhiều càng an toàn". Nếu ai đó dựng lại một ngưỡng kiểu
    // `guardianCount >= 2 → safe`, bài này đỏ.
    getHealth.mockResolvedValue({
      ...OK, seedExported: false, exportedAt: null, guardianCount: 5,
    });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({
      state: 'at-risk', why: 'seed-not-saved',
    });
  });

  it('CHƯA bật khoá thiết bị mà chưa lưu 24 từ → vẫn at-risk', async () => {
    // Bản cũ trả `safe` ở đây. Mất máy thì Master_KEK đi theo máy dù có bật khoá
    // thiết bị hay không — `hasDeviceKey` không phải đường khôi phục.
    getHealth.mockResolvedValue({
      ...OK, seedExported: false, exportedAt: null,
      hasDeviceKey: false, guardianCount: 0,
    });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({
      state: 'at-risk', why: 'seed-not-saved',
    });
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

  it('bản máy chủ cũ VẮNG `seedExported` → unknown/server, KHÔNG đọc vắng thành "chưa lưu"', async () => {
    // Vắng trường là "chưa hỏi được". Đọc nó thành `false` là biến một lần
    // không-đo-được thành một khẳng định về người dùng.
    getHealth.mockResolvedValue({
      activeKeyCount: 1, guardianCount: 2, hasDeviceKey: true, requiresDeviceCosign: true,
    });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'unknown', why: 'server' });
  });

  it('`seedExported` không phải boolean → unknown/server', async () => {
    // Máy chủ trả chuỗi `"false"` thì `if (h.seedExported)` đọc ra TRUE — một
    // chuỗi không rỗng là thật trong JS. Chốt kiểu, đừng chốt độ-thật.
    getHealth.mockResolvedValue({ ...OK, seedExported: 'false' });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({ state: 'unknown', why: 'server' });
  });

  it('vắng `guardianCount`/`hasDeviceKey` KHÔNG còn chặn câu trả lời', async () => {
    // Thu hẹp phép kiểm hình dạng là CÓ CHỦ Ý: hai trường đó không đi vào quyết
    // định nữa, nên đòi chúng có mặt là tạo một cớ trả 'unknown' — tức im lặng
    // ở đúng ca đang cần nói.
    getHealth.mockResolvedValue({ seedExported: false, activeKeyCount: 1 });
    await expect(checkDeviceKeyRisk()).resolves.toEqual({
      state: 'at-risk', why: 'seed-not-saved',
    });
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
