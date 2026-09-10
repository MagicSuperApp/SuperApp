/**
 * Cổng nguồn cho chế độ `space` của `FarmShape` — ô sơ đồ 3D.
 *
 * Yêu cầu từ thực địa, gọn và cụ thể: *"animation không gian xoay theo trục, bỏ
 * đổ bóng đi, chỉ giữ lại điểm nối, đường nối, điểm cây thôi"*.
 *
 * Câu đó dễ trôi. "Chỉ giữ lại ba thứ" là một danh sách ĐÓNG, mà mọi lượt sửa
 * sau đều có xu hướng thêm vào: tô nhẹ cái mặt cho đỡ trống, dựng lại cái thành
 * cho ra khối, thêm một cái bóng cho nó "có chiều sâu". Mỗi lần đều hợp lý một
 * mình, và cộng lại thì quay về đúng thứ vừa gỡ.
 *
 * ── Ba thứ về ANIMATION, và vì sao chúng đáng một cổng ──────────────────────
 * Một vòng quay chạy mãi là thứ dễ gây hại nhất trong tệp này:
 *
 *   · Không tôn trọng `isReduceMotionEnabled` là làm người say chuyển động
 *     buồn nôn để đổi lấy một hiệu ứng trang trí.
 *   · Không dọn `clearInterval` là vòng lặp sống tiếp sau khi màn đóng — ăn CPU
 *     nền, và trên máy nông dân giữa nắng thì đó là pin.
 *   · Cộng dồn góc thay vì đọc đồng hồ làm tốc độ quay đổi theo sức máy.
 *
 * Cả ba đều KHÔNG có triệu chứng trên máy người sửa: máy khoẻ, cắm sạc, không
 * bật giảm chuyển động.
 *
 * ── Bài này đo GÌ ──────────────────────────────────────────────────────────
 * Đo MÃ NGUỒN. Nó bắt ca "ai đó gỡ chốt", KHÔNG bắt ca "chốt còn mà quay sai" —
 * ví dụ khoảng nhịp đúng nhưng góc tính lệch. Phần TOÁN của phép xoay đã có
 * `utils/farmShapeGeo.test.ts` đo thật.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, 'FarmShape.tsx'), 'utf8').replace(/\r\n/g, '\n');
const MA_CHAY = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('`space` chỉ có ba thứ: điểm nối, đường nối, điểm cây', () => {
  it('KHÔNG tô mặt phẳng', () => {
    // Mặt có tô che mất chính những chấm cây nằm phía trong, và biến khung dây
    // thành một miếng dán.
    expect(MA_CHAY).toContain("fill={khongGian ? 'none'");
    expect(MA_CHAY).toContain('fillOpacity={khongGian ? 0 ');
  });

  it('KHÔNG dựng thành — đó chính là cái bóng, chỉ khác tên', () => {
    // `duongThanh` phải bó vào ĐÚNG `iso`. Viết `khoi` (tức iso HOẶC space) là
    // thành mọc lại ở space mà không ai đổi một dòng nào trong phần vẽ.
    const i = MA_CHAY.indexOf('const duongThanh =');
    expect(i).toBeGreaterThan(-1);
    expect(MA_CHAY.slice(i, i + 120)).toContain("mode === 'iso'");
  });

  it('điểm nối và điểm cây vẫn còn', () => {
    expect(MA_CHAY).toContain(`fill={\`url(#\${quangId})\`}`);
    expect(MA_CHAY).toContain('cayTrong.map(');
  });

  it('chấm cây KHÔNG bị nâng lên ở `space`', () => {
    // `iso` nâng 3 để cây đứng trên mặt đã tô. `space` không có mặt nào để đứng
    // lên, nên nâng chỉ làm cây trôi lệch khỏi chỗ thật của nó.
    expect(MA_CHAY).toContain("cy={mode === 'iso' ? c.y - 3 : c.y}");
  });
});

describe('vòng quay phải cư xử tử tế', () => {
  const HOOK = (() => {
    const i = MA_CHAY.indexOf('function useGocXoay');
    expect(i).toBeGreaterThan(-1);
    return MA_CHAY.slice(i, MA_CHAY.indexOf('export const FarmShape'));
  })();

  it('hỏi thiết lập GIẢM CHUYỂN ĐỘNG trước khi quay', () => {
    expect(HOOK).toContain('AccessibilityInfo.isReduceMotionEnabled()');
  });

  it('dọn vòng lặp khi rời màn', () => {
    expect(HOOK).toContain('clearInterval(');
    expect(HOOK).toContain('return () => {');
  });

  it('góc suy từ ĐỒNG HỒ, không cộng dồn', () => {
    // `goc += 1` mỗi nhịp thì máy yếu quay chậm hơn máy khoẻ.
    expect(HOOK).toContain('Date.now()');
    expect(HOOK).not.toMatch(/setGoc\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\s*\+/);
  });

  it('chỉ chạy ở `space`, không chạy ở hai chế độ kia', () => {
    // Hai ô `flat`/`iso` đứng yên; bật vòng lặp cho chúng là trả giá pin cho
    // một chuyển động không ai thấy.
    expect(MA_CHAY).toContain('useGocXoay(khongGian)');
    expect(HOOK).toContain('if (!bat) return;');
  });

  it('nhịp vẽ lại được ghìm dưới 60fps', () => {
    // Mỗi khung tính lại mọi đỉnh + tối đa 60 chấm cây rồi dựng lại cây SVG,
    // trên luồng JS — cùng luồng với cuộn danh sách.
    const khop = MA_CHAY.match(/const NHIP = (\d+);/);
    expect(khop).not.toBeNull();
    expect(Number(khop![1])).toBeLessThanOrEqual(20);
  });
});

describe('chấm cây — xanh lá, nhỏ, và có ở CẢ HAI ô', () => {
  it('chấm cây khác màu khung dây, không cùng một màu', () => {
    // Khung/điểm nối/thành nói về MẢNH ĐẤT; cây là thứ sống trên đó. Cùng một
    // màu thì hai nghĩa dính vào nhau và ô cần chú giải mới đọc được.
    expect(MA_CHAY).toContain('const LA_TREN_TOI');
    expect(MA_CHAY).toContain('const LA_TREN_SANG');
    expect(MA_CHAY).toContain('fill={khongGian ? LA_TREN_TOI : LA_TREN_SANG}');

    // Phép so ÂM phải bó vào ĐÚNG khối chấm cây, không quét cả tệp: dòng tô
    // THÀNH cũng có dạng `fill={khongGian ? SANG : …}`, nên một phép so âm rộng
    // sẽ đỏ vì một dòng chẳng liên quan. Đã cắn đúng ca đó lúc viết bài này.
    //
    // Và phải khớp theo RANH GIỚI TỪ, không khớp chuỗi con: `LA_TREN_SANG` chứa
    // đúng chữ `SANG` bên trong nó, nên `not.toContain('SANG')` đỏ ngay cả khi
    // mã hoàn toàn đúng. Đây là lần thứ hai trong đợt này một phép so chuỗi con
    // bắt nhầm (lần trước: `styles.bentoBadge3D` là tiền tố của `…3DTxt`).
    const i = MA_CHAY.indexOf('cayTrong.map(');
    expect(i).toBeGreaterThan(-1);
    const khoiCay = MA_CHAY.slice(i, i + 400);
    expect(khoiCay).not.toMatch(/\bSANG\b/);
  });

  it('chấm cây phải NHỎ', () => {
    // Vườn trăm cây mà chấm to thì các chấm dính thành một mảng đặc, và ô thôi
    // nói được "trồng thưa hay dày" — mất đúng cái tin nó mang.
    const khop = MA_CHAY.match(/r=\{khongGian \? ([\d.]+) : ([\d.]+)\}/);
    expect(khop).not.toBeNull();
    expect(Number(khop![1])).toBeLessThanOrEqual(2.5);
    expect(Number(khop![2])).toBeLessThanOrEqual(2.5);
  });
});
