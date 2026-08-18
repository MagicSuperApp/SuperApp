/**
 * Bài kiểm canh MỘT lỗi cụ thể đã xảy ra thật:
 *
 * Bản đầu gọi `Share.share({ url: dataUrl, message: code })`. Trên Android,
 * `Share` của React Native **vứt bỏ `url`** và chỉ gửi `message` — người dùng
 * bấm "Tải ảnh mã QR" và nhận được MÃ DẠNG CHỮ, không có lỗi nào báo.
 *
 * Nên bài kiểm dưới đây không chỉ kiểm "có gọi chia sẻ không". Nó kiểm rằng
 * **không có đường nào gửi chữ thay cho ảnh**.
 */
import { Platform, Share } from 'react-native';

import { fileNameFor, shareQrImage } from './saveQrImage';

const mockWrite = jest.fn(async () => undefined);
jest.mock(
  'expo-file-system/legacy',
  () => ({
    cacheDirectory: 'file:///cache/',
    writeAsStringAsync: (...a: unknown[]) => mockWrite(...(a as [])),
  }),
  { virtual: true },
);

const mockShareAsync = jest.fn(async () => undefined);
const mockIsAvailable = jest.fn(async () => true);
jest.mock(
  'expo-sharing',
  () => ({
    isAvailableAsync: () => mockIsAvailable(),
    shareAsync: (...a: unknown[]) => mockShareAsync(...(a as [])),
  }),
  { virtual: true },
);

const B64 = 'iVBORw0KGgoAAAANSUhEUg==';
const CODE = 'ORI-w3gvdcs-AB12CD34';

let rnShare: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAvailable.mockResolvedValue(true);
  rnShare = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction } as any);
});

afterEach(() => { rnShare.mockRestore(); });

describe('fileNameFor — tên tệp mang MÃ CÂY', () => {
  it('giữ mã, thêm đuôi png', () => {
    expect(fileNameFor(CODE)).toBe(`${CODE}.png`);
  });
  it('lọc ký tự không hợp lệ thay vì dựng một đường dẫn hỏng', () => {
    expect(fileNameFor('a/b c:d')).toBe('a_b_c_d.png');
  });
  it('mã rỗng vẫn ra một tên dùng được', () => {
    expect(fileNameFor('')).toBe('ma-truy-xuat.png');
    expect(fileNameFor(null as any)).toBe('ma-truy-xuat.png');
  });
});

describe('shareQrImage — chia sẻ TỆP, không bao giờ chia sẻ chữ', () => {
  it('ghi PNG ra tệp rồi đưa TỆP cho expo-sharing', async () => {
    const r = await shareQrImage(B64, CODE);
    expect(r.ok).toBe(true);

    // Ghi đúng base64 vào đúng tên tệp.
    expect(mockWrite).toHaveBeenCalledWith(
      `file:///cache/${CODE}.png`, B64, { encoding: 'base64' },
    );
    // Và chia sẻ ĐÚNG tệp đó, khai đúng loại ảnh.
    const [uri, opts] = mockShareAsync.mock.calls[0] as unknown as [string, any];
    expect(uri).toBe(`file:///cache/${CODE}.png`);
    expect(opts.mimeType).toBe('image/png');
  });

  it('KHÔNG đụng tới Share của React Native khi expo-sharing dùng được', async () => {
    await shareQrImage(B64, CODE);
    expect(rnShare).not.toHaveBeenCalled();
  });

  it('chưa vẽ được mã → no_image, không gửi gì', async () => {
    const r = await shareQrImage(null, CODE);
    expect(r).toEqual({ ok: false, reason: 'no_image' });
    expect(mockShareAsync).not.toHaveBeenCalled();
    expect(rnShare).not.toHaveBeenCalled();
  });

  it('ghi tệp hỏng → unavailable, TUYỆT ĐỐI không lùi về gửi chữ', async () => {
    mockWrite.mockRejectedValueOnce(new Error('hết chỗ'));
    const r = await shareQrImage(B64, CODE);
    expect(r).toEqual({ ok: false, reason: 'unavailable' });
    expect(rnShare).not.toHaveBeenCalled();
  });

  it('expo-sharing báo máy không hỗ trợ → Android KHÔNG có đường lùi', async () => {
    // Đây chính là ca đã hỏng: bản trước lùi về `Share.share({message: code})`
    // và gửi mã dạng chữ. Nay nó phải nói thẳng là không xuất được.
    Platform.OS = 'android';
    mockIsAvailable.mockResolvedValue(false);
    const r = await shareQrImage(B64, CODE);
    expect(r).toEqual({ ok: false, reason: 'unavailable' });
    expect(rnShare).not.toHaveBeenCalled();
  });

  it('iOS thì có đường lùi — ở đó Share của RN thật sự nhận `url` là file://', async () => {
    Platform.OS = 'ios';
    mockIsAvailable.mockResolvedValue(false);
    const r = await shareQrImage(B64, CODE);
    expect(r.ok).toBe(true);
    const [content] = rnShare.mock.calls[0];
    expect(content.url).toBe(`file:///cache/${CODE}.png`);
    // Và ngay cả ở đường lùi cũng KHÔNG gửi `message` — gửi chữ là chính lỗi cũ.
    expect(content.message).toBeUndefined();
  });

  it('người dùng huỷ ở bảng chia sẻ iOS → dismissed, không báo đỏ', async () => {
    Platform.OS = 'ios';
    mockIsAvailable.mockResolvedValue(false);
    rnShare.mockResolvedValue({ action: Share.dismissedAction } as any);
    const r = await shareQrImage(B64, CODE);
    expect(r).toEqual({ ok: false, reason: 'dismissed' });
  });

  it('expo-sharing ném → failed kèm câu lỗi thật, KHÔNG nuốt', async () => {
    Platform.OS = 'android';
    mockShareAsync.mockRejectedValueOnce(new Error('không mở được bảng chia sẻ'));
    const r = await shareQrImage(B64, CODE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('failed');
  });
});
