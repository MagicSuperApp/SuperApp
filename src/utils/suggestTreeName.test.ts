import { suggestTreeName } from './suggestTreeName';

describe('suggestTreeName', () => {
  it('vườn trống → Cây 1', () => {
    expect(suggestTreeName([])).toBe('Cây 1');
  });

  it('tên tự đặt, không đánh số → đếm rồi +1', () => {
    expect(suggestTreeName(['Mít số 3', 'Xoài đầu vườn'])).toBe('Cây 3');
  });

  it('lấy mốc là SỐ LỚN NHẤT đang dùng, không phải số lượng cây', () => {
    expect(suggestTreeName(['Cây 1', 'Cây 5'])).toBe('Cây 6');
  });

  it('KHÔNG trả về tên đã có — kể cả khi mốc rơi trúng chỗ đã dùng', () => {
    // 3 tên → mốc 3 → thử "Cây 4" (đã có) → "Cây 5".
    expect(suggestTreeName(['Mít', 'Cây 4', 'Xoài'])).toBe('Cây 5');
  });

  it('bỏ qua tên rỗng / null, không tính vào số lượng', () => {
    expect(suggestTreeName(['Cây 1', null, '  ', undefined])).toBe('Cây 2');
  });

  it('không khớp nhầm "Cây 12 góc" thành số 12', () => {
    expect(suggestTreeName(['Cây 12 góc'])).toBe('Cây 2');
  });

  it('so khớp KHÔNG phân biệt hoa thường — "cây 3" vẫn là số 3', () => {
    expect(suggestTreeName(['cây 3'])).toBe('Cây 4');
  });

  it('đổi tiền tố được (để nơi gọi dịch)', () => {
    expect(suggestTreeName(['Tree 2'], 'Tree')).toBe('Tree 3');
  });
});
