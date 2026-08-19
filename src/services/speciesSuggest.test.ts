/**
 * Mẫu thử lấy NGUYÊN VĂN từ hợp đồng OriLife gửi 19/08/2026 (máy chủ `9299637`).
 * Chép nguyên hình dạng thật là cách duy nhất chặn được lỗi vừa xảy ra với
 * `pick` ở `fruit/lookup`: mẫu thử tự soạn lỏng hơn máy chủ nên test xanh suốt
 * thời gian sản phẩm hỏng ngoài vườn.
 */
import {
  parseSpeciesSuggest,
  orderSpeciesForConfirm,
} from './speciesSuggest';

const fromContract = {
  species: 'durio_zibethinus',
  confidence: 0.83,
  confident: false,
  support_thin: true,
  source: 'model',
  ranked: [
    { species: 'durio_zibethinus', confidence: 0.83 },
    { species: 'mangifera_indica', confidence: 0.11 },
  ],
};

/** Bốn mã của `GET /api/species/catalog`, đúng thứ tự máy chủ trả. */
const CATALOG = [
  'artocarpus_heterophyllus',
  'mangifera_indica',
  'durio_zibethinus',
  'plumeria_spp',
];

describe('parseSpeciesSuggest', () => {
  it('đọc đúng khối trong hợp đồng', () => {
    const s = parseSpeciesSuggest(fromContract);
    expect(s).toEqual({
      species: 'durio_zibethinus',
      confidence: 0.83,
      confident: false,
      supportThin: true,
      source: 'model',
      ranked: [
        { species: 'durio_zibethinus', confidence: 0.83 },
        { species: 'mangifera_indica', confidence: 0.11 },
      ],
    });
  });

  it('VẮNG khối = máy không đoán ra, trả null chứ không ném', () => {
    expect(parseSpeciesSuggest(undefined)).toBeNull();
    expect(parseSpeciesSuggest(null)).toBeNull();
    expect(parseSpeciesSuggest({})).toBeNull();
  });

  it('điểm cao KHÔNG tự thành `confident` — đây là chỗ dễ đọc nhầm nhất', () => {
    const s = parseSpeciesSuggest({ ...fromContract, confidence: 0.99 });
    expect(s?.confidence).toBe(0.99);
    expect(s?.confident).toBe(false);
  });

  it('`confident` chỉ nhận `true` thật, không nhận chuỗi hay số', () => {
    expect(parseSpeciesSuggest({ ...fromContract, confident: 'true' })?.confident).toBe(false);
    expect(parseSpeciesSuggest({ ...fromContract, confident: 1 })?.confident).toBe(false);
    expect(parseSpeciesSuggest({ ...fromContract, confident: true })?.confident).toBe(true);
  });

  it('thiếu `species` thì cả khối vô nghĩa', () => {
    expect(parseSpeciesSuggest({ ...fromContract, species: '' })).toBeNull();
    expect(parseSpeciesSuggest({ ...fromContract, species: 42 })).toBeNull();
  });

  it('`confidence` ngoài dải [0..1] bị bỏ, phần còn lại vẫn dùng được', () => {
    const s = parseSpeciesSuggest({ ...fromContract, confidence: 83 });
    expect(s?.confidence).toBeNull();
    expect(s?.species).toBe('durio_zibethinus');
  });

  it('mục hỏng trong `ranked` bị bỏ, không kéo sập cả khối', () => {
    const s = parseSpeciesSuggest({
      ...fromContract,
      ranked: [{ species: 'durio_zibethinus', confidence: 0.83 }, null, { confidence: 0.1 }, 'x'],
    });
    expect(s?.ranked).toEqual([{ species: 'durio_zibethinus', confidence: 0.83 }]);
  });

  it('`ranked` không phải mảng thì coi như rỗng', () => {
    expect(parseSpeciesSuggest({ ...fromContract, ranked: 'nhiều' })?.ranked).toEqual([]);
  });
});

describe('orderSpeciesForConfirm', () => {
  it('đoán của máy lên đầu, phần còn lại giữ thứ tự danh mục', () => {
    const s = parseSpeciesSuggest(fromContract);
    expect(orderSpeciesForConfirm(CATALOG, s)).toEqual([
      'durio_zibethinus',
      'artocarpus_heterophyllus',
      'mangifera_indica',
      'plumeria_spp',
    ]);
  });

  it('không có đoán thì giữ NGUYÊN danh mục — đường cũ không đổi', () => {
    expect(orderSpeciesForConfirm(CATALOG, null)).toEqual(CATALOG);
  });

  it('máy đoán loài KHÔNG có trong danh mục: không tự thêm ô trống', () => {
    const s = parseSpeciesSuggest({ ...fromContract, species: 'ficus_benjamina' });
    expect(orderSpeciesForConfirm(CATALOG, s)).toEqual(CATALOG);
  });

  it('không nhân đôi mã dù đoán trùng mục đầu danh mục', () => {
    const s = parseSpeciesSuggest({ ...fromContract, species: 'artocarpus_heterophyllus' });
    const out = orderSpeciesForConfirm(CATALOG, s);
    expect(out).toHaveLength(CATALOG.length);
    expect(new Set(out).size).toBe(CATALOG.length);
    expect(out[0]).toBe('artocarpus_heterophyllus');
  });
});
