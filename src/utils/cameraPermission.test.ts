/**
 * Cổng quyền máy ảnh — kiểm bốn trạng thái, vì mỗi trạng thái dẫn tới một việc
 * KHÁC NHAU mà người dùng phải làm.
 *
 * Ca quan trọng nhất là `denied` trên iOS: đó đúng là ca đội thực địa báo, và là
 * ca mà đường cũ im lặng hoàn toàn.
 */
import { Platform, PermissionsAndroid, TurboModuleRegistry } from 'react-native';
import { checkCameraPermission, ensureCameraPermission } from './cameraPermission';

const PROMPT = {
  title: 't', message: 'm', buttonPositive: 'ok', buttonNegative: 'no',
};

const setPlatform = (os: 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
};

/** Gắn một `RNCameraKitModule` giả với đúng hai hàm thật của nó. */
const mockCameraKit = (mod: unknown) => {
  jest.spyOn(TurboModuleRegistry, 'get').mockImplementation((name: string) =>
    (name === 'RNCameraKitModule' ? (mod as never) : null));
};

afterEach(() => { jest.restoreAllMocks(); });

describe('iOS', () => {
  beforeEach(() => setPlatform('ios'));

  it('đã từ chối → `denied`, và KHÔNG hỏi lại', () => {
    // iOS hỏi đúng một lần trong đời cài đặt. Hỏi lại là một lượt gọi không bao
    // giờ hiện hộp nào — nơi gọi phải đưa người dùng sang Cài đặt, không phải chờ.
    const request = jest.fn();
    mockCameraKit({
      checkDeviceCameraAuthorizationStatus: async () => false,
      requestDeviceCameraAuthorization: request,
    });
    return ensureCameraPermission(PROMPT).then(kq => {
      expect(kq).toBe('denied');
      expect(request).not.toHaveBeenCalled();
    });
  });

  it('chưa hỏi lần nào (`-1`) → hỏi, và trả kết quả của lần hỏi đó', async () => {
    const request = jest.fn(async () => true);
    mockCameraKit({
      checkDeviceCameraAuthorizationStatus: async () => -1,
      requestDeviceCameraAuthorization: request,
    });
    await expect(ensureCameraPermission(PROMPT)).resolves.toBe('granted');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('chưa hỏi, rồi người dùng bấm "Không cho phép" → `denied`', async () => {
    mockCameraKit({
      checkDeviceCameraAuthorizationStatus: async () => -1,
      requestDeviceCameraAuthorization: async () => false,
    });
    await expect(ensureCameraPermission(PROMPT)).resolves.toBe('denied');
  });

  it('đã cấp → `granted`, và KHÔNG hiện hộp nào', async () => {
    const request = jest.fn();
    mockCameraKit({
      checkDeviceCameraAuthorizationStatus: async () => true,
      requestDeviceCameraAuthorization: request,
    });
    await expect(ensureCameraPermission(PROMPT)).resolves.toBe('granted');
    expect(request).not.toHaveBeenCalled();
  });

  it('thiếu module gốc → `unmeasurable`, KHÔNG phải `denied`', async () => {
    // Hai thứ này phải khác nhau ở nơi gọi. `denied` thì chặn và chỉ sang Cài đặt;
    // `unmeasurable` thì đi tiếp, vì chặn máy ảnh của mọi người vì một thứ mình
    // không đo được là tự tay tắt tính năng.
    mockCameraKit(null);
    await expect(checkCameraPermission()).resolves.toBe('unmeasurable');
    await expect(ensureCameraPermission(PROMPT)).resolves.toBe('unmeasurable');
  });

  it('module gốc ném → `unmeasurable`, không để lọt lỗi ra ngoài', async () => {
    mockCameraKit({
      checkDeviceCameraAuthorizationStatus: async () => { throw new Error('x'); },
    });
    await expect(ensureCameraPermission(PROMPT)).resolves.toBe('unmeasurable');
  });
});

describe('Android', () => {
  beforeEach(() => setPlatform('android'));

  it('người dùng cho phép → `granted`', async () => {
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted' as never);
    await expect(ensureCameraPermission(PROMPT)).resolves.toBe('granted');
  });

  it('người dùng từ chối → `denied`', async () => {
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('denied' as never);
    await expect(ensureCameraPermission(PROMPT)).resolves.toBe('denied');
  });

  it('`check` chỉ đọc, không hiện hộp', async () => {
    const request = jest.spyOn(PermissionsAndroid, 'request');
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    await expect(checkCameraPermission()).resolves.toBe('undetermined');
    expect(request).not.toHaveBeenCalled();
  });
});
