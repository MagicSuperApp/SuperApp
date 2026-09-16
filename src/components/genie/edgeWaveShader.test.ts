// components/genie/edgeWaveShader.test.ts
//
// Soi CHUỖI SHADER ĐÃ DỰNG — không soi mã nguồn.
//
// ── VÌ SAO BỘ KIỂM NÀY TỒN TẠI ──────────────────────────────────────────────
// Đã trả giá đúng một lần: thêm tham số `phase` vào `ribbonAt` mà quên sửa hai
// chỗ gọi. Với TypeScript thì cả khối shader chỉ là một chuỗi, nên `tsc` KHÔNG
// thấy gì; bài kiểm soi mã nguồn bằng regex cũng không thấy. Lỗi chỉ nổ lúc
// `compileShader` trên máy thật — và vì `GLErrorBoundary` bắt nó nên app không
// sập: nó lặng lẽ rơi về bản dự phòng, người ta tưởng máy mình yếu.
//
// Nhờ `edgeWaveShader.ts` tách khỏi `expo-gl`, bài kiểm nạp được chuỗi thật và
// đếm được. Đây không phải trình biên dịch GLSL, nhưng nó bắt đúng lớp lỗi hay
// gặp nhất khi sinh mã bằng nội suy chuỗi: **lệch số đối số** và **thiếu khai**.

import { FRAG, VERT } from './edgeWaveShader';
import {
  RIBBONS,
  EDGE_NAMES,
  EDGE_REGIONS,
  CENTER_WAVES,
  COILS,
  coilCycles,
} from './edgeWaveMath';

/** Cắt chú thích GLSL để đếm cho đúng. */
const ma = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const FRAG_MA = ma(FRAG);

/** Tách đối số ở cấp ngoài cùng — không cắt nhầm dấu phẩy trong ngoặc lồng. */
function cheDoiSo(s: string): string[] {
  const out: string[] = [];
  let sau = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') sau += 1;
    if (ch === ')') sau -= 1;
    if (ch === ',' && sau === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Mọi lời gọi `ten(...)` ở dạng đã cắt chú thích. */
function loiGoi(src: string, ten: string): string[][] {
  const out: string[][] = [];
  // Bắt cả từ đứng trước để LOẠI lời khai: `float ribbonAt(` cũng khớp mẫu, và
  // đếm nó vào số lời gọi thì bài kiểm luôn lệch đúng 1 — một bài kiểm lệch đều
  // đặn là một bài kiểm sẽ bị nới cho khỏi phiền.
  const re = new RegExp(`(\\w+)?\\s*\\b${ten}\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(src)) !== null) {
    if ((m[1] || '').trim() === 'float') continue; // lời khai, không phải lời gọi
    let i = m.index + m[0].length;
    let sau = 1;
    const bat = i;
    while (i < src.length && sau > 0) {
      if (src[i] === '(') sau += 1;
      if (src[i] === ')') sau -= 1;
      i += 1;
    }
    out.push(cheDoiSo(src.slice(bat, i - 1)));
  }
  return out;
}

/** Số tham số ở lời khai `float ten(...)`. */
function soThamSo(src: string, ten: string): number {
  const m = src.match(new RegExp(`float\\s+${ten}\\s*\\(([^)]*)\\)`));
  if (!m) throw new Error(`không tìm thấy lời khai ${ten}`);
  return cheDoiSo(m[1]).length;
}

describe('shader — chuỗi dựng ra phải mạch lạc', () => {
  it('dựng được, không rỗng, và có hàm main', () => {
    expect(FRAG.length).toBeGreaterThan(400);
    expect(VERT).toMatch(/void main\(\)/);
    expect(FRAG_MA).toMatch(/void main\(\)/);
  });

  it('mọi lời gọi `ribbonAt` khớp số tham số của lời khai', () => {
    // ĐÂY là bài kiểm cho lỗi đã xảy ra. Lời khai có 8 tham số
    // (xn, yn, phase + 5 tham số dải); chỗ gọi từng chỉ truyền 7.
    const khai = soThamSo(FRAG_MA, 'ribbonAt');
    expect(khai).toBe(8);

    const goi = loiGoi(FRAG_MA, 'ribbonAt');
    // Hai cạnh dọc × số dải.
    expect(goi.length).toBe(RIBBONS.length * 2);
    for (const g of goi) expect(g.length).toBe(khai);
  });

  it('mỗi cạnh có HÀM SÓNG RIÊNG, và hàm đó được gọi đúng một lần', () => {
    // Spec §6: mỗi cạnh chia thành các vùng độc lập ⇒ mỗi cạnh một bảng vùng
    // riêng ⇒ một hàm riêng. Thiếu một hàm nghĩa là một cạnh đang mượn nhịp của
    // cạnh khác, và cả viền lại thở chung.
    for (const e of EDGE_NAMES) {
      const fn = `wave${e[0].toUpperCase()}${e.slice(1)}`;
      expect(soThamSo(FRAG_MA, fn)).toBe(1);
      expect(loiGoi(FRAG_MA, fn)).toHaveLength(1);
    }
  });

  it('mọi lời gọi `widthOf` khớp lời khai', () => {
    const khai = soThamSo(FRAG_MA, 'widthOf');
    const goi = loiGoi(FRAG_MA, 'widthOf');
    expect(goi).toHaveLength(4); // bốn cạnh
    for (const g of goi) expect(g.length).toBe(khai);
  });

  it('mỗi hàm sóng cộng đủ số VÙNG của cạnh đó', () => {
    for (const e of EDGE_NAMES) {
      const fn = `wave${e[0].toUpperCase()}${e.slice(1)}`;
      const than = FRAG_MA.slice(FRAG_MA.indexOf(`float ${fn}(`));
      const body = than.slice(0, than.indexOf('\n}'));
      const soCong = (body.match(/s \+=/g) || []).length;
      expect(soCong).toBe(EDGE_REGIONS[e].length);
    }
  });

  it('mọi uniform ĐỌC trong mã đều đã được KHAI', () => {
    // Đọc một uniform chưa khai là lỗi biên dịch trên máy, và cũng im lặng như
    // lệch đối số.
    const khai = new Set(
      [...FRAG_MA.matchAll(/uniform\s+\w+\s+(u\w+)\s*;/g)].map((m) => m[1]),
    );
    const dung = new Set([...FRAG_MA.matchAll(/\b(u[A-Z]\w*)\b/g)].map((m) => m[1]));
    for (const u of dung) expect(khai.has(u)).toBe(true);
    // Và phải có đủ những cái component thật sự đẩy xuống.
    for (const u of ['uRes', 'uTime', 'uLevel', 'uAlpha', 'uW', 'uSpan', 'uRibbon',
      'uColor', 'uRibbonColor', 'uWaveCy', 'uWaveH', 'uWaveOn']) {
      expect(khai.has(u)).toBe(true);
    }
  });

  it('mọi uniform ĐÃ KHAI đều được component đẩy xuống', () => {
    // Chiều ngược lại: khai một uniform rồi không bao giờ gán là một hằng bằng 0
    // đứng giữa công thức — hiệu ứng sai mà không có gì báo.
    const gl = require('fs').readFileSync(
      require('path').join(__dirname, 'EdgeWaveGL.tsx'), 'utf8',
    );
    const khai = [...FRAG_MA.matchAll(/uniform\s+\w+\s+(u\w+)\s*;/g)].map((m) => m[1]);
    for (const u of khai) {
      expect(gl).toContain(`getUniformLocation(prog, '${u}')`);
    }
  });

  it('không còn dấu nội suy `${…}` sót lại trong chuỗi đã dựng', () => {
    // Sót một dấu nội suy nghĩa là có chỗ quên chạy, và GLSL sẽ nghẹn ở đó.
    expect(FRAG).not.toMatch(/\$\{/);
    // Soi phần MÃ: chú thích trong shader có nhắc chữ "NaN" đúng chỗ giải thích
    // vì sao phải kẹp bề rộng.
    expect(FRAG_MA).not.toContain('undefined');
    expect(FRAG_MA).not.toContain('NaN');
  });

  it('hằng sinh từ edgeWaveMath, không phải số gõ tay', () => {
    // Tần số của từng vùng và tham số từng dải phải xuất hiện nguyên văn trong
    // chuỗi đã dựng — gõ lại số sang GLSL là cách chắc nhất để một ngày hai bản
    // vẽ nhấp nhô khác nhau mà không có gì đỏ báo.
    for (const e of EDGE_NAMES) {
      for (const r of EDGE_REGIONS[e]) expect(FRAG).toContain(r.freq.toFixed(4));
    }
    for (const r of RIBBONS) expect(FRAG).toContain(r.base.toFixed(4));
  });

  it('cụm sóng giữa màn: mọi lời gọi khớp lời khai, đủ ba dải', () => {
    const khai = soThamSo(FRAG_MA, 'centerWave');
    const goi = loiGoi(FRAG_MA, 'centerWave');
    expect(goi).toHaveLength(CENTER_WAVES.length);
    for (const g of goi) expect(g.length).toBe(khai);
  });

  it('cụm sóng có CHẶN SỚM theo chiều dọc', () => {
    // Cụm sóng chỉ chiếm một dải ngang, còn đây là một lượt vẽ PHỦ CẢ MÀN. Không
    // chặn thì mỗi điểm ảnh ở góc màn cũng phải tính ba dải sóng — đắt nhất trong
    // cả shader, cho một kết quả luôn bằng 0.
    // Chịu được XUỐNG DÒNG: điều kiện dài ra khi thêm nhánh cuộn, và một phép
    // tìm bám vào "cùng một dòng" sẽ đỏ vì định dạng chứ không vì hành vi.
    expect(FRAG_MA).toMatch(/if \(uWaveOn > [\d.]+\s*&&\s*abs\(y - uWaveCy\)/);
  });

  it('dải chỉ vẽ ở hai cạnh DỌC', () => {
    const goi = loiGoi(FRAG_MA, 'ribbonAt');
    const trai = goi.filter((g) => g[0] === 'xnL').length;
    const phai = goi.filter((g) => g[0] === 'xnR').length;
    expect(trai).toBe(RIBBONS.length);
    expect(phai).toBe(RIBBONS.length);
  });

  it('CẠNH PHẢI lệch pha ở THAM SỐ PHA, không cộng vào toạ độ dọc', () => {
    // Cộng vào `yn` thì `clamp` đẩy `fade` về 0 và cạnh phải tắt hẳn — lỗi đã
    // thấy trên máy: "bên phải không có dải nào".
    for (const g of loiGoi(FRAG_MA, 'ribbonAt')) {
      expect(g[1]).toBe('yn'); // toạ độ dọc truyền NGUYÊN
      expect(g[2]).toMatch(/^[\d.]+$/); // pha là một số
    }
    const phai = loiGoi(FRAG_MA, 'ribbonAt').filter((g) => g[0] === 'xnR');
    for (const g of phai) expect(Number(g[2])).not.toBe(0);
  });
});

describe('cuộn tròn trong shader', () => {
  it('khai ĐỦ uniform và hằng số của phần cuộn', () => {
    // ⛔ Bài này có mặt vì một lần sửa shader ĐÃ TRƯỢT TRONG IM LẶNG: phép thay
    // chuỗi không khớp, không ai `assert`, `tsc` mù (cả khối chỉ là một chuỗi),
    // và bài kiểm arity vẫn xanh vì định nghĩa lẫn lời gọi đều còn nguyên bản cũ.
    // Kết quả: ba dải KHÔNG cuộn trên máy thật, mà mọi thứ vẫn báo xanh.
    expect(FRAG).toMatch(/uniform float uCoil;/);
    expect(FRAG).toMatch(/uniform float uCoilR;/);
    expect(FRAG).toMatch(/const float COIL_CALM = [\d.]+;/);
  });

  it('mỗi lời gọi centerWave mang ĐỦ bán kính và chiều xoay RIÊNG', () => {
    const calls = [...FRAG.matchAll(/cw \+= centerWave\(([^;]*)\);/g)].map((m) => m[1]);
    expect(calls).toHaveLength(CENTER_WAVES.length);
    const spins: number[] = [];
    for (const [i, a] of calls.entries()) {
      const args = a.split(',').map((x) => x.trim());
      // x, y + 10 tham số dải + coilR + spin + cycles + envK
      expect(args).toHaveLength(16);
      expect(args[12]).toBe(`uCoilR * ${COILS[i].radius.toFixed(4)}`);
      spins.push(Number(args[13]));
      // Số chu kỳ quanh vòng phải NGUYÊN — điều kiện để hai đầu sóng nối liền.
      expect(Number(args[14])).toBe(coilCycles(i));
      expect(Number.isInteger(Number(args[14]))).toBe(true);
    }
    // Ba vòng phải KHÁC tốc độ, và phải có cả hai chiều — cùng hết thì ba vòng
    // quay như một khối và mắt đọc thành một vòng dày.
    expect(new Set(spins.map(Math.abs)).size).toBe(3);
    expect(spins.some((x) => x > 0)).toBe(true);
    expect(spins.some((x) => x < 0)).toBe(true);
  });

  it('chặn sớm theo chiều dọc NỚI RA theo bán kính khi cuộn', () => {
    // Không nới thì vòng lớn nhất bị cắt cụt ở trên và dưới — và nó chỉ cắt đúng
    // lúc đang cuộn, tức là đúng lúc không ai đang nhìn mã.
    expect(FRAG).toMatch(/mix\(uWaveH \* 1\.6 \+ 48\.0, uCoilR \+ /);
  });

  it('dạng vòng BỎ kẹp (1 - u*u) — vòng tròn không có hai đầu', () => {
    const than = FRAG.slice(FRAG.indexOf('float centerWave('), FRAG.indexOf('void main()'));
    // Kẹp chỉ được xuất hiện ĐÚNG MỘT lần, ở nhánh thẳng.
    expect(than.match(/1\.0 - u\*u/g) || []).toHaveLength(1);
    expect(than).toMatch(/float envC = /);
  });

  it('nhánh vòng KHÔNG còn phép gấp `uc` — chính nó tạo ra mối nối', () => {
    // Gấp `u` về [-1,1) rồi tính sóng theo `u` là cách chắc chắn có một chỗ gãy
    // tại điểm gấp. Sóng phải đếm theo GÓC, với số chu kỳ nguyên.
    const than = FRAG.slice(FRAG.indexOf('float centerWave('), FRAG.indexOf('void main()'));
    expect(than).not.toMatch(/floor\(\(uc \+ 1\.0\)/);
    expect(than).toMatch(/sin\(cycles \* th/);
  });

  it('bao hình của vòng tính theo GÓC — tuần hoàn sẵn, không có chỗ nhảy', () => {
    // Bao hình theo `u` sẽ nhảy ở chỗ `u` gấp vòng: mối nối vẫn còn, chỉ chuyển
    // từ pha sóng sang độ sáng.
    const than = FRAG.slice(FRAG.indexOf('float centerWave('), FRAG.indexOf('void main()'));
    expect(than).toMatch(/envC = 0\.45 \+ 0\.55 \* exp\(-\(1\.0 - cos\(th - PI \* focus\)\)/);
  });
});
