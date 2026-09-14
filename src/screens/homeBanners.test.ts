/**
 * Băng trượt Trang chủ — phép DỰNG, không phải cách vẽ.
 *
 * Khu này nay có ba nhánh, và cả ba đều hỏng-mà-không-kêu:
 *
 *   1. CHƯA CÓ TIN (chưa tải xong, hoặc mạng hỏng). Tấm Truy xuất phải rơi về
 *      chữ tĩnh của module. Nhánh này quyết định điều người dùng thấy trong
 *      giây đầu tiên mở app — tức là hầu hết những lần họ nhìn khu này.
 *   2. CÓ TIN NHƯNG KHÔNG CÓ ẢNH. Chuyện thường ở RSS. Thiếu đường lùi thì
 *      `<Image source={{uri: null}}>` cho ra một khoảng trống, và bố cục
 *      "ảnh → màu" mất hẳn chặng đầu.
 *   3. TIN DÀI. Tóm tắt RSS dài cả đoạn văn; không cắt thì nó tràn khỏi hai
 *      dòng và `numberOfLines` cắt giữa một chữ.
 *
 * Không bài nào ở đây dựng một thành phần React: thứ đang kiểm là CHỌN cái gì,
 * và chọn sai thì vẽ đúng cũng vô nghĩa.
 */

import { dungBang, ANH_BANG } from './homeBanners';
import type { NewsItem } from '../services/agriNewsService';
import { TRACE_THEME, CHAT_THEME, WORK_THEME } from '../theme';

const NOW = 1_700_000_000_000;

const tin = (p: Partial<NewsItem> = {}): NewsItem => ({
  id: 'n1',
  title: 'Giá sầu riêng tăng trở lại sau đợt mưa',
  link: 'https://danviet.vn/gia-sau-rieng-d1.html',
  summary: 'Thương lái vào vườn thu mua sớm hơn mọi năm.',
  imageUrl: 'https://t.ex-cdn.com/danviet.vn/480w/files/sau-rieng.jpg',
  publishedAt: NOW - 2 * 3600_000,
  source: 'Dân Việt · Nhà nông',
  ...p,
});

describe('ba tấm, ba module', () => {
  it('luôn đủ ba tấm, mỗi tấm mang TÊN module của nó', () => {
    for (const bang of [dungBang(null, NOW), dungBang(tin(), NOW)]) {
      expect(bang.map(b => b.module)).toEqual([
        TRACE_THEME.name,
        CHAT_THEME.name,
        WORK_THEME.name,
      ]);
    }
  });

  it('mỗi tấm một màu module riêng — băng không ra ba tấm cùng màu', () => {
    const mau = dungBang(tin(), NOW).map(b => b.color);
    expect(new Set(mau).size).toBe(3);
    expect(mau[0]).toBe(TRACE_THEME.primary);
  });

  it('tấm nào cũng có ảnh — không tấm nào rơi vào bố cục thiếu chặng đầu', () => {
    for (const b of dungBang(null, NOW)) expect(b.image).toBeTruthy();
  });

  /**
   * ẢNH CHỤP hay HÌNH VẼ. Khai sai chiều nào cũng hỏng, và hỏng khác nhau:
   * gọi hình vẽ VUÔNG là ảnh chụp thì nó bị phóng gấp đôi rồi cắt mất nửa chiều
   * cao (đúng lỗi "ảnh zoom quá mức" báo về 14/09); gọi ảnh chụp là hình vẽ thì
   * nó co lại giữa khung và để hở hai mảng màu hai bên.
   */
  it('mỗi tấm khai đúng loại ảnh của nó', () => {
    const kieu = dungBang(null, NOW).map(b => b.kieu);
    // Truy xuất: ảnh chụp ở CẢ HAI nhánh — ảnh bài báo, và tấm nền vườn.
    expect(kieu[0]).toBe('anh');
    expect(dungBang(tin(), NOW)[0].kieu).toBe('anh');
    // Hai tấm còn lại còn đang mượn hình minh hoạ vuông của module.
    expect(kieu.slice(1)).toEqual(['hinh', 'hinh']);
  });

  /**
   * Hai tấm dưới KHÔNG đổi theo tin. Nghe hiển nhiên, nhưng nó là thứ dễ vỡ
   * nhất khi ai đó thêm nguồn động thứ hai: một `map` chung trên cả ba tấm là
   * chữ của Trò chuyện đột nhiên nói về giá sầu riêng.
   */
  it('tin về KHÔNG đụng tới tấm Trò chuyện và Việc làm', () => {
    const khong = dungBang(null, NOW);
    const co = dungBang(tin(), NOW);
    expect(co.slice(1)).toEqual(khong.slice(1));
  });
});

describe('tấm Truy xuất — khi CÓ tin', () => {
  it('lấy tiêu đề và ảnh của tin', () => {
    const [a] = dungBang(tin(), NOW);
    expect(a.title).toBe('Giá sầu riêng tăng trở lại sau đợt mưa');
    expect(a.image).toEqual({ uri: 'https://t.ex-cdn.com/danviet.vn/480w/files/sau-rieng.jpg' });
  });

  /**
   * CHỈ TIÊU ĐỀ — đổi ngày 14/09.
   *
   * Trước đó tấm này xếp bốn tầng chữ vào một cột rộng 129 px: nhãn module,
   * tiêu đề, hai dòng tóm tắt, rồi dòng nguồn + tuổi. Tóm tắt RSS là câu mở đầu
   * của bài, nên nó nói lại ý của tiêu đề bằng chữ nhỏ hơn — trả ba dòng để
   * nhắc lại điều vừa nói, và ép tiêu đề xuống cỡ chữ của một dòng phụ.
   */
  it('KHÔNG mang tóm tắt — nó chỉ nói lại ý của tiêu đề', () => {
    expect(dungBang(tin(), NOW)[0].sub).toBe('');
  });

  /**
   * TÊN BÁO ở dòng cuối. Đây là thứ phân biệt một tấm băng TIN với một tấm băng
   * quảng cáo: chữ trên tấm ấy không phải lời của app, và người đọc có quyền
   * biết ai viết nó trước khi bấm vào.
   */
  it('mang TÊN BÁO ở dòng cuối', () => {
    expect(dungBang(tin(), NOW)[0].meta).toBe('Dân Việt · Nhà nông');
  });

  it('hai tấm kia không có dòng cuối — chữ của chúng là lời của app', () => {
    const [, chat, work] = dungBang(tin(), NOW);
    expect(chat.meta).toBeUndefined();
    expect(work.meta).toBeUndefined();
  });

  it('tin KHÔNG có ảnh → dùng ảnh nền của module', () => {
    const [a] = dungBang(tin({ imageUrl: null }), NOW);
    expect(a.image).toBe(ANH_BANG.trace);
  });

  it('bấm vào thì mở ĐÚNG bài báo', () => {
    const [a] = dungBang(tin(), NOW);
    expect(a.link).toBe('https://danviet.vn/gia-sau-rieng-d1.html');
  });
});

describe('tấm Truy xuất — khi CHƯA có tin', () => {
  /**
   * Nhánh này VẪN giữ dòng phụ, và đó không phải một chỗ sót: câu tĩnh của
   * module nói thêm một vế khác ("Định danh blockchain Cardano"), nó không lặp
   * lại tiêu đề như tóm tắt RSS.
   */
  it('rơi về chữ tĩnh của module, không phải một tấm trống hay "đang tải"', () => {
    const [a] = dungBang(null, NOW);
    expect(a.title).toBe('Truy xuất sầu riêng tới từng trái');
    expect(a.sub).toBe('Định danh blockchain Cardano');
    expect(a.meta).toBeUndefined();
  });

  it('không có bài để mở thì đưa về mục tin trong app', () => {
    const [a] = dungBang(null, NOW);
    expect(a.link).toBeUndefined();
    expect(a.route).toBe('TraceNews');
  });
});

