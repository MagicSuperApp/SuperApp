/**
 * Bài kiểm cho `captureMeta` — khoá đúng MỘT nguyên tắc: thiếu thì BỎ TRỐNG,
 * không đoán, không điền mặc định.
 *
 * Vì sao đáng khoá bằng bài kiểm chứ không bằng chú thích: mọi lỗi ở tệp này
 * đều là lỗi CÂM. Một `orig_w` điền bừa bằng `image_w` không làm gãy màn nào,
 * không ném lỗi nào — nó chỉ lặng lẽ nói với máy chủ rằng "ảnh này không bị co",
 * và số khối lượng tính ra sau đó sai mà không ai truy được về đây.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Image: {
    getSize: (uri: string, ok: (w: number, h: number) => void, fail: () => void) => {
      if (uri.includes('good')) { ok(4032, 3024); return; }
      fail();
    },
  },
}));

jest.mock('react-native-device-info', () => ({
  getModel: () => 'iPhone15,3',
  getSystemVersion: () => '18.2',
}));

import { buildCaptureMeta, readOriginalSize, serializeCaptureMeta } from './captureMeta';

const heading = (h: number | null, p: number | null) => ({
  getCurrentHeading: async () => ({ heading: h, pitch: p }),
});

describe('readOriginalSize', () => {
  it('không có originalPath → undefined, KHÔNG rơi về kích thước ảnh đã co', async () => {
    expect(await readOriginalSize(undefined)).toBeUndefined();
  });

  it('đọc được → trả kích thước GỐC', async () => {
    expect(await readOriginalSize('/tmp/good.jpg')).toEqual({ w: 4032, h: 3024 });
  });

  it('đọc hỏng → undefined chứ không phải 0 hay kích thước đã co', async () => {
    expect(await readOriginalSize('/tmp/hong.jpg')).toBeUndefined();
  });

  it('đường dẫn trần được thêm file:// — không thì Image.getSize trượt im lặng', async () => {
    expect(await readOriginalSize('good.jpg')).toEqual({ w: 4032, h: 3024 });
  });
});

describe('buildCaptureMeta', () => {
  it('đủ nguồn → ghi cả kích thước đã co lẫn kích thước gốc', async () => {
    const m = await buildCaptureMeta(
      { width: 1600, height: 1200, originalPath: '/tmp/good.jpg' },
      heading(271.4, 12.5),
    );
    expect(m.image_w).toBe(1600);
    expect(m.image_h).toBe(1200);
    expect(m.orig_w).toBe(4032);
    expect(m.orig_h).toBe(3024);
    expect(m.heading).toBe(271.4);
    expect(m.pitch).toBe(12.5);
    expect(m.device_model).toBe('iPhone15,3');
    expect(m.os_version).toBe('ios 18.2');
  });

  it('KHÔNG đọc được ảnh gốc → orig_* vắng hẳn, không sao chép image_*', async () => {
    const m = await buildCaptureMeta({ width: 1600, height: 1200, originalPath: '/tmp/hong.jpg' });
    expect(m.image_w).toBe(1600);
    expect('orig_w' in m).toBe(false);
    expect('orig_h' in m).toBe(false);
  });

  it('la-bàn trả null → bỏ trống, không ghi 0 (0 là một hướng có thật)', async () => {
    const m = await buildCaptureMeta({ width: 800, height: 600 }, heading(null, null));
    expect('heading' in m).toBe(false);
    expect('pitch' in m).toBe(false);
  });

  it('cầu la-bàn ném → vẫn dựng được khối, không kéo sập luồng chụp', async () => {
    const m = await buildCaptureMeta({ width: 800, height: 600 }, {
      getCurrentHeading: async () => { throw new Error('module vắng'); },
    });
    expect(m.image_w).toBe(800);
    expect('heading' in m).toBe(false);
  });

  it('kích thước 0 hoặc âm bị loại — bộ chọn ảnh có lúc trả 0', async () => {
    const m = await buildCaptureMeta({ width: 0, height: -1 });
    expect('image_w' in m).toBe(false);
    expect('image_h' in m).toBe(false);
  });

  it('không bịa focal/lens/zoom/depth — app hôm nay KHÔNG lấy được chúng', async () => {
    const m = await buildCaptureMeta(
      { width: 1600, height: 1200, originalPath: '/tmp/good.jpg' },
      heading(90, 5),
    );
    for (const k of ['focal_px', 'focal_mm', 'sensor_w_mm', 'lens_id', 'zoom', 'depth_m', 'depth_src']) {
      expect(k in m).toBe(false);
    }
  });
});

describe('serializeCaptureMeta', () => {
  it('khối rỗng → undefined, không gửi "{}" giả làm đã đo', () => {
    expect(serializeCaptureMeta({})).toBeUndefined();
  });

  it('có số → JSON đọc lại đúng', () => {
    expect(JSON.parse(serializeCaptureMeta({ image_w: 1600 })!)).toEqual({ image_w: 1600 });
  });
});
