import {
  PHOENIX_DID_RE, CARDANO_DID_RE, parseDidNetwork,
  isCanonicalPhoenixDid, isLegacyCardanoDid, isSupportedBackendDid,
  isMalformedPhoenixDid, assertSupportedBackendDid,
} from './phoenixDid';

const HEX64 = 'a'.repeat(64);
const BASE32_13 = 'abcdefghijkmn';          // khuôn bộ sinh HIỆN HÀNH
const DECIMAL_MID = '1734567890123';        // khuôn bộ sinh khớp cổng mint on-chain

describe('PHOENIX_DID_RE — cố ý LỎNG, và phải giữ lỏng', () => {
  it('nhận khuôn bộ sinh hiện hành (base32 + 64 hex)', () => {
    expect(PHOENIX_DID_RE.test(`did:phoenix:${BASE32_13}:${HEX64}`)).toBe(true);
  });

  // Đây là bài đắt nhất tệp này. Nhà PhoenixKey báo bản khớp byte với cổng mint
  // on-chain render đoạn giữa bằng THẬP PHÂN, và bản đó đã có mã, chỉ nằm sau một
  // công tắc mặc định tắt. Khuôn cũ `[a-z2-7]+` từ chối `0,1,8,9`.
  it('nhận đoạn giữa THẬP PHÂN — khuôn sắp tới, có chữ số 0/1/8/9', () => {
    expect(PHOENIX_DID_RE.test(`did:phoenix:${DECIMAL_MID}:${HEX64}`)).toBe(true);
  });

  it('không ghim ĐỘ DÀI đoạn cuối', () => {
    expect(PHOENIX_DID_RE.test(`did:phoenix:${BASE32_13}:${'b'.repeat(96)}`)).toBe(true);
    expect(PHOENIX_DID_RE.test(`did:phoenix:${BASE32_13}:ZZZ`)).toBe(true);
  });

  // Phần PHẢI chặn: chuỗi máy chủ OriLife đang trả dưới tên `entity_did`.
  it.each([
    'did:phoenix:pending:tree:0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
    'did:phoenix:orilife:tree:0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
  ])('chặn %s — BA đoạn, không phải hai', (bad) => {
    expect(PHOENIX_DID_RE.test(bad)).toBe(false);
    expect(isMalformedPhoenixDid(bad)).toBe(true);
  });

  it.each([
    ['thiếu một đoạn', `did:phoenix:${HEX64}`],
    ['đoạn giữa rỗng', `did:phoenix::${HEX64}`],
    ['đoạn cuối rỗng', `did:phoenix:${BASE32_13}:`],
    ['có khoảng trắng', `did:phoenix:${BASE32_13}: ${HEX64}`],
    ['sai phương thức', `did:key:${BASE32_13}:${HEX64}`],
    ['chuỗi rỗng', ''],
  ])('chặn %s', (_ten, bad) => {
    expect(PHOENIX_DID_RE.test(bad)).toBe(false);
  });
});

describe('CARDANO_DID_RE — NGƯỢC LẠI, giữ chặt vì app đọc NGHĨA từ chuỗi', () => {
  it('bóc đúng tên mạng', () => {
    expect(parseDidNetwork(`did:cardano:preprod:${HEX64}`)).toBe('preprod');
    expect(parseDidNetwork(`did:cardano:mainnet:${HEX64}`)).toBe('mainnet');
    expect(parseDidNetwork(`did:cardano:preview:${HEX64}`)).toBe('preview');
  });

  it('mạng lạ KHÔNG được tự khai — nới cái này ra là để chuỗi tự chọn máy chủ', () => {
    expect(parseDidNetwork(`did:cardano:sanctuary:${HEX64}`)).toBeNull();
    expect(CARDANO_DID_RE.test(`did:cardano:sanctuary:${HEX64}`)).toBe(false);
  });

  it('did:phoenix không mang tên mạng ⇒ null, không đoán', () => {
    expect(parseDidNetwork(`did:phoenix:${BASE32_13}:${HEX64}`)).toBeNull();
  });

  it('đoạn cuối phải đúng 64 hex', () => {
    expect(CARDANO_DID_RE.test(`did:cardano:preprod:${'a'.repeat(63)}`)).toBe(false);
    expect(CARDANO_DID_RE.test(`did:cardano:preprod:${'g'.repeat(64)}`)).toBe(false);
  });
});

describe('cửa NÉM — chỗ khuôn sai gây thiệt hại thật', () => {
  // `assertSupportedBackendDid` ném, và `isMalformedPhoenixDid` dẫn vào đường dựng
  // lại danh tính. Từ chối nhầm ở đây không phải "hiện một cảnh báo".
  it('DID khuôn THẬP PHÂN đi qua được cửa ném', () => {
    const did = `did:phoenix:${DECIMAL_MID}:${HEX64}`;
    expect(isSupportedBackendDid(did)).toBe(true);
    expect(isMalformedPhoenixDid(did)).toBe(false);
    expect(assertSupportedBackendDid(did)).toBe(did);
  });

  it('DID cũ did:cardano vẫn qua', () => {
    const did = `did:cardano:preprod:${HEX64}`;
    expect(isLegacyCardanoDid(did)).toBe(true);
    expect(isSupportedBackendDid(did)).toBe(true);
  });

  it('chuỗi ba đoạn của OriLife vẫn bị NÉM', () => {
    expect(() => assertSupportedBackendDid('did:phoenix:pending:tree:abc'))
      .toThrow(/không đúng định dạng backend/);
  });

  it('isCanonicalPhoenixDid nhận null/undefined mà không nổ', () => {
    expect(isCanonicalPhoenixDid(null)).toBe(false);
    expect(isCanonicalPhoenixDid(undefined)).toBe(false);
    expect(isMalformedPhoenixDid(null)).toBe(false);
  });
});
