/**
 * "Cây đếm ra 0 quả" phải KHÁC "không lấy được số liệu".
 *
 * Bài này viết theo câu hỏi đặt TRƯỚC khi biết nó xanh hay đỏ: *đầu vào của ca
 * này có phân biệt được hai cực không?* Ca then chốt dưới đây đặt hai cực cạnh
 * nhau trong cùng một `expect` — nếu bản vá không làm gì thì hai vế bằng nhau
 * và ca đỏ, chứ không phải "trông có vẻ đúng".
 */
import type { TreeLayoutResponse } from '../../../services/fruitReIDService';
import { treeFruitStats } from './treeFruitStats';

const layout = (
  stats: Partial<TreeLayoutResponse['stats']> | null,
  fruits: TreeLayoutResponse['fruits'] = [],
): TreeLayoutResponse =>
  ({
    tree_id: 't1',
    fruits,
    ...(stats === null ? {} : { stats: { total: 0, on_tree: 0, harvested: 0, lost: 0, named: 0, ...stats } }),
  } as unknown as TreeLayoutResponse);

describe('hai cực — máy chủ nói KHÔNG QUẢ NÀO vs app KHÔNG HỎI ĐƯỢC', () => {
  it('máy chủ trả về cây rỗng → bốn số bằng 0, tiến độ 0%', () => {
    const s = treeFruitStats(layout({ total: 0 }));
    expect(s).toEqual({ total: 0, onTree: 0, harvested: 0, lost: 0, harvestPct: 0 });
  });

  it('lượt gọi HỎNG (layout null) → bốn số là null, tiến độ null', () => {
    const s = treeFruitStats(null);
    expect(s).toEqual({
      total: null, onTree: null, harvested: null, lost: null, harvestPct: null,
    });
  });

  it('⛔ HAI CA TRÊN PHẢI KHÁC NHAU — bản cũ cho ra y hệt nhau', () => {
    const daDem = treeFruitStats(layout({ total: 0 }));
    const hong = treeFruitStats(null);
    expect(daDem).not.toEqual(hong);
    // Nói rõ chỗ khác, để ca này không xanh nhờ một khác biệt tình cờ ở đâu đó.
    expect(daDem.total).toBe(0);
    expect(hong.total).toBeNull();
    expect(daDem.harvestPct).toBe(0);
    expect(hong.harvestPct).toBeNull();
  });

  it('`0` và `null` không được lẫn nhau qua phép so sánh lỏng', () => {
    // Đây là đường mà một con số đệm đi tiếp: `so > 0` sai ở cả hai ca, nên
    // chỗ dùng phải hỏi `=== null` chứ không hỏi `> 0`.
    expect(treeFruitStats(null).total === 0).toBe(false);
    expect(treeFruitStats(layout({ total: 0 })).total === null).toBe(false);
  });

  it('lượt gọi CHƯA về (undefined) đi cùng đường với lượt hỏng', () => {
    expect(treeFruitStats(undefined)).toEqual(treeFruitStats(null));
  });
});

describe('số đo thật thì đi nguyên vẹn', () => {
  it('tin `stats` của máy chủ', () => {
    const s = treeFruitStats(layout({ total: 10, on_tree: 4, harvested: 5, lost: 1 }));
    expect(s).toEqual({ total: 10, onTree: 4, harvested: 5, lost: 1, harvestPct: 50 });
  });

  it('máy chủ KHÔNG gửi `stats` → đếm trên chính danh sách quả nó vừa gửi', () => {
    const s = treeFruitStats(
      layout(null, [
        { status: 'on_tree' }, { status: 'on_tree' },
        { status: 'harvested' },
        { status: 'lost' },
      ] as unknown as TreeLayoutResponse['fruits']),
    );
    expect(s).toEqual({ total: 4, onTree: 2, harvested: 1, lost: 1, harvestPct: 25 });
  });

  it('`stats.total = 0` là số THẬT, không bị `??` nuốt sang đếm tại chỗ', () => {
    // `stats?.total ?? fruits.length` thì `0` đi qua (`??` chỉ bắt null/undefined),
    // nhưng `stats?.total || fruits.length` thì không — ca này ghim chiều đúng.
    const s = treeFruitStats(
      layout({ total: 0 }, [{ status: 'on_tree' }] as unknown as TreeLayoutResponse['fruits']),
    );
    expect(s.total).toBe(0);
  });

  it('làm tròn phần trăm, không cắt cụt', () => {
    expect(treeFruitStats(layout({ total: 3, harvested: 2 })).harvestPct).toBe(67);
  });
});

/**
 * Luật trên phải là luật MÀN ĐANG CHẠY.
 *
 * Tách một quyết định ra thành hàm thuần rồi để màn tự dựng lại phép tính của
 * nó là cách sinh ra bài kiểm xanh trên một đường không ai đi. Bài dưới đo bằng
 * thứ duy nhất đo được từ nguồn.
 */
describe('màn chi tiết cây dùng ĐÚNG luật này', () => {
  const { readFileSync } = require('fs') as typeof import('fs');
  const { join } = require('path') as typeof import('path');
  const SRC = readFileSync(join(__dirname, 'TreeDetailScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const RUNTIME = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('gọi `treeFruitStats(layout)`', () => {
    expect(RUNTIME).toContain('treeFruitStats(layout)');
  });

  it('không còn phép đệm cũ trong mã chạy', () => {
    expect(RUNTIME).not.toContain('stats?.total ?? fruitItems.length');
    expect(RUNTIME).not.toContain("tree?.estimatedFruits ?? 0");
  });

  it('vòng tiến độ là `RingProgress` (nhận null), không phải mẹo xoay viền', () => {
    expect(RUNTIME).toContain('RingProgress');
    // `CircleProgress` nhận `pct: number` — kiểu của nó không diễn đạt nổi
    // "chưa biết", nên còn nó là còn chỗ ép về 0.
    expect(RUNTIME).not.toContain('const CircleProgress');
  });

  it('ô số hỏi `=== null`, và ô "dự kiến cả mùa" thôi dùng `> 0`', () => {
    expect(RUNTIME).toContain('o.n === null');
    expect(RUNTIME).toContain('estimatedFruits === null');
    expect(RUNTIME).not.toContain('estimatedFruits > 0');
  });

  it('đầu mục "Quả" không in `0` khi chưa biết', () => {
    expect(RUNTIME).toContain('totalFruits !== null && totalFruits > 0');
  });
});

/**
 * Quét anh em: cùng một kiểu đệm ở các ô số KHÁC trong module.
 *
 * Phạm vi của đợt vá này lấy theo NGUYÊN NHÂN, không theo triệu chứng mà issue
 * nêu — nên hai chỗ dưới đây, không nằm trong issue, vẫn phải đóng.
 */
describe('anh em cùng lỗi trong module', () => {
  const { readFileSync } = require('fs') as typeof import('fs');
  const { join } = require('path') as typeof import('path');
  const doc = (f: string) =>
    readFileSync(join(__dirname, f), 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  it('bảng chi tiết quả: "Số góc ảnh" không còn `?? 0`', () => {
    const SRC = doc('TreeDetailScreen.tsx');
    expect(SRC).not.toContain('quaDangXem?.n_views ?? 0');
    expect(SRC).toContain('quaDangXem?.n_views == null');
  });

  it('bảng thời tiết: khả năng mưa không còn bị đệm thành 0%', () => {
    const SRC = doc('DashboardScreen.tsx');
    expect(SRC).not.toContain('rainChance ?? 0');
    expect(SRC).toContain('weather.days[0]?.rainChance == null');
  });
});
