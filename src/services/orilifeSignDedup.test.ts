// services/orilifeSignDedup.test.ts
//
// MỘT LƯỢT KÝ CHO MỘT LOẠT LỜI GỌI — không phải một hộp Face ID cho mỗi lời gọi.
//
// ⛔ Lỗi đội thực địa báo trên iOS (module Truy xuất), đây là bài kiểm dựng RA TỪ nó:
//   chuyển màn trong module là máy hỏi khuôn mặt thêm một lần nữa — màn thứ nhất 1
//   lần, màn thứ hai 2 lần, màn thứ ba 3 lần, quay về màn cũ 4 lần, cứ thế tăng dần.
//
//   Nguồn KHÔNG nằm ở màn nào: `ensureOrilifeToken` là hàm `ensure*` duy nhất trong
//   kho không có lớp gộp, trong khi 15 chỗ gọi nó — 5 dịch vụ ReID, dòng thời gian,
//   chia sẻ quyền, trôi mẫu, kế hoạch chụp, truy xuất, hàng đợi video, `farmSlice`.
//   Mở một màn là bắn một loạt lời gọi đó SONG SONG; các màn trong `Stack.Navigator`
//   phẳng thì không bị tháo khi đẩy màn mới, nên mỗi màn mở thêm là thêm một đợt nạp
//   nữa ⇒ số lời gọi song song tăng đúng 1 sau mỗi lần chuyển màn.
//
// Hai ca, vì lớp gộp có hai nửa và mỗi nửa hỏng một kiểu:
//   1. GỘP    — nhiều lời gọi cùng lúc ⇒ ĐÚNG MỘT lần ký (lỗi ngoài đồng ở trên);
//   2. NHẢ    — gộp xong phải nhả khoá, nếu không thì lượt 401 sau đó không ký lại
//               được và app kẹt vĩnh viễn ở phiên hết hạn — đúng thứ tệ hơn cái vừa sửa.

import AsyncStorage from '@react-native-async-storage/async-storage';

// Tiền tố `mock` là BẮT BUỘC: babel-jest chỉ cho nhà máy `jest.mock` đọc biến
// ngoài phạm vi khi tên bắt đầu bằng `mock` (nhà máy chạy trước khi module được nạp).
const mockDidA = 'did:phoenix:1:' + 'a'.repeat(64);
const mockSignRaw = jest.fn(async () => '3045');

jest.mock('../sdk/phoenixKey', () => ({
  currentUserDid: jest.fn(async () => mockDidA),
  ownerPublicKey: jest.fn(async () => '04' + '11'.repeat(64)),
  // Bọc trong hàm, KHÔNG truyền thẳng `mockSignRaw`: nhà máy chạy lúc module được
  // nạp, tức TRƯỚC khi `const mockSignRaw` kịp gán ⇒ truyền thẳng là truyền `undefined`
  // và cả bài kiểm đỏ vì "signRaw is not a function", không phải vì thứ nó canh.
  signRaw: (...args: unknown[]) => (mockSignRaw as any)(...args),
  isKeypairEnrolled: jest.fn(async () => true),
}));
jest.mock('./phoenixKey-native', () => ({ isAvailable: () => true }));
jest.mock('./remoteLogger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { ensureOrilifeToken } from './orilifeDidAuth';
import { resetOrilifeAuthHeaderCache } from './orilifeAuthHeader';

const BASE = 'https://api.orilife.test';

/**
 * Máy chủ chậm CÓ CHỦ Ý. Lớp gộp chỉ có nghĩa khi các lời gọi thật sự chồng lên
 * nhau; máy chủ trả lời tức thì thì lượt thứ hai tới lúc lượt đầu đã xong và bài
 * kiểm xanh kể cả khi không có khoá nào — tức nó không canh được gì.
 */
const mayChuCham = jest.fn(async (url: string) => {
  await new Promise(r => setTimeout(r, 20));
  if (String(url).includes('/challenge')) {
    return { ok: true, json: async () => ({ ok: true, challenge: 'Y2g', ttl: 300 }) } as any;
  }
  return {
    ok: true,
    json: async () => ({ ok: true, token: 'tok-moi', owner: 'acct:x', username: 'x' }),
  } as any;
});

beforeEach(async () => {
  await AsyncStorage.clear();
  resetOrilifeAuthHeaderCache();
  mockSignRaw.mockClear();
  mayChuCham.mockClear();
  (global as any).fetch = mayChuCham;
});

describe('ensureOrilifeToken gộp lượt ký', () => {
  it('bốn lời gọi SONG SONG ⇒ ĐÚNG MỘT lần ký (không phải bốn hộp Face ID)', async () => {
    const ket = await Promise.all([
      ensureOrilifeToken(BASE),
      ensureOrilifeToken(BASE),
      ensureOrilifeToken(BASE),
      ensureOrilifeToken(BASE),
    ]);

    // Cả bốn phải nhận được câu trả lời — gộp là DÙNG CHUNG kết quả, không phải
    // bỏ rơi ba lời gọi kia. Bỏ rơi thì ba màn kia nạp rỗng mà không báo gì.
    expect(ket).toEqual([true, true, true, true]);
    expect(mockSignRaw).toHaveBeenCalledTimes(1);
  });

  it('lượt 401 sau đó vẫn ký lại được — khoá phải được NHẢ, không giữ luôn', async () => {
    await ensureOrilifeToken(BASE);
    expect(mockSignRaw).toHaveBeenCalledTimes(1);

    // `force` = "thẻ vừa dùng bị máy chủ từ chối". Nó PHẢI ký lại; nếu lớp gộp giữ
    // luôn khoá thì đường tự chữa 401 chết câm và app kẹt ở phiên hết hạn.
    await expect(ensureOrilifeToken(BASE, { force: true })).resolves.toBe(true);
    expect(mockSignRaw).toHaveBeenCalledTimes(2);
  });

  it('token đã có và đúng chủ ⇒ không ký lần nào nữa', async () => {
    await ensureOrilifeToken(BASE);
    mockSignRaw.mockClear();

    await expect(ensureOrilifeToken(BASE)).resolves.toBe(true);
    expect(mockSignRaw).not.toHaveBeenCalled();
  });
});
