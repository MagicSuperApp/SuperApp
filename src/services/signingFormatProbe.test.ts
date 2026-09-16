// services/signingFormatProbe.test.ts
//
// BỘ NHỚ KHUÔN CHUỖI KÝ — canh ba thứ, và thứ thứ hai mới là thứ dễ mất nhất.
//
//   1. khuôn đang chạy đi TRƯỚC khi chưa biết gì (một lượt dò không được làm xấu
//      hơn hiện trạng);
//   2. nhớ rồi VẪN trả đủ hai khuôn — máy chủ đổi khuôn sau ngày app nhớ thì dòng
//      đã nhớ thành một lời khai sai, và lời khai sai được ưu tiên thì tệ hơn là
//      không nhớ gì;
//   3. nhớ theo TỪNG CỬA — suy khuôn cửa này ra cửa khác là đúng cái sai mà tệp
//      `signingFormatProbe.ts` dựng để tránh.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAcceptedFormat,
  rememberAcceptedFormat,
  forgetAcceptedFormat,
  formatsToTry,
  isSignatureRejection,
} from './signingFormatProbe';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('thứ tự thử khuôn', () => {
  it('chưa biết gì ⟹ khuôn ĐANG CHẠY đi trước', () => {
    expect(formatsToTry(null)[0]).toBe('legacy-colon');
  });

  it('đã biết máy chủ nhận khuôn đóng khung ⟹ nó đi trước', () => {
    expect(formatsToTry('length-framed')[0]).toBe('length-framed');
  });

  it('LUÔN trả đủ HAI khuôn, dù đã nhớ được cái nào', () => {
    // Đây là bài canh cái chết lặng lẽ: máy chủ đổi khuôn sau ngày app nhớ. Nếu
    // hàm này trả về một khuôn, lượt sau sẽ chết mà không thử nổi khuôn còn lại.
    for (const remembered of [null, 'legacy-colon', 'length-framed'] as const) {
      const order = formatsToTry(remembered);
      expect(order).toHaveLength(2);
      expect(new Set(order)).toEqual(new Set(['legacy-colon', 'length-framed']));
    }
  });

  it('trả mảng MỚI mỗi lần — người gọi sắp lại không đụng hằng dùng chung', () => {
    const a = formatsToTry(null);
    a.reverse();
    expect(formatsToTry(null)[0]).toBe('legacy-colon');
  });
});

describe('dòng nhớ theo từng cửa', () => {
  it('chưa đo lần nào ⟹ null', async () => {
    expect(await getAcceptedFormat('walletStandardRegister')).toBeNull();
  });

  it('ghi rồi đọc lại đúng cái đã ghi', async () => {
    await rememberAcceptedFormat('walletStandardRegister', 'length-framed');
    expect(await getAcceptedFormat('walletStandardRegister')).toBe('length-framed');
  });

  it('nhớ ở cửa này KHÔNG lan sang cửa khác', async () => {
    await rememberAcceptedFormat('walletStandardRegister', 'length-framed');
    expect(await getAcceptedFormat('identityRecover')).toBeNull();
    expect(await getAcceptedFormat('orgMint')).toBeNull();
  });

  it('bỏ dòng nhớ ⟹ về lại "chưa biết", không về một khuôn mặc định nào', async () => {
    await rememberAcceptedFormat('identityRecover', 'length-framed');
    await forgetAcceptedFormat('identityRecover');
    expect(await getAcceptedFormat('identityRecover')).toBeNull();
  });

  it('giá trị LẠ trong ô nhớ đọc thành "chưa biết", không thành khuôn thứ ba', async () => {
    // Bản cũ ghi tên khác, hoặc ai sửa tay. Đọc bừa ra một khuôn không ai dựng được
    // thì lượt ký sau đi vào một nhánh không tồn tại.
    await AsyncStorage.setItem('signing_format_accepted_orgMint', 'khuon-la');
    expect(await getAcceptedFormat('orgMint')).toBeNull();
  });
});

describe('khi nào một lần từ chối là do KHUÔN', () => {
  it('403 kèm 1326 ⟹ đúng, đổi khuôn có thể cứu được', () => {
    expect(isSignatureRejection(403, 1326)).toBe(true);
  });

  it('401 thiếu thẻ phiên, 409 đã có ví, 5xx, mất mạng ⟹ KHÔNG đổi khuôn', () => {
    // Hẹp là có chủ ý: thử khuôn thứ hai ở những ca này chỉ tốn thêm một lượt gọi
    // mà không trả lời được câu nào.
    expect(isSignatureRejection(401, 1326)).toBe(false);
    expect(isSignatureRejection(409, 3005)).toBe(false);
    expect(isSignatureRejection(500, 1326)).toBe(false);
    expect(isSignatureRejection(0, -1)).toBe(false);
    expect(isSignatureRejection(403, 9800)).toBe(false);
  });
});
