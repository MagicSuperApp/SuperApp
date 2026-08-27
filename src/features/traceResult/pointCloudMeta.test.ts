import { pointCloudMeta } from './pointCloudMeta';

describe('pointCloudMeta — chỉ đọc được tệp mới được khẳng định phép đo', () => {
  it('đọc được tệp: dùng số ĐẾM được, không dùng số máy chủ khai', () => {
    const m = pointCloudMeta({ state: 'ok', readCount: 496, declared: 2048 });
    expect(m.measuredPoints).toBe(496);
    expect(m.declaredPoints).toBeNull();
  });

  it('KHÔNG đọc được tệp: không còn số nào mang nhãn ĐO', () => {
    // Đây là lỗi đang vá. Bản cũ trả về 2048 ở đúng ô "điểm dựng từ ảnh chụp
    // thật" cho một tệp không mở được.
    const m = pointCloudMeta({ state: 'failed', declared: 2048 });
    expect(m.measuredPoints).toBeNull();
    expect(m.declaredPoints).toBe(2048);
  });

  it('KHÔNG đọc được tệp: câu độ phủ của máy chủ im', () => {
    // "Đám mây đủ dày" in dưới một ô báo hỏng là hai câu chọi nhau, và người đọc
    // tin câu trấn an.
    const m = pointCloudMeta({
      state: 'failed', declared: 2048, advice: 'Đám mây điểm đủ dày để dựng.',
    });
    expect(m.advice).toBeNull();
  });

  it('đọc được tệp: câu độ phủ hiện nguyên văn, không soạn lại', () => {
    const m = pointCloudMeta({
      state: 'ok', readCount: 10, advice: '  Mới chụp ~60° (một phía cây).  ',
    });
    expect(m.advice).toBe('Mới chụp ~60° (một phía cây).');
  });

  it('đang tải: không khẳng định gì, kể cả số máy chủ khai', () => {
    const m = pointCloudMeta({ state: 'loading', declared: 2048, advice: 'x' });
    expect(m).toEqual({
      measuredPoints: null, declaredPoints: null, advice: null, lowConfidence: false,
    });
  });

  it('tệp đọc được nhưng RỖNG: 0 là một phép đo thật, không phải "không có"', () => {
    const m = pointCloudMeta({ state: 'ok', readCount: 0, declared: 2048 });
    expect(m.measuredPoints).toBe(0);
    expect(m.declaredPoints).toBeNull();
  });

  describe('low_confidence — đọc khi có, không suy khi vắng', () => {
    it('máy chủ khai thưa ⇒ true', () => {
      expect(pointCloudMeta({ state: 'ok', readCount: 5, lowConfidence: true }).lowConfidence)
        .toBe(true);
    });

    it('máy chủ khai KHÔNG thưa ⇒ false', () => {
      expect(pointCloudMeta({ state: 'ok', readCount: 5, lowConfidence: false }).lowConfidence)
        .toBe(false);
    });

    it('máy chủ bản cũ KHÔNG nói ⇒ false, và đó là "chưa biết", không phải "đáng tin"', () => {
      expect(pointCloudMeta({ state: 'ok', readCount: 5 }).lowConfidence).toBe(false);
    });

    it('chưa đọc được tệp thì KHÔNG chồng thêm cảnh báo thưa', () => {
      expect(pointCloudMeta({ state: 'failed', declared: 9, lowConfidence: true }).lowConfidence)
        .toBe(false);
    });
  });

  describe('số rác từ máy chủ không thành số điểm', () => {
    it.each([
      ['âm', -1],
      ['NaN', Number.NaN],
      ['vô cực', Number.POSITIVE_INFINITY],
    ])('%s ⇒ null', (_tên, v) => {
      expect(pointCloudMeta({ state: 'failed', declared: v as number }).declaredPoints).toBeNull();
    });

    it('số lẻ ⇒ cắt phần thập phân', () => {
      expect(pointCloudMeta({ state: 'failed', declared: 12.9 }).declaredPoints).toBe(12);
    });

    it('trường vắng ⇒ null', () => {
      expect(pointCloudMeta({ state: 'failed' }).declaredPoints).toBeNull();
    });
  });
});

// ── Cổng chặn tái phát ───────────────────────────────────────────────────────
// Mọi bài trên đều kiểm hàm THUẦN. Nhưng lỗi đang vá nằm ở chỗ GỌI: một dòng
// `?? declaredPoints` trong `TreePointCloudView.tsx`. Gỡ hàm này ra rồi viết lại
// dòng cũ thì 15 bài trên vẫn xanh y nguyên — chúng không hề chạm màn hình, mà
// màn hình mới là nơi người dùng đọc con số. Bài dưới quét mã nguồn, theo đúng
// nếp `cardanoNetwork.test.ts` đã dựng trong kho này.
describe('TreePointCloudView phải đi qua pointCloudMeta', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, 'TreePointCloudView.tsx'), 'utf8',
  ) as string;

  it('có gọi pointCloudMeta', () => {
    expect(src).toContain('pointCloudMeta(');
  });

  it('KHÔNG còn nhánh dự phòng lấy số máy chủ khai làm số đo', () => {
    // Đúng hình dạng của dòng cũ: `... : (declaredPoints ?? null)`.
    expect(src).not.toMatch(/declaredPoints\s*\?\?/);
  });

  it('KHÔNG dựng tỉ lệ n_points / n_points_scene', () => {
    // OriLife khai `n_points_scene` có thể là `null` = KHÔNG BIẾT, và làn cây
    // không đo số này lần nào ⇒ tỉ lệ luôn ra 1,00 "tách nền hoàn hảo".
    expect(src).not.toContain('n_points_scene');
  });

  it('câu số điểm đi qua lớp dịch, không nối chuỗi mẫu', () => {
    expect(src).toContain("tf('{n} điểm dựng từ ảnh chụp thật'");
    expect(src).not.toMatch(/`\$\{[^}]*\}\s*điểm dựng từ ảnh chụp thật`/);
  });
});
