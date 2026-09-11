/**
 * Màn GHÉP MÁY — hai vai, hai đường, và một câu chữ có RÀNG BUỘC.
 *
 * ── Vì sao bài này dựng màn thật thay vì kiểm hàm ─────────────────────────
 * `authorizeDeviceKey` đã có bài kiểm ghim từng byte chuỗi ký từ lâu, và suốt thời
 * gian đó KHÔNG nơi nào gọi nó. Bộ kiểm xanh cho một luồng người dùng không mở
 * được là đúng mẫu hỏng đang vá, nên bài này đo thứ mà bài kia không đo được: có
 * một cái nút người dùng bấm được, và bấm vào thì nó gọi đúng hàm ấy.
 *
 * ── Ràng buộc CÂU CHỮ (xem khối chú thích đầu `DevicePairScreen.tsx`) ─────
 * Vai `manager` bị chặn ở những cửa nào thì CHƯA ĐO ĐƯỢC. Nên màn không được hứa
 * "dùng được đầy đủ" mà cũng không được hứa "quyền hạn chế". Ca cuối tệp này canh
 * đúng chỗ đó — nó sẽ đỏ nếu ai đó viết một lời hứa theo BẤT KỲ chiều nào, và
 * ngày phía máy chủ trả về danh sách `OWNER_ONLY` thì người sửa phải sửa cả ca này
 * (đó là điều mong muốn: nới câu chữ phải là một quyết định nhìn thấy trong diff).
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
let mockParams: Record<string, unknown> = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockParams }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-camera-kit', () => ({ Camera: 'Camera' }));
jest.mock('react-native-svg', () => {
  const React2 = require('react');
  const stub = (name: string) => (p: Record<string, unknown>) => React2.createElement(name, p);
  const Svg = stub('Svg');
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Circle: stub('Circle'),
    G: stub('G'),
    Image: stub('SvgImage'),
    Rect: stub('Rect'),
  };
});
jest.mock('react-redux', () => ({ useDispatch: () => jest.fn() }));

const mockThisDevicePublicKey = jest.fn();
const mockClaim = jest.fn();
jest.mock('../services/devicePairService', () => {
  const real = jest.requireActual('../services/devicePairService');
  return {
    ...real,
    thisDevicePublicKey: (...a: unknown[]) => mockThisDevicePublicKey(...a),
    claimAuthorizedIdentity: (...a: unknown[]) => mockClaim(...a),
  };
});

const mockAuthorize = jest.fn();
jest.mock('../services/keyAuthorizeService', () => ({
  authorizeDeviceKey: (...a: unknown[]) => mockAuthorize(...a),
  describeAuthorizeFailure: () => 'CAU-LOI-TU-DICH-VU',
}));

jest.mock('../services/phoenixKeyAuthService', () => ({
  phoenixKeyAuth: { unlockExistingIdentity: jest.fn() },
}));
jest.mock('../store/userSlice', () => ({ loginUser: jest.fn(() => ({ type: 'noop' })) }));

import DevicePairScreen from './DevicePairScreen';
import { buildPairPayload, NotAuthorizedYetError } from '../services/devicePairService';
import { setLanguage, __resetLanguageForTest } from '../i18n/store';
import { IDENTITY_STRINGS } from '../i18n/keys';

const PUB = '04' + 'cd'.repeat(64);

function texts(tree: renderer.ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const n = node as { children?: unknown[] } | null;
    if (n && Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(tree.toJSON());
  return out.join('\n');
}

const boi = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root.findAll(n => n.props?.testID === testID, { deep: true })[0];

async function moMan(params: Record<string, unknown>) {
  mockParams = params;
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<DevicePairScreen />); });
  return tree;
}

/** Giả một lượt quét trúng mã hợp lệ. */
async function quetTrung(tree: renderer.ReactTestRenderer, raw: string) {
  const cam = tree.root.findAll(n => typeof n.props?.onReadCode === 'function', { deep: true })[0];
  await act(async () => {
    cam.props.onReadCode({ nativeEvent: { codeStringValue: raw } });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetLanguageForTest();
  setLanguage('vi');
  mockThisDevicePublicKey.mockResolvedValue(PUB);
});

describe('vai SHOW — máy xin được duyệt', () => {
  it('hiện mã QR mang khoá của chính máy này', async () => {
    const t = await moMan({ mode: 'show' });
    const qr = boi(t, 'device-pair-qr');
    expect(qr).toBeTruthy();
    // Chuỗi nhúng vào QR phải là chuỗi mà bên quét đọc lại được — cùng một hàm
    // dựng, không gõ tay lại khuôn ở đây.
    const svg = qr.findAll(n => typeof n.props?.value === 'string', { deep: true })[0];
    expect(svg.props.value).toBe(buildPairPayload(PUB));
  });

  it('máy chủ chưa thấy duyệt ⟹ QUAY VỀ màn QR kèm câu nhắc, KHÔNG vào màn lỗi', async () => {
    mockClaim.mockRejectedValue(new NotAuthorizedYetError());
    const t = await moMan({ mode: 'show' });
    await act(async () => { boi(t, 'device-pair-claim').props.onPress(); });

    expect(texts(t)).toContain(IDENTITY_STRINGS['identity.pair.show.notYet'].vi);
    // Mã QR còn đó: bấm sớm một nhịp KHÔNG được bắt người ta làm lại từ đầu.
    expect(boi(t, 'device-pair-qr')).toBeTruthy();
  });

  it('lỗi THẬT thì vào màn lỗi — cực đối của ca trên', async () => {
    mockClaim.mockRejectedValue(new Error('mất sóng giữa chừng'));
    const t = await moMan({ mode: 'show' });
    await act(async () => { boi(t, 'device-pair-claim').props.onPress(); });

    expect(boi(t, 'device-pair-qr')).toBeFalsy();
    expect(texts(t)).toContain('mất sóng giữa chừng');
  });
});

describe('vai SCAN — máy đang giữ khoá chủ đi duyệt', () => {
  it('quét trúng ⟹ HỎI trước, chưa ký gì cả', async () => {
    const t = await moMan({ mode: 'scan' });
    await quetTrung(t, buildPairPayload(PUB));

    expect(texts(t)).toContain(IDENTITY_STRINGS['identity.pair.confirm.title'].vi);
    // Ký ngay lúc quét là ký một thứ người dùng chưa nhìn thấy.
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  it('bấm duyệt ⟹ gọi `authorizeDeviceKey` với ĐÚNG khoá vừa quét', async () => {
    mockAuthorize.mockResolvedValue({ publicKeyHex: PUB, keyRole: 'manager', opSeq: 3 });
    const t = await moMan({ mode: 'scan' });
    await quetTrung(t, buildPairPayload(PUB));
    await act(async () => { boi(t, 'device-pair-approve').props.onPress(); });

    expect(mockAuthorize).toHaveBeenCalledWith(PUB.toLowerCase());
    expect(texts(t)).toContain(IDENTITY_STRINGS['identity.pair.success.title'].vi);
  });

  it('QR lạ ⟹ cứ quét tiếp, KHÔNG nhảy sang màn xác nhận', async () => {
    const t = await moMan({ mode: 'scan' });
    await quetTrung(t, 'https://example.org/khong-phai-ma-ghep-may');
    expect(texts(t)).not.toContain(IDENTITY_STRINGS['identity.pair.confirm.title'].vi);
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  it('hỏng ⟹ hiện CÂU CỦA DỊCH VỤ, không phải câu chung của màn', async () => {
    // `describeAuthorizeFailure` phân biệt bốn nguyên nhân rất khác nhau. Thay nó
    // bằng "có lỗi xảy ra" là vứt đi đúng phần nói được việc phải làm tiếp.
    mockAuthorize.mockRejectedValue(new Error('403'));
    const t = await moMan({ mode: 'scan' });
    await quetTrung(t, buildPairPayload(PUB));
    await act(async () => { boi(t, 'device-pair-approve').props.onPress(); });
    expect(texts(t)).toContain('CAU-LOI-TU-DICH-VU');
  });

  it('người dùng huỷ sinh trắc ⟹ về màn xác nhận, không bắt quét lại', async () => {
    mockAuthorize.mockRejectedValue(Object.assign(new Error('x'), { code: 'E_USER_CANCELED' }));
    const t = await moMan({ mode: 'scan' });
    await quetTrung(t, buildPairPayload(PUB));
    await act(async () => { boi(t, 'device-pair-approve').props.onPress(); });
    expect(boi(t, 'device-pair-approve')).toBeTruthy();
    expect(texts(t)).not.toContain('CAU-LOI-TU-DICH-VU');
  });
});

describe('câu chữ KHÔNG được hứa một chiều nào về vai `manager`', () => {
  const HUA_DAY_DU = /đầy đủ như máy|như máy thứ nhất|mọi quyền|toàn quyền|full access/i;
  const HUA_HAN_CHE = /quyền hạn chế|chỉ xem|hạn chế quyền|read-only|chỉ được xem/i;

  it('không câu nào trên màn hứa theo chiều nào', async () => {
    mockAuthorize.mockResolvedValue({ publicKeyHex: PUB, keyRole: 'manager', opSeq: 3 });
    const t = await moMan({ mode: 'scan' });
    await quetTrung(t, buildPairPayload(PUB));
    await act(async () => { boi(t, 'device-pair-approve').props.onPress(); });

    const s = texts(t);
    expect(s).not.toMatch(HUA_DAY_DU);
    expect(s).not.toMatch(HUA_HAN_CHE);
  });

  it('bốn thứ tiếng của các khoá ghép máy đều có mặt', async () => {
    // Câu rào chỉ có bản tiếng Việt thì người đọc tiếng Anh vẫn đọc một lời hứa
    // trống. `keys.test.ts` canh toàn bộ bộ khoá; ca này canh riêng cụm này để
    // chỗ đỏ chỉ thẳng vào đây.
    for (const k of Object.keys(IDENTITY_STRINGS).filter(x => x.startsWith('identity.pair.'))) {
      const e = (IDENTITY_STRINGS as Record<string, Record<string, string>>)[k];
      for (const lang of ['vi', 'en', 'zh', 'ja']) {
        expect(`${k}.${lang}: ${(e[lang] ?? '').length > 0}`).toBe(`${k}.${lang}: true`);
      }
    }
  });
});
