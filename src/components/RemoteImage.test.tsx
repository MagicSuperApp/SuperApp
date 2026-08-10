/**
 * Unit tests — RemoteImage
 *
 * Khoá đúng hành vi mà cổng `/gimg` bắt buộc phải có: ảnh máy chủ hỏng thì TRÁO
 * sang bản `file://` còn trong máy, hết đường mới vẽ ô báo; và mỗi lần thử lại
 * phải ĐỔI URL, vì bộ đệm ảnh của RN có thể giữ lại phản hồi 404 (mở cổng lại mà
 * URL không đổi thì ảnh vẫn trắng).
 *
 * Dùng react-test-renderer như các test component khác trong repo.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Image, Text } from 'react-native';
import RemoteImage, { withCacheBuster } from './RemoteImage';

const SERVER = 'https://api.orilife.io/gimg/abc.jpg';
const LOCAL = 'file:///data/user/0/app/tree_1.jpg';

/** URI đang thực sự được `<Image>` nạp. */
function currentUri(tree: renderer.ReactTestRenderer): string | undefined {
  const imgs = tree.root.findAllByType(Image);
  const src = imgs[0]?.props?.source;
  return Array.isArray(src) ? src[0]?.uri : src?.uri;
}

function fireError(tree: renderer.ReactTestRenderer): void {
  const img = tree.root.findAllByType(Image)[0];
  act(() => { img.props.onError(); });
}

/** Dựng cây trong act() — component có effect đặt lại bước, không bọc thì React
 *  cảnh báo và bản dựng bị tháo trước khi test đọc được. */
async function mount(el: React.ReactElement): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  // `await act(async …)`: với ảnh trên máy chủ OriLife, component đọc token từ
  // AsyncStorage (bất đồng bộ) TRƯỚC khi vẽ <Image> — cố ý, để không bắn một
  // yêu cầu không mang token rồi ăn 404 oan và để 404 đó nằm lại trong bộ đệm
  // ảnh của hệ điều hành. Không xả microtask ở đây thì test chỉ thấy vòng quay.
  await act(async () => { tree = renderer.create(el); });
  return tree;
}

describe('withCacheBuster', () => {
  it('không đụng vào URL khi chưa thử lại lần nào', () => {
    expect(withCacheBuster(SERVER, 0)).toBe(SERVER);
  });

  it('nối ?r=<n> cho http(s) để phá bộ đệm âm', () => {
    expect(withCacheBuster(SERVER, 2)).toBe(`${SERVER}?r=2`);
  });

  it('dùng & khi URL đã có query', () => {
    expect(withCacheBuster('https://x.io/a?b=1', 1)).toBe('https://x.io/a?b=1&r=1');
  });

  it('KHÔNG nối gì vào file:// — thêm query vào đường dẫn tệp là hỏng', () => {
    expect(withCacheBuster(LOCAL, 3)).toBe(LOCAL);
  });

  it('uri rỗng → undefined, không dựng URL rác', () => {
    expect(withCacheBuster(undefined, 1)).toBeUndefined();
    expect(withCacheBuster(null, 1)).toBeUndefined();
  });
});

describe('RemoteImage — ba đường lùi', () => {
  it('mặc định nạp ảnh máy chủ', async () => {
    const tree = await mount(<RemoteImage uri={SERVER} fallbackUri={LOCAL} />);
    expect(currentUri(tree)).toBe(SERVER);
  });

  it('ảnh máy chủ 404 → TRÁO sang bản trong máy, không nhảy thẳng ra ô báo', async () => {
    const tree = await mount(<RemoteImage uri={SERVER} fallbackUri={LOCAL} />);
    fireError(tree);
    expect(currentUri(tree)).toBe(LOCAL);
  });

  it('hỏng cả hai đường → vẽ ô báo và gọi onFinalError đúng MỘT lần', async () => {
    const onFinalError = jest.fn();
    const tree = await mount(
      <RemoteImage
        uri={SERVER}
        fallbackUri={LOCAL}
        onFinalError={onFinalError}
        placeholder={<Text>chưa xem được</Text>}
      />,
    );
    fireError(tree);
    fireError(tree);
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(tree.root.findByType(Text).props.children).toBe('chưa xem được');
    expect(onFinalError).toHaveBeenCalledTimes(1);
  });

  it('không có bản trong máy → hỏng một phát là ra ô báo, không kẹt ở bước rỗng', async () => {
    const onFinalError = jest.fn();
    const tree = await mount(
      <RemoteImage uri={SERVER} onFinalError={onFinalError} placeholder={<Text>trống</Text>} />,
    );
    fireError(tree);
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(onFinalError).toHaveBeenCalledTimes(1);
  });

  it('không có uri nào → vẽ thẳng ô báo, KHÔNG dựng <Image source={{uri: undefined}}>', async () => {
    const tree = await mount(<RemoteImage uri={null} placeholder={<Text>trống</Text>} />);
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });

  it('đổi retryKey → quay lại đường đầu VÀ đổi URL (nếu không thì bộ đệm trả lại 404 cũ)', async () => {
    const tree = await mount(<RemoteImage uri={SERVER} fallbackUri={LOCAL} retryKey={0} />);
    fireError(tree);
    expect(currentUri(tree)).toBe(LOCAL);

    // `await act(async …)` chứ không phải act đồng bộ: đổi `retryKey` làm URL đổi,
    // mà URL đổi thì cổng xác-thực đọc lại token (cố ý — ca hỏng hay gặp nhất là
    // token vừa hết hạn). Phải xả microtask rồi mới đọc được <Image>.
    await act(async () => { tree.update(<RemoteImage uri={SERVER} fallbackUri={LOCAL} retryKey={1} />); });
    expect(currentUri(tree)).toBe(`${SERVER}?r=1`);
  });
});

// ─── Xác thực cho ảnh (gộp từ nhánh AuthImage 10/08) ─────────────────────────
//
// `/gimg` KHÔNG xét `?token=`, chỉ xét header `Authorization`; và khi CHẶN thì
// trả 404 — dùng chung mã với "ảnh không tồn tại". Nên hai điều phải đúng cùng
// lúc: token đi bằng header (không bao giờ vào URL), và câu báo lỗi không được
// khẳng định là ảnh không tồn tại.
describe('shouldAttachAuth — token chỉ đi tới đúng máy chủ OriLife', () => {
  const { shouldAttachAuth } = require('./RemoteImage');
  const { ORILIFE_BASE } = require('../services/orilifeBase');

  it('ảnh trên máy chủ OriLife → CÓ gắn', () => {
    expect(shouldAttachAuth(`${ORILIFE_BASE}/gimg/abc/imgs/000.jpg`)).toBe(true);
  });

  it('ảnh trong máy (file://) → KHÔNG gắn — đây là đường lùi thứ hai của chính component này', () => {
    expect(shouldAttachAuth('file:///data/user/0/app/cache/tree.jpg')).toBe(false);
  });

  it('host lạ → KHÔNG gắn (rò token sang bên thứ ba)', () => {
    expect(shouldAttachAuth('https://evil.example.com/gimg/abc/imgs/000.jpg')).toBe(false);
  });

  it('data: và đường dẫn tương đối → KHÔNG gắn', () => {
    expect(shouldAttachAuth('data:image/png;base64,AAAA')).toBe(false);
    expect(shouldAttachAuth('/gimg/abc/imgs/000.jpg')).toBe(false);
  });

  it('so khớp KHÔNG phân biệt hoa thường, nhưng phải đúng cả host', () => {
    const o = ORILIFE_BASE.replace(/^https?:\/\//i, '');
    expect(shouldAttachAuth(`https://${o.toUpperCase()}/gimg/a.jpg`)).toBe(true);
    expect(shouldAttachAuth(`https://${o}.evil.com/gimg/a.jpg`)).toBe(false);
  });
});
