import fs from 'fs';
import path from 'path';

/**
 * Đuôi tệp ảnh phải khớp BYTE bên trong tệp.
 *
 * Vì sao cần một bài canh riêng cho một thứ nghe như chuyện vặt: sai chỗ này
 * **không lộ ra ở bản debug**. Bản debug không nghiền ảnh, nên một tệp JPEG mang
 * tên `.png` đi qua trọn vẹn — dựng xanh, app chạy, ảnh hiện đúng. Bản PHÁT HÀNH
 * thì `aapt2` nghiền từng tệp `.png`, gặp byte JPEG và đỏ với đúng một câu
 * `file failed to compile`, không nói vì sao.
 *
 * Tức lỗi này chờ tới lượt dựng đắt nhất mới nổ, ở một bước không ai chạy hằng
 * ngày. Đã trúng thật: hai tấm băng Trang chủ vào kho dưới tên `.png` trong khi
 * chúng là JPEG, và chỉ lộ ra khi dựng bản ký để nộp cửa hàng.
 */

const GOC = path.resolve(__dirname, '../..');
const THU_MUC_QUET = ['assets', 'src'];
const BO_QUA = new Set(['node_modules', 'build', 'Pods', '.git', 'ios', 'android']);

/** Byte mở đầu → loại thật. Chỉ khai loại kho này thật sự có. */
function loaiThat(dau: Buffer): string | null {
  if (dau.length >= 8 && dau.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (dau.length >= 3 && dau[0] === 0xff && dau[1] === 0xd8 && dau[2] === 0xff) return 'jpg';
  if (dau.length >= 4 && dau.subarray(0, 4).toString('ascii') === 'GIF8') return 'gif';
  if (
    dau.length >= 12 &&
    dau.subarray(0, 4).toString('ascii') === 'RIFF' &&
    dau.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** `.jpeg` và `.jpg` là cùng một loại — đừng bắt đổi tên vì chuyện đó. */
function chuanHoaDuoi(duoi: string): string {
  return duoi === 'jpeg' ? 'jpg' : duoi;
}

function quet(thuMuc: string, ra: string[]): void {
  let muc: fs.Dirent[];
  try {
    muc = fs.readdirSync(thuMuc, { withFileTypes: true });
  } catch {
    return;
  }
  for (const m of muc) {
    if (BO_QUA.has(m.name)) continue;
    const duong = path.join(thuMuc, m.name);
    if (m.isDirectory()) {
      quet(duong, ra);
    } else if (/\.(png|jpe?g|gif|webp)$/i.test(m.name)) {
      ra.push(duong);
    }
  }
}

describe('đuôi tệp ảnh khớp byte bên trong', () => {
  const tepAnh: string[] = [];
  for (const tm of THU_MUC_QUET) quet(path.join(GOC, tm), tepAnh);

  /**
   * Phép quét ra RỖNG phải đỏ, không được xanh. Một bài canh không tìm thấy gì
   * để canh thì nó đang nói "tôi không đo được" bằng giọng của "đạt" — và ở đây
   * ca đó rất dễ xảy ra: chỉ cần một tên thư mục đổi là danh sách về 0.
   */
  it('phép quét có tìm thấy tệp để canh', () => {
    expect(tepAnh.length).toBeGreaterThan(0);
  });

  it('không tệp nào mang đuôi khác với loại thật của nó', () => {
    const lech: string[] = [];
    for (const tep of tepAnh) {
      const fd = fs.openSync(tep, 'r');
      const dau = Buffer.alloc(12);
      fs.readSync(fd, dau, 0, 12, 0);
      fs.closeSync(fd);

      const that = loaiThat(dau);
      // Không nhận ra loại nào ⟹ KHÔNG ĐO ĐƯỢC, và trạng thái đó phải kêu chứ
      // không được lặng lẽ tính là đạt.
      if (that === null) {
        lech.push(`${path.relative(GOC, tep)}: không nhận ra loại từ byte mở đầu`);
        continue;
      }
      const khai = chuanHoaDuoi(path.extname(tep).slice(1).toLowerCase());
      if (that !== khai) {
        lech.push(`${path.relative(GOC, tep)}: đuôi khai \`${khai}\`, byte là \`${that}\``);
      }
    }

    expect(
      lech.length === 0
        ? ''
        : `Các tệp sau mang đuôi không đúng loại thật:\n  ${lech.join('\n  ')}\n\n` +
          'Bản debug KHÔNG bắt được lỗi này — nó chỉ nổ ở bản phát hành, trong `aapt2`,\n' +
          'dưới câu `file failed to compile`. Đổi ĐUÔI cho khớp byte (và sửa mọi\n' +
          '`require` trỏ tới nó), đừng đổi byte cho khớp đuôi.',
    ).toBe('');
  });
});
