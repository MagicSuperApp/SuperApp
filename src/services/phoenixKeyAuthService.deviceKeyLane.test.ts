/**
 * Cổng cho lối "tìm lại danh tính bằng khoá trong chip" — phân làn và dòng số đo.
 *
 * Vì sao có tệp này: trước bản này MỌI lỗi của tầng chip rơi xuống làn `unknown`, và câu
 * của làn đó bảo người dùng "thử lại một lần" rồi "chụp màn hình gửi hỗ trợ". Với nhóm bị
 * khoá vô hiệu hoá thì lời khuyên đầu SAI (bấm bao nhiêu lần cũng thế) và lời khuyên sau
 * RỖNG (màn hình không mang dữ kiện nào). Hai bộ bài dưới đây ghim đúng hai chỗ đó.
 *
 * Cả hai hàm được kiểm đều THUẦN — không chip, không mạng — nên không ca nào cần dựng màn.
 */

import {
  classifyDeviceKeyLookupFailure,
  describeDeviceKeyLookupError,
  DEVICE_KEY_LOOKUP_MESSAGE,
} from './phoenixKeyAuthService';
import { PhoenixKeyApiError } from './phoenixKey-api';
import { PhoenixKeyNativeError } from './phoenixKey-native';

const nativeErr = (code: string, message = 'boom') => Object.assign(new Error(message), { code });

describe('classifyDeviceKeyLookupFailure — chip từ chối dùng khoá', () => {
  // Bốn mã này đều nghĩa là "khoá CÒN đó, chip không cho dùng". Chúng phải rời khỏi làn
  // `unknown`, vì `unknown` mời người dùng thử lại còn nhóm này thử lại là vô ích.
  it.each([
    PhoenixKeyNativeError.KEY_INVALIDATED,
    PhoenixKeyNativeError.SIGN_AFTER_AUTH,
    PhoenixKeyNativeError.NO_KEY,
    PhoenixKeyNativeError.KEYSTORE,
  ])('%s → key_unusable', code => {
    expect(classifyDeviceKeyLookupFailure(nativeErr(code))).toBe('key_unusable');
  });

  // Kho khoá chưa mở là ca DUY NHẤT trong họ này mà thử lại có ích — nên nó KHÔNG được
  // gộp vào `key_unusable`. Ca này là ca đối chứng của bộ trên: cùng tầng, ngược kết luận.
  it('E_KEY_LOCKED → biometric_not_done (thử lại có ích, không được gộp lên)', () => {
    expect(classifyDeviceKeyLookupFailure(nativeErr(PhoenixKeyNativeError.KEY_LOCKED))).toBe(
      'biometric_not_done',
    );
  });

  // ── ĐỐI CHỨNG: ba làn cũ phải giữ nguyên kết luận sau khi chèn họ mã mới vào trước ──
  // Không có ba ca này thì bộ trên chỉ chứng minh "mã mới đi đâu đó", không chứng minh
  // rằng nó không cướp mất đường của mã cũ.
  it('huỷ sinh trắc vẫn là biometric_not_done', () => {
    expect(classifyDeviceKeyLookupFailure(nativeErr(PhoenixKeyNativeError.USER_CANCELED))).toBe(
      'biometric_not_done',
    );
  });

  it('404 vẫn là key_not_linked', () => {
    expect(
      classifyDeviceKeyLookupFailure(new PhoenixKeyApiError(1404, 404, 'not found')),
    ).toBe('key_not_linked');
  });

  it('lời gọi không tới được máy chủ vẫn là network_down', () => {
    expect(classifyDeviceKeyLookupFailure(new PhoenixKeyApiError(-1, 0, 'Network Error'))).toBe(
      'network_down',
    );
  });

  it('mã HTTP chưa có tên vẫn rơi về unknown — làn này phải còn tồn tại', () => {
    expect(classifyDeviceKeyLookupFailure(new PhoenixKeyApiError(9800, 400, 'bad body'))).toBe(
      'unknown',
    );
  });
});

describe('DEVICE_KEY_LOOKUP_MESSAGE — câu của làn mới', () => {
  it('câu key_unusable nói THỬ LẠI LÀ VÔ ÍCH và chỉ đúng lối ra là 24 từ', () => {
    const s = DEVICE_KEY_LOOKUP_MESSAGE.key_unusable;
    expect(s).toMatch(/bấm lại bao nhiêu lần cũng/i);
    expect(s).toMatch(/24 từ/);
    // Và nó phải nêu NGUYÊN NHÂN hay gặp nhất, không thì người dùng không hiểu vì sao một
    // cái khoá "vẫn nằm trong máy" lại không dùng được.
    expect(s).toMatch(/vân tay|khuôn mặt/i);
  });
});

describe('describeDeviceKeyLookupError — ảnh chụp màn hình phải mang số đo', () => {
  it('lỗi máy chủ: mang cả mã HTTP lẫn mã nghiệp vụ lẫn câu của máy chủ', () => {
    const ref = describeDeviceKeyLookupError(
      new PhoenixKeyApiError(9800, 400, 'publicKeyHex: public_key_hex required'),
    );
    expect(ref).toContain('HTTP 400');
    expect(ref).toContain('mã 9800');
    expect(ref).toContain('public_key_hex required');
  });

  it('lời gọi chết: nói "HTTP none", không in số 0 (0 đọc nhầm thành một mã thật)', () => {
    const ref = describeDeviceKeyLookupError(new PhoenixKeyApiError(-1, 0, 'Network Error'));
    expect(ref).toContain('HTTP none');
    expect(ref).not.toContain('HTTP 0');
  });

  it('lỗi native: mang mã E_… ra mặt trước', () => {
    const ref = describeDeviceKeyLookupError(
      nativeErr(PhoenixKeyNativeError.KEY_INVALIDATED, 'Key exists but cannot be used (status=-25293)'),
    );
    expect(ref).toContain('E_KEY_INVALIDATED');
    expect(ref).toContain('-25293');
  });

  it('lỗi không có mã thì NÓI RA là không có, không im lặng bỏ trống', () => {
    expect(describeDeviceKeyLookupError(new Error('lạ'))).toContain('không có mã');
  });

  // ── Ba ca RÒ. Dòng này đi ra màn hình rồi đi vào ảnh chụp người dùng gửi cho người lạ. ──
  it('cắt hex dài — khoá công khai, chữ ký, nonce không được đi ra', () => {
    const pub = 'a'.repeat(130);
    const ref = describeDeviceKeyLookupError(new Error(`sign failed for ${pub}`));
    expect(ref).not.toContain(pub);
    expect(ref).not.toMatch(/[0-9a-f]{16,}/i);
  });

  it('cắt đường dẫn — bố cục máy không được đi ra', () => {
    const ref = describeDeviceKeyLookupError(
      new Error('open /Users/nguoidung/Library/Keychains/db failed'),
    );
    expect(ref).not.toContain('/Users/');
    expect(ref).not.toContain('Keychains');
  });

  it('chặn trần độ dài — một traceback dài không được tràn cả hộp thoại', () => {
    const ref = describeDeviceKeyLookupError(new Error('x'.repeat(5000)));
    expect(ref.length).toBeLessThan(160);
  });

  // ĐỐI CHỨNG cho ba ca trên: bộ lọc không được cắt mất phần CÓ ÍCH. Không có ca này thì
  // một bộ lọc trả về chuỗi rỗng cũng đi qua cả ba bài trên.
  it('câu bình thường của máy chủ thì GIỮ NGUYÊN — lọc không được nuốt phần đọc được', () => {
    const ref = describeDeviceKeyLookupError(
      new PhoenixKeyApiError(1403, 403, 'signature does not match registered key'),
    );
    expect(ref).toContain('signature does not match registered key');
  });
});
