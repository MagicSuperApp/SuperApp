import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * "Chuyển sắc organic NHẸ NHÀNG" — biến một chữ về gu thành hai con số.
 *
 * Yêu cầu ban đầu là một câu tiếng Việt: *"thiết kế có thể có chút gradient
 * organic nhẹ nhàng"*. Câu đó không tự bảo vệ được. Sáu tháng nữa ai đó thấy
 * màn hơi nhạt, kéo chặng dưới đậm thêm một chút, rồi thêm chút nữa — mỗi lần
 * đều "chỉ một chút", không lần nào có gì đỏ, và tới lúc người ta nhận ra thì
 * nền đã ăn mất chữ ngoài nắng.
 *
 * Bài này ghim hai điều, cả hai đều ĐO ĐƯỢC:
 *
 *   1. NHẸ = hai chặng của một chuyển sắc phải gần nhau. Ngưỡng 1,5 lần tỉ số
 *      tương phản. Sáu token hiện tại nằm trong khoảng 1,04–1,39, nên ngưỡng này
 *      không phải một con số vừa khít — nó còn chỗ cho một token mới hợp lệ, mà
 *      vẫn chặn được một chuyển sắc "từ trắng xuống xanh đậm".
 *
 *   2. onDark KHÔNG ĐƯỢC NÓI DỐI. `onDark` là thứ nơi dùng tin để chọn màu chữ
 *      (xem `BentoTile`). Khai sai một chữ ở đây là chữ trắng trên nền trắng —
 *      ở CHỖ TỆ NHẤT của nền, không phải trung bình.
 *
 * ── Vì sao đo ở CHẶNG tệ nhất chứ không đo trung bình ───────────────────────
 * Nền chuyển sắc có chỗ sáng chỗ tối, chữ thì một màu. Người đọc không đọc
 * trung bình — họ đọc từng chữ cái, và chữ cái nằm ở chỗ tệ nhất là chữ cái mất
 * trước. Nên chữ SÁNG đo trên chặng SÁNG nhất, chữ TỐI đo trên chặng TỐI nhất.
 *
 * Ngưỡng 4,5:1 là mức AA của WCAG cho chữ cỡ thường. Chọn mức cho chữ NHỎ chứ
 * không chọn mức nới cho chữ lớn (3:1), vì nhãn trong ô Bento là chữ nhỏ, và
 * người dùng là nhà vườn trên 40 tuổi cầm máy giữa nắng.
 */

import { GRADIENT, NATURE, type GradientToken } from './depth';

/** sRGB một kênh → tuyến tính. Công thức WCAG 2.x. */
const kenh = (v: number): number => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Độ sáng tương đối của một màu `#rrggbb`. */
const doSang = (hex: string): number => {
  const h = hex.replace('#', '');
  // Ghi rõ vì đây là chỗ một token viết tắt `#fff` sẽ lọt qua mà ra số sai:
  // bài kiểm ngay dưới chặn hình dạng trước, nên hàm này chỉ nhận 6 ký tự.
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * kenh(r) + 0.7152 * kenh(g) + 0.0722 * kenh(b);
};

/** Tỉ số tương phản giữa hai màu, 1 (giống hệt) … 21 (đen trên trắng). */
const tuongPhan = (a: string, b: string): number => {
  const la = doSang(a);
  const lb = doSang(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const cacToken = Object.entries(GRADIENT) as Array<[string, GradientToken]>;

describe('token chuyển sắc — hình dạng', () => {
  it.each(cacToken)('`%s` có đủ bốn phần và màu đúng dạng #rrggbb', (_ten, g) => {
    // 6 ký tự, không chấp nhận `#fff`: `doSang` cắt theo vị trí nên bản viết tắt
    // ra một con số sai mà không ném — sai im lặng ngay trong chính phép đo.
    expect(g.from).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(g.to).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(Number.isFinite(g.angle)).toBe(true);
    expect(typeof g.onDark).toBe('boolean');
  });
});

describe('NHẸ là một con số, không phải một cảm giác', () => {
  it.each(cacToken)('`%s` — hai chặng lệch nhau dưới 1,5 lần', (_ten, g) => {
    expect(tuongPhan(g.from, g.to)).toBeLessThanOrEqual(1.5);
  });
});

describe('`onDark` phải khớp độ sáng THẬT của token', () => {
  // Chữ sáng và chữ tối mà nơi dùng thật sự vẽ ra (xem `BentoStat`).
  const CHU_SANG = NATURE.paper;
  const CHU_TOI = NATURE.bark;

  it.each(cacToken)('`%s` — chữ theo `onDark` đọc được ở chặng TỆ NHẤT', (_ten, g) => {
    const sangNhat = doSang(g.from) >= doSang(g.to) ? g.from : g.to;
    const toiNhat = doSang(g.from) < doSang(g.to) ? g.from : g.to;

    if (g.onDark) {
      // Chữ trắng: chỗ tệ nhất là chặng SÁNG nhất của nền.
      expect(tuongPhan(CHU_SANG, sangNhat)).toBeGreaterThanOrEqual(4.5);
    } else {
      // Chữ tối: chỗ tệ nhất là chặng TỐI nhất của nền.
      expect(tuongPhan(CHU_TOI, toiNhat)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('phép đo này có thật sự bắt được lỗi không', () => {
    // Đối chứng cho chính bài trên. Không có ca này thì một hàm `tuongPhan` luôn
    // trả 21 vẫn cho toàn bộ bài trên xanh, và cổng thành đồ trang trí.
    //
    // Ca đúng thứ sẽ xảy ra ngoài đời: ai đó thêm một token nền tối rồi quên đặt
    // `onDark`, nên nơi dùng vẽ chữ tối lên nó.
    const khaiSai: GradientToken = { from: '#166e43', to: '#11563a', angle: 135, onDark: false };
    const toiNhat = doSang(khaiSai.from) < doSang(khaiSai.to) ? khaiSai.from : khaiSai.to;
    expect(tuongPhan(NATURE.bark, toiNhat)).toBeLessThan(4.5);
  });
});

/**
 * Mỗi lớp chuyển sắc phải có `id` RIÊNG — cổng nguồn.
 *
 * ⛔ Lỗi thật, báo từ thực địa sau lượt dựng đầu: nút "Cập nhật hoạt động" nửa
 *    trên xanh lá nửa dưới xanh dương; "Chỉ đường tới vườn" có một mảng xanh
 *    dương nhạt ở đỉnh. Đó là hình dạng của hai chuyển sắc chồng lệch nhau, chứ
 *    không phải một chuyển sắc chảy đều.
 *
 * Gốc rễ: `id` đặt theo TÊN TOKEN (`grad-action`), tức mọi ô cùng `tone` dùng
 * chung một id — và `react-native-svg` giữ sổ id CHUNG cho cả ứng dụng, không
 * theo từng thẻ `<Svg>`. Lớp gắn sau ghi đè lớp trước, nên `url(#grad-action)`
 * của nút này đi lấy hình học của một ô khác.
 *
 * Chua nhất: chú thích ở bản đầu đã viết ĐÚNG lý do ("hai lớp trùng id thì lớp
 * sau lấy nhầm màu của lớp trước") rồi mã ngay dưới vẫn làm sai. Một câu chú
 * thích đúng không chặn được gì — nên nay có bài kiểm.
 *
 * ⚠ Đây là phép đọc MÃ NGUỒN, không phải phép dựng thật. Nó bắt ca "ai đó rút
 * `id` về lại tên token", KHÔNG bắt ca "`useId` còn đó mà react-native-svg vẫn
 * trộn". Phép đo cuối cho ca sau là mở màn thật và nhìn nút.
 */
describe('lớp chuyển sắc — `id` phải riêng theo từng lượt dựng', () => {
  const NGUON = readFileSync(
    join(__dirname, '..', 'components', 'layered', 'Organic.tsx'),
    'utf8',
  ).replace(/\r\n/g, '\n');

  const MA_CHAY = NGUON.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('`id` dựng từ `useId()`, không phải từ tên token', () => {
    expect(MA_CHAY).toContain('React.useId()');
    // Đúng dòng đã gây ra lỗi. Có lại nó là quay về nguyên trạng.
    expect(MA_CHAY).not.toContain('const id = `grad-${name}`');
  });

  it('toạ độ chuyển sắc là SỐ, không phải chuỗi phần trăm', () => {
    // ⛔ Đây là nguyên nhân THẬT của "nút có hai mảng màu", và nó sống qua được
    // một lượt vá vì lượt đó sửa `id` — một lỗi có thật, nhưng lỗi khác.
    //
    // `gradientUnits` mặc định là `objectBoundingBox`: x1/y1/x2/y2 là phân số
    // 0..1 của hộp bao. Truyền `"14.6%"` thì `react-native-svg` đọc thành 14,6
    // ĐƠN VỊ NGƯỜI DÙNG — gấp hơn mười bốn lần hộp bao, nên cả đoạn chuyển màu
    // nén vào một dải mỏng ở mép và phần còn lại phẳng lì.
    expect(MA_CHAY).toContain('x1={0.5 - dx / 2}');
    expect(MA_CHAY).toContain('y2={0.5 + dy / 2}');
    expect(MA_CHAY).not.toMatch(/x1=\{`\$\{[^}]*\}%`\}/);
    expect(MA_CHAY).not.toContain("%`}");
  });

  it('ký tự lạ của `useId` bị lọc trước khi vào `url(#…)`', () => {
    // `useId()` trả dạng `:r3:`; dấu hai chấm trong `url(#…)` là cú pháp khác,
    // nên thiếu phép lọc thì id hợp lệ về mặt React mà vô nghĩa với SVG.
    expect(MA_CHAY).toMatch(/useId\(\)\.replace\(/);
  });
});

/**
 * MỌI màn trace phải đi qua lớp nền chung.
 *
 * ⛔ Đã trượt một lần, và trượt đúng kiểu đã được cảnh báo trước. Chuyển sắc cắm
 *    vào `GroundBackdrop` để một chỗ sửa là cả module đổi màu. `TraceNewsScreen`
 *    tự dựng nền riêng (`<View style={styles.root}>` với một màu phẳng) nên nó
 *    KHÔNG đi qua lớp đó — mọi màn khác đổi nền, còn nó ở lại nền phẳng. Hai
 *    loại nền cùng lúc trong một module, không lệnh nào báo.
 *
 * Cổng này không đo màu; nó đo DÂY NỐI. Màn nào không nối vào lớp chung thì
 * ngày mai lớp chung đổi gì, màn đó cũng không nhận.
 */
describe('nền chung — không màn nào được đứng ngoài', () => {
  const THU_MUC = join(__dirname, '..', 'screens');

  it('mọi màn trong `screens/` đều dựng `GroundBackdrop` (thẳng hoặc qua `Ground`)', () => {
    const { readdirSync } = require('fs') as typeof import('fs');
    const dungNgoai: string[] = [];
    for (const ten of readdirSync(THU_MUC)) {
      if (!ten.endsWith('.tsx') || ten.includes('.test.')) continue;
      // `*Tab.tsx` KHÔNG phải màn — nó vẽ BÊN TRONG một màn đã có nền rồi. Bắt
      // nó tự dựng nền là bắt nó vẽ chồng lớp nền thứ hai lên lớp thứ nhất:
      // chuyển sắc đè chuyển sắc, và mép trên đậm gấp đôi. Loại ra ở đây theo
      // TÊN chứ không theo danh sách cứng, để tab thêm sau tự được loại đúng.
      if (ten.endsWith('Tab.tsx')) continue;
      const src = readFileSync(join(THU_MUC, ten), 'utf8');
      // `<Ground>` bọc sẵn `GroundBackdrop` bên trong, nên nối kiểu nào cũng được.
      if (!src.includes('<GroundBackdrop') && !src.includes('<Ground')) {
        dungNgoai.push(ten);
      }
    }
    expect(dungNgoai).toEqual([]);
  });
});
