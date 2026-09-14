/**
 * Ô nhập "Đã dùng gì" — lời hứa trên thẻ bón phân/xịt thuốc nay có gì đỡ.
 *
 * Trước bản này `handleSave` gửi `materials: []` CỨNG, trong khi `fertilizingDesc`
 * đã hứa "Ghi loại phân và lượng bón" và cả hai đầu còn lại của đường dây đã xong
 * từ lâu: `syncDispatch.ts` gửi `materials` lên máy chủ, `timelineView.materialNames`
 * đọc ngược ra để vẽ. Thiếu đúng ô nhập ở giữa.
 *
 * Phép thử lúc VIẾT từng ca (Forall §Kỷ luật phát ngôn #6): *"đầu vào của ca này có
 * phân biệt được hai bên đột biến không?"* — nên mỗi luật đều có ca ĐẠT lẫn ca
 * KHÔNG ĐẠT, và cổng ở phần hai đo bằng cách đối chiếu nguồn chứ không đọc lại
 * chính hằng số mình vừa khai.
 */
import fs from 'fs';
import path from 'path';
import { cleanMaterialRows } from './ActivityScreen';

const SRC = fs.readFileSync(path.join(__dirname, 'ActivityScreen.tsx'), 'utf8');

describe('cleanMaterialRows — lọc dòng gõ dở', () => {
  it('dòng trống hoàn toàn thì BỎ', () => {
    expect(cleanMaterialRows([{ name: '', amount: '', unit: '' }])).toEqual([]);
    expect(cleanMaterialRows([{ name: '   ', amount: ' ', unit: '' }])).toEqual([]);
  });

  it('chỉ có TÊN vẫn gửi — lượng không bắt buộc', () => {
    expect(cleanMaterialRows([{ name: 'NPK 16-16-8', amount: '', unit: '' }]))
      .toEqual([{ name: 'NPK 16-16-8' }]);
  });

  it('có lượng mà KHÔNG có tên thì BỎ cả dòng', () => {
    // "5 kg" của cái gì? Gửi lên là gửi một mẩu rác không gỡ ra được về sau.
    expect(cleanMaterialRows([{ name: '  ', amount: '5', unit: 'kg' }])).toEqual([]);
  });

  it('đủ ba ô thì giữ cả ba, đã cắt khoảng trắng', () => {
    expect(cleanMaterialRows([{ name: ' Vôi bột ', amount: ' 5 ', unit: ' kg ' }]))
      .toEqual([{ name: 'Vôi bột', amount: '5', unit: 'kg' }]);
  });

  it('đơn vị KHÔNG đi một mình khi thiếu lượng', () => {
    // "kg" đứng trơ không đọc được thành gì, và nó sẽ nằm trong sổ như một giá trị
    // người ta đã điền.
    expect(cleanMaterialRows([{ name: 'Vôi', amount: '', unit: 'kg' }]))
      .toEqual([{ name: 'Vôi' }]);
  });

  it('KHÔNG gửi chuỗi rỗng — trường thiếu thì vắng mặt hẳn', () => {
    const [m] = cleanMaterialRows([{ name: 'Đạm', amount: '', unit: '' }]);
    expect(Object.prototype.hasOwnProperty.call(m, 'amount')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(m, 'unit')).toBe(false);
  });

  it('nhiều dòng: giữ dòng đủ, bỏ dòng dở, giữ nguyên thứ tự', () => {
    expect(cleanMaterialRows([
      { name: 'NPK', amount: '2', unit: 'bao' },
      { name: '', amount: '9', unit: 'kg' },
      { name: 'Vôi', amount: '', unit: '' },
    ])).toEqual([{ name: 'NPK', amount: '2', unit: 'bao' }, { name: 'Vôi' }]);
  });
});

describe('cổng: ô nhập phải thật sự nối vào đường gửi', () => {
  it('`materials` KHÔNG còn là mảng rỗng gõ cứng', () => {
    // Đây là dòng đã đứng suốt thời gian lời hứa trên thẻ không có gì đỡ.
    expect(SRC).not.toMatch(/materials:\s*\[\]\s*,\s*\n/);
    expect(SRC).toContain('materials: needsMaterials ? cleanMaterials : []');
  });

  it('nút Lưu hỏi thêm `materialsReady`', () => {
    // Nút sáng mà gửi rỗng thì lần ghi đó "thành công" và dòng thời gian im lặng
    // thiếu mất phần người mua quả cần đọc.
    expect(SRC).toMatch(/const canSave = .*materialsReady/);
  });

  it('nút tắt thì PHẢI có câu nói vì sao', () => {
    expect(SRC).toContain("tk('trace.activity.needMaterial')");
  });

  it('chỉ hỏi ở hai việc CÓ vật tư', () => {
    expect(SRC).toMatch(/MATERIAL_ACTIVITIES = new Set\(\['fertilizing', 'pesticide'\]\)/);
    expect(SRC).toContain('MATERIAL_ACTIVITIES.has(selected)');
  });

  it('mọi chữ trên màn đều đi qua khoá i18n, không có câu tiếng Việt gõ thẳng', () => {
    for (const key of [
      'trace.activity.materials',
      'trace.activity.materialName',
      'trace.activity.materialAmount',
      'trace.activity.materialUnit',
      'trace.activity.addMaterial',
      'trace.activity.removeMaterial',
      'trace.activity.materialsHintFert',
      'trace.activity.materialsHintPest',
    ]) {
      expect(SRC).toContain(`'${key}'`);
    }
  });
});

describe('cổng: khoá i18n vừa khai phải có ĐỦ bốn thứ tiếng', () => {
  // Bảng chữ là nơi một khoá thiếu tiếng lặng lẽ rơi về khoá trần trên màn của
  // người đọc tiếng khác — không ném, không log.
  const KEYS = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'i18n', 'keys', 'trace.ts'), 'utf8');

  it.each([
    'trace.activity.materials',
    'trace.activity.materialsHintFert',
    'trace.activity.materialsHintPest',
    'trace.activity.materialName',
    'trace.activity.materialAmount',
    'trace.activity.materialUnit',
    'trace.activity.addMaterial',
    'trace.activity.removeMaterial',
    'trace.activity.needMaterial',
  ])('%s có vi/en/zh/ja', (key) => {
    const i = KEYS.indexOf(`'${key}'`);
    expect(i).toBeGreaterThan(-1);
    // Lấy đúng khối khai của khoá này: từ chỗ nó bắt đầu tới dấu `},` hoặc hết dòng.
    const block = KEYS.slice(i, i + 600);
    const end = block.indexOf("\n  '");
    const decl = end > 0 ? block.slice(0, end) : block;
    for (const lang of ['vi:', 'en:', 'zh:', 'ja:']) {
      expect(decl).toContain(lang);
    }
  });
});
