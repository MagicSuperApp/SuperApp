/**
 * Cổng nguồn cho MÀN BẢN ĐỒ VƯỜN.
 *
 * ⛔ Yêu cầu từ thực địa: *"tính năng xem Bản đồ nông trại trông khá đơn giản,
 *    thiếu chuyên nghiệp và thiếu thông tin — hãy sửa thành một màn riêng thay
 *    vì popup; trên bản đồ cũng cần hiển thị các điểm cây, nhấn vào xem được
 *    popup chi tiết của cây."*
 *
 * Ba vế của câu đó là ba thứ ĐẾM ĐƯỢC, và bài này giữ cho cả ba đừng tụt lại:
 * màn riêng (không phải lớp phủ), chấm cây trên nền bản đồ, và chạm chấm thì có
 * chi tiết cây.
 *
 * ── Bài này đo GÌ, và KHÔNG đo gì ──────────────────────────────────────────
 * Đo MÃ NGUỒN, cùng khuôn với bốn bài `.gate.test.ts` bên cạnh và vì cùng lý
 * do: dựng màn này trong jest kéo theo maplibre + native, tức là một việc khác
 * hẳn về giá.
 *
 * Nó KHÔNG đo bản đồ có tải được ô ảnh không, chấm cây có rơi đúng chỗ không,
 * hay popup có vừa màn hẹp không. Phép đo cuối cho ba câu đó là mở màn thật
 * trên máy thật, ngoài vườn thật.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Chuẩn hoá CRLF ngay tại cửa đọc: máy dựng chính là Windows đặt
// `core.autocrlf=true` (xem `.gitattributes`).
const doc = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const BAN_DO = doc(join(__dirname, 'FarmMapScreen.tsx'));
const CHI_TIET = doc(join(__dirname, 'FarmDetailScreen.tsx'));
const MANIFEST = doc(join(__dirname, '..', 'module.manifest.json'));
const REGISTRY = doc(join(__dirname, '..', '..', '..', 'navigation', 'registry.ts'));

/**
 * Chỉ giữ MÃ CHẠY: bỏ chú thích khối và chú thích dòng.
 *
 * Cần nó cho mọi phép so "KHÔNG được chứa". Chú thích giải thích một lỗi luôn
 * NHẮC TÊN lỗi đó, nên phép so trần bắt trúng chính lời giải thích rồi kết luận
 * là lỗi còn nguyên.
 *
 * ⚠ Phép lọc này KHÔNG hiểu chuỗi ký tự: một `'https://…'` trong mã bị cắt từ
 * dấu `//` trở đi. Chấp nhận được vì mọi phép so bên dưới dùng nó đều là "không
 * chứa" — cắt nhầm chỉ có thể làm bài XANH oan, không làm nó đỏ oan. Các ca
 * "phải chứa" thì đọc bản gốc.
 */
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const dem = (hay: string, needle: string): number => hay.split(needle).length - 1;

describe('bản đồ vườn là một MÀN, không phải lớp phủ', () => {
  it('route `FarmMap` được khai ở manifest VÀ có component ở registry', () => {
    // Hai chỗ này phải khớp nhau: `assertRouteParity` chỉ `console.warn` khi
    // lệch, mà cảnh báo trong log dev là thứ không ai đọc. Thiếu một trong hai
    // thì nút bấm ném "NAVIGATE ... was not handled by any navigator".
    expect(MANIFEST).toContain('"FarmMap"');
    expect(REGISTRY).toContain('FarmMap: FarmMapScreen');
  });

  it('màn chi tiết vườn ĐIỀU HƯỚNG tới màn bản đồ', () => {
    expect(CHI_TIET).toContain(`'FarmMap'`);
  });

  it('lớp phủ cũ đã gỡ hẳn khỏi màn chi tiết vườn', () => {
    // Cả bốn tên đều thuộc về lớp phủ cũ. Còn sót một cái là còn một nửa đường
    // cũ sống song song với đường mới — và hai đường cùng mở một thứ là chỗ lỗi
    // trốn được lâu nhất.
    const ma = boChuThich(CHI_TIET);
    for (const ten of ['coordMapVisible', 'coordMapOverlay', 'coordMapContainer', 'coordMarker']) {
      expect(ma).not.toContain(ten);
    }
  });

  it('màn bản đồ nhận `farm` và cây qua tham số/Redux, không tự gọi mạng', () => {
    // Màn này là màn ĐỌC. Nó mở từ màn chi tiết vườn, nơi cây vừa được đồng bộ
    // xong — gọi lại `syncTreesFromBackend` ở đây là một lượt mạng cho dữ liệu
    // đã nằm sẵn trong tay, trả bằng pin của người đang đứng ngoài nắng.
    expect(boChuThich(BAN_DO)).not.toContain('syncTreesFromBackend');
  });
});

describe('trên bản đồ có CHẤM CÂY', () => {
  it('cây vẽ bằng `CircleLayer`, không phải một `MarkerView` mỗi cây', () => {
    expect(BAN_DO).toContain('CircleLayer');
    // Đúng MỘT `MarkerView` được dựng trong cả tệp, và nó dành cho NHÃN TÊN của
    // cây đang chọn. Con số này là cả lý do kiến trúc: một vườn 500 cây mà mỗi
    // cây một MarkerView là 500 View của React Native phải đặt lại vị trí mỗi
    // khung hình khi người dùng kéo bản đồ.
    expect(dem(boChuThich(BAN_DO), '<MapLib.MarkerView')).toBe(1);
  });

  it('chú giải màu và chấm cây dùng CHUNG một hằng', () => {
    // Chú giải lệch màu với thứ nó chú giải là loại lỗi không ai thấy lúc soát
    // mã và ai cũng thấy ngoài nắng. Buộc cả hai đọc `NHOM_CAY` thì chúng không
    // lệch được nữa.
    expect(BAN_DO).toContain('circleColor: NHOM_CAY[nhom].mau');
    expect(BAN_DO).toContain('backgroundColor: NHOM_CAY[nhom].mau');
  });

  it('cây KHÔNG có toạ độ được đếm và nói ra, không bị nuốt', () => {
    // Bỏ im lặng thì người dùng đếm chấm trên bản đồ rồi kết luận vườn mình có
    // ngần ấy cây — một con số sai mà màn hình tự tạo ra.
    expect(BAN_DO).toContain('soCayThieuToaDo');
    expect(BAN_DO).toContain('chưa có toạ độ');
  });
});

describe('chạm chấm cây thì mở CHI TIẾT CÂY', () => {
  it('nguồn chấm cây có `onPress` và nó chọn cây theo `tree_id`', () => {
    expect(BAN_DO).toMatch(/properties\?\.tree_id/);
    expect(BAN_DO).toContain('setChonId(id)');
  });

  it('popup dẫn tiếp được sang màn chi tiết cây', () => {
    expect(BAN_DO).toContain(`navigation.navigate('TreeDetail'`);
  });

  it('popup nói CẢ số quả thật lẫn số ước tính, và ghi rõ cái nào là ước tính', () => {
    // Một con số không tự khai mình là ước tính là một con số sẽ bị mang đi
    // dùng như số đếm được — cùng luật với lưới Bento ở màn chi tiết vườn.
    expect(BAN_DO).toContain('Quả trên cây');
    expect(BAN_DO).toContain('Quả dự kiến');
    expect(BAN_DO).toContain('(ước tính)');
  });
});

describe('những chỗ đã từng hỏng ở các bản đồ khác trong kho', () => {
  it('cả hai nguồn ô ảnh khai `maxZoomLevel` — nếu không, z20 ra ô TRẮNG', () => {
    // Cả OSM lẫn Esri chỉ CÓ ảnh tới z19 (`mapTiles.ts`). Thiếu khai báo thì ở
    // z20 MapLibre đi xin ô không tồn tại — đúng cái "phóng to thì lỗi bản đồ"
    // đã gặp ngoài vườn.
    expect(dem(BAN_DO, 'maxZoomLevel={TILE_MAX_ZOOM}')).toBe(2);
  });

  it('ô bản đồ đường phố lấy từ hằng chung, không chép tay tên miền đã ngưng', () => {
    // Ba dòng subdomain `a|b|c.tile.openstreetmap.org` đã ngưng phân giải, và
    // kho từng có ba bản chép của cùng URL nên bản vá chỉ tới được một chỗ.
    expect(BAN_DO).toContain('OSM_STREET_TILES');
    expect(boChuThich(BAN_DO)).not.toMatch(/[abc]\.tile\.openstreetmap\.org/);
  });

  it('vẫn ghi nguồn OpenStreetMap — đó là nghĩa vụ giấy phép, không phải trang trí', () => {
    // `attributionEnabled={false}` chỉ tắt nút mặc định của thư viện; nó không
    // miễn nghĩa vụ ghi nguồn của ODbL.
    expect(BAN_DO).toContain('© OpenStreetMap');
  });
});
