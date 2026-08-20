import {
  AGRO_ITEMS, ddmmyyyy, decodeEntities, latestAndPrevious, parseAgroNumber,
  parseAgroTable, parseDate,
} from './agroPriceService';

/** Chép từ phản hồi THẬT của agro.gov.vn. */
const HTML = `
<table>
 <tr><th>Mặt hàng</th><th>Vùng</th><th>Ngày</th><th>Giá</th></tr>
 <tr><td>Sầu ri&#234;ng Ri6 đẹp</td><td>T&#226;y Nguy&#234;n</td><td>13-08-2026</td><td>53000</td></tr>
 <tr><td>Sầu ri&#234;ng Ri6 đẹp</td><td>Miền T&#226;y</td><td>13-08-2026</td><td>55000</td></tr>
 <tr><td>Sầu ri&#234;ng Ri6 đẹp</td><td>T&#226;y Nguy&#234;n</td><td>11-08-2026</td><td>50000</td></tr>
 <tr><td>&nbsp;</td><td></td></tr>
</table>`;

describe('decodeEntities — trang mã hoá chữ có dấu', () => {
  it('&#234; → ê', () => {
    expect(decodeEntities('Sầu ri&#234;ng')).toBe('Sầu riêng');
  });
  it('không có thực thể thì giữ nguyên', () => {
    expect(decodeEntities('Cà phê nhân')).toBe('Cà phê nhân');
  });
  it('chuỗi rỗng không nổ', () => {
    expect(decodeEntities(undefined as any)).toBe('');
  });
});

describe('parseDate', () => {
  it('đọc dd-mm-yyyy', () => {
    const d = new Date(parseDate('13-08-2026'));
    expect(d.getDate()).toBe(13);
    expect(d.getMonth()).toBe(7);
  });
  it('chuỗi lạ → 0, để dòng đó bị bỏ', () => {
    expect(parseDate('hôm qua')).toBe(0);
    expect(parseDate('')).toBe(0);
  });
});

describe('parseAgroTable — chỉ nhận dòng ĐỦ và ĐỌC ĐƯỢC', () => {
  it('đọc đúng ba dòng dữ liệu, bỏ tiêu đề và dòng trống', () => {
    const rows = parseAgroTable(HTML);
    expect(rows).toHaveLength(3);
    expect(rows[0].item).toBe('Sầu riêng Ri6 đẹp');
    expect(rows[0].priceVnd).toBe(53000);
  });

  it('giá có dấu phân cách vẫn đọc đúng', () => {
    const rows = parseAgroTable(
      '<tr><td>X</td><td>Y</td><td>01-08-2026</td><td>53.000</td></tr>',
    );
    expect(rows[0].priceVnd).toBe(53000);
  });

  it('dòng thiếu ô hoặc giá bằng 0 → bỏ, KHÔNG vẽ giá 0 lên màn', () => {
    expect(parseAgroTable('<tr><td>X</td><td>Y</td><td>01-08-2026</td><td>0</td></tr>')).toHaveLength(0);
    expect(parseAgroTable('<tr><td>X</td><td>Y</td></tr>')).toHaveLength(0);
  });

  it('HTML rỗng → mảng rỗng', () => {
    expect(parseAgroTable('')).toEqual([]);
  });
});

describe('latestAndPrevious — gộp vùng theo NGÀY rồi so hai ngày', () => {
  it('cùng một ngày nhiều vùng → lấy trung bình', () => {
    const { latest } = latestAndPrevious(parseAgroTable(HTML));
    // (53000 + 55000) / 2
    expect(latest!.priceVnd).toBe(54000);
  });

  it('ngày liền trước trong CHÍNH chuỗi, không phải "lần trước tôi đọc"', () => {
    const { prev } = latestAndPrevious(parseAgroTable(HTML));
    expect(prev!.priceVnd).toBe(50000);
  });

  it('chỉ có một ngày → không có gì để so', () => {
    const rows = parseAgroTable(
      '<tr><td>X</td><td>Y</td><td>01-08-2026</td><td>10000</td></tr>',
    );
    expect(latestAndPrevious(rows).prev).toBeNull();
  });

  it('rỗng → cả hai null', () => {
    expect(latestAndPrevious([])).toEqual({ latest: null, prev: null });
  });
});

describe('ddmmyyyy — đúng khuôn ô nhập của trang', () => {
  it('đệm số 0', () => {
    expect(ddmmyyyy(new Date(2026, 7, 3))).toBe('03-08-2026');
  });
});

describe('parseAgroNumber — dấu chấm là NHÓM NGHÌN hay THẬP PHÂN', () => {
  it('mọi nhóm đúng ba chữ số ⇒ phân nhóm nghìn', () => {
    expect(parseAgroNumber('138.000')).toBe(138000);
    expect(parseAgroNumber('1.234.567')).toBe(1234567);
    expect(parseAgroNumber('3.769')).toBe(3769);
  });

  it('đuôi một–hai chữ số ⇒ THẬP PHÂN — đây là lỗi bản trước', () => {
    // Giá Arabica ở New York, cent/pound. Bản trước vứt dấu chấm và ra 3451,
    // tức gấp mười lần, mà không có gì báo.
    expect(parseAgroNumber('345.1')).toBe(345.1);
    expect(parseAgroNumber('57,25')).toBe(57.25);
  });

  it('số trần không dấu vẫn đọc thẳng', () => {
    expect(parseAgroNumber('96800')).toBe(96800);
    expect(parseAgroNumber('0')).toBe(0);
  });

  it('bỏ khoảng trắng, kể cả khoảng trắng cứng của HTML', () => {
    expect(parseAgroNumber(' 53 000 ')).toBe(53000);
    expect(parseAgroNumber('53 000')).toBe(53000);
  });

  it('chuỗi không phải số ⇒ null, KHÔNG ra NaN rồi lọt xuống dưới', () => {
    expect(parseAgroNumber('chưa có')).toBeNull();
    expect(parseAgroNumber('')).toBeNull();
    expect(parseAgroNumber(null)).toBeNull();
    expect(parseAgroNumber('12,')).toBeNull();
  });

  it('nhận thẳng kiểu số', () => {
    expect(parseAgroNumber(345.1)).toBe(345.1);
    expect(parseAgroNumber(Number.NaN)).toBeNull();
  });
});

describe('parseAgroTable giữ được phần thập phân', () => {
  it('345.1 ở ô giá không bị nhân mười', () => {
    const rows = parseAgroTable(
      '<tr><td>C&#224; ph&#234; Arabica</td><td>New York</td><td>18-08-2026</td><td>345.1</td></tr>',
    );
    expect(rows[0].priceVnd).toBe(345.1);
  });
});

describe('AGRO_ITEMS — sáu mặt hàng CÒN SỐNG, đo ngày 19/08/2026', () => {
  it('có đủ sáu, không còn hai', () => {
    expect(AGRO_ITEMS.map(i => i.key)).toEqual([
      'durian', 'coffee', 'pepper', 'hog', 'robustaLondon', 'arabicaNy',
    ]);
  });

  it('hai mặt hàng sàn vào cụm THẾ GIỚI, còn lại là trong nước', () => {
    const global = AGRO_ITEMS.filter(i => i.scope === 'global').map(i => i.key);
    expect(global).toEqual(['robustaLondon', 'arabicaNy']);
  });

  it('nhãn "Heo hơi trại" GIỮ NGUYÊN dấu cách thừa của trang', () => {
    // Gõ lại cho sạch là gửi một giá trị không có trong ô chọn, và WebForms trả
    // 200 kèm bảng RỖNG — không có lỗi nào để lần ra.
    const hog = AGRO_ITEMS.find(i => i.key === 'hog')!;
    expect(hog.label).toBe('Heo hơi trại |Live hog ');
  });

  it('khoảng hợp lý của Robusta loại được con số hỏng đã đo ở nguồn', () => {
    const r = AGRO_ITEMS.find(i => i.key === 'robustaLondon')!;
    const [lo, hi] = r.sane;
    expect(3769).toBeGreaterThanOrEqual(lo);
    expect(3769).toBeLessThanOrEqual(hi);
    // 18-08-2026 nguồn ghi 36700 giữa hai phiên 3769 và 3810.
    expect(36700).toBeGreaterThan(hi);
  });

  it('chỉ Arabica có phần thập phân', () => {
    const withDecimals = AGRO_ITEMS.filter(i => i.decimals > 0).map(i => i.key);
    expect(withDecimals).toEqual(['arabicaNy']);
  });
});

describe('latestAndPrevious giữ thập phân khi gộp vùng', () => {
  it('trung bình hai vùng không bị làm tròn về số nguyên', () => {
    const rows = parseAgroTable(
      '<tr><td>X</td><td>A</td><td>01-08-2026</td><td>345.1</td></tr>'
      + '<tr><td>X</td><td>B</td><td>01-08-2026</td><td>345.2</td></tr>',
    );
    expect(latestAndPrevious(rows).latest!.priceVnd).toBeCloseTo(345.15, 2);
  });
});
