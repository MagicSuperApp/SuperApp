/**
 * Bài kiểm cho `reverseGeocode`.
 *
 * Thân mẫu chép từ lượt gọi thật 2026-08-19 với đúng toạ độ của cây mẫu
 * (20.989, 105.944) — kể cả `postcode` và `country`, vì việc VỨT hai mẩu đó đi
 * chính là một trong những điều tệp này phải làm đúng.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cacheKey, formatLatLon, googleDirectionsUrl, resetReverseGeocodeCache,
  reverseGeocode, shortAddressVi,
} from './reverseGeocode';

const REAL_BODY = {
  display_name: 'Vinhomes Ocean Park, Xã Gia Lâm, Hà Nội, 17710, Việt Nam',
  address: {
    residential: 'Vinhomes Ocean Park',
    city_district: 'Xã Gia Lâm',
    city: 'Hà Nội',
    'ISO3166-2-lvl4': 'VN-HN',
    postcode: '17710',
    country: 'Việt Nam',
    country_code: 'vn',
  },
};

function mockFetch(impl: (...a: any[]) => Promise<any>) {
  (global as any).fetch = jest.fn(impl);
}

beforeEach(async () => {
  resetReverseGeocodeCache();
  // Đệm ĐĨA sống qua từng ca (bản giả của AsyncStorage lưu thật). Không dọn thì
  // ca đầu ghi địa chỉ vào đĩa và mọi ca sau đọc lại — mock `fetch` không bao giờ
  // được gọi, và cả nhóm test hoá ra chỉ đang kiểm bộ đệm.
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (global as any).fetch;
});

describe('shortAddressVi', () => {
  it('gắp ba mẩu hành chính, BỎ mã bưu chính và tên nước', () => {
    expect(shortAddressVi(REAL_BODY.address)).toBe('Vinhomes Ocean Park, Xã Gia Lâm, Hà Nội');
  });

  it('không lặp khi city và state cùng tên (ca Hà Nội / TP.HCM)', () => {
    expect(shortAddressVi({ village: 'Thôn Đoài', city: 'Hà Nội', state: 'Hà Nội' }))
      .toBe('Thôn Đoài, Hà Nội');
  });

  it('giữ đủ XÃ · HUYỆN · TỈNH ở nông thôn — nhiều xã trùng tên trong một tỉnh', () => {
    expect(shortAddressVi({ village: 'Xã Cẩm Sơn', county: 'Huyện Cai Lậy', state: 'Tiền Giang' }))
      .toBe('Xã Cẩm Sơn, Huyện Cai Lậy, Tiền Giang');
  });

  it('đủ cả bốn bậc thì cắt còn ba: hai mẩu hẹp nhất cộng tỉnh', () => {
    expect(shortAddressVi({
      hamlet: 'Ấp Bốn', village: 'Xã Cẩm Sơn', county: 'Huyện Cai Lậy', state: 'Tiền Giang',
    })).toBe('Ấp Bốn, Xã Cẩm Sơn, Tiền Giang');
  });

  it('chỉ có mã bưu chính và tên nước ⇒ null, không dựng "Việt Nam" thành địa chỉ', () => {
    expect(shortAddressVi({ postcode: '17710', country: 'Việt Nam', country_code: 'vn' })).toBeNull();
  });

  it('không có address ⇒ null', () => {
    expect(shortAddressVi(null)).toBeNull();
  });
});

describe('reverseGeocode', () => {
  it('đọc đúng thân thật và trả dòng gọn', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => REAL_BODY }));
    const r = await reverseGeocode(20.989, 105.944);
    expect(r).toEqual({
      kind: 'ok',
      line: 'Vinhomes Ocean Park, Xã Gia Lâm, Hà Nội',
      full: 'Vinhomes Ocean Park, Xã Gia Lâm, Hà Nội, 17710, Việt Nam',
    });
  });

  it('khai User-Agent — thiếu là Nominatim chặn IP, và chặn thì mọi máy mất địa chỉ cùng lúc', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => REAL_BODY }));
    await reverseGeocode(20.989, 105.944);
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers['User-Agent']).toContain('AladinSuperApp');
  });

  it('KHÔNG gửi gì ngoài hai con số — không mã cây, không token', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => REAL_BODY }));
    await reverseGeocode(20.989, 105.944);
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toContain('lat=20.989');
    expect(url).toContain('lon=105.944');
    expect(url).not.toMatch(/ORI-|tree_id|token/i);
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('hỏi MỘT LẦN cho cùng toạ độ — Nominatim chỉ cho 1 lượt/giây', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => REAL_BODY }));
    await reverseGeocode(20.989, 105.944);
    await reverseGeocode(20.989, 105.944);
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('hai lượt hỏi song song dùng chung một lời hứa, không bắn hai yêu cầu', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => REAL_BODY }));
    await Promise.all([reverseGeocode(20.989, 105.944), reverseGeocode(20.989, 105.944)]);
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('200 kèm {error} (điểm giữa biển) ⇒ none, không phải lỗi', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ error: 'Unable to geocode' }) }));
    expect((await reverseGeocode(0, 0)).kind).toBe('none');
  });

  it('bị chặn (403) ⇒ error, KHÔNG ném ra ngoài', async () => {
    mockFetch(async () => ({ ok: false, status: 403 }));
    const r = await reverseGeocode(20.989, 105.944);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.detail).toBe('HTTP 403');
  });

  it('mất mạng ⇒ error, màn tự lùi về toạ độ thô', async () => {
    mockFetch(async () => { throw new TypeError('Network request failed'); });
    expect((await reverseGeocode(20.989, 105.944)).kind).toBe('error');
  });

  it('toạ độ không hợp lệ ⇒ error, không gọi mạng', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => REAL_BODY }));
    expect((await reverseGeocode(NaN, 1)).kind).toBe('error');
    expect((global as any).fetch).not.toHaveBeenCalled();
  });
});

describe('cacheKey', () => {
  it('làm tròn 4 chữ số (~11m) — gộp lượt xem lại, không gộp hai cây khác nhau', () => {
    expect(cacheKey(20.98901, 105.94402)).toBe(cacheKey(20.98899, 105.94398));
    expect(cacheKey(20.989, 105.944)).not.toBe(cacheKey(20.99, 105.945));
  });
});

describe('formatLatLon', () => {
  it('đủ chữ số để chép dán sang bản đồ khác', () => {
    expect(formatLatLon(20.989, 105.944)).toBe('20.98900, 105.94400');
  });
});

describe('googleDirectionsUrl', () => {
  it('dùng đường universal của Google — máy có app thì mở app, không thì mở web', () => {
    expect(googleDirectionsUrl(20.989, 105.944))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=20.989,105.944');
  });
});
