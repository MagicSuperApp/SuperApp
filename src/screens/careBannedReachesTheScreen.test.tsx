/**
 * Cảnh báo CHẤT CẤM phải tới được màn hình — cả khi lượt tra trông như một lượt
 * bình thường.
 *
 * ── Lỗ đã đo 2026-09-19 ────────────────────────────────────────────────────
 * `CareScanScreen.handleMatch` nhận câu của máy chủ bằng
 * `res.data.ambiguous ? res.data.message : null`. Nhưng `message` KHÔNG thuộc riêng
 * ca nhập nhằng: máy chủ ghép vào đó cả câu chất cấm, câu "thứ tự không đáng tin"
 * và câu "chưa tra được danh mục", xếp theo nguy hiểm giảm dần
 * (`OriLife-Core@origin/main` `care_router.py` — khối `_cau` trong `care_match`).
 * Lọc theo `ambiguous` nên vứt đúng hai câu nguy hiểm và giữ lại câu nhẹ nhất.
 *
 * Cộng thêm hai chỗ im lặng nữa ở cùng màn: trường `banned` không được khai trong
 * `CareMatchResponse` nên không nơi nào đọc, và `banned_check` — trường máy chủ
 * dựng ra để phân biệt *đã tra và sạch* với *chưa tra lần nào* — cũng không.
 *
 * ── Ca nguy hiểm nhất KHÔNG phải ca danh sách rỗng ──────────────────────────
 * Nhãn mang chất cấm mà kho vẫn khớp được một sản phẩm thì `candidates` khác rỗng,
 * `reason` vắng mặt, `ambiguous` vắng mặt. Màn cũ bày thẻ sản phẩm y như một lượt
 * tra trơn tru. Đó là ca bài "vẫn có ứng viên" dưới đây canh.
 *
 * ── Bài này KHÔNG ghim gì ──────────────────────────────────────────────────
 * Nó không chứng minh nông dân ĐỌC băng đỏ, không chứng minh màu đủ tương phản
 * ngoài nắng, và không chứng minh máy chủ thật đang trả `banned_check` (bản vá đó
 * có trên `origin/main` của kho kia; máy chủ đang chạy thì chưa đo được). Nhánh
 * fail-closed là thứ chịu được cả hai khả năng ấy, và đó là thứ bài này ghim.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { bannedCheckRan, type CareMatchResponse } from '../services/careService';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: { targetType: 'tree', targetId: 'tree-1', treeName: 'Cây 1' } }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Máy ảnh: trả thẳng một ảnh để luồng đi tiếp tới nút "Tra nhãn" — cái đang đo là
// phần SAU lượt tra, không phải phần chọn ảnh.
jest.mock('react-native-image-picker', () => ({
  launchCamera: (_o: unknown, cb: (r: unknown) => void) =>
    cb({ assets: [{ uri: 'file:///nhan.jpg' }] }),
}));
jest.mock('../services/mediaSavePermission', () => ({ withPhotoSave: async (o: unknown) => o }));
jest.mock('../utils/alert', () => ({ showError: jest.fn(), showSuccess: jest.fn() }));

// Chữ ký khớp ĐÚNG mã thật: mock lỏng hơn nguồn thì bài kiểm đi trên một hình dạng
// lời gọi không tồn tại.
const mockMatch = jest.fn(
  async (_base: string, _img: string): Promise<{ ok: boolean; data?: CareMatchResponse }> =>
    ({ ok: true, data: { ok: true, candidates: [] } }),
);
jest.mock('../services/careService', () => {
  const actual = jest.requireActual('../services/careService');
  return {
    ...actual,
    matchCareLabel: (base: string, img: string) => mockMatch(base, img),
    logCare: jest.fn(),
    getCareProducts: jest.fn(async () => ({ ok: true, data: { products: [] } })),
    getWithdrawalStatus: jest.fn(async () => ({ ok: false })),
  };
});

import CareScanScreen from './CareScanScreen';

const BANNED_SENTENCE =
  'Chữ trên bao có hoạt chất nằm trong danh mục cấm hoặc hạn chế. Không dùng, và hỏi '
  + 'cán bộ bảo vệ thực vật trước khi phun, kể cả khi bên dưới có sản phẩm trông giống.';

const BANNED_HIT = {
  id: 'paraquat',
  name: 'Paraquat',
  matched: 'paraquat dichloride',
  severity: 'banned',
};

/** Dựng màn, bấm "Chụp nhãn" rồi "Tra nhãn", trả về cây đã cập nhật. */
const runLookup = async (data: CareMatchResponse) => {
  mockMatch.mockResolvedValueOnce({ ok: true, data });
  let ui!: renderer.ReactTestRenderer;
  await act(async () => { ui = renderer.create(<CareScanScreen />); });
  const press = (id: string) => {
    const button = ui.root.findAll(n => n.props?.testID === id && !!n.props?.onPress)[0];
    if (!button) throw new Error(`Không thấy nút ${id}`);
    return act(async () => { button.props.onPress(); });
  };
  await press('care-capture');
  await press('care-match');
  return ui;
};

const hasNode = (ui: renderer.ReactTestRenderer, id: string) =>
  ui.root.findAll(n => n.props?.testID === id).length > 0;

/**
 * Gom mọi chuỗi con của một nút, theo thứ tự hiển thị.
 *
 * Không dùng `JSON.stringify(props.children)`: băng cảnh báo có một `<Icon>` đứng
 * cạnh chữ, và phần tử React mang con trỏ `_owner` vòng lại chính nó nên
 * `stringify` ném. Đi qua `children` của cây đã dựng thì chỉ còn chuỗi thật.
 */
const collect = (node: renderer.ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(collect).join('');

const textIn = (ui: renderer.ReactTestRenderer, id: string) => {
  const node = ui.root.findAll(n => n.props?.testID === id)[0];
  return node ? collect(node) : '';
};

describe('`bannedCheckRan` — so BẰNG với `ok`, không liệt kê giá trị còn lại', () => {
  it('chỉ đúng `ok` mới là đã tra', () => {
    expect(bannedCheckRan({ banned_check: 'ok' })).toBe(true);
  });

  it.each(['unavailable', 'not_run', undefined, '', 'a_state_born_later'])(
    '%s đọc thành CHƯA tra',
    value => {
      // Giá trị cuối là ca thật sự quan trọng: nó chưa tồn tại hôm nay. Bài kiểm
      // chỉ liệt kê ba giá trị đã biết thì nó xanh ở cả hai cực của phép đột biến
      // "đổi `=== ok` thành `!== unavailable`" — tức nó không đo gì.
      expect(bannedCheckRan({ banned_check: value })).toBe(false);
    },
  );
});

describe('màn nhãn thuốc — băng cảnh báo tới được nơi người dùng nhìn', () => {
  it('hiện băng đỏ NGAY CẢ KHI vẫn có ứng viên — ca nguy hiểm nhất', async () => {
    // `reason` vắng, `ambiguous` vắng, danh sách khác rỗng: với màn cũ đây là một
    // lượt tra trơn tru, và cảnh báo biến mất hoàn toàn.
    const ui = await runLookup({
      ok: true,
      candidates: [{ product_id: 'p1', name: 'Thuốc A' } as never],
      banned: [BANNED_HIT],
      banned_check: 'ok',
      message: BANNED_SENTENCE,
    });
    expect(hasNode(ui, 'care-banned-warning')).toBe(true);
    // Câu của MÁY CHỦ, nguyên văn — không diễn đạt lại thành câu chung chung.
    expect(textIn(ui, 'care-match-message')).toContain('danh mục cấm hoặc hạn chế');
    // Đã tra xong thì KHÔNG hiện băng vàng: hai băng nói hai việc khác nhau, chồng
    // lên nhau thì băng vàng dạy người đọc bỏ qua cả hai.
    expect(hasNode(ui, 'care-banned-unchecked')).toBe(false);
  });

  it('chữ khớp đi kèm hoạt chất — cảnh báo phải tra ngược được', async () => {
    const ui = await runLookup({
      ok: true,
      candidates: [{ product_id: 'p1', name: 'Thuốc A' } as never],
      banned: [BANNED_HIT],
      banned_check: 'ok',
    });
    const rendered = JSON.stringify(ui.toJSON());
    expect(rendered).toContain('Paraquat');
    expect(rendered).toContain('paraquat dichloride');
  });

  it('`banned_check` VẮNG MẶT ra băng vàng, không ra "sạch"', async () => {
    // Máy chủ đời cũ không mang trường này. Mặc định tự nhiên khi thiếu ("chắc là
    // đã tra") đúng là chiều hỏng phải chặn: màn sẽ nói "đã tra danh mục, sạch" ở
    // một lượt chưa tra chữ nào.
    const ui = await runLookup({ ok: true, candidates: [], reason: 'no_match' });
    expect(hasNode(ui, 'care-banned-unchecked')).toBe(true);
    expect(hasNode(ui, 'care-banned-warning')).toBe(false);
  });

  it('`not_run` và `unavailable` dẫn người dùng đi HAI đường khác nhau', async () => {
    const noTextRead = await runLookup({
      ok: true, candidates: [], reason: 'ocr_no_text', banned_check: 'not_run',
    });
    expect(textIn(noTextRead, 'care-banned-unchecked')).toContain('chụp lại');

    const catalogDown = await runLookup({
      ok: true, candidates: [], reason: 'no_match', banned_check: 'unavailable',
    });
    // Một bên là việc của người đang cầm máy, một bên là việc của máy chủ. Gộp lại
    // thì có người ngồi chờ một sự cố không tồn tại.
    expect(textIn(catalogDown, 'care-banned-unchecked')).toContain('máy chủ');
  });

  it('`banned_not_in_catalog` KHÔNG in ra câu "mà bản app này chưa biết"', async () => {
    // Nhánh rỗng cũ không biết mã này nên rơi vào câu dự phòng, và câu dự phòng mở
    // đầu bằng "Chưa nhận ra sản-phẩm" — một câu trấn an, cho đúng chai thuốc cấm.
    const ui = await runLookup({
      ok: true,
      candidates: [],
      reason: 'banned_not_in_catalog',
      banned: [BANNED_HIT],
      banned_check: 'ok',
      message: BANNED_SENTENCE,
    });
    const rendered = JSON.stringify(ui.toJSON());
    expect(rendered).not.toContain('mà bản app này chưa biết');
    expect(rendered).toContain('kho chỉ chứa thuốc được phép dùng');
    expect(hasNode(ui, 'care-banned-warning')).toBe(true);
  });

  it('lượt sạch và đã tra xong thì KHÔNG băng nào hiện', async () => {
    // Cực đối xứng. Thiếu nó thì một bản vá "luôn hiện băng vàng" cũng xanh hết,
    // và băng thường trực là băng không ai đọc.
    const ui = await runLookup({
      ok: true,
      candidates: [{ product_id: 'p1', name: 'Thuốc A' } as never],
      banned: [],
      banned_check: 'ok',
    });
    expect(hasNode(ui, 'care-banned-warning')).toBe(false);
    expect(hasNode(ui, 'care-banned-unchecked')).toBe(false);
  });
});
