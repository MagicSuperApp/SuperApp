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
function mount(el: React.ReactElement): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(el); });
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
  it('mặc định nạp ảnh máy chủ', () => {
    const tree = mount(<RemoteImage uri={SERVER} fallbackUri={LOCAL} />);
    expect(currentUri(tree)).toBe(SERVER);
  });

  it('ảnh máy chủ 404 → TRÁO sang bản trong máy, không nhảy thẳng ra ô báo', () => {
    const tree = mount(<RemoteImage uri={SERVER} fallbackUri={LOCAL} />);
    fireError(tree);
    expect(currentUri(tree)).toBe(LOCAL);
  });

  it('hỏng cả hai đường → vẽ ô báo và gọi onFinalError đúng MỘT lần', () => {
    const onFinalError = jest.fn();
    const tree = mount(
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

  it('không có bản trong máy → hỏng một phát là ra ô báo, không kẹt ở bước rỗng', () => {
    const onFinalError = jest.fn();
    const tree = mount(
      <RemoteImage uri={SERVER} onFinalError={onFinalError} placeholder={<Text>trống</Text>} />,
    );
    fireError(tree);
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(onFinalError).toHaveBeenCalledTimes(1);
  });

  it('không có uri nào → vẽ thẳng ô báo, KHÔNG dựng <Image source={{uri: undefined}}>', () => {
    const tree = mount(<RemoteImage uri={null} placeholder={<Text>trống</Text>} />);
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });

  it('đổi retryKey → quay lại đường đầu VÀ đổi URL (nếu không thì bộ đệm trả lại 404 cũ)', () => {
    const tree = mount(<RemoteImage uri={SERVER} fallbackUri={LOCAL} retryKey={0} />);
    fireError(tree);
    expect(currentUri(tree)).toBe(LOCAL);

    act(() => { tree.update(<RemoteImage uri={SERVER} fallbackUri={LOCAL} retryKey={1} />); });
    expect(currentUri(tree)).toBe(`${SERVER}?r=1`);
  });
});
