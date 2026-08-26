import {
  ACTIVITY_VI, MEDIA_PREVIEW_MAX,
  inheritedFrom, materialNames, mediaOverflow, mediaUrls, showsChainChip, summarise,
} from './timelineView';
import type { TimelineEvent } from '../../../services/timelineService';

const BASE = 'https://api.orilife.io';
/** Cổng xem tệp theo CID — trường `lampnet_view` của máy chủ (`server.py:3870`). */
const VIEW = 'https://lampnet.cloud';

const ev = (over: Partial<TimelineEvent> & Record<string, unknown> = {}): TimelineEvent => ({
  event_id: 'e1', kind: 'care', ts: '2026-08-18T03:00:00+00:00', ...over,
} as TimelineEvent);

describe('inheritedFrom — mục ghi ở VƯỜN rồi kế thừa xuống cây', () => {
  it('máy chủ gắn chuỗi id → đọc ra', () => {
    expect(inheritedFrom(ev({ inherited_from: 'farm-9' }))).toBe('farm-9');
  });

  it('gắn dạng object cũng đọc được — rẻ hơn là sửa sau', () => {
    expect(inheritedFrom(ev({ inherited_from: { entity_type: 'farm', entity_id: 'farm-9' } })))
      .toBe('farm-9');
  });

  it('KHÔNG có trường (mọi bản máy chủ hiện nay) → null, hành vi y như cũ', () => {
    expect(inheritedFrom(ev())).toBeNull();
    expect(inheritedFrom(null)).toBeNull();
    expect(inheritedFrom(ev({ inherited_from: '   ' }))).toBeNull();
  });
});

describe('showsChainChip — bản sao kế thừa KHÔNG mang chuỗi của bản gốc', () => {
  it('mục của chính cây → có chip', () => {
    expect(showsChainChip(ev())).toBe(true);
  });
  it('mục kế thừa từ vườn → KHÔNG chip: chuỗi thuộc về bản ghi gốc', () => {
    expect(showsChainChip(ev({ inherited_from: 'farm-9' }))).toBe(false);
  });
});

describe('summarise — payload', () => {
  it('ghi chú người dùng tự viết đứng TRƯỚC mọi thứ máy dựng', () => {
    expect(summarise(ev({
      payload: { note: 'Cây bị rệp ở cành phía đông', activity_type: 'pesticide' },
    }))).toBe('Cây bị rệp ở cành phía đông');
  });

  it('đọc `activity_type` — khoá CHÍNH APP NÀY ghi, không phải đoán', () => {
    expect(summarise(ev({ payload: { activity_type: 'watering' } }))).toBe(ACTIVITY_VI.watering);
  });

  it('kèm vật tư khi có', () => {
    expect(summarise(ev({
      payload: { activity_type: 'fertilizing', materials: ['NPK 16-16-8', { name: 'Vôi' }] },
    }))).toBe('Bón phân · NPK 16-16-8, Vôi');
  });

  it('`activity_type` lạ thì hiện NGUYÊN VĂN, không nuốt', () => {
    expect(summarise(ev({ payload: { activity_type: 'tia_canh' } }))).toBe('tia_canh');
  });

  it('không có gì đọc được → đếm tệp đính kèm', () => {
    expect(summarise(ev({ payload: { sig: 'abc' }, media: [1, 2] }))).toBe('2 tệp đính kèm');
  });

  it('không payload, không media → null (thà trống còn hơn đoán)', () => {
    expect(summarise(ev())).toBeNull();
    expect(summarise(ev({ payload: {} }))).toBeNull();
  });

  it('KHÔNG BAO GIỜ đổ object ra màn', () => {
    const out = summarise(ev({ payload: { note: { a: 1 }, activity_type: { b: 2 } } as any }));
    expect(String(out)).not.toContain('[object Object]');
  });
});

describe('materialNames', () => {
  it('bỏ phần tử không đọc được thay vì hiện [object Object]', () => {
    expect(materialNames({ materials: ['A', { code: 7 }, { name: 'B' }, null] })).toEqual(['A', 'B']);
  });
  it('không phải mảng → rỗng', () => {
    expect(materialNames({ materials: 'NPK' })).toEqual([]);
    expect(materialNames({})).toEqual([]);
  });
});

describe('mediaUrls — nhận CẢ HAI dạng, khỏi phải chờ ai dán thân 200', () => {
  it('URL tuyệt đối giữ nguyên', () => {
    expect(mediaUrls(['https://cdn/x.jpg'], BASE)).toEqual(['https://cdn/x.jpg']);
  });

  it('đường tương đối `/gimg/...` được ghép base', () => {
    expect(mediaUrls(['/gimg/abc'], BASE)).toEqual([`${BASE}/gimg/abc`]);
  });

  it('base có dấu / thừa cũng không ra hai gạch', () => {
    expect(mediaUrls(['/gimg/abc'], `${BASE}/`)).toEqual([`${BASE}/gimg/abc`]);
  });

  it('object có url/uri/src/path/href → lấy khoá đầu đọc được', () => {
    expect(mediaUrls([{ uri: '/gimg/a' }, { url: 'https://c/b.jpg' }], BASE))
      .toEqual([`${BASE}/gimg/a`, 'https://c/b.jpg']);
  });

  it('chỉ có `cid` → ghép với CỔNG XEM, không ghép với base OriLife', () => {
    // `cid` trong `media[]` là CID LampNet (`media_attach.py:72-88` ép cid+sha256 của
    // byte đã lưu ở LampNet). `/gimg` phục vụ TỆP TRÊN ĐĨA OriLife theo đường dẫn
    // `{tree_id}/imgs/…` (`server.py:8662` + `:3455`) — hai không gian tên khác nhau.
    expect(mediaUrls([{ cid: 'ln1q_abc_file' }], BASE, VIEW))
      .toEqual([`${VIEW}/ln1q_abc_file`]);
  });

  it('cổng xem có gạch chéo cuối cũng không ra hai gạch', () => {
    expect(mediaUrls([{ cid: 'x' }], BASE, `${VIEW}/`)).toEqual([`${VIEW}/x`]);
  });

  it('CHƯA BIẾT cổng xem → BỎ phần tử `cid`, KHÔNG đoán ra một URL', () => {
    // Đây là ca hồi quy của lỗi cũ: ghép `{base}/gimg/{cid}` cho ra một URL trông
    // đúng mà 404 ở mọi sự kiện có media. Thà không có ảnh còn hơn có ô vỡ.
    expect(mediaUrls([{ cid: 'ln1q_abc_file' }], BASE, null)).toEqual([]);
    expect(mediaUrls([{ cid: 'ln1q_abc_file' }], BASE)).toEqual([]);
    expect(mediaUrls([{ cid: 'ln1q_abc_file' }], BASE, '  ')).toEqual([]);
  });

  it('không biết cổng xem thì phần tử `cid` bị bỏ nhưng phần tử có URL vẫn giữ', () => {
    expect(mediaUrls([{ cid: 'ln1q_a_file' }, { url: 'https://c/b.jpg' }], BASE, null))
      .toEqual(['https://c/b.jpg']);
  });

  it('`url` trong object vẫn thắng `cid` — máy chủ nói thẳng thì nghe thẳng', () => {
    expect(mediaUrls([{ cid: 'ln1q_a_file', url: '/gimg/real.jpg' }], BASE, VIEW))
      .toEqual([`${BASE}/gimg/real.jpg`]);
  });

  it('file:// và data: giữ nguyên', () => {
    expect(mediaUrls(['file:///a.jpg', 'data:image/png;base64,xx'], BASE))
      .toEqual(['file:///a.jpg', 'data:image/png;base64,xx']);
  });

  it('chuỗi trần không phải URL → BỎ, không ghép bừa vào base', () => {
    // Ghép bừa là dựng một URL sai trông y hệt URL đúng.
    expect(mediaUrls(['abc123'], BASE)).toEqual([]);
  });

  it('phần tử rác bị bỏ, phần tử tốt vẫn giữ', () => {
    expect(mediaUrls([null, 42, { nope: 1 }, '/gimg/ok'], BASE)).toEqual([`${BASE}/gimg/ok`]);
  });

  it('không phải mảng → rỗng', () => {
    expect(mediaUrls(undefined, BASE)).toEqual([]);
    expect(mediaUrls('x', BASE)).toEqual([]);
  });

  it('cắt còn tối đa MEDIA_PREVIEW_MAX', () => {
    const many = Array.from({ length: 9 }, (_, i) => `/gimg/${i}`);
    expect(mediaUrls(many, BASE)).toHaveLength(MEDIA_PREVIEW_MAX);
    expect(mediaOverflow(many)).toBe(9 - MEDIA_PREVIEW_MAX);
  });

  it('ít hơn trần → không có "+N"', () => {
    expect(mediaOverflow(['/gimg/a'])).toBe(0);
    expect(mediaOverflow(undefined)).toBe(0);
  });
});
