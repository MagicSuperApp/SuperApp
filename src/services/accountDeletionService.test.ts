// Canh ĐƯỜNG XOÁ TÀI KHOẢN — hai điều, cả hai đều từng sai và không nhìn thấy bằng mắt.
//
// 1. Khoá chủ trong chip PHẢI bị xoá. Không xoá thì lần đăng ký sau `isKeypairEnrolled()`
//    vẫn TRUE trong khi DID đã mất ⇒ app rơi vào đường khôi phục và người dùng kẹt ở câu
//    "máy đã có khoá nhưng chưa khôi phục được danh tính".
// 2. Phải xoá TRƯỚC `AsyncStorage.clear()`. Kho bị xoá trước thì con trỏ alias mất, khoá đã
//    xoay (`_v2`…) thành mồ côi — không ai xoá được nữa, kể cả lần cài lại.
//
// Thứ tự là thứ review mắt thường trượt, nên phải khoá bằng test.

const order: string[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    clear: jest.fn(async () => { order.push('asyncStorage.clear'); }),
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('../sdk/phoenixKey', () => ({
  wipeIdentity: jest.fn(async () => { order.push('wipeIdentity'); }),
}));

jest.mock('./masterKekStore', () => ({
  clearMasterKek: jest.fn(async () => { order.push('clearMasterKek'); }),
}));

jest.mock('./orilifeDidAuth', () => ({
  clearOrilifeToken: jest.fn(async () => { order.push('clearOrilifeToken'); }),
}));

jest.mock('./remoteLogger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { wipeLocalIdentity } from './accountDeletionService';
import { wipeIdentity } from '../sdk/phoenixKey';

describe('xoá tài khoản — dọn phía thiết bị', () => {
  beforeEach(() => { order.length = 0; jest.clearAllMocks(); });

  it('xoá khoá chủ trong chip, không chỉ xoá kho cục bộ', async () => {
    await wipeLocalIdentity();
    expect(wipeIdentity).toHaveBeenCalledTimes(1);
  });

  it('xoá khoá chip TRƯỚC khi xoá AsyncStorage — sau đó thì mất con trỏ alias', async () => {
    await wipeLocalIdentity();
    expect(order.indexOf('wipeIdentity')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('wipeIdentity')).toBeLessThan(order.indexOf('asyncStorage.clear'));
  });

  it('một bước hỏng KHÔNG chặn các bước sau — phải cố dọn được nhiều nhất có thể', async () => {
    (wipeIdentity as jest.Mock).mockRejectedValueOnce(new Error('keystore từ chối'));
    await expect(wipeLocalIdentity()).resolves.toBeUndefined();
    expect(order).toContain('clearMasterKek');
    expect(order).toContain('asyncStorage.clear');
  });
});
