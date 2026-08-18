import {
  ddmmyyyy, decodeEntities, latestAndPrevious, parseAgroTable, parseDate,
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
